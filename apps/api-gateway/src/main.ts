
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = Number(
    process.env.PORT || process.env.API_GATEWAY_PORT || 4000,
  );

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid gateway port.');
  }

  const app = await NestFactory.create(AppModule, {
    abortOnError: false,
  });

  app.enableCors({
    origin: 'http://localhost:3000',
    credentials: true,
  });

  app.enableShutdownHooks();

  await app.listen(port, process.env.HOST || '0.0.0.0');
}

void bootstrap().catch(() => {
  console.error(
    'Gateway startup failed. Check configuration, certificates and port.',
  );
  process.exitCode = 1;
});
