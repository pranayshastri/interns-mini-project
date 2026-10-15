import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { OrderService } from './order.service';

@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @GrpcMethod('OrderService', 'CreateOrder')
  async createOrder(data: {
    customer_id: string;
    items: {
      product_id: string;
      shop_id: string;
      quantity: number;
      unit_price_cents: string | number | bigint;
    }[];
    shipping_address: string;
  }) {
    const order = await this.orderService.createOrder(data);

    return {
      order_id: order.id,
      customer_id: order.customerId,
      status: order.status,
      total_amount_cents: order.totalAmountCents.toString(),
      created_at: BigInt(order.createdAt.getTime()).toString(),
    };
  }

  @GrpcMethod('OrderService', 'GetOrder')
  async getOrder(data: { order_id: string }) {
    const order = await this.orderService.getOrder(data.order_id);

    return {
      order_id: order.id,
      customer_id: order.customerId,
      status: order.status,
      total_amount_cents: order.totalAmountCents.toString(),
      created_at: BigInt(order.createdAt.getTime()).toString(),
    };
  }
}