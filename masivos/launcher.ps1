$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'No se encontró Node.js en el sistema.' }
$server = Join-Path $root 'server.js'
# Configuración local (dirección del sistema y token compartido para pedidos y
# turnos). No se sube a git.
$envFile = Join-Path $root 'local.env'
if (Test-Path $envFile) {
  Get-Content $envFile | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$' } | ForEach-Object {
    [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
  }
}
$url = 'http://127.0.0.1:3867'
Start-Process -WindowStyle Hidden -WorkingDirectory $root -FilePath $node -ArgumentList "`"$server`""
Start-Sleep -Seconds 2
Start-Process $url
