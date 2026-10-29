
import { Controller, BadRequestException, NotFoundException } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  private mapGrpcError(error: unknown, operation: string): never {
    if (error instanceof RpcException) {
      throw error;
    }

    if (error instanceof BadRequestException) {
      throw new RpcException({
        code: status.INVALID_ARGUMENT,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (error instanceof NotFoundException) {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    console.error(`${operation} failed:`, error);

    throw new RpcException({
      code: status.INTERNAL,
      message: `${operation} failed`,
    });
  }

  @GrpcMethod('CatalogService', 'CreateProduct')
  async createProduct(data: {
    shop_id: string;
    name: string;
    description: string;
    price_cents: number | string;
  }) {
    try {
      return await this.catalogService.createProduct(data);
    } catch (error) {
      return this.mapGrpcError(error, 'CreateProduct');
    }
  }

  @GrpcMethod('CatalogService', 'ListProducts')
  async listProducts(data: { page?: number; limit?: number }) {
    try {
      const products = await this.catalogService.listProducts(
        data.page ?? 1,
        data.limit ?? 50,
      );

      return { products };
    } catch (error) {
      return this.mapGrpcError(error, 'ListProducts');
    }
  }

  @GrpcMethod('CatalogService', 'ListProductsByShop')
  async listProductsByShop(data: {
    shop_id: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const products = await this.catalogService.listProductsByShop(
        data.shop_id,
        data.page ?? 1,
        data.limit ?? 50,
      );

      return { products };
    } catch (error) {
      return this.mapGrpcError(error, 'ListProductsByShop');
    }
  }

  @GrpcMethod('CatalogService', 'UpdateProduct')
  async updateProduct(data: {
    product_id: string;
    name?: string;
    description?: string;
    price_cents?: number | string;
  }) {
    try {
      return await this.catalogService.updateProduct(data);
    } catch (error) {
      return this.mapGrpcError(error, 'UpdateProduct');
    }
  }

  @GrpcMethod('CatalogService', 'GetProduct')
  async getProduct(data: { product_id: string }) {
    try {
      return await this.catalogService.getProduct(data.product_id);
    } catch (error) {
      return this.mapGrpcError(error, 'GetProduct');
    }
  }
}
