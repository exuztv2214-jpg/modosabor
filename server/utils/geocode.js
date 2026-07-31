/**
 * Geocodificación de direcciones usando Nominatim (OpenStreetMap)
 * Gratuito, sin API key, con rate limiting respetuoso.
 * Incluye cache en memoria para evitar llamadas repetidas.
 * FORZADO a Monteros, Tucumán — rechaza resultados de otras localidades.
 */

const https = require('https');
const logger = require('./logger');
const { isInsideMonteros } = require('./deliveryZones');

const NOMINATIM_HOST = 'nominatim.openstreetmap.org';
const NOMINATIM_TIMEOUT = 8000;

// ── CACHE EN MEMORIA ──
// Evita llamadas repetidas a Nominatim para la misma dirección
const geocodeCache = new Map();
const CACHE_MAX_SIZE = 500;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function getCacheKey(address, city, state) {
  return `${String(address).trim().toLowerCase()}|${city}|${state}`;
}

function getCachedResult(key) {
  const entry = geocodeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    geocodeCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCacheResult(key, data) {
  if (geocodeCache.size >= CACHE_MAX_SIZE) {
    // Eliminar la entrada más antigua
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [k, v] of geocodeCache) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) geocodeCache.delete(oldestKey);
  }
  geocodeCache.set(key, { data, timestamp: Date.now() });
}

function nominatimRequest(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: NOMINATIM_HOST,
        path,
        headers: {
          'User-Agent': 'ModoSabor-Geocoder/1.0 (contacto@modosabor.com)',
          Accept: 'application/json',
        },
        timeout: NOMINATIM_TIMEOUT,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(new Error('Respuesta inválida de Nominatim'));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout en Nominatim'));
    });
  });
}

/**
 * Geocodificar una dirección a latitud/longitud.
 * @param {string} address - Dirección a geocodificar
 * @param {Object} options
 * @param {string} options.city - Ciudad (default: Monteros)
 * @param {string} options.state - Provincia (default: Tucumán)
 * @param {string} options.country - País (default: Argentina)
 * @returns {Promise<{lat: number|null, lng: number|null, display_name: string}|null>}
 */
async function geocodeAddress(address, options = {}) {
  const city = options.city || 'Monteros';
  const state = options.state || 'Tucumán';
  const country = options.country || 'Argentina';

  const cleanAddress = String(address || '').trim();
  if (!cleanAddress) return null;

  // ── Verificar cache ──
  const cacheKey = getCacheKey(cleanAddress, city, state);
  const cached = getCachedResult(cacheKey);
  if (cached) {
    logger.info('[geocode] Cache hit:', cleanAddress);
    return cached;
  }

  // Construir query enriquecido con contexto local
  const query = `${cleanAddress}, ${city}, ${state}, ${country}`;
  const encodedQuery = encodeURIComponent(query);
  const path = `/search?q=${encodedQuery}&format=json&limit=1&addressdetails=1&countrycodes=ar`;

  try {
    const results = await nominatimRequest(path);

    if (!Array.isArray(results) || results.length === 0) {
      logger.info('[geocode] Sin resultados para:', cleanAddress);
      return null;
    }

    const result = results[0];
    let lat = Number(result.lat);
    let lng = Number(result.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      logger.warn('[geocode] Coordenadas inválidas para:', cleanAddress);
      return null;
    }

    // ── VALIDACIÓN CRÍTICA: forzar Monteros ──
    // Si Nominatim devuelve otra ciudad, no guardamos coordenadas falsas.
    // El pedido queda con direccion textual y la app rider abre Maps con
    // "direccion, Monteros, Tucuman, Argentina".
    const insideMonteros = isInsideMonteros(lat, lng);
    if (!insideMonteros) {
      logger.warn(
        `[geocode] Nominatim devolvió coords fuera de Monteros para "${cleanAddress}":`,
        lat,
        lng,
        '- se ignoran coordenadas'
      );
      return null;
    }

    const geoResult = {
      lat,
      lng,
      display_name: result.display_name || query,
    };

    // ── Guardar en cache ──
    setCacheResult(cacheKey, geoResult);
    logger.info('[geocode] Éxito + cache:', cleanAddress, '→', lat, lng);

    return geoResult;
  } catch (error) {
    logger.error('[geocode] Error:', error.message);
    return null;
  }
}

/**
 * Geocodificar dirección de cliente con fallback silencioso.
 * Si falla, retorna null sin lanzar error.
 */
async function geocodeClienteDireccion(direccion, config = {}) {
  const city = config.negocio_localidad || config.localidad || 'Monteros';
  const state = config.negocio_provincia || config.provincia || 'Tucumán';

  return geocodeAddress(direccion, { city, state });
}

module.exports = {
  geocodeAddress,
  geocodeClienteDireccion,
};
