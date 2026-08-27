const ZONA_NEGOCIO = 'America/Argentina/Buenos_Aires';

function partesFechaArgentina(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha);

  return Object.fromEntries(partes.map(({ type, value }) => [type, value]));
}

/** Fecha civil del negocio, independiente de la zona horaria del dispositivo. */
export function hoyArgentina(fecha = new Date()) {
  const { year, month, day } = partesFechaArgentina(fecha);
  return `${year}-${month}-${day}`;
}

export function mesDiaArgentina(fecha = new Date()) {
  const { month, day } = partesFechaArgentina(fecha);
  return `${month}-${day}`;
}
