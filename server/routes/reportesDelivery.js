/**
 * Reportes de delivery.
 *
 * Responde las preguntas que hoy el dueño no puede contestar:
 *  - ¿Cuánto tarda en promedio un pedido de punta a punta?
 *  - ¿Dónde se pierde el tiempo: en la cocina, esperando al rider, o en el viaje?
 *  - ¿Qué rider es más rápido? ¿Alguno tiene muchas incidencias?
 *  - ¿Hay franjas horarias que se saturan?
 *  - ¿Cuántas entregas se marcaron por error?
 *
 * Todo sale de `pedido_eventos` (trazabilidad) cruzado con `pedidos`.
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');

const { fechaLocal, hoyArgentina } = require('../utils/fechaLocal');
/** Normaliza un rango de fechas con defaults sensatos (últimos 7 días). */
function parseRango(query) {
  const hoy = hoyArgentina();
  const haceUnaSemana = new Date(`${hoy}T12:00:00-03:00`);
  haceUnaSemana.setUTCDate(haceUnaSemana.getUTCDate() - 7);

  const desde = String(query?.desde || hoyArgentina(haceUnaSemana)).slice(0, 10);
  const hasta = String(query?.hasta || hoy).slice(0, 10);
  return { desde, hasta };
}

/** Mediana: más honesta que el promedio cuando hay outliers (un pedido
 *  que quedó 3 horas abierto porque nadie lo cerró distorsiona la media). */
function mediana(valores) {
  const nums = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? Math.round((nums[mid - 1] + nums[mid]) / 2) : nums[mid];
}

