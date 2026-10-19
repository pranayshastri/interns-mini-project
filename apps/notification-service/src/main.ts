import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ServerCredentials } from '@grpc/grpc-js';
import { readFileSync } from 'fs';
import { PROTO_PATHS } from '@repo/proto';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const port = process.env.PORT || 50055;

  const certPath =
    process.env.TLS_CERT_PATH || './infra/certs/notification-service.crt';
  const keyPath =
    process.env.TLS_KEY_PATH || './infra/certs/notification-service.key';
  const caPath = process.env.TLS_CA_PATH || './infra/certs/ca.crt';

  // Refuse startup without the server identity; plaintext is never a fallback.
  const credentials = ServerCredentials.createSsl(
    readFileSync(caPath),
    [{ private_key: readFileSync(keyPath), cert_chain: readFileSync(certPath) }],
    true,
  );

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'shop.notification.v1',
        protoPath: PROTO_PATHS.notification,
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
    },
  );

  await app.listen();
  console.log(
    `Notification Service (gRPC + mTLS) listening on 0.0.0.0:${port}`,
  );
}

bootstrap().catch((err) => {
  console.error('Failed to start Notification Service', err);
  process.exit(1);
});
