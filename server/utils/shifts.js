function parseTurnos(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fallbackShiftName(id) {
  if (!id) return 'Sin turno';
  const normalized = String(id).replace(/[_-]+/g, ' ').trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function parseMinutes(value) {
  const [hours, minutes] = String(value || '00:00')
    .split(':')
    .map((part) => Number(part || 0));
  return hours * 60 + minutes;
}

function getBusinessTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    hours: Number(parts.hour || 0),
    minutes: Number(parts.minute || 0),
  };
}

function isNowInShift(shift, nowMinutes) {
  const from = parseMinutes(shift.desde);
  const to = parseMinutes(shift.hasta);
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  if (to >= from) {
    return nowMinutes >= from && nowMinutes <= to;
  }
  return nowMinutes >= from || nowMinutes <= to;
}

function getCurrentShiftInfo(config, date = new Date()) {
  const turnos = parseTurnos(config.turnos_negocio).filter((shift) => shift?.activo !== false);
  const now = getBusinessTimeParts(date);
  const nowMinutes = now.hours * 60 + now.minutes;
  const turnoActual = turnos.find((shift) => isNowInShift(shift, nowMinutes)) || null;

  return {
    abierto_ahora: Boolean(turnoActual),
    turno_actual: turnoActual,
    turnos,
  };
}

function getShiftForDate(config, date = new Date()) {
  const turnos = parseTurnos(config.turnos_negocio).filter((shift) => shift?.activo !== false);
  const businessTime = getBusinessTimeParts(date);
  const minutes = businessTime.hours * 60 + businessTime.minutes;
  return turnos.find((shift) => isNowInShift(shift, minutes)) || null;
}

function getShiftLabelForDate(config, date = new Date(), fallback = 'Sin turno') {
  const shift = getShiftForDate(config, date);
  if (!shift) return fallback;
  return shift.nombre || fallbackShiftName(shift.id);
}

function resolveShiftLabel(config, existingValue, date = new Date()) {
  if (String(existingValue || '').trim()) return String(existingValue).trim();
  return getShiftLabelForDate(config, date);
}

function shiftIdForDate(config, date = new Date()) {
  const shift = getShiftForDate(config, date);
  return shift?.id || '';
}

function matchesPreferredShift(turnoPreferido, shiftId) {
  const preferred = String(turnoPreferido || '')
    .trim()
    .toLowerCase();
  const current = String(shiftId || '')
    .trim()
    .toLowerCase();
  if (!preferred || preferred === 'doble') return true;
  if (!current) return false;
  return preferred === current;
}

module.exports = {
  parseTurnos,
  getBusinessTimeParts,
  getCurrentShiftInfo,
  getShiftForDate,
  getShiftLabelForDate,
  resolveShiftLabel,
  shiftIdForDate,
  matchesPreferredShift,
};
