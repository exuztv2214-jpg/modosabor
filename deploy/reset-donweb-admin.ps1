param(
  [string]$HostName = $env:MODOSABOR_VPS_HOST,
  [string]$Port = $env:MODOSABOR_VPS_PORT,
  [string]$User = $env:MODOSABOR_VPS_USER,
  [string]$RemotePath = $env:MODOSABOR_VPS_PATH,
  [string]$AdminEmail = "admin@modosabor.com",
  [string]$AdminPassword = "ModoSabor2026!"
)

$ErrorActionPreference = "Stop"

if (-not $HostName) { $HostName = "149.50.133.118" }
if (-not $Port) { $Port = "5942" }
if (-not $User) { $User = "root" }
if (-not $RemotePath) { $RemotePath = "/opt/modosabor" }

$tempFile = Join-Path $env:TEMP "modosabor-reset-admin.js"

@"
const bcrypt = require('bcryptjs');
const db = require('../db');

const email = process.env.MS_ADMIN_EMAIL;
const password = process.env.MS_ADMIN_PASSWORD;
const hash = bcrypt.hashSync(password, 10);

const existing = db.prepare('SELECT id FROM usuarios WHERE lower(email) = lower(?)').get(email);
if (existing) {
  db.prepare('UPDATE usuarios SET nombre = ?, email = ?, password_hash = ?, rol = ?, activo = 1 WHERE id = ?')
    .run('Hernan Lorenzo', email, hash, 'admin', existing.id);
  console.log(JSON.stringify({ ok: true, action: 'updated', email }));
} else {
  db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)')
    .run('Hernan Lorenzo', email, hash, 'admin');
  console.log(JSON.stringify({ ok: true, action: 'created', email }));
}
"@ | Set-Content -Path $tempFile -Encoding UTF8

$remoteScript = "$RemotePath/server/scripts/_reset-admin.remote.js"

scp -P $Port $tempFile "$User@$HostName`:$remoteScript"
if ($LASTEXITCODE -ne 0) { throw "No se pudo subir el script de reset admin." }

$remoteCommand = "cd $RemotePath/server && MS_ADMIN_EMAIL='$AdminEmail' MS_ADMIN_PASSWORD='$AdminPassword' node scripts/_reset-admin.remote.js && rm -f scripts/_reset-admin.remote.js && pm2 restart modosabor --update-env"
ssh -p $Port "$User@$HostName" $remoteCommand
if ($LASTEXITCODE -ne 0) { throw "No se pudo resetear el admin remoto." }

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
Write-Host "Admin DonWeb listo: $AdminEmail"
