import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { NotificationService } from './notification/notification.service';
import { NotificationController } from './notification/notification.controller';
import { OrderConsumerService } from './kafka/order-consumer.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [NotificationController],
  providers: [PrismaService, NotificationService, OrderConsumerService],
})
export class AppModule {}
