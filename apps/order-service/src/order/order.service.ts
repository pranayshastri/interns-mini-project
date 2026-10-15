import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface OrderItemInput {
  product_id: string;
  shop_id: string;
  quantity: number;
  unit_price_cents: number | string | bigint;
}

interface CreateOrderInput {
  customer_id: string;
  items: OrderItemInput[];
  shipping_address: string;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(input: CreateOrderInput) {
    const { customer_id, items, shipping_address } = input;

    if (
      !customer_id ||
      !isValidUuid(customer_id) ||
      !shipping_address?.trim() ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      throw new RpcException({
        code: 3,
        message:
          'Customer, shipping address, and at least one item are required',
      });
    }

    const normalizedItems = items.map((item) => {
      const quantity = Number(item.quantity);
      let unitPrice: bigint;

      try {
        unitPrice = BigInt(item.unit_price_cents);
      } catch {
        throw new RpcException({
          code: 3,
          message: 'Invalid item price',
        });
      }

      if (
        !isValidUuid(item.product_id) ||
        !isValidUuid(item.shop_id) ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        unitPrice < 0n
      ) {
        throw new RpcException({
          code: 3,
          message: 'Invalid order item',
        });
      }

      return {
        productId: item.product_id,
        shopId: item.shop_id,
        quantity,
        unitPriceCents: unitPrice,
      };
    });

    const totalAmountCents = normalizedItems.reduce(
      (total, item) =>
        total + BigInt(item.quantity) * item.unitPriceCents,
      0n,
    );

    return this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          customerId: customer_id,
          totalAmountCents,
          status: 'PENDING',
          shippingAddress: shipping_address,
          items: {
            create: normalizedItems,
          },
        },
        include: { items: true },
      });

      await tx.outboxEvent.create({
        data: {
          aggregateType: 'ORDER',
          aggregateId: createdOrder.id,
          eventType: 'OrderCreated',
          topic: 'shop.orders.v1',
          status: 'PENDING',
          payload: {
            orderId: createdOrder.id,
            customerId: customer_id,
            items: normalizedItems.map((item) => ({
              productId: item.productId,
              shopId: item.shopId,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents.toString(),
            })),
            totalAmountCents: totalAmountCents.toString(),
          } as Prisma.InputJsonValue,
        },
      });

      return createdOrder;
    });
  }

  async getOrder(orderId: string) {
    if (!isValidUuid(orderId)) {
      throw new RpcException({
        code: 3,
        message: 'A valid order UUID is required',
      });
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new RpcException({
        code: 5,
        message: 'Order not found',
      });
    }

    return order;
  }
}