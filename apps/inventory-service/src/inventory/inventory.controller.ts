import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @GrpcMethod('InventoryService', 'GetStock')
async getStock(request: { product_id: string }): Promise<{
    product_id: string;
    available_stock: number;
  }> {
    const result = await this.inventoryService.getStock(request.product_id);
    return {
      product_id: result.productId,
      available_stock: result.availableStock,
    };
  }

  @GrpcMethod('InventoryService', 'UpdateStock')
  async updateStock(request: {
    product_id: string;
    delta: number;
  }): Promise<{
    product_id: string;
    available_stock: number;
  }> {
    const result = await this.inventoryService.updateStock(
      request.product_id,
      request.delta,
    );
    return {
      product_id: result.productId,
      available_stock: result.availableStock,
    };
  }

  @GrpcMethod('InventoryService', 'ReserveStock')
async reserveStock(request: {
    product_id: string;
    quantity: number;
  }): Promise<{
    success: boolean;
    available_stock: number;
    insufficient: boolean;
  }> {
    const result = await this.inventoryService.reserveStock(
      request.product_id,
      request.quantity,
    );
    return {
      success: result.success,
      available_stock: result.availableStock,
      insufficient: result.insufficient,
    };
  }
}
