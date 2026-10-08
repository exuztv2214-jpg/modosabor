'use strict';

// Resguardos del motor: errores dudosos, archivos de protección dañados y
// respaldos completos verificables. Funciones sin estado global, para poder probarlas.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ---------- Errores de envío ----------

// Errores que ocurren antes de que WhatsApp acepte el mensaje: reintentar no duplica.
const ERRORES_ANTES_DE_ENVIAR = [
  'invalid wid',
  'wid error',
  'no lid for user',
  'not a valid',
  'is not registered',
  'chat not found',
  'could not get the chat',
  'media upload failed',
  'enoent',
];

// 'antes': no salió, se puede reintentar · 'incierto': quizás salió, no reintentar.
function clasificarErrorEnvio(err) {
  const texto = String((err && (err.stack || err.message)) || err || '').toLowerCase();
  return ERRORES_ANTES_DE_ENVIAR.some((patron) => texto.includes(patron)) ? 'antes' : 'incierto';
}

// ---------- Lectura protegida ----------

// Devuelve { data, danio }. Un archivo que no existe es normal (fallback, sin daño);
// uno que existe pero no se puede leer o no tiene la forma esperada es un daño.
function leerJsonProtegido(archivo, fallback, validar = () => true) {
  let texto;
  try {
    texto = fs.readFileSync(archivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { data: fallback, danio: null };
    return { data: fallback, danio: e.message };
  }
  try {
    const data = JSON.parse(texto);
    if (!validar(data)) return { data: fallback, danio: 'formato inesperado' };
    return { data, danio: null };
  } catch (e) {
    return { data: fallback, danio: e.message };
  }
}

// ---------- Respaldos ----------

const RE_STAMP = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+$/;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Rutas relativas a dirData de los archivos existentes. 'campanas/' incluye la carpeta.
function archivosARespaldar(dirData, lista) {
  const salida = [];
  for (const rel of lista) {
    if (rel.endsWith('/')) {
      const dir = path.join(dirData, rel);
      let nombres = [];
      try {
        nombres = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      } catch (e) {
        /* carpeta inexistente */
      }
      for (const n of nombres) salida.push(`${rel}${n}`);
    } else if (fs.existsSync(path.join(dirData, rel))) salida.push(rel);
  }
  return salida;
}

// Copia los archivos a dirBackups/<stamp>/, relee cada copia y compara el hash.
function crearRespaldo({ dirData, dirBackups, lista, motivo, stamp, conservar = 30 }) {
  const destino = path.join(dirBackups, stamp);
  const temporal = `${destino}.tmp`;
  fs.rmSync(temporal, { recursive: true, force: true });
  fs.mkdirSync(temporal, { recursive: true });
  const archivos = [];
  try {
    for (const rel of archivosARespaldar(dirData, lista)) {
      const contenido = fs.readFileSync(path.join(dirData, rel));
      const copia = path.join(temporal, rel);
      fs.mkdirSync(path.dirname(copia), { recursive: true });
      fs.writeFileSync(copia, contenido);
      const hash = sha256(contenido);
      if (sha256(fs.readFileSync(copia)) !== hash)
        throw new Error(`la copia de ${rel} no coincide`);
      archivos.push({ ruta: rel, bytes: contenido.length, sha256: hash });
    }
    const manifiesto = {
      stamp,
      creado: new Date().toISOString(),
      motivo: motivo || '',
      archivos,
      bytes: archivos.reduce((s, a) => s + a.bytes, 0),
    };
    fs.writeFileSync(path.join(temporal, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2));
    fs.rmSync(destino, { recursive: true, force: true });
    fs.renameSync(temporal, destino);
    rotarRespaldos(dirBackups, conservar);
    return manifiesto;
  } catch (e) {
    fs.rmSync(temporal, { recursive: true, force: true });
    throw e;
  }
}

function rotarRespaldos(dirBackups, conservar) {
  const carpetas = listarRespaldos(dirBackups).map((r) => r.stamp);
  for (const viejo of carpetas.slice(conservar)) {
    fs.rmSync(path.join(dirBackups, viejo), { recursive: true, force: true });
  }
}

// Más nuevo primero.
function listarRespaldos(dirBackups) {
  let nombres = [];
  try {
    nombres = fs.readdirSync(dirBackups);
  } catch (e) {
    return [];
  }
  return nombres
    .filter((n) => RE_STAMP.test(n))
    .sort()
    .reverse()
    .map((stamp) => leerManifiesto(dirBackups, stamp))
    .filter(Boolean);
}

function leerManifiesto(dirBackups, stamp) {
  if (!RE_STAMP.test(String(stamp || ''))) return null;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dirBackups, stamp, 'manifiesto.json'), 'utf8'));
    return m && Array.isArray(m.archivos) ? m : null;
  } catch (e) {
    return null;
  }
}

// Comprueba que todas las copias existan y conserven su hash.
function verificarRespaldo(dirBackups, stamp) {
  const m = leerManifiesto(dirBackups, stamp);
  if (!m) return { ok: false, error: 'Respaldo inexistente o sin manifiesto.' };
  for (const a of m.archivos) {
    try {
      if (sha256(fs.readFileSync(path.join(dirBackups, stamp, a.ruta))) !== a.sha256)
        return { ok: false, error: `${a.ruta} está alterado.` };
    } catch (e) {
      return { ok: false, error: `${a.ruta} no se puede leer.` };
    }
  }
  return { ok: true, manifiesto: m };
}

// Todo el respaldo en un solo JSON, para guardarlo fuera del servidor.
function exportarRespaldo(dirBackups, stamp) {
  const v = verificarRespaldo(dirBackups, stamp);
  if (!v.ok) throw new Error(v.error);
  return {
    ...v.manifiesto,
    contenido: Object.fromEntries(
      v.manifiesto.archivos.map((a) => [
        a.ruta,
        fs.readFileSync(path.join(dirBackups, stamp, a.ruta)).toString('base64'),
      ])
    ),
  };
}

// Restaura sólo las rutas elegidas (o todas). Cada archivo se escribe en temporal
// y se reemplaza al final: si algo falla antes, no se toca nada.
function restaurarRespaldo(dirData, dirBackups, stamp, rutas) {
  const v = verificarRespaldo(dirBackups, stamp);
  if (!v.ok) throw new Error(v.error);
  const elegidos = v.manifiesto.archivos.filter((a) => !rutas || rutas.includes(a.ruta));
  if (!elegidos.length) throw new Error('No hay archivos para restaurar.');
  const preparados = [];
  try {
    for (const a of elegidos) {
      const destino = path.join(dirData, a.ruta);
      if (!path.resolve(destino).startsWith(path.resolve(dirData) + path.sep))
        throw new Error(`Ruta inválida: ${a.ruta}`);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      const temporal = `${destino}.restaurar.tmp`;
      fs.copyFileSync(path.join(dirBackups, stamp, a.ruta), temporal);
      preparados.push({ temporal, destino });
    }
    for (const p of preparados) fs.renameSync(p.temporal, p.destino);
  } catch (e) {
    for (const p of preparados) fs.rmSync(p.temporal, { force: true });
    throw e;
  }
  return elegidos.map((a) => a.ruta);
}

module.exports = {
  clasificarErrorEnvio,
  leerJsonProtegido,
  crearRespaldo,
  listarRespaldos,
  verificarRespaldo,
  exportarRespaldo,
  restaurarRespaldo,
};
