param(
  [string]$HostName = $env:MODOSABOR_VPS_HOST,
  [int]$Port = [int]($env:MODOSABOR_VPS_PORT || 5942),
  [string]$User = $env:MODOSABOR_VPS_USER,
  [string]$DestinationRoot = "D:\Backups\ModoSabor"
)

$ErrorActionPreference = "Stop"

if (-not $HostName) { $HostName = "149.50.133.118" }
if (-not $User) { $User = "root" }

if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
  Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
  Install-Module -Name Posh-SSH -Scope CurrentUser -Force -AllowClobber
}

Import-Module Posh-SSH

$credential = Get-Credential -UserName $User -Message "Credenciales SSH para $User@$HostName"
$session = New-SSHSession -ComputerName $HostName -Port $Port -Credential $credential -AcceptKey -ConnectionTimeout 30

$remoteScript = @'
set -e
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_ROOT=/root/modosabor-backups
STAGE="$BACKUP_ROOT/stage-$STAMP"
ARCHIVE="$BACKUP_ROOT/modosabor-vps-$STAMP.tgz"
mkdir -p "$STAGE"

cd /opt/modosabor/server
node -e "const Database=require('better-sqlite3'); const db=new Database('/opt/modosabor/server/data/modosabor.db'); db.backup('$STAGE/modosabor.db.sqlite').then(()=>{db.close(); console.log('db_backup_ok')}).catch((e)=>{console.error(e); process.exit(1)})"

cp -a /opt/modosabor/server/uploads "$STAGE/uploads" 2>/dev/null || true
cp -a /opt/modosabor/server/data/backups "$STAGE/db-backups" 2>/dev/null || true
cp /opt/modosabor/server/.env "$STAGE/server.env" 2>/dev/null || true
cp /etc/nginx/sites-available/modosabor "$STAGE/nginx-modosabor.conf" 2>/dev/null || true
pm2 save >/dev/null 2>&1 || true
cp /root/.pm2/dump.pm2 "$STAGE/pm2-dump.pm2" 2>/dev/null || true

printf '%s\n' "created_at=$(date -Iseconds)" "host=$(hostname)" "source=/opt/modosabor" > "$STAGE/manifest.txt"

cd "$BACKUP_ROOT"
tar -czf "$ARCHIVE" "stage-$STAMP"
sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"
rm -rf "$STAGE"

echo "$ARCHIVE"
cat "$ARCHIVE.sha256"
'@

$result = Invoke-SSHCommand -SSHSession $session -Command $remoteScript -TimeOut 180
$result.Output | ForEach-Object { Write-Host $_ }
if ($result.Error) { $result.Error | ForEach-Object { Write-Warning $_ } }

$remoteArchive = $result.Output | Where-Object { $_ -match '^/root/modosabor-backups/modosabor-vps-.*\.tgz$' } | Select-Object -Last 1
if (-not $remoteArchive) {
  Remove-SSHSession -SSHSession $session | Out-Null
  throw "No pude detectar el archivo remoto generado."
}

$localDir = Join-Path $DestinationRoot ("remote-donweb-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Force -Path $localDir | Out-Null

Get-SCPItem -ComputerName $HostName -Port $Port -Credential $credential -AcceptKey -Path $remoteArchive -Destination $localDir
Get-SCPItem -ComputerName $HostName -Port $Port -Credential $credential -AcceptKey -Path "$remoteArchive.sha256" -Destination $localDir

Remove-SSHSession -SSHSession $session | Out-Null

Write-Host ""
Write-Host "Backup DonWeb descargado en:"
Write-Host $localDir
Get-ChildItem $localDir | Select-Object FullName,Length,LastWriteTime | Format-Table -AutoSize
