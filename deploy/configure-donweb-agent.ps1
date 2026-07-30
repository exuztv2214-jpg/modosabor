param(
  [string]$VpsHost = $env:MODOSABOR_VPS_HOST,
  [string]$Port = $(if ($env:MODOSABOR_VPS_PORT) { $env:MODOSABOR_VPS_PORT } else { "5942" }),
  [string]$User = $(if ($env:MODOSABOR_VPS_USER) { $env:MODOSABOR_VPS_USER } else { "root" }),
  [string]$RemotePath = $(if ($env:MODOSABOR_VPS_PATH) { $env:MODOSABOR_VPS_PATH } else { "/opt/modosabor" }),
  [string]$AgentApiKey = $env:AGENT_API_KEY
)

$ErrorActionPreference = "Stop"

if (-not $VpsHost) {
  throw "Defini MODOSABOR_VPS_HOST o pasá -VpsHost."
}

if (-not $AgentApiKey) {
  $localEnv = Join-Path (Split-Path -Parent $PSScriptRoot) "server\.env"
  if (Test-Path $localEnv) {
    $line = Get-Content $localEnv | Where-Object { $_ -match '^AGENT_API_KEY=' } | Select-Object -First 1
    if ($line) {
      $AgentApiKey = $line -replace '^AGENT_API_KEY=', ''
    }
  }
}

if (-not $AgentApiKey) {
  throw "No encontre AGENT_API_KEY. Definila en server\.env o como variable de entorno."
}

$remote = "$User@$VpsHost"
$remoteEnv = "$RemotePath/server/.env"
$escapedKey = $AgentApiKey.Replace("'", "'\''")

$remoteCommand = @"
set -e
mkdir -p '$RemotePath/server'
touch '$remoteEnv'
if grep -q '^AGENT_API_KEY=' '$remoteEnv'; then
  sed -i 's|^AGENT_API_KEY=.*|AGENT_API_KEY=$escapedKey|' '$remoteEnv'
else
  printf '\nAGENT_API_KEY=$escapedKey\n' >> '$remoteEnv'
fi
pm2 restart modosabor --update-env
sleep 3
curl -fsS https://modosabor.com.ar/api/health
"@

ssh -p $Port $remote $remoteCommand
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo conectar/configurar DonWeb por SSH. Revisa host, puerto, usuario o contrasena del VPS."
}

Write-Host "AGENT_API_KEY configurado en DonWeb."
