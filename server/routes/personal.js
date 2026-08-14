const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { getCurrentShiftInfo, matchesPreferredShift, parseTurnos } = require('../utils/shifts');
const { actorFromRequest, logAudit } = require('../utils/audit');
const {
  insertInventoryMovement,
  roundStock,
  applyInventoryToItems,
} = require('../utils/inventory');
const { parseLocalizedNumber, pesosACentavos } = require('../utils/numberInput');

const { syncDeliveryRepartidor } = require('../utils/deliveryPersonnelSync');
const { getOperationalShiftContext } = require('../utils/operationalCaja');
const { uploadsDir, uploadPathFromFilename } = require('../utils/storagePaths');
const { hoyArgentina, parseFechaHoraArgentina, esFechaIso } = require('../utils/fechaLocal');
const { createRateLimiter, createSqliteRateLimitStore } = require('../utils/rateLimit');
const {
  createFileFilter,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
} = require('../utils/uploadValidation');

const avatarStorage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) =>
    cb(
      null,
      `avatar-${Date.now()}-${Math.random().toString(36).slice(2)}${require('path').extname(file.originalname).toLowerCase()}`
    ),
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: createFileFilter({
    allowedExtensions: IMAGE_EXTENSIONS,
    allowedMimeTypes: IMAGE_MIME_TYPES,
  }),
});

// Importar el nuevo servicio de personal
const personalService = require('../services/personalService');

const PAYMENT_FREQUENCIES = ['diario', 'semanal', 'quincenal', 'mensual'];
const PAYMENT_METHODS = ['efectivo', 'transferencia', 'mercadopago', 'modo', 'uala'];
const MOVEMENT_TYPES = ['adelanto', 'descuento', 'consumo'];
const ATTENDANCE_STATES = ['presente', 'tarde', 'ausente', 'franco', 'justificado'];
const CLOCK_ACTIONS = ['ingreso', 'salida'];

// El reloj es público para poder usar una tablet compartida. El PIN no debe
// poder probarse sin límite desde internet.
const clockMarkRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiados intentos de fichada. Esperá unos minutos.',
  store: createSqliteRateLimitStore(db, 'personal-clock-mark'),
});

function getConfigMap() {
  return db
    .prepare('SELECT clave, valor FROM configuracion')
    .all()
    .reduce((acc, row) => {
      acc[row.clave] = row.valor;
      return acc;
    }, {});
}

function getActiveCaja() {
  return db
    .prepare(
      "SELECT * FROM cierres_caja WHERE estado = 'abierta' ORDER BY abierta_en DESC, id DESC LIMIT 1"
    )
    .get();
}

function cleanText(value) {
  return String(value || '').trim();
}

function isoDate(date = new Date()) {
  // Sin argumento: usar la fecha del negocio (Argentina), no UTC.
  // Con argumento: formatear esa fecha concreta (no depende de zona).
  if (arguments.length === 0) return hoyArgentina();
  return new Date(date).toISOString().split('T')[0];
}

