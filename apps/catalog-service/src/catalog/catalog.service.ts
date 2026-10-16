import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
const validUuid = (s: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s);
const view = (p: any) => ({ id: p.id, shop_id: p.shopId, name: p.name, description: p.description, price_cents: p.priceCents.toString() });
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}
  async listProducts({ page = 1, limit = 50 }: { page?: number; limit?: number }) {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new RpcException({ code: 3, message: 'Invalid pagination' });
    return { products: (await this.prisma.product.findMany({ skip: (page - 1) * limit, take: limit, orderBy: { id: 'asc' } })).map(view) };
  }
  async getProduct(id: string) {
    if (!validUuid(id)) throw new RpcException({ code: 3, message: 'A valid product UUID is required' });
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new RpcException({ code: 5, message: 'Product not found' });
    return view(product);
  }
}
