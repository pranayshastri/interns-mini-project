#!/usr/bin/env node
// Local, explicit provisioning for privileged roles. CUSTOMER uses public signup.
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('../generated/prisma');

function usage() {
  return 'Usage: npm run account:provision --workspace=auth-service -- --role ADMIN|SHOPKEEPER --email address --name "Full Name" [--shop-id UUID]';
}
function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--role', '--email', '--name', '--shop-id'].includes(key) || !args[i + 1] || result[key]) throw new Error(usage());
    result[key] = args[i + 1];
  }
  const role = result['--role'];
  if (role !== 'ADMIN' && role !== 'SHOPKEEPER') throw new Error('Only ADMIN and SHOPKEEPER may be provisioned here. CUSTOMER uses /signup.\n' + usage());
  const email = result['--email']?.trim().toLowerCase();
  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide a valid email address.');
  const fullName = result['--name']?.trim().replace(/\s+/g, ' ');
  if (!fullName || fullName.length > 128 || /[\x00-\x1f\x7f]/.test(fullName)) throw new Error('Provide a full name of 1–128 characters.');
  const shopId = result['--shop-id'];
  if (role === 'SHOPKEEPER' && (!shopId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(shopId))) throw new Error('SHOPKEEPER requires an existing shop UUID via --shop-id. Confirm it with the shop owner.');
  if (role === 'ADMIN' && shopId) throw new Error('ADMIN must not have a shop ID.');
  return { role, email, fullName, shopId: shopId || null };
}
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  let local;
  try { local = parseEnv(readFileSync(resolve(__dirname, '../../../.env'), 'utf8')); }
  catch { throw new Error('Root .env is missing. Set DATABASE_URL or configure LOCAL_AUTH_DATABASE_URL.'); }
  const settings = { ...local, ...process.env };
  const template = settings.LOCAL_AUTH_DATABASE_URL;
  if (!template) throw new Error('LOCAL_AUTH_DATABASE_URL is missing.');
  return template.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => {
    if (!settings[key]) throw new Error(`Missing ${key} for database connection.`);
    return settings[key];
  });
}
async function readPassword() {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk.toString('utf8');
    const password = input.split(/\r?\n/, 1)[0];
    if (!password) throw new Error('Password was not supplied on stdin.');
    return password;
  }
  return new Promise((resolvePassword, reject) => {
    process.stdout.write('New password (input hidden): ');
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = (error) => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      error ? reject(error) : resolvePassword(value);
    };
    function onData(buffer) {
      for (const ch of buffer.toString('utf8')) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') return finish(new Error('Cancelled.'));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    }
    process.stdin.on('data', onData);
  });
}
async function main() {
  const account = options(process.argv.slice(2));
  const url = databaseUrl();
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const existing = await db.user.findUnique({ where: { email: account.email }, select: { id: true } });
    if (existing) throw new Error('This email already has an account. No role or password was changed.');
    const password = await readPassword();
    if ([...password].length < 8 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password must be at least 8 characters and at most 72 UTF-8 bytes.');
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await db.user.create({ data: { ...account, passwordHash }, select: { id: true, email: true, role: true, shopId: true } });
      console.log(`Created ${user.role} account ${user.email} (id ${user.id}${user.shopId ? `, shop ${user.shopId}` : ''}). Sign in at /login.`);
    } catch (error) {
      if (error.code === 'P2002') throw new Error('This email already has an account. No role or password was changed.');
      throw error;
    }
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(`Provisioning failed: ${error.message}`); process.exitCode = 1; });
