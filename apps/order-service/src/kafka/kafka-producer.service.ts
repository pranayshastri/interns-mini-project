/**
 * Apache Kafka Producer Service (KRaft Mode)
 * 
 * ARCHITECTURE ROLE:
 * - Publishes reliable events to Kafka broker (KRaft mode, topic: shop.orders.v1)
 * - Used exclusively by the Outbox Poller Worker (never directly in the API handler)
 * 
 * TODO: [Intern Task - Kafka Producer]
 * 1. Initialize KafkaJS client pointing to process.env.KAFKA_BROKERS || 'localhost:9092'.
 * 2. Create producer instance: `this.kafka.producer()`.
 * 3. On onModuleInit(), call `await this.producer.connect()`.
 * 4. Implement `publishOrderEvent(topic: string, key: string, payload: any, headers?: Record<string, string>): Promise<void>`:
 *    - Send message with partition key (aggregateId / order_id) to maintain partition order.
 *    - Attach headers: event_id, event_type ('OrderCreated').
 * 5. On onModuleDestroy(), call `await this.producer.disconnect()`.
 */
