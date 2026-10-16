# 📋 Project Task Tracker & Sprint Backlog

This document tracks the current progress, identified architectural issues, and next tasks for all collaborators and interns.

---

## 🚦 Current Service Implementation Status

| Service / App | Branch / PR | Status | Author |
| :--- | :--- | :--- | :--- |
| **Auth Service & Frontend** | `feat/auth-service-mtls-bootstrap` (PR #5) | ✅ Merged into main (PR #5) | `@Ankitprajapati24` |
| **Order Service (Outbox Pattern)** | `feature/aditi-order-service` (PR #1) | ✅ Included in main via PR #4 | `@ADITI9981` |
| **Inventory Service (Idempotent Consumer)** | `feat/inventory-service` (PR #3) | ✅ Included in main via PR #4 | `@Aaron-Coutinho` |
| **Catalog Service** | `main` | Catalog reads implemented locally; product creation pending | *Open for intern claim* |
| **API Gateway (mTLS Resolvers)** | `main` | Implemented locally; verified with mTLS integration tests | *Open for intern claim* |

---

## 🚨 Identified Issues & Action Items

### 1. [Critical] Merge `service` branch into `main` (Issue [#6](https://github.com/pranayshastri/interns-mini-project/issues/6))
- **Verified 2026-10-16:** `service` has zero commits ahead of `main`; PR #4 already brought in Order and Inventory, and PR #5 is merged. A duplicate merge PR is unnecessary. GitHub issue #6 remains open.
- **Validation:** Combined local working-tree build and `docker compose config --quiet` pass. These checks include local issue fixes; they are not a CI verdict on the remote main commit.

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
