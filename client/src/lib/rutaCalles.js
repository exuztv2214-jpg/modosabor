/**
 * Ruta por calles entre el repartidor y el domicilio del cliente.
 *
 * ── Qué resuelve ───────────────────────────────────────────────────────────
 *
 * El mapa de seguimiento dibujaba una línea recta entre la moto y la casa. Esa
 * recta atraviesa manzanas, y en una ciudad con calles cortadas o de mano única
 * miente sobre lo que falta: el cliente ve el punto "a 300 metros" cuando al
 * rider todavía le quedan seis cuadras de rodeo.
 *
 * Acá se le pide el trazado real a un servicio de ruteo y se devuelven las
 * coordenadas del camino por las calles.
 *
 * ── Por qué es opcional ────────────────────────────────────────────────────
 *
 * Por defecto apunta al servidor de demostración público de OSRM. Ese servidor
 * es gratuito pero **no está pensado para producción**: tiene límite de uso y
 * puede estar caído sin aviso. Por eso:
 *
 *   - Si la petición falla, tarda demasiado o devuelve algo raro, se devuelve
 *     `null` y el mapa vuelve solo a la línea recta de siempre. El seguimiento
 *     nunca se rompe por esto.
 *   - La URL es configurable (`config.ruteo_url`), así que el día que el
 *     volumen lo justifique se puede apuntar a un OSRM propio o a un servicio
 *     pago cambiando un valor, sin tocar código.
 *
 * ── Cuidado con el volumen ─────────────────────────────────────────────────
 *
 * El rider reporta posición cada pocos segundos. Pedir la ruta en cada reporte
 * sería abusar del servicio y gastar datos del cliente al pedo. Por eso
 * `necesitaRecalcular` sólo autoriza un pedido nuevo cuando la moto se corrió
 * más de 150 metros desde el último trazado.
 */

const URL_RUTEO_POR_DEFECTO = 'https://router.project-osrm.org/route/v1/driving';
const TIMEOUT_MS = 6000;
const METROS_PARA_RECALCULAR = 150;

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export function metrosEntre(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * ¿Vale la pena volver a pedir la ruta?
 *
 * @param {{lat:number,lng:number}|null} ultimoOrigen Desde dónde se calculó la ruta vigente.
 * @param {number} lat Posición actual del rider.
 * @param {number} lng
 */
export function necesitaRecalcular(ultimoOrigen, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!ultimoOrigen) return true;
  return metrosEntre(ultimoOrigen.lat, ultimoOrigen.lng, lat, lng) > METROS_PARA_RECALCULAR;
}

/**
 * Pide el trazado por calles desde el rider hasta el domicilio.
 *
 * @returns {Promise<{puntos: Array<[number,number]>, metros: number, segundos: number}|null>}
 *          `null` si no se pudo obtener; el llamador debe caer a la línea recta.
 */
export async function obtenerRutaPorCalles({ desdeLat, desdeLng, hastaLat, hastaLng, urlBase }) {
  const coords = [desdeLat, desdeLng, hastaLat, hastaLng].map(Number);
  if (!coords.every(Number.isFinite)) return null;

  const base = String(urlBase || URL_RUTEO_POR_DEFECTO).replace(/\/$/, '');
  // OSRM espera lng,lat — al revés de lo habitual. Invertir el orden acá es un
  // error clásico que devuelve rutas en medio del océano.
  const url = `${base}/${desdeLng},${desdeLat};${hastaLng},${hastaLat}?overview=full&geometries=geojson`;

  // El seguimiento no puede quedarse esperando a un servicio externo lento.
  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const respuesta = await fetch(url, { signal: controlador.signal });
    if (!respuesta.ok) return null;

    const datos = await respuesta.json();
    const ruta = datos?.routes?.[0];
    const linea = ruta?.geometry?.coordinates;
    if (!Array.isArray(linea) || linea.length < 2) return null;

    return {
      // De vuelta a [lat, lng], que es lo que espera Leaflet.
      puntos: linea
        .map(([lng, lat]) => [Number(lat), Number(lng)])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng)),
      metros: Number(ruta.distance || 0),
      segundos: Number(ruta.duration || 0),
    };
  } catch {
    // Servicio caído, sin internet o se pasó del tiempo: que decida el mapa.
    return null;
  } finally {
    clearTimeout(corte);
  }
}
