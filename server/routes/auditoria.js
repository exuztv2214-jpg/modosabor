const express = require('express');

const router = express.Router();
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const db = require('../db');

/**
 * Panel de auditoría del asistente de IA.
 *
 * Acá se puede ver quién usó el asistente, qué preguntó, qué modelo respondió
 * y si hubo fallbacks o errores. Es la bitácora completa de la interacción
 * con proveedores externos.
 */

/** Sanitizar entradas de texto para evitar inyección en LIKE. */
function escaparLike(texto) {
  return String(texto || '')
    .replace(/[%_\\]/g, (c) => `\\${c}`)
    .slice(0, 100);
}

/** Parsear un entero con límite. */
function entero(valor, porDefecto, max) {
  const n = Number.parseInt(String(valor || porDefecto), 10);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(Math.max(n, 0), max);
}

function whereCon(condiciones, adicionales = []) {
  const todas = [...condiciones, ...adicionales].filter(Boolean);
  return todas.length ? `WHERE ${todas.join(' AND ')}` : '';
}

/**
 * GET /api/auditoria/ia
 *
 * Filtros por query string:
 *  - tipo: consulta | propuesta | ejecucion | prueba | error
 *  - usuario_id: número
 *  - proveedor: gemini | groq | deepseek | ...
 *  - fallback: 0 | 1
 *  - fecha_desde: ISO date (2024-01-01)
 *  - fecha_hasta: ISO date
 *  - buscar: texto libre (busca en pregunta y respuesta)
 *  - orden: creado_en_desc | creado_en_asc | duracion_desc
 *  - limite: 1-100 (default 50)
 *  - pagina: 0+ (default 0)
 */
router.get('/ia', auth, requirePermission('config.manage'), (req, res) => {
  const condiciones = [];
  const params = [];

  const tipo = String(req.query.tipo || '').trim();
  if (tipo) {
    condiciones.push('tipo = ?');
    params.push(tipo);
  }

  const usuarioId = entero(req.query.usuario_id, null, 999999);
  if (usuarioId !== null) {
    condiciones.push('usuario_id = ?');
    params.push(usuarioId);
  }

  const proveedor = String(req.query.proveedor || '')
    .trim()
    .toLowerCase();
  if (proveedor) {
    condiciones.push('proveedor = ?');
    params.push(proveedor);
  }

  const fallback = String(req.query.fallback || '').trim();
  if (fallback === '1' || fallback === '0') {
    condiciones.push('fallback = ?');
    params.push(Number(fallback));
  }

  const fechaDesde = String(req.query.fecha_desde || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde)) {
    condiciones.push('creado_en >= ?');
    params.push(`${fechaDesde} 00:00:00`);
  }

  const fechaHasta = String(req.query.fecha_hasta || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)) {
    condiciones.push('creado_en <= ?');
    params.push(`${fechaHasta} 23:59:59`);
  }

  const buscar = escaparLike(req.query.buscar);
  if (buscar) {
    condiciones.push('(pregunta LIKE ? OR respuesta LIKE ?)');
    params.push(`%${buscar}%`, `%${buscar}%`);
  }

  const where = whereCon(condiciones);

  const orden = String(req.query.orden || '').trim();
  const ordenSql =
    {
      creado_en_asc: 'creado_en ASC',
      duracion_desc: 'duracion_ms DESC',
    }[orden] || 'creado_en DESC';

  const limite = entero(req.query.limite, 50, 100);
  const pagina = entero(req.query.pagina, 0, 9999);
  const offset = pagina * limite;

  const total = db.prepare(`SELECT COUNT(*) AS total FROM auditoria_ia ${where}`).get(...params);

  const rows = db
    .prepare(
      `SELECT
        id, usuario_id, usuario_nombre, tipo, pregunta, respuesta,
        herramientas_usadas, accion, proveedor, modelo, duracion_ms,
        fallback, proveedor_original, error, creado_en
      FROM auditoria_ia
      ${where}
      ORDER BY ${ordenSql}
      LIMIT ? OFFSET ?`
    )
    .all(...params, limite, offset);

  res.json({
    total: total?.total || 0,
    pagina,
    limite,
    resultados: rows.map((r) => ({
      ...r,
      fallback: Boolean(r.fallback),
      herramientas_usadas: safeJson(r.herramientas_usadas),
    })),
  });
});

function safeJson(texto) {
  try {
    return JSON.parse(texto || '[]');
  } catch {
    return [];
  }
}

/**
 * GET /api/auditoria/ia/resumen
 *
 * Estadísticas agregadas para el dashboard de auditoría.
 */
router.get('/ia/resumen', auth, requirePermission('config.manage'), (req, res) => {
  const fechaDesde = String(req.query.fecha_desde || '').trim();
  const fechaHasta = String(req.query.fecha_hasta || '').trim();

  const condiciones = [];
  const params = [];

  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaDesde)) {
    condiciones.push('creado_en >= ?');
    params.push(`${fechaDesde} 00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaHasta)) {
    condiciones.push('creado_en <= ?');
    params.push(`${fechaHasta} 23:59:59`);
  }

  const where = whereCon(condiciones);
  const whereConProveedor = whereCon(condiciones, ["proveedor != ''"]);
  const whereConFallback = whereCon(condiciones, ['fallback = 1']);
  const whereConErrores = whereCon(condiciones, ["tipo = 'error'"]);
  const whereConDuracion = whereCon(condiciones, ['duracion_ms > 0']);

  const total = db.prepare(`SELECT COUNT(*) AS total FROM auditoria_ia ${where}`).get(...params);

  const porTipo = db
    .prepare(`SELECT tipo, COUNT(*) AS total FROM auditoria_ia ${where} GROUP BY tipo`)
    .all(...params);

  const porProveedor = db
    .prepare(
      `SELECT proveedor, COUNT(*) AS total FROM auditoria_ia ${whereConProveedor} GROUP BY proveedor ORDER BY total DESC`
    )
    .all(...params);

  const fallbacks = db
    .prepare(`SELECT COUNT(*) AS total FROM auditoria_ia ${whereConFallback}`)
    .get(...params);

  const errores = db
    .prepare(`SELECT COUNT(*) AS total FROM auditoria_ia ${whereConErrores}`)
    .get(...params);

  const duracion = db
    .prepare(
      `SELECT
        AVG(duracion_ms) AS promedio,
        MAX(duracion_ms) AS maximo,
        MIN(duracion_ms) AS minimo
      FROM auditoria_ia
      ${whereConDuracion}`
    )
    .get(...params);

  const porUsuario = db
    .prepare(
      `SELECT usuario_nombre, COUNT(*) AS total FROM auditoria_ia ${where} GROUP BY usuario_nombre ORDER BY total DESC LIMIT 20`
    )
    .all(...params);

  res.json({
    total: total?.total || 0,
    fallbacks: fallbacks?.total || 0,
    errores: errores?.total || 0,
    duracion: {
      promedio_ms: Math.round(duracion?.promedio || 0),
      maximo_ms: duracion?.maximo || 0,
      minimo_ms: duracion?.minimo || 0,
    },
    por_tipo: porTipo,
    por_proveedor: porProveedor,
    por_usuario: porUsuario,
  });
});

module.exports = router;
module.exports.whereCon = whereCon;
