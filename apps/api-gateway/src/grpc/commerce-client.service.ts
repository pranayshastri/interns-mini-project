import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { loadPackageDefinition, status } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { PROTO_PATHS } from '@repo/proto';
import { GraphQLError } from 'graphql';
import { getGrpcCredentials } from './grpc-client.options';

type Service = 'catalog' | 'inventory';
@Injectable()
export class CommerceClient implements OnModuleDestroy {
  private readonly clients: Record<Service, any>;
  constructor() {
    const tls = getGrpcCredentials();
    const make = (name: Service, service: string, port: number) => {
      const proto = loadPackageDefinition(loadSync(PROTO_PATHS[name], { keepCase: true, longs: String, defaults: true })) as any;
      return new proto.shop[name].v1[service](process.env[`${name.toUpperCase()}_SERVICE_ADDR`] || `${name}-service:${port}`, tls);
    };
    this.clients = { catalog: make('catalog', 'CatalogService', 50052), inventory: make('inventory', 'InventoryService', 50054) };
  }
  onModuleDestroy() { Object.values(this.clients).forEach(client => client.close()); }
  call(service: Service, method: string, data: object): Promise<any> {
    return new Promise((resolve, reject) => this.clients[service][method](data, { deadline: Date.now() + 5000 }, (error: any, result: any) => {
      if (!error) return resolve(result);
      const codes: Record<number, string> = { [status.INVALID_ARGUMENT]: 'BAD_USER_INPUT', [status.NOT_FOUND]: 'NOT_FOUND', [status.PERMISSION_DENIED]: 'FORBIDDEN', [status.UNAUTHENTICATED]: 'UNAUTHENTICATED', [status.FAILED_PRECONDITION]: 'CONFLICT' };
      const code = codes[error.code];
      reject(new GraphQLError(code ? error.details : `${service} service is temporarily unavailable.`, { extensions: { code: code || 'SERVICE_UNAVAILABLE' } }));
    }));
  }
}
