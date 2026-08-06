/**
 * Geocoding de direcciones con Nominatim (OpenStreetMap).
 *
 * PROBLEMA QUE RESUELVE:
 * La mayoría de los pedidos entran con la dirección escrita a mano
 * ("Urquiza 58") y sin punto GPS, porque el cliente no siempre comparte
 * su ubicación. Sin coordenadas, el mapa de la app rider no puede trazar
 * nada y termina mostrando un cartel de "navegación por dirección" —
 * o sea, el rider se queda sin mapa justo cuando más lo necesita.
 *
 * Este servicio convierte "Urquiza 58" en lat/lng para que el mapa
 * funcione siempre.
 *
 * POR QUÉ NOMINATIM Y NO GOOGLE:
 * Es el geocodificador oficial de OpenStreetMap, gratis, sin API key y
 * sin límite de uso mensual. Coherente con el resto del stack de mapas
 * (tiles de OSM, ruteo de OSRM). Google cobra por request pasado el
 * free tier y requiere tarjeta.
 *
 * LIMITACIONES HONESTAS:
 * - Política de uso: máximo 1 request/segundo y User-Agent identificable.
 *   Respetamos ambas cosas (ver RATE_LIMIT_MS y USER_AGENT).
 * - En pueblos chicos la numeración exacta a veces no está mapeada; en
 *   ese caso cae al centro de la calle o de la localidad. Es aproximado
 *   pero mucho mejor que nada, y el operador puede corregirlo a mano.
 * - Por eso NUNCA marcamos el resultado como `ubicacion_exacta`: se
 *   guarda como referencia aproximada. La ubicación exacta sigue siendo
 *   solo la que el cliente comparte por WhatsApp.
 */
const db = require('../db');
const logger = require('../utils/logger');

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'ModoSabor/1.0 (sistema de delivery; contacto: modosabor.com.ar)';
const RATE_LIMIT_MS = 1100; // política de Nominatim: 1 req/seg
const TIMEOUT_MS = 8000;

let ultimaConsulta = 0;

/** Espera lo necesario para no violar el rate limit. */
async function respetarRateLimit() {
  const ahora = Date.now();
  const transcurrido = ahora - ultimaConsulta;
  if (transcurrido < RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS - transcurrido));
  }
  ultimaConsulta = Date.now();
}

/** Lee la configuración de localidad del negocio. */
function getUbicacionNegocio() {
  try {
    const rows = db
      .prepare(
        `SELECT clave, valor FROM configuracion
         WHERE clave IN ('negocio_localidad','negocio_provincia','negocio_pais',
                         'delivery_min_lat','delivery_max_lat',
                         'delivery_min_lng','delivery_max_lng')`
      )
      .all();
    const map = new Map(rows.map((r) => [r.clave, r.valor]));
    return {
      localidad: map.get('negocio_localidad') || 'Monteros',
      provincia: map.get('negocio_provincia') || 'Tucumán',
      pais: map.get('negocio_pais') || 'Argentina',
      bounds: {
        minLat: Number(map.get('delivery_min_lat')) || -27.23,
        maxLat: Number(map.get('delivery_max_lat')) || -27.1,
        minLng: Number(map.get('delivery_min_lng')) || -65.57,
        maxLng: Number(map.get('delivery_max_lng')) || -65.42,
      },
    };
  } catch {
    return {
      localidad: 'Monteros',
      provincia: 'Tucumán',
      pais: 'Argentina',
      bounds: { minLat: -27.23, maxLat: -27.1, minLng: -65.57, maxLng: -65.42 },
    };
  }
}

/**
 * Normaliza una dirección para usarla como clave de caché.
 * "Urquiza 58" y "urquiza  58 " son la misma dirección.
 */
function claveCache(direccion) {
  return String(direccion || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/** ¿La coordenada cae dentro de la zona de reparto? */
function dentroDeZona(lat, lng, bounds) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  );
}

/** Busca en el caché local antes de salir a la red. */
function buscarEnCache(direccion) {
  const clave = claveCache(direccion);
  if (!clave) return null;
  try {
    const row = db
      .prepare(
        `SELECT latitud, longitud, precision_geocoding
         FROM geocoding_cache WHERE clave = ?`
      )
      .get(clave);
    if (!row) return null;
    return {
      lat: Number(row.latitud),
      lng: Number(row.longitud),
      precision: row.precision_geocoding,
      desdeCache: true,
    };
  } catch {
    return null;
  }
}

