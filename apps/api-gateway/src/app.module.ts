/**
 * NestJS API Gateway - Root Module
 * 
 * ARCHITECTURE ROLE:
 * - Aggregates GraphQL module with Apollo Driver
 * - Registers gRPC client microservice proxies for internal services (mTLS enabled)
 * - Registers Valkey service for session management & cache
 * - Registers resolvers (AuthResolver, CatalogResolver, OrderResolver, InventoryResolver)
 * 
 * TODO: [Intern Task - Root Module Setup]
 * 1. Configure GraphQLModule.forRoot<ApolloDriverConfig>({
 *      driver: ApolloDriver,
 *      autoSchemaFile: true (or schema.graphql path),
 *      playground: true,
 *      context: ({ req }) => ({ req }),
 *    })
 * 2. Configure ClientsModule.register([...]) for the 4 gRPC microservices:
 *    - AUTH_PACKAGE: package 'shop.auth.v1', proto 'auth.proto', url AUTH_SERVICE_ADDR (:50051), mTLS credentials
 *    - CATALOG_PACKAGE: package 'shop.catalog.v1', proto 'catalog.proto', url CATALOG_SERVICE_ADDR (:50052), mTLS credentials
 *    - ORDER_PACKAGE: package 'shop.order.v1', proto 'order.proto', url ORDER_SERVICE_ADDR (:50053), mTLS credentials
 *    - INVENTORY_PACKAGE: package 'shop.inventory.v1', proto 'inventory.proto', url INVENTORY_SERVICE_ADDR (:50054), mTLS credentials
 * 3. Provide ValkeyService and all GraphQL Resolvers.
 */
