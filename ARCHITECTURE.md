# Mini Project 2026: Distributed Event-Driven E-Commerce System
## Technical Architecture & Developer Implementation Guide

---

## 1. Project Objectives & Core Learning Goals

The objective of this project is to provide developers with practical, hands-on experience in distributed systems design, data consistency, and microservice security.

Instead of building an overwhelmingly complex production e-commerce suite, this project focuses on **two foundational architectural pillars**:

```mermaid
flowchart LR
    subgraph Pillar1 ["Pillar 1: Data Consistency"]
        DB["PostgreSQL Transaction"] -->|"Atomic Write"| Outbox["outbox_events Table"]
        Outbox -->|"Polling Publisher"| Kafka["Kafka (KRaft)"]
        Kafka -->|"At-Least-Once Delivery"| Consumer["Inventory Service"]
        Consumer -->|"Deduplication via inbox_events"| Idempotent["Idempotent Execution"]
    end

    subgraph Pillar2 ["Pillar 2: Zero-Trust Security"]
        GW["API Gateway"] -->|"Mutual TLS (mTLS)\nClient + Server Certs"| InternalSvc["Internal gRPC Microservices"]
        InternalSvc -->|"Reject Untrusted / Missing Certs"| Reject["Handshake Abort (Code 14)"]
    end
```

### Core Competencies Mastered:
1. **The Dual-Write Problem & Transactional Outbox Pattern:** Learn why writing to a database and publishing to a message broker in the same API handler is fundamentally broken, and how to guarantee event delivery using an atomic outbox.
2. **Mutual TLS (mTLS) for Internal gRPC:** Learn how to secure service-to-service communication using an internal Certificate Authority (CA), verifying cryptographic identities of both client and server.
3. **Kafka in KRaft Mode:** Understand topic partitioning, consumer offsets, and asynchronous event streaming without ZooKeeper.
4. **Idempotent Consumers:** Design consumers that process duplicate events safely without corrupting business data (e.g., preventing double inventory deductions).
5. **Dockerized Local Development:** Run and test the entire distributed topology locally using Docker Compose.

---

## 2. High-Level System Architecture

The system models a lightweight multi-vendor e-commerce platform with 5 scoped microservices:

```mermaid
flowchart TD
    subgraph Client_Tier ["Client Layer"]
        Customer["Customer User"]
        Shopkeeper["Shopkeeper User"]
        Admin["Admin User"]
    end

    subgraph Gateway_Tier ["Edge API Gateway"]
        GW["GraphQL API Gateway\n(Port: 4000)\n• Single /graphql Endpoint\n• Session Cookie (shop_session) Verification & Role Forwarding\n• mTLS Client for Internal Services"]
    end

    subgraph gRPC_Tier ["Internal Services (Secured with mTLS)"]
        AUTH["Auth Service\n(:50051)\n• Login & Roles\n• DB: ecommerce_auth_db"]
        CATALOG["Catalog Service\n(:50052)\n• Product Listings\n• DB: ecommerce_catalog_db"]
        ORDER["Order Service\n(:50053)\n• Order Creation\n• Outbox Publisher Worker\n• DB: ecommerce_order_db"]
        INVENTORY["Inventory Service\n(:50054)\n• Stock Allocation\n• Idempotent Kafka Consumer\n• DB: ecommerce_inventory_db"]
    end

    subgraph Kafka_Tier ["Event Streaming Backbone"]
        KAFKA["Apache Kafka (KRaft Mode)\nBroker Port: 9092 / 9094\nTopic: shop.orders.v1"]
        KAFKA_UI["Kafka UI Console\n(Port: 8080)"]
    end

    subgraph DB_Tier ["Persistence Tier (Database-per-Service)"]
        DB_AUTH[("PostgreSQL\necommerce_auth_db")]
        DB_CAT[("PostgreSQL\necommerce_catalog_db")]
        DB_ORD[("PostgreSQL\necommerce_order_db\n(orders + outbox_events)")]
        DB_INV[("PostgreSQL\necommerce_inventory_db\n(stock + inbox_events)")]
    end

    subgraph Session_Tier ["Session & Cache Tier"]
        VALKEY[("Valkey (:6379)\n• Session Store (shop_session JWTs)\n• Catalog Cache")]
    end

    %% Client to Gateway
    Customer -->|"GraphQL"| GW
    Shopkeeper -->|"GraphQL"| GW
    Admin -->|"GraphQL"| GW

    %% Gateway to Services via mTLS gRPC
    GW ==="mTLS gRPC"===> AUTH
    GW ==="mTLS gRPC"===> CATALOG
    GW ==="mTLS gRPC"===> ORDER
    GW ==="mTLS gRPC"===> INVENTORY

    %% Service to Database
    AUTH --> DB_AUTH
    CATALOG --> DB_CAT
    ORDER --> DB_ORD
    INVENTORY --> DB_INV

    %% Sessions & Cache
    AUTH --> VALKEY
    GW --> VALKEY

    %% Event Flow
    DB_ORD -.->|"Outbox Poller Reads"| ORDER
    ORDER -->|"Publishes OrderCreatedEvent"| KAFKA
    KAFKA -->|"Consumes OrderCreatedEvent"| INVENTORY
```

---

## 3. User Roles & Unified Authentication Flow

### 3.1 Three User Personas, Single Login
All users authenticate through the exact same GraphQL mutation:
- **CUSTOMER:** Can browse the product catalog and place new orders.
- **SHOPKEEPER:** Can create products and manage inventory counts for their shop.
- **ADMIN:** Can view system users and inspect platform health.

```graphql
mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) {
    user {
      id
      email
      fullName
      role # "CUSTOMER" | "SHOPKEEPER" | "ADMIN"
      shopId # present if role == SHOPKEEPER
      status # "ACTIVE" | "SUSPENDED"
    }
  }
}
```

> **Session model:** the gateway sets an **HttpOnly `shop_session` cookie** (JWT, 1h) on
> successful `login`/`register`. The GraphQL `AuthPayload` intentionally does **not** expose
> the token — the browser auto-sends the cookie on every subsequent `/graphql` request.