function guardarEnCache(direccion, resultado) {
  const clave = claveCache(direccion);
  if (!clave || !resultado) return;
  try {
    db.prepare(
      `INSERT INTO geocoding_cache (clave, direccion_original, latitud, longitud, precision_geocoding, actualizado_en)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(clave) DO UPDATE SET
         latitud = excluded.latitud,
         longitud = excluded.longitud,
         precision_geocoding = excluded.precision_geocoding,
         actualizado_en = CURRENT_TIMESTAMP`
    ).run(clave, String(direccion), resultado.lat, resultado.lng, resultado.precision || '');
  } catch (error) {
    logger.error('No se pudo cachear geocoding', { message: error.message });
  }
}

/**
 * Consulta Nominatim. Devuelve null si no encuentra nada usable.
 */
async function consultarNominatim(direccionCompleta, bounds) {
  await respetarRateLimit();

  // viewbox + bounded acota la búsqueda a la zona de reparto: evita que
  // "Urquiza 58" matchee una calle Urquiza de Buenos Aires.
  const params = new URLSearchParams({
    q: direccionCompleta,
    format: 'json',
    limit: '1',
    addressdetails: '1',
    countrycodes: 'ar',
    viewbox: `${bounds.minLng},${bounds.maxLat},${bounds.maxLng},${bounds.minLat}`,
    bounded: '1',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const hit = data[0];
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    // Nominatim devuelve `type`/`class` que indican qué tan preciso es
    // el match: house = numeración exacta, road = centro de la calle.
    const precision = hit.address?.house_number
      ? 'numeracion'
      : hit.type === 'road' || hit.class === 'highway'
        ? 'calle'
        : 'aproximada';

    return { lat, lng, precision };
  } catch (error) {
    if (error.name !== 'AbortError') {
      logger.error('Nominatim falló', { message: error.message });
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Geocodifica una dirección. Primero busca en caché.
 *
 * @param {string} direccion  tal como la escribió el operador ("Urquiza 58")
 * @returns {Promise<{lat, lng, precision, desdeCache}|null>}
 */
async function geocodificar(direccion) {
  const limpia = String(direccion || '').trim();
  if (limpia.length < 4) return null;

  const cacheado = buscarEnCache(limpia);
  if (cacheado) return cacheado;

  const { localidad, provincia, pais, bounds } = getUbicacionNegocio();
  const completa = `${limpia}, ${localidad}, ${provincia}, ${pais}`;

  const resultado = await consultarNominatim(completa, bounds);
  if (!resultado) return null;

  // Descartar resultados fuera de la zona de reparto: si Nominatim
  // devolvió algo lejano es que no entendió la dirección.
  if (!dentroDeZona(resultado.lat, resultado.lng, bounds)) {
    logger.info('Geocoding fuera de zona, descartado', { direccion: limpia });
    return null;
  }

  guardarEnCache(limpia, resultado);
  return { ...resultado, desdeCache: false };
}

/**
 * Geocodifica un pedido y le guarda las coordenadas si no las tenía.
 *
 * IMPORTANTE: no pisa una ubicación exacta que el cliente haya compartido,
 * y NO marca `cliente_ubicacion_exacta = 1` — el resultado del geocoding
 * es una referencia aproximada, no un punto confirmado por el cliente.
 *
 * Es fire-and-forget: nunca debe demorar ni romper la creación del pedido.
 */
async function geocodificarPedido(pedidoId) {
  try {
    const pedido = db
      .prepare(
        `SELECT id, cliente_direccion, cliente_latitud, cliente_longitud,
                cliente_ubicacion_exacta
         FROM pedidos WHERE id = ?`
      )
      .get(pedidoId);

    if (!pedido) return null;

    // Ya tiene punto real: no tocamos nada.
    const tieneLat = Number.isFinite(Number(pedido.cliente_latitud));
    const tieneLng = Number.isFinite(Number(pedido.cliente_longitud));
    const noEsCero =
      Math.abs(Number(pedido.cliente_latitud)) > 0.0001 ||
      Math.abs(Number(pedido.cliente_longitud)) > 0.0001;
    if (tieneLat && tieneLng && noEsCero) return null;

    if (!pedido.cliente_direccion) return null;

    const geo = await geocodificar(pedido.cliente_direccion);
    if (!geo) return null;

    db.prepare(
      `UPDATE pedidos
       SET cliente_latitud = ?, cliente_longitud = ?,
           cliente_geocodificado = 1, cliente_geocoding_precision = ?
       WHERE id = ?`
    ).run(geo.lat, geo.lng, geo.precision, pedidoId);

    logger.info('Pedido geocodificado', {
      pedidoId,
      direccion: pedido.cliente_direccion,
      precision: geo.precision,
      desdeCache: geo.desdeCache,
    });

    return geo;
  } catch (error) {
    logger.error('Geocodificación de pedido falló', { pedidoId, message: error.message });
    return null;
  }
}

module.exports = {
  geocodificar,
  geocodificarPedido,
  claveCache,
};
