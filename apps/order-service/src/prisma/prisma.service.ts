/**
 * Prisma Database Client Service for Order Service
 * 
 * ARCHITECTURE ROLE:
 * - Connects to PostgreSQL `order_db`
 * - Executes atomic multi-table transactions (orders + order_items + outbox_events)
 * 
 * TODO: [Intern Task - Prisma Service]
 * 1. Extend PrismaClient from '@prisma/client'.
 * 2. Connect onModuleInit() and disconnect onModuleDestroy().
 */
