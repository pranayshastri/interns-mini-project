# Commerce gateway integration (issues #6, #7, #8)

## Implemented

- `stock(productId)`, `products(page, limit)` and `product(id)` join the Order and Auth operations already on `main`; each uses certificate-verified mTLS. Order keeps the existing Order client and GraphQL Int checkout contract.
- Gateway defaults: `catalog-service:50052`, `order-service:50053`, `inventory-service:50054`; override with `CATALOG_SERVICE_ADDR`, `ORDER_SERVICE_ADDR`, `INVENTORY_SERVICE_ADDR` for host development.
- Use `TLS_CA_PATH`, `TLS_CERT_PATH`, `TLS_KEY_PATH`, or gateway `TLS_CERT_DIR`. Missing certificates fail closed. Inventory bootstrap no longer falls back to plaintext.
- Product `availableStock` resolves from Inventory when requested, independently of Catalog data. Outages return `SERVICE_UNAVAILABLE`, not zero stock.
- Orders require an active CUSTOMER session through the existing HttpOnly `shop_session` cookie. Prices and shop IDs are checked against Catalog, and current stock against Inventory; customer identity comes from Auth. Owners can look up their orders; existing ADMIN access remains.
- `totalAmountCents` uses the existing checkout GraphQL Int contract; values outside its range are rejected. `createdAt` is an ISO timestamp.
- Catalog `ListProducts` and `GetProduct` now read PostgreSQL. `CreateProduct` is still unimplemented; it is not exposed by this gateway change.
- `@repo/proto/seed-ids.json` is the shared test fixture. SQL retains literal IDs so the existing psql bootstrap remains standalone; a regression check enforces equality. UUID validation accepts PostgreSQL UUID syntax, including the agreed zero-version seed IDs.
- Commerce Prisma clients generate into each service's own `generated/prisma` directory, preventing workspace builds from overwriting each other's models.

## Run verification

From the repository root, use the project's Node 26 environment:

```bash
npm run build
docker compose config --quiet
npm run test:commerce
```

`test:commerce` needs local PostgreSQL and Valkey (127.0.0.1:6379), Chrome (`CHROME_PATH` or `/usr/bin/google-chrome`), and OpenSSL. Set `COMMERCE_TEST_DATABASE_URL` or use root `.env`'s `LOCAL_AUTH_DATABASE_URL`. Database credentials are read without printing them.

The suite creates a unique PostgreSQL schema, loads the actual SQL seeds, starts real Auth/Catalog/Order/Inventory controllers with real Prisma clients and mTLS, and starts the actual gateway and Next.js proxy on temporary ports. It verifies shared seed IDs, malformed UUIDs, mTLS rejection, authentication, price checks, order/outbox persistence, ownership, live stock changes and service failure. A headless browser checks the same-origin GraphQL route and HttpOnly session behavior. Test schemas, session keys and temporary certificates are removed afterward.

The suite excludes Kafka workers: it checks atomic order/outbox creation, not asynchronous inventory deduction. Its browser check places an order from the visible catalog through checkout and verifies the persisted order and outbox record. Payment is outside this flow. The services use separate Prisma clients against an isolated test schema; this is not a Docker deployment test.

## Verified results (2026-10-16)

- Full `npm run build`: all six application build tasks passed.
- Inventory rebuilt successfully after fail-closed bootstrap change.
- `docker compose config --quiet` and `git diff --check`: passed.
- Commerce integration: 12 tests passed, including browser transport verification.
- Existing Auth integration regression: 19 tests passed.

## Branch state

Verified on GitHub on 2026-10-16: PR #4 merged `service` into `main`; PR #5 is merged; `service` is zero commits ahead of `main`. No duplicate merge PR is needed for issue #6. Local validation includes these issue fixes and the user's existing changes, rather than an untouched remote-main checkout.

The rebased and tested commit must be pushed to `main` before issues #7 and #8 can be closed. TestSprite was not run: there is no repository link or deployed preview for these changes.
