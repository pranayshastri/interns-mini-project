/**
 * Inventory Service - App Module
 * 
 * ARCHITECTURE ROLE:
 * - Provides PrismaService (connected to inventory_db)
 * - Provides OrderConsumerService (Idempotent Kafka Consumer on shop.orders.v1)
 * - Provides InventoryService and InventoryController
 * 
 * TODO: [Intern Task - Module Setup]
 * 1. Register PrismaService, OrderConsumerService, and InventoryService in providers.
 * 2. Register InventoryController in controllers.
 */