function addDays(dateValue, delta) {
  const date = new Date(`${dateValue}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return isoDate(date);
}

function generateClockPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateClockToken() {
  return crypto.randomBytes(12).toString('hex');
}

function normalizeClockPin(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 6);
}

function ensureClockCredentials(personalId) {
  const person = db
    .prepare('SELECT id, clock_pin, clock_token FROM personal WHERE id = ?')
    .get(personalId);
  if (!person) return null;
  const pin = cleanText(person.clock_pin) || generateClockPin();
  const token = cleanText(person.clock_token) || generateClockToken();
  db.prepare(
    `
    UPDATE personal
    SET clock_pin = ?, clock_token = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(pin, token, personalId);
  return { clock_pin: pin, clock_token: token };
}

function normalizeFrequency(value) {
  const frequency = cleanText(value).toLowerCase();
  return PAYMENT_FREQUENCIES.includes(frequency) ? frequency : 'mensual';
}

function normalizePaymentMethod(value) {
  const method = cleanText(value).toLowerCase();
  return PAYMENT_METHODS.includes(method) ? method : 'efectivo';
}

function frequencyLabel(value) {
  const map = {
    diario: 'pago diario',
    semanal: 'pago semanal',
    quincenal: 'pago quincenal',
    mensual: 'pago mensual',
  };
  return map[cleanText(value).toLowerCase()] || 'su período de pago';
}

function currentAttendanceContext() {
  const config = getConfigMap();
  return getOperationalShiftContext(config);
}

function resolveAttendanceTurnMeta({ turnoId = '', turnoNombre = '', turnoPreferido = '' } = {}) {
  const normalizedId = cleanText(turnoId) || cleanText(turnoPreferido);
  const normalizedName = cleanText(turnoNombre);
  const turnos = parseTurnos(getConfigMap().turnos_negocio).filter(
    (shift) => shift?.activo !== false
  );
  const match = turnos.find((shift) => cleanText(shift.id) === normalizedId);

  if (match) {
    return {
      turno_id: cleanText(match.id),
      turno_nombre: cleanText(match.nombre) || cleanText(match.id) || 'Sin turno',
      turno_desde: cleanText(match.desde) || '00:00',
    };
  }

  return {
    turno_id: normalizedId || 'manual',
    turno_nombre: normalizedName || normalizedId || 'Manual',
    turno_desde: '00:00',
  };
}

const parseDateTimeValue = parseFechaHoraArgentina;

function diffMinutesBetween(start, end) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function buildAttendanceSummary(fechaOperativa = '') {
  const ctx = currentAttendanceContext();
  const fecha = cleanText(fechaOperativa) || ctx.fechaOperativa;
  const items = db
    .prepare(
      `
    SELECT
      a.*,
      p.nombre AS personal_nombre,
      p.rol_operativo,
      p.turno_preferido,
      p.activo
    FROM personal_asistencia a
    JOIN personal p ON p.id = a.personal_id
    WHERE a.fecha_operativa = ?
    ORDER BY a.turno_id ASC, p.rol_operativo ASC, p.nombre ASC
  `
    )
    .all(fecha);

  const resumen = items.reduce((acc, item) => {
    const key = item.turno_id || 'sin_turno';
    const current = acc[key] || {
      turno_id: key,
      turno_nombre: item.turno_nombre || key,
      presentes: 0,
      ausentes: 0,
      tardes: 0,
      francos: 0,
    };
    if (item.estado === 'ausente') current.ausentes += 1;
    else if (item.estado === 'tarde') {
      current.presentes += 1;
      current.tardes += 1;
    } else if (item.estado === 'franco') current.francos += 1;
    else current.presentes += 1;
    acc[key] = current;
    return acc;
  }, {});

  return {
    fecha_operativa: fecha,
    turno_actual_id: ctx.shiftId,
    turno_actual_nombre: ctx.shiftName,
    items,
    por_turno: Object.values(resumen),
  };
}

function loadAttendanceForPersonal(personalId, limit = 40) {
  return db
    .prepare(
      `
    SELECT *
    FROM personal_asistencia
    WHERE personal_id = ?
    ORDER BY fecha_operativa DESC, turno_id DESC, id DESC
    LIMIT ?
  `
    )
    .all(personalId, limit);
}

function loadObjectivesForPersonal(personalId, limit = 30) {
  return db
    .prepare(
      `
    SELECT *
    FROM personal_objetivos
    WHERE personal_id = ?
    ORDER BY fecha_hasta DESC, id DESC
    LIMIT ?
  `
    )
    .all(personalId, limit)
    .map((item) => ({
      ...item,
      objetivo: roundStock(item.objetivo || 0),
      progreso: roundStock(item.progreso || 0),
      premio_monto: roundStock(item.premio_monto || 0),
    }));
}

function getRecognitionConfig() {
  return (
    db.prepare('SELECT * FROM personal_reconocimientos_config WHERE id = 1').get() || {
      puntos_por_puntualidad: 5,
      puntos_por_venta_destacada: 10,
      puntos_por_feedback_positivo: 15,
      umbral_canje_puntos: 50,
      recompensa_canje_pesos: 5000,
      activo: 1,
    }
  );
}

function grantRecognitionIfMissing({
  personalId,
  tipo,
  puntos,
  descripcion,
  actorId = null,
  actorNombre = 'Sistema',
}) {
  if (!personalId || !tipo || !puntos) return null;
  const config = getRecognitionConfig();
  if (!Number(config.activo || 0)) return null;

  const normalizedDescription = cleanText(descripcion);
  const existing = db
    .prepare(
      `
    SELECT id
    FROM personal_reconocimientos
    WHERE personal_id = ? AND tipo = ? AND descripcion = ?
    LIMIT 1
  `
    )
    .get(personalId, tipo, normalizedDescription);
  if (existing) return null;

  const result = db
    .prepare(
      `
    INSERT INTO personal_reconocimientos
    (personal_id, tipo, puntos, descripcion, registrado_por)
    VALUES (?, ?, ?, ?, ?)
  `
    )
    .run(personalId, tipo, puntos, normalizedDescription, actorId);

  db.prepare(
    `
    UPDATE personal
    SET puntos_reconocimiento = COALESCE(puntos_reconocimiento, 0) + ?
    WHERE id = ?
  `
  ).run(puntos, personalId);

  logAudit(db, {
    modulo: 'personal',
    accion: 'reconocimiento_automatico',
    entidad: 'personal_reconocimiento',
    entidad_id: result.lastInsertRowid,
    actor_id: actorId,
    actor_nombre: actorNombre,
    detalle: {
      personal_id: personalId,
      tipo,
      puntos,
      descripcion: normalizedDescription,
    },
  });

  return result.lastInsertRowid;
}

function buildAttendanceAnalytics({ desde, hasta }) {
  const rows = db
    .prepare(
      `
    SELECT
      a.*,
      p.nombre AS personal_nombre,
      p.rol_operativo,
      p.turno_preferido,
      p.monto_base,
      p.frecuencia_pago,
      p.puntos_reconocimiento
    FROM personal_asistencia a
    JOIN personal p ON p.id = a.personal_id
    WHERE a.fecha_operativa >= ? AND a.fecha_operativa <= ?
    ORDER BY a.fecha_operativa DESC, p.nombre ASC
  `
    )
    .all(desde, hasta);

  const byPerson = new Map();
  rows.forEach((row) => {
    const key = Number(row.personal_id);
    const current = byPerson.get(key) || {
      personal_id: key,
      personal_nombre: row.personal_nombre,
      rol_operativo: row.rol_operativo,
      turno_preferido: row.turno_preferido,
      monto_base: roundStock(row.monto_base || 0),
      frecuencia_pago: row.frecuencia_pago,
      puntos_reconocimiento: Number(row.puntos_reconocimiento || 0),
      presentes: 0,
      ausentes: 0,
      tardanzas: 0,
      francos: 0,
      justificados: 0,
      minutos_tarde: 0,
      minutos_trabajados: 0,
      asistencias: [],
    };
    if (row.estado === 'ausente') current.ausentes += 1;
    else if (row.estado === 'franco') current.francos += 1;
    else if (row.estado === 'justificado') current.justificados += 1;
    else {
      current.presentes += 1;
      if (row.estado === 'tarde') current.tardanzas += 1;
    }
    current.minutos_tarde += Number(row.minutos_tarde || 0);
    current.minutos_trabajados += Number(row.minutos_trabajados || 0);
    current.asistencias.push(row);
    byPerson.set(key, current);
  });

  const ranking = Array.from(byPerson.values())
    .map((item) => {
      const asistenciasContables = item.presentes + item.ausentes + item.justificados;
      const puntualidadPct = item.presentes
        ? Math.round(((item.presentes - item.tardanzas) / item.presentes) * 100)
        : 0;
      const asistenciaPct = asistenciasContables
        ? Math.round((item.presentes / asistenciasContables) * 100)
        : 0;
      return {
        ...item,
        minutos_tarde: roundStock(item.minutos_tarde),
        minutos_trabajados: roundStock(item.minutos_trabajados),
        puntualidadPct,
        asistenciaPct,
      };
    })
    .sort(
      (a, b) =>
        b.asistenciaPct - a.asistenciaPct ||
        b.puntualidadPct - a.puntualidadPct ||
        a.minutos_tarde - b.minutos_tarde ||
        a.personal_nombre.localeCompare(b.personal_nombre)
    );

  return {
    desde,
    hasta,
    total_registros: rows.length,
    ranking,
  };
}

function serializeMovement(row) {
  return {
    ...row,
    monto: roundStock(row.monto || 0),
    saldo_pendiente: roundStock(row.saldo_pendiente || 0),
    cantidad_insumo: roundStock(row.cantidad_insumo || 0),
    cantidad_producto: roundStock(row.cantidad_producto || 0),
    precio_lista: roundStock(row.precio_lista || 0),
    descuento_empleado_pct: roundStock(row.descuento_empleado_pct || 0),
  };
}

function serializeLiquidacion(row) {
  return {
    ...row,
    unidades: roundStock(row.unidades || 0),
    monto_base: roundStock(row.monto_base || 0),
    monto_bruto: roundStock(row.monto_bruto || 0),
    total_adelantos: roundStock(row.total_adelantos || 0),
    total_descuentos: roundStock(row.total_descuentos || 0),
    total_consumos: roundStock(row.total_consumos || 0),
    monto_neto: roundStock(row.monto_neto || 0),
  };
}

function buildPendingMap() {
  const rows = db
    .prepare(
      `
    SELECT
      personal_id,
      COALESCE(SUM(CASE WHEN estado = 'pendiente' AND tipo = 'adelanto' THEN saldo_pendiente ELSE 0 END), 0) AS adelantos,
      COALESCE(SUM(CASE WHEN estado = 'pendiente' AND tipo = 'descuento' THEN saldo_pendiente ELSE 0 END), 0) AS descuentos,
      COALESCE(SUM(CASE WHEN estado = 'pendiente' AND tipo = 'consumo' THEN saldo_pendiente ELSE 0 END), 0) AS consumos
    FROM personal_movimientos
    GROUP BY personal_id
  `
    )
    .all();

  return new Map(
    rows.map((row) => [
      Number(row.personal_id),
      {
        adelantos: roundStock(row.adelantos || 0),
        descuentos: roundStock(row.descuentos || 0),
        consumos: roundStock(row.consumos || 0),
      },
    ])
  );
}

function normalizePersonalRow(row, pendingMap) {
  const pending = pendingMap.get(Number(row.id)) || { adelantos: 0, descuentos: 0, consumos: 0 };
  const montoBase = roundStock(row.monto_base || 0);
  const totalPendiente = roundStock(pending.adelantos + pending.descuentos + pending.consumos);

  // Parsear tags
  let tags = [];
  try {
    const parsed = JSON.parse(row.tags || '[]');
    tags = Array.isArray(parsed) ? parsed : [];
  } catch {
    tags = [];
  }

  // Calcular antigüedad
  let antiguedad_anios = 0;
  let antiguedad_texto = '';
  if (row.fecha_ingreso) {
    const ingreso = new Date(row.fecha_ingreso);
    const hoy = new Date();
    const diffTime = Math.abs(hoy - ingreso);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    antiguedad_anios = Math.floor(diffDays / 365);
    const meses = Math.floor((diffDays % 365) / 30);

    if (antiguedad_anios > 0) {
      antiguedad_texto = `${antiguedad_anios}a ${meses}m`;
    } else if (meses > 0) {
      antiguedad_texto = `${meses}m`;
    } else {
      antiguedad_texto = `${diffDays}d`;
    }
  }

  // Calcular próximo cumpleaños
  let proximo_cumpleanos = null;
  let dias_para_cumpleanos = null;
  let es_cumpleanos_hoy = false;
  if (row.fecha_nacimiento) {
    const hoyStr = hoyArgentina();
    const [anioHoy, mesHoy, diaHoy] = hoyStr.split('-').map(Number);
    const nacimiento = new Date(row.fecha_nacimiento);
    const mesNac = nacimiento.getUTCMonth() + 1;
    const diaNac = nacimiento.getUTCDate();

    // Armar la próxima fecha de cumpleaños comparando mes/día
    let anioProximo = anioHoy;
    if (mesNac < mesHoy || (mesNac === mesHoy && diaNac < diaHoy)) {
      anioProximo = anioHoy + 1;
    }
    proximo_cumpleanos = `${anioProximo}-${String(mesNac).padStart(2, '0')}-${String(diaNac).padStart(2, '0')}`;

    const hoyDate = new Date(`${hoyStr}T00:00:00Z`);
    const proxDate = new Date(`${proximo_cumpleanos}T00:00:00Z`);
    dias_para_cumpleanos = Math.round((proxDate - hoyDate) / (1000 * 60 * 60 * 24));
    es_cumpleanos_hoy = dias_para_cumpleanos === 0;
  }

  return {
    ...row,
    tags,
    frecuencia_pago: normalizeFrequency(row.frecuencia_pago),
    monto_base: montoBase,
    medio_pago_preferido: normalizePaymentMethod(row.medio_pago_preferido),
    pendiente_adelantos: pending.adelantos,
    pendiente_descuentos: pending.descuentos,
    pendiente_consumos: pending.consumos,
    pendiente_total: totalPendiente,
    neto_sugerido_base: roundStock(Math.max(0, montoBase - totalPendiente)),
    puntos_reconocimiento: Number(row.puntos_reconocimiento || 0),
    total_liquidaciones: Number(row.total_liquidaciones || 0),
    total_adelantos: Number(row.total_adelantos || 0),
    antiguedad_anios,
    antiguedad_texto,
    dias_para_cumpleanos,
    proximo_cumpleanos,
    es_cumpleanos_hoy,
    categoria_id: row.categoria_id,
    categoria_nombre: row.categoria_nombre,
    categoria_color: row.categoria_color,
    categoria_icono: row.categoria_icono,
    clock_pin: cleanText(row.clock_pin),
    clock_token: cleanText(row.clock_token),
    clock_url: cleanText(row.clock_token) ? `/personal/reloj/${cleanText(row.clock_token)}` : '',
  };
}

function serializeClockPerson(row, attendance = null, includeAttendance = false) {
  return {
    id: row.id,
    nombre: row.nombre,
    rol_operativo: row.rol_operativo,
    turno_preferido: row.turno_preferido,
    avatar_url: row.avatar_url || '',
    activo: Number(row.activo || 0) === 1,
    attendance:
      includeAttendance && attendance
        ? {
            id: attendance.id,
            estado: attendance.estado,
            ingreso_en: attendance.ingreso_en,
            salida_en: attendance.salida_en,
            minutos_tarde: Number(attendance.minutos_tarde || 0),
            minutos_trabajados: Number(attendance.minutos_trabajados || 0),
            notas: attendance.notas || '',
          }
        : null,
  };
}

function getClockRoster({ token = '' } = {}) {
  const ctx = currentAttendanceContext();
  const rows = db
    .prepare(
      `
    SELECT *
    FROM personal
    WHERE activo = 1
    ORDER BY rol_operativo ASC, nombre ASC
  `
    )
    .all();
  const attendanceRows = ctx.fechaOperativa
    ? db
        .prepare(
          `
      SELECT *
      FROM personal_asistencia
      WHERE fecha_operativa = ? AND turno_id = ?
    `
        )
        .all(ctx.fechaOperativa, ctx.shiftId || '')
    : [];
  const attendanceMap = new Map(attendanceRows.map((item) => [Number(item.personal_id), item]));

  const tokenPerson = token
    ? rows.find((row) => cleanText(row.clock_token) === token) || null
    : null;
  const filtered = rows.filter((row) => {
    // Un QR individual solo puede ver a su titular; nunca al resto del equipo.
    if (token) return Number(row.id) === Number(tokenPerson?.id);
    if (!ctx.shiftId) return true;
    return matchesPreferredShift(row.turno_preferido, ctx.shiftId);
  });

  const preselected = tokenPerson && filtered.length ? tokenPerson : null;

  return {
    fecha_operativa: ctx.fechaOperativa,
    turno_actual_id: ctx.shiftId,
    turno_actual_nombre: ctx.shiftName,
    token_match: preselected ? preselected.id : null,
    items: filtered.map((row) =>
      serializeClockPerson(row, attendanceMap.get(Number(row.id)) || null, Boolean(token))
    ),
  };
}

function buildWeeklyAttendanceBoard({ desde, dias = 7 }) {
  const start = cleanText(desde) || isoDate();
  const dayList = Array.from({ length: dias }).map((_, index) => {
    const fecha = addDays(start, index);
    return { fecha, turno_labels: [] };
  });
  const end = dayList[dayList.length - 1]?.fecha || start;

  const rows = db
    .prepare(
      `
    SELECT p.*
    FROM personal p
    WHERE p.activo = 1
    ORDER BY p.turno_preferido ASC, p.rol_operativo ASC, p.nombre ASC
  `
    )
    .all();

  const attendance = db
    .prepare(
      `
    SELECT *
    FROM personal_asistencia
    WHERE fecha_operativa >= ? AND fecha_operativa <= ?
    ORDER BY fecha_operativa ASC, turno_id ASC, personal_id ASC
  `
    )
    .all(start, end);
  const byKey = new Map(
    attendance.map((item) => [`${item.personal_id}:${item.fecha_operativa}`, item])
  );

  const items = rows.map((row) => {
    const days = dayList.map((day) => {
      const item = byKey.get(`${row.id}:${day.fecha}`) || null;
      return {
        fecha: day.fecha,
        estado: item?.estado || '',
        ingreso_en: item?.ingreso_en || '',
        salida_en: item?.salida_en || '',
        minutos_tarde: Number(item?.minutos_tarde || 0),
        minutos_trabajados: Number(item?.minutos_trabajados || 0),
        turno_id: item?.turno_id || '',
      };
    });
    return {
      id: row.id,
      nombre: row.nombre,
      rol_operativo: row.rol_operativo,
      turno_preferido: row.turno_preferido,
      avatar_url: row.avatar_url || '',
      days,
    };
  });

  return {
    desde: start,
    hasta: end,
    dias: dayList,
    items,
  };
}

function getSuggestedLiquidation(person) {
  const today = isoDate();
  const frequency = normalizeFrequency(person.frecuencia_pago);
  const defaultsByFrequency = {
    diario: 1,
    semanal: 7,
    quincenal: 14,
    mensual: 30,
  };

  const last = db
    .prepare(
      `
    SELECT *
    FROM personal_liquidaciones
    WHERE personal_id = ?
    ORDER BY datetime(creado_en) DESC, id DESC
    LIMIT 1
  `
    )
    .get(person.id);

  let periodoDesde = cleanText(last?.periodo_hasta)
    ? addDays(last.periodo_hasta, 1)
    : addDays(today, -(defaultsByFrequency[frequency] - 1));
  if (periodoDesde > today) periodoDesde = today;
  const periodoHasta = today;

  const attendance = db
    .prepare(
      `
    SELECT *
    FROM personal_asistencia
    WHERE personal_id = ?
      AND fecha_operativa >= ?
      AND fecha_operativa <= ?
    ORDER BY fecha_operativa ASC, id ASC
  `
    )
    .all(person.id, periodoDesde, periodoHasta);

  const workedStates = new Set(['presente', 'tarde']);
  const workedDays = attendance.filter((item) =>
    workedStates.has(cleanText(item.estado).toLowerCase())
  ).length;
  const lateCount = attendance.filter(
    (item) => cleanText(item.estado).toLowerCase() === 'tarde'
  ).length;
  const absentCount = attendance.filter(
    (item) => cleanText(item.estado).toLowerCase() === 'ausente'
  ).length;
  const units = roundStock(workedDays);
  const montoBase = roundStock(person.monto_base || 0);
  const bruto = roundStock(montoBase * units);
  const pending = buildPendingMap().get(Number(person.id)) || {
    adelantos: 0,
    descuentos: 0,
    consumos: 0,
  };

  return {
    frecuencia_pago: frequency,
    periodo_desde: periodoDesde,
    periodo_hasta: periodoHasta,
    unidades_sugeridas: units,
    dias_trabajados: workedDays,
    tardanzas: lateCount,
    ausencias: absentCount,
    monto_base: montoBase,
    monto_bruto_estimado: bruto,
    descuentos_pendientes: roundStock(pending.adelantos + pending.descuentos + pending.consumos),
    monto_neto_estimado: roundStock(
      bruto - pending.adelantos - pending.descuentos - pending.consumos
    ),
    requiere_revision: units <= 0,
    ultimo_pago: last
      ? {
          id: last.id,
          periodo_desde: last.periodo_desde,
          periodo_hasta: last.periodo_hasta,
          creado_en: last.creado_en,
          monto_neto: roundStock(last.monto_neto || 0),
        }
      : null,
  };
}

function buildPersonalOperationalAlerts(person) {
  if (!person) return [];
  const suggestion = getSuggestedLiquidation(person);
  const daysToInspect =
    suggestion.frecuencia_pago === 'diario'
      ? 7
      : suggestion.frecuencia_pago === 'semanal'
        ? 14
        : suggestion.frecuencia_pago === 'quincenal'
          ? 21
          : 30;
  const desde = addDays(isoDate(), -(daysToInspect - 1));
  const rows = db
    .prepare(
      `
    SELECT estado, minutos_tarde
    FROM personal_asistencia
    WHERE personal_id = ?
      AND fecha_operativa >= ?
      AND fecha_operativa <= ?
    ORDER BY fecha_operativa DESC, id DESC
  `
    )
    .all(person.id, desde, isoDate());

  const tardanzas = rows.filter((row) => cleanText(row.estado).toLowerCase() === 'tarde').length;
  const ausencias = rows.filter((row) => cleanText(row.estado).toLowerCase() === 'ausente').length;
  const presentes = rows.filter((row) =>
    ['presente', 'tarde'].includes(cleanText(row.estado).toLowerCase())
  ).length;
  const minutosTarde = rows.reduce((acc, row) => acc + Number(row.minutos_tarde || 0), 0);
  const pendingTotal = Number(suggestion.descuentos_pendientes || 0);
  const montoBase = Number(suggestion.monto_base || 0);
  const alerts = [];

  if (ausencias >= 2) {
    alerts.push({
      level: 'critical',
      title: 'Ausencias a revisar',
      description: `${ausencias} ausencias en los últimos ${daysToInspect} días operativos.`,
    });
  }

  if (tardanzas >= 3) {
    alerts.push({
      level: 'warning',
      title: 'Tardanzas repetidas',
      description: `${tardanzas} llegadas tarde en el período de control.`,
    });
  }

  if (pendingTotal > montoBase && montoBase > 0) {
    alerts.push({
      level: 'critical',
      title: 'Pendiente alto',
      description: `Los descuentos y consumos superan el monto base de ${frequencyLabel(suggestion.frecuencia_pago)}.`,
    });
  }

  if (!alerts.length && presentes >= 4 && tardanzas === 0 && ausencias === 0) {
    alerts.push({
      level: 'success',
      title: 'Racha ordenada',
      description: `Sin ausencias ni tardanzas en el período reciente. Promedio de demora: ${Math.round(minutosTarde / Math.max(presentes, 1))} min.`,
    });
  }

  if (!alerts.length) {
    alerts.push({
      level: 'info',
      title: 'Seguimiento estable',
      description: `Período controlado: ${presentes} jornadas registradas, ${tardanzas} tardanzas y ${ausencias} ausencias.`,
    });
  }

  return alerts;
}

function buildLiquidationExecutiveSummary(person) {
  if (!person) return null;
  const suggestion = getSuggestedLiquidation(person);
  const daysToInspect =
    suggestion.frecuencia_pago === 'diario'
      ? 7
      : suggestion.frecuencia_pago === 'semanal'
        ? 14
        : suggestion.frecuencia_pago === 'quincenal'
          ? 21
          : 30;
  const desde = addDays(isoDate(), -(daysToInspect - 1));
  const attendance = db
    .prepare(
      `
    SELECT estado, minutos_tarde, minutos_trabajados
    FROM personal_asistencia
    WHERE personal_id = ?
      AND fecha_operativa >= ?
      AND fecha_operativa <= ?
  `
    )
    .all(person.id, desde, isoDate());
  const workedRows = attendance.filter((row) =>
    ['presente', 'tarde'].includes(cleanText(row.estado).toLowerCase())
  );
  const avgMinutesLate = workedRows.length
    ? Math.round(
        workedRows.reduce((acc, row) => acc + Number(row.minutos_tarde || 0), 0) / workedRows.length
      )
    : 0;
  const avgWorkedHours = workedRows.length
    ? roundStock(
        workedRows.reduce((acc, row) => acc + Number(row.minutos_trabajados || 0), 0) /
          workedRows.length /
          60
      )
    : 0;
  const pendingRatioPct =
    suggestion.monto_bruto_estimado > 0
      ? Math.round(
          (Number(suggestion.descuentos_pendientes || 0) /
            Number(suggestion.monto_bruto_estimado || 1)) *
            100
        )
      : 0;

  let recommendation = 'Liquidación lista para confirmar.';
  if (suggestion.requiere_revision) {
    recommendation =
      'No hay jornadas suficientes registradas; conviene revisar asistencia antes de liquidar.';
  } else if (pendingRatioPct >= 40) {
    recommendation =
      'El descuento pendiente es alto respecto al bruto; conviene revisar adelantos y consumos.';
  } else if (suggestion.tardanzas >= 3 || suggestion.ausencias >= 2) {
    recommendation =
      'Hay incidencias de asistencia que conviene revisar antes de cerrar la liquidación.';
  }

  return {
    ...suggestion,
    valor_jornada:
      suggestion.unidades_sugeridas > 0
        ? roundStock(
            Number(suggestion.monto_bruto_estimado || 0) /
              Number(suggestion.unidades_sugeridas || 1)
          )
        : roundStock(suggestion.monto_base || 0),
    descuento_ratio_pct: pendingRatioPct,
    promedio_minutos_tarde: avgMinutesLate,
    promedio_horas_trabajadas: avgWorkedHours,
    recommendation,
  };
}

function loadRecentMovements(limit = 80) {
  return db
    .prepare(
      `
    SELECT
      pm.*,
      p.nombre AS personal_nombre,
      p.rol_operativo,
      i.nombre AS insumo_nombre,
      i.unidad AS insumo_unidad,
      pr.nombre AS producto_nombre_ref
    FROM personal_movimientos pm
    JOIN personal p ON p.id = pm.personal_id
    LEFT JOIN inventario_insumos i ON i.id = pm.insumo_id
    LEFT JOIN productos pr ON pr.id = pm.producto_id
    ORDER BY datetime(pm.creado_en) DESC, pm.id DESC
    LIMIT ?
  `
    )
    .all(limit)
    .map(serializeMovement);
}

function loadRecentLiquidaciones(limit = 50) {
  return db
    .prepare(
      `
    SELECT
      pl.*,
      p.nombre AS personal_nombre,
      p.rol_operativo
    FROM personal_liquidaciones pl
    JOIN personal p ON p.id = pl.personal_id
    ORDER BY datetime(pl.creado_en) DESC, pl.id DESC
    LIMIT ?
  `
    )
    .all(limit)
    .map(serializeLiquidacion);
}

function loadPersonalDetail(personalId) {
  ensureClockCredentials(personalId);
  const person = db
    .prepare(
      `
    SELECT p.*, u.nombre AS usuario_nombre, u.email AS usuario_email,
           pc.nombre as categoria_nombre, pc.color as categoria_color, pc.icono as categoria_icono
    FROM personal p
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN personal_categorias pc ON pc.id = p.categoria_id
    WHERE p.id = ?
  `
    )
    .get(personalId);

  if (!person) return null;

  const pendingMap = buildPendingMap();
  const normalized = normalizePersonalRow(person, pendingMap);
  const movimientos = db
    .prepare(
      `
    SELECT
      pm.*,
      i.nombre AS insumo_nombre,
      i.unidad AS insumo_unidad,
      pr.nombre AS producto_nombre_ref
    FROM personal_movimientos pm
    LEFT JOIN inventario_insumos i ON i.id = pm.insumo_id
    LEFT JOIN productos pr ON pr.id = pm.producto_id
    WHERE pm.personal_id = ?
    ORDER BY datetime(pm.creado_en) DESC, pm.id DESC
    LIMIT 80
  `
    )
    .all(personalId)
    .map(serializeMovement);

  const liquidaciones = db
    .prepare(
      `
    SELECT *
    FROM personal_liquidaciones
    WHERE personal_id = ?
    ORDER BY datetime(creado_en) DESC, id DESC
    LIMIT 40
  `
    )
    .all(personalId)
    .map(serializeLiquidacion);

  const liquidacionIds = liquidaciones.map((item) => item.id);
  let itemsByLiquidacion = new Map();
  if (liquidacionIds.length) {
    const placeholders = liquidacionIds.map(() => '?').join(', ');
    const items = db
      .prepare(
        `
      SELECT *
      FROM personal_liquidacion_items
      WHERE liquidacion_id IN (${placeholders})
      ORDER BY id ASC
    `
      )
      .all(...liquidacionIds);
    itemsByLiquidacion = items.reduce((acc, item) => {
      const key = Number(item.liquidacion_id);
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key).push({
        ...item,
        monto_original: roundStock(item.monto_original || 0),
        monto_aplicado: roundStock(item.monto_aplicado || 0),
        saldo_restante: roundStock(item.saldo_restante || 0),
      });
      return acc;
    }, new Map());
  }

  // Nuevos datos del servicio mejorado
  const direcciones = personalService.getDirecciones(personalId);
  const carrera = personalService.getCarreraHistorial(personalId);
  const reconocimientos = personalService.getReconocimientos(personalId, 20);

  return {
    item: normalized,
    movimientos,
    liquidaciones: liquidaciones.map((item) => ({
      ...item,
      items: itemsByLiquidacion.get(Number(item.id)) || [],
    })),
    asistencia: loadAttendanceForPersonal(personalId),
    objetivos: loadObjectivesForPersonal(personalId),
    direcciones,
    carrera,
    reconocimientos,
    resumen_laboral: getSuggestedLiquidation(person),
    alertas_operativas: buildPersonalOperationalAlerts(person),
    resumen_liquidacion_ejecutivo: buildLiquidationExecutiveSummary(person),
  };
}

