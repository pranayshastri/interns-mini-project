import { Injectable } from "@nestjs/common";
import { RpcException } from "@nestjs/microservices";
import { Prisma } from "../../generated/prisma";
import { PrismaService } from "../prisma/prisma.service";

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
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(input: CreateOrderInput) {
    const { customer_id, items, shipping_address } = input;

    if (
      !isValidUuid(customer_id) ||
      !shipping_address?.trim() ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      throw new RpcException({
        code: 3,
        message:
          "Customer, shipping address, and at least one item are required",
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
          message: "Invalid item price",
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
          message: "Invalid order item",
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
      (total, item) => total + BigInt(item.quantity) * item.unitPriceCents,
      0n,
    );

    // Step 1: Create the order in PENDING status
    const createdOrder = await this.prisma.$transaction(async (tx) => {
      const co = await tx.order.create({
        data: {
          customerId: customer_id,
          totalAmountCents,
          status: "PENDING",
          shippingAddress: shipping_address,
          items: {
            create: normalizedItems,
          },
        },
        include: { items: true },
      });

      // Step 2: Reserve inventory for each item
      for (const item of normalizedItems) {
        // Call inventory service via gRPC
        // We'll handle the result after the transaction commits
        // For now, we track that inventory reservation is needed
        await tx.inventoryReservation.create({
          data: {
            productId: item.productId,
            shopId: item.shopId,
            quantity: item.quantity,
            orderId: co.id,
            status: "PENDING",
          },
        });
      }

      // Publish OrderCreated event to outbox
      await tx.outboxEvent.create({
        data: {
          aggregateType: "ORDER",
          aggregateId: co.id,
          eventType: "OrderCreated",
          topic: "shop.orders.v1",
          status: "PENDING",
          payload: {
            orderId: co.id,
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

      return co;
    });

    return createdOrder;
  }

  async getOrder(orderId: string) {
    if (!isValidUuid(orderId)) {
      throw new RpcException({
        code: 3,
        message: "A valid order UUID is required",
      });
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new RpcException({
        code: 5,
        message: "Order not found",
      });
    }

    return order;
  }

  async listOrders(scope: { customer_id?: string; shop_id?: string }) {
    if (!scope.customer_id && !scope.shop_id) {
      throw new RpcException({
        code: 3,
        message: "An order scope is required",
      });
    }

    return this.prisma.order.findMany({
      where: scope.customer_id
        ? { customerId: scope.customer_id }
        : { items: { some: { shopId: scope.shop_id } } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getInvoice(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { order: { include: { items: true } } },
    });
    if (!invoice) {
      throw new RpcException({ code: 5, message: "Invoice not found" });
    }
    return invoice;
  }

  async listInvoices(buyerId: string) {
    return this.prisma.invoice.findMany({
      where: { buyerId },
      include: { order: { include: { items: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Update order status after inventory reservation completes.
   * Called by the outbox poller or a dedicated watcher.
   */
  async confirmOrder(
    orderId: string,
    inventoryResult: {
      success: boolean;
      insufficientProductIds: string[];
    },
  ): Promise<void> {
    if (!isValidUuid(orderId)) {
      throw new RpcException({
        code: 3,
        message: "A valid order UUID is required",
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        throw new RpcException({
          code: 5,
          message: "Order not found",
        });
      }

      // Kafka delivery is at-least-once, so retries after a completed
      // transition must not create another invoice or change the status.
      if (order.status !== "PENDING") {
        return;
      }

      if (inventoryResult.success) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: "CONFIRMED" },
        });

        await tx.inventoryReservation.updateMany({
          where: {
            orderId,
            status: "PENDING",
          },
          data: { status: "CONFIRMED" },
        });

        const sellerId = order.items[0]?.shopId;
        if (!sellerId) {
          throw new RpcException({
            code: 13,
            message: "Order has no seller",
          });
        }

        await tx.invoice.create({
          data: {
            orderId,
            status: "CONFIRMED",
            totalCents: order.totalAmountCents,
            buyerId: order.customerId,
            sellerId,
            metadata: {
              items: order.items.map((item) => ({
                productId: item.productId,
                shopId: item.shopId,
                quantity: item.quantity,
                unitPriceCents: item.unitPriceCents.toString(),
              })),
            } as Prisma.InputJsonValue,
          },
        });
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: { status: "CANCELLED" },
        });

        await tx.inventoryReservation.updateMany({
          where: {
            orderId,
            status: "PENDING",
          },
          data: { status: "FAILED" },
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: "ORDER",
            aggregateId: orderId,
            eventType: "OrderFailed",
            topic: "shop.orders.failure.v1",
            status: "PENDING",
            payload: {
              orderId,
              reason: "Insufficient inventory",
              insufficientProductIds: inventoryResult.insufficientProductIds,
            } as Prisma.InputJsonValue,
          },
        });
      }
    });
  }
}
