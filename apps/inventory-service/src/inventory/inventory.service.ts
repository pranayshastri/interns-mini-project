import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RpcException } from "@nestjs/microservices";
import { Prisma } from "../../generated/prisma";

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

  async reserveStock(
    productId: string,
    quantity: number,
  ): Promise<{
    success: boolean;
    availableStock: number;
    insufficient: boolean;
  }> {
    try {
      return await this.reserveStockWithClient(
        this.prisma,
        productId,
        quantity,
      );
    } catch (err) {
      this.logger.error(
        `ReserveStock failed for product ${productId} with quantity ${quantity}:`,
        err instanceof Error ? err.stack : String(err),
      );
      return {
        success: false,
        availableStock: 0,
        insufficient: true,
      };
    }
  }

  async reserveStockInTransaction(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number,
  ): Promise<{
    success: boolean;
    availableStock: number;
    insufficient: boolean;
  }> {
    return this.reserveStockWithClient(tx, productId, quantity);
  }

  private async reserveStockWithClient(
    client: Prisma.TransactionClient | PrismaService,
    productId: string,
    quantity: number,
  ): Promise<{
    success: boolean;
    availableStock: number;
    insufficient: boolean;
  }> {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new RpcException({
        code: 3,
        message: "Quantity must be a positive integer",
      });
    }

    const result = await client.$executeRaw`
      UPDATE product_inventory
      SET available_stock = available_stock - ${quantity},
          updated_at = NOW()
      WHERE product_id = ${productId}::uuid
        AND available_stock >= ${quantity}
    `;

    if (result === 0) {
      const current = await client.productInventory.findUnique({
        where: { productId },
      });
      return {
        success: false,
        availableStock: current ? Number(current.availableStock) : 0,
        insufficient: true,
      };
    }

    const updated = await client.productInventory.findUnique({
      where: { productId },
    });

    const newAvailableStock = updated ? Number(updated.availableStock) : 0;
    return {
      success: true,
      availableStock: newAvailableStock,
      insufficient: false,
    };
  }
}
