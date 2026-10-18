
import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { ValkeyService } from './cache/valkey.service';
import { CatalogService } from './catalog/catalog.service';
import { CatalogController } from './catalog/catalog.controller';

@Module({
  controllers: [CatalogController],
  providers: [PrismaService, ValkeyService, CatalogService],
})
export class AppModule {}