### 3.2 Authentication & Claims Propagation Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Customer / Shopkeeper / Admin)
    participant GW as GraphQL API Gateway
    participant AuthSvc as Auth Service (gRPC)
    participant OrderSvc as Order Service (gRPC)

    User->>GW: POST /graphql { mutation: login(email, password) }
    GW->>AuthSvc: gRPC Authenticate(email, password) [over mTLS]
    AuthSvc-->>GW: User Claims + Signed JWT
    GW-->>User: Set-Cookie: shop_session=<JWT> (HttpOnly) + { user: { id, role } }

    Note over User,GW: Subsequent Authenticated Operation
    User->>GW: POST /graphql { mutation: createOrder(...) } with shop_session cookie
    GW->>AuthSvc: gRPC GetProfile(token) [over mTLS] - resolves user + role
    GW->>OrderSvc: gRPC CreateOrder(...) [over mTLS with metadata: x-user-id, x-user-role]
    OrderSvc-->>GW: OrderCreatedResponse
    GW-->>User: { id, status: "PENDING", ... }
```

---

## 4. Core Implementation Pillar 1: Kafka Transactional Outbox Pattern

### 4.1 The Dual-Write Problem Explained
Consider what happens when a service must save an order and notify Kafka:

```
// ANTI-PATTERN: DO NOT DO THIS
func HandleCreateOrder(order Order) error {
    db.Save(order)            // Step 1: Saves to Postgres
    kafka.Publish(orderEvent) // Step 2: Publishes to Kafka
}
```
- **If Step 1 succeeds but Kafka is down in Step 2:** The order is stored in the database, but no other service ever hears about it. Stock is never reserved!
- **If Step 2 is executed before Step 1, but the DB rollback occurs:** Kafka emitted an event for an order that does not exist in the database!

### 4.2 The Solution: The Outbox Pattern
Both the business entity (`orders`) and the event (`outbox_events`) are saved **within the exact same local PostgreSQL database transaction**.

```mermaid
sequenceDiagram
    autonumber
    participant Client as API Gateway
    participant Svc as Order Service
    participant DB as PostgreSQL (ecommerce_order_db)
    participant Poller as Outbox Poller Worker
    participant Kafka as Kafka (shop.orders.v1)
    participant Inv as Inventory Service

    Client->>Svc: gRPC CreateOrder()
    Note over Svc,DB: Atomic Database Transaction
    Svc->>DB: BEGIN TRANSACTION
    Svc->>DB: INSERT INTO orders (...)
    Svc->>DB: INSERT INTO outbox_events (event_type='OrderCreated', status='PENDING', payload=...)
    Svc->>DB: COMMIT TRANSACTION
    Svc-->>Client: Success (Order Created)

    Note over Poller,Kafka: Asynchronous Reliable Publishing
    loop Every 500ms
        Poller->>DB: SELECT * FROM outbox_events WHERE status = 'PENDING' FOR UPDATE SKIP LOCKED
        Poller->>Kafka: Publish to 'shop.orders.v1' (Key = order_id)
        Poller->>DB: UPDATE outbox_events SET status = 'PUBLISHED'
    end

    Note over Kafka,Inv: Idempotent Event Consumption
    Kafka->>Inv: Deliver OrderCreatedEvent
    Inv->>Inv: Check if event_id already in inbox_events
    Inv->>Inv: If NOT present: Deduct stock & INSERT into inbox_events
```

### 4.3 Outbox Table & Poller Design

#### `ecommerce_order_db` Schema for Outbox
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    total_amount_cents BIGINT NOT NULL,
    status VARCHAR(32) DEFAULT 'PENDING' NOT NULL,
    shipping_address TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    shop_id UUID NOT NULL,
    quantity INT NOT NULL,
    unit_price_cents BIGINT NOT NULL
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(64) NOT NULL,       -- 'ORDER'
    aggregate_id VARCHAR(64) NOT NULL,         -- order_id
    event_type VARCHAR(64) NOT NULL,           -- 'OrderCreated'
    topic VARCHAR(128) NOT NULL,               -- 'shop.orders.v1'
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' NOT NULL, -- 'PENDING', 'PUBLISHED', 'FAILED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at) WHERE status = 'PENDING';
```

#### Polling Publisher Worker Logic
The Outbox Publisher runs as a background loop inside the Order Service. Using `FOR UPDATE SKIP LOCKED` allows safe, concurrent polling without lock conflicts:

```go
// Background Outbox Poller Routine (Order Service)
func (p *OutboxPoller) PollAndPublish(ctx context.Context) error {
    tx, err := p.db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // 1. Fetch up to 20 pending events (skip rows locked by other instances)
    query := `
        WITH selected AS (
            SELECT id FROM outbox_events
            WHERE status = 'PENDING'
            ORDER BY created_at ASC
            LIMIT 20
            FOR UPDATE SKIP LOCKED
        )
        UPDATE outbox_events
        SET status = 'PROCESSING'
        FROM selected
        WHERE outbox_events.id = selected.id
        RETURNING outbox_events.id, aggregate_id, topic, event_type, payload;
    `
    rows, err := tx.QueryContext(ctx, query)
    if err != nil {
        return err
    }
    defer rows.Close()

    var publishedIDs []string
    for rows.Next() {
        var id, aggID, topic, eventType string
        var payload []byte
        if err := rows.Scan(&id, &aggID, &topic, &eventType, &payload); err != nil {
            return err
        }

        // 2. Publish to Kafka
        err := p.kafkaWriter.WriteMessages(ctx, kafka.Message{
            Topic: topic,
            Key:   []byte(aggID), // Partition by order_id
            Value: payload,
            Headers: []kafka.Header{
                {Key: "event_id", Value: []byte(id)},
                {Key: "event_type", Value: []byte(eventType)},
            },
        })

        if err != nil {
            log.Printf("Kafka unavailable for event %s: %v", id, err)
            // Leave as PROCESSING or reset to PENDING; will retry on next poll
            continue
        }
        publishedIDs = append(publishedIDs, id)
    }

    // 3. Mark successfully sent events as PUBLISHED
    if len(publishedIDs) > 0 {
        _, err = tx.ExecContext(ctx, `
            UPDATE outbox_events 
            SET status = 'PUBLISHED', published_at = NOW() 
            WHERE id = ANY($1)`, publishedIDs)
        if err != nil {
            return err
        }
    }

    return tx.Commit()
}
```

