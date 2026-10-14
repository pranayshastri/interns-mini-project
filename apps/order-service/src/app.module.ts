import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KafkaProducerService } from './kafka/kafka-producer.service';
import { OrderController } from './order/order.controller';
import { OrderService } from './order/order.service';
import { OutboxPollerWorker } from './outbox/outbox-poller.worker';
import { PrismaService } from './prisma/prisma.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [OrderController],
  providers: [
    PrismaService,
    KafkaProducerService,
    OutboxPollerWorker,
    OrderService,
  ],
})
export class AppModule {}