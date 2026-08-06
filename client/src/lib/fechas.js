/**
 * Parseo de fechas que vienen del servidor.
 *
 * SQLite escribe `CURRENT_TIMESTAMP` con el formato `"2026-08-06 14:30:00"`:
 * separador espacio en lugar de "T" y, sobre todo, **en UTC pero sin el
 * sufijo Z**. Ese string es una trampa doble:
 *
 *  1. `parseISO("2026-08-06 14:30:00")` devuelve Invalid Date —el espacio no
 *     es ISO 8601 válido— y `format()` sobre eso tira RangeError.
 *  2. `new Date("2026-08-06 14:30:00")` sí lo parsea en Chrome, pero lo
 *     interpreta como hora **local**. Como el dato real es UTC, en Tucumán
 *     (UTC-3) cada fecha se leía 3 horas en el futuro. En Safari directamente
 *     devuelve Invalid Date.
 *
 * El síntoma más visible fue el panel de Delivery: al calcular la antigüedad
 * del GPS contra una fecha corrida 3 horas, todos los riders aparecían como
 * "GPS atrasado" aunque estuvieran transmitiendo perfecto.
 *
 * `parseFechaServidor` normaliza el separador y marca el string como UTC si
 * no trae zona horaria propia, que es el caso de todo lo que sale de SQLite.
 */

/**
 * @param {string|Date|null|undefined} valor
 * @returns {Date} Date válido, o Invalid Date si no se pudo interpretar.
 */
export function parseFechaServidor(valor) {
  if (!valor) return new Date(NaN);
  if (valor instanceof Date) return valor;

  const texto = String(valor).trim().replace(' ', 'T');
  if (!texto) return new Date(NaN);

  /*
    Una fecha sin hora (`fecha_ingreso`, `fecha_operativa`) no es un instante:
    es un día del calendario. Si le agregáramos "Z" se leería como medianoche
    UTC y en Tucumán (UTC-3) se mostraría el día anterior a partir de las 21hs
    —el mismo error de "se corre un día" que ya apareció en otros módulos—.
    Se devuelve como fecha local a las 00:00.
  */
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const [a, m, d] = texto.split('-').map(Number);
    return new Date(a, m - 1, d);
  }

  // Si ya trae zona (Z, +03:00, -0300) se respeta tal cual.
  const traeZona = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto);
  return new Date(traeZona ? texto : `${texto}Z`);
}

/**
 * Milisegundos transcurridos desde `valor` hasta ahora.
 * @returns {number|null} null si la fecha no es interpretable.
 */
export function msDesde(valor) {
  const fecha = parseFechaServidor(valor);
  const ms = fecha.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Date.now() - ms);
}

/**
 * Minutos transcurridos desde `valor` hasta ahora.
 * @returns {number|null} null si la fecha no es interpretable.
 */
export function minutosDesde(valor) {
  const ms = msDesde(valor);
  return ms === null ? null : Math.floor(ms / 60000);
}

/**
 * Hora local en formato HH:mm. Devuelve `fallback` si la fecha no sirve.
 */
export function horaLocal(valor, fallback = '--:--') {
  const fecha = parseFechaServidor(valor);
  if (!Number.isFinite(fecha.getTime())) return fallback;
  // `hour12: false` explícito: sin esto el formato depende del entorno y
  // podía salir "03:00 p. m.". En cocina y caja se lee la hora de un vistazo,
  // 24 horas y sin sufijo.
  return fecha.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