### 4.4 Idempotent Consumer in the Inventory Service
Kafka provides **at-least-once delivery**. A consumer crash or network timeout during an offset commit means the consumer may receive the exact same `OrderCreated` event twice.

To prevent double-deducting stock, the Inventory Service uses an `inbox_events` table:

```sql
-- In ecommerce_inventory_db
CREATE TABLE inbox_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

#### Consumer Idempotency Execution:
```go
// Inventory Service Kafka Consumer
func ProcessOrderCreated(ctx context.Context, db *sql.DB, eventID string, items []OrderItem) error {
    tx, err := db.BeginTx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // 1. Attempt to insert event_id into inbox_events
    res, err := tx.ExecContext(ctx, `
        INSERT INTO inbox_events (event_id, event_type)
        VALUES ($1, 'OrderCreated')
        ON CONFLICT (event_id) DO NOTHING;
    `, eventID)
    if err != nil {
        return err
    }

    rowsAffected, _ := res.RowsAffected()
    if rowsAffected == 0 {
        // Event was ALREADY processed! Acknowledge and skip safely.
        log.Printf("Duplicate event %s detected. Skipping stock deduction.", eventID)
        return tx.Commit()
    }

    // 2. Perform business logic: deduct available stock
    for _, item := range items {
        _, err := tx.ExecContext(ctx, `
            UPDATE product_inventory
            SET available_stock = available_stock - $1
            WHERE product_id = $2 AND available_stock >= $1;
        `, item.Quantity, item.ProductID)
        if err != nil {
            return err
        }
    }

    return tx.Commit()
}
```

---

## 5. Core Implementation Pillar 2: Secure Internal gRPC with mTLS

### 5.1 Mutual TLS (mTLS) Security Model
In standard TLS (HTTPS), only the server presents a certificate. With **Mutual TLS (mTLS)**:
1. The server presents its certificate to prove its identity to the client.
2. The client presents its certificate to prove its identity to the server.
3. Both certificates must be signed by the same trusted internal Root CA.
4. Connections from callers without a valid certificate are rejected immediately at the TLS handshake.

```mermaid
sequenceDiagram
    autonumber
    participant Client as API Gateway (Client)
    participant Server as Order Service (:50053)
    participant CA as Internal Root CA

    Note over Client,Server: Step 1: Client initiates TLS connection
    Client->>Server: ClientHello (Supported Ciphers)
    Server->>Client: ServerHello + Server Certificate (signed by Root CA)
    Server->>Client: CertificateRequest (Mandates Client Certificate)

    Note over Client: Step 2: Client verifies Server Certificate against ca.crt
    Client->>Server: Client Certificate (signed by Root CA) + Handshake Finished

    Note over Server: Step 3: Server verifies Client Certificate against ca.crt
    alt Valid Certificate Signed by Root CA
        Server-->>Client: Handshake Complete
        Note over Client,Server: Step 4: Encrypted gRPC Calls Allowed
        Client->>Server: gRPC CreateOrder()
        Server-->>Client: gRPC CreateOrderResponse
    else Untrusted or Missing Certificate
        Server--xClient: TLS Alert: Bad Certificate / Handshake Aborted
        Note over Client: Request Fails with gRPC StatusCode: UNAVAILABLE (14)
    end
```

### 5.2 Certificate Generation Script (`scripts/generate-certs.sh`)

The canonical script is `scripts/generate-certs.sh` (Windows: `scripts/generate-certs.ps1`).
It creates an internal Root CA and issues certificates with Subject Alternative Names
(SANs) for every service in the gRPC mesh:

| Certificate            | SAN extension                                         | Used by                 |
| ---------------------- | ----------------------------------------------------- | ----------------------- |
| `ca.crt` / `ca.key`    | `DNS:localhost`, `IP:127.0.0.1`                        | every peer's trust anchor |
| `auth-service`         | `DNS:auth-service,DNS:localhost,IP:127.0.0.1`          | auth-service            |
| `catalog-service`      | `DNS:catalog-service,DNS:localhost,IP:127.0.0.1`       | catalog-service         |
| `order-service`        | `DNS:order-service,DNS:localhost,IP:127.0.0.1`         | order-service           |
| `inventory-service`    | `DNS:inventory-service,DNS:localhost,IP:127.0.0.1`     | inventory-service       |
| `notification-service` | `DNS:notification-service,DNS:localhost,IP:127.0.0.1`  | notification-service    |
| `api-gateway`          | `DNS:api-gateway,DNS:localhost,IP:127.0.0.1`           | api-gateway             |
| `untrusted`            | self-signed, `CN=untrusted-client`                     | negative mTLS test case |

Usage:

```bash
./scripts/generate-certs.sh            # create only what is missing
./scripts/generate-certs.sh --force    # discard everything and re-issue
```

Behaviour worth knowing:

- **The output directory is resolved from the script's own location**, so the script can be
  invoked from any working directory and always writes to `<repo>/infra/certs`.
- **The script is idempotent.** An existing Root CA and existing service certificates are
  reused. Re-running it never rotates the CA, so it cannot invalidate certificates that the
  rest of the team already trusts. Only `--force` re-issues the CA, and that is intentional
  because every peer must then trust the new CA.
- **A missing service certificate is re-issued individually** against the existing CA, so a
  single deleted file can be repaired without touching the others.

### 5.3 Enforcing mTLS on gRPC Servers (Go Example)
```go
package main

