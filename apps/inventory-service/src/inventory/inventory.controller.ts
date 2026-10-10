/**
 * gRPC Controller for InventoryService
 * 
 * ARCHITECTURE ROLE:
 * - Implements protobuf service `shop.inventory.v1.InventoryService` (proto/inventory.proto)
 * 
 * TODO: [Intern Task - gRPC Inventory Controller]
 * 1. Annotate class with @Controller().
 * 2. Implement @GrpcMethod('InventoryService', 'GetStock'):
 *    - Receives GetStockRequest: { product_id }.
 *    - Delegates to inventoryService.getStock(product_id).
 *    - Returns StockResponse: { product_id, available_stock }.
 * 3. Implement @GrpcMethod('InventoryService', 'UpdateStock'):
 *    - Receives UpdateStockRequest: { product_id, delta }.
 *    - Delegates to inventoryService.updateStock(product_id, delta).
 *    - Returns StockResponse: { product_id, available_stock }.
 */
