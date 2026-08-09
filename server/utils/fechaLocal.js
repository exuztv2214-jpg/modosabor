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
function hoyArgentina() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

module.exports = { fechaLocal, fechaHoraLocal, hoyLocal, hoyArgentina, OFFSET_ARGENTINA };
