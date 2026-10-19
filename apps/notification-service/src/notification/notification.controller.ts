import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  NotificationService,
  ListRequest,
  NotificationView,
} from './notification.service';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @GrpcMethod('NotificationService', 'ListNotifications')
  async listNotifications(request: ListRequest): Promise<{
    notifications: NotificationView[];
    total: number;
    unread_count: number;
    page: number;
    limit: number;
  }> {
    return this.notificationService.list(request);
  }

  @GrpcMethod('NotificationService', 'UnreadCount')
  async unreadCount(request: {
    user_id?: string;
    shop_id?: string;
  }): Promise<{ count: number }> {
    return this.notificationService.unreadCount(request);
  }

  @GrpcMethod('NotificationService', 'MarkRead')
  async markRead(request: {
    notification_id?: string;
    user_id?: string;
    shop_id?: string;
  }): Promise<NotificationView> {
    return this.notificationService.markRead(request);
  }
}
