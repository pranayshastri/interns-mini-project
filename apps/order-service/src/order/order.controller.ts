
import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { OrderService } from './order.service';

@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  private toResponse(order: any) {
    return {
      order_id: order.id,
      customer_id: order.customerId,
      status: order.status,
      payment_method: order.paymentMethod,
      payment_status: order.paymentStatus,
      total_amount_cents: order.totalAmountCents.toString(),
      created_at: BigInt(order.createdAt.getTime()).toString(),
      shipping_address: order.shippingAddress,
      items: (order.items || []).map((item: any) => ({
        product_id: item.productId,
        shop_id: item.shopId,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents.toString(),
      })),
    };
  }

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
    payment_method?: string;
  }) {
    const order = await this.orderService.createOrder(data);
    return this.toResponse(order);
  }

  @GrpcMethod('OrderService', 'GetOrder')
  async getOrder(data: { order_id: string }) {
    const order = await this.orderService.getOrder(data.order_id);
    return this.toResponse(order);
  }

  @GrpcMethod('OrderService', 'ListOrders')
  async listOrders(data: { customer_id: string }) {
    const orders = await this.orderService.listOrders(data.customer_id);

    return {
      orders: orders.map((order) => this.toResponse(order)),
    };
  }
}
