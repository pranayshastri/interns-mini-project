/**
 * mTLS gRPC Client Credentials Factory
 * 
 * ARCHITECTURE ROLE:
 * - Implements Zero-Trust Security Pillar (ARCHITECTURE.md Section 5)
 * - The API Gateway must initiate gRPC calls over Mutual TLS (mTLS)
 * 
 * TODO: [Intern Task - mTLS Credentials Configuration]
 * 1. Read TLS file paths from environment variables:
 *    - TLS_CA_PATH (ca.crt)
 *    - TLS_CERT_PATH (api-gateway.crt)
 *    - TLS_KEY_PATH (api-gateway.key)
 * 2. If certificates exist on filesystem (from ./infra/certs/):
 *    - Read ca.crt, api-gateway.crt, and api-gateway.key via fs.readFileSync()
 *    - Return grpc.credentials.createSsl(rootCert, clientKey, clientCert)
 * 3. If certificates do not exist (during early dev before ./scripts/generate-certs.sh runs):
 *    - Log a warning and fallback to grpc.credentials.createInsecure()
 * 4. Export helper getGrpcCredentials(serviceName: string): grpc.ChannelCredentials
 */
