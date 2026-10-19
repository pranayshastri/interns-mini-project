import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import {
  Kafka,
  logLevel,
  EachMessagePayload,
  Consumer,
} from 'kafkajs';
import { PrismaService } from '../prisma/prisma.service';

interface OrderItemPayload {
  product_id?: string;
  productId?: string;
  quantity: number;
}

interface OrderCreatedPayload {
  orderId: string;
  customerId: string;
  items: OrderItemPayload[];
  totalAmountCents: number;
}

@Injectable()
export class OrderConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OrderConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(private readonly prisma: PrismaService) {
    const brokers =
      (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    this.kafka = new Kafka({
      clientId: 'inventory-service',
      brokers,
      logLevel: logLevel.INFO,
      retry: {
        retries: 20,
        initialRetryTime: 1000,
        factor: 2,
        maxRetryTime: 60000,
      },
    });
    this.consumer = this.kafka.consumer({
      groupId: 'inventory-service-group',
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Waiting for Kafka broker to be ready...');
    const timeoutMs = parseInt(
      process.env.KAFKA_INIT_TIMEOUT_MS || '120000',
      10,
    );

    try {
      await this.waitForKafka(timeoutMs);
    } catch (err) {
      this.logger.warn(
        `Kafka broker not available (timeout ${timeoutMs}ms). Service will start without consumer. Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const admin = this.kafka.admin();
    await admin.connect();
    try {
      await admin.createTopics({
        topics: [
          {
            topic: 'shop.orders.v1',
            numPartitions: 3,
            replicationFactor: 1,
          },
        ],
      });
      this.logger.log('Kafka topic shop.orders.v1 ensured');
    } catch {
      this.logger.log('Kafka topic shop.orders.v1 already exists');
    }
    await admin.disconnect();

    this.logger.log('Connecting Kafka consumer to: shop.orders.v1');
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: 'shop.orders.v1',
      fromBeginning: false,
    });
    this.logger.log('Kafka consumer connected and subscribed to shop.orders.v1');

    let retries = 5;
    while (retries > 0) {
      try {
        await this.consumer.run({
          partitionsConsumedConcurrently: 1,
          eachMessage: async (payload: EachMessagePayload) => {
            await this.handleOrderCreated(payload);
          },
        });
        break;
      } catch (err) {
        retries--;
        this.logger.warn(
          `Consumer run failed (retries left: ${retries}): ${err instanceof Error ? err.message : String(err)}`,
        );
        if (retries === 0) throw err;
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    this.logger.log('Kafka consumer run loop started');
  }

  private async waitForKafka(timeoutMs: number): Promise<void> {
    const start = Date.now();
    const brokerList =
      (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const [host, portStr] = brokerList[0].split(':');
    const port = parseInt(portStr || '9092', 10);

    while (Date.now() - start < timeoutMs) {
      try {
        await this.checkBroker(host, port, 3000);
        this.logger.log('Kafka broker is ready');
        return;
      } catch (err) {
        this.logger.warn(
          `Kafka not ready yet (${Date.now() - start}ms elapsed): ${err instanceof Error ? err.message : String(err)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error(`Kafka broker not ready after ${timeoutMs}ms`);
  }

  private checkBroker(host: string, port: number, timeout: number): Promise<void> {
    const net = require('net');
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Connection to ${host}:${port} timed out`));
      }, timeout);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve();
      });
      socket.once('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
      socket.connect(port, host);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting Kafka consumer...');
    await this.consumer.disconnect();
  }

  private async handleOrderCreated({
    partition,
    message,
  }: EachMessagePayload): Promise<void> {
    const eventIdHeader = message.headers?.['event_id'];
    const eventId = Array.isArray(eventIdHeader)
      ? eventIdHeader[0]?.toString()
      : eventIdHeader?.toString();

    if (!eventId) {
      this.logger.warn(
        'Received message without event_id header — skipping',
      );
      return;
    }

    const eventIdShort = eventId.slice(0, 8);

    if (!message.value) {
      this.logger.warn(
        `Event ${eventIdShort} has no payload — skipping`,
      );
      return;
    }

    const payload: OrderCreatedPayload = JSON.parse(
      message.value.toString('utf-8'),
    );

    this.logger.log(
      `Processing OrderCreated event ${eventIdShort} (partition ${partition})`,
    );

    await this.prisma.$transaction(async (tx) => {
      const insertResult = await tx.$executeRaw`
        INSERT INTO inbox_events (event_id, event_type)
        VALUES (${eventId}::uuid, 'OrderCreated')
        ON CONFLICT (event_id) DO NOTHING
      `;

      const rowsAffected = Number(insertResult);

      if (rowsAffected === 0) {
        this.logger.warn(
          `Duplicate event ${eventIdShort} detected. Skipping stock deduction.`,
        );
        return;
      }

      for (const item of payload.items) {
        const productId = item.product_id ?? item.productId;
        const quantity = Number(item.quantity);

        if (!productId) {
          this.logger.warn(
            `Item in event ${eventIdShort} has no product_id — skipping item`,
          );
          continue;
        }

        const updateResult = await tx.$executeRaw`
          UPDATE product_inventory
          SET available_stock = available_stock - ${quantity}
          WHERE product_id = ${productId}::uuid AND available_stock >= ${quantity}
        `;

        const updated = Number(updateResult);
        if (updated === 0) {
          this.logger.warn(
            `Insufficient stock for product ${productId} (requested ${quantity}) in event ${eventIdShort}`,
          );
        }
      }
    });

    this.logger.log(
      `Event ${eventIdShort} processed successfully`,
    );
  }
}
