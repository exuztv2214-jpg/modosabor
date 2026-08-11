/**
 * Revisión automática del sistema — script de cron.
 *
 * Se ejecuta desde la raíz del proyecto con:
 *   node revision_cron.js
 *
 * Devuelve JSON por stdout y exit code 1 si hay problemas críticos.
 */

const path = require('path');

// Asegurar que las rutas relativas funcionen desde cualquier cwd
const PROJECT_ROOT = path.resolve(__dirname);
process.chdir(PROJECT_ROOT);

const { revisionAutomatica } = require('./server/services/asistenteHerramientas');

const resultado = revisionAutomatica();

const output = {
  alerta: resultado.severidad === 'critico',
  severidad: resultado.severidad,
  problemas_detectados: resultado.problemas_detectados,
  problemas: resultado.problemas,
  timestamp: new Date().toISOString(),
};

console.log(JSON.stringify(output));

if (output.alerta) {
  process.stderr.write(
    `ALERTA CRÍTICA: ${resultado.problemas_detectados} problema(s) detectado(s)\n`
  );
  process.exit(1);
}

process.exit(0);
