# Auth and account flow

The local implementation uses Next.js → NestJS Apollo GraphQL gateway → mTLS Auth gRPC → Prisma/PostgreSQL and Valkey. Registration creates a CUSTOMER account without issuing a session. Users then sign in explicitly. Profile reads and name updates require a valid session; logout revokes it in Valkey.

Passwords are hashed with bcrypt cost 12. New passwords require at least 8 Unicode code points and at most 72 UTF-8 bytes (bcrypt's input limit). Existing accounts can still log in with their existing password. The browser necessarily holds the password while it is entered; masking and Show/Hide only control visibility. The frontend clears its password state after submission. Passwords and password hashes are never returned by the account API.

Sessions expire after one hour. The gateway sets an HttpOnly, SameSite=Strict cookie, with Secure enabled in production. JWTs are not exposed in GraphQL responses or stored in localStorage. Auth verifies the signed token and its Valkey session. Registration/login have per-email Valkey rate limits; the current gateway also has a per-process IP request limit and explicit Origin checks.

## Local startup: one command

With Docker running and dependencies installed:

```bash
cd /home/ankit/pro/dezinetproject/interns-mini-project
npm run dev:auth
```

This starts PostgreSQL and Valkey via Compose, generates Prisma Client, builds Auth and gateway, checks the existing users table, then starts Auth, gateway and frontend. A real request through the frontend rewrite and mTLS gRPC must reject an invalid JWT before the launcher prints “ready”. It does not insert sample accounts or reset databases.

Open http://127.0.0.1:3000/login or `/signup`. Signup creates CUSTOMER only; existing SHOPKEEPER/ADMIN accounts use the same login. Successful login currently opens `/profile`. Privileged account provisioning is documented below; seller/admin business dashboards remain separate work.

The launcher uses Node 26; if the current shell is older, it can use an already-installed Node 26 under `~/.nvm/versions/node`. It does not install Node or packages automatically.

Prerequisites on a fresh checkout:

- Root ignored `.env` with `LOCAL_AUTH_DATABASE_URL`, database credentials needed by Compose, and a random `JWT_SECRET` of at least 32 characters. The URL must point to the host-mapped PostgreSQL port, not the Docker hostname.
- Existing Auth `users` table matching `prisma/schema.prisma`. The launcher checks it and stops with an explanation if missing; it does not run destructive migrations or reset volumes.
- Development certificates in `infra/certs`: `ca.crt`, `auth-service.crt/key`, `api-gateway.crt/key`. Coordinate certificates with the team; the launcher never regenerates an existing CA.
- Docker access and available local ports 3000, 4000 and 50051.

Ctrl+C stops the application processes started by this command. Database containers remain running. If a port is occupied, stop that old app or explicitly select unused ports:

```bash
AUTH_LOCAL_FRONTEND_PORT=3014 AUTH_LOCAL_GATEWAY_PORT=4014 AUTH_LOCAL_GRPC_PORT=50114 npm run dev:auth
```

The corresponding login URL is then http://127.0.0.1:3014/login. The origin allowlist and frontend rewrite are configured together. Do not mix localhost and 127.0.0.1 in the browser.

Auth is enabled by default in the frontend. `ROBONEST_AUTH_ENABLED=false` explicitly disables it for unavailable-state testing. Commerce capabilities remain disabled in the auth launcher.

## Create real accounts

Every role uses the same `/login` form. Public `/signup` creates CUSTOMER only. The account's role is stored in the Auth database and comes back from `me`; there is no role selector on the login page.

**CUSTOMER:** Open the `/signup` URL printed by `npm run dev:auth`, enter your details, then sign in at `/login`. This writes a real user through the GraphQL gateway, mTLS Auth service and Prisma.

**ADMIN:** With PostgreSQL running and root `.env` configured, run from the repository root:

```bash
npm run account:provision --workspace=auth-service -- --role ADMIN --email admin@example.com --name "Admin Name"
```

**SHOPKEEPER (temporary operator provisioning only):** The repository currently has no `shops` table or shop-creation API. This command does not create or verify a shop. Use it only when the team has established a real shop identity and its ownership outside this Auth slice; otherwise wait for the agreed onboarding flow. Obtain that shop UUID from the teammate responsible for shops, then run:

```bash
npm run account:provision --workspace=auth-service -- --role SHOPKEEPER --email seller@example.com --name "Seller Name" --shop-id YOUR_EXISTING_SHOP_UUID
```

Replace every placeholder with real team data. The `YOUR_EXISTING_SHOP_UUID` placeholder is deliberately not a usable ID. The command asks for a password with hidden terminal input, hashes it with bcrypt, inserts the user once and prints only role/email/id. It refuses duplicate email and never upgrades an existing CUSTOMER to ADMIN. It uses `LOCAL_AUTH_DATABASE_URL` from the ignored root `.env` unless `DATABASE_URL` is explicitly set. It does not create a shop, verify its ownership or connect seller product flows. Seller self-service registration must be added after the team agrees which service owns shops and how approved accounts are linked.

Once provisioned, both roles sign in at the same `/login`. The current Auth UI redirects to `/profile`, where role and shop ID are shown. Seller and admin business pages remain separate integration work.

## Verification

```bash
npm run test:integration --workspace=auth-service
npm run check-types --workspace=frontend
npm run build --workspace=frontend
```

The integration suite requires PostgreSQL/Valkey, Bash, OpenSSL and localhost socket access. It creates and removes its own unique PostgreSQL schema, Valkey key prefix, temporary certificates and test processes. It does not reset the application database. CI can inject `AUTH_TEST_DATABASE_URL`, `AUTH_TEST_VALKEY_HOST` and `AUTH_TEST_VALKEY_PORT`; no local `.env` is required when these are supplied.

The suite checks fail-closed TLS startup, rejected untrusted clients, registration without a session, explicit login, password hashing, profile persistence, anonymous/tampered token rejection, rejected role changes and cross-origin requests, and logout replay rejection. The browser suite uses the installed Playwright dependency and a Chrome/Chromium executable. On this development machine:

```bash
CHROME_PATH=/usr/bin/google-chrome npm run test:browser --workspace=auth-service
```

It runs the real CUSTOMER signup/login/profile/logout flow and form-based ADMIN and SHOPKEEPER login. It also checks Show/Hide, persistence across reload, rejected credentials, anonymous profile redirect, mobile overflow, browser runtime errors and network-failure recovery. Screenshots are written to the ignored `test-artifacts/` folder. Its Next.js output uses `.next-test` to avoid colliding with a running preview.

## Deployment work still required

Passing local tests does not establish production readiness. Before release:

- Configure HTTPS at the public ingress, `NODE_ENV=production`, explicit `FRONTEND_ORIGIN`, private service networking, and secret/certificate rotation.
- Implement and test email ownership verification, safe password recovery, compromised-password screening and the agreed MFA policy.
- Connect the other service resolvers and shared distributed gateway security layer. Auth now uses the Nest/Apollo module and `src/resolvers/auth.resolver.ts`; Catalog, Order and Inventory are not yet connected. The request policy currently permits one root operation per request.
- Review account-enumeration behavior (duplicate registration currently reports an existing account), rate limiting across replicas, security monitoring and session lifecycle requirements.
- Establish reviewed Prisma migrations/baselines, CI/browser/security tests, backup/restore and deployment checks.

`DATABASE_URL`, a strong random `JWT_SECRET` of at least 32 characters, Valkey configuration and mTLS credential paths must be injected by deployment. Build generates Prisma Client, but does not apply migrations. No email, payment or other commerce flow is implied by this account implementation.

Password policy: the requested 8-character minimum is a product choice. MFA is not implemented; current OWASP guidance recommends 15 characters without MFA. Compromised-password screening is also pending. Mandatory character-class rules are not enforced.
