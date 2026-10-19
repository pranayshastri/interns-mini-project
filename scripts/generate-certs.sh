#!/usr/bin/env bash
set -e

CERT_DIR="./infra/certs"
mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

echo "=== 1. Generating Root Certificate Authority (CA) ==="
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
  -subj "/C=US/ST=Dev/L=Local/O=ShoppingPlatform/OU=Security/CN=Internal-Root-CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

generate_cert() {
  local NAME=$1
  local SAN=$2

  echo "=== Generating Certificate for: $NAME ==="
  openssl genrsa -out "${NAME}.key" 2048

  cat > "${NAME}.cnf" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
C = US
O = ShoppingPlatform
CN = ${NAME}

[req_ext]
subjectAltName = ${SAN}
EOF

  openssl req -new -key "${NAME}.key" -out "${NAME}.csr" -config "${NAME}.cnf"
  openssl x509 -req -in "${NAME}.csr" -CA ca.crt -CAkey ca.key \
    -CAcreateserial -out "${NAME}.crt" -days 365 -sha256 \
    -extfile "${NAME}.cnf" -extensions req_ext
  rm -f "${NAME}.csr" "${NAME}.cnf"
}

# Generate Service Certificates (with DNS names matching Docker Compose service names)
generate_cert "auth-service" "DNS:auth-service,DNS:localhost,IP:127.0.0.1"
generate_cert "catalog-service" "DNS:catalog-service,DNS:localhost,IP:127.0.0.1"
generate_cert "order-service" "DNS:order-service,DNS:localhost,IP:127.0.0.1"
generate_cert "inventory-service" "DNS:inventory-service,DNS:localhost,IP:127.0.0.1"
generate_cert "notification-service" "DNS:notification-service,DNS:localhost,IP:127.0.0.1"
generate_cert "api-gateway" "DNS:api-gateway,DNS:localhost,IP:127.0.0.1"

# Generate an UNTRUSTED certificate to test failure cases!
echo "=== Generating Untrusted Attacker Certificate (Self-Signed) ==="
openssl req -x509 -newkey rsa:2048 -nodes -keyout untrusted.key -out untrusted.crt -days 30 \
  -subj "/C=US/O=Hacker/CN=untrusted-client"

echo "=== Certificates ready in $CERT_DIR ==="
