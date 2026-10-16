import { Args, Query, Resolver } from '@nestjs/graphql';
import { CommerceClient } from '../grpc/commerce-client.service';
import { uuid } from './commerce.types';
@Resolver()
export class InventoryResolver {
  constructor(private readonly grpc: CommerceClient) {}
  @Query('stock')
  async stock(@Args('productId') productId: string) {
    return (await this.grpc.call('inventory', 'getStock', { product_id: uuid(productId) })).available_stock;
  }
}
