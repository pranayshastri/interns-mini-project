# 📋 Project Task Tracker & Sprint Backlog

This document tracks the current progress, identified architectural issues, and next tasks for all collaborators and interns.

---

## 🚦 Current Service Implementation Status

| Service / App | Branch / PR | Status | Author |
| :--- | :--- | :--- | :--- |
| **Auth Service & Frontend** | `feat/auth-service-mtls-bootstrap` (PR #5) | ✅ Approved — Ready for Ankit to merge | `@Ankitprajapati24` |
| **Order Service (Outbox Pattern)** | `feature/aditi-order-service` (PR #1) | ⚠️ Merged into `service` branch (needs merge to `main`) | `@ADITI9981` |
| **Inventory Service (Idempotent Consumer)** | `feat/inventory-service` (PR #3) | ⚠️ Merged into `service` branch (needs merge to `main`) | `@Aaron-Coutinho` |
| **Catalog Service** | `main` | ⏳ Pending implementation | *Open for intern claim* |
| **API Gateway (mTLS Resolvers)** | `main` | ⏳ Pending gRPC resolver wiring | *Open for intern claim* |

---

## 🚨 Identified Issues & Action Items

### 1. [Critical] Merge `service` branch into `main` (Issue [#6](https://github.com/pranayshastri/interns-mini-project/issues/6))
- **Problem:** PR #1 and PR #3 were merged into the `service` branch instead of `main`. The `main` branch does not yet contain the Order and Inventory service implementations.
- **Action:**
  1. Team Lead `@Ankitprajapati24` merges PR #5 into `main`.
  2. Open a Pull Request from `service` into `main`.
  3. Resolve any merge conflicts in `schema-init.sql` or `docker-compose.yml`.
  4. Verify with `npm run build` that all services compile cleanly together on `main`.

### 2. [Alignment] Synchronize Seed Product & Shop UUIDs (Issue [#7](https://github.com/pranayshastri/interns-mini-project/issues/7))
- **Problem:** Seed UUIDs diverged between `schema-init.sql` (`p0000000...`) and test scripts / PR #5 (`e0000000...` and `d0000000...`).
- **Action:**
  - Standardize all services and test scripts to use the unified UUID constants:
    - Product ID: `e0000000-0000-0000-0000-000000000001`
    - Shop ID: `d0000000-0000-0000-0000-000000000001`

### 3. [Feature] Connect API Gateway GraphQL Resolvers via mTLS (Issue [#8](https://github.com/pranayshastri/interns-mini-project/issues/8))
- **Objective:** Complete the End-to-End flow: Frontend &rarr; GraphQL Gateway &rarr; mTLS gRPC Microservices.
- **Action:**
  - Implement `apps/api-gateway/src/resolvers/order.resolver.ts` to call `order-service:50053` via mTLS gRPC.
  - Implement `apps/api-gateway/src/resolvers/inventory.resolver.ts` to call `inventory-service:50054` via mTLS gRPC.
  - Stitch inventory stock into catalog product queries.

### 4. [Upcoming] Catalog Service Implementation
- **Objective:** Implement `apps/catalog-service/` using Prisma ORM with `ecommerce_catalog_db` and gRPC over mTLS.
- **RPCs:** `CreateProduct`, `ListProducts`, `GetProduct`.

### 5. [Milestone] Execute the 4 Mandatory Demonstration Labs (See `ARCHITECTURE.md`)
- Lab 1: Atomic Database Transaction & Rollback Test (Order Service)
- Lab 2: Kafka Outage Resiliency Test (Outbox Poller flushes on reconnect)
- Lab 3: Duplicate Event Delivery & Idempotency Test (Inventory Service skips double deduction)
- Lab 4: Zero-Trust mTLS Rejection Test (Untrusted cert rejected with Code 14)
