#!/bin/bash
set -e

# Background topic provisioner for KRaft mode
(
  echo "Waiting for Kafka broker to become ready..."
  until /opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list > /dev/null 2>&1; do
    sleep 2
  done

  echo "Kafka is ready. Creating industry-standard partition topics..."
  /opt/bitnami/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
    --create --if-not-exists \
    --topic shop.orders.v1 \
    --partitions 3 \
    --replication-factor 1 \
    --config retention.ms=604800000

  echo "Topic shop.orders.v1 provisioned successfully with 3 partitions."
) &
