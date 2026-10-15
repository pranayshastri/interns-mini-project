import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RpcException } from '@nestjs/microservices';
import { status as grpcStatus } from '@grpc/grpc-js';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getStock(productId: string): Promise<{
    productId: string;
    availableStock: number;
  }> {
    const inventory = await this.prisma.productInventory.findUnique({
      where: { productId },
    });

    const availableStock = inventory ? Number(inventory.availableStock) : 0;

    return {
      productId,
      availableStock,
    };
  }

  async updateStock(productId: string, delta: number): Promise<{
    productId: string;
    availableStock: number;
  }> {
    try {
      const updated = await this.prisma.productInventory.upsert({
        where: { productId },
        create: {
          productId,
          availableStock: delta,
        },
        update: {
          availableStock: {
            increment: delta,
          },
        },
      });

      return {
        productId,
        availableStock: Number(updated.availableStock),
      };
    } catch (err) {
      this.logger.error(
        `UpdateStock failed for product ${productId} with delta ${delta}:`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new RpcException({
        code: grpcStatus.NOT_FOUND,
        message: `Product ${productId} not found or stock update failed`,
      });
    }
  }
}
