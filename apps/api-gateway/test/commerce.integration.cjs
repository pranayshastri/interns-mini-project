const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { randomUUID, randomBytes } = require('node:crypto');
const { parseEnv } = require('node:util');
const net = require('node:net');
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { Transport } = require('@nestjs/microservices');
const { PROTO_PATHS } = require('@repo/proto');
const seeds = require('@repo/proto/seed-ids.json');
const root = resolve(__dirname, '../../..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function port() { const s = net.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise(r => s.close(r)); return p; }

test('seed IDs match SQL and documented examples', () => {
  const sql = readFileSync(resolve(root, 'infra/postgres/schema-init.sql'), 'utf8');
  for (const id of Object.values(seeds)) assert.ok(sql.includes(id));
  assert.match(sql, new RegExp(`'${seeds.productId}', '${seeds.shopId}'`));
  assert.equal(sql.split(seeds.productId).length - 1, 2, 'catalog and inventory use the same product');
  assert.doesNotMatch(sql + readFileSync(resolve(root, 'ARCHITECTURE.md'), 'utf8'), /[ps]0000000-0000-0000-0000-000000000001/);
});

test('Next.js -> GraphQL -> real mTLS service controllers and PostgreSQL', { timeout: 180000 }, async t => {
  const local = existsSync(resolve(root, '.env')) ? parseEnv(readFileSync(resolve(root, '.env'), 'utf8')) : {};
  const template = process.env.COMMERCE_TEST_DATABASE_URL || local.LOCAL_AUTH_DATABASE_URL;
  assert.ok(template, 'Set COMMERCE_TEST_DATABASE_URL or LOCAL_AUTH_DATABASE_URL in .env');
  const base = template.replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? local[k]);
  const schema = `commerce_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(base); url.searchParams.set('schema', schema);
  const temp = mkdtempSync(resolve(tmpdir(), 'commerce-mtls-'));
  const certResult = spawnSync('bash', [resolve(root, 'scripts/generate-certs.sh')], { cwd: temp, encoding: 'utf8' });
  assert.equal(certResult.status, 0, 'Temporary certificates generated');
  const certDir = resolve(temp, 'infra/certs');
  const pem = name => readFileSync(resolve(certDir, name));
  const originalEnv = { ...process.env };
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: url.toString(), TLS_CERT_DIR: certDir, JWT_SECRET: randomBytes(40).toString('hex'), VALKEY_HOST: '127.0.0.1', VALKEY_PORT: '6379', AUTH_REDIS_PREFIX: `${schema}:` });
  for (const key of ['TLS_CA_PATH', 'TLS_KEY_PATH', 'TLS_CERT_PATH']) delete process.env[key];
  const apps = [], children = [], dbs = [], clients = [];
  const { PrismaClient } = require('../../auth-service/generated/prisma');
  const admin = new PrismaClient({ datasourceUrl: url.toString() });
  let schemaCreated = false;
  t.after(async () => {
    for (const child of children.reverse()) {
      if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    }
    clients.forEach(c => c.close());
    for (const app of apps.reverse()) await app.close();
    const Redis = require('ioredis');
    const redis = new Redis({ host: '127.0.0.1', port: 6379, lazyConnect: true, retryStrategy: () => null });
    redis.on('error', () => {});
    try { await redis.connect(); const keys = await redis.keys(`${schema}:*`); if (keys.length) await redis.del(...keys); } finally { redis.disconnect(); }
    for (const db of dbs) await db.$disconnect();
    if (schemaCreated) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    for (const k of Object.keys(process.env)) if (!(k in originalEnv)) delete process.env[k];
    Object.assign(process.env, originalEnv);
    rmSync(resolve(root, 'apps/frontend', `.next-commerce-${schema}`), { recursive: true, force: true });
    rmSync(temp, { recursive: true, force: true });
  });
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); schemaCreated = true;
  // Exercise the real SQL types/constraints in an isolated schema, never reset app data.
  const sql = readFileSync(resolve(root, 'infra/postgres/schema-init.sql'), 'utf8').replace(/^\\c .*$/gm, '').replace(/^--.*$/gm, '');
  for (const statement of sql.split(';').filter(s => s.trim())) await admin.$executeRawUnsafe(statement);
  for (const svc of ['auth', 'catalog', 'order', 'inventory']) {
    const C = require(`../../${svc}-service/generated/prisma`).PrismaClient;
    dbs.push(new C({ datasourceUrl: url.toString() }));
  }
  const [authDb, catalogDb, orderDb, inventoryDb] = dbs;
  const password = 'CommerceTest-Password42';
  const passwordHash = await require('bcryptjs').hash(password, 4);
  await authDb.user.update({ where: { id: seeds.customerId }, data: { passwordHash } });
  const other = await authDb.user.create({ data: { email: 'other@example.test', fullName: 'Other Customer', passwordHash, role: 'CUSTOMER' } });
  // Real controller/service/Prisma stacks. Kafka workers are deliberately excluded:
  // this suite verifies synchronous gateway wiring and atomic outbox creation.
  for (const [index, svc, title] of [[0, 'auth', 'Auth'], [1, 'catalog', 'Catalog'], [2, 'order', 'Order'], [3, 'inventory', 'Inventory']]) {
    const Controller = require(`../../${svc}-service/dist/${svc}/${svc}.controller`)[`${title}Controller`];
    const Service = require(`../../${svc}-service/dist/${svc}/${svc}.service`)[`${title}Service`];
    const Prisma = require(`../../${svc}-service/dist/prisma/prisma.service`).PrismaService;
    const providers = [Service, { provide: Prisma, useValue: dbs[index] }];
    if (svc === 'auth') providers.push(require('../../auth-service/dist/session/valkey.service').ValkeyService);
    class TestModule {}
    Module({ controllers: [Controller], providers })(TestModule);
    const p = await port(); process.env[`${svc.toUpperCase()}_SERVICE_ADDR`] = `localhost:${p}`;
    const app = await NestFactory.createMicroservice(TestModule, { logger: ['error'], abortOnError: false, transport: Transport.GRPC, options: {
      package: `shop.${svc}.v1`, protoPath: PROTO_PATHS[svc], url: `127.0.0.1:${p}`, loader: { keepCase: true, longs: String },
      credentials: grpc.ServerCredentials.createSsl(pem('ca.crt'), [{ private_key: pem(`${svc}-service.key`), cert_chain: pem(`${svc}-service.crt`) }], true),
    } });
    apps.push(app); await app.listen();
  }
  const trusted = grpc.credentials.createSsl(pem('ca.crt'), pem('api-gateway.key'), pem('api-gateway.crt'));
  const stub = (svc, title, credentials = trusted) => {
    const proto = grpc.loadPackageDefinition(loader.loadSync(PROTO_PATHS[svc], { keepCase: true, longs: String, defaults: true }));
    const client = new proto.shop[svc].v1[`${title}Service`](process.env[`${svc.toUpperCase()}_SERVICE_ADDR`], credentials); clients.push(client); return client;
  };
  const call = (client, method, data, timeout = 3000) => new Promise((resolve, reject) => client[method](data, { deadline: Date.now() + timeout }, (err, value) => err ? reject(err) : resolve(value)));
  await t.test('Catalog and Order accept the agreed seed UUIDs; Order rejects malformed UUIDs', async () => {
    const catalog = stub('catalog', 'Catalog');
    assert.equal((await call(catalog, 'getProduct', { product_id: seeds.productId })).shop_id, seeds.shopId);
    const order = stub('order', 'Order');
    const created = await call(order, 'createOrder', { customer_id: seeds.customerId, shipping_address: 'Test address', items: [{ product_id: seeds.productId, shop_id: seeds.shopId, quantity: 1, unit_price_cents: '8900' }] });
    assert.equal(created.total_amount_cents, '8900');
    await assert.rejects(call(order, 'getOrder', { order_id: 'invalid' }), e => e.code === 3);
    await assert.rejects(call(catalog, 'getProduct', { product_id: randomUUID() }), e => e.code === 5);
  });
  await t.test('mTLS rejects plaintext, missing client identity and untrusted certificates', async () => {
    for (const credentials of [grpc.credentials.createInsecure(), grpc.credentials.createSsl(pem('ca.crt')), grpc.credentials.createSsl(pem('ca.crt'), pem('untrusted.key'), pem('untrusted.crt'))]) {
      await assert.rejects(call(stub('inventory', 'Inventory', credentials), 'getStock', { product_id: seeds.productId }, 800), e => [14, 4].includes(e.code));
    }
  });
  await t.test('gateway refuses missing certificates', () => {
    const { getGrpcCredentials } = require('../dist/grpc/grpc-client.options');
    process.env.TLS_CERT_PATH = resolve(temp, 'missing.crt');
    try { assert.throws(getGrpcCredentials, /ENOENT/); } finally { delete process.env.TLS_CERT_PATH; }
  });
  await t.test('commerce server bootstraps fail closed without certificates', () => {
    for (const svc of ['catalog', 'order', 'inventory']) {
      const result = spawnSync(process.execPath, [resolve(root, `apps/${svc}-service/dist/main.js`)], { env: { ...process.env, TLS_CA_PATH: resolve(temp, 'missing-ca.crt') }, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, 1); assert.match(result.stdout + result.stderr, /ENOENT/);
    }
  });
  await t.test('inventory smoke script passes without mutating stock', async () => {
    const child = spawn(process.execPath, [resolve(root, 'apps/inventory-service/scripts/test-grpc-client.js')], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let logs = ''; child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d);
    const [code] = await once(child, 'exit'); assert.equal(code, 0, logs);
    assert.equal((await inventoryDb.productInventory.findUnique({ where: { productId: seeds.productId } })).availableStock, 50);
  });
  const frontPort = await port(), gatewayPort = await port();
  const origin = `http://127.0.0.1:${frontPort}`;
  process.env.FRONTEND_ORIGIN = origin;
  const { AppModule } = require('../dist/app.module');
  const gateway = await NestFactory.create(AppModule, { logger: ['error'], abortOnError: false }); apps.push(gateway);
  await gateway.listen(gatewayPort, '127.0.0.1');
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next', { paths: [resolve(root, 'apps/frontend')] }), 'dev', '--hostname', '127.0.0.1', '--port', String(frontPort)], {
    cwd: resolve(root, 'apps/frontend'), env: { ...process.env, NODE_ENV: 'development', NEXT_DIST_DIR: `.next-commerce-${schema}`, API_GATEWAY_URL: `http://127.0.0.1:${gatewayPort}`, ROBONEST_AUTH_ENABLED: 'true', ROBONEST_VERIFIED_CAPABILITIES: 'products,product,stock,order,createOrder' }, stdio: ['ignore', 'pipe', 'pipe'],
  }); children.push(child);
  let logs = ''; child.stdout.on('data', d => logs += d); child.stderr.on('data', d => logs += d);
  for (let i = 0; i < 100 && !logs.includes('Ready in'); i++) { if (child.exitCode !== null) throw new Error(logs); await sleep(200); }
  assert.match(logs, /Ready in/);
  async function query(query, variables = {}, cookie = '') {
    const response = await fetch(`${origin}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie }, body: JSON.stringify({ query, variables }) });
    assert.equal(response.status, 200); return { body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = async email => {
    const result = await query('mutation($email:String!,$password:String!){login(email:$email,password:$password){user{id}}}', { email, password });
    assert.equal(result.body.errors, undefined); assert.ok(result.cookie); return result.cookie;
  };
  const cookie = await login('customer@gmail.com');
  const mutation = 'mutation($items:[OrderItemInput!]!){createOrder(items:$items,shippingAddress:"Test delivery address"){id customerId totalAmountCents status createdAt}}';
  const item = { productId: seeds.productId, shopId: seeds.shopId, quantity: 2, unitPriceCents: 8900 };
  await t.test('Next proxy serves real catalog with fresh inventory stock', async () => {
    const result = await query('{products{id shopId priceCents availableStock}}');
    assert.equal(result.body.errors, undefined); assert.deepEqual(result.body.data.products, [{ id: seeds.productId, shopId: seeds.shopId, priceCents: 8900, availableStock: 50 }]);
    await inventoryDb.productInventory.update({ where: { productId: seeds.productId }, data: { availableStock: 43 } });
    const refreshed = await query('{products{availableStock}}'); assert.equal(refreshed.body.data.products[0].availableStock, 43);
    assert.equal((await query('query($id:ID!){stock(productId:$id)}', { id: seeds.productId })).body.data.stock, 43);
  });
  await t.test('rejects unauthenticated orders, price tampering, duplicates and bad inputs', async () => {
    for (const [items, session, code] of [[[item], '', 'UNAUTHENTICATED'], [[{ ...item, unitPriceCents: 1 }], cookie, 'BAD_USER_INPUT'], [[{ ...item, quantity: 44 }], cookie, 'BAD_USER_INPUT'], [[item, item], cookie, 'BAD_USER_INPUT'], [[{ ...item, productId: 'bad' }], cookie, 'BAD_USER_INPUT'], [[{ ...item, quantity: 0 }], cookie, 'BAD_USER_INPUT']]) {
      assert.equal((await query(mutation, { items }, session)).body.errors[0].extensions.code, code);
    }
  });
  await t.test('rejects totals outside GraphQL Int before persisting an order', async () => {
    const pricey = await catalogDb.product.create({ data: { shopId: seeds.shopId, name: 'Test-only price boundary', description: 'Isolated schema fixture', priceCents: 2147483647n } });
    await inventoryDb.productInventory.create({ data: { productId: pricey.id, availableStock: 2 } });
    const before = await orderDb.order.count();
    const attempt = await query(mutation, { items: [{ productId: pricey.id, shopId: seeds.shopId, quantity: 2, unitPriceCents: 2147483647 }] }, cookie);
    assert.equal(attempt.body.errors[0].extensions.code, 'BAD_USER_INPUT');
    assert.equal(await orderDb.order.count(), before);
    await inventoryDb.productInventory.delete({ where: { productId: pricey.id } });
    await catalogDb.product.delete({ where: { id: pricey.id } });
  });
  await t.test('creates persisted order and outbox, then enforces lookup ownership', async () => {
    const result = (await query(mutation, { items: [item] }, cookie)).body; assert.equal(result.errors, undefined);
    const order = result.data.createOrder; assert.equal(order.customerId, seeds.customerId); assert.equal(order.totalAmountCents, 17800); assert.equal(order.status, 'PENDING');
    assert.equal(await orderDb.outboxEvent.count({ where: { aggregateId: order.id } }), 1);
    const saved = await orderDb.order.findUnique({ where: { id: order.id }, include: { items: true } }); assert.equal(saved.items[0].productId, seeds.productId); assert.equal(saved.items[0].shopId, seeds.shopId);
    const lookup = 'query($id:ID!){order(id:$id){id totalAmountCents}}';
    assert.equal((await query(lookup, { id: order.id }, cookie)).body.data.order.id, order.id);
    const otherCookie = await login(other.email);
    assert.equal((await query(lookup, { id: order.id }, otherCookie)).body.errors[0].extensions.code, 'FORBIDDEN');
  });
  await t.test('browser shops real catalog and places a persisted order through Next.js and mTLS', async () => {
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${origin}/login`);
      const result = await page.evaluate(async ({ password }) => {
        const request = async (query, variables = {}) => (await fetch('/graphql', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) })).json();
        const login = await request('mutation($password:String!){login(email:"customer@gmail.com",password:$password){user{id}}}', { password });
        const products = await request('{products{id availableStock}}');
        return { login, products, cookie: document.cookie };
      }, { password });
      assert.equal(result.login.errors, undefined);
      assert.equal(result.products.data.products[0].availableStock, 43);
      assert.ok(!result.cookie.includes('shop_session'), 'Session remains HttpOnly');
      await page.goto(`${origin}/products`);
      await page.getByRole('heading', { name: 'Mechanical Keyboard' }).waitFor();
      await page.getByRole('link', { name: 'Mechanical Keyboard' }).click();
      await page.getByText('43 available').waitFor();
      await page.getByRole('button', { name: 'Add Mechanical Keyboard' }).click();
      await page.getByRole('link', { name: 'View your bag' }).click();
      await page.getByRole('link', { name: 'Continue to checkout' }).click();
      await page.getByLabel('Shipping address').fill('Browser checkout test address');
      await page.getByRole('button', { name: 'Place order' }).click();
      await page.waitForURL(/\/orders\/[0-9a-f-]+$/);
      const browserOrderId = page.url().split('/').at(-1);
      const saved = await orderDb.order.findUnique({ where: { id: browserOrderId } });
      assert.equal(saved?.customerId, seeds.customerId);
      assert.equal(saved?.shippingAddress, 'Browser checkout test address');
      assert.equal(await orderDb.outboxEvent.count({ where: { aggregateId: browserOrderId } }), 1);
    } finally { await browser.close(); }
  });
  await t.test('inventory outage is an explicit error, never fabricated zero stock', async () => {
    await apps[3].close();
    const result = await query('{products{availableStock}}'); assert.equal(result.body.errors[0].extensions.code, 'SERVICE_UNAVAILABLE');
  });
});
