const { getCurrentShiftInfo } = require('./shifts');

function cleanText(value) {
  return String(value || '').trim();
}

function resolveDb(database) {
  if (database && typeof database.prepare === 'function') return database;
  // Evita fallas por import circular cuando el helper se invoca muy temprano.
  // better-sqlite3 exporta la instancia ya inicializada desde ../db.
  return require('../db');
}

function getConfigMap(db) {
  const database = resolveDb(db);
  return database
    .prepare('SELECT clave, valor FROM configuracion')
    .all()
    .reduce((acc, row) => {
      acc[row.clave] = row.valor;
      return acc;
    }, {});
}

function getBusinessDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    year: Number(parts.year || 0),
    month: Number(parts.month || 1),
    day: Number(parts.day || 1),
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
  };
}

function parseMinutes(value) {
  const [hours, minutes] = String(value || '00:00')
    .split(':')
    .map((part) => Number(part || 0));
  return hours * 60 + minutes;
}

function formatDateParts(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function shiftCrossesMidnight(shift) {
  return parseMinutes(shift?.hasta) < parseMinutes(shift?.desde);
}

function getPreviousBusinessDate(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() - 1);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getOperationalShiftContext(config, date = new Date()) {
  const shiftInfo = getCurrentShiftInfo(config);
  const shift = shiftInfo.turno_actual || null;
  const parts = getBusinessDateParts(date);
  let fechaOperativa = formatDateParts(parts);

  if (shift && shiftCrossesMidnight(shift)) {
    const nowMinutes = parts.hour * 60 + parts.minute;
    if (nowMinutes <= parseMinutes(shift.hasta)) {
      fechaOperativa = formatDateParts(getPreviousBusinessDate(parts));
    }
  }

  return {
    shiftInfo,
    shift,
    shiftId: cleanText(shift?.id),
    shiftName: cleanText(shift?.nombre) || cleanText(shift?.id) || 'Sin turno',
    fechaOperativa,
    abiertoAhora: Boolean(shift),
  };
}

function getActiveCaja(db) {
  const database = resolveDb(db);
  return database
    .prepare(
      "SELECT * FROM cierres_caja WHERE estado = 'abierta' ORDER BY abierta_en DESC, id DESC LIMIT 1"
    )
    .get();
}

function closeCaja(db, caja, options = {}) {
  const database = resolveDb(db);
  if (!caja || caja.estado !== 'abierta') return null;
  const buildCajaResumen = options.buildCajaResumen;
  const actorId = options.actor_id || null;
  const actorNombre = cleanText(options.actor_nombre) || 'Sistema';
  const motivo = cleanText(options.motivo) || 'Cierre automatico por cambio de turno';
  const resumen =
    typeof buildCajaResumen === 'function'
      ? buildCajaResumen(caja.abierta_en, null, caja.id)
      : null;
  const efectivoEsperado = Number(caja.monto_inicial || 0) + Number(resumen?.efectivoNeto || 0);

  database
    .prepare(
      `
    UPDATE cierres_caja
    SET estado = 'cerrada',
        cerrada_en = CURRENT_TIMESTAMP,
        cerrada_por_id = ?,
        cerrada_por_nombre = ?,
        monto_final_declarado = ?,
        efectivo_esperado = ?,
        diferencia = 0,
        resumen_json = ?,
        notas_cierre = CASE
          WHEN TRIM(COALESCE(notas_cierre, '')) = '' THEN ?
          ELSE notas_cierre
        END,
        auto_cierre_motivo = ?
    WHERE id = ?
  `
    )
    .run(
      actorId,
      actorNombre,
      efectivoEsperado,
      efectivoEsperado,
      JSON.stringify(resumen || {}),
      motivo,
      motivo,
      caja.id
    );

  return database.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(caja.id);
}

function openCajaForShift(db, context, options = {}) {
  const database = resolveDb(db);
  const actorId = options.actor_id || null;
  const actorNombre = cleanText(options.actor_nombre) || 'Sistema';
  const montoInicial = Number(options.monto_inicial || 0);
  const notas = cleanText(options.notas) || `Apertura automatica ${context.shiftName}`;
  const result = database
    .prepare(
      `
    INSERT INTO cierres_caja (
      estado, abierta_por_id, abierta_por_nombre, monto_inicial, notas_apertura,
      turno_id, turno_nombre, fecha_operativa, auto_abierta
    )
    VALUES ('abierta', ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      actorId,
      actorNombre,
      montoInicial,
      notas,
      context.shiftId,
      context.shiftName,
      context.fechaOperativa,
      options.auto_abierta === false ? 0 : 1
    );
  return database.prepare('SELECT * FROM cierres_caja WHERE id = ?').get(result.lastInsertRowid);
}

function ensureOperationalCaja(db, options = {}) {
  const database = resolveDb(db);
  const config = options.config || getConfigMap(database);
  const context = getOperationalShiftContext(config, options.date || new Date());
  const autoOpenEnabled = options.autoOpen !== false;
  let activeCaja = getActiveCaja(database);
  const events = [];

  if (activeCaja) {
    const sameShift = cleanText(activeCaja.turno_id) === context.shiftId;
    const sameDate = cleanText(activeCaja.fecha_operativa) === context.fechaOperativa;
    const shouldClose = !context.abiertoAhora || !sameShift || !sameDate;
    if (shouldClose) {
      const closed = closeCaja(database, activeCaja, {
        buildCajaResumen: options.buildCajaResumen,
        actor_id: options.actor_id,
        actor_nombre: options.actor_nombre || 'Sistema',
        motivo: !context.abiertoAhora
          ? 'Cierre automatico fuera de turno'
          : `Cierre automatico por cambio de turno (${cleanText(activeCaja.turno_nombre) || 'sin turno'} -> ${context.shiftName})`,
      });
      if (closed) {
        events.push({ type: 'closed', caja: closed });
      }
      activeCaja = null;
    }
  }

  if (autoOpenEnabled && context.abiertoAhora && !activeCaja) {
    activeCaja = openCajaForShift(database, context, {
      actor_id: options.actor_id,
      actor_nombre: options.actor_nombre || 'Sistema',
      monto_inicial: options.monto_inicial || 0,
      notas: options.notas,
      auto_abierta: options.auto_abierta !== false,
    });
    events.push({ type: 'opened', caja: activeCaja });
  }

  return {
    context,
    activeCaja,
    events,
  };
}

module.exports = {
  cleanText,
  getConfigMap,
  getBusinessDateParts,
  getOperationalShiftContext,
  getActiveCaja,
  ensureOperationalCaja,
};
