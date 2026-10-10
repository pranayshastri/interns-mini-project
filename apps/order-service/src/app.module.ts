/**
 * Order Service - App Module
 * 
 * ARCHITECTURE ROLE:
 * - Provides PrismaService (connected to order_db)
 * - Configures ScheduleModule for Outbox Poller periodic execution
 * - Provides KafkaProducerService (connecting to Kafka in KRaft mode)
 * - Provides OutboxPollerWorker, OrderService, and OrderController
 * 
 * TODO: [Intern Task - Order Module Setup]
 * 1. Import ScheduleModule.forRoot() from '@nestjs/schedule'.
 * 2. Register PrismaService, KafkaProducerService, OutboxPollerWorker, OrderService in providers.
 * 3. Register OrderController in controllers.
 */