import (
	"crypto/tls"
	"crypto/x509"
	"log"
	"net"
	"os"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

func main() {
	// 1. Load server's own certificate and key
	serverCert, err := tls.LoadX509KeyPair("/certs/order-service.crt", "/certs/order-service.key")
	if err != nil {
		log.Fatalf("Failed to load server cert: %v", err)
	}

	// 2. Load Root CA to verify client certificates
	caBytes, err := os.ReadFile("/certs/ca.crt")
	if err != nil {
		log.Fatalf("Failed to load Root CA: %v", err)
	}
	caPool := x509.NewCertPool()
	caPool.AppendCertsFromPEM(caBytes)

	// 3. Configure TLS with RequireAndVerifyClientCert
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{serverCert},
		ClientAuth:   tls.RequireAndVerifyClientCert, // ENFORCES mTLS
		ClientCAs:    caPool,
		MinVersion:   tls.VersionTLS13,
	}

	grpcServer := grpc.NewServer(grpc.Creds(credentials.NewTLS(tlsConfig)))
	// Register OrderServiceServer...

	lis, _ := net.Listen("tcp", ":50053")
	log.Println("Secure Order Service running with mTLS on :50053")
	grpcServer.Serve(lis)
}
```

### 5.4 Configuring mTLS on gRPC Clients (Node.js Gateway Example)
```typescript
// apps/api-gateway/src/grpc/order-client.service.ts (illustrative example; the real gateway wires gRPC via ClientGrpc)
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as fs from 'fs';

// 1. Load mTLS credentials
const rootCert = fs.readFileSync('/certs/ca.crt');
const clientKey = fs.readFileSync('/certs/api-gateway.key');
const clientCert = fs.readFileSync('/certs/api-gateway.crt');

// 2. Create SSL Channel Credentials (both CA and client cert)
const sslCredentials = grpc.credentials.createSsl(
  rootCert,
  clientKey,
  clientCert
);

// 3. Load Protobuf definition and connect
const packageDef = protoLoader.loadSync('/proto/order.proto');
const proto = grpc.loadPackageDefinition(packageDef) as any;

export const orderClient = new proto.shop.order.v1.OrderService(
  'order-service:50053',
  sslCredentials,
  {
    'grpc.ssl_target_name_override': 'order-service',
    'grpc.default_authority': 'order-service'
  }
);
```

---

## 6. Service Contracts & Communication

### 6.1 Protobuf Service Definitions

#### `proto/auth.proto`
```protobuf
syntax = "proto3";
package shop.auth.v1;
option go_package = "github.com/platform/gen/authv1";

service AuthService {
  rpc Authenticate (AuthRequest) returns (AuthResponse);
  rpc ValidateToken (ValidateTokenRequest) returns (ValidateTokenResponse);
  rpc Register (RegisterRequest) returns (AuthResponse);
  rpc GetProfile (ValidateTokenRequest) returns (UserProfile);
  rpc UpdateProfile (UpdateProfileRequest) returns (UserProfile);
  rpc AdminUsers (AdminUsersRequest) returns (AdminUsersResponse);
  rpc AdminUser (AdminUserRequest) returns (UserProfile);
  rpc AdminSetStatus (AdminStatusRequest) returns (UserProfile);
  rpc AdminOverview (ValidateTokenRequest) returns (AdminOverviewResponse);
  rpc AdminActivity (AdminActivityRequest) returns (AdminActivityResponse);
  rpc AdminCreateSeller (AdminCreateSellerRequest) returns (AdminCreateSellerResponse);
  rpc AdminShop (AdminUserRequest) returns (AdminShopResponse);
  rpc AdminHealth (ValidateTokenRequest) returns (AdminHealthResponse);
  rpc Logout (ValidateTokenRequest) returns (LogoutResponse);
}

message AuthRequest {
  string email = 1;
  string password = 2;
}

message AuthResponse {
  UserProfile user = 5;
  string access_token = 1;
  string user_id = 2;
  string role = 3; // CUSTOMER, SHOPKEEPER, ADMIN
  string shop_id = 4;
}

message ValidateTokenRequest {
  string token = 1;
}

message ValidateTokenResponse {
  bool is_valid = 1;
  string user_id = 2;
  string role = 3;
  string shop_id = 4;
}

// Additive extensions (admin workspace, seller & shop management): see proto/auth.proto.
message RegisterRequest { string email = 1; string password = 2; string full_name = 3; }
message UserProfile { string id = 1; string email = 2; string full_name = 3; string role = 4; string shop_id = 5; string status = 6; }
message UpdateProfileRequest { string token = 1; string full_name = 2; }
message LogoutResponse { bool success = 1; }

message AdminUsersRequest { string token = 1; string search = 2; string role = 3; string status = 4; int32 page = 5; int32 limit = 6; }
message AdminUsersResponse { repeated UserProfile users = 1; int32 total = 2; int32 page = 3; int32 limit = 4; }
message AdminUserRequest { string token = 1; string id = 2; }
message AdminStatusRequest { string token = 1; string id = 2; string status = 3; string reason = 4; string expected_status = 5; }
message AdminOverviewResponse { int32 customers = 1; int32 sellers = 2; int32 admins = 3; int32 suspended = 4; }
message AdminActivityRequest { string token = 1; int32 page = 2; int32 limit = 3; }
message AdminAuditEvent { string id = 1; string actor_id = 2; string actor_name = 3; string target_id = 4; string target_email = 5; string action = 6; string reason = 7; string previous_status = 8; string new_status = 9; string created_at = 10; }
message AdminActivityResponse { repeated AdminAuditEvent events = 1; int32 total = 2; int32 page = 3; int32 limit = 4; }
message AdminHealthResponse { string checked_at = 1; bool database = 2; bool sessions = 3; }
message AdminCreateSellerRequest { string token = 1; string email = 2; string password = 3; string full_name = 4; string shop_name = 5; string description = 6; }
message AdminShopResponse { string id = 1; string owner_id = 2; string name = 3; string description = 4; string created_at = 5; }
message AdminCreateSellerResponse { UserProfile user = 1; AdminShopResponse shop = 2; }
```

#### `proto/catalog.proto`
```protobuf
syntax = "proto3";
package shop.catalog.v1;
option go_package = "github.com/platform/gen/catalogv1";

service CatalogService {
  rpc CreateProduct (CreateProductRequest) returns (ProductResponse);
  rpc ListProducts (ListProductsRequest) returns (ListProductsResponse);
  rpc GetProduct (GetProductRequest) returns (ProductResponse);
}

message CreateProductRequest {
  string shop_id = 1;
  string name = 2;
  string description = 3;
  int64 price_cents = 4;
  int32 initial_stock = 5;
}

message ProductResponse {
  string id = 1;
  string shop_id = 2;
  string name = 3;
  string description = 4;
  int64 price_cents = 5;
  int32 available_stock = 6;
}

