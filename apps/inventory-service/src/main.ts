import {
  NestFactory,
} from '@nestjs/core';
import {
  MicroserviceOptions,
  Transport,
} from '@nestjs/microservices';
import {
  ServerCredentials,
} from '@grpc/grpc-js';
import {
  existsSync,
  readFileSync,
} from 'fs';
import {
  PROTO_PATHS,
} from '@repo/proto';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const port = process.env.PORT || 50054;

  const certPath =
    process.env.TLS_CERT_PATH || './infra/certs/inventory-service.crt';
  const keyPath =
    process.env.TLS_KEY_PATH || './infra/certs/inventory-service.key';
  const caPath =
    process.env.TLS_CA_PATH || './infra/certs/ca.crt';

  let credentials: ServerCredentials;

  if (
    existsSync(certPath) &&
    existsSync(keyPath) &&
    existsSync(caPath)
  ) {
    const caCert = readFileSync(caPath);
    const serverCert = readFileSync(certPath);
    const serverKey = readFileSync(keyPath);

    credentials = ServerCredentials.createSsl(
      caCert,
      [{ private_key: serverKey, cert_chain: serverCert }],
      true,
    );
    console.log(
      'mTLS enabled — Inventory Service requires and verifies client certificates',
    );
  } else {
    console.warn(
      'mTLS certificates not found — falling back to insecure gRPC (development only)',
    );
    credentials = ServerCredentials.createInsecure();
  }

  const app =
    await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
      transport: Transport.GRPC,
      options: {
        package: 'shop.inventory.v1',
        protoPath: PROTO_PATHS.inventory,
        url: `0.0.0.0:${port}`,
       credentials,
       loader: {
         keepCase: true,
         longs: String,
         enums: String,
         defaults: true,
         oneofs: true,
       },
       },
    });

  await app.listen();
  console.log(
    `Inventory Service (gRPC + mTLS) listening on 0.0.0.0:${port}`,
  );
}

bootstrap().catch((err) => {
  console.error('Failed to start Inventory Service', err);
  process.exit(1);
});
