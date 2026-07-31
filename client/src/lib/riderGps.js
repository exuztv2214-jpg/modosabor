export const RIDER_GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

export const RIDER_GPS_MAX_ACCURACY_METERS = 100;
const RIDER_GPS_GOOD_ACCURACY_METERS = 50;
const RIDER_GPS_MAX_REALISTIC_SPEED_MPS = 35;
const RIDER_GPS_HARD_JUMP_METERS = 300;
const RIDER_GPS_SMOOTH_DISTANCE_METERS = 120;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function filterRiderGpsPosition(position, previous = null) {
  const coords = position?.coords || {};
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  const accuracy = Number(coords.accuracy);
  const timestamp = Number(position?.timestamp || Date.now());

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { accepted: false, reason: 'coords_invalidas' };
  }

  if (Number.isFinite(accuracy) && accuracy > RIDER_GPS_MAX_ACCURACY_METERS) {
    return { accepted: false, reason: 'precision_baja', accuracy };
  }

  const point = {
    lat,
    lng,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    speed: Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null,
    timestamp,
    smoothed: false,
  };

  if (!previous?.lat || !previous?.lng || !previous?.timestamp) {
    return { accepted: true, point };
  }

  const distance = haversineMeters(previous.lat, previous.lng, lat, lng);
  const elapsedSeconds = Math.max(1, (timestamp - previous.timestamp) / 1000);
  const requiredSpeed = distance / elapsedSeconds;
  const previousAccuracy = Number(previous.accuracy);
  const currentAccuracy = Number(point.accuracy);
  const currentIsMuchBetter =
    Number.isFinite(currentAccuracy) &&
    currentAccuracy <= RIDER_GPS_GOOD_ACCURACY_METERS &&
    (!Number.isFinite(previousAccuracy) || currentAccuracy + 20 < previousAccuracy);

  if (
    distance > RIDER_GPS_HARD_JUMP_METERS &&
    requiredSpeed > RIDER_GPS_MAX_REALISTIC_SPEED_MPS &&
    !currentIsMuchBetter
  ) {
    return {
      accepted: false,
      reason: 'salto_brusco',
      distance,
      elapsedSeconds,
      requiredSpeed,
    };
  }

  if (distance > 8 && distance < RIDER_GPS_SMOOTH_DISTANCE_METERS) {
    const weight = Number.isFinite(currentAccuracy) && currentAccuracy <= 25 ? 0.55 : 0.35;
    point.lat = previous.lat * (1 - weight) + lat * weight;
    point.lng = previous.lng * (1 - weight) + lng * weight;
    point.smoothed = true;
  }

  return { accepted: true, point, distance, elapsedSeconds };
}
