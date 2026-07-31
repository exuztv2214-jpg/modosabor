function cleanText(value) {
  return String(value || '').trim();
}

function normalizeToken(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function includesToken(base, token) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return true;
  return normalizeToken(base).includes(normalizedToken);
}

const DEFAULT_MONTEROS_BOUNDS = {
  minLat: -27.23,
  maxLat: -27.1,
  minLng: -65.57,
  maxLng: -65.42,
};

function resolveLocationConfig(config = {}) {
  return {
    localidad: cleanText(config.localidad || config.negocio_localidad || 'Monteros'),
    provincia: cleanText(config.provincia || config.negocio_provincia || 'Tucuman'),
    pais: cleanText(config.pais || 'Argentina'),
  };
}

function resolveServiceBounds(config = {}) {
  return {
    minLat: Number(
      config.monteros_min_lat ?? config.delivery_min_lat ?? DEFAULT_MONTEROS_BOUNDS.minLat
    ),
    maxLat: Number(
      config.monteros_max_lat ?? config.delivery_max_lat ?? DEFAULT_MONTEROS_BOUNDS.maxLat
    ),
    minLng: Number(
      config.monteros_min_lng ?? config.delivery_min_lng ?? DEFAULT_MONTEROS_BOUNDS.minLng
    ),
    maxLng: Number(
      config.monteros_max_lng ?? config.delivery_max_lng ?? DEFAULT_MONTEROS_BOUNDS.maxLng
    ),
  };
}

export function isInsideServiceArea(latitud, longitud, config = {}) {
  if (!hasCoordinates(latitud, longitud)) return false;
  const lat = Number(latitud);
  const lng = Number(longitud);
  const bounds = resolveServiceBounds(config);
  return (
    Number.isFinite(bounds.minLat) &&
    Number.isFinite(bounds.maxLat) &&
    Number.isFinite(bounds.minLng) &&
    Number.isFinite(bounds.maxLng) &&
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  );
}

export function buildAddressForMaps(address, config = {}) {
  const baseAddress = cleanText(address);
  if (!baseAddress) return '';

  const location = resolveLocationConfig(config);
  const normalizedBase = normalizeToken(baseAddress);
  const mentionsOtherCity = [
    'concepcion',
    'san miguel de tucuman',
    'yerba buena',
    'aguilares',
  ].some((city) => normalizedBase.includes(city));
  const correctedBase =
    mentionsOtherCity && !includesToken(baseAddress, location.localidad)
      ? baseAddress.replace(/,\s*(concepcion|san miguel de tucuman|yerba buena|aguilares)\b/gi, '')
      : baseAddress;
  const parts = [correctedBase];

  if (location.localidad && !includesToken(correctedBase, location.localidad)) {
    parts.push(location.localidad);
  }
  if (location.provincia && !includesToken(correctedBase, location.provincia)) {
    parts.push(location.provincia);
  }
  if (location.pais && !includesToken(correctedBase, location.pais)) {
    parts.push(location.pais);
  }

  return parts.join(', ');
}

export function hasCoordinates(latitud, longitud) {
  return Number.isFinite(Number(latitud)) && Number.isFinite(Number(longitud));
}

function canUseExactCoordinates(latitud, longitud, ubicacionExacta, config = {}) {
  return (
    ubicacionExacta !== false &&
    hasCoordinates(latitud, longitud) &&
    isInsideServiceArea(latitud, longitud, config)
  );
}

export function buildMapsDestination(
  { latitud, longitud, direccion, ubicacionExacta },
  config = {}
) {
  if (canUseExactCoordinates(latitud, longitud, ubicacionExacta, config)) {
    return `${Number(latitud)},${Number(longitud)}`;
  }
  return buildAddressForMaps(direccion, config);
}

function buildNavigationDestination(
  { latitud, longitud, direccion, ubicacionExacta },
  config = {}
) {
  if (canUseExactCoordinates(latitud, longitud, ubicacionExacta, config)) {
    return `${Number(latitud)},${Number(longitud)}`;
  }
  const addressDestination = buildAddressForMaps(direccion, config);
  if (addressDestination) return addressDestination;
  return '';
}

export function buildGoogleMapsDirectionsUrl(
  { latitud, longitud, direccion, ubicacionExacta },
  config = {},
  options = {}
) {
  const destination = buildNavigationDestination(
    { latitud, longitud, direccion, ubicacionExacta },
    config
  );
  if (!destination) return '';

  const travelmode = cleanText(options.travelmode || 'driving');
  const origin = cleanText(options.origin);

  if (origin) {
    return `https://www.google.com/maps/dir/${origin}/${encodeURIComponent(destination)}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${encodeURIComponent(travelmode)}`;
}

export function buildWazeUrl({ latitud, longitud, direccion, ubicacionExacta }, config = {}) {
  if (ubicacionExacta !== false && hasCoordinates(latitud, longitud)) {
    return `https://waze.com/ul?ll=${Number(latitud)},${Number(longitud)}&navigate=yes`;
  }
  const destination = buildNavigationDestination(
    { latitud, longitud, direccion, ubicacionExacta },
    config
  );
  if (!destination) return '';
  return `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
}

export function buildGoogleMapsSearchUrl(
  { latitud, longitud, direccion, ubicacionExacta },
  config = {}
) {
  const destination = buildNavigationDestination(
    { latitud, longitud, direccion, ubicacionExacta },
    config
  );
  if (!destination) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

export function buildGoogleMapsQueryUrl(
  { latitud, longitud, direccion, ubicacionExacta },
  config = {}
) {
  const destination = buildNavigationDestination(
    { latitud, longitud, direccion, ubicacionExacta },
    config
  );
  if (!destination) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(destination)}`;
}

export function buildGoogleMapsEmbedUrl(
  { latitud, longitud, direccion, ubicacionExacta },
  config = {},
  options = {}
) {
  const destination = buildMapsDestination(
    { latitud, longitud, direccion, ubicacionExacta },
    config
  );
  if (!destination) return '';
  const zoom = Number.isFinite(Number(options.zoom)) ? Number(options.zoom) : 16;
  return `https://maps.google.com/maps?q=${encodeURIComponent(destination)}&t=&z=${zoom}&ie=UTF8&iwloc=&output=embed`;
}
