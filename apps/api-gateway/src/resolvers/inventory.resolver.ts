/**
 * GraphQL Inventory Resolver
 * 
 * ARCHITECTURE ROLE:
 * - Exposes real-time stock lookup for products
 * - Communicates with internal InventoryService over mTLS gRPC
 * 
 * TODO: [Intern Task - Inventory Resolver Implementation]
 * 1. Inject 'INVENTORY_PACKAGE' gRPC ClientGrpc.
 * 2. On onModuleInit(), obtain InventoryService stub: this.client.getService('InventoryService').
 * 3. Implement query `stock(productId)`:
 *    - Call inventoryGrpcService.getStock({ product_id: productId }) over mTLS.
 *    - Return integer availableStock.
 */
