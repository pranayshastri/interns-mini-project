import { Injectable, NestMiddleware } from '@nestjs/common';
import { Kind, parse } from 'graphql';

@Injectable()
export class GraphqlRequestMiddleware implements NestMiddleware {
  private readonly allowedOrigins: Set<string>;
  private readonly limits = new Map<string, { count: number; expires: number }>();
  constructor() {
    if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_ORIGIN) throw new Error('FRONTEND_ORIGIN is required in production.');
    this.allowedOrigins = new Set((process.env.FRONTEND_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map(s => s.trim()));
  }
  use(req: any, res: any, next: () => void) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const reject = (status: number, message: string) => res.status(status).json({ errors: [{ message }] });
    if (req.method !== 'POST' || !req.is('application/json') || !this.allowedOrigins.has(req.headers.origin)) return reject(403, 'Request origin is not allowed.');
    const now = Date.now();
    for (const [key, value] of this.limits) if (value.expires < now) this.limits.delete(key);
    if (this.limits.size >= 10000 && !this.limits.has(req.ip)) return reject(429, 'Please try again shortly.');
    const bucket = this.limits.get(req.ip) || { count: 0, expires: now + 60000 };
    this.limits.set(req.ip, bucket);
    if (++bucket.count > 120) return reject(429, 'Too many requests. Please try again shortly.');
    try {
      if (typeof req.body?.query !== 'string' || req.body.query.length > 10000) return reject(400, 'Invalid GraphQL request.');
      const document = parse(req.body.query);
      // Bound aliases/batching for the initial account API, before any resolver runs.
      const operation = document.definitions[0];
      if (document.definitions.length !== 1 || operation.kind !== Kind.OPERATION_DEFINITION || operation.selectionSet.selections.length !== 1 || operation.selectionSet.selections[0].kind !== Kind.FIELD) return reject(400, 'Send one operation per request.');
    } catch { return reject(400, 'Invalid GraphQL request.'); }
    next();
  }
}
