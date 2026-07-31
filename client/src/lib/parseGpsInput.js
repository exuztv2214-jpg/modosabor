// Parser tolerante de ubicaciones GPS pegadas por el operador del TPV.
// Sirve para el flujo "el cliente me mando la ubicacion por WhatsApp": el
// operador copia el link o las coordenadas y las pega en el TPV, y el
// sistema saca lat/lng automaticamente.
//
// Formatos que soporta:
//   - google.com/maps?q=-27.18,-65.48        (el que manda WhatsApp Location al reenviar)
//   - google.com/maps/@-27.18,-65.48,17z
//   - google.com/maps/place/.../@-27.18,-65.48,17z
//   - maps.google.com/?q=-27.18,-65.48
//   - -27.18, -65.48                          (coordenadas crudas, separadas por coma, espacio o /)
//
// NO soporta links cortos (goo.gl/maps/xxx, maps.app.goo.gl/xxx) porque
// requieren hacer un GET para expandir la URL, y desde el navegador se
// bloquea por CORS. En ese caso el operador tiene que abrir el link una
// vez en Google Maps y copiar el link expandido de la barra.

const ARG_LAT_RANGE = [-55, -22];
const ARG_LNG_RANGE = [-74, -53];

function inRange(value, [min, max]) {
  return value >= min && value <= max;
}

// Busca el primer par lat,lng valido dentro del texto usando una regex laxa.
function extractLatLng(text) {
  if (!text) return null;
  const patterns = [
    // q=LAT,LNG (o &q=LAT,LNG) — Google Maps con parametro q
    /[?&]q=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    // @LAT,LNG,zoom — Google Maps con formato @
    /@(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    // ll=LAT,LNG — variante vieja de Maps
    /[?&]ll=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    // Coordenadas crudas: -27.18, -65.48 (o con espacio, / entre ellas)
    /(-?\d{1,3}\.\d+)\s*[,\s/]\s*(-?\d{1,3}\.\d+)/,
  ];

  for (const rx of patterns) {
    const m = String(text).match(rx);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

// Devuelve { ok, lat, lng, warning? } o { ok: false, error }.
// "warning" se usa cuando las coords estan fuera de Argentina (probable
// copy-paste equivocado, pero no bloqueante).
export function parseGpsInput(rawInput) {
  const text = String(rawInput || '').trim();
  if (!text) return { ok: false, error: 'Pegá un link de Google Maps o unas coordenadas' };

  // Links cortos: no los podemos expandir desde el browser (CORS).
  if (/goo\.gl\/maps\/|maps\.app\.goo\.gl\//i.test(text)) {
    return {
      ok: false,
      error:
        'Los links cortos (goo.gl / maps.app.goo.gl) no se pueden leer. Abrilo una vez en Google Maps y copiá el link largo de la barra.',
    };
  }

  const coords = extractLatLng(text);
  if (!coords) {
    return {
      ok: false,
      error:
        'No encontré coordenadas en lo que pegaste. Probá con un link de Google Maps o "-27.18, -65.48".',
    };
  }

  const { lat, lng } = coords;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, error: 'Las coordenadas están fuera de rango' };
  }

  const inArgentina = inRange(lat, ARG_LAT_RANGE) && inRange(lng, ARG_LNG_RANGE);
  return {
    ok: true,
    lat,
    lng,
    warning: inArgentina ? null : 'Las coordenadas parecen no estar en Argentina, revisá',
  };
}
