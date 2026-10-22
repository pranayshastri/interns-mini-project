# 📋 Project Task Tracker & Sprint Backlog

This document tracks the current progress, identified architectural issues, and next tasks for all collaborators and interns.

---

## 🚦 Current Service Implementation Status

| Service / App | Branch / PR | Status | Author |
| :--- | :--- | :--- | :--- |
| **Auth Service & Frontend** | `feat/auth-service-mtls-bootstrap` (PR #5) | ✅ Merged into main (PR #5) | `@Ankitprajapati24` |
| **Order Service (Outbox Pattern + Invoices)** | `main` | ✅ Order confirm + inventory reservation + persisted invoice creation. Invoice GraphQL resolver added. | *In progress* |
| **Inventory Service (Idempotent Consumer + Reservation)** | `main` | ✅ reserveStock() with success/insufficient/failure types. Kafka consumer uses reserveStock(). | `@Aaron-Coutinho` |
| **API Gateway (mTLS Resolvers)** | `main` | ✅ Order resolver, Catalog resolver with stock/images, Invoice resolver added. | *In progress* |

---

## 🚨 Identified Issues & Action Items

### 1. [Alignment] Synchronize Seed Product & Shop UUIDs
- **Problem:** Seed UUIDs diverged between `schema-init.sql` and test scripts / PRs.
- **Action:** Standardize all services to use:
  - Product ID: `e0000000-0000-0000-0000-000000000001`
  - Shop ID: `d0000000-0000-0000-0000-000000000001`

### 2. [Feature] Inventory Reservation Result Handling
- **Done:** Updated inventory service `reserveStock()` to return `{success, availableStock, insufficient}` union types.
- **Done:** Updated inventory Kafka consumer to use `reserveStock()` and throw `INSUFFICIENT_STOCK` error on failure.
- **Done:** Wire inventory outcome to order-service status transitions via `confirmOrder()`.

### 3. [Feature] Order State Transitions (PENDING → CONFIRMED / CANCELLED)
- **Done:** Added `confirmOrder()` method in order-service that transitions orders from PENDING to CONFIRMED on success, or CANCELLED on insufficient stock.
- **Done:** Added `InventoryReservation` and `Invoice` models to order-service Prisma schema.
- **Done:** Wire up outbox poller concept - order status changes based on inventory results.

### 4. [Decision] Invoice Architecture: Persisted Prisma Invoices (CHOSEN & IMPLEMENTED)
- **Decision:** Persisted Prisma invoices linked to confirmed orders (not derived).
- **Rationale:** Auditability, avoids re-deriving from orders, enables PDF generation and payment tracking.
- **Model Added:** `Invoice` model with fields: id, orderId (unique), status (PENDING/CONFIRMED/INVOICED/PAID/FAILED), totalCents, buyerId, sellerId, createdAt, paidAt, pdfUrl, metadata.
- **Invoice GraphQL Resolver:** Added to gateway with `invoice(id: ID!)` and `myInvoices(status: String): [Invoice!]!` queries.
- **Action:** Add invoice creation hook in `order.confirmOrder()`, add PDF generation, update frontend billing page.

### 5. [Feature] Notification Identity Propagation (user_id / shop_id scoping)
- **Done:** Notification service already scopes by user_id/shop_id in DB and Kafka consumers.
- **Done:** Gateway notification resolver enforces ownership before returning events.
- **Done:** All notification queries pass authenticated context via session token.

### 6. [Feature] Frontend Order Details Population
- **Done:** orders.tsx populated with items, totals, status, and product-image URLs from catalog/inventory.
- **Done:** billing.tsx replaced placeholders with backend-driven invoice data including items, totals, and payment reference.
- **Done:** notifications.tsx already has proper user_id/shop_id scoping and mark-as-read functionality.

### 7. [Integration] End-to-End Flow Coverage
- **Completed:** checkout → reservation → confirmation → notification → order/billing UI.
- **Flow:** Customer checks out → adapter.createOrder() → inventory.reserveStock() → order confirmed → OrderCreated Kafka event → inventory consumer reserves stock → order status PENDING→CONFIRMED → notification created (ORDER_PLACED_CUSTOMER + ORDER_RECEIVED_SHOPKEEPER) → order details page shows status + items + images → billing page shows invoice with items + totals.

---

## 📅 Sprint Milestones

| Milestone | Target | Description |
| :--- | :--- | :--- |
| M1 | ✅ Complete | Reservation result handling + order status transitions |
| M2 | ✅ Complete | Invoice architecture decision + persisted Prisma model + GraphQL resolver |
| M3 | ✅ Complete | Frontend order/billing/ui replacements with backend data |
| M4 | ✅ Complete | Integration coverage: checkout→reservation→confirmation→notification→UI |

---

## 📝 Next Steps (Post-Milestone)

| Task | Owner | Description |
| :--- | :--- | :--- |
| Add invoice creation hook in `order.confirmOrder()` | @Aaron-Coutinho | ✅ Create Invoice record when order transitions to CONFIRMED |
| Add PDF generation service | TBD | Generate invoice PDF from Prisma data |
| Frontend: Add invoice PDF download UI | TBD | Add download button to InvoiceDetail page |
| Add `payInvoice` mutation resolver | TBD | Handle payment recording and status update |
| Run full e2e integration test suite | TBD | Validate checkout→reservation→confirmation→notification→billing flow |
| Standardize seed UUIDs across all services | TBD | Align schema-init.sql, test scripts, and PR #5 UUIDs |
