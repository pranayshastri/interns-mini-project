#!/bin/bash
set -e

CERT_DIR="/mnt/c/Users/bbraw/Desktop/e-commerce/interns-mini-project/infra/certs"
TMP_DIR="/tmp/certgen"
mkdir -p "$TMP_DIR"
cd "$TMP_DIR"

# Generate CA with proper extensions
openssl genrsa -out ca.key 4096 2>/dev/null

cat > ca.cnf << CAEOF
[req]
distinguished_name = dn
x509_extensions = v3_ca
prompt = no

[dn]
C = US
ST = Dev
L = Local
O = ShoppingPlatform
OU = Security
CN = Internal-Root-CA

[v3_ca]
subjectAltName = DNS:localhost,IP:127.0.0.1
basicConstraints = critical, CA:TRUE
CAEOF

openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
  -subj "/C=US/ST=Dev/L=Local/O=ShoppingPlatform/OU=Security/CN=Internal-Root-CA" \
  -extensions v3_ca -config ca.cnf

cp ca.key "$CERT_DIR/ca.key"
cp ca.crt "$CERT_DIR/ca.crt"
cp ca.srl "$CERT_DIR/ca.srl" 2>/dev/null || true

CA_CERT="$CERT_DIR/ca.crt"
CA_KEY="$CERT_DIR/ca.key"

for svc in auth-service catalog-service order-service inventory-service api-gateway; do
  openssl genrsa -out "${svc}.key" 2048 2>/dev/null
  
  cat > "${svc}.cnf" << SVCEOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
C = US
O = ShoppingPlatform
CN = ${svc}

[req_ext]
subjectAltName = DNS:${svc},DNS:localhost,IP:127.0.0.1
SVCEOF

  openssl req -new -key "${svc}.key" -out "${svc}.csr" -config "${svc}.cnf"
  openssl x509 -req -in "${svc}.csr" -CA "$CA_CERT" -CAkey "$CA_KEY" \
    -CAcreateserial -out "$CERT_DIR/${svc}.crt" -days 365 -sha256 \
    -extfile "${svc}.cnf" -extensions req_ext
  cp "${svc}.key" "$CERT_DIR/${svc}.key"
  rm -f "${svc}.csr" "${svc}.cnf"
done

# Generate untrusted cert
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$CERT_DIR/untrusted.key" -out "$CERT_DIR/untrusted.crt" -days 30 \
  -subj "/C=US/O=Hacker/CN=untrusted-client"

echo "=== Certificates regenerated ==="
openssl verify -CAfile "$CA_CERT" "$CERT_DIR/api-gateway.crt"
