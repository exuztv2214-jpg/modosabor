function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Bounding box de Monteros, Tucuman.
// La zona anterior apuntaba cerca de Bella Vista/Rio Colorado y hacia que Maps
// enviara al rider fuera de Monteros cuando una direccion no tenia GPS exacto.
const MONTEROS_BOUNDS = {
  minLat: -27.23,
  maxLat: -27.1,
  minLng: -65.57,
  maxLng: -65.42,
};

function isInsideMonteros(latitud, longitud) {
  const lat = Number(latitud);
  const lng = Number(longitud);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= MONTEROS_BOUNDS.minLat &&
    lat <= MONTEROS_BOUNDS.maxLat &&
    lng >= MONTEROS_BOUNDS.minLng &&
    lng <= MONTEROS_BOUNDS.maxLng
  );
}

function validateRiderLocation(latitud, longitud) {
  const inside = isInsideMonteros(latitud, longitud);
  return {
    valid: inside,
    insideMonteros: inside,
    message: inside
      ? 'Ubicación dentro de Monteros'
      : 'Ubicación fuera de Monteros. El delivery solo opera dentro de la ciudad.',
  };
}

function getLocationDisplay(latitud, longitud) {
  const validation = validateRiderLocation(latitud, longitud);
  if (validation.insideMonteros) {
    return { text: 'Monteros, Tucumán', valid: true };
  }
  return { text: 'Fuera de zona de cobertura', valid: false };
}

function defaultZones(config = {}) {
  const baseCost = toNumber(config.costo_envio_base, 0);
  const baseTime = toNumber(config.tiempo_delivery, 25);
  return [
    {
      id: 'monteros',
      nombre: 'Monteros',
      keywords: ['monteros', 'centro', 'casco centrico', 'las piedras'],
      catchAll: true,
      costo_envio: baseCost,
      tiempo_estimado_min: baseTime,
      activa: true,
    },
    {
      id: 'cerca',
      nombre: 'Fuera de Monteros - cerca',
      keywords: ['santa lucia', 'santalucia', 'villa quinteros'],
      costo_envio: Math.max(baseCost, 1500),
      tiempo_estimado_min: baseTime + 15,
      activa: true,
    },
    {
      id: 'extendida',
      nombre: 'Fuera de Monteros - extendida',
      keywords: ['ruta', 'km', 'afuera', 'rio seco', 'famailla'],
      costo_envio: Math.max(baseCost, 2500),
      tiempo_estimado_min: baseTime + 30,
      activa: true,
    },
  ];
}

function parseZoneKeywords(zone) {
  const source = Array.isArray(zone?.keywords)
    ? zone.keywords
    : String(zone?.keywords || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

  return source.map((keyword) => normalizeText(keyword)).filter(Boolean);
}

function parseZones(config = {}) {
  const fallback = defaultZones(config);
  try {
    const parsed = JSON.parse(config.delivery_zonas || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return fallback;
    }

    return parsed
      .map((zone, index) => ({
        id: String(zone?.id || `zona_${index + 1}`),
        nombre: String(zone?.nombre || `Zona ${index + 1}`).trim(),
        keywords: parseZoneKeywords(zone),
        catchAll: zone?.catchAll === true || zone?.catchAll === 1 || zone?.catchAll === '1',
        costo_envio: Math.max(0, toNumber(zone?.costo_envio, toNumber(config.costo_envio_base, 0))),
        tiempo_estimado_min: Math.max(
          0,
          toNumber(zone?.tiempo_estimado_min, toNumber(config.tiempo_delivery, 30))
        ),
        activa: zone?.activa !== false && zone?.activa !== 0 && zone?.activa !== '0',
      }))
      .filter((zone) => zone.nombre);
  } catch {
    return fallback;
  }
}

function findMatchingZone(zones, address) {
  const normalizedAddress = normalizeText(address);
  if (!normalizedAddress) return null;

  // Primero buscar por keywords
  const byKeyword = zones.find(
    (zone) =>
      zone.activa &&
      zone.keywords.length > 0 &&
      zone.keywords.some((keyword) => normalizedAddress.includes(keyword))
  );
  if (byKeyword) return byKeyword;

  // Si no hay match, usar la zona catchAll (ej: Monteros es la zona local por defecto)
  return zones.find((zone) => zone.activa && zone.catchAll) || null;
}

function quoteDelivery(config = {}, address = '', options = {}) {
  const baseCost = Math.max(0, toNumber(config.costo_envio_base, 0));
  const baseTime = Math.max(0, toNumber(config.tiempo_delivery, 30));
  const validationActive = String(config.delivery_validacion_activa || '0') === '1';
  const zones = parseZones(config);
  const trimmedAddress = String(address || '').trim();

  if (!trimmedAddress) {
    return {
      available: !validationActive,
      matched: false,
      pending: true,
      zone_name: '',
      costo_envio: baseCost,
      tiempo_estimado_min: baseTime,
      message: validationActive
        ? 'Ingresa una direccion para validar la zona de delivery'
        : 'Ingresa una direccion para calcular envio y demora',
      zones,
    };
  }

  const matchedZone = findMatchingZone(zones, trimmedAddress);
  if (matchedZone) {
    return {
      available: true,
      matched: true,
      pending: false,
      zone_name: matchedZone.nombre,
      costo_envio: matchedZone.costo_envio,
      tiempo_estimado_min: matchedZone.tiempo_estimado_min,
      zone: matchedZone,
      message: `Zona detectada: ${matchedZone.nombre}`,
      zones,
    };
  }

  if (validationActive && !options.allowFallback) {
    return {
      available: false,
      matched: false,
      pending: false,
      zone_name: '',
      costo_envio: 0,
      tiempo_estimado_min: 0,
      message: 'La direccion esta fuera de las zonas configuradas',
      zones,
    };
  }

  return {
    available: true,
    matched: false,
    pending: false,
    zone_name: 'General',
    costo_envio: baseCost,
    tiempo_estimado_min: baseTime,
    message: 'No se encontro una zona exacta. Se aplica tarifa general.',
    zones,
  };
}

function serializeZones(zones = []) {
  return JSON.stringify(
    zones
      .map((zone, index) => ({
        id: String(zone?.id || `zona_${index + 1}`),
        nombre: String(zone?.nombre || '').trim(),
        keywords: Array.isArray(zone?.keywords)
          ? zone.keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean)
          : parseZoneKeywords(zone),
        catchAll: zone?.catchAll === true || zone?.catchAll === 1 || zone?.catchAll === '1',
        costo_envio: Math.max(0, toNumber(zone?.costo_envio, 0)),
        tiempo_estimado_min: Math.max(0, toNumber(zone?.tiempo_estimado_min, 0)),
        activa: zone?.activa !== false && zone?.activa !== 0 && zone?.activa !== '0',
      }))
      .filter((zone) => zone.nombre)
  );
}

module.exports = {
  defaultZones,
  parseZones,
  quoteDelivery,
  serializeZones,
  isInsideMonteros,
  validateRiderLocation,
  getLocationDisplay,
  MONTEROS_BOUNDS,
};
