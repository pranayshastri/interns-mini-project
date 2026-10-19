import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class ValkeyService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  async onModuleInit(): Promise<void> {
    this.client = new Redis({
      host: process.env.VALKEY_HOST || 'localhost',
      port: Number(process.env.VALKEY_PORT || 6379),
      lazyConnect: true,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });

    this.client.on('error', (error: Error) => {
      console.error('Valkey connection error:', error.message);
    });

    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client && this.client.status !== 'end') {
      await this.client.quit();
    }
  }

  async getCachedProducts(
    page: number,
    limit: number,
  ): Promise<Record<string, unknown>[] | null> {
    const data = await this.client.get(this.getProductsCacheKey(page, limit));

    return data
      ? (JSON.parse(data) as Record<string, unknown>[])
      : null;
  }

  async setCachedProducts(
    page: number,
    limit: number,
    products: Record<string, unknown>[],
    ttlSeconds = 60,
  ): Promise<void> {
    await this.client.set(
      this.getProductsCacheKey(page, limit),
      JSON.stringify(products),
      'EX',
      ttlSeconds,
    );
  }

  async invalidateProductsCache(): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        'catalog:products:*',
        'COUNT',
        100,
      );

      cursor = nextCursor;

      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  private getProductsCacheKey(page: number, limit: number): string {
    return `catalog:products:page:${page}:limit:${limit}`;
  }
}
