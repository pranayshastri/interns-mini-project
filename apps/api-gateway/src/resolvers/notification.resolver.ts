import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AuthClient } from '../grpc/auth-client.service';
import { NotificationClient } from '../grpc/notification-client.service';

export const notificationTypeDefs = `
  type Notification {
    id: ID!
    type: String!
    title: String!
    body: String!
    data: String!
    read: Boolean!
    readAt: String
    createdAt: String!
  }

  type NotificationPage {
    notifications: [Notification!]!
    total: Int!
    unreadCount: Int!
    page: Int!
    limit: Int!
  }

  extend type Query {
    myNotifications(unreadOnly: Boolean = false, page: Int = 1, limit: Int = 20): NotificationPage!
    myUnreadNotificationCount: Int!
  }

  extend type Mutation {
    markNotificationRead(id: ID!): Notification!
  }
`;

const cookieName = 'shop_session';

function readSessionToken(req: any): string {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((part: string) => part.trim())
    .find((part: string) => part.startsWith(`${cookieName}=`));

  const token = cookie?.slice(cookieName.length + 1) || '';

  if (!token) {
    throw new GraphQLError('Please sign in.', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  return token;
}

function toGraphQLNotification(raw: any) {
  return {
    id: raw.id,
    type: raw.type,
    title: raw.title,
    body: raw.body,
    data: raw.data_json,
    read: Boolean(raw.read),
    readAt: raw.read_at ? raw.read_at : null,
    createdAt: raw.created_at,
  };
}

@Resolver()
export class NotificationResolver {
  constructor(
    private readonly notificationClient: NotificationClient,
    private readonly authClient: AuthClient,
  ) {}

  /**
   * Identity always comes from the verified session - user_id and shop_id are
   * never accepted from the GraphQL caller.
   */
  private async recipientScope(req: any): Promise<{
    user_id: string;
    shop_id: string;
  }> {
    const token = readSessionToken(req);
    const user = await this.authClient.call('getProfile', { token });
    return { user_id: user.id, shop_id: user.shop_id || '' };
  }

  @Query('myNotifications')
  async myNotifications(
    @Args('unreadOnly') unreadOnly: boolean,
    @Args('page') page: number,
    @Args('limit') limit: number,
    @Context() context: any,
  ) {
    const scope = await this.recipientScope(context.req);
    const result = await this.notificationClient.call('ListNotifications', {
      ...scope,
      unread_only: Boolean(unreadOnly),
      page,
      limit,
    });
    return {
      notifications: (result.notifications || []).map(
        toGraphQLNotification,
      ),
      total: Number(result.total),
      unreadCount: Number(result.unread_count),
      page: Number(result.page),
      limit: Number(result.limit),
    };
  }

  @Query('myUnreadNotificationCount')
  async myUnreadNotificationCount(@Context() context: any) {
    const scope = await this.recipientScope(context.req);
    const result = await this.notificationClient.call('UnreadCount', scope);
    return Number(result.count);
  }

  @Mutation('markNotificationRead')
  async markNotificationRead(
    @Args('id') id: string,
    @Context() context: any,
  ) {
    const scope = await this.recipientScope(context.req);
    const result = await this.notificationClient.call('MarkRead', {
      notification_id: id,
      ...scope,
    });
    return toGraphQLNotification(result);
  }
}