function promedio(valores) {
  const nums = valores.filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/**
 * Trae, por cada pedido de delivery del rango, los timestamps de sus
 * hitos. Un solo query con agregación condicional en vez de N+1.
 */
function cargarPedidosConHitos(desde, hasta) {
  return db
    .prepare(
      `SELECT
         p.id,
         p.numero,
         p.creado_en,
         p.estado,
         p.total,
         p.repartidor_id,
         p.repartidor_nombre,
         p.cliente_direccion,
         MIN(CASE WHEN e.estado = 'confirmado' THEN e.creado_en END) AS ts_confirmado,
         MIN(CASE WHEN e.estado = 'listo'      THEN e.creado_en END) AS ts_listo,
         MIN(CASE WHEN e.estado = 'en_camino'  THEN e.creado_en END) AS ts_en_camino,
         MIN(CASE WHEN e.estado = 'entregado'  THEN e.creado_en END) AS ts_entregado,
         SUM(CASE WHEN e.estado = 'incidencia' THEN 1 ELSE 0 END)    AS incidencias,
         SUM(CASE WHEN json_extract(e.metadata, '$.reversion') = 1 THEN 1 ELSE 0 END) AS reversiones
       FROM pedidos p
       LEFT JOIN pedido_eventos e ON e.pedido_id = p.id
       WHERE p.tipo_entrega = 'delivery'
         AND ${fechaLocal('p.creado_en')} BETWEEN ? AND ?
       GROUP BY p.id
       ORDER BY p.creado_en DESC`
    )
    .all(desde, hasta);
}

function toMs(fecha) {
  if (!fecha) return null;
  const t = new Date(String(fecha).replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(t) ? t : null;
}

function minutosEntre(a, b) {
  const t1 = toMs(a);
  const t2 = toMs(b);
  if (t1 === null || t2 === null) return null;
  const min = (t2 - t1) / 60000;
  // Descartamos negativos y valores absurdos (>8h suele ser un pedido
  // que quedó abierto y se cerró al día siguiente).
  if (min < 0 || min > 480) return null;
  return Math.round(min);
}

/**
 * GET /api/reportes-delivery/resumen?desde=&hasta=
 */
router.get('/resumen', auth, requirePermission('reportes.view'), (req, res) => {
  const { desde, hasta } = parseRango(req.query);

  let filas;
  try {
    filas = cargarPedidosConHitos(desde, hasta);
  } catch (error) {
    return res
      .status(500)
      .json({ error: 'No se pudo leer la trazabilidad', message: error.message });
  }

  const entregados = filas.filter((f) => f.ts_entregado);

  // ── Duraciones por etapa ──
  const dPreparacion = [];
  const dEsperaRetiro = [];
  const dViaje = [];
  const dTotal = [];

  for (const f of entregados) {
    const inicio = f.ts_confirmado || f.creado_en;
    dPreparacion.push(minutosEntre(inicio, f.ts_listo));
    dEsperaRetiro.push(minutosEntre(f.ts_listo, f.ts_en_camino));
    dViaje.push(minutosEntre(f.ts_en_camino, f.ts_entregado));
    dTotal.push(minutosEntre(f.creado_en, f.ts_entregado));
  }

  // ── Por rider ──
  const porRiderMap = new Map();
  for (const f of entregados) {
    if (!f.repartidor_id) continue;
    if (!porRiderMap.has(f.repartidor_id)) {
      porRiderMap.set(f.repartidor_id, {
        repartidor_id: f.repartidor_id,
        nombre: f.repartidor_nombre || `Rider ${f.repartidor_id}`,
        entregas: 0,
        viajes: [],
        totales: [],
        incidencias: 0,
        reversiones: 0,
        facturado: 0,
      });
    }
    const r = porRiderMap.get(f.repartidor_id);
    r.entregas += 1;
    r.viajes.push(minutosEntre(f.ts_en_camino, f.ts_entregado));
    r.totales.push(minutosEntre(f.creado_en, f.ts_entregado));
    r.incidencias += Number(f.incidencias || 0);
    r.reversiones += Number(f.reversiones || 0);
    r.facturado += Number(f.total || 0);
  }

  const porRider = Array.from(porRiderMap.values())
    .map((r) => ({
      repartidor_id: r.repartidor_id,
      nombre: r.nombre,
      entregas: r.entregas,
      viaje_mediana: mediana(r.viajes),
      viaje_promedio: promedio(r.viajes),
      total_mediana: mediana(r.totales),
      incidencias: r.incidencias,
      reversiones: r.reversiones,
      facturado: r.facturado,
    }))
    .sort((a, b) => b.entregas - a.entregas);

  // ── Por franja horaria (hora de creación del pedido) ──
  const porHoraMap = new Map();
  for (const f of filas) {
    const hora = Number(String(f.creado_en || '').slice(11, 13));
    if (!Number.isFinite(hora)) continue;
    if (!porHoraMap.has(hora)) {
      porHoraMap.set(hora, { hora, pedidos: 0, entregados: 0, totales: [] });
    }
    const h = porHoraMap.get(hora);
    h.pedidos += 1;
    if (f.ts_entregado) {
      h.entregados += 1;
      h.totales.push(minutosEntre(f.creado_en, f.ts_entregado));
    }
  }
  const porHora = Array.from(porHoraMap.values())
    .map((h) => ({
      hora: h.hora,
      pedidos: h.pedidos,
      entregados: h.entregados,
      total_mediana: mediana(h.totales),
    }))
    .sort((a, b) => a.hora - b.hora);

  // ── Por día ──
  const porDiaMap = new Map();
  for (const f of filas) {
    const dia = String(f.creado_en || '').slice(0, 10);
    if (!dia) continue;
    if (!porDiaMap.has(dia)) {
      porDiaMap.set(dia, { fecha: dia, pedidos: 0, entregados: 0, totales: [] });
    }
    const d = porDiaMap.get(dia);
    d.pedidos += 1;
    if (f.ts_entregado) {
      d.entregados += 1;
      d.totales.push(minutosEntre(f.creado_en, f.ts_entregado));
    }
  }
  const porDia = Array.from(porDiaMap.values())
    .map((d) => ({
      fecha: d.fecha,
      pedidos: d.pedidos,
      entregados: d.entregados,
      total_mediana: mediana(d.totales),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // ── Los peores del rango: sirven para investigar casos puntuales ──
  const masLentos = entregados
    .map((f) => ({
      id: f.id,
      numero: f.numero,
      direccion: f.cliente_direccion,
      rider: f.repartidor_nombre,
      minutos: minutosEntre(f.creado_en, f.ts_entregado),
      creado_en: f.creado_en,
    }))
    .filter((x) => Number.isFinite(x.minutos))
    .sort((a, b) => b.minutos - a.minutos)
    .slice(0, 10);

  return res.json({
    rango: { desde, hasta },
    totales: {
      pedidos: filas.length,
      entregados: entregados.length,
      sin_entregar: filas.length - entregados.length,
      incidencias: filas.reduce((acc, f) => acc + Number(f.incidencias || 0), 0),
      reversiones: filas.reduce((acc, f) => acc + Number(f.reversiones || 0), 0),
    },
    // Mediana como métrica principal; el promedio se expone al lado
    // para poder detectar cuando hay outliers fuertes.
    duraciones: {
      preparacion: { mediana: mediana(dPreparacion), promedio: promedio(dPreparacion) },
      espera_retiro: { mediana: mediana(dEsperaRetiro), promedio: promedio(dEsperaRetiro) },
      viaje: { mediana: mediana(dViaje), promedio: promedio(dViaje) },
      total: { mediana: mediana(dTotal), promedio: promedio(dTotal) },
    },
    porRider,
    porHora,
    porDia,
    masLentos,
  });
});

module.exports = router;
