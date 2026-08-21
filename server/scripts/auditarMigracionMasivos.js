/**
 * Revisa los datos del panel local de WhatsApp masivo antes de migrarlos.
 *
 * No escribe en ninguna base ni modifica el panel local. El objetivo es evitar
 * convertir identificadores internos de WhatsApp (@lid) en teléfonos: no son
 * equivalentes y una baja mal asociada termina bloqueando al cliente errado.
 *
 * Uso:
 *   node server/scripts/auditarMigracionMasivos.js
 *   node server/scripts/auditarMigracionMasivos.js "C:\\ruta\\al\\panel-local"
 */
const fs = require('fs');
const path = require('path');

const db = require('../db');
const { normalizarTelefono } = require('../services/whatsappMasivo/telefono');

const DEFAULT_LEGACY_ROOT = 'C:\\Users\\Exuz\\Documents\\kimi\\Workspaces\\masivos';
const root = path.resolve(process.argv[2] || DEFAULT_LEGACY_ROOT);
const dataDir = path.join(root, 'data');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw new Error(`No se pudo leer ${file}: ${error.message}`);
  }
}

function legacyIdToPhone(value) {
  const raw = String(value || '').trim();
  // Sólo los JID clásicos contienen el número. @lid es un identificador opaco.
  if (!/^\d{6,15}@c\.us$/i.test(raw)) return null;
  return normalizarTelefono(raw.split('@')[0]);
}

function countCampaigns(dir) {
  try {
    return fs.readdirSync(dir).filter((name) => /^campana-.*\.json$/i.test(name)).length;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

function main() {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`No existe la carpeta de datos del panel local: ${dataDir}`);
  }

  const excluded = readJson(path.join(dataDir, 'excluidos.json'), []);
  if (!Array.isArray(excluded)) throw new Error('excluidos.json debe ser una lista');

  const classic = excluded.map(legacyIdToPhone).filter(Boolean);
  const lid = excluded.filter((value) => /@lid$/i.test(String(value)));
  const unknown = excluded.filter(
    (value) => !legacyIdToPhone(value) && !/@lid$/i.test(String(value))
  );
  const phonesInSystem = new Set(
    db
      .prepare("SELECT telefono FROM clientes WHERE COALESCE(telefono, '') <> ''")
      .all()
      .map((row) => normalizarTelefono(row.telefono))
      .filter(Boolean)
  );
  const matches = classic.filter((phone) => phonesInSystem.has(phone));

  const report = {
    modo: 'solo-auditoria',
    escribe: false,
    panel_local: root,
    campanas_locales: countCampaigns(path.join(dataDir, 'campanas')),
    bajas: {
      total: excluded.length,
      jid_clasicos_convertibles: classic.length,
      coinciden_con_cliente_del_sistema: matches.length,
      lid_no_convertibles_automaticamente: lid.length,
      formato_desconocido: unknown.length,
    },
    decision: lid.length
      ? 'No importar @lid: requieren vinculación comprobable con un teléfono antes de crear una baja.'
      : 'Los JID clásicos se pueden revisar e importar en una segunda etapa, con backup y confirmación.',
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
