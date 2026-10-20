#!/usr/bin/env bash
#
# Generates the internal Root CA and the per-service mTLS certificates used by
# the gRPC mesh. The script is idempotent: an existing Root CA and existing
# service certificates are reused, so running it never invalidates a CA that
# the rest of the team already trusts.
#
# Usage:
#   ./scripts/generate-certs.sh            # create only what is missing
#   ./scripts/generate-certs.sh --force    # discard everything and re-issue
#
set -euo pipefail

# Resolve the repository root from this script's own location so the script can
# be invoked from any working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CERT_DIR="${REPO_ROOT}/infra/certs"

FORCE=0
if [ "$#" -gt 0 ]; then
  for arg in "$@"; do
    case "$arg" in
      --force|-f)
        FORCE=1
        ;;
      -h|--help)
        echo "Usage: $(basename "$0") [--force]"
        echo ""
        echo "  --force  Discard the existing Root CA and service certificates and"
        echo "           re-issue them. Use this only when the CA itself must be"
        echo "           replaced, because every peer must then trust the new CA."
        exit 0
        ;;
      *)
        echo "Unknown option: $arg" >&2
        echo "Usage: $(basename "$0") [--force]" >&2
        exit 2
        ;;
    esac
  done
fi

mkdir -p "$CERT_DIR"
cd "$CERT_DIR"

if [ "$FORCE" -eq 1 ]; then
  echo "=== 0. Forced regeneration: discarding existing certificates ==="
  rm -f ./*.key ./*.crt ./*.srl
fi

if [ -f "ca.key" ] && [ -f "ca.crt" ]; then
  echo "=== 1. Using Existing Root Certificate Authority (CA) ==="
else
  echo "=== 1. Generating Root Certificate Authority (CA) ==="
  openssl genrsa -out ca.key 4096
  openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt \
    -subj "/C=US/ST=Dev/L=Local/O=ShoppingPlatform/OU=Security/CN=Internal-Root-CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
fi

# Portable in-place substitution. GNU sed and BSD sed disagree about the
# argument to -i, so write to a temporary file and move it into place instead.
replace_in_file() {
  local file="$1"
  shift
  local tmp="${file}.tmp"
  sed "$@" "$file" > "$tmp"
  mv "$tmp" "$file"
}

generate_cert() {
  local NAME=$1
  local SAN=$2

  if [ -f "${NAME}.crt" ] && [ -f "${NAME}.key" ]; then
    echo "=== Certificate for $NAME already exists, skipping ==="
    return
  fi

  echo "=== Generating Certificate for: $NAME ==="
  openssl genrsa -out "${NAME}.key" 2048

  cat > "${NAME}.cnf" << 'EOF_CNF'
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
C = US
O = ShoppingPlatform
CN = NAMESHOLDER

[req_ext]
subjectAltName = SANHOLDER
EOF_CNF

  replace_in_file "${NAME}.cnf" "s/NAMESHOLDER/${NAME}/g"
  replace_in_file "${NAME}.cnf" "s|SANHOLDER|${SAN}|g"

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
if [ ! -f "untrusted.crt" ] || [ "$FORCE" -eq 1 ]; then
  echo "=== Generating Untrusted Attacker Certificate (Self-Signed) ==="
  openssl req -x509 -newkey rsa:2048 -nodes -keyout untrusted.key -out untrusted.crt -days 30 \
    -subj "/C=US/O=Hacker/CN=untrusted-client"
fi

echo "=== Certificates ready in $CERT_DIR ==="
