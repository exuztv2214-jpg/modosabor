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

function resolveLocationConfig(config = {}) {
  return {
    localidad: cleanText(config.localidad || config.negocio_localidad || 'Monteros'),
    provincia: cleanText(config.provincia || config.negocio_provincia || 'Tucuman'),
    pais: cleanText(config.pais || 'Argentina'),
  };
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

export function buildMapsDestination({ latitud, longitud, direccion }, config = {}) {
  if (hasCoordinates(latitud, longitud)) {
    return `${Number(latitud)},${Number(longitud)}`;
  }
  return buildAddressForMaps(direccion, config);
}

function buildNavigationDestination({ latitud, longitud, direccion }, config = {}) {
  if (hasCoordinates(latitud, longitud)) {
    return `${Number(latitud)},${Number(longitud)}`;
  }
  const addressDestination = buildAddressForMaps(direccion, config);
  if (addressDestination) return addressDestination;
  return '';
}

export function buildGoogleMapsDirectionsUrl(
  { latitud, longitud, direccion },
  config = {},
  options = {}
) {
  const destination = buildNavigationDestination({ latitud, longitud, direccion }, config);
  if (!destination) return '';

  const travelmode = cleanText(options.travelmode || 'driving');
  const origin = cleanText(options.origin);

  if (origin) {
    return `https://www.google.com/maps/dir/${origin}/${encodeURIComponent(destination)}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=${encodeURIComponent(travelmode)}`;
}

export function buildWazeUrl({ latitud, longitud, direccion }, config = {}) {
  if (hasCoordinates(latitud, longitud)) {
    return `https://waze.com/ul?ll=${Number(latitud)},${Number(longitud)}&navigate=yes`;
  }
  const destination = buildNavigationDestination({ latitud, longitud, direccion }, config);
  if (!destination) return '';
  return `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
}

export function buildGoogleMapsSearchUrl({ latitud, longitud, direccion }, config = {}) {
  const destination = buildNavigationDestination({ latitud, longitud, direccion }, config);
  if (!destination) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
}

export function buildGoogleMapsQueryUrl({ latitud, longitud, direccion }, config = {}) {
  const destination = buildNavigationDestination({ latitud, longitud, direccion }, config);
  if (!destination) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(destination)}`;
}

export function buildGoogleMapsEmbedUrl(
  { latitud, longitud, direccion },
  config = {},
  options = {}
) {
  const destination = buildMapsDestination({ latitud, longitud, direccion }, config);
  if (!destination) return '';
  const zoom = Number.isFinite(Number(options.zoom)) ? Number(options.zoom) : 16;
  return `https://maps.google.com/maps?q=${encodeURIComponent(destination)}&t=&z=${zoom}&ie=UTF8&iwloc=&output=embed`;
}
