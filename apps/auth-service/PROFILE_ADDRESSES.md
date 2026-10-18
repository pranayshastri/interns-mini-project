# Profile and personal delivery addresses

`/profile` uses the approved account layout with real Auth-backed name, phone and saved delivery addresses. `/profile-preview` remains a development-only review page whose entries reset on reload.

## Run locally

From the repository root:

```bash
cd /home/ankit/pro/dezinetproject/interns-mini-project
npm run dev:auth
```

The launcher builds Auth/Gateway, generates Prisma, applies the additive admin and profile migrations, and starts the configured services (frontend defaults to port 3000). It preserves existing users and passwords and refuses to take over occupied ports. Root `.env`, certificates, Docker, PostgreSQL and Valkey must already be configured as described in the Auth README.

For separately managed services, stop/restart those app processes around this upgrade, with PostgreSQL available:

```bash
npm run build --workspace=auth-service --workspace=api-gateway
npm run schema:profile --workspace=auth-service
```

The migration uses `DATABASE_URL` or root `.env`'s `LOCAL_AUTH_DATABASE_URL`. Do not reset the database. The schema script is idempotent and can upgrade an existing unbaselined database. The normal build alone does not apply it. Fresh database initialization also includes the new columns and address table.

## Ownership and behavior

- Auth owns personal delivery addresses for all signed-in roles. Shop addresses are separate future work.
- The gateway obtains identity from the HttpOnly session cookie. No address operation accepts a user ID. All reads and writes are scoped by Auth to the current account.
- An address contains label, recipient, phone, address lines, city, state/region, postal code, country and default flag. The second address line is optional. Up to 20 addresses per account.
- The first address becomes default. Selecting a new default changes both records in one transaction. Deleting the default promotes the earliest remaining address. To change an existing default, choose another address's **Set as default** action.
- A user-row lock serializes address mutations across service instances. A partial unique database index prevents multiple default addresses for one user.
- Name and address fields are trimmed and length checked. Phone accepts 7–15 digits with optional country prefix and common separators. This is format validation, not phone or postal verification.
- Email, account role and shop ID remain read-only. Public signup remains CUSTOMER-only.
- Addresses are not yet wired into checkout or order snapshots. No shop, Catalog, Inventory or analytics behavior is implied.

## API additions

Same-origin `POST /graphql` supports `myAddresses`, `saveAddress(input)`, `deleteAddress(id)` and `setDefaultAddress(id)`. Each mutation returns the current address list. `me` includes `phone`; `updateProfile(fullName, phone)` optionally updates it. Omitting phone preserves its value; sending an empty string clears it.

The matching gRPC additions are in both `proto/auth.proto` and `packages/proto/auth.proto`. Existing field numbers and operations remain intact. Deploy the database migration and updated Auth service before the gateway/frontend that request the new fields.

## Verification

```bash
CHROME_PATH=/usr/bin/google-chrome npm run test:browser --workspace=auth-service
npm run check-types --workspace=frontend
```

The integration suite uses a temporary PostgreSQL schema and Valkey namespace. It covers persistence, phone compatibility, invalid input, cross-account and anonymous rejection, concurrent default changes, deletion fallback, existing authentication/admin operations, and real desktop/mobile browser flows. Test-created records are isolated from application data.
