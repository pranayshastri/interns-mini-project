/**
 * CatalogService Business Logic
 * 
 * ARCHITECTURE ROLE:
 * - Queries and modifies products in PostgreSQL `catalog_db` using Prisma ORM
 * - Interacts with Valkey for read caching
 * 
 * TODO: [Intern Task - Catalog Business Logic]
 * 1. Inject PrismaService and ValkeyService.
 * 2. Implement `createProduct({ shop_id, name, description, price_cents, initial_stock })`:
 *    - Insert product into PostgreSQL using `this.prisma.product.create({ data: { shopId: shop_id, name, description, priceCents: BigInt(price_cents) } })`.
 *    - Invalidate Valkey cache for catalog listings.
 *    - Return product data with initial_stock.
 * 3. Implement `listProducts(page = 1, limit = 50)`:
 *    - Check Valkey cache first.
 *    - If cache miss: query `this.prisma.product.findMany({ skip: (page - 1) * limit, take: limit })`.
 *    - Save to Valkey cache.
 *    - Return product list.
 * 4. Implement `getProduct(productId)`:
 *    - Query `this.prisma.product.findUnique({ where: { id: productId } })`.
 *    - Return product details or throw NOT_FOUND exception.
 */
