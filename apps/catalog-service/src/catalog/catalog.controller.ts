import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CatalogService } from './catalog.service';
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}
  @GrpcMethod('CatalogService', 'ListProducts')
  listProducts(data: { page: number; limit: number }) { return this.catalog.listProducts(data); }
  @GrpcMethod('CatalogService', 'GetProduct')
  getProduct(data: { product_id: string }) { return this.catalog.getProduct(data.product_id); }
}
