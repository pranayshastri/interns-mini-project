import { Module } from '@nestjs/common';
import { CatalogService } from './catalog/catalog.service';
import { CatalogController } from './catalog/catalog.controller';
import { PrismaService } from './prisma/prisma.service';
@Module({ controllers: [CatalogController], providers: [CatalogService, PrismaService] })
export class AppModule {}
