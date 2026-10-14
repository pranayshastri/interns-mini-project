import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxPollerWorker {
  private readonly logger = new Logger(OutboxPollerWorker.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async pollOutbox(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const events = await this.prisma.outboxEvent.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      for (const event of events) {
        try {
         await this.kafkaProducer.publishOrderEvent(
           event.topic,
           event.aggregateId,
           event.payload as Prisma.JsonObject,
           {
           event_id: event.id,
           event_type: event.eventType,
           },
          );

          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
            },
          });
        } catch (error: unknown) {
          this.logger.error(
            `Failed to publish outbox event ${event.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        'Failed to poll the order outbox',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }
}