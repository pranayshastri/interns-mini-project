import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ServerCredentials } from '@grpc/grpc-js';
import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import { PROTO_PATHS } from '@repo/proto';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const certPath = process.env.TLS_CERT_PATH
    ?? resolve(process.cwd(), 'infra/certs/catalog-service.crt');
  const keyPath = process.env.TLS_KEY_PATH
    ?? resolve(process.cwd(), 'infra/certs/catalog-service.key');
  const caPath = process.env.TLS_CA_PATH
    ?? resolve(process.cwd(), 'infra/certs/ca.crt');

  const ca = readFileSync(caPath);
  const cert = readFileSync(certPath);
  const key = readFileSync(keyPath);

  const credentials = ServerCredentials.createSsl(
    ca,
    [{ cert_chain: cert, private_key: key }],
    true,
  );

  const port =
    process.env.PORT ?? process.env.ORDER_SERVICE_PORT ?? '50052';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
         package: 'shop.catalog.v1',
        protoPath: PROTO_PATHS.catalog,
        url: `0.0.0.0:${port}`,
        credentials,
        loader: {
          keepCase: true,
          longs: String,
        },
      },
    },
  );

  await app.listen();

  console.log(`Catalog Service gRPC server listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start Catalog Service:', error);
  process.exitCode = 1;
});