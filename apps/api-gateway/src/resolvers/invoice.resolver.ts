import { Args, Context, Mutation, Query, Resolver } from "@nestjs/graphql";
import { GraphQLError } from "graphql";
import { AuthClient } from "../grpc/auth-client.service";
import { OrderClient } from "../grpc/order-client.service";

export const invoiceTypeDefs = `
  type Invoice {
    id: ID!
    orderId: ID!
    status: String!
    totalCents: Int!
    currency: String!
    buyerId: ID!
    sellerId: ID!
    createdAt: String!
    paidAt: String
    pdfUrl: String
    items: [OrderItem!]!
    shippingAddress: String
  }

  extend type Query {
    invoice(id: ID!): Invoice
    myInvoices(status: String = "PENDING"): [Invoice!]!
  }

  extend type Mutation {
    payInvoice(id: ID!): Invoice
  }
`;

const cookieName = "shop_session";

function readSessionToken(req: any): string {
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((part: string) => part.trim())
    .find((part: string) => part.startsWith(`${cookieName}=`));

  const token = cookie?.slice(cookieName.length + 1) || "";

  if (!token) {
    throw new GraphQLError("Please sign in.", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }

  return token;
}

function toGraphQLInvoice(raw: any) {
  const createdAt = new Date(Number(raw.created_at));
  const paidAt =
    raw.paid_at && Number(raw.paid_at) > 0
      ? new Date(Number(raw.paid_at)).toISOString()
      : null;

  if (!Number.isFinite(createdAt.getTime())) {
    throw new GraphQLError("Invalid invoice timestamp returned by service.", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  return {
    id: raw.invoice_id,
    orderId: raw.order_id,
    status: raw.status,
    totalCents: Number(raw.total_cents),
    currency: "INR",
    buyerId: raw.buyer_id,
    sellerId: raw.seller_id,
    createdAt: createdAt.toISOString(),
    paidAt,
    pdfUrl: raw.pdf_url,
    items:
      raw.items?.map((item: any) => ({
        productId: item.product_id,
        shopId: item.shop_id,
        quantity: item.quantity,
        unitPriceCents: Number(item.unit_price_cents),
      })) || [],
    shippingAddress: raw.shipping_address || "",
  };
}

@Resolver("Invoice")
export class InvoiceResolver {
  constructor(
    private readonly orderClient: OrderClient,
    private readonly authClient: AuthClient,
  ) {}

  private async recipientScope(
    req: any,
  ): Promise<{ user_id: string; shop_id: string }> {
    const token = readSessionToken(req);
    const user = await this.authClient.call("getProfile", { token });
    return { user_id: user.id, shop_id: user.shop_id || "" };
  }

  @Query("invoice")
  async invoice(@Args("id") id: string, @Context() context: any) {
    const token = readSessionToken(context.req);
    const user = await this.authClient.call("getProfile", { token });
    const result = await this.orderClient.call("getInvoice", {
      invoice_id: id,
    });
    if (
      user.role !== "ADMIN" &&
      result.buyer_id !== user.id &&
      result.seller_id !== user.shop_id
    ) {
      throw new GraphQLError("You cannot access this invoice.", {
        extensions: { code: "FORBIDDEN" },
      });
    }
    return toGraphQLInvoice(result);
  }

  @Query("myInvoices")
  async myInvoices(@Args("status") status: string, @Context() context: any) {
    const { user_id } = await this.recipientScope(context.req);
    const result = await this.orderClient.call("listInvoices", {
      buyer_id: user_id,
    });
    return (result.invoices || [])
      .filter(
        (invoice: any) =>
          !status ||
          status === "ALL" ||
          invoice.status === status ||
          (status === "PENDING" && invoice.status === "CONFIRMED"),
      )
      .map(toGraphQLInvoice);
  }

  @Mutation("payInvoice")
  async payInvoice(@Args("id") id: string) {
    throw new GraphQLError("Invoice payment is not yet available.", {
      extensions: { code: "SERVICE_UNAVAILABLE" },
    });
  }
}
