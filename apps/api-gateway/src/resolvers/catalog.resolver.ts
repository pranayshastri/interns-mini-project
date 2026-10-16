import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { CommerceClient } from '../grpc/commerce-client.service';
import { badInput, uuid } from './commerce.types';
const view = (p: any) => ({ id: p.id, shopId: p.shop_id, name: p.name, description: p.description, priceCents: Number(p.price_cents) });
@Resolver('Product')
export class CatalogResolver {
  constructor(private readonly grpc: CommerceClient) {}
  @Query('products')
  async products(@Args('page') page: number = 1, @Args('limit') limit: number = 50) {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw badInput('Page must be positive and limit must be between 1 and 100.');
    const result = await this.grpc.call('catalog', 'listProducts', { page, limit });
    return result.products.map(view);
  }
  @Query('product')
  async product(@Args('id') id: string) { return view(await this.grpc.call('catalog', 'getProduct', { product_id: uuid(id) })); }
  @ResolveField('availableStock')
  async availableStock(@Parent() product: { id: string }) {
    return (await this.grpc.call('inventory', 'getStock', { product_id: product.id })).available_stock;
  }
}
