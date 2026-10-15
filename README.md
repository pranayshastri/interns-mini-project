# RoboNest — Electronics & Robotics Components

RoboNest is a multi-vendor electronics and robotics components project. This Turborepo explores distributed systems, data consistency, and microservice security.

The Auth/Profile slice has a real local implementation. Commerce services still contain `// TODO: [Intern Task]` scaffolds; this is not a completed e-commerce platform.

For the configured local Auth stack, run `npm run dev:auth` from the repository root and open the login URL printed by the launcher. See [Auth setup and prerequisites](apps/auth-service/README.md).

`npm run dev` is the Turborepo command that starts each workspace's `dev` script; it does not start infrastructure, prepare Auth certificates, or verify a working login. `npm run dev:auth` starts the configured local Auth stack and checks the real request path. Run only one of these commands at a time on the default ports: frontend 3000, gateway 4000, and Auth gRPC 50051. They are development entry points, not separate customer/admin/seller websites.

---

## 👥 Team Leadership & Git Policy
- **Project Owner:** Pranay Shastri ([@pranayshastri](https://github.com/pranayshastri))
- **Team Leader:** Ankit Prajapati ([@Ankitprajapati24](https://github.com/Ankitprajapati24))

> [!IMPORTANT]
> The `main` branch is protected. Only Project Owner **Pranay Shastri** and Team Leader **Ankit Prajapati** have merge/push authority into `main`. All other collaborators and interns must create feature branches (`feat/...`) and open a Pull Request. See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed workflow instructions.

---

## 🏗️ High-Level Architecture

```text
[ Next.js Frontend (:3000) ]
          │  GraphQL (/graphql)
          ▼
[ NestJS API Gateway (:4000) ]
          │
          ├── gRPC + mTLS ──► [ Auth Service (:50051) ]       ──► PostgreSQL (auth_db) + Valkey
          ├── gRPC + mTLS ──► [ Catalog Service (:50052) ]    ──► PostgreSQL (catalog_db) + Valkey
          ├── gRPC + mTLS ──► [ Order Service (:50053) ]      ──► PostgreSQL (order_db) + Kafka Producer
          └── gRPC + mTLS ──► [ Inventory Service (:50054) ]  ──► PostgreSQL (inventory_db) + Kafka Consumer
                                       ▲
                                       │ (Kafka KRaft Topic: shop.orders.v1)
                                       │
                              [ Outbox Poller Worker ]
```

---

## 🛡️ Crucial Concept for Interns: Security Boundary & Internal Masking

> [!IMPORTANT]
> **Core Architectural Rule:**  
> The client (browser) must **NEVER have any direct access to or knowledge of** what happens behind the API Gateway.

```text
 ┌─────────────────────────────────────────────────────────────┐
 │                      PUBLIC INTERNET                        │
 │                                                             │
 │   [ Customer / Shopkeeper Browser ]                         │
 │                 │                                           │
 │                 │  1. HTTPS (Port 3000)                     │
 │                 ▼                                           │
 │        [ Next.js Frontend ]                                 │
 │                 │                                           │
 │                 │  2. GraphQL Queries & Mutations           │
 │                 │     POST http://localhost:4000/graphql    │
 │                 ▼                                           │
 └─────────────────┼───────────────────────────────────────────┘
═══════════════════╪═════════════════════════════════════════════
                   │   ZERO-TRUST SECURITY BOUNDARY
═══════════════════╪═════════════════════════════════════════════
 ┌─────────────────┼───────────────────────────────────────────┐
 │                 ▼           PRIVATE DOCKER NETWORK          │
 │       [ NestJS API Gateway ]                                │
 │          (Port 4000)                                        │
 │           • JWT Claims Extraction & Valkey Session Guard    │
 │           • Translates GraphQL ──► gRPC                     │
 │           • Holds api-gateway.crt + api-gateway.key         │
 │                 │                                           │
 │                 │  3. Strictly Internal gRPC over mTLS      │
 │                 │     (Signed by internal Root CA)          │
 │         ┌───────┼───────────────┬──────────────┐            │
 │         ▼       ▼               ▼              ▼            │
 │     [ Auth ] [ Catalog ]    [ Order ]     [ Inventory ]     │
 │     :50051   :50052         :50053        :50054            │
 │        │        │               │              │            │
 │        ▼        ▼               ▼              ▼            │
 │     auth_db  catalog_db      order_db     inventory_db      │
 │                                 │                           │
 │                                 │ 4. Kafka KRaft            │
 │                                 ▼                           │
 │                           [ Apache Kafka ]                  │
 └─────────────────────────────────────────────────────────────┘
```

### 🔑 4 Pillars Every Intern Must Implement Correctly:

1. **Complete Internal Topology Hiding (Encapsulation):**
   - The client/browser **only ever knows two endpoints**:
     - Next.js Web App: `http://localhost:3000`
     - GraphQL API Gateway: `http://localhost:4000/graphql`
   - The client must have **zero awareness** of internal gRPC ports (`:50051`–`:50054`), internal service names, database instances (`auth_db`, `order_db`), or Apache Kafka topics.

2. **GraphQL Data Stitching (BFF Pattern):**
   - When a frontend queries a product, the API Gateway queries `catalog-service` for details and `inventory-service` for real-time stock over internal gRPC, merges them together, and returns a single unified GraphQL payload. The client does not know multiple services were consulted.

3. **Zero-Trust Mutual TLS (mTLS):**
   - Even inside the private network, services **never trust callers blindly**.
   - Every internal microservice enforces `RequireAndVerifyClientCert`.
   - If an unauthorized caller or external attacker attempts to send gRPC requests without a client certificate signed by the internal Root CA, the handshake aborts immediately (**gRPC Status Code 14 - `UNAVAILABLE`**).

4. **Single Ingress Point for Edge Security:**
   - JWT validation, Valkey session tracking, rate limiting, and CORS are enforced at the API Gateway before any internal microservice is invoked.

---

## 📂 Repository Structure

```text
├── apps/
│   ├── frontend/             # Next.js 16 Web App (GraphQL Client, Customer/Shopkeeper/Admin views)
│   ├── api-gateway/          # NestJS GraphQL Gateway (Apollo Server, mTLS gRPC clients, Valkey session)
│   ├── auth-service/         # NestJS gRPC (auth_db, Prisma ORM, bcrypt, JWT, Valkey session)
│   ├── catalog-service/      # NestJS gRPC (catalog_db, Prisma ORM, Valkey cache)
│   ├── order-service/        # NestJS gRPC (order_db, Prisma ORM, Transactional Outbox, Kafka Producer)
│   └── inventory-service/    # NestJS gRPC (ecommerce_inventory_db, Prisma ORM, Idempotent Kafka Consumer)
├── packages/
│   ├── proto/                # Shared Protocol Buffer definitions (auth, catalog, order, inventory)
│   ├── typescript-config/    # Shared TS configs (including nestjs.json)
│   ├── eslint-config/        # Shared ESLint configuration
│   └── ui/                   # Shared React UI components
├── infra/
│   ├── certs/                # Generated mTLS certificates (ca, client, server certs)
│   ├── postgres/             # PostgreSQL 16 Dockerfile, multi-DB init & seed scripts
│   ├── kafka/                # Apache Kafka (KRaft mode) Dockerfile & topic auto-provisioner
│   └── valkey/               # Valkey 8 Dockerfile & production valkey.conf
├── scripts/
│   ├── generate-certs.sh     # Bash script for generating internal Root CA & mTLS certificates
│   └── generate-certs.ps1    # PowerShell script for generating certificates on Windows
├── .env.example              # Environment variables template with industry-grade secrets
├── docker-compose.yml        # Multi-container orchestration (No hardcoded credentials)
└── ARCHITECTURE.md           # Comprehensive Technical Architecture & Lab Guide
```

---

## 🚀 Quickstart Guide

### 1. Configure Environment Variables
Create your local environment file from the provided template:
```bash
cp .env.example .env
```
All secrets, ports, and database credentials are fully parameterized in `.env`.

### 2. Generate mTLS Certificates
Before running the services, generate the internal Root CA and service certificates:
```bash
# On Linux / macOS / Git Bash:
./scripts/generate-certs.sh

# On Windows PowerShell:
.\scripts\generate-certs.ps1
```

### 3. Start Core Infrastructure (Docker Compose)
Start PostgreSQL 16, Valkey 8, Apache Kafka (KRaft mode), and Kafka UI:
```bash
docker compose up -d postgres valkey kafka kafka-ui
```
- **PostgreSQL 16**: Port `5432` (Auto-provisions: `ecommerce_auth_db`, `ecommerce_catalog_db`, `ecommerce_order_db`, `ecommerce_inventory_db`)
- **Valkey 8**: Port `6379`
- **Kafka (KRaft)**: Port `9092` (internal) / `9094` (host) with auto-provisioned topic `shop.orders.v1`
- **Kafka UI**: Open [http://localhost:8080](http://localhost:8080) to inspect clusters and topics

### 4. Generate Prisma Clients
For each microservice:
```bash
npm run prisma:generate --workspace=auth-service
npm run prisma:generate --workspace=catalog-service
npm run prisma:generate --workspace=order-service
npm run prisma:generate --workspace=inventory-service
```

### 5. Run Development Servers
Run all applications with Turborepo:
```bash
npm run dev
```

---

## 🎯 Intern Learning Pillars & TODOs

Refer to `ARCHITECTURE.md` for in-depth specifications and the 4 demonstration labs:

1. **Frontend to API Gateway (GraphQL):**
   - Implement queries and mutations in `apps/frontend/` connecting to `http://localhost:4000/graphql`.
2. **API Gateway to Microservices (gRPC over mTLS):**
   - Implement GraphQL resolvers in `apps/api-gateway/src/resolvers/` that call backend microservices using mTLS channel credentials (`ca.crt`, `api-gateway.crt`, `api-gateway.key`).
3. **Session & Caching (Valkey):**
   - Implement session storage and token revocation in `apps/api-gateway/src/session/` and `apps/auth-service/src/session/`.
4. **Pillar 1: Transactional Outbox Pattern (Order Service):**
   - In `apps/order-service/src/order/order.service.ts`: atomically write to `orders` and `outbox_events` in one database transaction (`prisma.$transaction`).
   - In `apps/order-service/src/outbox/outbox-poller.worker.ts`: poll pending events with `SELECT ... FOR UPDATE SKIP LOCKED` and publish to Kafka topic `shop.orders.v1`.
5. **Pillar 2: Idempotent Consumer (Inventory Service):**
   - In `apps/inventory-service/src/kafka/order-consumer.service.ts`: deduplicate incoming order events via `inbox_events` (`ON CONFLICT DO NOTHING`) to safely prevent double stock deductions.

---

## 🧩 Team Expansion: Designing & Adding Missing Services & Frontends

> [!TIP]
> **To All Collaborators & Interns:**  
> The 5 services scaffolded above represent the **foundational transactional backbone** of the platform. However, a production-grade distributed e-commerce system is composed of many other critical capabilities.
> 
> **You and your team are empowered to decide what additional services and frontend applications are missing and build them!**

### 💡 Ideas for Missing Services & Apps You Can Add:

1. **Dedicated Frontends (`apps/admin-frontend`, `apps/shopkeeper-portal`)**:
   - A dedicated Next.js Admin Dashboard for platform management, user ban/unban, order metrics, and real-time Kafka event visualizers.
   - A dedicated Merchant Portal for shop owners to manage products, view stock alerts, and track order fulfillment.

2. **Notification Service (`apps/notification-service`)**:
   - A NestJS microservice listening to Kafka topic `shop.orders.v1`.
   - Sends simulated email, SMS, or webhooks whenever an order is placed, confirmed, or cancelled.

3. **Payment Service (`apps/payment-service`)**:
   - Manages customer payment methods, charges, ledger entries, and payment status updates.
   - Publishes `PaymentCompleted` or `PaymentFailed` events to Kafka to orchestrate order confirmation.

4. **Shipping & Fulfillment Service (`apps/shipping-service`)**:
   - Generates tracking numbers, calculates shipping estimates, and manages dispatch statuses.

5. **Review & Rating Service (`apps/review-service`)**:
   - Allows customers to post verified product reviews, star ratings, and seller feedback.

6. **Search & Recommendation Service (`apps/search-service`)**:
   - Full-text search and caching for high-volume product discovery.

### 🛠️ How to Add a New Project to the Monorepo:
1. Create your new app folder inside `apps/<your-project-name>`:
   - For a backend service: Scaffold a NestJS project (`package.json`, `tsconfig.json`, `src/`).
   - For a frontend app: Scaffold a Next.js project.
2. Link shared workspace packages in its `package.json` (e.g. `"@repo/proto": "*"`, `"@repo/typescript-config": "*"`).
3. If the service needs a database or Kafka events:
   - Follow the **Database-per-Service** pattern with a dedicated Prisma schema (`prisma/schema.prisma`).
   - Define contracts in `packages/proto/` if communicating over gRPC.
   - Add the service to `docker-compose.yml`.
4. Always develop on a feature branch (`feat/<service-name>`) and open a Pull Request for Team Lead / Owner review!
