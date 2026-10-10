# Distributed Event-Driven E-Commerce System (Interns Project)

Welcome! This repository is a Turborepo monorepo designed for hands-on mastery of distributed systems, data consistency, and microservice security.

All service files have been scaffolded as skeleton files with detailed `// TODO: [Intern Task]` comments guiding your implementation step by step.

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

## 📂 Repository Structure

```text
├── apps/
│   ├── frontend/             # Next.js 16 Web App (GraphQL Client, Customer/Shopkeeper/Admin views)
│   ├── api-gateway/          # NestJS GraphQL Gateway (Apollo Server, mTLS gRPC clients, Valkey session)
│   ├── auth-service/         # NestJS gRPC (auth_db, Prisma ORM, bcrypt, JWT, Valkey session)
│   ├── catalog-service/      # NestJS gRPC (catalog_db, Prisma ORM, Valkey cache)
│   ├── order-service/        # NestJS gRPC (order_db, Prisma ORM, Transactional Outbox, Kafka Producer)
│   └── inventory-service/    # NestJS gRPC (inventory_db, Prisma ORM, Idempotent Kafka Consumer)
├── packages/
│   ├── proto/                # Shared Protocol Buffer definitions (auth, catalog, order, inventory)
│   ├── typescript-config/    # Shared TS configs (including nestjs.json)
│   ├── eslint-config/        # Shared ESLint configuration
│   └── ui/                   # Shared React UI components
├── infra/
│   ├── certs/                # Generated mTLS certificates (ca, client, server certs)
│   └── postgres/             # Multi-DB initialization & seed scripts
├── scripts/
│   ├── generate-certs.sh     # Bash script for generating internal Root CA & mTLS certificates
│   └── generate-certs.ps1    # PowerShell script for generating certificates on Windows
├── docker-compose.yml        # PostgreSQL 16, Valkey 8, Kafka (KRaft), Kafka UI (:8080)
└── ARCHITECTURE.md           # Comprehensive Technical Architecture & Lab Guide
```

---

## 🚀 Quickstart Guide

### 1. Generate mTLS Certificates
Before running the services, generate internal Root CA and service certificates:
```bash
# On Linux / macOS / Git Bash:
./scripts/generate-certs.sh

# On Windows PowerShell:
.\scripts\generate-certs.ps1
```

### 2. Start Core Infrastructure (Docker Compose)
Start PostgreSQL, Valkey, Apache Kafka (KRaft mode), and Kafka UI:
```bash
docker compose up -d postgres valkey kafka kafka-ui
```
- **PostgreSQL**: Port `5432` (Auto-creates `auth_db`, `catalog_db`, `order_db`, `inventory_db`)
- **Valkey**: Port `6379`
- **Kafka (KRaft)**: Port `9092` (internal) / `9094` (host)
- **Kafka UI**: Open [http://localhost:8080](http://localhost:8080) to inspect topics and consumer offsets

### 3. Generate Prisma Clients
For each microservice:
```bash
npm run prisma:generate --workspace=auth-service
npm run prisma:generate --workspace=catalog-service
npm run prisma:generate --workspace=order-service
npm run prisma:generate --workspace=inventory-service
```

### 4. Run Development Servers
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
