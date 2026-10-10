/**
 * Background Outbox Poller Worker
 * 
 * ARCHITECTURE ROLE:
 * - Pillar 1: The Dual-Write Problem Solution (ARCHITECTURE.md Section 4.2 & 4.3)
 * - Safely and asynchronously polls pending outbox events from PostgreSQL `order_db`
 * - Publishes each event to Apache Kafka topic 'shop.orders.v1'
 * - Guarantees At-Least-Once Delivery even if Kafka temporarily goes down!
 * 
 * TODO: [Intern Task - Outbox Polling Routine]
 * 1. Annotate polling method with `@Interval(500)` from '@nestjs/schedule' (runs every 500ms).
 * 2. In each tick:
 *    - Execute a transaction with `SELECT ... FOR UPDATE SKIP LOCKED` on pending outbox events:
 *      ```sql
 *      WITH selected AS (
 *        SELECT id FROM outbox_events
 *        WHERE status = 'PENDING'
 *        ORDER BY created_at ASC
 *        LIMIT 20
 *        FOR UPDATE SKIP LOCKED
 *      )
 *      UPDATE outbox_events
 *      SET status = 'PROCESSING'
 *      FROM selected
 *      WHERE outbox_events.id = selected.id
 *      RETURNING outbox_events.id, aggregate_id, topic, event_type, payload;
 *      ```
 *    - For each selected event:
 *      - Call kafkaProducerService.publishOrderEvent(...) with topic, key = aggregate_id, payload, event_id header.
 *    - Once successfully published to Kafka:
 *      - Update outbox_events SET status = 'PUBLISHED', published_at = NOW() WHERE id IN (...).
 * 3. Handle Kafka outage resiliency:
 *    - If Kafka is unreachable, leave events as PROCESSING or revert to PENDING;
 *    - They will automatically retry on the next tick when Kafka recovers (Lab 2 demonstration).
 */
