#!/usr/bin/env node
// Idempotent additive upgrade, usable with an existing unbaselined Auth database.
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { parseEnv } = require('node:util');
const { PrismaClient } = require('../generated/prisma');
async function main() {
  const file = resolve(__dirname, '../../../.env');
  const settings = { ...(existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}), ...process.env };
  const template = settings.DATABASE_URL || settings.LOCAL_AUTH_DATABASE_URL;
  if (!template) throw new Error('Set LOCAL_AUTH_DATABASE_URL in root .env.');
  const url = template.replace(/\$\{(\w+)\}/g, (_, key) => { if (!settings[key]) throw new Error(`Missing database setting ${key}.`); return settings[key]; });
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const sql = ['20261015_admin_accounts', '20261015_admin_shops'].map(name => readFileSync(resolve(__dirname, `../prisma/migrations/${name}/migration.sql`), 'utf8')).join('\n');
    await db.$transaction(async tx => { for (const statement of sql.split(';').filter(s => s.trim())) await tx.$executeRawUnsafe(statement); });
    console.log('Admin schema ready. Existing accounts and passwords preserved.');
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Admin schema upgrade failed. Check the Auth database connection and schema permissions. No database reset was attempted.'); process.exitCode = 1; });
