/**
 * gRPC Controller for CatalogService
 * 
 * ARCHITECTURE ROLE:
 * - Implements protobuf service `shop.catalog.v1.CatalogService` (proto/catalog.proto)
 * 
 * TODO: [Intern Task - gRPC Controller Implementation]
 * 1. Annotate class with @Controller().
 * 2. Implement @GrpcMethod('CatalogService', 'CreateProduct'):
 *    - Receives { shop_id, name, description, price_cents, initial_stock }.
 *    - Calls catalogService.createProduct(...).
 *    - Returns ProductResponse.
 * 3. Implement @GrpcMethod('CatalogService', 'ListProducts'):
 *    - Receives { page, limit }.
 *    - Calls catalogService.listProducts(page, limit).
 *    - Returns ListProductsResponse: { products }.
 * 4. Implement @GrpcMethod('CatalogService', 'GetProduct'):
 *    - Receives { product_id }.
 *    - Calls catalogService.getProduct(product_id).
 *    - Returns ProductResponse.
 */
