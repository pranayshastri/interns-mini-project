const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { mkdtempSync, readFileSync, rmSync, mkdirSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID, randomBytes } = require('node:crypto');
const { parseEnv } = require('node:util');
const net = require('node:net');
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const { PrismaClient } = require('../generated/prisma');
const Redis = require('ioredis');
const bcrypt = require('bcryptjs');
const { PROTO_PATHS } = require('@repo/proto');
const root = resolve(__dirname, '../../..');
const service = resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function freePort() { const s = net.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
function start(t, args, options) {
  const child = spawn(process.execPath, args, { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', d => { logs += d.toString(); }); child.stderr.on('data', d => { logs += d.toString(); });
  t.after(async () => {
    if (child.exitCode === null) {
      const done = once(child, 'exit');
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
      const timeout = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 4000);
      await done; clearTimeout(timeout);
    }
  });
  return { child, logs: () => logs };
}
async function ready(proc, text) {
  for (let i = 0; i < 150; i++) {
    if (proc.logs().includes(text)) return;
    if (proc.child.exitCode !== null) break;
    await sleep(200);
  }
  throw new Error(`Startup failed: ${proc.logs()}`);
}

test('Auth/profile integration: PostgreSQL, Valkey, mTLS and GraphQL', { timeout: 240000 }, async t => {
  const local = existsSync(resolve(root, '.env')) ? parseEnv(readFileSync(resolve(root, '.env'), 'utf8')) : {};
  const template = process.env.AUTH_TEST_DATABASE_URL || local.LOCAL_AUTH_DATABASE_URL;
  assert.ok(template, 'Set AUTH_TEST_DATABASE_URL or root LOCAL_AUTH_DATABASE_URL');
  const baseUrl = template.replace(/\$\{(\w+)\}/g, (_, key) => process.env[key] ?? local[key]);
  const schema = `auth_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(baseUrl); url.searchParams.set('schema', schema);
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  t.after(async () => { await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`); await db.$disconnect(); });
  await db.$executeRawUnsafe(`CREATE TABLE "${schema}".users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, role VARCHAR(32) NOT NULL, full_name VARCHAR(128) NOT NULL, shop_id UUID NULL)`);
  for (const sql of readFileSync(resolve(service, 'prisma/migrations/20261015_admin_accounts/migration.sql'), 'utf8').split(';').filter(s => s.trim())) await db.$executeRawUnsafe(sql);
  for (const sql of readFileSync(resolve(service, 'prisma/migrations/20261015_admin_shops/migration.sql'), 'utf8').split(';').filter(s => s.trim())) await db.$executeRawUnsafe(sql);
  for (const sql of readFileSync(resolve(service, 'prisma/migrations/20261018_profile_addresses/migration.sql'), 'utf8').split(';').filter(s => s.trim())) await db.$executeRawUnsafe(sql);
  const prefix = `${schema}:`;
  const redis = new Redis({ host: process.env.AUTH_TEST_VALKEY_HOST || '127.0.0.1', port: Number(process.env.AUTH_TEST_VALKEY_PORT || 6379), maxRetriesPerRequest: 1 });
  redis.on('error', () => {});
  t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); redis.disconnect(); });
  await redis.ping();
  const temp = mkdtempSync(resolve(tmpdir(), 'shop-auth-e2e-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const certResult = spawnSync('bash', [resolve(root, 'scripts/generate-certs.sh')], { cwd: temp, encoding: 'utf8', timeout: 30000 });
  assert.equal(certResult.status, 0, 'Test certificate generation failed');
  const certDir = resolve(temp, 'infra/certs');
  const pem = file => readFileSync(resolve(certDir, file));
  const authPort = await freePort(), gatewayPort = await freePort(), frontPort = await freePort();
  const origin = `http://127.0.0.1:${frontPort}`;
  const env = { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(authPort), DATABASE_URL: url.toString(), JWT_SECRET: randomBytes(40).toString('hex'), VALKEY_HOST: process.env.AUTH_TEST_VALKEY_HOST || '127.0.0.1', VALKEY_PORT: process.env.AUTH_TEST_VALKEY_PORT || '6379', AUTH_REDIS_PREFIX: prefix, TLS_CERT_DIR: certDir };
  for (const key of ['TLS_CA_PATH', 'TLS_CERT_PATH', 'TLS_KEY_PATH']) delete env[key];
  await t.test('missing server certificate fails closed', () => {
    const result = spawnSync(process.execPath, ['dist/main.js'], { cwd: service, env: { ...env, TLS_CERT_PATH: resolve(temp, 'missing.crt') }, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1); assert.match(result.stdout + result.stderr, /ENOENT/);
  });
  await t.test('invalid port fails startup', () => {
    const result = spawnSync(process.execPath, ['dist/main.js'], { cwd: service, env: { ...env, PORT: 'invalid' }, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 1); assert.match(result.stdout + result.stderr, /port must be an integer/);
  });
  const auth = start(t, ['dist/main.js'], { cwd: service, env });
  await ready(auth, 'Secure Auth gRPC server listening');
  const Stub = grpc.loadPackageDefinition(loader.loadSync(PROTO_PATHS.auth, { keepCase: true, defaults: true })).shop.auth.v1.AuthService;
  const trusted = grpc.credentials.createSsl(pem('ca.crt'), pem('api-gateway.key'), pem('api-gateway.crt'));
  async function rpc(method, data, credentials = trusted) {
    const client = new Stub(`localhost:${authPort}`, credentials);
    return new Promise((resolve, reject) => client[method](data, { deadline: Date.now() + 5000 }, (error, value) => { client.close(); error ? reject(error) : resolve(value); }));
  }
  for (const [name, credentials] of [
    ['self-signed certificate', grpc.credentials.createSsl(pem('ca.crt'), pem('untrusted.key'), pem('untrusted.crt'))],
    ['missing client certificate', grpc.credentials.createSsl(pem('ca.crt'))],
    ['plaintext', grpc.credentials.createInsecure()],
  ]) await t.test(`mTLS rejects ${name}`, async () => { await assert.rejects(rpc('getProfile', { token: 'invalid' }, credentials), e => e.code === 14); });
  const gateway = start(t, ['dist/main.js'], { cwd: resolve(root, 'apps/api-gateway'), env: { ...env, PORT: String(gatewayPort), AUTH_SERVICE_ADDR: `localhost:${authPort}`, FRONTEND_ORIGIN: origin } });
  await ready(gateway, 'Nest application successfully started');
  const endpoint = `http://127.0.0.1:${gatewayPort}/graphql`;
  const userFields = 'id email fullName role shopId';
  async function gql(query, variables = {}, cookie = '', requestOrigin = origin) {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin, Cookie: cookie }, body: JSON.stringify({ query, variables }) });
    return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
  }
  const email = `integration-${randomUUID()}@example.test`, password = 'V7!qN2@x';
  let cookie, id;
  await t.test('registration hashes password but creates no session', async () => {
    const r = await gql(`mutation($email:String!,$password:String!,$fullName:String!){register(email:$email,password:$password,fullName:$fullName){user{${userFields}}}}`, { email, password, fullName: 'Ankit Test' });
    assert.equal(r.body.errors, undefined, JSON.stringify(r.body));
    assert.equal(r.body.data.register.user.role, 'CUSTOMER');
    assert.equal(r.response.headers.get('set-cookie'), null);
    assert.equal((await redis.keys(`${prefix}session:*`)).length, 0);
    id = r.body.data.register.user.id;
    const user = await db.user.findUnique({ where: { id } });
    assert.notEqual(user.passwordHash, password); assert.ok(await bcrypt.compare(password, user.passwordHash));
    assert.equal(JSON.stringify(r.body).includes('access_token'), false);
  });
  await t.test('explicit login issues HttpOnly session cookie', async () => {
    const r = await gql(`mutation($email:String!,$password:String!){login(email:$email,password:$password){user{${userFields}}}}`, { email, password });
    assert.equal(r.body.errors, undefined, JSON.stringify(r.body));
    assert.match(r.response.headers.get('set-cookie'), /HttpOnly/);
    assert.match(r.response.headers.get('set-cookie'), /SameSite=Strict/);
    cookie = r.cookie;
    assert.equal(r.body.data.login.user.id, id);
  });
  await t.test('duplicate account rejected', async () => {
    const r = await rpc('register', { email: email.toUpperCase(), password, full_name: 'Duplicate' }).catch(e => e);
    assert.equal(r.code, grpc.status.ALREADY_EXISTS);
  });
  await t.test('weak password and blank name rejected', async () => {
    for (const data of [{ password: 'A1!bcde', full_name: 'Name' }, { password: 'é'.repeat(37), full_name: 'Name' }, { password, full_name: ' ' }]) await assert.rejects(rpc('register', { email: 'invalid@example.test', ...data }), e => e.code === grpc.status.INVALID_ARGUMENT);
  });
  await t.test('profile read/update persists; single-name supported', async () => {
    let r = await gql(`query{me{${userFields}}}`, {}, cookie); assert.equal(r.body.data.me.id, id);
    r = await gql(`mutation{updateProfile(fullName:"Ankit"){${userFields}}}`, {}, cookie);
    assert.equal(r.body.data.updateProfile.fullName, 'Ankit');
    assert.equal((await db.user.findUnique({ where: { id } })).fullName, 'Ankit');
  });
  await t.test('phone updates persist, omitted phone is preserved, and invalid input is rejected', async () => {
    let r = await gql('mutation{updateProfile(fullName:"Ankit",phone:"+91 9876543210"){phone}}', {}, cookie);
    assert.equal(r.body.data.updateProfile.phone, '+91 9876543210');
    r = await gql('mutation{updateProfile(fullName:"Ankit"){phone}}', {}, cookie);
    assert.equal(r.body.data.updateProfile.phone, '+91 9876543210');
    assert.equal((await db.user.findUnique({ where: { id } })).phone, '+91 9876543210');
    r = await gql('mutation{updateProfile(fullName:"Ankit",phone:"abc"){phone}}', {}, cookie);
    assert.ok(r.body.errors);
    r = await gql('mutation{updateProfile(fullName:"Ankit",phone:""){phone}}', {}, cookie);
    assert.equal(r.body.data.updateProfile.phone, '');
  });
  await t.test('addresses persist, enforce ownership and validation, and serialize default changes', async () => {
    const fields = 'id label recipient phone line1 line2 city state postal country isDefault';
    const save = `mutation($input:AddressInput!){saveAddress(input:$input){${fields}}}`;
    const input = { label: 'Home', recipient: 'Ankit', phone: '+91 9876543210', line1: 'Test building', line2: '', city: 'Test city', state: 'Test region', postal: '123456', country: 'India', isDefault: false };
    let r = await gql(save, { input }, cookie);
    assert.equal(r.body.errors, undefined, JSON.stringify(r.body));
    const home = r.body.data.saveAddress[0];
    assert.equal(home.isDefault, true);
    assert.equal((await db.address.findUnique({ where: { id: home.id } })).userId, id);
    r = await gql(save, { input: { ...input, label: 'Work' } }, cookie);
    const work = r.body.data.saveAddress.find(a => a.label === 'Work');
    assert.equal(work.isDefault, false);
    r = await gql(save, { input: { ...input, id: home.id, line1: 'Updated building' } }, cookie);
    assert.equal(r.body.data.saveAddress.find(a => a.id === home.id).line1, 'Updated building');
    for (const invalid of [{ line1: '  ' }, { country: 'x'.repeat(101) }, { phone: 'abc' }]) {
      r = await gql(save, { input: { ...input, ...invalid } }, cookie);
      assert.ok(r.body.errors, 'Invalid address must be rejected');
    }
    const otherEmail = `address-other-${randomUUID()}@example.test`;
    await gql('mutation($email:String!,$password:String!){register(email:$email,password:$password,fullName:"Other"){user{id}}}', { email: otherEmail, password });
    const other = await gql('mutation($email:String!,$password:String!){login(email:$email,password:$password){user{id}}}', { email: otherEmail, password });
    assert.ok(other.cookie);
    r = await gql('query{myAddresses{id}}', {}, other.cookie);
    assert.deepEqual(r.body.data.myAddresses, []);
    for (const operation of ['deleteAddress', 'setDefaultAddress']) {
      r = await gql(`mutation($id:ID!){${operation}(id:$id){id}}`, { id: home.id }, other.cookie);
      assert.ok(r.body.errors, `${operation} cannot target another user`);
    }
    r = await gql(save, { input: { ...input, id: home.id } }, other.cookie);
    assert.ok(r.body.errors);
    r = await gql('query{myAddresses{id}}');
    assert.equal(r.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    const outcomes = await Promise.all([home.id, work.id].map(addressId => gql('mutation($id:ID!){setDefaultAddress(id:$id){id isDefault}}', { id: addressId }, cookie)));
    outcomes.forEach(result => assert.equal(result.body.errors, undefined, JSON.stringify(result.body)));
    r = await gql(`query{myAddresses{${fields}}}`, {}, cookie);
    assert.equal(r.body.data.myAddresses.filter(a => a.isDefault).length, 1);
    const selected = r.body.data.myAddresses.find(a => a.isDefault);
    r = await gql('mutation($id:ID!){deleteAddress(id:$id){id isDefault}}', { id: selected.id }, cookie);
    assert.equal(r.body.data.deleteAddress.length, 1);
    assert.equal(r.body.data.deleteAddress[0].isDefault, true);
    r = await gql('mutation($id:ID!){deleteAddress(id:$id){id}}', { id: r.body.data.deleteAddress[0].id }, cookie);
    assert.deepEqual(r.body.data.deleteAddress, []);
    assert.equal(await db.address.count({ where: { userId: id } }), 0);
    await gql('mutation{logout}', {}, other.cookie);
  });
  await t.test('anonymous, tampered token, extra role and cross-origin requests rejected', async () => {
    const anon = await gql('query{me{id}}'); assert.equal(anon.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    const tamper = await gql('query{me{id}}', {}, cookie + 'bad'); assert.equal(tamper.body.errors[0].extensions.code, 'UNAUTHENTICATED');
    const escalation = await gql('mutation{updateProfile(fullName:"Ankit",role:"ADMIN"){id}}', {}, cookie); assert.equal(escalation.response.status, 400);
    const csrf = await gql('mutation{logout}', {}, cookie, 'https://attacker.example'); assert.equal(csrf.response.status, 403);
    assert.equal((await db.user.findUnique({ where: { id } })).role, 'CUSTOMER');
  });
  await t.test('local provisioning creates login-ready privileged accounts without exposing passwords', async () => {
    const password = 'Provisioned8!';
    async function provision(role, email, extra = []) {
      const args = [resolve(service, 'scripts/provision-account.cjs'), '--role', role, '--email', email, '--name', `${role} User`, ...extra];
      const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, DATABASE_URL: url.toString() }, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.stdin.end(password + '\n');
      const [code] = await once(child, 'exit');
      assert.equal(code, 0, output);
      assert.equal(output.includes(password), false);
      return output;
    }
    const adminEmail = `provision-admin-${randomUUID()}@example.test`;
    await provision('ADMIN', adminEmail);
    const admin = await db.user.findUnique({ where: { email: adminEmail } });
    assert.equal(admin.role, 'ADMIN');
    assert.ok(await bcrypt.compare(password, admin.passwordHash));
    const shopId = randomUUID();
    const sellerEmail = `provision-seller-${randomUUID()}@example.test`;
    await provision('SHOPKEEPER', sellerEmail, ['--shop-id', shopId]);
    const seller = await db.user.findUnique({ where: { email: sellerEmail } });
    assert.equal(seller.shopId, shopId);
    const login = await gql('mutation($email:String!,$password:String!){login(email:$email,password:$password){user{role shopId}}}', { email: sellerEmail, password });
    assert.equal(login.body.errors, undefined, JSON.stringify(login.body));
    assert.equal(login.body.data.login.user.shopId, shopId);
    await gql('mutation{logout}', {}, login.cookie);
  });
  await t.test('provisioned ADMIN uses the same login; public signup cannot choose ADMIN', async () => {
    const adminEmail = `admin-${randomUUID()}@example.test`;
    const admin = await db.user.create({ data: { email: adminEmail, passwordHash: await bcrypt.hash(password, 12), fullName: 'Test Admin', role: 'ADMIN' } });
    const r = await gql(`mutation($email:String!,$password:String!){login(email:$email,password:$password){user{${userFields}}}}`, { email: adminEmail, password });
    assert.equal(r.body.errors, undefined, JSON.stringify(r.body));
    assert.equal(r.body.data.login.user.role, 'ADMIN');
    const profile = await gql('query{me{id role}}', {}, r.cookie);
    assert.equal(profile.body.data.me.id, admin.id);
    assert.equal(profile.body.data.me.role, 'ADMIN');
    const forbidden = await gql('mutation{register(email:"bad@example.test",password:"V7!qN2@x",fullName:"Bad",role:"ADMIN"){user{id}}}');
    assert.equal(forbidden.response.status, 400);
    await gql('mutation{logout}', {}, r.cookie);
  });
  await t.test('provisioned SHOPKEEPER logs in with its assigned shop', async () => {
    const seller = await db.user.create({ data: { email: `seller-${randomUUID()}@example.test`, passwordHash: await bcrypt.hash(password, 12), fullName: 'Test Seller', role: 'SHOPKEEPER', shopId: randomUUID() } });
    const result = await gql(`mutation($email:String!,$password:String!){login(email:$email,password:$password){user{${userFields}}}}`, { email: seller.email, password });
    assert.equal(result.body.errors, undefined);
    assert.equal(result.body.data.login.user.role, 'SHOPKEEPER');
    const profile = await gql('query{me{id role shopId}}', {}, result.cookie);
    assert.equal(profile.body.data.me.shopId, seller.shopId);
    await gql('mutation{logout}', {}, result.cookie);
  });
  await t.test('JWT claims, expiry and Valkey session revocation are enforced', async () => {
    const { JwtService } = require('@nestjs/jwt');
    const jwt = new JwtService({ secret: env.JWT_SECRET });
    const result = await rpc('authenticate', { email, password });
    const claims = jwt.verify(result.access_token, { algorithms: ['HS256'], issuer: 'shop-auth', audience: 'shop-app' });
    assert.equal(claims.sub, id); assert.equal(claims.role, 'CUSTOMER');
    const key = `${prefix}session:${claims.jti}`;
    assert.equal(await redis.get(key), id);
    assert.ok(await redis.ttl(key) > 3500);
    const expired = jwt.sign({ sub: id, jti: claims.jti, role: 'CUSTOMER' }, { algorithm: 'HS256', issuer: 'shop-auth', audience: 'shop-app', expiresIn: -1 });
    assert.equal((await rpc('validateToken', { token: expired })).is_valid, false);
    await redis.del(key);
    assert.equal((await rpc('validateToken', { token: result.access_token })).is_valid, false);
  });
  await t.test('wrong password rejected; login and token validation work', async () => {
    await assert.rejects(rpc('authenticate', { email, password: 'incorrect' }), e => e.code === grpc.status.UNAUTHENTICATED);
    const result = await rpc('authenticate', { email, password });
    assert.equal((await rpc('validateToken', { token: result.access_token })).is_valid, true);
  });
  await t.test('logout revokes old cookie server-side', async () => {
    const result = await gql('mutation{logout}', {}, cookie); assert.equal(result.body.data.logout, true);
    assert.match(result.response.headers.get('set-cookie'), /Max-Age=0/);
    const replay = await gql('query{me{id}}', {}, cookie); assert.equal(replay.body.errors[0].extensions.code, 'UNAUTHENTICATED');
  });
  await t.test('admin: seller transaction, filtering, permissions, suspension, revocation and audit persistence', async () => {
    const admin = await db.user.create({ data: { email: `operator-${randomUUID()}@example.test`, passwordHash: await bcrypt.hash(password, 12), fullName: 'Operations Admin', role: 'ADMIN' } });
    const loginQuery = 'mutation($email:String!,$password:String!){login(email:$email,password:$password){user{id}}}';
    const adminCookie = (await gql(loginQuery, { email: admin.email, password })).cookie;
    const createQuery = 'mutation($email:String!,$password:String!,$fullName:String!,$shopName:String!,$description:String!){adminCreateSeller(email:$email,password:$password,fullName:$fullName,shopName:$shopName,description:$description){user{id role shopId status} shop{id name ownerId}}}';
    const input = { email: `managed-${randomUUID()}@example.test`, password, fullName: 'Managed Seller', shopName: 'Robotics Lab', description: 'Components for builders' };
    const customerCookie = (await gql(loginQuery, { email, password })).cookie;
    assert.equal((await gql(createQuery, input)).body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal((await gql(createQuery, input, customerCookie)).body.errors[0].extensions.code, 'FORBIDDEN');
    const created = await gql(createQuery, input, adminCookie);
    assert.equal(created.body.errors, undefined, JSON.stringify(created.body));
    const seller = created.body.data.adminCreateSeller.user;
    assert.equal(seller.role, 'SHOPKEEPER');
    assert.equal(seller.shopId, created.body.data.adminCreateSeller.shop.id);
    assert.equal((await db.shop.findUnique({ where: { id: seller.shopId } })).ownerId, seller.id);
    assert.ok(await bcrypt.compare(password, (await db.user.findUnique({ where: { id: seller.id } })).passwordHash));
    const counts = [await db.user.count(), await db.shop.count(), await db.adminAuditEvent.count()];
    assert.equal((await gql(createQuery, input, adminCookie)).body.errors[0].extensions.code, 'CONFLICT');
    assert.deepEqual([await db.user.count(), await db.shop.count(), await db.adminAuditEvent.count()], counts);
    const sellerCookie = (await gql(loginQuery, { email: input.email, password })).cookie;
    for (const deniedCookie of [customerCookie, sellerCookie]) {
      assert.equal((await gql('query{adminUsers{total}}', {}, deniedCookie)).body.errors[0].extensions.code, 'FORBIDDEN');
      assert.equal((await gql('query{adminActivity{total}}', {}, deniedCookie)).body.errors[0].extensions.code, 'FORBIDDEN');
    }
    const listing = await gql('query($search:String){adminUsers(search:$search,role:"SHOPKEEPER",page:1,limit:1){total users{id}}}', { search: input.email }, adminCookie);
    assert.equal(listing.body.data.adminUsers.total, 1);
    assert.equal(listing.body.data.adminUsers.users[0].id, seller.id);
    assert.equal((await gql('query($id:ID!){adminShop(id:$id){name}}', { id: seller.shopId }, adminCookie)).body.data.adminShop.name, input.shopName);
    const statusQuery = 'mutation($id:ID!,$status:String!,$expectedStatus:String!,$reason:String!){adminSetAccountStatus(id:$id,status:$status,expectedStatus:$expectedStatus,reason:$reason){id status}}';
    const change = { id: seller.id, status: 'SUSPENDED', expectedStatus: 'ACTIVE', reason: 'Access review requested' };
    assert.equal((await gql(statusQuery, change, customerCookie)).body.errors[0].extensions.code, 'FORBIDDEN');
    assert.equal((await gql(statusQuery, { ...change, id: admin.id }, adminCookie)).body.errors[0].extensions.code, 'FORBIDDEN');
    assert.equal((await gql(statusQuery, change, adminCookie)).body.data.adminSetAccountStatus.status, 'SUSPENDED');
    const eventsAfterSuspend = await db.adminAuditEvent.count();
    await gql(statusQuery, change, adminCookie);
    assert.equal(await db.adminAuditEvent.count(), eventsAfterSuspend);
    assert.equal((await gql('query{me{id}}', {}, sellerCookie)).body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal((await gql(loginQuery, { email: input.email, password })).body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal((await gql(statusQuery, { ...change, status: 'ACTIVE', expectedStatus: 'ACTIVE' }, adminCookie)).body.errors[0].extensions.code, 'CONFLICT');
    assert.equal((await gql(statusQuery, { ...change, status: 'ACTIVE', expectedStatus: 'SUSPENDED' }, adminCookie)).body.data.adminSetAccountStatus.status, 'ACTIVE');
    assert.equal((await gql('query{me{id}}', {}, sellerCookie)).body.errors[0].extensions.code, 'UNAUTHENTICATED');
    assert.equal((await gql(loginQuery, { email: input.email, password })).body.data.login.user.id, seller.id);
    const events = await db.adminAuditEvent.findMany({ where: { targetId: seller.id } });
    assert.deepEqual(events.map(e => e.action).sort(), ['ACCOUNT_REACTIVATED', 'ACCOUNT_SUSPENDED', 'SELLER_CREATED']);
    const overview = (await gql('query{adminOverview{customers sellers admins suspended}}', {}, adminCookie)).body.data.adminOverview;
    assert.equal(overview.sellers, await db.user.count({ where: { role: 'SHOPKEEPER' } }));
    assert.equal((await gql('query{adminHealth{database sessions}}', {}, adminCookie)).body.data.adminHealth.database, true);
  });
  if (process.env.AUTH_BROWSER_TEST === '1') await t.test('browser: customer, admin and shopkeeper login on desktop/mobile', { timeout: 180000 }, async () => {
    // Isolate the browser suite's rate-limit bucket from preceding API checks.
    const browserGatewayPort = await freePort();
    const browserGateway = start(t, ['dist/main.js'], { cwd: resolve(root, 'apps/api-gateway'), env: { ...env, PORT: String(browserGatewayPort), AUTH_SERVICE_ADDR: `localhost:${authPort}`, FRONTEND_ORIGIN: origin } });
    await ready(browserGateway, 'Nest application successfully started');
    const frontend = start(t, [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(frontPort)], { cwd: resolve(root, 'apps/frontend'), env: { ...process.env, NODE_ENV: 'development', ROBONEST_AUTH_ENABLED: 'true', NEXT_DIST_DIR: '.next-test', API_GATEWAY_URL: `http://127.0.0.1:${browserGatewayPort}` } });
    await ready(frontend, 'Ready');
    const { chromium, expect } = require('@playwright/test');
    const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const browserEmail = `browser-${randomUUID()}@example.test`;
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const artifact = resolve(root, 'apps/auth-service/test-artifacts'); mkdirSync(artifact, { recursive: true });
      await page.goto(origin + '/login');
      await page.getByLabel('Email address', { exact: true }).fill('preview@example.test');
      await page.screenshot({ path: resolve(artifact, 'login-desktop.png'), fullPage: true });
      await page.getByRole('link', { name: 'Create account', exact: true }).click();
      await page.waitForURL('**/signup');
      await page.getByLabel('Full name', { exact: true }).fill('Browser Customer');
      await page.getByLabel('Email address', { exact: true }).fill(browserEmail);
      assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('minlength'), '8');
      await page.getByLabel('Password', { exact: true }).fill('A1!bcde');
      assert.equal(await page.getByLabel('Password', { exact: true }).evaluate(input => input.validity.tooShort), true);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Show password', exact: true }).click();
      assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
      await page.getByRole('button', { name: 'Hide password', exact: true }).click();
      assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('type'), 'password');
      await page.locator('button[type="submit"]').click();
      await page.getByRole('heading', { name: 'Account created', exact: true }).waitFor();
      assert.equal((await page.context().cookies()).some(c => c.name === 'shop_session'), false);
      await page.getByRole('link', { name: 'Continue to sign in' }).click();
      await page.waitForURL('**/login');
      assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), '');
      await page.getByLabel('Email address', { exact: true }).fill(browserEmail);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.locator('button[type="submit"]').click();
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      await page.getByLabel('Full name', { exact: true }).fill('Updated Customer');
      await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+91 9876543210');
      await page.getByRole('button', { name: 'Save changes' }).click();
      await page.getByText('Your profile has been saved.').waitFor();
      await page.reload(); await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      assert.equal(await page.getByLabel('Full name', { exact: true }).inputValue(), 'Updated Customer');
      await page.screenshot({ path: resolve(artifact, 'profile-desktop.png'), fullPage: true });
      assert.equal(await page.getByRole('textbox', { name: 'Phone number', exact: true }).inputValue(), '+91 9876543210');
      await page.getByRole('button', { name: /02 Saved addresses/ }).click();
      await page.getByRole('button', { name: 'Add your first address' }).click();
      const addressDialog = page.getByRole('dialog');
      async function fillAddress(label) {
        for (const [field, value] of Object.entries({ 'Address label': label, 'Recipient name': 'Browser Customer', 'Phone number': '+91 9876543210', 'Address line 1': 'Test building', City: 'Test city', 'State / region': 'Test region', 'Postal code': '123456', Country: 'India' })) await addressDialog.getByLabel(field, { exact: true }).fill(value);
      }
      await fillAddress('Home');
      await addressDialog.getByRole('button', { name: 'Save address', exact: true }).click();
      await expect(addressDialog).not.toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: /02 Saved addresses/ }).click();
      await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
      await expect(page.getByText('Default delivery', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Edit Home', exact: true }).click();
      await addressDialog.getByLabel('Address line 1', { exact: true }).fill('Updated delivery building');
      await addressDialog.getByRole('button', { name: 'Save address', exact: true }).click();
      await expect(addressDialog).not.toBeVisible();
      await expect(page.getByText(/Updated delivery building/)).toBeVisible();
      await page.getByRole('button', { name: '+ Add address', exact: true }).click();
      await fillAddress('Work');
      await addressDialog.getByRole('button', { name: 'Save address', exact: true }).click();
      await expect(addressDialog).not.toBeVisible();
      await page.getByRole('button', { name: 'Set as default', exact: true }).click();
      await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Work', exact: true }) })).toContainText('Default delivery');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: resolve(artifact, 'addresses-mobile.png'), fullPage: true });
      await page.getByRole('button', { name: 'Delete Work', exact: true }).click();
      await addressDialog.getByRole('button', { name: 'Delete address', exact: true }).click();
      await expect(addressDialog).not.toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: /02 Saved addresses/ }).click();
      await expect(page.getByRole('heading', { name: 'Work', exact: true })).toHaveCount(0);
      await expect(page.getByText('Default delivery', { exact: true })).toBeVisible();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: resolve(artifact, 'addresses-desktop.png'), fullPage: true });
      const sessionCookies = await page.context().cookies(); assert.ok(sessionCookies.find(c => c.name === 'shop_session')?.httpOnly);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('button', { name: 'Sign in', exact: true }).first().waitFor();
      await page.getByLabel('Email address', { exact: true }).fill(browserEmail);
      await page.getByLabel('Password', { exact: true }).fill('wrong password');
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('section').getByRole('alert')).toContainText('incorrect');
      await page.getByLabel('Password', { exact: true }).fill(password); await page.locator('button[type="submit"]').click();
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: resolve(artifact, 'profile-mobile.png'), fullPage: true });
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.waitForURL('**/login');
      await page.goto(origin + '/profile');
      await page.waitForURL('**/login');
      for (const role of ['ADMIN', 'SHOPKEEPER']) {
        const roleEmail = `browser-${role.toLowerCase()}-${randomUUID()}@example.test`;
        const shopId = role === 'SHOPKEEPER' ? randomUUID() : null;
        await db.user.create({ data: { email: roleEmail, passwordHash: await bcrypt.hash(password, 12), fullName: `Browser ${role}`, role, shopId } });
        await page.getByLabel('Email address', { exact: true }).fill(roleEmail);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.locator('button[type="submit"]').click();
        await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
        assert.equal(await page.getByLabel('Account role').inputValue(), role);
        if (role === 'ADMIN') {
          await page.setViewportSize({ width: 1440, height: 1000 });
          await page.getByRole('link', { name: 'Admin workspace', exact: true }).click();
          await page.getByRole('button', { name: 'Sellers & shops', exact: true }).click();
          await page.getByRole('button', { name: 'Create seller & shop', exact: true }).click();
          const managedEmail = `ui-seller-${randomUUID()}@example.test`;
          await page.getByLabel('Seller full name', { exact: true }).fill('UI Managed Seller');
          await page.getByLabel('Seller email', { exact: true }).fill(managedEmail);
          await page.getByLabel('Seller password', { exact: true }).fill(password);
          await page.getByLabel('Shop name', { exact: true }).fill('UI Robotics Shop');
          await page.getByLabel('Shop description', { exact: true }).fill('Real integration test shop');
          await page.getByRole('button', { name: 'Create seller & shop', exact: true }).click();
          await expect(page.locator('main p[role="status"]')).toContainText('were created');
          await page.getByRole('searchbox', { name: 'Search sellers' }).fill(managedEmail);
          await page.getByRole('button', { name: 'Apply filters' }).click();
          await page.getByRole('button', { name: `View ${managedEmail}`, exact: true }).click();
          await expect(page.getByText('UI Robotics Shop', { exact: true })).toBeVisible();
          await page.getByRole('button', { name: 'Suspend account', exact: true }).click();
          await page.getByLabel('Reason for access change').fill('Browser access review');
          await page.getByRole('button', { name: 'Confirm access change' }).click();
          await expect(page.locator('main p[role="status"]')).toContainText('Account suspended');
          await page.getByRole('button', { name: 'Reactivate account', exact: true }).click();
          await page.getByLabel('Reason for access change').fill('Browser review completed');
          await page.getByRole('button', { name: 'Confirm access change' }).click();
          await expect(page.locator('main p[role="status"]')).toContainText('Account reactivated');
          await page.getByRole('button', { name: 'Activity log', exact: true }).click();
          await expect(page.getByText('Browser review completed', { exact: true })).toBeVisible();
          await page.reload();
          await page.getByRole('button', { name: 'Activity log', exact: true }).click();
          await expect(page.getByText('Browser review completed', { exact: true })).toBeVisible();
          await page.screenshot({ path: resolve(artifact, 'admin-live-desktop.png'), fullPage: true });
          await page.setViewportSize({ width: 390, height: 844 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await page.screenshot({ path: resolve(artifact, 'admin-live-mobile.png'), fullPage: true });
          await page.getByRole('link', { name: 'My profile', exact: true }).click();
          await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
        }
        if (shopId) assert.equal(await page.getByLabel('Shop ID').inputValue(), shopId);
        await page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await page.waitForURL('**/login');
      }
      await page.route('**/graphql', route => route.abort());
      await page.getByLabel('Email address', { exact: true }).fill(browserEmail);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('section').getByRole('alert')).toContainText('Cannot connect');
      assert.equal(await page.locator('button[type="submit"]').isEnabled(), true);
      assert.deepEqual(errors, [], 'No browser runtime errors');
    } finally { await browser.close(); }
  });
});
