<#
.SYNOPSIS
Generates the internal Root CA and the per-service mTLS certificates used by the
gRPC mesh.

.DESCRIPTION
The script is idempotent: an existing Root CA and existing service certificates
are reused, so running it never invalidates a CA that the rest of the team
already trusts. Use -Force to deliberately discard and re-issue everything.

.EXAMPLE
.\scripts\generate-certs.ps1
.\scripts\generate-certs.ps1 -Force
#>
param(
    [switch]$Force,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host "Usage: generate-certs.ps1 [-Force] [-Help]"
    Write-Host ""
    Write-Host "  -Force  Discard the existing Root CA and service certificates and"
    Write-Host "          re-issue them. Use this only when the CA itself must be"
    Write-Host "          replaced, because every peer must then trust the new CA."
    exit 0
}

# Resolve the repository root from this script's own location so the script can
# be invoked from any working directory.
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$CertDir = Join-Path $RepoRoot "infra\certs"

if (!(Test-Path $CertDir)) {
    New-Item -ItemType Directory -Path $CertDir -Force | Out-Null
}

Push-Location $CertDir

try {
    if ($Force) {
        Write-Host "=== 0. Forced regeneration: discarding existing certificates ==="
        Get-ChildItem -Path $CertDir -File |
            Where-Object { $_.Extension -in ".key", ".crt", ".srl" } |
            Remove-Item -Force
    }

    $caKeyExists = Test-Path "ca.key"
    $caCrtExists = Test-Path "ca.crt"

    if ($caKeyExists -and $caCrtExists) {
        Write-Host "=== 1. Using Existing Root Certificate Authority (CA) ==="
    }
    elseif (-not $caKeyExists -and -not $caCrtExists) {
        Write-Host "=== 1. Generating Root Certificate Authority (CA) ==="
        & openssl genrsa -out ca.key 4096
        & openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt `
            -subj "/C=US/ST=Dev/L=Local/O=ShoppingPlatform/OU=Security/CN=Internal-Root-CA" `
            -addext "basicConstraints=critical,CA:TRUE" `
            -addext "keyUsage=critical,keyCertSign,cRLSign"
    }
    else {
        Write-Host "=== 1. ERROR: Half-existing CA detected ===" > $null
        Write-Host "    One of ca.key/ca.crt is missing while the other exists." > $null
        Write-Host "    This would generate a new CA that invalidates existing service certificates." > $null
        Write-Host "    Please either:" > $null
        Write-Host "    1. Restore the original CA files, or" > $null
        Write-Host "    2. Run with -Force to regenerate everything." > $null
        exit 1
    }

    function Generate-Cert($Name, $San) {
        if ((Test-Path "$Name.crt") -and (Test-Path "$Name.key")) {
            Write-Host "=== Certificate for $Name already exists, skipping ==="
            return
        }

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
    Generate-Cert "notification-service" "DNS:notification-service,DNS:localhost,IP:127.0.0.1"
    Generate-Cert "api-gateway" "DNS:api-gateway,DNS:localhost,IP:127.0.0.1"

    if ((-not (Test-Path "untrusted.crt")) -or $Force) {
        Write-Host "=== Generating Untrusted Attacker Certificate (Self-Signed) ==="
        & openssl req -x509 -newkey rsa:2048 -nodes -keyout untrusted.key -out untrusted.crt -days 30 `
            -subj "/C=US/O=Hacker/CN=untrusted-client"
    }

    Write-Host "=== Certificates ready in $CertDir ==="
}
finally {
    Pop-Location
}
