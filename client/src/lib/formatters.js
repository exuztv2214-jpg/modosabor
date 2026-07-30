/**
 * Formatters centralizados para todo el frontend.
 * Evita duplicación de funciones fmtMoney/fmt en múltiples archivos.
 */

/**
 * Formatea un número como moneda argentina ($XX.XXX)
 * @param {number|string} value
 * @returns {string}
 */
export function fmtMoney(value) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

/**
 * Alias corto para fmtMoney (compatibilidad con código existente)
 * @param {number|string} n
 * @returns {string}
 */
export function fmt(n) {
  return fmtMoney(n);
}
