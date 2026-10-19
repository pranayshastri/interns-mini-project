import { GraphQLError } from 'graphql';
export const commerceTypeDefs = `
  type Product { id: ID!, shopId: ID!, name: String!, description: String!, priceCents: Int!, availableStock: Int! }
  extend type Query { products(page: Int = 1, limit: Int = 50): [Product!]!, product(id: ID!): Product!, stock(productId: ID!): Int! }
  extend type Mutation { createProduct(name: String!, description: String!, priceCents: Int!, initialStock: Int!): Product! }
`;
// PostgreSQL accepts UUIDs without RFC version bits, including the agreed seed IDs.
export function uuid(value: string) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) throw badInput('A valid UUID is required.');
  return value;
}
export function badInput(message: string) { return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } }); }
