import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AuthClient } from '../grpc/auth-client.service';
import { CommerceClient } from '../grpc/commerce-client.service';
import { badInput } from './commerce.types';

function readSessionToken(req: any): string {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((part: string) => part.trim())
    .find((part: string) => part.startsWith('shop_session='));

  const token = cookie?.slice('shop_session='.length) || '';

  if (!token) {
    throw new GraphQLError('Please sign in.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  return token;
}

@Resolver()
export class CatalogMutationResolver {
  constructor(
    private readonly grpc: CommerceClient,
    private readonly auth: AuthClient,
  ) {}

  @Mutation('createProduct')
  async createProduct(
    @Args('name') name: string,
    @Args('description') description: string,
    @Args('priceCents') priceCents: number,
    @Args('initialStock') initialStock: number,
    @Context() context: any,
  ) {
    const token = readSessionToken(context.req);
    const user = await this.auth.call('getProfile', { token });

    if (user.role !== 'SHOPKEEPER' || user.status !== 'ACTIVE') {
      throw new GraphQLError('Only active sellers can create products.', {
        extensions: { code: 'FORBIDDEN' },
      });
    }

    const shopId =
      typeof user.shop_id === 'string' ? user.shop_id.trim() : '';

    if (!shopId) {
      throw new GraphQLError('Your seller account has no shop assigned.', {
        extensions: { code: 'FORBIDDEN' },
      });
    }

    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 255 ||
      typeof description !== 'string' ||
      !description.trim() ||
      description.trim().length > 5000
    ) {
      throw badInput('Name and description are required and must be within the length limits.');
    }

    if (!Number.isInteger(priceCents) || priceCents < 0) {
      throw badInput('priceCents must be a non-negative integer.');
    }

    if (!Number.isInteger(initialStock) || initialStock < 0) {
      throw badInput('initialStock must be a non-negative integer.');
    }

    const product = await this.grpc.call('catalog', 'createProduct', {
      shop_id: shopId,
      name: name.trim(),
      description: description.trim(),
      price_cents: String(priceCents),
    });

    if (initialStock > 0) {
      await this.grpc.call('inventory', 'updateStock', {
        product_id: product.id,
        delta: initialStock,
      });
    }

    return {
      id: product.id,
      shopId: product.shop_id,
      name: product.name,
      description: product.description,
      priceCents: Number(product.price_cents),
    };
  }
}
