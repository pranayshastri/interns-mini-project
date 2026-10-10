/**
 * OrderService Business Logic & Transactional Outbox
 * 
 * ARCHITECTURE ROLE:
 * - Solves the Dual-Write Problem! (ARCHITECTURE.md Section 4.1 & 4.2)
 * - Writes BOTH the order AND the outbox event within the EXACT SAME PostgreSQL database transaction.
 * - NEVER calls Kafka directly inside this service! (Kafka is handled asynchronously by the Outbox Poller).
 * 
 * TODO: [Intern Task - Atomic Outbox Order Creation]
 * 1. Inject PrismaService.
 * 2. Implement `createOrder({ customer_id, items, shipping_address })`:
 *    - Calculate totalAmountCents from items.
 *    - Wrap DB writes in `this.prisma.$transaction(async (tx) => { ... })`:
 *      Step A: INSERT INTO orders (customer_id, total_amount_cents, status, shipping_address)
 *      Step B: INSERT INTO order_items (order_id, product_id, shop_id, quantity, unit_price_cents)
 *      Step C: INSERT INTO outbox_events:
 *              - aggregate_type: 'ORDER'
 *              - aggregate_id: order.id
 *              - event_type: 'OrderCreated'
 *              - topic: 'shop.orders.v1'
 *              - payload: { orderId: order.id, customerId: customer_id, items, totalAmountCents }
 *              - status: 'PENDING'
 *    - If transaction rolls back (e.g. invalid payload), NO outbox event is ever written (Lab 1 test)!
 *    - Return created order response.
 * 3. Implement `getOrder(orderId)`:
 *    - Query order and associated items from Prisma.
 *    - Return order data.
 */
