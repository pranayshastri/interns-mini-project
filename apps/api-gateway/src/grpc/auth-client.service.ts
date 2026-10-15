import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { credentials, loadPackageDefinition, status } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROTO_PATHS } from '@repo/proto';
import { GraphQLError } from 'graphql';

@Injectable()
export class AuthClient implements OnModuleDestroy {
  private readonly client: any;
  constructor() {
    const dir = process.env.TLS_CERT_DIR || resolve(__dirname, '../../../../infra/certs');
    const cert = (override: string | undefined, name: string) => readFileSync(override || resolve(dir, name));
    const tls = credentials.createSsl(cert(process.env.TLS_CA_PATH, 'ca.crt'), cert(process.env.TLS_KEY_PATH, 'api-gateway.key'), cert(process.env.TLS_CERT_PATH, 'api-gateway.crt'));
    const proto = loadPackageDefinition(loadSync(PROTO_PATHS.auth, { keepCase: true, defaults: true })) as any;
    this.client = new proto.shop.auth.v1.AuthService(process.env.AUTH_SERVICE_ADDR || 'localhost:50051', tls);
  }
  onModuleDestroy() { this.client.close(); }
  call(method: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => this.client[method](data, { deadline: Date.now() + 10000 }, (error: any, result: any) => {
      if (!error) return resolve(result);
      const codes: Record<number, string> = { [status.INVALID_ARGUMENT]: 'BAD_USER_INPUT', [status.UNAUTHENTICATED]: 'UNAUTHENTICATED', [status.PERMISSION_DENIED]: 'FORBIDDEN', [status.ALREADY_EXISTS]: 'CONFLICT', [status.RESOURCE_EXHAUSTED]: 'RATE_LIMITED', [status.NOT_FOUND]: 'NOT_FOUND', [status.ABORTED]: 'CONFLICT', [status.FAILED_PRECONDITION]: 'CONFLICT' };
      const code = codes[error.code];
      reject(new GraphQLError(code ? error.details : 'Account service is temporarily unavailable.', { extensions: { code: code || 'SERVICE_UNAVAILABLE' } }));
    }));
  }
}
