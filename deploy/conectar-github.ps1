[CmdletBinding()]
param(
  [string]$GithubUser,
  [string]$Repository = 'modosabor',
  [string]$RemoteName = 'nuevo-origin',
  [switch]$Apply,
  [switch]$ReplaceOrigin,
  [switch]$Push
)

$ErrorActionPreference = 'Stop'

function Invoke-Gh {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = & gh @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI fallo ($LASTEXITCODE): $($output -join [Environment]::NewLine)"
  }
  return @($output)
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'No se encontro GitHub CLI (gh). Instalarlo antes de continuar.'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'No se encontro Git.'
}

Write-Output 'Cuentas GitHub autenticadas (los tokens no se muestran):'
gh auth status 2>&1 | ForEach-Object {
  if ($_ -match 'account ([^ ]+)') { Write-Output "- $($Matches[1])" }
}

if (-not $GithubUser) {
  Write-Output ''
  Write-Output 'Modo preparacion: falta -GithubUser para cambiar de cuenta.'
  Write-Output 'Ejemplo: .\deploy\conectar-github.ps1 -GithubUser usuario-nuevo -Apply'
  exit 0
}

if ($Repository -notmatch '^[A-Za-z0-9_.-]+$') {
  throw 'Repository solo puede contener letras, numeros, punto, guion y guion bajo.'
}
if ($RemoteName -notmatch '^[A-Za-z0-9_.-]+$') {
  throw 'RemoteName solo puede contener letras, numeros, punto, guion y guion bajo.'
}

$remoteUrl = "https://github.com/$GithubUser/$Repository.git"
Write-Output "Repositorio destino: $remoteUrl"

if (-not $Apply) {
  Write-Output 'Simulacion: no se cambio la cuenta, ningun remoto ni se hizo push.'
  Write-Output "Para aplicar la seleccion: .\deploy\conectar-github.ps1 -GithubUser $GithubUser -Repository $Repository -Apply"
  exit 0
}

Invoke-Gh -Arguments @('auth', 'switch', '--user', $GithubUser) | Out-Null
$activeUser = (Invoke-Gh -Arguments @('api', 'user', '--jq', '.login') | Out-String).Trim()
if ($activeUser -ne $GithubUser) {
  throw "La cuenta activa resulto '$activeUser', se esperaba '$GithubUser'."
}
Write-Output "Cuenta activa confirmada: $activeUser"

$existing = git remote get-url $RemoteName 2>$null
if ($LASTEXITCODE -eq 0) {
  if ($existing -ne $remoteUrl) {
    git remote set-url $RemoteName $remoteUrl
    Write-Output "Remoto $RemoteName actualizado."
  } else {
    Write-Output "Remoto $RemoteName ya apuntaba al destino."
  }
} else {
  git remote add $RemoteName $remoteUrl
  Write-Output "Remoto $RemoteName agregado."
}

if ($ReplaceOrigin) {
  git remote set-url origin $remoteUrl
  Write-Output 'origin reemplazado explícitamente por el repositorio nuevo.'
} else {
  Write-Output 'origin viejo conservado; el destino quedó en el remoto separado.'
}

if ($Push) {
  if (-not $ReplaceOrigin -and $RemoteName -eq 'origin') {
    throw 'Para hacer push a origin se requiere -ReplaceOrigin explícito.'
  }
  git push --set-upstream $RemoteName main
  Write-Output "Push completado en $RemoteName/main."
} else {
  Write-Output "No se hizo push. Cuando verifiques el destino: git push --set-upstream $RemoteName main"
}
