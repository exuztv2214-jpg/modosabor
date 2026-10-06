$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'No se encontró Node.js en el sistema.' }
$server = Join-Path $root 'server.js'
$url = 'http://127.0.0.1:3867'
Start-Process -WindowStyle Hidden -WorkingDirectory $root -FilePath $node -ArgumentList "`"$server`""
Start-Sleep -Seconds 2
Start-Process $url
