import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ServerCredentials } from "@grpc/grpc-js";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { PROTO_PATHS } from "@repo/proto";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const port = Number(
    process.env.PORT ?? process.env.AUTH_SERVICE_PORT ?? 50051,
  );
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Auth port must be an integer between 1 and 65535.");
  }

  // Works from both src/ and dist/, including npm workspace commands.
  const certDir = process.env.TLS_CERT_DIR
    ? resolve(process.env.TLS_CERT_DIR)
    : resolve(__dirname, "../../../infra/certs");
  const ca = readFileSync(
    process.env.TLS_CA_PATH ?? resolve(certDir, "ca.crt"),
  );
  const cert = readFileSync(
    process.env.TLS_CERT_PATH ?? resolve(certDir, "auth-service.crt"),
  );
  const key = readFileSync(
    process.env.TLS_KEY_PATH ?? resolve(certDir, "auth-service.key"),
  );

  // true requires a client certificate verified against our CA. Never use plaintext.
  const credentials = ServerCredentials.createSsl(
    ca,
    [{ private_key: key, cert_chain: cert }],
    true,
  );
  const address = `${process.env.HOST ?? "0.0.0.0"}:${port}`;
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: "shop.auth.v1",
        protoPath: PROTO_PATHS.auth,
        loader: { keepCase: true },
        url: address,
        credentials,
      },
      abortOnError: false,
    },
  );

  app.enableShutdownHooks();
  try {
    await app.listen();
    Logger.log(
      `Secure Auth gRPC server listening on ${address} (mTLS required)`,
      "AuthBootstrap",
    );
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? error.message : String(error),
    undefined,
    "AuthBootstrap",
  );
  process.exitCode = 1;
});
