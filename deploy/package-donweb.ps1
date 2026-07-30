param(
  [string]$Output = "D:\Proyectos\modosabor1\deploy\modosabor-donweb.tgz"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$tempDir = Join-Path $env:TEMP "modosabor-package"

if (Test-Path $Output) {
  Remove-Item $Output -Force
}

if (Test-Path $tempDir) {
  Remove-Item $tempDir -Recurse -Force
}

New-Item -ItemType Directory -Path $tempDir | Out-Null

$excludeRegex = @(
  "\\\.git(\\|/)",
  "\\node_modules(\\|/)",
  "\\client\\dist(\\|/)",
  "\\server\\\.env$",
  "\\server\\data(\\|/)",
  "\\server\\backups(\\|/)",
  "\\template_base(\\|/)",
  "\\\.launcher(\\|/)",
  "\\\.tmp(\\|/)",
  "\\deploy(\\|/)",
  "\\__pycache__(\\|/)",
  "\\server\\.*\.db$",
  "\\server\\server\.log$",
  "\\client-live\.log$",
  "\\.*\.tgz$",
  "\\.*\.zip$"
) -join "|"

Get-ChildItem $projectRoot -Recurse -File | Where-Object {
  $_.FullName -notmatch $excludeRegex
} | ForEach-Object {
  $relative = $_.FullName.Substring($projectRoot.Length + 1)
  $target = Join-Path $tempDir $relative
  $targetDir = Split-Path -Parent $target
  if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  }
  Copy-Item $_.FullName $target -Force
}

tar -czf $Output -C $tempDir .
Remove-Item $tempDir -Recurse -Force

Write-Host "Paquete generado en $Output"
