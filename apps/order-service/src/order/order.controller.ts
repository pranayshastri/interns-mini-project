/**
 * gRPC Controller for OrderService
 * 
 * ARCHITECTURE ROLE:
 * - Implements protobuf service `shop.order.v1.OrderService` (proto/order.proto)
 * 
 * TODO: [Intern Task - gRPC Order Controller]
 * 1. Annotate class with @Controller().
 * 2. Implement @GrpcMethod('OrderService', 'CreateOrder'):
 *    - Receives CreateOrderRequest: { customer_id, items, shipping_address }.
 *    - Delegates to orderService.createOrder(...).
 *    - Returns OrderResponse: { order_id, customer_id, status: 'PENDING', total_amount_cents, created_at }.
 * 3. Implement @GrpcMethod('OrderService', 'GetOrder'):
 *    - Receives GetOrderRequest: { order_id }.
 *    - Delegates to orderService.getOrder(order_id).
 *    - Returns OrderResponse.
 */
