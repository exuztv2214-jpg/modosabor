[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$StageDirectory,
  [Parameter(Mandatory = $true)][string]$BaseUrl
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $StageDirectory).Path.TrimEnd('\')
$allowed = @(
  'uploads', 'backups', 'whatsapp-sesion', 'whatsapp-historial-legado',
  'facebook-automation-profile', 'facebook-automation-profile-v2'
)
$variables = & railway variable list --service modosabor-api --json | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or -not $variables.BOOTSTRAP_IMPORT_KEY) {
  throw 'No se pudo obtener la clave temporal de migración.'
}

$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromMinutes(4)
$client.DefaultRequestHeaders.Add('x-bootstrap-key', [string]$variables.BOOTSTRAP_IMPORT_KEY)
$url = $BaseUrl.TrimEnd('/') + '/api/migration-transfer/files'
$batchNumber = 0
$totalFiles = 0
$totalBytes = [long]0

function Send-Batch {
  param([System.IO.FileInfo[]]$Files)
  if ($Files.Count -eq 0) { return }
  $form = [System.Net.Http.MultipartFormDataContent]::new()
  $streams = [System.Collections.Generic.List[System.IO.FileStream]]::new()
  try {
    $paths = @($Files | ForEach-Object { $_.FullName.Substring($root.Length + 1).Replace('\', '/') })
    $form.Add([System.Net.Http.StringContent]::new((ConvertTo-Json -InputObject $paths -Compress)), 'paths')
    foreach ($file in $Files) {
      $stream = [System.IO.File]::OpenRead($file.FullName)
      $streams.Add($stream)
      $form.Add([System.Net.Http.StreamContent]::new($stream), 'files', $file.Name)
    }
    $response = $client.PostAsync($url, $form).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      throw "Lote $($batchNumber + 1): HTTP $([int]$response.StatusCode): $body"
    }
    $result = $body | ConvertFrom-Json
    if (-not $result.ok -or [int]$result.files -ne $Files.Count) {
      throw "Lote $($batchNumber + 1): respuesta incompleta"
    }
    $script:batchNumber += 1
    $script:totalFiles += $Files.Count
    $script:totalBytes += [long]$result.bytes
    if ($batchNumber -eq 1 -or $batchNumber % 10 -eq 0) {
      Write-Output ("Lotes $batchNumber; archivos $totalFiles; MB $([math]::Round($totalBytes / 1MB, 1))")
    }
  } finally {
    $form.Dispose()
    foreach ($stream in $streams) { $stream.Dispose() }
  }
}

try {
  $files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object {
    $relative = $_.FullName.Substring($root.Length + 1)
    $top = $relative.Split([IO.Path]::DirectorySeparatorChar)[0]
    $top -in $allowed
  } | Sort-Object FullName)
  $batch = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
  $batchBytes = [long]0
  foreach ($file in $files) {
    if ($batch.Count -ge 30 -or ($batch.Count -gt 0 -and $batchBytes + $file.Length -gt 24MB)) {
      Send-Batch -Files @($batch.ToArray())
      $batch.Clear()
      $batchBytes = 0
    }
    $batch.Add($file)
    $batchBytes += $file.Length
  }
  Send-Batch -Files @($batch.ToArray())
  Write-Output ("COMPLETO: $totalFiles archivos; $([math]::Round($totalBytes / 1MB, 1)) MB")
} finally {
  $client.Dispose()
}
