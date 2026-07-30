function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

function diffMinutes(start, end = new Date()) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

function zoneProfile(zone) {
  const name = String(zone || '').toLowerCase();
  if (!name) {
    return { speedKmh: 20, roadFactor: 1.28, buffer: 4 };
  }
  if (name.includes('monteros') || name.includes('centro')) {
    return { speedKmh: 18, roadFactor: 1.35, buffer: 4 };
  }
  if (name.includes('ruta') || name.includes('afuera') || name.includes('externa')) {
    return { speedKmh: 28, roadFactor: 1.18, buffer: 6 };
  }
  return { speedKmh: 22, roadFactor: 1.25, buffer: 5 };
}

function estimateFromState(pedido, config = {}) {
  const baseDelivery = Math.max(
    5,
    Number(pedido?.tiempo_estimado_min || config.tiempo_delivery || 30)
  );
  const baseRetiro = Math.max(5, Number(config.tiempo_retiro || 20));
  const base = pedido?.tipo_entrega === 'retiro' ? baseRetiro : baseDelivery;

  if (!pedido?.creado_en) {
    return { minutes: base, source: 'config' };
  }

  const elapsed = diffMinutes(pedido.creado_en);
  if (pedido.estado === 'cancelado' || pedido.estado === 'entregado') {
    return { minutes: 0, source: 'final' };
  }
  if (pedido.estado === 'nuevo') {
    return { minutes: Math.max(base, 10), source: 'estado' };
  }
  if (pedido.estado === 'confirmado') {
    return { minutes: Math.max(base - 2, 8), source: 'estado' };
  }
  if (pedido.estado === 'preparando') {
    return { minutes: Math.max(base - elapsed, 6), source: 'estado' };
  }
  if (pedido.estado === 'listo') {
    return {
      minutes: pedido.tipo_entrega === 'delivery' ? Math.max(Math.round(base * 0.35), 8) : 5,
      source: 'estado',
    };
  }
  if (pedido.estado === 'en_camino') {
    return { minutes: Math.max(Math.round(base * 0.3), 6), source: 'estado' };
  }

  return { minutes: Math.max(base - elapsed, 5), source: 'estado' };
}

function estimateDeliveryEta(pedido, config = {}) {
  const fallback = estimateFromState(pedido, config);
  const riderLat = toNumber(pedido?.repartidor?.latitud);
  const riderLng = toNumber(pedido?.repartidor?.longitud);
  const clientLat = toNumber(pedido?.cliente_latitud);
  const clientLng = toNumber(pedido?.cliente_longitud);

  if (pedido?.tipo_entrega !== 'delivery' || pedido?.estado !== 'en_camino') {
    return { ...fallback, distance_km: null, stale_location: false };
  }

  if (riderLat === null || riderLng === null || clientLat === null || clientLng === null) {
    return { ...fallback, distance_km: null, stale_location: false };
  }

  const linearDistanceKm = haversineKm(riderLat, riderLng, clientLat, clientLng);
  const profile = zoneProfile(pedido?.delivery_zona);
  const roadDistanceKm = Math.max(0.2, linearDistanceKm * profile.roadFactor);
  const travelMinutes = Math.round((roadDistanceKm / profile.speedKmh) * 60);
  const freshnessMinutes = pedido?.repartidor?.ultima_ubicacion_en
    ? diffMinutes(pedido.repartidor.ultima_ubicacion_en)
    : 999;
  const staleLocation = freshnessMinutes > 10;
  const trafficPenalty = linearDistanceKm > 6 ? 4 : linearDistanceKm > 3 ? 2 : 0;
  const buffer = (staleLocation ? 7 : profile.buffer) + trafficPenalty;
  const minutes = Math.max(2, Math.min(90, travelMinutes + buffer));

  return {
    minutes,
    source: staleLocation ? 'rider_route_stale' : 'rider_route',
    distance_km: Math.round(roadDistanceKm * 10) / 10,
    stale_location: staleLocation,
  };
}

module.exports = {
  estimateDeliveryEta,
};
