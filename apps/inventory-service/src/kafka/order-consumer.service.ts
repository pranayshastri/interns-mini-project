import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from "@nestjs/common";
import { Kafka, logLevel, EachMessagePayload, Consumer } from "kafkajs";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { OrderClient } from "../grpc/order-client.service";
import { Prisma } from "../../generated/prisma";

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

function shortId(value: string): string {
  return value.slice(0, 8);
}

@Injectable()
export class OrderConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderConsumerService.name);
  private kafka: Kafka;
  private consumer: Consumer;
  private confirmationFlushRunning = false;
  private confirmationRetryTimer?: NodeJS.Timeout;
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly orderClient: OrderClient,
  ) {
    const brokers = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
    this.kafka = new Kafka({
      clientId: "inventory-service",
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
      groupId: "inventory-service-group",
    });
  }

  async onModuleInit(): Promise<void> {
    this.logger.log("Waiting for Kafka broker to be ready...");
    const timeoutMs = parseInt(
      process.env.KAFKA_INIT_TIMEOUT_MS || "120000",
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
            topic: "shop.orders.v1",
            numPartitions: 3,
            replicationFactor: 1,
          },
        ],
      });
      this.logger.log("Kafka topic shop.orders.v1 ensured");
    } catch {
      this.logger.log("Kafka topic shop.orders.v1 already exists");
    }
    await admin.disconnect();

    this.logger.log("Connecting Kafka consumer to: shop.orders.v1");
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: "shop.orders.v1",
      fromBeginning: false,
    });
    this.logger.log(
      "Kafka consumer connected and subscribed to shop.orders.v1",
    );

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
    this.logger.log("Kafka consumer run loop started");
    await this.flushConfirmations();
    this.confirmationRetryTimer = setInterval(
      () => void this.retryPendingConfirmations(),
      1000,
    );
  }

  private async waitForKafka(timeoutMs: number): Promise<void> {
    const start = Date.now();
    const brokerList = (process.env.KAFKA_BROKERS || "localhost:9092").split(
      ",",
    );

    while (Date.now() - start < timeoutMs) {
      for (const broker of brokerList) {
        const [host, portStr] = broker.split(":");
        const port = parseInt(portStr || "9092", 10);
        try {
          await new Promise<void>((resolve, reject) => {
            const net = require("net");
            const socket = new net.Socket();
            const timer = setTimeout(() => {
              socket.destroy();
              reject(new Error(`Connection to ${host}:${port} timed out`));
            }, 1000);
            socket.once("connect", () => {
              clearTimeout(timer);
              socket.destroy();
              resolve();
            });
            socket.once("error", (err: Error) => {
              clearTimeout(timer);
              reject(err);
            });
            socket.connect(port, host);
          });
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw new Error(`Kafka broker not ready after ${timeoutMs}ms`);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log("Disconnecting Kafka consumer...");
    if (this.confirmationRetryTimer) {
      clearInterval(this.confirmationRetryTimer);
    }
    await this.consumer.disconnect();
  }

  private async retryPendingConfirmations(): Promise<void> {
    await this.flushConfirmations();
  }

  private async flushConfirmations(): Promise<void> {
    if (this.confirmationFlushRunning) {
      return;
    }

    this.confirmationFlushRunning = true;
    try {
      const confirmations = await this.prisma.$queryRaw<
        {
          order_id: string;
          success: boolean;
          insufficient_product_ids: string[];
        }[]
      >`
        SELECT order_id, success, insufficient_product_ids
        FROM order_confirmation_outbox
        WHERE status = 'PENDING'
          AND next_attempt_at <= NOW()
        ORDER BY created_at ASC
        LIMIT 20
      `;

      for (const confirmation of confirmations) {
        try {
          await this.orderClient.confirmOrder(
            confirmation.order_id,
            confirmation.success,
            confirmation.insufficient_product_ids,
          );
          await this.prisma.$executeRaw`
            UPDATE order_confirmation_outbox
            SET status = 'SENT', sent_at = NOW(), last_error = NULL
            WHERE order_id = ${confirmation.order_id}::uuid
              AND status = 'PENDING'
          `;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to confirm order ${shortId(confirmation.order_id)}; retrying: ${message}`,
          );
          await this.prisma.$executeRaw`
            UPDATE order_confirmation_outbox
            SET attempts = attempts + 1,
                next_attempt_at = NOW() + INTERVAL '5 seconds',
                last_error = ${message}
            WHERE order_id = ${confirmation.order_id}::uuid
              AND status = 'PENDING'
          `;
        }
      }
    } catch (error) {
      this.logger.error(
        "Failed to flush pending order confirmations",
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.confirmationFlushRunning = false;
    }
  }

  private async handleOrderCreated({
    partition,
    message,
  }: EachMessagePayload): Promise<void> {
    const eventIdHeader = message.headers?.["event_id"];
    const eventId = Array.isArray(eventIdHeader)
      ? eventIdHeader[0]?.toString()
      : eventIdHeader?.toString();

    if (!eventId) {
      this.logger.warn("Received message without event_id header — skipping");
      return;
    }

    const eventIdShort = shortId(eventId);

    if (!message.value) {
      this.logger.warn(`Event ${eventIdShort} has no payload — skipping`);
      return;
    }

    const payload: OrderCreatedPayload = JSON.parse(
      message.value.toString("utf-8"),
    );

    this.logger.log(
      `Processing OrderCreated event ${eventIdShort} (partition ${partition})`,
    );

    // Deduplication and every item reservation share one transaction. If any
    // item fails, all earlier deductions roll back with the transaction.
    const insufficientProductIds: string[] = [];
    let reservationOk = true;

    try {
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
            this.logger.warn(`Item in event ${eventIdShort} has no product_id`);
            reservationOk = false;
            continue;
          }

          const reserveResult =
            await this.inventoryService.reserveStockInTransaction(
              tx,
              productId,
              quantity,
            );

          if (!reserveResult.success) {
            this.logger.warn(
              `Insufficient stock for product ${productId} (requested ${quantity}) in event ${eventIdShort}`,
            );
            insufficientProductIds.push(productId);
            reservationOk = false;
          } else {
            this.logger.log(
              `Reserved ${quantity} units of product ${productId} for order ${eventIdShort}. Available: ${reserveResult.availableStock}`,
            );
          }
        }

        if (!reservationOk) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        await tx.$executeRaw`
          INSERT INTO order_confirmation_outbox (
            order_id,
            event_id,
            success,
            insufficient_product_ids
          )
          VALUES (
            ${payload.orderId}::uuid,
            ${eventId}::uuid,
            true,
            '{}'::text[]
          )
          ON CONFLICT (order_id) DO UPDATE
          SET event_id = EXCLUDED.event_id,
              success = EXCLUDED.success,
              insufficient_product_ids = EXCLUDED.insufficient_product_ids,
              status = 'PENDING',
              next_attempt_at = NOW(),
              last_error = NULL
          WHERE order_confirmation_outbox.status = 'PENDING'
        `;
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "INSUFFICIENT_STOCK") {
        throw error;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO inbox_events (event_id, event_type)
          VALUES (${eventId}::uuid, 'OrderCreated')
          ON CONFLICT (event_id) DO NOTHING
        `;
        await tx.$executeRaw`
          INSERT INTO order_confirmation_outbox (
            order_id,
            event_id,
            success,
            insufficient_product_ids
          )
          VALUES (
            ${payload.orderId}::uuid,
            ${eventId}::uuid,
            false,
            ARRAY[${Prisma.join(insufficientProductIds)}]::text[]
          )
          ON CONFLICT (order_id) DO UPDATE
          SET event_id = EXCLUDED.event_id,
              success = EXCLUDED.success,
              insufficient_product_ids = EXCLUDED.insufficient_product_ids,
              status = 'PENDING',
              next_attempt_at = NOW(),
              last_error = NULL
          WHERE order_confirmation_outbox.status = 'PENDING'
        `;
      });
    }

    await this.flushConfirmations();

    this.logger.log(`Event ${eventIdShort} processed successfully`);
  }
}