message ListProductsRequest {
  int32 page = 1;
  int32 limit = 2;
}

message ListProductsResponse {
  repeated ProductResponse products = 1;
}

message GetProductRequest {
  string product_id = 1;
}
```

#### `proto/order.proto`
```protobuf
syntax = "proto3";
package shop.order.v1;
option go_package = "github.com/platform/gen/orderv1";

service OrderService {
  rpc CreateOrder (CreateOrderRequest) returns (OrderResponse);
  rpc GetOrder (GetOrderRequest) returns (OrderResponse);
}

message OrderItem {
  string product_id = 1;
  string shop_id = 2;
  int32 quantity = 3;
  int64 unit_price_cents = 4;
}

message CreateOrderRequest {
  string customer_id = 1;
  repeated OrderItem items = 2;
  string shipping_address = 3;
}

message OrderResponse {
  string order_id = 1;
  string customer_id = 2;
  string status = 3; // PENDING, CONFIRMED, CANCELLED
  int64 total_amount_cents = 4;
  int64 created_at = 5;
}

message GetOrderRequest {
  string order_id = 1;
}
```

#### `proto/inventory.proto`
```protobuf
syntax = "proto3";
package shop.inventory.v1;
option go_package = "github.com/platform/gen/inventoryv1";

service InventoryService {
  rpc GetStock (GetStockRequest) returns (StockResponse);
  rpc UpdateStock (UpdateStockRequest) returns (StockResponse);
}

message GetStockRequest {
  string product_id = 1;
}

message StockResponse {
  string product_id = 1;
  int32 available_stock = 2;
}

message UpdateStockRequest {
  string product_id = 1;
  int32 delta = 2; // e.g. +10 or -5
}
```

### 6.2 GraphQL Gateway Schema (resolver-owned SDL)

The gateway builds its SDL at runtime from resolver-owned typeDefs strings — see
`apps/api-gateway/src/app.module.ts` (`typeDefs: [authTypeDefs, orderTypeDefs, commerceTypeDefs]`):

- `resolvers/auth.resolver.ts` → `authTypeDefs` (accounts, sessions, admin workspace incl. seller & shop management)
- `resolvers/order.resolver.ts` → `orderTypeDefs` (orders)
- `resolvers/commerce.types.ts` → `commerceTypeDefs` (catalog product & stock queries)

`apps/api-gateway/src/graphql/schema.graphql` is **not loaded at runtime** — it only points to
the authoritative typeDefs above. Sessions use an HttpOnly `shop_session` cookie, so there is
no `accessToken` field.

**Operations available today:**

```graphql
type User {
  id: ID!
  email: String!
  fullName: String!
  role: String!          # "CUSTOMER" | "SHOPKEEPER" | "ADMIN"
  shopId: String         # present if role == SHOPKEEPER
  status: String!        # "ACTIVE" | "SUSPENDED"
}

type AuthPayload { user: User! }
type AdminShop { id: ID!, ownerId: ID!, name: String!, description: String!, createdAt: String! }
type AdminSellerPayload { user: User!, shop: AdminShop! }
type AdminUserPage { users: [User!]!, total: Int!, page: Int!, limit: Int! }
type AdminOverview { customers: Int!, sellers: Int!, admins: Int!, suspended: Int! }
type AdminEvent {
  id: ID!
  actorId: ID!
  actorName: String!
  targetId: ID!
  targetEmail: String!
  action: String!
  reason: String!
  previousStatus: String!
  newStatus: String!
  createdAt: String!
}
type AdminActivityPage { events: [AdminEvent!]!, total: Int!, page: Int!, limit: Int! }
type AdminHealth { checkedAt: String!, database: Boolean!, sessions: Boolean! }

type Product { id: ID!, shopId: ID!, name: String!, description: String!, priceCents: Int!, availableStock: Int! }

type Order {
  id: ID!
  customerId: ID!
  status: String!
  totalAmountCents: Int!
  createdAt: String!
}

input OrderItemInput {
  productId: ID!
  shopId: ID!
  quantity: Int!
  unitPriceCents: Int!
}

type Query {
  me: User!
  adminUsers(search: String, role: String, status: String, page: Int, limit: Int): AdminUserPage!
  adminUser(id: ID!): User!
  adminOverview: AdminOverview!
  adminActivity(page: Int, limit: Int): AdminActivityPage!
  adminShop(id: ID!): AdminShop!
  adminHealth: AdminHealth!
  order(id: ID!): Order
  products(page: Int = 1, limit: Int = 50): [Product!]!
  product(id: ID!): Product!
  stock(productId: ID!): Int!
}

type Mutation {
  register(email: String!, password: String!, fullName: String!): AuthPayload!
  login(email: String!, password: String!): AuthPayload!
  updateProfile(fullName: String!): User!
  adminSetAccountStatus(id: ID!, status: String!, expectedStatus: String!, reason: String!): User!
  adminCreateSeller(email: String!, password: String!, fullName: String!, shopName: String!, description: String!): AdminSellerPayload!
  logout: Boolean!
  createOrder(items: [OrderItemInput!]!, shippingAddress: String!): Order!
}
```

**Still pending:** the `createProduct` mutation (shopkeeper product creation via
`CatalogService.CreateProduct`) — tracked in `TASKS.md`.

---

## 7. Concrete Database Schemas & Seed Data

### 7.1 Database DDL per Service

#### `ecommerce_auth_db`
```sql
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL, -- 'ADMIN', 'SHOPKEEPER', 'CUSTOMER'
    full_name VARCHAR(128) NOT NULL,
    shop_id UUID NULL
);

-- Additive upgrade for existing Auth users. No roles, passwords or rows are replaced.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_name VARCHAR(128) NOT NULL,
  target_id UUID NOT NULL,
  target_email VARCHAR(255) NOT NULL,
  action VARCHAR(48) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  previous_status VARCHAR(16) NOT NULL,
  new_status VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS users_role_status_id_idx ON users(role, status, id);
