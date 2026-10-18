import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AuthClient } from '../grpc/auth-client.service';

export const authTypeDefs = `
  type User { id: ID!, email: String!, fullName: String!, role: String!, shopId: String, status: String!, phone: String! }
  type Address { id: ID!, label: String!, recipient: String!, phone: String!, line1: String!, line2: String!, city: String!, state: String!, postal: String!, country: String!, isDefault: Boolean! }
  input AddressInput { id: ID, label: String!, recipient: String!, phone: String!, line1: String!, line2: String = "", city: String!, state: String!, postal: String!, country: String!, isDefault: Boolean = false }
  type AdminShop { id: ID!, ownerId: ID!, name: String!, description: String!, createdAt: String! }
  type AdminSellerPayload { user: User!, shop: AdminShop! }
  type AuthPayload { user: User! }
  type AdminUserPage { users: [User!]!, total: Int!, page: Int!, limit: Int! }
  type AdminOverview { customers: Int!, sellers: Int!, admins: Int!, suspended: Int! }
  type AdminEvent { id: ID!, actorId: ID!, actorName: String!, targetId: ID!, targetEmail: String!, action: String!, reason: String!, previousStatus: String!, newStatus: String!, createdAt: String! }
  type AdminActivityPage { events: [AdminEvent!]!, total: Int!, page: Int!, limit: Int! }
  type AdminHealth { checkedAt: String!, database: Boolean!, sessions: Boolean! }
  type Query {
    me: User!
    myAddresses: [Address!]!
    adminUsers(search: String, role: String, status: String, page: Int, limit: Int): AdminUserPage!
    adminUser(id: ID!): User!
    adminOverview: AdminOverview!
    adminActivity(page: Int, limit: Int): AdminActivityPage!
    adminShop(id: ID!): AdminShop!
    adminHealth: AdminHealth!
  }
  type Mutation {
    register(email: String!, password: String!, fullName: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    updateProfile(fullName: String!, phone: String): User!
    adminSetAccountStatus(id: ID!, status: String!, expectedStatus: String!, reason: String!): User!
    adminCreateSeller(email: String!, password: String!, fullName: String!, shopName: String!, description: String!): AdminSellerPayload!
    saveAddress(input: AddressInput!): [Address!]!
    deleteAddress(id: ID!): [Address!]!
    setDefaultAddress(id: ID!): [Address!]!
    logout: Boolean!
  }
`;
const shopView = (shop: any) => ({ id: shop.id, ownerId: shop.owner_id, name: shop.name, description: shop.description, createdAt: shop.created_at });
const cookieName = 'shop_session';
const userView = (user: any) => ({ id: user.id, email: user.email, fullName: user.full_name, role: user.role, shopId: user.shop_id || null, status: user.status, phone: user.phone || '' });
function readToken(req: any, required = true): string {
  const entry = (req.headers.cookie || '').split(';').map((s: string) => s.trim()).find((s: string) => s.startsWith(`${cookieName}=`));
  const token = entry?.slice(cookieName.length + 1) || '';
  if (!token && required) throw new GraphQLError('Please sign in.', { extensions: { code: 'UNAUTHENTICATED' } });
  return token;
}
function setSessionCookie(res: any, token: string, age: number) {
  res.setHeader('Set-Cookie', `${cookieName}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}

@Resolver()
export class AuthResolver {
  constructor(private readonly auth: AuthClient) {}

  @Mutation('register')
  async register(@Args('email') email: string, @Args('password') password: string, @Args('fullName') fullName: string) {
    const result = await this.auth.call('register', { email, password, full_name: fullName });
    return { user: userView(result.user) };
  }

  @Mutation('login')
  async login(@Args('email') email: string, @Args('password') password: string, @Context() context: any) {
    const result = await this.auth.call('authenticate', { email, password });
    setSessionCookie(context.res, result.access_token, 3600);
    return { user: userView(result.user) };
  }

  @Query('me')
  async me(@Context() context: any) {
    return userView(await this.auth.call('getProfile', { token: readToken(context.req) }));
  }

  @Mutation('updateProfile')
  async updateProfile(@Args('fullName') fullName: string, @Args('phone') phone: string | null, @Context() context: any) {
    return userView(await this.auth.call('updateProfile', { token: readToken(context.req), full_name: fullName, phone: phone ?? '', update_phone: phone != null }));
  }

  @Query('myAddresses')
  async addresses(@Context() context: any) {
    const result = await this.auth.call('listAddresses', { token: readToken(context.req) });
    return result.addresses.map((a: any) => ({ ...a, isDefault: a.is_default }));
  }
  @Mutation('saveAddress')
  async saveAddress(@Args('input') input: any, @Context() context: any) {
    const result = await this.auth.call('saveAddress', { token: readToken(context.req), address: { ...input, is_default: input.isDefault } });
    return result.addresses.map((a: any) => ({ ...a, isDefault: a.is_default }));
  }
  @Mutation('deleteAddress')
  async deleteAddress(@Args('id') id: string, @Context() context: any) {
    const result = await this.auth.call('deleteAddress', { token: readToken(context.req), id });
    return result.addresses.map((a: any) => ({ ...a, isDefault: a.is_default }));
  }
  @Mutation('setDefaultAddress')
  async setDefaultAddress(@Args('id') id: string, @Context() context: any) {
    const result = await this.auth.call('setDefaultAddress', { token: readToken(context.req), id });
    return result.addresses.map((a: any) => ({ ...a, isDefault: a.is_default }));
  }

  @Mutation('logout')
  async logout(@Context() context: any) {
    const token = readToken(context.req, false);
    if (token) {
      try { await this.auth.call('logout', { token }); }
      catch (error) { if ((error as GraphQLError).extensions?.code !== 'UNAUTHENTICATED') throw error; }
    }
    setSessionCookie(context.res, '', 0);
    return true;
  }
  @Query('adminUsers')
  async adminUsers(@Args() args: any, @Context() context: any) {
    const result = await this.auth.call('adminUsers', { ...args, token: readToken(context.req) });
    return { ...result, users: result.users.map(userView) };
  }
  @Query('adminUser')
  async adminUser(@Args('id') id: string, @Context() context: any) {
    return userView(await this.auth.call('adminUser', { id, token: readToken(context.req) }));
  }
  @Query('adminOverview')
  async adminOverview(@Context() context: any) { return this.auth.call('adminOverview', { token: readToken(context.req) }); }
  @Query('adminActivity')
  async adminActivity(@Args() args: any, @Context() context: any) {
    const result = await this.auth.call('adminActivity', { ...args, token: readToken(context.req) });
    return { ...result, events: result.events.map((e: any) => ({ id: e.id, actorId: e.actor_id, actorName: e.actor_name, targetId: e.target_id, targetEmail: e.target_email, action: e.action, reason: e.reason, previousStatus: e.previous_status, newStatus: e.new_status, createdAt: e.created_at })) };
  }
  @Mutation('adminCreateSeller')
  async adminCreateSeller(@Args() args: any, @Context() context: any) {
    const result = await this.auth.call('adminCreateSeller', { email: args.email, password: args.password, full_name: args.fullName, shop_name: args.shopName, description: args.description, token: readToken(context.req) });
    return { user: userView(result.user), shop: shopView(result.shop) };
  }
  @Query('adminShop')
  async adminShop(@Args('id') id: string, @Context() context: any) {
    return shopView(await this.auth.call('adminShop', { id, token: readToken(context.req) }));
  }
  @Query('adminHealth')
  async adminHealth(@Context() context: any) {
    const result = await this.auth.call('adminHealth', { token: readToken(context.req) });
    return { checkedAt: result.checked_at, database: result.database, sessions: result.sessions };
  }
  @Mutation('adminSetAccountStatus')
  async adminSetAccountStatus(@Args() args: any, @Context() context: any) {
    return userView(await this.auth.call('adminSetStatus', { id: args.id, status: args.status, expected_status: args.expectedStatus, reason: args.reason, token: readToken(context.req) }));
  }

}
