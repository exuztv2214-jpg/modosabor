const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const SESSION_DIR = path.join(ROOT, 'sesion', 'session');
const LOCK_FILE = path.join(ROOT, 'data', 'panel.lock.json');
// El panel puede iniciarse con un runtime embebido (Kimi/Codex) cuyo PATH no
// incluye System32. En Windows PowerShell está ahí aunque `powershell.exe` no
// pueda resolverse por nombre.
const POWERSHELL_EXE = path.join(
  process.env.SystemRoot || process.env.windir || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
);

function psLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function liberarSesionWhatsApp(log = () => {}) {
  if (process.platform !== 'win32') return { killed: [] };

  const script = `
$root = ${psLiteral(ROOT)}
$session = ${psLiteral(SESSION_DIR)}
$lockFile = ${psLiteral(LOCK_FILE)}
$currentPid = ${process.pid}
$all = Get-CimInstance Win32_Process
$lockPid = $null
if (Test-Path -LiteralPath $lockFile) {
  try {
    $lock = Get-Content -LiteralPath $lockFile -Raw | ConvertFrom-Json
    $lockPid = [int]$lock.pid
  } catch {}
}
if ($lockPid -and $lockPid -ne $currentPid) {
  $locked = @($all | Where-Object { $_.ProcessId -eq $lockPid })
  if ($locked.Count -gt 0) {
    Write-Output ("BUSY|" + "$($lockPid):panel activo")
    exit 2
  }
}
# Only block on enviar-promo / listar-clientes scripts (unique names).
# We no longer match "server.js" generically because other node processes
# (Adobe Creative Cloud, other projects) also run files named server.js.
$otherScript = @($all | Where-Object {
  $_.ProcessId -ne $currentPid -and
  $_.CommandLine -and
  $_.Name -match '^(node|node\\.exe)$' -and
  ($_.CommandLine -like "*enviar-promo.js*" -or $_.CommandLine -like "*listar-clientes.js*")
})
if ($otherScript.Count -gt 0) {
  $ids = ($otherScript | ForEach-Object { "$($_.ProcessId):$($_.CommandLine)" }) -join "\\n"
  Write-Output ("BUSY|" + $ids)
  exit 2
}
$chrome = @($all | Where-Object {
  $_.CommandLine -and
  $_.Name -match '^(chrome|chrome\\.exe)$' -and
  $_.CommandLine -like "*$session*"
})
foreach ($p in $chrome) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch {}
}
if ($chrome.Count -gt 0) {
  Write-Output ("KILLED|" + (($chrome | ForEach-Object { $_.ProcessId }) -join ","))
} else {
  Write-Output "OK|"
}
`;

  try {
    const out = execFileSync(
      POWERSHELL_EXE,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        encoding: 'utf8',
        windowsHide: true,
      }
    ).trim();
    if (out.startsWith('KILLED|')) {
      const killed = out.slice('KILLED|'.length).split(',').filter(Boolean);
      log(`Se cerró Chrome huérfano de WhatsApp para liberar la sesión (${killed.join(', ')}).`);
      return { killed };
    }
    return { killed: [] };
  } catch (err) {
    const out = String(err.stdout || '').trim();
    if (out.startsWith('BUSY|')) {
      const detalle = out.slice('BUSY|'.length).split(/\r?\n/)[0];
      throw new Error(
        `Ya hay otra instancia del panel/script usando esta sesión de WhatsApp (${detalle}). Cerrala y volvé a intentar.`
      );
    }
    // Si el chequeo no se pudo EJECUTAR (problema del entorno, ej: no se
    // encuentra powershell), no es fatal: se avisa y se continúa igual.
    log(`⚠️ No se pudo verificar la sesión (${err.message}). Se continúa igual.`);
    return { killed: [] };
  }
}

module.exports = { liberarSesionWhatsApp };
