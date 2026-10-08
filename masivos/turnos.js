// Misma fecha operativa que Modo Sabor: una noche pertenece al día en que empezó.
function claveTurno(turnos, date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  const minutos = (value) => {
    const [h, m] = String(value || '')
      .split(':')
      .map(Number);
    return h * 60 + m;
  };
  let fecha = `${p.year}-${p.month}-${p.day}`;
  const ahora = Number(p.hour) * 60 + Number(p.minute);
  const turno = (Array.isArray(turnos) ? turnos : []).find((t) => {
    if (!t?.id || t.activo === false) return false;
    const desde = minutos(t.desde),
      hasta = minutos(t.hasta);
    return hasta >= desde ? ahora >= desde && ahora <= hasta : ahora >= desde || ahora <= hasta;
  });
  if (!turno) return `${fecha}:fuera-de-turno`;
  if (minutos(turno.hasta) < minutos(turno.desde) && ahora <= minutos(turno.hasta))
    fecha = new Date(Date.parse(`${fecha}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  return `${fecha}:${String(turno.id).trim().toLowerCase()}`;
}
module.exports = { claveTurno };
