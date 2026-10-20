
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AuthClient } from '../grpc/auth-client.service';
import { OrderClient } from '../grpc/order-client.service';
import { CommerceClient } from '../grpc/commerce-client.service';
import { badInput, uuid } from './commerce.types';

export const orderTypeDefs = `
  type OrderLineItem {
    productId: ID!
    shopId: ID!
    quantity: Int!
    unitPriceCents: Int!
  }

  type Order {
    id: ID!
    customerId: ID!
    status: String!
    totalAmountCents: Int!
    createdAt: String!
    shippingAddress: String!
    paymentMethod: String!
    paymentStatus: String!
    items: [OrderLineItem!]!
  }

  input OrderItemInput {
    productId: ID!
    shopId: ID!
    quantity: Int!
    unitPriceCents: Int!
  }

  extend type Query {
    order(id: ID!): Order
    orders: [Order!]!
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
    shippingAddress: order.shipping_address || '',
    paymentMethod: order.payment_method || 'COD',
    paymentStatus: order.payment_status || 'PENDING',
    items: (order.items || []).map((item: any) => ({
      productId: item.product_id,
      shopId: item.shop_id,
      quantity: Number(item.quantity),
      unitPriceCents: Number(item.unit_price_cents),
    })),
  };
}

@Resolver()
export class OrderResolver {
  constructor(
    private readonly orderClient: OrderClient,
    private readonly authClient: AuthClient,
    private readonly commerce: CommerceClient,
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

    if (user.role !== 'CUSTOMER' || user.status !== 'ACTIVE') {
      throw new GraphQLError('Only customers can place orders.', {
        extensions: { code: 'FORBIDDEN' },
      });
    }

    if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
      throw new GraphQLError('An order must contain at least one item.', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    if (!shippingAddress?.trim() || shippingAddress.length > 500) {
      throw new GraphQLError('Shipping address is required.', {
        extensions: { code: 'BAD_USER_INPUT' },
      });
    }

    const seen = new Set<string>();

    for (const item of items) {
      uuid(item.productId);
      uuid(item.shopId);

      if (seen.has(item.productId)) {
        throw badInput('Each product may appear only once.');
      }

      seen.add(item.productId);

      if (
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

    // Re-validate product ownership, price, and stock with their services.
    const resolved = await Promise.all(
      items.map(async (item) => {
        const [product, inventory] = await Promise.all([
          this.commerce.call('catalog', 'getProduct', {
            product_id: item.productId,
          }),
          this.commerce.call('inventory', 'getStock', {
            product_id: item.productId,
          }),
        ]);

        if (
          product.shop_id !== item.shopId ||
          BigInt(product.price_cents) !== BigInt(item.unitPriceCents)
        ) {
          throw badInput(
            'Product price or shop changed. Refresh your cart.',
          );
        }

        if (inventory.available_stock < item.quantity) {
          throw badInput('Product stock changed. Refresh your cart.');
        }

        return {
          product_id: product.id,
          shop_id: product.shop_id,
          quantity: item.quantity,
          unit_price_cents: product.price_cents,
        };
      }),
    );

    const total = resolved.reduce(
      (sum, item) =>
        sum +
        BigInt(item.unit_price_cents) * BigInt(item.quantity),
      0n,
    );

    if (total > 2147483647n) {
      throw badInput(
        'Order total exceeds the supported checkout range.',
      );
    }

    const result = await this.orderClient.call('createOrder', {
      customer_id: user.id,
      items: resolved,
      shipping_address: shippingAddress.trim(),
      payment_method: 'COD',
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
      order_id: uuid(id),
    });

    // Prevent customers from viewing another customer's order.
    if (result.customer_id !== user.id && user.role !== 'ADMIN') {
      throw new GraphQLError('You cannot access this order.', {
        extensions: { code: 'FORBIDDEN' },
      });
    }

    return toGraphQLOrder(result);
  }

  @Query('orders')
  async listOrders(@Context() context: any) {
    const token = readSessionToken(context.req);
    const user = await this.authClient.call('getProfile', { token });

    if (user.role !== 'CUSTOMER' || user.status !== 'ACTIVE') {
      throw new GraphQLError(
        'Only active customers can view their orders.',
        {
          extensions: { code: 'FORBIDDEN' },
        },
      );
    }

    const result = await this.orderClient.call('listOrders', {
      customer_id: user.id,
    });

    return (result.orders || []).map((order: any) =>
      toGraphQLOrder(order),
    );
  }
}
