/**
 * NestJS Inventory Service - Main Entry Point
 * 
 * ARCHITECTURE ROLE:
 * - Internal gRPC Microservice running on Port 50054
 * - Secured using Mutual TLS (mTLS) with Root CA (ARCHITECTURE.md Section 5.3)
 * - Houses the Idempotent Kafka Consumer for 'shop.orders.v1'
 * 
 * TODO: [Intern Task - gRPC Microservice Bootstrap with mTLS]
 * 1. Import NestFactory from '@nestjs/core' and AppModule from './app.module'.
 * 2. Configure microservice options using Transport.GRPC:
 *    - package: 'shop.inventory.v1'
 *    - protoPath: path to inventory.proto (from @repo/proto or ./proto/inventory.proto)
 *    - url: `0.0.0.0:${process.env.PORT || 50054}`
 * 3. Configure mTLS on the gRPC Server:
 *    - Load server certificate (inventory-service.crt) and key (inventory-service.key)
 *    - Load Root CA (ca.crt)
 *    - Set clientAuth to RequireAndVerifyClientCert (enforces mutual TLS identity verification)
 * 4. Call app.listen() and log startup message.
 */
