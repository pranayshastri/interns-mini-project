import { Controller } from "@nestjs/common";
import { GrpcMethod } from "@nestjs/microservices";
import { OrderService } from "./order.service";

@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  private mapItems(
    items: {
      productId: string;
      shopId: string;
      quantity: number;
      unitPriceCents: bigint;
    }[],
  ) {
    return items.map((item) => ({
      product_id: item.productId,
      shop_id: item.shopId,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents.toString(),
    }));
  }

  @GrpcMethod("OrderService", "CreateOrder")
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
      items: this.mapItems(order.items),
      shipping_address: order.shippingAddress,
    };
  }

  @GrpcMethod("OrderService", "GetOrder")
  async getOrder(data: { order_id: string }) {
    const order = await this.orderService.getOrder(data.order_id);

    return {
      order_id: order.id,
      customer_id: order.customerId,
      status: order.status,
      total_amount_cents: order.totalAmountCents.toString(),
      created_at: BigInt(order.createdAt.getTime()).toString(),
      items: this.mapItems(order.items),
      shipping_address: order.shippingAddress,
    };
  }

  private mapOrder(order: any) {
    return {
      order_id: order.id,
      customer_id: order.customerId,
      status: order.status,
      total_amount_cents: order.totalAmountCents.toString(),
      created_at: BigInt(order.createdAt.getTime()).toString(),
      items: this.mapItems(order.items),
      shipping_address: order.shippingAddress,
    };
  }

  @GrpcMethod("OrderService", "ListOrders")
  async listOrders(data: { customer_id?: string; shop_id?: string }) {
    const orders = await this.orderService.listOrders(data);
    return { orders: orders.map((order) => this.mapOrder(order)) };
  }

  private mapInvoice(invoice: any) {
    return {
      invoice_id: invoice.id,
      order_id: invoice.orderId,
      status: invoice.status,
      total_cents: invoice.totalCents.toString(),
      buyer_id: invoice.buyerId,
      seller_id: invoice.sellerId,
      created_at: BigInt(invoice.createdAt.getTime()).toString(),
      paid_at: invoice.paidAt
        ? BigInt(invoice.paidAt.getTime()).toString()
        : "0",
      pdf_url: invoice.pdfUrl || "",
      items: this.mapItems(invoice.order.items),
      shipping_address: invoice.order.shippingAddress,
    };
  }

  @GrpcMethod("OrderService", "GetInvoice")
  async getInvoice(data: { invoice_id: string }) {
    return this.mapInvoice(await this.orderService.getInvoice(data.invoice_id));
  }

  @GrpcMethod("OrderService", "ListInvoices")
  async listInvoices(data: { buyer_id: string }) {
    const invoices = await this.orderService.listInvoices(data.buyer_id);
    return { invoices: invoices.map((invoice) => this.mapInvoice(invoice)) };
  }

  @GrpcMethod("OrderService", "ConfirmOrder")
  async confirmOrder(data: {
    order_id: string;
    success: boolean;
    insufficient_product_ids?: string[];
  }) {
    await this.orderService.confirmOrder(data.order_id, {
      success: data.success,
      insufficientProductIds: data.insufficient_product_ids || [],
    });

    return {
      order_id: data.order_id,
      status: data.success ? "CONFIRMED" : "CANCELLED",
    };
  }
}