CREATE INDEX IF NOT EXISTS admin_audit_created_id_idx ON admin_audit_events(created_at DESC, id);
```

#### `ecommerce_catalog_db`
```sql
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### `ecommerce_inventory_db`
```sql
CREATE TABLE IF NOT EXISTS product_inventory (
    product_id UUID PRIMARY KEY,
    available_stock INT NOT NULL CHECK (available_stock >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inbox_events (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

#### `ecommerce_order_db`
*(Contains `orders`, `order_items`, and `outbox_events` as specified in Section 4.3).*

### 7.2 Initial Seed Data (`infra/postgres/schema-init.sql`)
```sql
-- Seed 3 Users in ecommerce_auth_db (Password: 'Password123', bcrypt cost 12)
\c ecommerce_auth_db;
INSERT INTO users (id, email, password_hash, role, full_name, shop_id) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@shopping.com', '$2a$12$180.JGq7G31G9VZNMrB6sewBP197DUWsMxpCpwSgLqCLqgtTz9cia', 'ADMIN', 'Platform Admin', NULL),
('b0000000-0000-0000-0000-000000000002', 'shopkeeper@gadgets.com', '$2a$12$180.JGq7G31G9VZNMrB6sewBP197DUWsMxpCpwSgLqCLqgtTz9cia', 'SHOPKEEPER', 'John Merchant', 'd0000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000003', 'customer@gmail.com', '$2a$12$180.JGq7G31G9VZNMrB6sewBP197DUWsMxpCpwSgLqCLqgtTz9cia', 'CUSTOMER', 'Alice Consumer', NULL)
ON CONFLICT (email) DO NOTHING;

-- Seed Initial Product in ecommerce_catalog_db
\c ecommerce_catalog_db;
INSERT INTO products (id, shop_id, name, description, price_cents) VALUES
('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Mechanical Keyboard', 'RGB Hot-swappable Mechanical Keyboard', 8900)
ON CONFLICT (id) DO NOTHING;

-- Seed Initial Inventory in ecommerce_inventory_db
\c ecommerce_inventory_db;
INSERT INTO product_inventory (product_id, available_stock) VALUES
('e0000000-0000-0000-0000-000000000001', 50)
ON CONFLICT (product_id) DO NOTHING;
```

---

## 8. Docker Infrastructure & Compose Setup

The entire distributed system runs locally with **Docker Compose** (authoritative file: `docker-compose.yml` at the repo root — the excerpt below mirrors it):
- **PostgreSQL 16:** Custom image built from `infra/postgres/` that embeds `init-multi-db.sh` + `schema-init.sql` to auto-create `ecommerce_auth_db`, `ecommerce_catalog_db`, `ecommerce_order_db`, and `ecommerce_inventory_db`. The admin user/password come from `.env` (`POSTGRES_USER` defaults to `ecommerce_admin`).
- **Valkey 8:** Session store (`shop_session` JWTs) and catalog cache used by the Auth service and API Gateway.
- **Kafka in KRaft Mode:** `apache/kafka:3.7.0` — no ZooKeeper container required.
- **Kafka UI:** Accessible on port `8080` (override with `KAFKA_UI_PORT`) to inspect topics and consumer offsets.

```yaml
networks:
  platform-net:
    driver: bridge

volumes:
  pg_data:
  kafka_data:
  valkey_data:

