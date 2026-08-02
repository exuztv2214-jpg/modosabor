/**
 * Helpers de presentación de la app rider.
 * Lógica pura, sin JSX ni dependencias de React, para poder testear
 * y reusar desde varios componentes.
 */

/**
 * Saludo según la hora local. Los riders trabajan turnos de mediodía
 * y noche, así que el saludo también sirve de contexto de turno.
 */
export function saludoPorHora(date = new Date()) {
  const h = date.getHours();
  if (h < 6) return { saludo: 'Buenas noches', turno: 'Turno madrugada' };
  if (h < 13) return { saludo: 'Buen día', turno: 'Turno mediodía' };
  if (h < 20) return { saludo: 'Buenas tardes', turno: 'Turno tarde' };
  return { saludo: 'Buenas noches', turno: 'Turno noche' };
}

/**
 * Minutos transcurridos desde que se creó el pedido.
 * Devuelve null si la fecha es inválida.
 */
export function minutosDesde(fechaIso) {
  if (!fechaIso) return null;
  const raw = String(fechaIso).replace(' ', 'T');
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

/**
 * Nivel de urgencia de un pedido según cuánto lleva esperando.
 * Se usa para el border-left de color de las cards.
 *
 *   ok       (<15 min)  → verde
 *   atencion (15-30)    → ámbar
 *   urgente  (>30)      → rojo
 */
export function nivelUrgencia(fechaIso) {
  const min = minutosDesde(fechaIso);
  if (min === null) return { nivel: 'ok', minutos: null, color: '#10b981' };
  if (min > 30) return { nivel: 'urgente', minutos: min, color: '#ef4444' };
  if (min >= 15) return { nivel: 'atencion', minutos: min, color: '#f59e0b' };
  return { nivel: 'ok', minutos: min, color: '#10b981' };
}

/**
 * Etapas del ciclo de vida de un pedido para el timeline horizontal.
 * El índice indica en qué punto está; -1 si el estado no matchea
 * (cancelado, incidencia, etc.).
 */
export const ETAPAS_PEDIDO = [
  { key: 'asignado', label: 'Asignado' },
  { key: 'retirado', label: 'Retiré' },
  { key: 'en_camino', label: 'En camino' },
  { key: 'entregado', label: 'Entregué' },
];

export function indiceEtapa(estado) {
  const e = String(estado || '').toLowerCase();
  if (['entregado', 'completado', 'finalizado'].includes(e)) return 3;
  if (e === 'en_camino') return 2;
  if (['retirado', 'aceptado', 'listo'].includes(e)) return 1;
  if (['asignado', 'confirmado', 'preparando', 'pendiente'].includes(e)) return 0;
  return -1;
}

/**
 * Formatea distancia en metros a texto legible.
 */
export function fmtDistancia(metros) {
  const m = Number(metros);
  if (!Number.isFinite(m)) return '';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

/**
 * ETA estimado en minutos a 28 km/h promedio (moto urbana).
 */
export function etaMinutos(metros) {
  const m = Number(metros);
  if (!Number.isFinite(m) || m <= 0) return null;
  return Math.max(1, Math.round((m / 1000 / 28) * 60));
}

/**
 * Distancia Haversine en metros entre dos puntos.
 */
export function distanciaMetros(lat1, lng1, lat2, lng2) {
  const nums = [lat1, lng1, lat2, lng2].map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [a1, o1, a2, o2] = nums;
  const R = 6371000;
  const dLat = ((a2 - a1) * Math.PI) / 180;
  const dLng = ((o2 - o1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a1 * Math.PI) / 180) * Math.cos((a2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Ordena los pedidos por cercanía usando "vecino más próximo".
 *
 * Problema real: con 6-8 pedidos asignados, la lista ordenada por hora
 * de creación hace que el rider cruce el pueblo de ida y vuelta. Este
 * heurístico arma una secuencia razonable: empieza en la posición del
 * rider y en cada paso va al pedido más cercano que queda.
 *
 * No es la ruta óptima (eso es TSP, NP-completo), pero con menos de 10
 * paradas la diferencia contra el óptimo es chica y el cálculo es
 * instantáneo. Es lo mismo que hacen las apps de delivery para
 * sugerir orden.
 *
 * Los pedidos sin coordenadas válidas van al final conservando su
 * orden original: no podemos ubicarlos, pero tampoco los escondemos.
 *
 * @param {Array} pedidos
 * @param {number} riderLat
 * @param {number} riderLng
 * @returns {Array} nueva lista ordenada (no muta la original)
 */
export function ordenarPorCercania(pedidos, riderLat, riderLng) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  if (lista.length <= 1) return [...lista];

  const conCoords = [];
  const sinCoords = [];
  for (const p of lista) {
    const lat = Number(p?.cliente_latitud);
    const lng = Number(p?.cliente_longitud);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
      conCoords.push({ pedido: p, lat, lng });
    } else {
      sinCoords.push(p);
    }
  }

  // Sin punto de partida válido no podemos ordenar: devolvemos como vino.
  const origenLat = Number(riderLat);
  const origenLng = Number(riderLng);
  if (!Number.isFinite(origenLat) || !Number.isFinite(origenLng) || conCoords.length === 0) {
    return [...lista];
  }

  const pendientes = [...conCoords];
  const ruta = [];
  let curLat = origenLat;
  let curLng = origenLng;

  while (pendientes.length > 0) {
    let mejorIdx = 0;
    let mejorDist = Infinity;
    for (let i = 0; i < pendientes.length; i += 1) {
      const d = distanciaMetros(curLat, curLng, pendientes[i].lat, pendientes[i].lng);
      if (d !== null && d < mejorDist) {
        mejorDist = d;
        mejorIdx = i;
      }
    }
    const [elegido] = pendientes.splice(mejorIdx, 1);
    ruta.push({ ...elegido.pedido, _distanciaDesdeAnterior: mejorDist });
    curLat = elegido.lat;
    curLng = elegido.lng;
  }

  return [...ruta, ...sinCoords];
}

/**
 * Claves de Preferences relacionadas al turno y a las marcas personales.
 * Centralizadas acá para no tener strings sueltos por todo el panel.
 */
export const KEY_TURNO_INICIO = 'ms_rider_turno_inicio';
export const riderRecordKey = (riderId) => `ms_rider_record_entregas_${riderId}`;

/**
 * Duración legible de un turno a partir de minutos.
 */
export function fmtDuracion(minutos) {
  const m = Math.max(0, Math.round(Number(minutos) || 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  if (rest === 0) return `${h} h`;
  return `${h} h ${rest} min`;
}
