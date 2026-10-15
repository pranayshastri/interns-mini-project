import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly kafka = new Kafka({
    clientId: 'order-service',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9094')
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean),
  });

  private readonly producer: Producer = this.kafka.producer();

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    console.log('Order Service connected to Kafka');
  }

  async publishOrderEvent(
    topic: string,
    key: string,
    payload: unknown,
    headers: Record<string, string> = {},
  ): Promise<void> {
    await this.producer.send({
      topic,
      messages: [
        {
          key,
          value: JSON.stringify(payload),
          headers: Object.fromEntries(
            Object.entries(headers).map(([name, value]) => [
              name,
              Buffer.from(value),
            ]),
          ),
        },
      ],
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }
}