services:
  # =========================================================================
  # 1. POSTGRESQL 16 (Multi-Database Setup: auth, catalog, order, inventory)
  # =========================================================================
  postgres:
    build:
      context: ./infra/postgres
    image: ecommerce-postgres:16
    container_name: shop-postgres
    restart: no
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-ecommerce_admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_MULTIPLE_DATABASES: ${POSTGRES_MULTIPLE_DATABASES:-ecommerce_auth_db,ecommerce_catalog_db,ecommerce_order_db,ecommerce_inventory_db}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data
    networks:
      - platform-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-ecommerce_admin}"]
      interval: 5s
      timeout: 5s
      retries: 5

  # =========================================================================
  # 2. VALKEY 8 (In-Memory Key-Value Store for Sessions & Caching)
  # =========================================================================
  valkey:
    build:
      context: ./infra/valkey
    image: ecommerce-valkey:8
    container_name: shop-valkey
    restart: no
    ports:
      - "${VALKEY_PORT:-6379}:6379"
    volumes:
      - valkey_data:/data
    networks:
      - platform-net
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # =========================================================================
  # 3. APACHE KAFKA (KRAFT MODE - NO ZOOKEEPER REQUIRED)
  # =========================================================================
  kafka:
    image: apache/kafka:3.7.0
    container_name: shop-kafka
    restart: no
    ports:
      - "9092:9092"   # Internal Docker Network
      - "9094:9094"   # Host machine development port
    environment:
      - KAFKA_BROKER_ID=1
      - KAFKA_PROCESS_ROLES=broker,controller
      - KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka:9093
      - KAFKA_CLUSTER_ID=${KAFKA_CLUSTER_ID:-MkU3OEVBNTcwNTJENDM2Qk}
      - KAFKA_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093,EXTERNAL://:9094
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092,EXTERNAL://localhost:9094
      - KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,EXTERNAL:PLAINTEXT
      - KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER
      - KAFKA_INTER_BROKER_LISTENER_NAME=PLAINTEXT
      - KAFKA_AUTO_CREATE_TOPICS_ENABLE=true
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1
      - KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1
      - KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1
      - KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0
    volumes:
      - kafka_data:/tmp/kraft-combined-logs
    networks:
      - platform-net
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list || exit 0"]
      interval: 10s
      timeout: 5s
      retries: 5

  # =========================================================================
  # 4. KAFKA UI (Visual Inspection Console)
  # =========================================================================
  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: shop-kafka-ui
    ports:
      - "${KAFKA_UI_PORT:-8080}:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: local-kraft
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: ${KAFKA_BROKER_INTERNAL:-kafka:9092}
    depends_on:
      kafka:
        condition: service_healthy
    networks:
      - platform-net

  # =========================================================================
  # 5. MICROSERVICES (NestJS services with mTLS mounting ./infra/certs)
  # =========================================================================
  auth-service:
    build:
      context: .
      dockerfile: ./apps/auth-service/Dockerfile
    container_name: shop-auth-service
    ports:
      - "${AUTH_SERVICE_PORT:-50051}:50051"
    volumes:
      - ./infra/certs:/certs:ro
    environment:
      PORT: 50051
      DATABASE_URL: ${AUTH_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ecommerce_auth_db?sslmode=disable}
      VALKEY_HOST: ${VALKEY_HOST:-valkey}
      VALKEY_PORT: ${VALKEY_PORT:-6379}
      JWT_SECRET: ${JWT_SECRET}
      TLS_CERT_PATH: /certs/auth-service.crt
      TLS_KEY_PATH: /certs/auth-service.key
      TLS_CA_PATH: /certs/ca.crt
    depends_on:
      postgres:
        condition: service_healthy
      valkey:
        condition: service_healthy
    networks:
      - platform-net

  catalog-service:
    build:
      context: .
      dockerfile: ./apps/catalog-service/Dockerfile
    container_name: shop-catalog-service
    ports:
      - "${CATALOG_SERVICE_PORT:-50052}:50052"
    volumes:
      - ./infra/certs:/certs:ro
    environment:
      PORT: 50052
      DATABASE_URL: ${CATALOG_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ecommerce_catalog_db?sslmode=disable}
      VALKEY_HOST: ${VALKEY_HOST:-valkey}
      VALKEY_PORT: ${VALKEY_PORT:-6379}
      TLS_CERT_PATH: /certs/catalog-service.crt
      TLS_KEY_PATH: /certs/catalog-service.key
      TLS_CA_PATH: /certs/ca.crt
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - platform-net

  order-service:
    build:
      context: .
      dockerfile: ./apps/order-service/Dockerfile
    container_name: shop-order-service
    ports:
      - "${ORDER_SERVICE_PORT:-50053}:50053"
    volumes:
      - ./infra/certs:/certs:ro
    environment:
      PORT: 50053
      DATABASE_URL: ${ORDER_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ecommerce_order_db?sslmode=disable}
      KAFKA_BROKERS: ${KAFKA_BROKER_INTERNAL:-kafka:9092}
      TLS_CERT_PATH: /certs/order-service.crt
      TLS_KEY_PATH: /certs/order-service.key
      TLS_CA_PATH: /certs/ca.crt
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_healthy
    networks:
      - platform-net

  inventory-service:
    build:
      context: .
      dockerfile: ./apps/inventory-service/Dockerfile
    container_name: shop-inventory-service
    ports:
      - "${INVENTORY_SERVICE_PORT:-50054}:50054"
    volumes:
      - ./infra/certs:/certs:ro
    environment:
      PORT: 50054
      DATABASE_URL: ${INVENTORY_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/ecommerce_inventory_db?sslmode=disable}
      KAFKA_BROKERS: ${KAFKA_BROKER_INTERNAL:-kafka:9092}
      TLS_CERT_PATH: /certs/inventory-service.crt
      TLS_KEY_PATH: /certs/inventory-service.key
      TLS_CA_PATH: /certs/ca.crt
    depends_on:
      postgres:
        condition: service_healthy
      kafka:
        condition: service_healthy
    networks:
      - platform-net

  # =========================================================================
  # 6. GRAPHQL API GATEWAY (NestJS GraphQL on :4000)
  # =========================================================================
  api-gateway:
    build:
      context: .
      dockerfile: ./apps/api-gateway/Dockerfile
    container_name: shop-api-gateway
    ports:
      - "${API_GATEWAY_PORT:-4000}:4000"
    volumes:
      - ./infra/certs:/certs:ro
    environment:
      PORT: 4000
      VALKEY_HOST: ${VALKEY_HOST:-valkey}
      VALKEY_PORT: ${VALKEY_PORT:-6379}
      AUTH_SERVICE_ADDR: ${AUTH_SERVICE_ADDR:-auth-service:50051}
      CATALOG_SERVICE_ADDR: ${CATALOG_SERVICE_ADDR:-catalog-service:50052}
      ORDER_SERVICE_ADDR: ${ORDER_SERVICE_ADDR:-order-service:50053}
      INVENTORY_SERVICE_ADDR: ${INVENTORY_SERVICE_ADDR:-inventory-service:50054}
      TLS_CERT_PATH: /certs/api-gateway.crt
      TLS_KEY_PATH: /certs/api-gateway.key
      TLS_CA_PATH: /certs/ca.crt
    depends_on:
      - auth-service
      - catalog-service
      - order-service
      - inventory-service
      - valkey
    networks:
      - platform-net
```

#### Multi-Database Init Script (`infra/postgres/init-multi-db.sh`)
```bash
#!/bin/bash
set -e
set -u

function create_database() {
    local database=$1
    echo "  Creating database '$database'..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        SELECT 'CREATE DATABASE $database'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database')\gexec
        GRANT ALL PRIVILEGES ON DATABASE $database TO $POSTGRES_USER;
EOSQL
}

if [ -n "${POSTGRES_MULTIPLE_DATABASES:-}" ]; then
    echo "Creating PostgreSQL databases: $POSTGRES_MULTIPLE_DATABASES"
    for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
        create_database "$db"
    done
fi
```

---

## 9. Phased Implementation Roadmap

```mermaid
gantt
    title Developer Training Project Schedule (5 Phases)
    dateFormat  X
    axisFormat  Day %d
    section Phase 1: Infra & PKI
    Docker Compose (Kafka KRaft + Postgres) :0, 2
    Generate mTLS Certificates              :1, 2
    section Phase 2: Secure gRPC
    Build Protobuf Definitions              :2, 3
    Implement mTLS gRPC Server & Client     :3, 4
    Verify Connection Rejection Tests       :4, 5
    section Phase 3: Core Services
    Auth & Catalog Implementation           :5, 7
    GraphQL API Gateway                     :6, 8
    section Phase 4: Outbox Pattern
    Order Service DB + Atomic Outbox Table  :8, 10
    Implement Outbox Poller Routine         :9, 11
    section Phase 5: Event Consumer
    Inventory Consumer with Idempotency     :11, 13
    End-to-End Failure Lab Demonstrations   :12, 14
