$ErrorActionPreference = "Stop"

$CERT_DIR = Join-Path $PSScriptRoot "..\infra\certs"
if (!(Test-Path $CERT_DIR)) {
    New-Item -ItemType Directory -Path $CERT_DIR -Force | Out-Null
}

Push-Location $CERT_DIR

Write-Host "=== 1. Generating Root Certificate Authority (CA) ==="
& openssl genrsa -out ca.key 4096
& openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt `
  -subj "/C=US/ST=Dev/L=Local/O=ShoppingPlatform/OU=Security/CN=Internal-Root-CA"

function Generate-Cert($Name, $San) {
    Write-Host "=== Generating Certificate for: $Name ==="
    & openssl genrsa -out "$Name.key" 2048

    $cnfContent = @"
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
C = US
O = ShoppingPlatform
CN = $Name

[req_ext]
subjectAltName = $San
"@
    Set-Content -Path "$Name.cnf" -Value $cnfContent

    & openssl req -new -key "$Name.key" -out "$Name.csr" -config "$Name.cnf"
    & openssl x509 -req -in "$Name.csr" -CA ca.crt -CAkey ca.key `
      -CAcreateserial -out "$Name.crt" -days 365 -sha256 `
      -extfile "$Name.cnf" -extensions req_ext
    Remove-Item "$Name.csr", "$Name.cnf" -Force
}

Generate-Cert "auth-service" "DNS:auth-service,DNS:localhost,IP:127.0.0.1"
Generate-Cert "catalog-service" "DNS:catalog-service,DNS:localhost,IP:127.0.0.1"
Generate-Cert "order-service" "DNS:order-service,DNS:localhost,IP:127.0.0.1"
Generate-Cert "inventory-service" "DNS:inventory-service,DNS:localhost,IP:127.0.0.1"
Generate-Cert "api-gateway" "DNS:api-gateway,DNS:localhost,IP:127.0.0.1"

Write-Host "=== Generating Untrusted Attacker Certificate (Self-Signed) ==="
& openssl req -x509 -newkey rsa:2048 -nodes -keyout untrusted.key -out untrusted.crt -days 30 `
  -subj "/C=US/O=Hacker/CN=untrusted-client"

Pop-Location
Write-Host "=== Certificates ready in $CERT_DIR ==="
