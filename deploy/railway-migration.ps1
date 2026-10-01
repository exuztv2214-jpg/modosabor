[CmdletBinding()]
param(
  [ValidateSet('audit', 'env-template')]
  [string]$Action = 'audit',
  [string]$OutputDirectory = (Join-Path $PSScriptRoot 'railway-migration-output'),
  [switch]$SkipRailway
)

$ErrorActionPreference = 'Stop'

function ConvertTo-JsonObject {
  param([Parameter(Mandatory = $true)][object]$Value)

  if ($Value -is [string]) {
    return ($Value | ConvertFrom-Json)
  }
  return $Value
}

function Invoke-RailwayJson {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = & railway @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Railway CLI fallo ($LASTEXITCODE): $($output -join [Environment]::NewLine)"
  }

  $text = ($output | Out-String).Trim()
  if (-not $text) {
    throw "Railway CLI no devolvio JSON para: railway $($Arguments -join ' ')"
  }
  return ConvertTo-JsonObject -Value $text
}

function Get-ObjectArray {
  param([object]$Value)

  if ($null -eq $Value) { return @() }
  return @($Value)
}

function Get-VariableNames {
  param([Parameter(Mandatory = $true)][object]$Value)

  $candidate = $Value
  if ($candidate.PSObject.Properties.Name -contains 'variables') {
    $candidate = $candidate.variables
  }

  if ($candidate -is [System.Array]) {
    return @(
      $candidate |
        ForEach-Object {
          if ($_.PSObject.Properties.Name -contains 'name') { $_.name }
          elseif ($_.PSObject.Properties.Name -contains 'key') { $_.key }
        } |
        Where-Object { $_ } |
        Sort-Object -Unique
    )
  }

  return @($candidate.PSObject.Properties.Name | Where-Object { $_ } | Sort-Object -Unique)
}

function Get-EnvExampleNames {
  $example = Join-Path $PSScriptRoot '..\server\.env.example'
  if (-not (Test-Path -LiteralPath $example)) { return @() }

  return @(
    Get-Content -LiteralPath $example |
      ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') { $Matches[1] }
      } |
      Sort-Object -Unique
  )
}

function Get-GitValue {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $value = & git @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return (($value | Out-String).Trim())
}

function Get-StatusInventory {
  param([Parameter(Mandatory = $true)][object]$Status)

  $environments = Get-ObjectArray ($Status.environments.edges | ForEach-Object { $_.node })
  $environmentRows = @()
  $serviceRows = @()
  $volumeRows = @()

  foreach ($environment in $environments) {
    $environmentRows += [ordered]@{
      id = $environment.id
      name = $environment.name
      can_access = $environment.canAccess
    }

    $instances = Get-ObjectArray ($environment.serviceInstances.edges | ForEach-Object { $_.node })
    foreach ($instance in $instances) {
      $domains = @()
      if ($instance.domains) {
        $domains += Get-ObjectArray $instance.domains.customDomains | ForEach-Object { $_.domain }
        $domains += Get-ObjectArray $instance.domains.serviceDomains | ForEach-Object { $_.domain }
      }

      $latest = $instance.latestDeployment
      $serviceRows += [ordered]@{
        environment_id = $instance.environmentId
        service_id = $instance.serviceId
        service_name = $instance.serviceName
        source_repo = $instance.source.repo
        source_image = $instance.source.image
        domains = @($domains | Where-Object { $_ } | Sort-Object -Unique)
        latest_deployment = if ($latest) {
          [ordered]@{
            id = $latest.id
            status = $latest.status
            created_at = $latest.createdAt
            deployment_stopped = $latest.deploymentStopped
          }
        } else { $null }
        num_replicas = $instance.numReplicas
      }
    }

    $volumes = Get-ObjectArray ($environment.volumeInstances.edges | ForEach-Object { $_.node })
    foreach ($volume in $volumes) {
      $volumeRows += [ordered]@{
        id = $volume.volume.id
        name = $volume.volume.name
        environment_id = $volume.environmentId
        service_id = $volume.serviceId
        mount_path = $volume.mountPath
        state = $volume.state
        size_mb = $volume.sizeMB
        current_size_mb = $volume.currentSizeMB
        percent_used = if ([double]$volume.sizeMB -gt 0) {
          [math]::Round(([double]$volume.currentSizeMB / [double]$volume.sizeMB) * 100, 1)
        } else { $null }
      }
    }
  }

  return [ordered]@{
    project = [ordered]@{
      id = $Status.id
      name = $Status.name
      workspace_id = $Status.workspaceId
      workspace_name = $Status.workspace.name
    }
    environments = $environmentRows
    services = $serviceRows
    volumes = $volumeRows
  }
}

