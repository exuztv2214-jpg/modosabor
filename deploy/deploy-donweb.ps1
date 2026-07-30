param(
  [string]$VpsHost = $env:MODOSABOR_VPS_HOST,
  [string]$Port = $(if ($env:MODOSABOR_VPS_PORT) { $env:MODOSABOR_VPS_PORT } else { "22" }),
  [string]$User = $(if ($env:MODOSABOR_VPS_USER) { $env:MODOSABOR_VPS_USER } else { "root" }),
  [string]$RemotePath = $(if ($env:MODOSABOR_VPS_PATH) { $env:MODOSABOR_VPS_PATH } else { "/opt/modosabor" }),
  [string]$PackagePath = "D:\Proyectos\modosabor1\deploy\modosabor-donweb.tgz"
)

$ErrorActionPreference = "Stop"

if (-not $VpsHost) {
  throw "Defini MODOSABOR_VPS_HOST o pasá -VpsHost."
}

if (-not $RemotePath -or $RemotePath.Trim() -eq "" -or $RemotePath -eq "/") {
  throw "MODOSABOR_VPS_PATH no puede estar vacio ni ser '/'."
}

if (-not $Port -or $Port.Trim() -eq "") {
  throw "MODOSABOR_VPS_PORT no puede estar vacio."
}

Write-Host "Validando build local antes de subir..."
npm run build
if ($LASTEXITCODE -ne 0) {
  throw "El build local fallo. No se sube a DonWeb."
}

& "$PSScriptRoot\package-donweb.ps1" -Output $PackagePath
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo generar el paquete DonWeb."
}

$remote = "$User@$VpsHost"
$remotePackage = "/root/modosabor-donweb.tgz"
$remoteDeployScript = "/root/modosabor-deploy.sh"

scp -P $Port $PackagePath "${remote}:$remotePackage"
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo subir el paquete a DonWeb por SCP."
}

$remoteScript = @'
set -e
PERSIST_DIR=/root/modosabor-persist
mkdir -p "$PERSIST_DIR"

if [ -f __REMOTE_PATH__/server/.env ]; then
  cp __REMOTE_PATH__/server/.env "$PERSIST_DIR/server.env"
fi

if [ -d __REMOTE_PATH__/server/data ]; then
  rm -rf "$PERSIST_DIR/data"
  cp -a __REMOTE_PATH__/server/data "$PERSIST_DIR/data"
fi

if [ -d __REMOTE_PATH__/server/uploads ]; then
  rm -rf "$PERSIST_DIR/uploads"
  cp -a __REMOTE_PATH__/server/uploads "$PERSIST_DIR/uploads"
fi

mkdir -p __REMOTE_PATH__
rm -rf __REMOTE_PATH__/*
tar -xzf __REMOTE_PACKAGE__ -C __REMOTE_PATH__

mkdir -p __REMOTE_PATH__/server

if [ -f "$PERSIST_DIR/server.env" ]; then
  cp "$PERSIST_DIR/server.env" __REMOTE_PATH__/server/.env
fi

if [ -d "$PERSIST_DIR/data" ]; then
  rm -rf __REMOTE_PATH__/server/data
  cp -a "$PERSIST_DIR/data" __REMOTE_PATH__/server/data
fi

if [ -d "$PERSIST_DIR/uploads" ]; then
  rm -rf __REMOTE_PATH__/server/uploads
  cp -a "$PERSIST_DIR/uploads" __REMOTE_PATH__/server/uploads
fi

cd __REMOTE_PATH__/server
npm install

cd __REMOTE_PATH__/client
chmod +x node_modules/.bin/vite || true
npm install
npm run build

cd __REMOTE_PATH__
pm2 restart modosabor --update-env || NODE_ENV=production pm2 start server/index.js --name modosabor --time
pm2 save
systemctl reload nginx || true
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:3001/api/health; then
    exit 0
  fi
  sleep 3
done
echo "La app no respondió a tiempo en http://127.0.0.1:3001/api/health" >&2
exit 1
'@

$remoteScript = $remoteScript.Replace('__REMOTE_PATH__', $RemotePath).Replace('__REMOTE_PACKAGE__', $remotePackage)

$localDeployScript = Join-Path $env:TEMP "modosabor-donweb-deploy.sh"
try {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($localDeployScript, $remoteScript, $utf8NoBom)

  scp -P $Port $localDeployScript "${remote}:$remoteDeployScript"
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo subir el script de deploy a DonWeb por SCP."
  }

  ssh -p $Port $remote "bash $remoteDeployScript"
  if ($LASTEXITCODE -ne 0) {
    throw "El deploy remoto fallo en DonWeb."
  }
} finally {
  if (Test-Path $localDeployScript) {
    Remove-Item $localDeployScript -Force
  }
}

Write-Host "Deploy DonWeb completado en $VpsHost"
