import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
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

  @Query('myProducts')
  async myProducts(
    @Args('page') page: number = 1,
    @Args('limit') limit: number = 50,
    @Context() context: any,
  ) {
    const token = readSessionToken(context.req);
    const user = await this.auth.call('getProfile', { token });

    if (user.role !== 'SHOPKEEPER' || user.status !== 'ACTIVE') {
      throw new GraphQLError('Only active sellers can view their products.', {
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
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw badInput('Page must be positive and limit must be between 1 and 100.');
    }

    const result = await this.grpc.call('catalog', 'listProductsByShop', {
      shop_id: shopId,
      page,
      limit,
    });

    const products = result.products.map((product: any) => ({
      id: product.id,
      shopId: product.shop_id,
      name: product.name,
      description: product.description,
      priceCents: Number(product.price_cents),
      imageUrl: product.image_url || null,
    }));

    // Fetch available stock from inventory for each product
    const stockResults = await Promise.all(
      products.map(async (product: any) => {
        try {
          const stock = await this.grpc.call('inventory', 'getStock', {
            product_id: product.id,
          });
          return { ...product, availableStock: stock.available_stock ?? 0 };
        } catch {
          return { ...product, availableStock: 0 };
        }
      }),
    );

    return stockResults;
  }
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
      availableStock: initialStock,
      imageUrl: product.image_url || null,
    };
  }



  @Mutation('updateProduct')
  async updateProduct(
    @Args('id') id: string,
    @Args('name') name: string | undefined,
    @Args('description') description: string | undefined,
    @Args('priceCents') priceCents: number | undefined,
    @Context() context: any,
  ) {
    const token = readSessionToken(context.req);
    const user = await this.auth.call('getProfile', { token });

    if (user.role !== 'SHOPKEEPER' || user.status !== 'ACTIVE') {
      throw new GraphQLError('Only active sellers can update products.', {
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

    // Verify the product belongs to this shop
    const existingProduct = await this.grpc.call('catalog', 'getProduct', {
      product_id: id,
    });

    if (existingProduct.shop_id !== shopId) {
      throw new GraphQLError('You can only update your own products.', {
        extensions: { code: 'FORBIDDEN' },
      });
    }

    if (
      name !== undefined &&
      (typeof name !== 'string' || !name.trim() || name.trim().length > 255)
    ) {
      throw badInput('Name must be a non-empty string within 255 characters.');
    }

    if (
      description !== undefined &&
      (typeof description !== 'string' ||
        !description.trim() ||
        description.trim().length > 5000)
    ) {
      throw badInput('Description must be a non-empty string within 5000 characters.');
    }

    if (
      priceCents !== undefined &&
      (!Number.isInteger(priceCents) || priceCents < 0)
    ) {
      throw badInput('priceCents must be a non-negative integer.');
    }

    const product = await this.grpc.call('catalog', 'updateProduct', {
      product_id: id,
      name: name?.trim(),
      description: description?.trim(),
      price_cents: priceCents !== undefined ? String(priceCents) : undefined,
    });

    return {
      id: product.id,
      shopId: product.shop_id,
      name: product.name,
      description: product.description,
      priceCents: Number(product.price_cents),
      availableStock: product.available_stock ?? 0,
      imageUrl: product.image_url || null,
    };
  }

  @Mutation('updateStock')
  async updateStock(
    @Args('productId') productId: string,
    @Args('delta') delta: number,
    @Context() context: any,
  ) {
    const token = readSessionToken(context.req);
    const user = await this.auth.call('getProfile', { token });

    if (user.role !== 'SHOPKEEPER' && user.role !== 'ADMIN') {
      throw new GraphQLError('Only sellers and admins can update stock.', {
        extensions: { code: 'FORBIDDEN' },
      });
    }

    if (!Number.isInteger(delta)) {
      throw badInput('Delta must be an integer.');
    }

    // Verify product ownership for shopkeepers
    if (user.role === 'SHOPKEEPER') {
      const shopId =
        typeof user.shop_id === 'string' ? user.shop_id.trim() : '';
      const product = await this.grpc.call('catalog', 'getProduct', {
        product_id: productId,
      });
      if (product.shop_id !== shopId) {
        throw new GraphQLError('You can only update stock for your own products.', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
    }

    const result = await this.grpc.call('inventory', 'updateStock', {
      product_id: productId,
      delta,
    });

    // Fetch product details for response
    const product = await this.grpc.call('catalog', 'getProduct', {
      product_id: productId,
    });

    return {
      id: product.id,
      shopId: product.shop_id,
      name: product.name,
      description: product.description,
      priceCents: Number(product.price_cents),
      availableStock: result.available_stock ?? 0,
      imageUrl: product.image_url || null,
    };
  }
}
