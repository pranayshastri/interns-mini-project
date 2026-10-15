import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';

@Injectable()
export class ValkeyService implements OnModuleInit, OnModuleDestroy {
  private readonly prefix = process.env.AUTH_REDIS_PREFIX || 'shop:auth:';
  private readonly redis = new Redis({
    host: process.env.VALKEY_HOST || '127.0.0.1', port: Number(process.env.VALKEY_PORT || 6379),
    password: process.env.VALKEY_PASSWORD || undefined,
    lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1,
    connectTimeout: 5000, retryStrategy: times => Math.min(times * 250, 3000),
  });
  constructor() { this.redis.on('error', () => {}); }
  async onModuleInit() { await this.redis.connect(); }
  async onModuleDestroy() { this.redis.disconnect(); }
  async saveSession(jti: string, userId: string, ttl: number) { await this.redis.set(`${this.prefix}session:${jti}`, userId, 'EX', ttl); }
  async isSessionValid(jti: string, userId: string) { return await this.redis.get(`${this.prefix}session:${jti}`) === userId; }
  async revokeSession(jti: string) { await this.redis.del(`${this.prefix}session:${jti}`); }
  async ping() { return await this.redis.ping() === 'PONG'; }
  async limit(action: string, identity: string, maximum: number, seconds: number) {
    const digest = createHash('sha256').update(identity).digest('hex');
    const count = Number(await this.redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, `${this.prefix}limit:${action}:${digest}`, seconds));
    if (count > maximum) throw new RpcException({ code: status.RESOURCE_EXHAUSTED, message: 'Too many attempts. Please try again later.' });
  }
}
