/**
 * NestJS Catalog Service - Main Entry Point
 * 
 * ARCHITECTURE ROLE:
 * - Internal gRPC Microservice running on Port 50052
 * - Secured using Mutual TLS (mTLS) with Root CA (ARCHITECTURE.md Section 5.3)
 * 
 * TODO: [Intern Task - gRPC Microservice Bootstrap with mTLS]
 * 1. Import NestFactory from '@nestjs/core' and AppModule from './app.module'.
 * 2. Configure microservice options using Transport.GRPC:
 *    - package: 'shop.catalog.v1'
 *    - protoPath: path to catalog.proto (from @repo/proto or ./proto/catalog.proto)
 *    - url: `0.0.0.0:${process.env.PORT || 50052}`
 * 3. Configure mTLS on the gRPC Server:
 *    - Load server certificate (catalog-service.crt) and key (catalog-service.key)
 *    - Load Root CA (ca.crt)
 *    - Set clientAuth to RequireAndVerifyClientCert (enforces mutual TLS identity verification)
 * 4. Call app.listen() and log startup message.
 */