function createLiquidacion(person, payload, actor) {
  const frecuenciaPago = normalizeFrequency(person.frecuencia_pago);
  const metodoPago = normalizePaymentMethod(payload?.metodo_pago ?? person.medio_pago_preferido);
  const unidades = roundStock(parseLocalizedNumber(payload?.unidades || 1));
  // Si viene del formulario está en pesos y hay que convertirlo; si cae de
  // vuelta al sueldo guardado, ese ya está en centavos.
  const montoBase =
    payload?.monto_base === undefined || payload?.monto_base === null
      ? Number(person.monto_base || 0)
      : pesosACentavos(payload.monto_base);
  const periodoDesde = cleanText(payload?.periodo_desde);
  const periodoHasta = cleanText(payload?.periodo_hasta);
  const notas = cleanText(payload?.notas);
  const impactaCaja =
    Number(payload?.impacta_caja) === 1 ||
    (payload?.impacta_caja === undefined && metodoPago === 'efectivo');

  if (unidades <= 0) throw new Error('Las unidades a liquidar deben ser mayores a 0');
  if (montoBase < 0) throw new Error('El monto base debe ser 0 o mayor');
  if (!esFechaIso(periodoDesde) || !esFechaIso(periodoHasta)) {
    throw new Error('El período de liquidación debe tener fecha de inicio y fin válidas');
  }
  if (periodoDesde > periodoHasta) {
    throw new Error('La fecha de inicio no puede ser posterior a la fecha de cierre');
  }

  const liquidacionExistente = db
    .prepare(
      `
      SELECT id, periodo_desde, periodo_hasta
      FROM personal_liquidaciones
      WHERE personal_id = ?
        AND TRIM(COALESCE(periodo_desde, '')) != ''
        AND TRIM(COALESCE(periodo_hasta, '')) != ''
        AND periodo_desde <= ?
        AND periodo_hasta >= ?
      LIMIT 1
    `
    )
    .get(person.id, periodoHasta, periodoDesde);
  if (liquidacionExistente) {
    throw new Error(
      `Ya existe una liquidación (#${liquidacionExistente.id}) que cubre ese período`
    );
  }

  const montoBruto = roundStock(montoBase * unidades);
  const pendientes = db
    .prepare(
      `
    SELECT *
    FROM personal_movimientos
    WHERE personal_id = ? AND estado = 'pendiente' AND saldo_pendiente > 0
    ORDER BY datetime(creado_en) ASC, id ASC
  `
    )
    .all(person.id)
    .map(serializeMovement);

  db.exec('BEGIN');
  try {
    const result = db
      .prepare(
        `
      INSERT INTO personal_liquidaciones (
        personal_id, periodo_desde, periodo_hasta, frecuencia_pago, unidades,
        monto_base, monto_bruto, total_adelantos, total_descuentos, total_consumos,
        monto_neto, metodo_pago, notas, actor_id, actor_nombre
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?)
    `
      )
      .run(
        person.id,
        periodoDesde,
        periodoHasta,
        frecuenciaPago,
        unidades,
        montoBase,
        montoBruto,
        metodoPago,
        notas,
        actor.actor_id,
        actor.actor_nombre
      );

    const liquidacionId = result.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO personal_liquidacion_items (
        liquidacion_id, movimiento_id, tipo, descripcion, monto_original, monto_aplicado, saldo_restante
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const totals = { adelantos: 0, descuentos: 0, consumos: 0 };
    let remainingGross = montoBruto;

    pendientes.forEach((movement) => {
      if (remainingGross <= 0) return;
      const pendiente = roundStock(movement.saldo_pendiente || 0);
      if (pendiente <= 0) return;
      const aplicado = roundStock(Math.min(remainingGross, pendiente));
      if (aplicado <= 0) return;

      remainingGross = roundStock(remainingGross - aplicado);
      const saldoRestante = roundStock(pendiente - aplicado);
      if (movement.tipo === 'adelanto') {
        totals.adelantos = roundStock(totals.adelantos + aplicado);
      }
      if (movement.tipo === 'descuento') {
        totals.descuentos = roundStock(totals.descuentos + aplicado);
      }
      if (movement.tipo === 'consumo') {
        totals.consumos = roundStock(totals.consumos + aplicado);
      }

      db.prepare(
        `
        UPDATE personal_movimientos
        SET saldo_pendiente = ?, estado = ?
        WHERE id = ?
      `
      ).run(saldoRestante, saldoRestante > 0 ? 'pendiente' : 'aplicado', movement.id);

      insertItem.run(
        liquidacionId,
        movement.id,
        movement.tipo,
        movement.descripcion,
        movement.monto,
        aplicado,
        saldoRestante
      );
    });

    const montoNeto = roundStock(
      montoBruto - totals.adelantos - totals.descuentos - totals.consumos
    );
    let cajaMovimientoId = null;
    let cajaRegistrada = false;

    if (impactaCaja && metodoPago === 'efectivo' && montoNeto > 0) {
      const cajaActiva = getActiveCaja();
      if (cajaActiva) {
        const resultCaja = db
          .prepare(
            `
          INSERT INTO caja_movimientos (cierre_id, tipo, monto, motivo, actor_id, actor_nombre)
          VALUES (?, 'salida', ?, ?, ?, ?)
        `
          )
          .run(
            cajaActiva.id,
            montoNeto,
            `Pago a ${person.nombre}${periodoHasta ? ` (${periodoHasta})` : ''}`,
            actor.actor_id,
            actor.actor_nombre
          );
        cajaMovimientoId = resultCaja.lastInsertRowid;
        cajaRegistrada = true;
      }
    }

    db.prepare(
      `
      UPDATE personal_liquidaciones
      SET total_adelantos = ?, total_descuentos = ?, total_consumos = ?, monto_neto = ?, caja_movimiento_id = ?
      WHERE id = ?
    `
    ).run(
      totals.adelantos,
      totals.descuentos,
      totals.consumos,
      montoNeto,
      cajaMovimientoId,
      liquidacionId
    );

    db.prepare(
      'UPDATE personal SET total_liquidaciones = total_liquidaciones + 1 WHERE id = ?'
    ).run(person.id);
    db.exec('COMMIT');

    logAudit(db, {
      modulo: 'personal',
      accion: 'liquidacion_pago',
      entidad: 'personal_liquidacion',
      entidad_id: liquidacionId,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: {
        personal_id: person.id,
        personal_nombre: person.nombre,
        frecuencia_pago: frecuenciaPago,
        unidades,
        monto_bruto: montoBruto,
        total_adelantos: totals.adelantos,
        total_descuentos: totals.descuentos,
        total_consumos: totals.consumos,
        monto_neto: montoNeto,
        metodo_pago: metodoPago,
        caja_registrada: cajaRegistrada,
      },
    });

    const liquidacion = db
      .prepare('SELECT * FROM personal_liquidaciones WHERE id = ?')
      .get(liquidacionId);
    const items = db
      .prepare('SELECT * FROM personal_liquidacion_items WHERE liquidacion_id = ? ORDER BY id ASC')
      .all(liquidacionId);
    return {
      ...serializeLiquidacion(liquidacion),
      items: items.map((item) => ({
        ...item,
        monto_original: roundStock(item.monto_original || 0),
        monto_aplicado: roundStock(item.monto_aplicado || 0),
        saldo_restante: roundStock(item.saldo_restante || 0),
      })),
      caja_registrada: cajaRegistrada,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// ============================================
// ENDPOINTS PRINCIPALES
// ============================================

// GET /api/personal - Listado con filtros y estadísticas
router.get('/', auth, requirePermission('config.manage'), (req, res) => {
  const {
    search,
    rol_operativo,
    categoria_id,
    turno_preferido,
    activo,
    cumpleanos_mes,
    page = 1,
    limit = 50,
  } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  // Usar el nuevo servicio si hay filtros avanzados
  if (search || categoria_id || cumpleanos_mes) {
    let items = personalService
      .getPersonalList(search || '', {
        rol_operativo,
        categoria_id: categoria_id ? parseInt(categoria_id) : null,
        turno_preferido,
        activo: activo !== undefined ? activo === 'true' : undefined,
        cumpleanos_mes: cumpleanos_mes === 'true',
      })
      .map((item) => {
        const credentials = ensureClockCredentials(item.id);
        return {
          ...item,
          clock_pin: credentials?.clock_pin || item.clock_pin || '',
          clock_token: credentials?.clock_token || item.clock_token || '',
          clock_url:
            credentials?.clock_token || item.clock_token
              ? `/personal/reloj/${credentials?.clock_token || item.clock_token}`
              : '',
        };
      });

    const totalItems = items.length;
    items = items.slice(offset, offset + limitNum);

    const config = getConfigMap();
    const shiftInfo = getCurrentShiftInfo(config);
    const currentShiftId = shiftInfo.turno_actual?.id || '';
    const currentShiftLabel = shiftInfo.turno_actual?.nombre || '';

    const porRol = items.reduce((acc, item) => {
      const key = item.rol_operativo || 'sin_rol';
      const current = acc[key] || { rol: key, total: 0, activos: 0 };
      current.total += 1;
      if (item.activo) current.activos += 1;
      acc[key] = current;
      return acc;
    }, {});

    const porCategoria = items.reduce((acc, item) => {
      const key = item.categoria_nombre || 'Sin Categoría';
      const current = acc[key] || {
        categoria: key,
        color: item.categoria_color,
        icono: item.categoria_icono,
        total: 0,
        activos: 0,
      };
      current.total += 1;
      if (item.activo) current.activos += 1;
      acc[key] = current;
      return acc;
    }, {});

    const equipoTurnoActual = items.filter(
      (item) => item.activo && matchesPreferredShift(item.turno_preferido, currentShiftId)
    );
    const asistencia = buildAttendanceSummary();

    return res.json({
      items,
      pagination: { page: pageNum, limit: limitNum, total: totalItems },
      turno_actual: currentShiftLabel,
      turno_actual_id: currentShiftId,
      turnos: shiftInfo.turnos,
      por_rol: Object.values(porRol),
      por_categoria: Object.values(porCategoria),
      equipo_turno_actual: equipoTurnoActual,
      asistencia_hoy: asistencia,
      categorias: personalService.getCategorias(),
      frecuencias_pago: PAYMENT_FREQUENCIES,
      metodos_pago: PAYMENT_METHODS,
    });
  }

  // Listado tradicional
  const q = `
    SELECT p.*, u.nombre AS usuario_nombre, u.email AS usuario_email,
           pc.nombre as categoria_nombre, pc.color as categoria_color, pc.icono as categoria_icono
    FROM personal p
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN personal_categorias pc ON pc.id = p.categoria_id
    ORDER BY p.activo DESC, p.rol_operativo ASC, p.nombre ASC
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(q).all(limitNum, offset);
  rows.forEach((row) => {
    const credentials = ensureClockCredentials(row.id);
    row.clock_pin = credentials?.clock_pin || row.clock_pin || '';
    row.clock_token = credentials?.clock_token || row.clock_token || '';
  });
  const pendingMap = buildPendingMap();
  const items = rows.map((row) => normalizePersonalRow(row, pendingMap));

  const totalCount = db.prepare('SELECT COUNT(*) AS total FROM personal').get()?.total || 0;

  const config = getConfigMap();
  const shiftInfo = getCurrentShiftInfo(config);
  const currentShiftId = shiftInfo.turno_actual?.id || '';
  const currentShiftLabel = shiftInfo.turno_actual?.nombre || '';

  const resumenTurnos = items.reduce((acc, item) => {
    const key = item.turno_preferido || 'sin_turno';
    const current = acc[key] || { turno: key, total: 0, activos: 0 };
    current.total += 1;
    if (item.activo) current.activos += 1;
    acc[key] = current;
    return acc;
  }, {});

  const porRol = items.reduce((acc, item) => {
    const key = item.rol_operativo || 'sin_rol';
    const current = acc[key] || { rol: key, total: 0, activos: 0 };
    current.total += 1;
    if (item.activo) current.activos += 1;
    acc[key] = current;
    return acc;
  }, {});

  const porCategoria = items.reduce((acc, item) => {
    const key = item.categoria_nombre || 'Sin Categoría';
    const current = acc[key] || {
      categoria: key,
      color: item.categoria_color,
      icono: item.categoria_icono,
      total: 0,
      activos: 0,
    };
    current.total += 1;
    if (item.activo) current.activos += 1;
    acc[key] = current;
    return acc;
  }, {});

  const equipoTurnoActual = items.filter(
    (item) => item.activo && matchesPreferredShift(item.turno_preferido, currentShiftId)
  );
  const insumosCatalogo = db
    .prepare(
      `
    SELECT id, nombre, unidad, stock_actual, costo_unitario
    FROM inventario_insumos
    WHERE activo = 1
    ORDER BY nombre ASC, id ASC
  `
    )
    .all()
    .map((item) => ({
      ...item,
      stock_actual: roundStock(item.stock_actual || 0),
      costo_unitario: roundStock(item.costo_unitario || 0),
    }));
  const productosCatalogo = db
    .prepare(
      `
    SELECT id, nombre, precio, stock_mode, stock_directo, activo
    FROM productos
    WHERE activo = 1
    ORDER BY nombre ASC, id ASC
  `
    )
    .all()
    .map((item) => ({
      ...item,
      precio: roundStock(item.precio || 0),
      stock_directo: roundStock(item.stock_directo || 0),
    }));
  const asistencia = buildAttendanceSummary();

  res.json({
    items,
    pagination: { page: pageNum, limit: limitNum, total: totalCount },
    turno_actual: currentShiftLabel,
    turno_actual_id: currentShiftId,
    turnos: shiftInfo.turnos,
    resumen_turnos: Object.values(resumenTurnos),
    por_rol: Object.values(porRol),
    por_categoria: Object.values(porCategoria),
    equipo_turno_actual: equipoTurnoActual,
    asistencia_hoy: asistencia,
    insumos_catalogo: insumosCatalogo,
    productos_catalogo: productosCatalogo,
    categorias: personalService.getCategorias(),
    frecuencias_pago: PAYMENT_FREQUENCIES,
    metodos_pago: PAYMENT_METHODS,
    movimientos_recientes: loadRecentMovements(),
    liquidaciones_recientes: loadRecentLiquidaciones(),
  });
});

// GET /api/personal/estadisticas - Dashboard de estadísticas
router.get('/estadisticas', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const stats = personalService.getEstadisticas();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/personal/categorias - Listar categorías laborales
router.get('/categorias', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const categorias = personalService.getCategorias();
    res.json(categorias);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/personal/categorias - Crear categoría
router.post('/categorias', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const categoria = personalService.createCategoria(req.body);
    res.json(categoria);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/personal/categorias/:id - Actualizar categoría
router.put('/categorias/:id', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const categoria = personalService.updateCategoria(req.params.id, req.body);
    if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json(categoria);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/personal/reconocimientos/config - Config de reconocimientos
router.get('/reconocimientos/config', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const config = personalService.getReconocimientosConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/personal/reconocimientos/config - Actualizar config
router.put('/reconocimientos/config', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const config = personalService.updateReconocimientosConfig(req.body);
    res.json(config);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/asistencia/resumen', auth, requirePermission('config.manage'), (req, res) => {
  try {
    res.json(buildAttendanceSummary(cleanText(req.query?.fecha_operativa)));
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo cargar la asistencia' });
  }
});

router.get('/asistencia/analitica', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const hoy = hoyArgentina();
    const desde = cleanText(req.query?.desde) || hoy;
    const hasta = cleanText(req.query?.hasta) || hoy;
    res.json(buildAttendanceAnalytics({ desde, hasta }));
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message || 'No se pudo cargar la analítica de asistencia' });
  }
});

router.get('/asistencia/planilla-semanal', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const desde = cleanText(req.query?.desde) || isoDate();
    res.json(buildWeeklyAttendanceBoard({ desde, dias: 7 }));
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo cargar la planilla semanal' });
  }
});

router.get('/clock/board', (req, res) => {
  try {
    const token = cleanText(req.query?.token);
    if (
      token &&
      !db.prepare('SELECT 1 FROM personal WHERE clock_token = ? AND activo = 1').get(token)
    ) {
      return res.status(404).json({ error: 'Credencial de reloj inválida' });
    }
    res.json(getClockRoster({ token }));
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo cargar el reloj de personal' });
  }
});

router.post('/clock/mark', clockMarkRateLimit, (req, res) => {
  try {
    const token = cleanText(req.body?.token);
    const pin = normalizeClockPin(req.body?.pin);
    const personalId = Number(req.body?.personal_id || 0);
    const action = cleanText(req.body?.action).toLowerCase() || 'ingreso';
    const notas = cleanText(req.body?.notas);
    const person = token
      ? db.prepare('SELECT * FROM personal WHERE clock_token = ? AND activo = 1').get(token)
      : db.prepare('SELECT * FROM personal WHERE id = ? AND activo = 1').get(personalId);

    if (!person) return res.status(404).json({ error: 'Empleado no encontrado' });
    if (!token && pin !== cleanText(person.clock_pin)) {
      return res.status(401).json({ error: 'PIN inválido' });
    }

    const ctx = currentAttendanceContext();
    if (!ctx.shiftId) {
      return res.status(400).json({ error: 'No hay turno operativo activo para fichar' });
    }

    const current = db
      .prepare(
        `
      SELECT *
      FROM personal_asistencia
      WHERE personal_id = ? AND fecha_operativa = ? AND turno_id = ?
    `
      )
      .get(person.id, ctx.fechaOperativa, ctx.shiftId);

    if (!CLOCK_ACTIONS.includes(action)) {
      return res.status(400).json({ error: 'El reloj solo permite marcar ingreso o salida' });
    }
    const incomingAction = action;
    const markState =
      incomingAction === 'ingreso'
        ? 'presente'
        : incomingAction === 'salida'
          ? current?.estado || 'presente'
          : incomingAction;
    const payload = {
      estado: markState,
      origen: token ? 'qr' : 'clock_kiosk',
      notas,
      ingreso_en:
        incomingAction === 'salida'
          ? current?.ingreso_en || new Date().toISOString()
          : new Date().toISOString(),
      salida_en: incomingAction === 'salida' ? new Date().toISOString() : undefined,
    };

    const actor = {
      actor_id: null,
      actor_nombre: token ? `QR ${person.nombre}` : `Reloj ${person.nombre}`,
    };
    const shiftStart = parseDateTimeValue(
      `${ctx.fechaOperativa}T${ctx.shift?.desde || '00:00'}:00`
    );
    const ingreso = parseDateTimeValue(payload.ingreso_en);
    const salida = parseDateTimeValue(payload.salida_en);
    const minutosTarde =
      (markState === 'tarde' || markState === 'presente') && ingreso && shiftStart
        ? Math.max(0, diffMinutesBetween(shiftStart, ingreso))
        : 0;
    const minutosTrabajados =
      salida && ingreso
        ? diffMinutesBetween(ingreso, salida)
        : Number(current?.minutos_trabajados || 0);

    db.prepare(
      `
      INSERT INTO personal_asistencia (
        personal_id, fecha_operativa, turno_id, turno_nombre, estado, ingreso_en, salida_en,
        minutos_tarde, minutos_trabajados, notas, origen, actor_id, actor_nombre, actualizado_en
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(personal_id, fecha_operativa, turno_id) DO UPDATE SET
        estado = excluded.estado,
        ingreso_en = COALESCE(personal_asistencia.ingreso_en, excluded.ingreso_en),
        salida_en = COALESCE(excluded.salida_en, personal_asistencia.salida_en),
        minutos_tarde = excluded.minutos_tarde,
        minutos_trabajados = excluded.minutos_trabajados,
        notas = CASE WHEN TRIM(COALESCE(excluded.notas, '')) != '' THEN excluded.notas ELSE personal_asistencia.notas END,
        origen = excluded.origen,
        actor_id = excluded.actor_id,
        actor_nombre = excluded.actor_nombre,
        actualizado_en = CURRENT_TIMESTAMP
    `
    ).run(
      person.id,
      ctx.fechaOperativa,
      ctx.shiftId,
      ctx.shiftName,
      markState,
      ingreso ? ingreso.toISOString() : null,
      salida ? salida.toISOString() : null,
      minutosTarde,
      minutosTrabajados,
      notas,
      payload.origen,
      actor.actor_id,
      actor.actor_nombre
    );

    db.prepare('UPDATE personal SET clock_last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      person.id
    );

    if ((markState === 'presente' || markState === 'tarde') && minutosTarde === 0) {
      const recognitionConfig = getRecognitionConfig();
      grantRecognitionIfMissing({
        personalId: person.id,
        tipo: 'puntualidad',
        puntos: Number(recognitionConfig.puntos_por_puntualidad || 5),
        descripcion: `Puntualidad ${ctx.fechaOperativa} ${ctx.shiftId}`,
        actorId: actor.actor_id,
        actorNombre: actor.actor_nombre,
      });
    }

    const item = db
      .prepare(
        `
      SELECT *
      FROM personal_asistencia
      WHERE personal_id = ? AND fecha_operativa = ? AND turno_id = ?
    `
      )
      .get(person.id, ctx.fechaOperativa, ctx.shiftId);

    res.json({
      ok: true,
      action: incomingAction,
      attendance: item,
      roster: getClockRoster({ token }),
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo registrar la fichada' });
  }
});

router.get('/:id/asistencia', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT id FROM personal WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Personal no encontrado' });
  res.json(loadAttendanceForPersonal(req.params.id, Number(req.query.limit || 60)));
});

router.post('/:id/asistencia', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Personal no encontrado' });

  const actor = actorFromRequest(req);
  const ctx = currentAttendanceContext();
  const estado = cleanText(req.body?.estado).toLowerCase() || 'presente';
  const ingresoRaw = cleanText(req.body?.ingreso_en);
  const salidaRaw = cleanText(req.body?.salida_en);
  const notas = cleanText(req.body?.notas);
  const origen = cleanText(req.body?.origen) || 'admin';
  const ingreso = parseDateTimeValue(ingresoRaw || new Date().toISOString());
  const salida = parseDateTimeValue(salidaRaw);

  if (!ATTENDANCE_STATES.includes(estado)) {
    return res.status(400).json({ error: 'Estado de asistencia inválido' });
  }
  if (!ctx.shiftId) {
    return res
      .status(400)
      .json({ error: 'No hay turno operativo activo para registrar asistencia' });
  }

  const shiftStart = parseDateTimeValue(`${ctx.fechaOperativa}T${ctx.shift?.desde || '00:00'}:00`);
  const minutosTarde =
    (estado === 'tarde' || estado === 'presente') && ingreso && shiftStart
      ? Math.max(0, diffMinutesBetween(shiftStart, ingreso))
      : 0;
  const minutosTrabajados = salida && ingreso ? diffMinutesBetween(ingreso, salida) : 0;

  db.prepare(
    `
    INSERT INTO personal_asistencia (
      personal_id, fecha_operativa, turno_id, turno_nombre, estado, ingreso_en, salida_en,
      minutos_tarde, minutos_trabajados, notas, origen, actor_id, actor_nombre, actualizado_en
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(personal_id, fecha_operativa, turno_id) DO UPDATE SET
      estado = excluded.estado,
      ingreso_en = COALESCE(excluded.ingreso_en, personal_asistencia.ingreso_en),
      salida_en = COALESCE(excluded.salida_en, personal_asistencia.salida_en),
      minutos_tarde = excluded.minutos_tarde,
      minutos_trabajados = excluded.minutos_trabajados,
      notas = excluded.notas,
      origen = excluded.origen,
      actor_id = excluded.actor_id,
      actor_nombre = excluded.actor_nombre,
      actualizado_en = CURRENT_TIMESTAMP
  `
  ).run(
    person.id,
    ctx.fechaOperativa,
    ctx.shiftId,
    ctx.shiftName,
    estado,
    ingreso ? ingreso.toISOString() : null,
    salida ? salida.toISOString() : null,
    minutosTarde,
    minutosTrabajados,
    notas,
    origen,
    actor.actor_id,
    actor.actor_nombre
  );

  const item = db
    .prepare(
      `
    SELECT *
    FROM personal_asistencia
    WHERE personal_id = ? AND fecha_operativa = ? AND turno_id = ?
  `
    )
    .get(person.id, ctx.fechaOperativa, ctx.shiftId);

  logAudit(db, {
    modulo: 'personal',
    accion: 'asistencia_upsert',
    entidad: 'personal_asistencia',
    entidad_id: item.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      personal_id: person.id,
      personal_nombre: person.nombre,
      fecha_operativa: ctx.fechaOperativa,
      turno_id: ctx.shiftId,
      estado,
      minutos_tarde: minutosTarde,
      minutos_trabajados: minutosTrabajados,
    },
  });

  if ((estado === 'presente' || estado === 'tarde') && minutosTarde === 0) {
    const recognitionConfig = getRecognitionConfig();
    grantRecognitionIfMissing({
      personalId: person.id,
      tipo: 'puntualidad',
      puntos: Number(recognitionConfig.puntos_por_puntualidad || 5),
      descripcion: `Puntualidad ${ctx.fechaOperativa} ${ctx.shiftId}`,
      actorId: actor.actor_id,
      actorNombre: actor.actor_nombre,
    });
  }

  res.json(item);
});

router.put('/:id/asistencia/manual', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Personal no encontrado' });

  const actor = actorFromRequest(req);
  const fechaOperativa = cleanText(req.body?.fecha_operativa);
  const estado = cleanText(req.body?.estado).toLowerCase() || 'presente';
  const notas = cleanText(req.body?.notas);
  const ingreso = parseDateTimeValue(cleanText(req.body?.ingreso_en));
  const salida = parseDateTimeValue(cleanText(req.body?.salida_en));
  const {
    turno_id: turnoId,
    turno_nombre: turnoNombre,
    turno_desde: turnoDesde,
  } = resolveAttendanceTurnMeta({
    turnoId: req.body?.turno_id,
    turnoNombre: req.body?.turno_nombre,
    turnoPreferido: person.turno_preferido,
  });

  if (!fechaOperativa) {
    return res.status(400).json({ error: 'La fecha operativa es obligatoria' });
  }
  if (!ATTENDANCE_STATES.includes(estado)) {
    return res.status(400).json({ error: 'Estado de asistencia inválido' });
  }

  const shiftStart = parseDateTimeValue(`${fechaOperativa}T${turnoDesde || '00:00'}:00`);
  const minutosTarde =
    (estado === 'tarde' || estado === 'presente') && ingreso && shiftStart
      ? Math.max(0, diffMinutesBetween(shiftStart, ingreso))
      : 0;
  const minutosTrabajados = salida && ingreso ? diffMinutesBetween(ingreso, salida) : 0;

  db.prepare(
    `
    INSERT INTO personal_asistencia (
      personal_id, fecha_operativa, turno_id, turno_nombre, estado, ingreso_en, salida_en,
      minutos_tarde, minutos_trabajados, notas, origen, actor_id, actor_nombre, actualizado_en
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin_manual', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(personal_id, fecha_operativa, turno_id) DO UPDATE SET
      turno_nombre = excluded.turno_nombre,
      estado = excluded.estado,
      ingreso_en = excluded.ingreso_en,
      salida_en = excluded.salida_en,
      minutos_tarde = excluded.minutos_tarde,
      minutos_trabajados = excluded.minutos_trabajados,
      notas = excluded.notas,
      origen = excluded.origen,
      actor_id = excluded.actor_id,
      actor_nombre = excluded.actor_nombre,
      actualizado_en = CURRENT_TIMESTAMP
  `
  ).run(
    person.id,
    fechaOperativa,
    turnoId,
    turnoNombre,
    estado,
    ingreso ? ingreso.toISOString() : null,
    salida ? salida.toISOString() : null,
    minutosTarde,
    minutosTrabajados,
    notas,
    actor.actor_id,
    actor.actor_nombre
  );

  const item = db
    .prepare(
      `
    SELECT *
    FROM personal_asistencia
    WHERE personal_id = ? AND fecha_operativa = ? AND turno_id = ?
  `
    )
    .get(person.id, fechaOperativa, turnoId);

  res.json(item);
});

router.get('/:id/objetivos', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT id FROM personal WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Personal no encontrado' });
  res.json(loadObjectivesForPersonal(req.params.id, Number(req.query.limit || 50)));
});

router.post('/:id/objetivos', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Personal no encontrado' });

  const actor = actorFromRequest(req);
  const fechaDesde = cleanText(req.body?.fecha_desde) || hoyArgentina();
  const fechaHasta = cleanText(req.body?.fecha_hasta) || fechaDesde;
  const turnoId = cleanText(req.body?.turno_id);
  const tipo = cleanText(req.body?.tipo) || 'general';
  const unidad = cleanText(req.body?.unidad) || 'u';
  const objetivo = roundStock(parseLocalizedNumber(req.body?.objetivo || 0));
  const progreso = roundStock(parseLocalizedNumber(req.body?.progreso || 0));
  const premioPuntos = Math.max(0, Number(req.body?.premio_puntos || 0));
  const premioMonto = pesosACentavos(req.body?.premio_monto || 0);
  const notas = cleanText(req.body?.notas);
  const cumplido = req.body?.cumplido === true || Number(req.body?.cumplido) === 1 ? 1 : 0;

  if (objetivo <= 0) return res.status(400).json({ error: 'El objetivo debe ser mayor a 0' });

  const result = db
    .prepare(
      `
    INSERT INTO personal_objetivos (
      personal_id, fecha_desde, fecha_hasta, turno_id, tipo, objetivo, progreso, unidad,
      premio_puntos, premio_monto, cumplido, notas, actor_id, actor_nombre
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      person.id,
      fechaDesde,
      fechaHasta,
      turnoId,
      tipo,
      objetivo,
      progreso,
      unidad,
      premioPuntos,
      premioMonto,
      cumplido,
      notas,
      actor.actor_id,
      actor.actor_nombre
    );

  const item = db
    .prepare('SELECT * FROM personal_objetivos WHERE id = ?')
    .get(result.lastInsertRowid);
  if ((cumplido || progreso >= objetivo) && (premioPuntos > 0 || premioMonto > 0)) {
    grantRecognitionIfMissing({
      personalId: person.id,
      tipo: 'bonus',
      puntos: premioPuntos,
      descripcion: `Meta cumplida: ${tipo} ${fechaDesde} ${fechaHasta}`,
      actorId: actor.actor_id,
      actorNombre: actor.actor_nombre,
    });
  }
  res.json(item);
});

router.put('/:id/objetivos/:objetivoId', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Personal no encontrado' });
  const objetivo = db
    .prepare('SELECT * FROM personal_objetivos WHERE id = ? AND personal_id = ?')
    .get(req.params.objetivoId, person.id);
  if (!objetivo) return res.status(404).json({ error: 'Objetivo no encontrado' });

  const actor = actorFromRequest(req);
  const progreso =
    req.body?.progreso === undefined
      ? Number(objetivo.progreso || 0)
      : roundStock(parseLocalizedNumber(req.body?.progreso || 0));
  const cumplido =
    req.body?.cumplido === undefined
      ? progreso >= Number(objetivo.objetivo || 0)
        ? 1
        : Number(objetivo.cumplido || 0)
      : Number(req.body?.cumplido) === 1 || req.body?.cumplido === true
        ? 1
        : 0;
  const notas =
    req.body?.notas === undefined ? cleanText(objetivo.notas) : cleanText(req.body?.notas);

  db.prepare(
    `
    UPDATE personal_objetivos
    SET progreso = ?, cumplido = ?, notas = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ? AND personal_id = ?
  `
  ).run(progreso, cumplido, notas, objetivo.id, person.id);

  if (
    (cumplido || progreso >= Number(objetivo.objetivo || 0)) &&
    Number(objetivo.premio_puntos || 0) > 0
  ) {
    grantRecognitionIfMissing({
      personalId: person.id,
      tipo: 'bonus',
      puntos: Number(objetivo.premio_puntos || 0),
      descripcion: `Meta cumplida: ${objetivo.tipo} ${objetivo.fecha_desde} ${objetivo.fecha_hasta}`,
      actorId: actor.actor_id,
      actorNombre: actor.actor_nombre,
    });
  }

  res.json(db.prepare('SELECT * FROM personal_objetivos WHERE id = ?').get(objetivo.id));
});

router.post('/:id/consumo-producto', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Personal no encontrado' });

  const productoId = Number(req.body?.producto_id || 0);
  const cantidad = roundStock(parseLocalizedNumber(req.body?.cantidad || 1));
  const descripcion = cleanText(req.body?.descripcion);
  const descuentoPct = roundStock(
    parseLocalizedNumber(req.body?.descuento_empleado_pct ?? person.descuento_empleado_pct ?? 20)
  );
  const actor = actorFromRequest(req);
  const producto = db
    .prepare('SELECT * FROM productos WHERE id = ? AND activo = 1')
    .get(productoId);

  if (!producto) return res.status(400).json({ error: 'Producto inválido' });
  if (cantidad <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });

  const precioLista = roundStock(Number(producto.precio || 0) * cantidad);
  const monto = roundStock(precioLista * (1 - Math.min(100, Math.max(0, descuentoPct)) / 100));
  if (monto < 0) return res.status(400).json({ error: 'Monto inválido para el consumo' });

  try {
    db.exec('BEGIN');

    applyInventoryToItems(
      db,
      [
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          cantidad,
          precio_unitario: Number(producto.precio || 0),
          descripcion,
          variantes: {},
          extras: [],
        },
      ],
      {
        tipo: 'salida_personal_producto',
        motivo: `Consumo de personal: ${person.nombre}`,
        detalle_extra: {
          personal_id: person.id,
          personal_nombre: person.nombre,
          producto_id: producto.id,
          producto_nombre: producto.nombre,
        },
      }
    );

    const result = db
      .prepare(
        `
      INSERT INTO personal_movimientos (
        personal_id, tipo, descripcion, monto, saldo_pendiente, estado,
        producto_id, producto_nombre, cantidad_producto, precio_lista, descuento_empleado_pct,
        actor_id, actor_nombre
      ) VALUES (?, 'consumo', ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        person.id,
        descripcion || `Consumo de ${producto.nombre}`,
        monto,
        monto,
        producto.id,
        producto.nombre,
        cantidad,
        precioLista,
        descuentoPct,
        actor.actor_id,
        actor.actor_nombre
      );

    db.exec('COMMIT');

    const row = db
      .prepare('SELECT * FROM personal_movimientos WHERE id = ?')
      .get(result.lastInsertRowid);
    logAudit(db, {
      modulo: 'personal',
      accion: 'consumo_producto',
      entidad: 'personal_movimiento',
      entidad_id: row.id,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: {
        personal_id: person.id,
        personal_nombre: person.nombre,
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        cantidad,
        precio_lista: precioLista,
        descuento_empleado_pct: descuentoPct,
        monto,
      },
    });

    res.json(serializeMovement(row));
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Si no había transacción abierta, el error original es el relevante.
    }
    res.status(400).json({ error: error.message || 'No se pudo registrar el consumo de producto' });
  }
});

// GET /api/personal/:id/detalle - Ficha completa del empleado
router.get('/:id/detalle', auth, requirePermission('config.manage'), (req, res) => {
  const detail = loadPersonalDetail(req.params.id);
  if (!detail) {
    return res.status(404).json({ error: 'Personal no encontrado' });
  }
  res.json(detail);
});

router.get('/:id/liquidaciones/sugerida', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Personal no encontrado' });
  res.json(getSuggestedLiquidation(person));
});

router.post('/:id/liquidaciones/auto', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!person) return res.status(404).json({ error: 'Personal no encontrado' });

  const suggestion = getSuggestedLiquidation(person);
  if (Number(suggestion.unidades_sugeridas || 0) <= 0) {
    return res
      .status(400)
      .json({ error: 'No hay jornadas trabajadas para liquidar automáticamente en este período' });
  }

  try {
    const actor = actorFromRequest(req);
    const result = createLiquidacion(
      person,
      {
        ...req.body,
        unidades: suggestion.unidades_sugeridas,
        monto_base: suggestion.monto_base,
        periodo_desde: suggestion.periodo_desde,
        periodo_hasta: suggestion.periodo_hasta,
      },
      actor
    );
    return res.json({ auto: true, sugerencia: suggestion, ...result });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo liquidar automáticamente' });
  }
});

// ============================================
// CRUD BÁSICO
// ============================================

router.post('/', auth, requirePermission('config.manage'), (req, res) => {
  const nombre = cleanText(req.body?.nombre);
  const rolOperativo = cleanText(req.body?.rol_operativo) || 'cocina';
  const telefono = cleanText(req.body?.telefono);
  const email = cleanText(req.body?.email);
  const turnoPreferido = cleanText(req.body?.turno_preferido);
  const usuarioId = req.body?.usuario_id || null;
  const frecuenciaPago = normalizeFrequency(req.body?.frecuencia_pago);
  const montoBase = pesosACentavos(req.body?.monto_base || 0);
  const medioPagoPreferido = normalizePaymentMethod(req.body?.medio_pago_preferido);
  const activo = Number(req.body?.activo) === 0 ? 0 : 1;
  const notas = cleanText(req.body?.notas);
  const avatarUrl = cleanText(req.body?.avatar_url);
  const fechaNacimiento = cleanText(req.body?.fecha_nacimiento);
  const fechaIngreso = cleanText(req.body?.fecha_ingreso) || hoyArgentina();
  const direccion = cleanText(req.body?.direccion);
  const categoriaId = req.body?.categoria_id || 1;
  const clockPin = normalizeClockPin(req.body?.clock_pin) || generateClockPin();
  const clockToken = cleanText(req.body?.clock_token) || generateClockToken();

  if (!nombre) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }
  if (montoBase < 0) {
    return res.status(400).json({ error: 'El monto base debe ser 0 o mayor' });
  }

  const result = db
    .prepare(
      `
    INSERT INTO personal (
      nombre, rol_operativo, telefono, email, turno_preferido, usuario_id,
      frecuencia_pago, monto_base, medio_pago_preferido, activo, notas, avatar_url,
      fecha_nacimiento, fecha_ingreso, direccion, categoria_id, clock_pin, clock_token, actualizado_en
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `
    )
    .run(
      nombre,
      rolOperativo,
      telefono,
      email,
      turnoPreferido,
      usuarioId,
      frecuenciaPago,
      montoBase,
      medioPagoPreferido,
      activo,
      notas,
      avatarUrl,
      fechaNacimiento,
      fechaIngreso,
      direccion,
      categoriaId,
      clockPin,
      clockToken
    );

  const detail = loadPersonalDetail(result.lastInsertRowid);
  syncDeliveryRepartidor(db, detail.item);
  res.json(detail.item);
});

router.put('/:id', auth, requirePermission('config.manage'), (req, res) => {
  const existing = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Personal no encontrado' });
  }

  const nombre = cleanText(req.body?.nombre ?? existing.nombre);
  const rolOperativo = cleanText(req.body?.rol_operativo ?? existing.rol_operativo) || 'cocina';
  const telefono = cleanText(req.body?.telefono ?? existing.telefono);
  const email = cleanText(req.body?.email ?? existing.email);
  const turnoPreferido = cleanText(req.body?.turno_preferido ?? existing.turno_preferido);
  const usuarioId = req.body?.usuario_id ?? existing.usuario_id;
  const frecuenciaPago = normalizeFrequency(req.body?.frecuencia_pago ?? existing.frecuencia_pago);
  const montoBase =
    req.body?.monto_base === undefined || req.body?.monto_base === null
      ? Number(existing.monto_base || 0)
      : pesosACentavos(req.body.monto_base);
  const medioPagoPreferido = normalizePaymentMethod(
    req.body?.medio_pago_preferido ?? existing.medio_pago_preferido
  );
  const activo =
    req.body?.activo === undefined
      ? Number(existing.activo || 1)
      : Number(req.body.activo) === 0
        ? 0
        : 1;
  const notas = cleanText(req.body?.notas ?? existing.notas);
  const avatarUrl = cleanText(req.body?.avatar_url ?? existing.avatar_url);
  const fechaNacimiento = cleanText(req.body?.fecha_nacimiento ?? existing.fecha_nacimiento);
  const fechaIngreso = cleanText(req.body?.fecha_ingreso ?? existing.fecha_ingreso);
  const direccion = cleanText(req.body?.direccion ?? existing.direccion);
  const categoriaId = req.body?.categoria_id ?? existing.categoria_id;
  const tags = req.body?.tags ? JSON.stringify(req.body.tags) : existing.tags;
  const clockPin =
    req.body?.clock_pin === undefined
      ? cleanText(existing.clock_pin)
      : normalizeClockPin(req.body?.clock_pin);
  const clockToken = cleanText(existing.clock_token) || generateClockToken();

  if (!nombre) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }
  if (montoBase < 0) {
    return res.status(400).json({ error: 'El monto base debe ser 0 o mayor' });
  }

  db.prepare(
    `
    UPDATE personal
    SET nombre = ?, rol_operativo = ?, telefono = ?, email = ?, turno_preferido = ?, usuario_id = ?,
        frecuencia_pago = ?, monto_base = ?, medio_pago_preferido = ?, activo = ?, notas = ?,
        avatar_url = ?, fecha_nacimiento = ?, fecha_ingreso = ?, direccion = ?, categoria_id = ?,
        tags = ?, clock_pin = ?, clock_token = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(
    nombre,
    rolOperativo,
    telefono,
    email,
    turnoPreferido,
    usuarioId || null,
    frecuenciaPago,
    montoBase,
    medioPagoPreferido,
    activo,
    notas,
    avatarUrl,
    fechaNacimiento,
    fechaIngreso,
    direccion,
    categoriaId,
    tags,
    clockPin || generateClockPin(),
    clockToken,
    req.params.id
  );

  const detail = loadPersonalDetail(req.params.id);
  syncDeliveryRepartidor(db, detail.item);
  res.json(detail.item);
});

router.delete('/:id', auth, requirePermission('config.manage'), (req, res) => {
  const existing = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Personal no encontrado' });
  }
  syncDeliveryRepartidor(db, { ...existing, rol_operativo: 'inactivo', activo: 0 });
  db.prepare('UPDATE personal SET activo = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?').run(
    req.params.id
  );
  logAudit(db, {
    modulo: 'personal',
    accion: 'baja_personal',
    entidad: 'personal',
    entidad_id: existing.id,
    actor_id: req.user?.id || null,
    actor_nombre: req.user?.nombre || '',
    detalle: { nombre: existing.nombre, motivo: 'Baja lógica desde el panel' },
  });
  res.json({ ok: true, archivado: true });
});

// ============================================
// DIRECCIONES
// ============================================

// GET /api/personal/:id/direcciones
router.get('/:id/direcciones', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const direcciones = personalService.getDirecciones(req.params.id);
    res.json(direcciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/personal/:id/direcciones
router.post('/:id/direcciones', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const direccion = personalService.createDireccion(req.params.id, req.body);
    res.json(direccion);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/personal/:id/direcciones/:direccionId
router.put(
  '/:id/direcciones/:direccionId',
  auth,
  requirePermission('config.manage'),
  (req, res) => {
    try {
      const direccion = personalService.updateDireccion(
        req.params.id,
        req.params.direccionId,
        req.body
      );
      if (!direccion) return res.status(404).json({ error: 'Dirección no encontrada' });
      res.json(direccion);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// DELETE /api/personal/:id/direcciones/:direccionId
router.delete(
  '/:id/direcciones/:direccionId',
  auth,
  requirePermission('config.manage'),
  (req, res) => {
    try {
      const result = personalService.deleteDireccion(req.params.id, req.params.direccionId);
      if (!result) return res.status(404).json({ error: 'Dirección no encontrada' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// CARRERA / ASCENSOS
// ============================================

// GET /api/personal/:id/carrera - Historial de carrera
router.get('/:id/carrera', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const carrera = personalService.getCarreraHistorial(req.params.id);
    res.json(carrera);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/personal/:id/ascenso - Registrar ascenso
router.post('/:id/ascenso', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const actor = actorFromRequest(req);
    const resultado = personalService.registrarAscenso(req.params.id, req.body, actor.actor_id);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// RECONOCIMIENTOS / PUNTOS
// ============================================

// GET /api/personal/:id/reconocimientos
router.get('/:id/reconocimientos', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const reconocimientos = personalService.getReconocimientos(req.params.id, limit);
    res.json(reconocimientos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/personal/:id/reconocimientos - Agregar reconocimiento
router.post('/:id/reconocimientos', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const actor = actorFromRequest(req);
    const resultado = personalService.agregarReconocimiento(
      req.params.id,
      req.body,
      actor.actor_id
    );
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/personal/:id/reconocimientos/canjear - Canjear puntos
router.post(
  '/:id/reconocimientos/canjear',
  auth,
  requirePermission('config.manage'),
  (req, res) => {
    try {
      const actor = actorFromRequest(req);
      const resultado = personalService.canjearReconocimientos(req.params.id, actor.actor_id);
      res.json(resultado);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// ============================================
// MOVIMIENTOS Y LIQUIDACIONES (ORIGINALES)
// ============================================

router.post('/:id/movimientos', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!person) {
    return res.status(404).json({ error: 'Personal no encontrado' });
  }

  const tipo = cleanText(req.body?.tipo).toLowerCase();
  const descripcion = cleanText(req.body?.descripcion);
  let monto = pesosACentavos(req.body?.monto || 0);
  const impactaCaja =
    Number(req.body?.impacta_caja) === 1 ||
    (req.body?.impacta_caja === undefined && tipo === 'adelanto');
  const actor = actorFromRequest(req);

  if (!MOVEMENT_TYPES.includes(tipo)) {
    return res.status(400).json({ error: 'Tipo de movimiento invalido' });
  }

  let insumo = null;
  let cantidadInsumo = 0;
  let cajaMovimientoId = null;
  let cajaRegistrada = false;
  let stockAjustado = false;

  try {
    db.exec('BEGIN');

    if (tipo === 'consumo') {
      const insumoId = Number(req.body?.insumo_id || 0);
      cantidadInsumo = roundStock(parseLocalizedNumber(req.body?.cantidad_insumo || 0));
      insumo = db.prepare('SELECT * FROM inventario_insumos WHERE id = ?').get(insumoId);

      if (!insumo) {
        throw new Error('Selecciona un insumo valido para registrar el consumo');
      }
      if (cantidadInsumo <= 0) {
        throw new Error('La cantidad consumida debe ser mayor a 0');
      }

      const nextStock = roundStock(Number(insumo.stock_actual || 0) - cantidadInsumo);
      if (nextStock < 0) {
        throw new Error(`No hay stock suficiente de ${insumo.nombre}`);
      }

      if (monto <= 0) {
        monto = roundStock(cantidadInsumo * Number(insumo.costo_unitario || 0));
      }
      if (monto <= 0) {
        throw new Error('Define un monto para descontar o carga costo al insumo');
      }

      db.prepare(
        `
        UPDATE inventario_insumos
        SET stock_actual = ?, actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(nextStock, insumo.id);

      insertInventoryMovement(db, {
        insumo_id: insumo.id,
        cantidad: -cantidadInsumo,
        tipo: 'salida_personal',
        motivo: `Salida a personal: ${person.nombre}`,
        detalle: {
          personal_id: person.id,
          personal_nombre: person.nombre,
          descripcion,
          anterior: roundStock(insumo.stock_actual || 0),
          nuevo: nextStock,
        },
      });
      stockAjustado = true;
    } else if (monto <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    if (tipo === 'adelanto' && impactaCaja) {
      const cajaActiva = getActiveCaja();
      if (cajaActiva) {
        const resultCaja = db
          .prepare(
            `
          INSERT INTO caja_movimientos (cierre_id, tipo, monto, motivo, actor_id, actor_nombre)
          VALUES (?, 'salida', ?, ?, ?, ?)
        `
          )
          .run(
            cajaActiva.id,
            monto,
            `Adelanto a ${person.nombre}${descripcion ? ` - ${descripcion}` : ''}`,
            actor.actor_id,
            actor.actor_nombre
          );
        cajaMovimientoId = resultCaja.lastInsertRowid;
        cajaRegistrada = true;
      }
    }

    const result = db
      .prepare(
        `
      INSERT INTO personal_movimientos (
        personal_id, tipo, descripcion, monto, saldo_pendiente, estado,
        insumo_id, cantidad_insumo, caja_movimiento_id, actor_id, actor_nombre
      ) VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?, ?, ?, ?)
    `
      )
      .run(
        person.id,
        tipo,
        descripcion || `${tipo} de personal`,
        monto,
        monto,
        insumo?.id || null,
        cantidadInsumo || 0,
        cajaMovimientoId,
        actor.actor_id,
        actor.actor_nombre
      );

    // Actualizar total_adelantos en personal
    if (tipo === 'adelanto') {
      db.prepare('UPDATE personal SET total_adelantos = total_adelantos + ? WHERE id = ?').run(
        monto,
        person.id
      );
    }

    db.exec('COMMIT');

    logAudit(db, {
      modulo: 'personal',
      accion: `movimiento_${tipo}`,
      entidad: 'personal_movimiento',
      entidad_id: result.lastInsertRowid,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: {
        personal_id: person.id,
        personal_nombre: person.nombre,
        tipo,
        monto,
        descripcion,
        insumo_id: insumo?.id || null,
        cantidad_insumo: cantidadInsumo,
        caja_registrada: cajaRegistrada,
      },
    });

    const row = db
      .prepare(
        `
      SELECT
        pm.*,
        i.nombre AS insumo_nombre,
        i.unidad AS insumo_unidad
      FROM personal_movimientos pm
      LEFT JOIN inventario_insumos i ON i.id = pm.insumo_id
      WHERE pm.id = ?
    `
      )
      .get(result.lastInsertRowid);

    res.json({
      ...serializeMovement(row),
      caja_registrada: cajaRegistrada,
      stock_ajustado: stockAjustado,
    });
  } catch (error) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: error.message || 'No se pudo registrar el movimiento' });
  }
});

/**
 * Liquidación manual.
 *
 * El cuerpo de esta ruta era una copia literal de `createLiquidacion` (arriba
 * en este mismo archivo): las mismas validaciones, el mismo INSERT, el mismo
 * recorrido de movimientos pendientes, el mismo asiento en caja y la misma
 * respuesta. Unas doscientas líneas duplicadas de lógica que mueve plata.
 *
 * El riesgo concreto de tenerlo dos veces es que un arreglo entre en una sola
 * de las dos: `/liquidaciones/auto` ya usaba la función, así que un cambio en
 * el prorrateo de adelantos hecho ahí no llegaba nunca a la liquidación
 * manual, que es la que más se usa.
 *
 * Se conserva la implementación de la función porque es la que ya estaba en
 * uso por el camino automático, y porque abre la transacción antes del `try`:
 * la versión de la ruta hacía `BEGIN` adentro, así que si el `BEGIN` fallaba
 * el `catch` intentaba un ROLLBACK sobre una transacción inexistente.
 */
router.post('/:id/liquidaciones', auth, requirePermission('config.manage'), (req, res) => {
  const person = db.prepare('SELECT * FROM personal WHERE id = ?').get(req.params.id);
  if (!person) {
    return res.status(404).json({ error: 'Personal no encontrado' });
  }

  try {
    const result = createLiquidacion(person, req.body, actorFromRequest(req));
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'No se pudo liquidar el pago' });
  }
});

router.post(
  '/upload-avatar',
  auth,
  requirePermission('config.manage'),
  avatarUpload.single('imagen'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen' });
    res.json({ url: uploadPathFromFilename(req.file.filename) });
  }
);

module.exports = router;
