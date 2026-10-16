# RoboNest frontend

RoboNest is an electronics and robotics components storefront. This frontend uses real same-origin `POST /graphql` requests. No demo mode, sample account, fixture catalog, or simulated payment is supported. Unsupported operations report unavailable; an empty successful catalog response shows an empty state.

```bash
cd /home/ankit/pro/dezinetproject/interns-mini-project
npm run dev:auth
```

`API_GATEWAY_URL` defaults to `http://127.0.0.1:4000` and is server-only. Authentication is enabled by default; `ROBONEST_AUTH_ENABLED=false` explicitly disables it. The root launcher configures the gateway and frontend origin together. Restart/rebuild after configuration changes.

`ROBONEST_VERIFIED_CAPABILITIES` defaults to empty. The gateway now supports `products,product,stock,order,createOrder` with mTLS-backed services; enable those capabilities when Auth, Catalog, Inventory, Order, and the gateway are running. Seller product creation/editing, payment, notifications, and invoices remain unavailable. The browser uses same-origin `/graphql` and does not access internal services directly.

JWT is carried in the gateway's HttpOnly session cookie. Identity comes from `me`. The gateway talks to internal services using gRPC with mTLS; no keys, certificates, database credentials or internal service calls belong in browser code.

[Integration handoff](../../docs/FRONTEND_INTEGRATION.md) · [Adding database data](../../docs/DATABASE_DATA_GUIDE.md)

```bash
npm run check-types --workspace=frontend
npm run lint --workspace=frontend
CHROME_PATH=/usr/bin/google-chrome npm run test:browser --workspace=frontend
```

These browser tests verify frontend behavior without claiming real commerce service integration. Separate Auth integration tests require the infrastructure described in `apps/auth-service/README.md`.

Customer signup is public. ADMIN and SHOPKEEPER accounts use the [privileged account provisioning command](../auth-service/README.md#create-real-accounts); all three roles then sign in on the same page.
