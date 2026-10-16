import { credentials } from '@grpc/grpc-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Fail closed: a gateway without its client identity must never use plaintext.
export function getGrpcCredentials() {
  const dir = process.env.TLS_CERT_DIR || resolve(__dirname, '../../../../infra/certs');
  const cert = (override: string | undefined, name: string) => readFileSync(override || resolve(dir, name));
  return credentials.createSsl(cert(process.env.TLS_CA_PATH, 'ca.crt'), cert(process.env.TLS_KEY_PATH, 'api-gateway.key'), cert(process.env.TLS_CERT_PATH, 'api-gateway.crt'));
}
