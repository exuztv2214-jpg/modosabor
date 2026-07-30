param(
  [string]$BaseUrl = $(if ($env:MODOSABOR_PUBLIC_URL) { $env:MODOSABOR_PUBLIC_URL } else { "https://modosabor.com.ar" })
)

$ErrorActionPreference = "Stop"

Write-Host "Chequeando salud de $BaseUrl"

$healthUrl = "$($BaseUrl.TrimEnd('/'))/api/health"
$response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 20

Write-Host ""
Write-Host "Health endpoint:"
$response | ConvertTo-Json -Depth 6

if (-not $response.ok) {
  throw "La API no respondió OK."
}

Write-Host ""
Write-Host "Chequeo completo OK"
