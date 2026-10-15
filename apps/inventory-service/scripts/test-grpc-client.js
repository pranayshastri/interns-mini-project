const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const fs = require('fs');

const PROTO_PATH = path.resolve(__dirname, '../../../packages/proto/inventory.proto');
const CERT_DIR = path.resolve(__dirname, '../../../infra/certs');
const TARGET = 'localhost:50054';

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const proto = grpc.loadPackageDefinition(packageDef);
const Service = proto.shop.inventory.v1.InventoryService;

async function test() {
  // Test 1: Insecure client should be rejected
  console.log('=== Test 1: mTLS rejection (insecure client) ===');
  const insecureClient = new Service(TARGET, grpc.credentials.createInsecure());
  await new Promise((resolve) => {
    insecureClient.waitForReady(new Date(Date.now() + 3000), (err) => {
      if (err) console.log('PASS: Insecure client rejected (mTLS enforced)');
      else console.log('FAIL: Insecure client connected');
      insecureClient.close();
      resolve();
    });
  });

  // Test 2: Secure client
  console.log('=== Test 2: Secure mTLS client ===');
  const caCert = fs.readFileSync(path.join(CERT_DIR, 'ca.crt'));
  const clientCert = fs.readFileSync(path.join(CERT_DIR, 'api-gateway.crt'));
  const clientKey = fs.readFileSync(path.join(CERT_DIR, 'api-gateway.key'));
  const creds = grpc.credentials.createSsl(caCert, clientKey, clientCert);
  const client = new Service(TARGET, creds);

  await new Promise((resolve) => {
    client.waitForReady(new Date(Date.now() + 5000), async (err) => {
      if (err) {
        console.log('FAIL: Secure client failed:', err.message);
        return resolve();
      }
      console.log('PASS: Secure client connected');

      client.GetStock({ product_id: 'e0000000-0000-0000-0000-000000000001' }, (err2, res) => {
        if (err2) {
          console.log('FAIL: GetStock failed:', err2.message);
        } else {
          console.log('PASS: GetStock =>', JSON.stringify(res));
        }

        client.UpdateStock({ product_id: 'e0000000-0000-0000-0000-000000000001', delta: -5 }, (err3, res3) => {
          if (err3) {
            console.log('FAIL: UpdateStock failed:', err3.message);
          } else {
            console.log('PASS: UpdateStock =>', JSON.stringify(res3));
          }

          client.GetStock({ product_id: 'e0000000-0000-0000-0000-000000000001' }, (err4, res4) => {
            if (err4) {
              console.log('FAIL: GetStock verify failed:', err4.message);
            } else {
              console.log('PASS: GetStock (after update) =>', JSON.stringify(res4));
            }

            // Test 3: Untrusted cert rejected
            console.log('=== Test 3: mTLS rejection (untrusted cert) ===');
            const untrustedCert = fs.readFileSync(path.join(CERT_DIR, 'untrusted.crt'));
            const untrustedKey = fs.readFileSync(path.join(CERT_DIR, 'untrusted.key'));
            const untrustedCreds = grpc.credentials.createSsl(caCert, untrustedKey, untrustedCert);
            const untrustedClient = new Service(TARGET, untrustedCreds);
            untrustedClient.waitForReady(new Date(Date.now() + 3000), (err5) => {
              if (err5) console.log('PASS: Untrusted cert rejected');
              else console.log('FAIL: Untrusted client connected');
              untrustedClient.close();
              client.close();
              resolve();
            });
          });
        });
      });
    });
  });
}

test().then(() => {
  console.log('\n=== Done ===');
  process.exit(0);
}).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
