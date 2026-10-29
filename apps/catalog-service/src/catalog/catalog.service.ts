
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ValkeyService } from '../cache/valkey.service';

const MAX_PRICE_CENTS = 9223372036854775807n;

const validUuid = (value: string) =>
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly valkey: ValkeyService,
  ) {}

  async createProduct(data: {
    shop_id: string;
    name: string;
    description: string;
    price_cents: number | string;
  }) {
    if (
      typeof data.shop_id !== 'string' ||
      !data.shop_id.trim() ||
      typeof data.name !== 'string' ||
      !data.name.trim() ||
      typeof data.description !== 'string' ||
      !data.description.trim()
    ) {
      throw new BadRequestException(
        'shop_id, name and description are required',
      );
    }

    const rawPrice = String(data.price_cents);
    if (!/^[0-9]+$/.test(rawPrice)) {
      throw new BadRequestException(
        'price_cents must be a non-negative integer',
      );
    }

    let price: bigint;

    try {
      price = BigInt(rawPrice);
    } catch {
      throw new BadRequestException(
        'price_cents must be a non-negative integer',
      );
    }

    if (price < 0n || price > MAX_PRICE_CENTS) {
      throw new BadRequestException(
        'price_cents is outside the supported range',
      );
    }

    const product = await this.prisma.product.create({
      data: {
        shopId: data.shop_id.trim(),
        name: data.name.trim(),
        description: data.description.trim(),
        priceCents: price,
      },
    });

    await this.valkey.invalidateProductsCache();

    return {
      id: product.id,
      shop_id: product.shopId,
      name: product.name,
      description: product.description,
      price_cents: product.priceCents.toString(),
      available_stock: 0,
    };
  }

  async listProducts(page = 1, limit = 50) {
    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException(
        'page must be positive and limit must be between 1 and 100',
      );
    }

    const cached = await this.valkey.getCachedProducts(page, limit);

    if (cached) {
      return cached;
    }

    const products = await this.prisma.product.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const result = products.map((product) => ({
      id: product.id,
      shop_id: product.shopId,
      name: product.name,
      description: product.description,
      price_cents: product.priceCents.toString(),
      created_at: product.createdAt,
    }));

    await this.valkey.setCachedProducts(page, limit, result, 60);

    return result;
  }

  async listProductsByShop(shopId: string, page = 1, limit = 50) {
    if (typeof shopId !== 'string' || !shopId.trim() || !validUuid(shopId.trim())) {
      throw new BadRequestException('A valid shop UUID is required');
    }

    if (
      !Number.isInteger(page) ||
      !Number.isInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      throw new BadRequestException(
        'page must be positive and limit must be between 1 and 100',
      );
    }

    const products = await this.prisma.product.findMany({
      where: { shopId: shopId.trim() },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return products.map((product) => ({
      id: product.id,
      shop_id: product.shopId,
      name: product.name,
      description: product.description,
      price_cents: product.priceCents.toString(),
      created_at: product.createdAt,
    }));
  }

  async updateProduct(data: {
    product_id: string;
    name?: string;
    description?: string;
    price_cents?: number | string;
  }) {
    if (
      typeof data.product_id !== 'string' ||
      !validUuid(data.product_id.trim())
    ) {
      throw new BadRequestException('A valid product UUID is required');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: data.product_id.trim() },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const updateData: any = {};

    if (typeof data.name === 'string' && data.name.trim()) {
      if (data.name.trim().length > 255) {
        throw new BadRequestException('Name must be at most 255 characters');
      }
      updateData.name = data.name.trim();
    }

    if (typeof data.description === 'string' && data.description.trim()) {
      if (data.description.trim().length > 5000) {
        throw new BadRequestException('Description must be at most 5000 characters');
      }
      updateData.description = data.description.trim();
    }

    if (data.price_cents !== undefined) {
      const rawPrice = String(data.price_cents);
      if (!/^[0-9]+$/.test(rawPrice)) {
        throw new BadRequestException('price_cents must be a non-negative integer');
      }
      let price: bigint;
      try {
        price = BigInt(rawPrice);
      } catch {
        throw new BadRequestException('price_cents must be a non-negative integer');
      }
      if (price < 0n || price > MAX_PRICE_CENTS) {
        throw new BadRequestException('price_cents is outside the supported range');
      }
      updateData.priceCents = price;
    }

    const updated = await this.prisma.product.update({
      where: { id: data.product_id.trim() },
      data: updateData,
    });

    await this.valkey.invalidateProductsCache();

    return {
      id: updated.id,
      shop_id: updated.shopId,
      name: updated.name,
      description: updated.description,
      price_cents: updated.priceCents.toString(),
      available_stock: 0,
    };
  }
  async getProduct(productId: string) {
    if (
      typeof productId !== 'string' ||
      !validUuid(productId.trim())
    ) {
      throw new BadRequestException('A valid product UUID is required');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: productId.trim() },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return {
      id: product.id,
      shop_id: product.shopId,
      name: product.name,
      description: product.description,
      price_cents: product.priceCents.toString(),
      available_stock: 0,
    };
  }
}
