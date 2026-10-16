import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AuthClient } from '../grpc/auth-client.service';
import { OrderClient } from '../grpc/order-client.service';

export const orderTypeDefs = `
  type Order {
    id: ID!
    customerId: ID!
    status: String!
    totalAmountCents: Int!
    createdAt: String!
  }

  input OrderItemInput {
    productId: ID!
    shopId: ID!
    quantity: Int!
    unitPriceCents: Int!
  }

  extend type Query {
    order(id: ID!): Order
  }

  extend type Mutation {
    createOrder(
      items: [OrderItemInput!]!
      shippingAddress: String!
    ): Order!
  }
`;

const cookieName = 'shop_session';

function readSessionToken(req: any): string {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((part: string) => part.trim())
    .find((part: string) => part.startsWith(`${cookieName}=`));

  const token = cookie?.slice(cookieName.length + 1) || '';

  if (!token) {
    throw new GraphQLError('Please sign in.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  return token;
}

function toGraphQLOrder(order: any) {
  const createdAt = new Date(Number(order.created_at));

  if (!Number.isFinite(createdAt.getTime())) {
    throw new GraphQLError('Invalid order timestamp returned by service.', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }

  const total = Number(order.total_amount_cents);

  if (!Number.isSafeInteger(total) || total < 0 || total > 2147483647) {
    throw new GraphQLError('Order total is outside the supported range.', {
      extensions: { code: 'INTERNAL_SERVER_ERROR' },
    });
  }

  return {
    id: order.order_id,
    customerId: order.customer_id,
    status: order.status,
    totalAmountCents: total,
    createdAt: createdAt.toISOString(),
  };
}

@Resolver()
export class OrderResolver {
  constructor(
    private readonly orderClient: OrderClient,
    private readonly authClient: AuthClient,
  ) {}

  @Mutation('createOrder')
  async createOrder(
    @Args('items') items: any[],
    @Args('shippingAddress') shippingAddress: string,
    @Context() context: any,
  ) {
    const token = readSessionToken(context.req);

    // Resolve the customer from the authenticated server-side session.
    const user = await this.authClient.call('getProfile', { token });

    if (user.role !== 'CUSTOMER') {
      throw new GraphQLError('Only customers can place orders.', {
        extensions: { code: 'FORBIDDEN' },
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new GraphQLError('An order must contain at least one item.', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    if (!shippingAddress?.trim()) {
      throw new GraphQLError('Shipping address is required.', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    for (const item of items) {
      if (
        !item.productId ||
        !item.shopId ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0 ||
        !Number.isInteger(item.unitPriceCents) ||
        item.unitPriceCents < 0
      ) {
        throw new GraphQLError('One or more order items are invalid.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
    }

    const result = await this.orderClient.call('createOrder', {
      customer_id: user.id,
      items: items.map((item) => ({
        product_id: item.productId,
        shop_id: item.shopId,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
      })),
      shipping_address: shippingAddress.trim(),
    });

    return toGraphQLOrder(result);
  }

  @Query('order')
  async getOrder(
    @Args('id') id: string,
    @Context() context: any,
  ) {
    const token = readSessionToken(context.req);
    const user = await this.authClient.call('getProfile', { token });

    const result = await this.orderClient.call('getOrder', {
      order_id: id,
    });

    // Prevent customers from viewing another customer's order.
    if (result.customer_id !== user.id && user.role !== 'ADMIN') {
      throw new GraphQLError('You cannot access this order.', {
        extensions: { code: 'FORBIDDEN' },
      });
    }

    return toGraphQLOrder(result);
  }
}