function Write-EnvTemplate {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string[]]$Names
  )

  $secretPattern = '(?i)(secret|password|token|key|credential|cookie|auth|firebase|gemini|nvidia)'
  $systemPattern = '^RAILWAY_'
  $lines = @(
    '# Generado por deploy/railway-migration.ps1.'
    '# Plantilla sin valores: completar en el proyecto destino de Railway.'
    '# No subir este archivo con secretos reales al repositorio.'
    ''
  )

  foreach ($name in ($Names | Sort-Object -Unique)) {
    if ($name -match $systemPattern) { continue }
    $label = if ($name -match $secretPattern) { 'secreta' } else { 'configuracion' }
    $lines += "# $label"
    $lines += "${name}=REEMPLAZAR"
  }

  Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$manifestPath = Join-Path $OutputDirectory "railway-inventory-$stamp.json"
$templatePath = Join-Path $OutputDirectory "railway-env-$stamp.example"

$railwayAvailable = [bool](Get-Command railway -ErrorAction SilentlyContinue)
$status = $null
$variableNames = @()
$warnings = [System.Collections.Generic.List[string]]::new()

if (-not $SkipRailway -and $railwayAvailable) {
  try {
    $status = Invoke-RailwayJson -Arguments @('status', '--json')
    $variables = Invoke-RailwayJson -Arguments @('variables', '--json')
    $variableNames = Get-VariableNames -Value $variables
  } catch {
    $warnings.Add($_.Exception.Message)
  }
} elseif (-not $railwayAvailable -and -not $SkipRailway) {
  $warnings.Add('No se encontro Railway CLI; ejecutar npm install -g @railway/cli y volver a correr la auditoria.')
}

$envExampleNames = Get-EnvExampleNames
$knownAdditionalNames = @(
  'ALLOW_AFTER_HOURS_PUBLIC_ORDERS',
  'BACKUP_MAX_TOTAL_MB',
  'BOOTSTRAP_IMPORT_KEY',
  'FACEBOOK_PANEL_URL',
  'FACEBOOK_REDIRECT_URI',
  'GEMINI_API_KEY',
  'IA_API_KEY',
  'NVIDIA_API_KEY',
  'WHATSAPP_DISABLE_STARTUP'
)
$allVariableNames = @($variableNames + $envExampleNames + $knownAdditionalNames | Sort-Object -Unique)
$inventory = [ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString('o')
  action = $Action
  source = [ordered]@{
    path = (Get-Location).Path
    git_branch = Get-GitValue -Arguments @('branch', '--show-current')
    git_commit = Get-GitValue -Arguments @('rev-parse', 'HEAD')
    git_status_clean = -not [bool](Get-GitValue -Arguments @('status', '--short'))
  }
  railway_cli_available = $railwayAvailable
  linked = if ($status) { Get-StatusInventory -Status $status } else { $null }
  variable_names = $allVariableNames
  warnings = @($warnings)
  secrets_included = $false
}

$inventory | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
Write-EnvTemplate -Path $templatePath -Names $allVariableNames

if ($status) {
  foreach ($service in $inventory.linked.services) {
    if ($service.latest_deployment -and $service.latest_deployment.status -notin @('SUCCESS', 'DEPLOYED')) {
      $warnings.Add("Servicio $($service.service_name): ultimo deployment $($service.latest_deployment.status).")
    }
    if (-not $service.latest_deployment) {
      $warnings.Add("Servicio $($service.service_name): no tiene deployment registrado en el ambiente vinculado.")
    }
  }
  foreach ($volume in $inventory.linked.volumes) {
    if ($null -ne $volume.percent_used -and [double]$volume.percent_used -ge 85) {
      $warnings.Add("Volumen $($volume.name): $($volume.percent_used)% usado; ampliar/liberar antes del corte.")
    }
  }
}

$inventory.warnings = @($warnings | Sort-Object -Unique)
$inventory | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

Write-Output "Inventario seguro generado: $manifestPath"
Write-Output "Plantilla de variables sin valores: $templatePath"
if ($inventory.warnings.Count -gt 0) {
  Write-Output 'Advertencias:'
  $inventory.warnings | ForEach-Object { Write-Output "- $_" }
}
