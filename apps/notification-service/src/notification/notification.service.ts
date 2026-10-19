import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface ListRequest {
  user_id?: string;
  shop_id?: string;
  unread_only?: boolean;
  page?: number;
  limit?: number;
}

export interface NotificationView {
  id: string;
  user_id: string;
  shop_id: string;
  type: string;
  title: string;
  body: string;
  data_json: string;
  read: boolean;
  created_at: string;
  read_at: string;
}

function invalid(message: string): RpcException {
  // code 3 = INVALID_ARGUMENT (mapped to BAD_USER_INPUT by the gateway)
  return new RpcException({ code: 3, message });
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recipient scope is the union of "addressed to me" and "addressed to my
   * shop". The gateway derives user_id/shop_id from the verified session;
   * clients can never widen the scope.
   */
  private scope(user_id?: string, shop_id?: string): Prisma.NotificationWhereInput {
    if (!user_id && !shop_id) throw invalid('A recipient scope is required.');
    if (user_id && !UUID_PATTERN.test(user_id)) {
      throw invalid('user_id must be a UUID.');
    }
    if (shop_id && !UUID_PATTERN.test(shop_id)) {
      throw invalid('shop_id must be a UUID.');
    }
    const clauses: Prisma.NotificationWhereInput[] = [];
    if (user_id) clauses.push({ userId: user_id });
    if (shop_id) clauses.push({ shopId: shop_id });
    return { OR: clauses };
  }

  async list(request: ListRequest) {
    const where = this.scope(request.user_id, request.shop_id);
    const page = Math.max(1, Number(request.page) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(request.limit) || DEFAULT_LIMIT),
    );
    const unreadWhere: Prisma.NotificationWhereInput = {
      AND: [where, { readAt: null }],
    };

    const [rows, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: request.unread_only ? unreadWhere : where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: unreadWhere }),
    ]);

    return {
      notifications: rows.map((row) => this.view(row)),
      total,
      unread_count: unreadCount,
      page,
      limit,
    };
  }

  async unreadCount(request: { user_id?: string; shop_id?: string }) {
    const where = this.scope(request.user_id, request.shop_id);
    const count = await this.prisma.notification.count({
      where: { AND: [where, { readAt: null }] },
    });
    return { count };
  }

  async markRead(request: {
    notification_id?: string;
    user_id?: string;
    shop_id?: string;
  }) {
    if (!request.notification_id || !UUID_PATTERN.test(request.notification_id)) {
      throw invalid('notification_id must be a UUID.');
    }

    const scoped = this.scope(request.user_id, request.shop_id);
    const owned = await this.prisma.notification.findFirst({
      where: { AND: [{ id: request.notification_id }, scoped] },
    });

    if (!owned) {
      // code 5 = NOT_FOUND. Also the answer for "exists but not yours".
      throw new RpcException({
        code: 5,
        message: 'Notification not found.',
      });
    }

    if (!owned.readAt) {
      await this.prisma.notification.update({
        where: { id: owned.id },
        data: { readAt: new Date() },
      });
    }

    const fresh = await this.prisma.notification.findUniqueOrThrow({
      where: { id: owned.id },
    });
    return this.view(fresh);
  }

  private view(row: {
    id: string;
    userId: string | null;
    shopId: string | null;
    type: string;
    title: string;
    body: string;
    dataJson: string;
    readAt: Date | null;
    createdAt: Date;
  }): NotificationView {
    return {
      id: row.id,
      user_id: row.userId || '',
      shop_id: row.shopId || '',
      type: row.type,
      title: row.title,
      body: row.body,
      data_json: row.dataJson,
      read: row.readAt !== null,
      created_at: row.createdAt.toISOString(),
      read_at: row.readAt ? row.readAt.toISOString() : '',
    };
  }
}
