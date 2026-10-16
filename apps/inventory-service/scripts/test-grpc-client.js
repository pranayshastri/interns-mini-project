const assert = require('node:assert/strict');
const grpc = require('@grpc/grpc-js');
const loader = require('@grpc/proto-loader');
const { resolve } = require('node:path');
const { readFileSync } = require('node:fs');
const { PROTO_PATHS } = require('@repo/proto');
const { productId } = require('@repo/proto/seed-ids.json');
const certDir = process.env.TLS_CERT_DIR || resolve(__dirname, '../../../infra/certs');
const pem = name => readFileSync(resolve(certDir, name));
const Service = grpc.loadPackageDefinition(loader.loadSync(PROTO_PATHS.inventory, { keepCase: true, defaults: true })).shop.inventory.v1.InventoryService;
async function stock(credentials) {
  const client = new Service(process.env.INVENTORY_SERVICE_ADDR || 'localhost:50054', credentials);
  try {
    return await new Promise((resolve, reject) => client.getStock({ product_id: productId }, { deadline: Date.now() + 3000 }, (error, value) => error ? reject(error) : resolve(value)));
  } finally { client.close(); }
}
async function main() {
  // Establish healthy secure connectivity first: an offline server must not pass.
  const result = await stock(grpc.credentials.createSsl(pem('ca.crt'), pem('api-gateway.key'), pem('api-gateway.crt')));
  assert.equal(result.product_id, productId);
  assert.ok(Number.isInteger(result.available_stock) && result.available_stock >= 0);
  for (const credentials of [grpc.credentials.createInsecure(), grpc.credentials.createSsl(pem('ca.crt')), grpc.credentials.createSsl(pem('ca.crt'), pem('untrusted.key'), pem('untrusted.crt'))]) {
    await assert.rejects(stock(credentials), error => [grpc.status.UNAVAILABLE, grpc.status.DEADLINE_EXCEEDED].includes(error.code));
  }
  console.log('PASS: seed stock read and mTLS rejection checks (no stock changed)');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
