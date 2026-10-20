import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AuthClient } from './grpc/auth-client.service';
import { AuthResolver, authTypeDefs } from './resolvers/auth.resolver';
import { GraphqlRequestMiddleware } from './security/graphql-request.middleware';
import { OrderClient } from './grpc/order-client.service';
import { OrderResolver, orderTypeDefs } from './resolvers/order.resolver';
import { CommerceClient } from './grpc/commerce-client.service';
import { CatalogResolver } from './resolvers/catalog.resolver';
import { CatalogMutationResolver } from './resolvers/catalog-mutation.resolver';
import { InventoryResolver } from './resolvers/inventory.resolver';
import { commerceTypeDefs } from './resolvers/commerce.types';
import { NotificationClient } from './grpc/notification-client.service';
import { NotificationResolver, notificationTypeDefs } from './resolvers/notification.resolver';

@Module({
  imports: [GraphQLModule.forRoot<ApolloDriverConfig>({
    driver: ApolloDriver,
    typeDefs: [authTypeDefs, orderTypeDefs, commerceTypeDefs, notificationTypeDefs],
    playground: false,
    introspection: process.env.NODE_ENV !== 'production',
    csrfPrevention: true,
    includeStacktraceInErrorResponses: false,
    context: ({ req, res }) => ({ req, res }),
    formatError: error => ({ message: error.extensions?.code === 'INTERNAL_SERVER_ERROR' ? 'Something went wrong. Please try again.' : error.message, extensions: { code: error.extensions?.code } }),
  })],
    providers: [AuthClient, AuthResolver, OrderClient, OrderResolver, CommerceClient, CatalogResolver, CatalogMutationResolver, InventoryResolver, NotificationClient, NotificationResolver],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(GraphqlRequestMiddleware).forRoutes({ path: 'graphql', method: RequestMethod.ALL });
  }
}
