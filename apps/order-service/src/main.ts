/**
 * NestJS Order Service - Main Entry Point
 * 
 * ARCHITECTURE ROLE:
 * - Internal gRPC Microservice running on Port 50053
 * - Secured using Mutual TLS (mTLS) with Root CA (ARCHITECTURE.md Section 5.3)
 * - Houses the Transactional Outbox Pattern and Outbox Poller Worker
 * 
 * TODO: [Intern Task - gRPC Microservice Bootstrap with mTLS]
 * 1. Import NestFactory from '@nestjs/core' and AppModule from './app.module'.
 * 2. Configure microservice options using Transport.GRPC:
 *    - package: 'shop.order.v1'
 *    - protoPath: path to order.proto (from @repo/proto or ./proto/order.proto)
 *    - url: `0.0.0.0:${process.env.PORT || 50053}`
 * 3. Configure mTLS on the gRPC Server:
 *    - Load server certificate (order-service.crt) and key (order-service.key)
 *    - Load Root CA (ca.crt)
 *    - Set clientAuth to RequireAndVerifyClientCert (enforces mutual TLS identity verification)
 * 4. Call app.listen() and log startup message.
 */
