import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "../../generated/prisma";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS order_confirmation_outbox (
        order_id UUID PRIMARY KEY,
        event_id UUID NOT NULL,
        success BOOLEAN NOT NULL,
        insufficient_product_ids TEXT[] NOT NULL DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_error TEXT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP WITH TIME ZONE NULL
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS order_confirmation_outbox_pending_idx
      ON order_confirmation_outbox(status, next_attempt_at, created_at)
    `);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
