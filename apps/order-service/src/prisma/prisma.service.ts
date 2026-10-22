import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS inventory_reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL,
        shop_id UUID NOT NULL,
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        quantity INT NOT NULL CHECK (quantity > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await this.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS inventory_reservations_order_status_idx
      ON inventory_reservations(order_id, status)
    `);
    await this.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        total_cents BIGINT NOT NULL,
        buyer_id UUID NOT NULL,
        seller_id UUID NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP WITH TIME ZONE NULL,
        pdf_url TEXT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    console.log('Order Service connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}