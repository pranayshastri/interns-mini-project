import { accountRequest, AccountError } from './graphql-client';
import type { CommerceAdapter, Config, Product, Order } from './contracts';

export const productFields = 'id shopId name description priceCents availableStock';
export const orderFields = 'id customerId status totalAmountCents createdAt';
export const notificationFields = 'id title body type read readAt createdAt';
// Only baseline operations have a live implementation. Proposed contracts fail closed.
export function liveAdapter(config: Config): CommerceAdapter {
  const unavailable = async (): Promise<never> => { throw new AccountError('This feature is temporarily unavailable. Please check back later.', 'UNAVAILABLE'); };
  function requireCapability(name: string) {
    if (!config.capabilities.includes(name)) throw new AccountError('This feature is temporarily unavailable. Please check back later.', 'UNAVAILABLE');
  }
  return {
    async products() { requireCapability('products'); return (await accountRequest<{ products: Product[] }>(`query { products { ${productFields} } }`)).products; },
    async product(id) { requireCapability('product'); return (await accountRequest<{ product: Product }>(`query($id:ID!){product(id:$id){${productFields}}}`, { id })).product; },
    async stock(id) { requireCapability('stock'); return (await accountRequest<{ stock: number }>('query($id:ID!){stock(productId:$id)}', { id })).stock; },
    async myProducts() {
      requireCapability('myProducts');
      return (await accountRequest<{ myProducts: Product[] }>(
        `query { myProducts { ${productFields} } }`
      )).myProducts;
    },
    async createProduct(input) { requireCapability('createProduct'); return (await accountRequest<{ createProduct: Product }>(`mutation($name:String!,$description:String!,$priceCents:Int!,$initialStock:Int!){createProduct(name:$name,description:$description,priceCents:$priceCents,initialStock:$initialStock){${productFields}}}`, { ...input })).createProduct; },
    updateProduct: unavailable, updateStock: unavailable, orders: unavailable,
    async order(id) { requireCapability('order'); return (await accountRequest<{ order: Order | null }>(`query($id:ID!){order(id:$id){${orderFields}}}`, { id })).order; },
    async createOrder(items, shippingAddress) { requireCapability('createOrder'); return (await accountRequest<{ createOrder: Order }>(`mutation($items:[OrderItemInput!]!,$shippingAddress:String!){createOrder(items:$items,shippingAddress:$shippingAddress){${orderFields}}}`, { items: items.map(({ productId, shopId, quantity, unitPriceCents }) => ({ productId, shopId, quantity, unitPriceCents })), shippingAddress })).createOrder; },
    async notifications() { requireCapability('notifications'); const { myNotifications } = await accountRequest<{ myNotifications: { notifications: Array<{ id: string; title: string; body: string; createdAt: string; read: boolean; data: string }>; } }>(`query { myNotifications { notifications { ${notificationFields} data } } }`); return myNotifications.notifications.map((n) => { let data: any = {}; try { data = typeof n.data === 'string' ? JSON.parse(n.data) : (n.data || {}); } catch { data = {}; } return ({ id: n.id, title: n.title, body: n.body, createdAt: n.createdAt, read: n.read, href: data.orderId ? `/orders/${data.orderId}` : '/notifications' }); }); },
    async markRead(id) { requireCapability('notifications'); const { markNotificationRead } = await accountRequest<{ markNotificationRead: { id: string; title: string; body: string; read: boolean; readAt: string; createdAt: string } }>(`mutation($id:ID!){markNotificationRead(id:$id){id title body read readAt createdAt}}`, { id }); return { id: markNotificationRead.id, title: markNotificationRead.title, body: markNotificationRead.body, createdAt: markNotificationRead.createdAt, read: markNotificationRead.read, href: `/orders/${id}` }; },
    quote: unavailable, payment: unavailable, pay: unavailable, invoices: unavailable, invoice: unavailable,
  };
}
