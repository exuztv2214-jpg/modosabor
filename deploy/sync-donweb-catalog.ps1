param(
  [string]$HostName = $env:MODOSABOR_VPS_HOST,
  [string]$Port = $env:MODOSABOR_VPS_PORT,
  [string]$User = $env:MODOSABOR_VPS_USER,
  [string]$RemotePath = $env:MODOSABOR_VPS_PATH,
  [switch]$LocalOnly
)

$ErrorActionPreference = "Stop"

if (-not $HostName) { $HostName = "149.50.133.118" }
if (-not $Port) { $Port = "5942" }
if (-not $User) { $User = "root" }
if (-not $RemotePath) { $RemotePath = "/opt/modosabor" }

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$exportPath = Join-Path $root "deploy\catalog-export.json"

Push-Location $root
try {
  node server/scripts/export-catalog.js $exportPath
  if ($LASTEXITCODE -ne 0) { throw "No se pudo exportar el catalogo local." }

  if ($LocalOnly) {
    Write-Host "Catalogo exportado localmente. No se conecto al VPS por -LocalOnly."
    return
  }

  scp -P $Port $exportPath "$User@$HostName`:/root/modosabor-catalog-export.json"
  if ($LASTEXITCODE -ne 0) { throw "No se pudo subir el catalogo al VPS." }

  scp -P $Port "server/scripts/import-catalog.js" "$User@$HostName`:$RemotePath/server/scripts/_import-catalog.remote.js"
  if ($LASTEXITCODE -ne 0) { throw "No se pudo subir el importador al VPS." }

  $remoteCommand = "cd $RemotePath/server && node scripts/_import-catalog.remote.js /root/modosabor-catalog-export.json && rm -f scripts/_import-catalog.remote.js /root/modosabor-catalog-export.json && pm2 restart modosabor --update-env"
  ssh -p $Port "$User@$HostName" $remoteCommand
  if ($LASTEXITCODE -ne 0) { throw "No se pudo importar el catalogo en DonWeb." }

  Write-Host "Catalogo DonWeb sincronizado desde local."
} finally {
  Pop-Location
}