```

### Phase 1: Local Infrastructure & Certificate Setup
- [ ] Write `infra/postgres/init-multi-db.sh` and `infra/postgres/schema-init.sql`.
- [ ] Run `scripts/generate-certs.sh` to generate the internal Root CA and service certificates.
- [ ] Start Kafka (KRaft), PostgreSQL, and Kafka UI via `docker compose up -d postgres kafka kafka-ui`.
- [ ] Verify databases in PostgreSQL CLI and open Kafka UI at `http://127.0.0.1:8080`.

### Phase 2: Protobuf Contracts & mTLS Service Communication
- [ ] Compile `.proto` files to Go / TypeScript bindings.
- [ ] Build a skeleton gRPC server with `tls.RequireAndVerifyClientCert`.
- [ ] Build a client that connects with `api-gateway.crt` and succeeds.
- [ ] Build a test client that attempts connection without a certificate and verify it gets rejected (`Unavailable / Code 14`).

### Phase 3: Domain Services & GraphQL Gateway
- [ ] Implement Auth Service: Verify credentials, issue JWT with roles (`CUSTOMER`, `SHOPKEEPER`, `ADMIN`).
- [ ] Implement Catalog Service: Store products, fetch catalog.
- [ ] Implement GraphQL Gateway: Translate `/graphql` queries and mutations to internal gRPC calls over mTLS.

### Phase 4: Order Service & Transactional Outbox Pattern
- [ ] Implement `CreateOrder`: Inside one SQL transaction, write to `orders` and `outbox_events`.
- [ ] Implement background Outbox Poller loop using `SELECT ... FOR UPDATE SKIP LOCKED`.
- [ ] Publish `OrderCreated` events to Kafka topic `shop.orders.v1`.
- [ ] Mark published events as `PUBLISHED` in the database.

### Phase 5: Idempotent Inventory Consumer & Verification
- [ ] Implement Kafka consumer in Inventory Service listening to `shop.orders.v1`.
- [ ] Implement atomic insertion into `inbox_events` (`ON CONFLICT DO NOTHING`).
- [ ] Deduct `available_stock` when the event is new.
- [ ] Skip stock deduction safely if the event is a duplicate.
- [ ] Execute the 4 Mandatory Test Scenarios.

---

## 10. Mandatory Test Scenarios & Demonstration Labs

To successfully complete the project, developers must demonstrate the following **4 failure and recovery scenarios**:

### Lab 1: Atomic Database Transaction & Abort Test
*Objective: Prove that if an order fails to save, no outbox event is ever written.*
1. Send a `createOrder` request with an invalid payload (e.g., negative price or missing customer).
2. The database transaction rolls back.
3. Query `outbox_events`:
   ```bash
   docker exec -it shop-postgres psql -U ecommerce_admin -d ecommerce_order_db -c "SELECT COUNT(*) FROM outbox_events;"
   ```
4. **Pass Criteria:** Outbox event count remains unchanged (zero phantom events).

### Lab 2: Kafka Outage Resiliency Test
*Objective: Prove that temporary Kafka downtime does not lose committed orders.*
1. Stop the Kafka container:
   ```bash
   docker compose stop kafka
   ```
2. Place a valid order via GraphQL `createOrder`.
3. The API call succeeds! Inspect `ecommerce_order_db`: The order is saved and the outbox event is marked `PENDING`.
4. Restart Kafka:
   ```bash
   docker compose start kafka
   ```
5. Watch the Order Service logs: The Outbox Poller reconnects and flushes pending events.
6. Open Kafka UI (`http://127.0.0.1:8080`): The event appears on `shop.orders.v1`.
7. **Pass Criteria:** Order data is preserved and event is published with zero manual intervention.

### Lab 3: Duplicate Event Delivery & Idempotency Test
*Objective: Prove that processing the same event twice does not double-deduct stock.*
1. Note the current stock of product `e0000000-0000-0000-0000-000000000001` (e.g., 50 units).
2. Publish an `OrderCreated` event to Kafka with quantity = 2.
3. Verify stock drops to 48.
4. Intentionally re-publish the **exact same event payload** (same `event_id`) to Kafka.
5. Watch Inventory Service logs: Output should log `Duplicate event <id> detected. Skipping stock deduction.`
6. Verify stock remains at 48.
7. **Pass Criteria:** `available_stock` is only deducted once.

### Lab 4: Zero-Trust mTLS Authentication Test
*Objective: Prove that unauthorized callers are rejected at the TLS boundary.*
1. Make a gRPC request from the API Gateway using `api-gateway.crt` (signed by Root CA).
   - **Result:** Connection accepted; request succeeds.
2. Make a gRPC request using the self-signed `untrusted.crt`:
   - **Result:** gRPC error returned immediately: `code = Unavailable, desc = transport: authentication handshake failed: tls: failed to verify certificate`.
3. Make a plaintext gRPC request (no TLS):
   - **Result:** Connection aborted by server immediately.
4. **Pass Criteria:** Server strictly rejects any client lacking a certificate signed by the internal Root CA.

---

## 11. Quickstart Run Commands

```bash
# --- Daily development (WSL bash on the native path - never PowerShell, never /mnt/c) ---
# Full local stack: Postgres + Valkey + Kafka, all 5 services, Gateway and Frontend:
npm run dev                        # = node scripts/dev-auth.cjs --all
# -> Authentication stack ready: http://127.0.0.1:3000/login
# Ports: 3000 frontend, 4000 gateway (/graphql), 50051-50054 services.
# Auth stack only (fast iteration; no catalog/inventory/order/Kafka):
npm run dev:auth

# --- Dockerized stack (alternative to npm run dev; container parity) ----------
# 1. Generate mTLS Certificates (one-time)
chmod +x scripts/generate-certs.sh
./scripts/generate-certs.sh

# 2. Copy .env.example to .env and adjust values (POSTGRES_PASSWORD, JWT_SECRET, ...)

# 3. Start Core Infrastructure (Postgres, Valkey, Kafka KRaft, Kafka UI)
docker compose up -d postgres valkey kafka kafka-ui

# 4. Check Kafka Topics in Kafka UI
# Open http://127.0.0.1:8080 in your browser

# 5. Start Microservices and Gateway
docker compose up -d auth-service catalog-service order-service inventory-service api-gateway

# 6. Inspect Services
docker compose ps
docker compose logs -f order-service inventory-service
```
