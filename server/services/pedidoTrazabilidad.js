/**
 * Trazabilidad de tiempos del pedido.
 *
 * Registra cada transición de estado en `pedido_eventos` para poder
 * reconstruir la línea de tiempo completa: cuánto tardó la cocina,
 * cuánto esperó el pedido listo antes de que lo retiren, cuánto duró
 * el viaje. Sin esto no se puede responder "por qué tardó 50 minutos".
 *
 * Diseño deliberado: no reemplaza `pedidos.estado` (que sigue siendo la
 * verdad del estado actual), lo complementa con el histórico.
 */
const db = require('../db');
const logger = require('../utils/logger');

/**
 * Orden canónico del ciclo de vida. Se usa para calcular duraciones
 * entre hitos y para detectar retrocesos (deshacer entrega).
 */
const ETAPAS = [
  'nuevo',
  'confirmado',
  'preparando',
  'listo',
  'asignado',
  'aceptado',
  'en_camino',
  'entregado',
];

/**
 * Registra un evento de cambio de estado.
 *
 * @param {Object} params
 * @param {number} params.pedidoId
 * @param {string} params.estado           estado nuevo
 * @param {string} [params.estadoAnterior]
 * @param {string} [params.actorTipo]      'rider' | 'admin' | 'tpv' | 'agente' | 'sistema'
 * @param {number} [params.actorId]
 * @param {string} [params.actorNombre]
 * @param {string} [params.motivo]         para incidencias / reversiones
 * @param {Object} [params.metadata]       cualquier dato extra (lat/lng, etc.)
 */
function registrarEvento({
  pedidoId,
  estado,
  estadoAnterior = '',
  actorTipo = 'sistema',
  actorId = null,
  actorNombre = '',
  motivo = '',
  metadata = null,
}) {
  if (!pedidoId || !estado) return null;
  try {
    const info = db
      .prepare(
        `INSERT INTO pedido_eventos
           (pedido_id, estado, estado_anterior, actor_tipo, actor_id, actor_nombre, motivo, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(pedidoId),
        String(estado),
        String(estadoAnterior || ''),
        String(actorTipo || 'sistema'),
        actorId ? Number(actorId) : null,
        String(actorNombre || ''),
        String(motivo || ''),
        metadata ? JSON.stringify(metadata) : '{}'
      );
    return info.lastInsertRowid;
  } catch (error) {
    // La trazabilidad nunca debe romper el flujo principal del pedido.
    logger.error('No se pudo registrar evento de pedido', {
      pedidoId,
      estado,
      message: error.message,
    });
    return null;
  }
}

/**
 * Devuelve la línea de tiempo cruda de un pedido.
 */
function obtenerEventos(pedidoId) {
  if (!pedidoId) return [];
  try {
    return db
      .prepare(
        `SELECT id, estado, estado_anterior, actor_tipo, actor_id, actor_nombre,
                motivo, metadata, creado_en
         FROM pedido_eventos
         WHERE pedido_id = ?
         ORDER BY datetime(creado_en) ASC, id ASC`
      )
      .all(Number(pedidoId))
      .map((row) => ({
        ...row,
        metadata: safeParse(row.metadata),
      }));
  } catch {
    return [];
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function toMs(fecha) {
  if (!fecha) return null;
  const t = new Date(String(fecha).replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Calcula las duraciones entre hitos de un pedido, en minutos.
 *
 * Devuelve:
 *   {
 *     eventos: [...],
 *     hitos: { confirmado: ISO, listo: ISO, en_camino: ISO, entregado: ISO },
 *     duraciones: {
 *       preparacion,   // confirmado → listo
 *       esperaRetiro,  // listo → en_camino
 *       viaje,         // en_camino → entregado
 *       total          // creación → entregado
 *     }
 *   }
 *
 * Cualquier duración que no se pueda calcular viene como null (no 0),
 * para poder distinguir "tardó cero" de "no tengo el dato".
 */
function calcularDuraciones(pedidoId, creadoEn = null) {
  const eventos = obtenerEventos(pedidoId);
  const hitos = {};

  // Primer timestamp de cada estado (si hubo retrocesos, nos quedamos
  // con el primero: es cuando realmente pasó por esa etapa).
  for (const ev of eventos) {
    if (!hitos[ev.estado]) hitos[ev.estado] = ev.creado_en;
  }

  const diffMin = (a, b) => {
    const ms1 = toMs(a);
    const ms2 = toMs(b);
    if (ms1 === null || ms2 === null) return null;
    return Math.max(0, Math.round((ms2 - ms1) / 60000));
  };

  const inicio = creadoEn || hitos.nuevo || hitos.confirmado || null;

  return {
    eventos,
    hitos,
    duraciones: {
      preparacion: diffMin(hitos.confirmado || inicio, hitos.listo),
      esperaRetiro: diffMin(hitos.listo, hitos.en_camino),
      viaje: diffMin(hitos.en_camino, hitos.entregado),
      total: diffMin(inicio, hitos.entregado),
    },
  };
}

/**
 * Backfill: para pedidos viejos sin eventos, sembramos al menos el
 * evento de creación para que los reportes no los ignoren por completo.
 * Idempotente.
 */
function backfillPedidosSinEventos(limite = 500) {
  try {
    const filas = db
      .prepare(
        `SELECT p.id, p.estado, p.creado_en
         FROM pedidos p
         LEFT JOIN pedido_eventos e ON e.pedido_id = p.id
         WHERE e.id IS NULL
         ORDER BY p.id DESC
         LIMIT ?`
      )
      .all(limite);

    if (filas.length === 0) return 0;

    const insert = db.prepare(
      `INSERT INTO pedido_eventos (pedido_id, estado, actor_tipo, motivo, creado_en)
       VALUES (?, ?, 'sistema', 'backfill', ?)`
    );
    const tx = db.transaction((rows) => {
      for (const r of rows) {
        insert.run(r.id, r.estado || 'nuevo', r.creado_en);
      }
    });
    tx(filas);
    return filas.length;
  } catch (error) {
    logger.error('Backfill de eventos falló', { message: error.message });
    return 0;
  }
}

module.exports = {
  ETAPAS,
  registrarEvento,
  obtenerEventos,
  calcularDuraciones,
  backfillPedidosSinEventos,
};
