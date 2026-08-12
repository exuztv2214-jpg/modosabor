function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function clean(value, max = 4000) {
  return String(value || '')
    .replace(/\0/g, '')
    .trim()
    .slice(0, max);
}

function buildAgentTraining(config = {}, shift = null) {
  const rulesByShift = parseObject(config.whatsapp_agente_reglas_turnos);
  const shiftId = clean(shift?.id, 80);

  return {
    nombre: clean(config.whatsapp_agente_nombre || 'Chispita', 80),
    estilo: clean(
      config.whatsapp_agente_estilo ||
        'Respondé como el local: mensajes breves, cálidos y directos. Una pregunta por vez.',
      2000
    ),
    reglas_generales: clean(config.whatsapp_agente_reglas_generales, 6000),
    ejemplos: clean(config.whatsapp_agente_ejemplos, 6000),
    turno: shift
      ? {
          id: shiftId,
          nombre: clean(shift.nombre || shift.id || 'Turno actual', 120),
          desde: clean(shift.desde, 10),
          hasta: clean(shift.hasta, 10),
          instrucciones: clean(rulesByShift[shiftId], 4000),
        }
      : null,
    regla_catalogo:
      'Las instrucciones comerciales nunca habilitan un producto por sí solas. Menú, disponibilidad, stock y precios salen de las herramientas del sistema.',
  };
}

module.exports = { buildAgentTraining, parseObject };
