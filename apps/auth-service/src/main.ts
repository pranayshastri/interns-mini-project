/**
 * NestJS Auth Service - Main Entry Point
 * 
 * ARCHITECTURE ROLE:
 * - Internal gRPC Microservice running on Port 50051
 * - Secured using Mutual TLS (mTLS) with Root CA (ARCHITECTURE.md Section 5.3)
 * 
 * TODO: [Intern Task - gRPC Microservice Bootstrap with mTLS]
 * 1. Import NestFactory from '@nestjs/core' and AppModule from './app.module'.
 * 2. Configure microservice options using Transport.GRPC:
 *    - package: 'shop.auth.v1'
 *    - protoPath: path to auth.proto (from @repo/proto or ./proto/auth.proto)
 *    - url: `0.0.0.0:${process.env.PORT || 50051}`
 * 3. Configure mTLS on the gRPC Server:
 *    - Load server certificate (auth-service.crt) and key (auth-service.key)
 *    - Load Root CA (ca.crt)
 *    - Set clientAuth to RequireAndVerifyClientCert (enforces mutual TLS identity verification)
 *    - Connections lacking a certificate signed by Root CA will fail handshake with code 14!
 * 4. Call app.listen() and log startup message.
 */
