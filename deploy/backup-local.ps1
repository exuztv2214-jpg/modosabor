param(
  [string]$DestinationRoot = "D:\Backups\ModoSabor"
)

$ErrorActionPreference = "Continue"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = Join-Path $DestinationRoot "local-$stamp"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$items = @(
  "server\data",
  "server\uploads",
  "deploy",
  "agente-whatsapp",
  "Iniciar_WhatsApp_Copiloto.bat",
  "Instalar_WhatsApp_Copiloto_Inicio_Windows.bat",
  "package.json",
  "package-lock.json",
  "server\package.json",
  "server\package-lock.json",
  "client\package.json",
  "client\package-lock.json",
  "railway.json",
  "Dockerfile",
  "bitacora-claude.md",
  "PLAN_DE_ACCION.md",
  "docs"
)

foreach ($item in $items) {
  $src = Join-Path (Get-Location) $item
  if (Test-Path $src) {
    Copy-Item -LiteralPath $src -Destination $dest -Recurse -Force
  }
}

$zip = "$dest.zip"
Compress-Archive -Path (Join-Path $dest "*") -DestinationPath $zip -Force

$manifest = [pscustomobject]@{
  created_at = (Get-Date).ToString("s")
  source = (Get-Location).Path
  folder = $dest
  zip = $zip
  db = Get-Item "server\data\modosabor.db" -ErrorAction SilentlyContinue | Select-Object FullName,Length,LastWriteTime
  uploads_count = (Get-ChildItem "server\uploads" -File -Recurse -ErrorAction SilentlyContinue | Measure-Object).Count
  zip_size = (Get-Item $zip).Length
}

$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $dest "manifest.json") -Encoding UTF8
$manifest | ConvertTo-Json -Depth 5
