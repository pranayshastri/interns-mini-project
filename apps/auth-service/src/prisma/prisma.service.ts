/**
 * Prisma Database Client Service for Auth Service
 * 
 * ARCHITECTURE ROLE:
 * - Connects to PostgreSQL `auth_db`
 * - Manages lifecycle hooks (onModuleInit, onModuleDestroy)
 * 
 * TODO: [Intern Task - Prisma Service]
 * 1. Extend PrismaClient from '@prisma/client'.
 * 2. Implement OnModuleInit to call await this.$connect().
 * 3. Implement OnModuleDestroy to call await this.$disconnect().
 */
