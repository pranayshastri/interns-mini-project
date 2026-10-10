/**
 * GraphQL Order Resolver
 * 
 * ARCHITECTURE ROLE:
 * - Exposes order placement and order lookup to customers
 * - Communicates with internal OrderService over mTLS gRPC
 * - Triggers the Transactional Outbox workflow on the order-service
 * 
 * TODO: [Intern Task - Order Resolver Implementation]
 * 1. Inject 'ORDER_PACKAGE' gRPC ClientGrpc.
 * 2. On onModuleInit(), obtain OrderService stub: this.client.getService('OrderService').
 * 3. Implement mutation `createOrder(items, shippingAddress)`:
 *    - Extract customerId from authenticated context (req.user or Bearer token claims).
 *    - Forward call to orderGrpcService.createOrder({ customer_id, items, shipping_address }) over mTLS.
 *    - Note: The order-service will write the order and outbox event in ONE atomic PostgreSQL transaction.
 *    - Return Order with status 'PENDING'.
 * 4. Implement query `order(id)`:
 *    - Call orderGrpcService.getOrder({ order_id: id }) over mTLS.
 *    - Return Order details.
 */
