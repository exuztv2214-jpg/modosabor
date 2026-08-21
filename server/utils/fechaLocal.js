/**
 * Fecha local del negocio dentro de las consultas SQL.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * SQLite guarda `CURRENT_TIMESTAMP` en UTC. El servidor corre en UTC (Railway),
 * así que `DATE(creado_en)` devuelve el día **en UTC**, no el día del negocio.
 *
 * Tucumán es UTC-3. Eso significa que todo lo vendido desde las 21:00 en
 * adelante ya cayó en el día siguiente para SQLite:
 *
 *   Pedido del jueves 21:30 en el local  →  guardado como viernes 00:30 UTC
 *   → `DATE(creado_en)` dice "viernes"   →  aparece en el reporte del viernes
 *
 * En un restaurante la cena es buena parte de la facturación, así que los
 * reportes diarios venían sistemáticamente corridos: al jueves le faltaba su
 * cena y el viernes arrancaba con la cena del jueves adentro.
 *
 * ── La corrección ──────────────────────────────────────────────────────────
 *
 * Se le restan 3 horas a la fecha antes de extraer el día. Argentina no aplica
 * horario de verano desde 2009 y el huso es fijo (UTC-3), así que el offset
 * constante es correcto y no necesita tabla de zonas.
 *
 * No se usa el modificador `'localtime'` de SQLite a propósito: depende de la
 * zona horaria del proceso, que en Railway es UTC. Funcionaría en una máquina
 * argentina y fallaría en producción, que es la peor clase de error.
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *
 *   const { fechaLocal } = require('../utils/fechaLocal');
 *
 *   `SELECT * FROM pedidos WHERE ${fechaLocal('creado_en')} = ?`
 */

/** Offset fijo de Argentina respecto de UTC. */
const OFFSET_ARGENTINA = '-3 hours';

/**
 * Fragmento SQL que devuelve el día local (YYYY-MM-DD) de una columna
 * de tipo DATETIME guardada en UTC.
 *
 * @param {string} columna Nombre de la columna, ej. 'creado_en' o 'p.creado_en'
 * @returns {string} Fragmento SQL listo para interpolar
 */
function fechaLocal(columna = 'creado_en') {
  return `DATE(${columna}, '${OFFSET_ARGENTINA}')`;
}

/**
 * Igual que `fechaLocal` pero con la hora incluida, para cuando hace falta
 * comparar momentos y no días.
 */
function fechaHoraLocal(columna = 'creado_en') {
  return `DATETIME(${columna}, '${OFFSET_ARGENTINA}')`;
}

/** Día local de hoy, para usar como valor por defecto en las consultas. */
function hoyLocal() {
  return `DATE('now', '${OFFSET_ARGENTINA}')`;
}

/**
 * Día de hoy en Argentina como string 'YYYY-MM-DD', para usar en JS.
 *
 * `new Date().toISOString().split('T')[0]` devuelve el día en UTC. El servidor
 * corre en UTC en Railway y Tucumán es UTC−3, así que de las 21:00 en adelante
 * da el día siguiente. Esta función da el día que ve el reloj del local.
 */
function hoyArgentina(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Convierte una fecha/hora del negocio en un instante. Los valores sin zona
 * (por ejemplo el inicio de turno `2026-08-09T09:00:00`) son de Argentina,
 * no de la zona UTC del proceso en Railway.
 */
function parseFechaHoraArgentina(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasTimezone ? normalized : `${normalized}-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Una fecha en el formato que entiende SQLite: `YYYY-MM-DD HH:MM:SS`, en UTC.
 *
 * ── Por qué no vale `toISOString()` ────────────────────────────────────────
 *
 * SQLite no tiene tipo fecha: guarda texto y compara **texto**.
 * `CURRENT_TIMESTAMP` escribe `2026-08-21 14:19:13`, con un espacio.
 * `toISOString()` escribe `2026-08-21T13:19:13.931Z`, con una T.
 *
 * Y la T (0x54) es mayor que el espacio (0x20) en cualquier comparación de
 * texto. O sea que una fecha guardada en ISO es **siempre "mayor" que ahora**,
 * aunque sea de hace una hora.
 *
 * Eso rompía las dos colas del sistema sin dar ningún error:
 *
 *   - Social: `claimWork` busca destinos con `programada_para <= CURRENT_TIMESTAMP`
 *     y `queueCampaign` guardaba ahí un ISO.
 *   - WhatsApp Masivo: `procesarProgramadas` busca campañas con la misma
 *     comparación, y `programar()` guardaba un ISO.
 *
 * En los dos casos la condición nunca daba verdadero: las campañas quedaban
 * "programadas" para siempre y no había nada en los logs que lo explicara.
 *
 * Ojo: envolver la columna en `datetime(...)` también lo arregla, y por eso el
 * resto de las consultas del sistema —que sí lo hacen— nunca tuvieron el
 * problema. Estas dos comparaban la columna pelada.
 */
function sqlFecha(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/** Lee una fecha de la base, venga en formato SQLite o en ISO. */
function desdeSql(valor) {
  if (!valor) return null;
  const texto = String(valor);
  const fecha = new Date(/[TZ]/.test(texto) ? texto : `${texto.replace(' ', 'T')}Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function esFechaIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

module.exports = {
  fechaLocal,
  fechaHoraLocal,
  hoyLocal,
  hoyArgentina,
  parseFechaHoraArgentina,
  sqlFecha,
  desdeSql,
  esFechaIso,
  OFFSET_ARGENTINA,
};
