
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { PrismaService } from '../prisma/prisma.service';

interface ClaimedOutboxEvent {
  id: string;
  aggregateId: string;
  topic: string;
  eventType: string;
  payload: Prisma.JsonValue;
}

@Injectable()
export class OutboxPollerWorker {
  private readonly logger = new Logger(OutboxPollerWorker.name);
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  @Interval(500)
  async pollOutbox(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      const events = await this.prisma.$transaction((tx) =>
        tx.$queryRaw<ClaimedOutboxEvent[]>`
          WITH selected AS (
            SELECT id
            FROM outbox_events
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT 20
            FOR UPDATE SKIP LOCKED
          )
          UPDATE outbox_events AS outbox
          SET status = 'PROCESSING'
          FROM selected
          WHERE outbox.id = selected.id
          RETURNING
            outbox.id,
            outbox.aggregate_id AS "aggregateId",
            outbox.topic,
            outbox.event_type AS "eventType",
            outbox.payload
        `,
      );

      for (const event of events) {
        try {
          await this.kafkaProducer.publishOrderEvent(
            event.topic,
            event.aggregateId,
            event.payload,
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

          try {
            await this.prisma.outboxEvent.updateMany({
              where: {
                id: event.id,
                status: 'PROCESSING',
              },
              data: {
                status: 'PENDING',
              },
            });
          } catch (retryError: unknown) {
            this.logger.error(
              `Failed to reset outbox event ${event.id} for retry`,
              retryError instanceof Error
                ? retryError.stack
                : String(retryError),
            );
          }
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
