import { accountRequest, AccountError } from './graphql-client';
import type { CommerceAdapter, Config, Product, Order } from './contracts';

export const productFields = 'id shopId name description priceCents availableStock';
export const orderFields = 'id customerId status totalAmountCents createdAt';
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
    quote: unavailable, payment: unavailable, pay: unavailable, notifications: unavailable, markRead: unavailable, invoices: unavailable, invoice: unavailable,
  };
}
