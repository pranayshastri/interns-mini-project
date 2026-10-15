#!/usr/bin/env node
// Local auth stack only. Never changes other services' schemas or certificates.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (Number(process.versions.node.split('.')[0]) < 26) {
  const versions = path.join(process.env.HOME || '', '.nvm/versions/node');
  const candidates = fs.existsSync(versions) ? fs.readdirSync(versions).filter(v => /^v26\./.test(v)).sort((a,b) => b.localeCompare(a, undefined, { numeric: true })) : [];
  if (!candidates.length) { console.error('Node 26 is required. Install Node 26, then run npm run dev:auth again.'); process.exit(1); }
  const bin = path.join(versions, candidates[0], 'bin');
  const result = spawnSync(path.join(bin, 'node'), [__filename], { cwd: root, stdio: 'inherit', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  process.exit(result.status ?? 1);
}
const { parseEnv } = require('node:util');
const net = require('node:net');
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  setTimeout(() => { for (const child of children) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } process.exit(code); }, 1500);
}
process.on('SIGINT', () => stop(0)); process.on('SIGTERM', () => stop(0));
async function command(cmd, args, env = process.env) {
  const child = spawn(cmd, args, { cwd: root, env, stdio: 'inherit', detached: true });
  children.push(child);
  return new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0]} failed (${code}).`))); });
}
async function portFree(port) {
  await new Promise((resolve, reject) => { const server = net.createServer(); server.once('error', () => reject(new Error(`Port ${port} is already in use. Stop the existing app before starting this stack.`))); server.listen(port, '127.0.0.1', () => server.close(resolve)); });
}
function service(name, cwd, args, env, marker) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(child);
    let started = false;
    const timer = setTimeout(() => reject(new Error(`${name} did not become ready within 60 seconds.`)), 60000);
    const log = data => { const output = data.toString(); process.stdout.write(`[${name}] ${output}`); if (!started && output.includes(marker)) { started = true; clearTimeout(timer); resolve(child); } };
    child.stdout.on('data', log); child.stderr.on('data', log);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); if (!started) reject(new Error(`${name} exited before ready (${code}).`)); else if (!stopping) { console.error(`${name} stopped; shutting down this stack.`); stop(1); } });
  });
}
async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.CI) throw new Error('dev:auth is for local development only.');
  if (!fs.existsSync(path.join(root, '.env'))) throw new Error('Root .env is missing. Follow apps/auth-service/README.md configuration prerequisites.');
  const local = parseEnv(fs.readFileSync(path.join(root, '.env'), 'utf8'));
  const settings = { ...local, ...process.env };
  const template = settings.LOCAL_AUTH_DATABASE_URL;
  if (!template) throw new Error('Set LOCAL_AUTH_DATABASE_URL in root .env.');
  const databaseUrl = template.replace(/\$\{(\w+)\}/g, (_, key) => { if (!settings[key]) throw new Error(`Missing ${key} for database configuration.`); return settings[key]; });
  if (!settings.JWT_SECRET || settings.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random secret of at least 32 characters in root .env.');
  const certDir = path.join(root, 'infra/certs');
  for (const file of ['ca.crt','auth-service.crt','auth-service.key','api-gateway.crt','api-gateway.key']) if (!fs.existsSync(path.join(certDir, file))) throw new Error(`Missing infra/certs/${file}. Coordinate development certificates with the team; this launcher will not overwrite your CA.`);
  const ports = { frontend: Number(process.env.AUTH_LOCAL_FRONTEND_PORT || 3000), gateway: Number(process.env.AUTH_LOCAL_GATEWAY_PORT || 4000), auth: Number(process.env.AUTH_LOCAL_GRPC_PORT || 50051) };
  for (const port of Object.values(ports)) { if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local port.'); await portFree(port); }
  const origin = `http://127.0.0.1:${ports.frontend}`;
  console.log('Starting PostgreSQL and Valkey (existing volumes are preserved)…');
  await command('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'valkey']);
  await command('npm', ['run', 'build', '--workspace=auth-service']);
  await command('npm', ['run', 'build', '--workspace=api-gateway']);
  console.log('Applying additive admin account schema (existing data preserved)…');
  await command('npm', ['run', 'schema:admin', '--workspace=auth-service'], { ...process.env, DATABASE_URL: databaseUrl });
  const { PrismaClient } = require('../apps/auth-service/generated/prisma');
  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  try { await db.user.findFirst({ select: { id: true } }); }
  catch { throw new Error('Auth database/users table is unavailable. Check LOCAL_AUTH_DATABASE_URL and apply the Auth database schema; no tables were reset.'); }
  finally { await db.$disconnect(); }
  const env = { ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', TLS_CERT_DIR: certDir };
  for (const key of ['TLS_CA_PATH','TLS_CERT_PATH','TLS_KEY_PATH']) delete env[key];
  await service('Auth', path.join(root, 'apps/auth-service'), ['dist/main.js'], { ...env, PORT: String(ports.auth), DATABASE_URL: databaseUrl, JWT_SECRET: settings.JWT_SECRET, VALKEY_HOST: '127.0.0.1', VALKEY_PORT: settings.VALKEY_PORT || '6379' }, 'Secure Auth gRPC server listening');
  await service('Gateway', path.join(root, 'apps/api-gateway'), ['dist/main.js'], { ...env, PORT: String(ports.gateway), AUTH_SERVICE_ADDR: `localhost:${ports.auth}`, FRONTEND_ORIGIN: origin }, 'Nest application successfully started');
  await service('Frontend', path.join(root, 'apps/frontend'), [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(ports.frontend)], { ...env, ROBONEST_AUTH_ENABLED: 'true', ROBONEST_VERIFIED_CAPABILITIES: '', API_GATEWAY_URL: `http://127.0.0.1:${ports.gateway}`, NEXT_DIST_DIR: `.next-auth-local-${ports.frontend}` }, 'Ready');
  const response = await fetch(`${origin}/graphql`, { method: 'POST', headers: { 'Content-Type':'application/json', Origin:origin, Cookie:'shop_session=startup-readiness-invalid-token' }, body: JSON.stringify({ query:'query { me { id } }' }) });
  const body = await response.json();
  if (body.errors?.[0]?.extensions?.code !== 'UNAUTHENTICATED') throw new Error('Frontend → gateway → mTLS Auth readiness check failed.');
  console.log(`\nAuthentication stack ready: ${origin}/login\nCustomer signup: ${origin}/signup\nAdmin workspace: ${origin}/admin\nCtrl+C stops these app processes. PostgreSQL/Valkey remain running.\n`);
}
main().catch(error => { console.error(`\nAuth startup failed: ${error.message}`); stop(1); });
