import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { InventoryService } from './inventory/inventory.service';
import { InventoryController } from './inventory/inventory.controller';
import { OrderConsumerService } from './kafka/order-consumer.service';
import { OrderClient } from './grpc/order-client.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [InventoryController],
  providers: [PrismaService, InventoryService, OrderConsumerService, OrderClient],
})
export class AppModule {}
