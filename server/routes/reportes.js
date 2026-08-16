const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { resolveShiftLabel } = require('../utils/shifts');
const { summarizePaymentRows } = require('../utils/paymentStatus');
const { hydratePedido } = require('../services/pedidoService');

const { fechaLocal, hoyArgentina } = require('../utils/fechaLocal');
function toDateOnly(value) {
  return new Date(value).toISOString().split('T')[0];
}

function parseDateRange(req) {
  const today = new Date();
  const hasta = req.query.hasta || toDateOnly(today);
  const desde = req.query.desde || toDateOnly(new Date(today.getTime() - 6 * 86400000));
  return { desde, hasta };
}

function parseDashboardRange(req) {
  const hoy = hoyArgentina();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const desde = datePattern.test(String(req.query.desde || '')) ? req.query.desde : hoy;
  const hasta = datePattern.test(String(req.query.hasta || '')) ? req.query.hasta : hoy;
  const start = new Date(`${desde}T12:00:00-03:00`);
  const end = new Date(`${hasta}T12:00:00-03:00`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end ||
    end.getTime() - start.getTime() > 366 * 86400000
  ) {
    return { desde: hoy, hasta: hoy };
  }

  return { desde, hasta };
}

function diffMinutes(start, end) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

function getConfigMap() {
  return db
    .prepare('SELECT clave, valor FROM configuracion')
    .all()
    .reduce((acc, row) => {
      acc[row.clave] = row.valor;
      return acc;
    }, {});
}

function groupByDay(rows, desde, hasta) {
  const byDate = new Map();
  rows.forEach((row) => {
    const key = String(row.creado_en || '').slice(0, 10);
    const current = byDate.get(key) || { fecha: key, total: 0, pedidos: 0 };
    current.total += Number(row.total || 0);
    current.pedidos += 1;
    byDate.set(key, current);
  });

  const result = [];
  const current = new Date(`${desde}T00:00:00`);
  const end = new Date(`${hasta}T00:00:00`);
  while (current <= end) {
    const key = toDateOnly(current);
    result.push(byDate.get(key) || { fecha: key, total: 0, pedidos: 0 });
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function groupByHour(rows) {
  const base = Array.from({ length: 24 }, (_, index) => ({
    hora: `${String(index).padStart(2, '0')}:00`,
    pedidos: 0,
    total: 0,
  }));

  rows.forEach((row) => {
    const created = new Date(row.creado_en);
    const hour = created.getHours();
    if (Number.isInteger(hour) && base[hour]) {
      base[hour].pedidos += 1;
      base[hour].total += Number(row.total || 0);
    }
  });

  return base;
}

function groupByShift(rows, config) {
  const map = new Map();
  rows.forEach((row) => {
    const key = resolveShiftLabel(
      config,
      row.turno_operativo,
      new Date(String(row.creado_en || '').replace(' ', 'T'))
    );
    const current = map.get(key) || {
      turno: key,
      pedidos: 0,
      total: 0,
      delivery: 0,
      retiro: 0,
      mesa: 0,
    };
    current.pedidos += 1;
    current.total += Number(row.total || 0);
    current[row.tipo_entrega] = (current[row.tipo_entrega] || 0) + 1;
    map.set(key, current);
  });
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      ticketPromedio: item.pedidos ? Math.round(item.total / item.pedidos) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.pedidos - a.pedidos);
}

function buildVipCustomers(limit = 5) {
  const rows = db
    .prepare(
      `
    SELECT
      c.id,
      c.nombre,
      c.total_pedidos,
      c.total_gastado,
      c.nivel,
      c.recompensas_pendientes,
      COALESCE(MAX(CASE WHEN p.estado = 'entregado' THEN p.creado_en END), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id
    WHERE c.total_pedidos > 0
    GROUP BY c.id
  `
    )
    .all();

  return rows
    .map((row) => {
      const ultimaCompraTs = row.ultima_compra
        ? new Date(String(row.ultima_compra).replace(' ', 'T')).getTime()
        : 0;
      const diasSinComprar = ultimaCompraTs
        ? Math.max(0, Math.floor((Date.now() - ultimaCompraTs) / 86400000))
        : 999;
      const nivelBonus =
        {
          Bronce: 0,
          Plata: 6,
          Oro: 12,
          Platino: 18,
        }[row.nivel] || 0;
      const score = Math.round(
        Number(row.total_gastado || 0) / 1200 +
          Number(row.total_pedidos || 0) * 4 +
          nivelBonus +
          Math.max(0, 12 - Math.min(diasSinComprar, 12)) +
          Number(row.recompensas_pendientes || 0) * 5
      );

      return {
        ...row,
        diasSinComprar,
        score,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.total_gastado || 0) - Number(a.total_gastado || 0) ||
        Number(b.total_pedidos || 0) - Number(a.total_pedidos || 0)
    )
    .slice(0, limit);
}

function buildCriticalStock(limit = 10) {
  return db
    .prepare(
      `
    SELECT
      id,
      nombre,
      stock_actual,
      stock_minimo,
      unidad,
      CASE
        WHEN stock_minimo > 0 THEN ROUND((stock_actual / stock_minimo) * 100)
        ELSE 0
      END AS cobertura_pct
    FROM inventario_insumos
    WHERE activo = 1
      AND (
        (stock_minimo > 0 AND stock_actual <= stock_minimo)
        OR (stock_minimo <= 0 AND stock_actual < 10)
      )
    ORDER BY
      CASE
        WHEN stock_minimo > 0 THEN (stock_actual - stock_minimo)
        ELSE stock_actual
      END ASC,
      stock_actual ASC
    LIMIT ?
  `
    )
    .all(limit);
}

function getPedidoItemRows(orderIds = []) {
  const normalizedIds = Array.from(
    new Set((orderIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
  );
  if (!normalizedIds.length) return [];

  const chunkSize = 500;
  const rows = [];

  for (let index = 0; index < normalizedIds.length; index += chunkSize) {
    const chunk = normalizedIds.slice(index, index + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    rows.push(
      ...db
        .prepare(
          `
      SELECT
        pi.pedido_id,
        pi.producto_id,
        pi.categoria_id,
        pi.nombre,
        pi.cantidad,
        pi.precio_unitario,
        pi.subtotal,
        pi.descripcion,
        p.costo,
        p.imagen,
        COALESCE(c.nombre, 'Sin categoria') AS categoria
      FROM pedido_items pi
      LEFT JOIN productos p ON p.id = pi.producto_id
      LEFT JOIN categorias c ON c.id = COALESCE(pi.categoria_id, p.categoria_id)
      WHERE pi.pedido_id IN (${placeholders})
      ORDER BY pi.pedido_id ASC, pi.id ASC
    `
        )
        .all(...chunk)
    );
  }

  return rows;
}

function buildProductAnalytics(rows) {
  const productMap = new Map();
  const categoryMap = new Map();
  let totalCosto = 0;

  getPedidoItemRows(rows.map((pedido) => pedido.id)).forEach((item) => {
    const cantidad = Number(item.cantidad || 0);
    const lineTotal = Number(item.subtotal || Number(item.precio_unitario || 0) * cantidad);
    const name = item.nombre || 'Producto';
    const category = item.categoria || 'Sin categoria';
    const costUnit = Number(item.costo || 0);
    const lineCost = costUnit * cantidad;
    const lineMargin = lineTotal - lineCost;
    totalCosto += lineCost;

    const productCurrent = productMap.get(name) || {
      nombre: name,
      cantidad: 0,
      total: 0,
      costo: 0,
      margen: 0,
      categoria: category,
    };
    productCurrent.cantidad += cantidad;
    productCurrent.total += lineTotal;
    productCurrent.costo += lineCost;
    productCurrent.margen += lineMargin;
    productMap.set(name, productCurrent);

    const categoryCurrent = categoryMap.get(category) || {
      categoria: category,
      cantidad: 0,
      total: 0,
      costo: 0,
      margen: 0,
    };
    categoryCurrent.cantidad += cantidad;
    categoryCurrent.total += lineTotal;
    categoryCurrent.costo += lineCost;
    categoryCurrent.margen += lineMargin;
    categoryMap.set(category, categoryCurrent);
  });

  const topProductos = Array.from(productMap.values())
    .map((item) => ({
      ...item,
      margenPct: item.total > 0 ? Math.round((item.margen / item.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.cantidad - a.cantidad)
    .slice(0, 8);

  const topCategorias = Array.from(categoryMap.values())
    .map((item) => ({
      ...item,
      margenPct: item.total > 0 ? Math.round((item.margen / item.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.cantidad - a.cantidad)
    .slice(0, 6);

  const productosRentables = Array.from(productMap.values())
    .map((item) => ({
      ...item,
      margenPct: item.total > 0 ? Math.round((item.margen / item.total) * 100) : 0,
    }))
    .sort((a, b) => b.margen - a.margen || b.total - a.total)
    .slice(0, 8);

  const productosBajoMargen = Array.from(productMap.values())
    .map((item) => ({
      ...item,
      margenPct: item.total > 0 ? Math.round((item.margen / item.total) * 100) : 0,
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => a.margenPct - b.margenPct || a.margen - b.margen || b.total - a.total)
    .slice(0, 8);

  return { topProductos, topCategorias, productosRentables, productosBajoMargen, totalCosto };
}

function buildClientAnalytics(rows, desde, hasta) {
  const clientesPeriodo = db
    .prepare(
      `
    SELECT
      COALESCE(cliente_id, 0) AS cliente_id,
      COALESCE(NULLIF(cliente_nombre, ''), 'Consumidor final') AS nombre,
      COALESCE(NULLIF(cliente_telefono, ''), '') AS telefono,
      COUNT(*) AS pedidos,
      COALESCE(SUM(total), 0) AS total
    FROM pedidos
    WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ? AND estado != 'cancelado'
    GROUP BY COALESCE(cliente_id, 0), COALESCE(NULLIF(cliente_nombre, ''), 'Consumidor final'), COALESCE(NULLIF(cliente_telefono, ''), '')
    ORDER BY total DESC, pedidos DESC
    LIMIT 8
  `
    )
    .all(desde, hasta);

  const clientesInactivos = db
    .prepare(
      `
    SELECT
      c.id,
      c.nombre,
      c.telefono,
      c.total_gastado,
      c.total_pedidos,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    GROUP BY c.id
    HAVING ultima_compra = '' OR julianday('now') - julianday(ultima_compra) >= 30
    ORDER BY ultima_compra ASC, c.total_gastado DESC
    LIMIT 8
  `
    )
    .all();

  const activosUnicos = new Set(
    rows
      .map(
        (pedido) =>
          pedido.cliente_id || `${pedido.cliente_nombre || ''}-${pedido.cliente_telefono || ''}`
      )
      .filter(Boolean)
  ).size;

  const clientesBase = db
    .prepare(
      `
    SELECT
      c.id,
      c.nombre,
      c.telefono,
      c.total_gastado,
      c.total_pedidos,
      c.nivel,
      c.fecha_nacimiento,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    GROUP BY c.id
  `
    )
    .all();

  const totalGastadoPromedio = clientesBase.length
    ? clientesBase.reduce((acc, cliente) => acc + Number(cliente.total_gastado || 0), 0) /
      clientesBase.length
    : 0;

  const segmentos = clientesBase.reduce(
    (acc, cliente) => {
      const ultima = cliente.ultima_compra ? new Date(cliente.ultima_compra).getTime() : 0;
      const diasInactivo = ultima ? Math.max(0, Math.floor((Date.now() - ultima) / 86400000)) : 999;
      if (['Oro', 'Platino'].includes(cliente.nivel) || Number(cliente.total_pedidos || 0) >= 10) {
        acc.vip += 1;
      }
      if (diasInactivo >= 30) acc.inactivos += 1;
      if (diasInactivo >= 30 && diasInactivo < 60) acc.riesgo += 1;
      if (diasInactivo >= 60) acc.perdidos += 1;
      if (Number(cliente.total_pedidos || 0) >= 5) acc.recurrentes += 1;
      if (
        Number(cliente.total_gastado || 0) >= totalGastadoPromedio &&
        Number(cliente.total_pedidos || 0) >= 2
      ) {
        acc.altoValor += 1;
      }
      if (
        cliente.fecha_nacimiento &&
        String(cliente.fecha_nacimiento).slice(5, 7) === new Date().toISOString().slice(5, 7)
      ) {
        acc.cumpleMes += 1;
      }
      return acc;
    },
    {
      vip: 0,
      riesgo: 0,
      perdidos: 0,
      inactivos: 0,
      recurrentes: 0,
      altoValor: 0,
      cumpleMes: 0,
    }
  );

  const recompraPct =
    activosUnicos > 0
      ? Math.round(
          (clientesPeriodo.filter((cliente) => Number(cliente.pedidos || 0) >= 2).length /
            activosUnicos) *
            100
        )
      : 0;

  return { topClientes: clientesPeriodo, clientesInactivos, activosUnicos, segmentos, recompraPct };
}

function buildDeliveryAnalytics(rows) {
  const deliveryRows = rows.filter((row) => row.tipo_entrega === 'delivery');
  const tiempos = deliveryRows
    .filter((row) => row.estado === 'entregado')
    .map((row) => diffMinutes(row.creado_en, row.actualizado_en))
    .filter((value) => value !== null);

  const average = tiempos.length
    ? Math.round(tiempos.reduce((acc, value) => acc + value, 0) / tiempos.length)
    : 0;
  const etaDiffs = deliveryRows
    .filter((row) => row.estado === 'entregado' && Number(row.tiempo_estimado_min || 0) > 0)
    .map((row) => {
      const actual = diffMinutes(row.creado_en, row.actualizado_en);
      const estimated = Number(row.tiempo_estimado_min || 0);
      if (actual === null) return null;
      return {
        actual,
        estimated,
        diff: actual - estimated,
      };
    })
    .filter(Boolean);

  const desviacionPromedioEta = etaDiffs.length
    ? Math.round(etaDiffs.reduce((acc, item) => acc + Math.abs(item.diff), 0) / etaDiffs.length)
    : 0;
  const puntualidadPct = etaDiffs.length
    ? Math.round(
        (etaDiffs.filter((item) => item.actual <= item.estimated + 5).length / etaDiffs.length) *
          100
      )
    : 0;

  const riderMap = new Map();
  deliveryRows.forEach((row) => {
    const key = row.repartidor_nombre || 'Sin asignar';
    const current = riderMap.get(key) || {
      nombre: key,
      entregas: 0,
      total: 0,
      tiempos: [],
      etaDiffs: [],
      conFoto: 0,
    };
    current.total += Number(row.total || 0);
    if (row.estado === 'entregado') {
      current.entregas += 1;
      const actual = diffMinutes(row.creado_en, row.actualizado_en);
      if (actual !== null) current.tiempos.push(actual);
      if (Number(row.tiempo_estimado_min || 0) > 0 && actual !== null) {
        current.etaDiffs.push(actual - Number(row.tiempo_estimado_min || 0));
      }
      if (row.entrega_foto) current.conFoto += 1;
    }
    riderMap.set(key, current);
  });

  const ranking = Array.from(riderMap.values())
    .map((item) => {
      const tiempoPromedio = item.tiempos.length
        ? Math.round(item.tiempos.reduce((acc, value) => acc + value, 0) / item.tiempos.length)
        : 0;
      const desviacionEta = item.etaDiffs.length
        ? Math.round(
            item.etaDiffs.reduce((acc, value) => acc + Math.abs(value), 0) / item.etaDiffs.length
          )
        : 0;
      const puntualidad = item.etaDiffs.length
        ? Math.round(
            (item.etaDiffs.filter((value) => value <= 5).length / item.etaDiffs.length) * 100
          )
        : 0;
      const fotoPct = item.entregas ? Math.round((item.conFoto / item.entregas) * 100) : 0;
      return {
        nombre: item.nombre,
        entregas: item.entregas,
        total: item.total,
        ticketPromedio: item.entregas ? Math.round(item.total / item.entregas) : 0,
        tiempoPromedio,
        desviacionEta,
        puntualidadPct: puntualidad,
        fotoPct,
      };
    })
    .sort((a, b) => b.entregas - a.entregas || b.total - a.total)
    .slice(0, 8);

  const byZone = deliveryRows.reduce((acc, row) => {
    const key = row.delivery_zona || 'Sin zona';
    const current = acc.get(key) || { zona: key, pedidos: 0, total: 0, envio: 0, neto: 0 };
    current.pedidos += 1;
    current.total += Number(row.total || 0);
    current.envio += Number(row.costo_envio || 0);
    current.neto += Number(row.total || 0) - Number(row.costo_envio || 0);
    acc.set(key, current);
    return acc;
  }, new Map());

  return {
    ranking,
    tiempoPromedio: average,
    desviacionPromedioEta,
    puntualidadPct,
    totalPedidos: deliveryRows.length,
    totalVentas: deliveryRows.reduce((acc, row) => acc + Number(row.total || 0), 0),
    zonas: Array.from(byZone.values())
      .sort((a, b) => b.total - a.total || b.pedidos - a.pedidos)
      .slice(0, 8),
  };
}

function buildSalonAnalytics(rows) {
  const mesas = rows
    .filter((row) => row.tipo_entrega === 'mesa' && row.mesa)
    .reduce((acc, row) => {
      const key = String(row.mesa);
      const current = acc.get(key) || { mesa: key, pedidos: 0, total: 0 };
      current.pedidos += 1;
      current.total += Number(row.total || 0);
      acc.set(key, current);
      return acc;
    }, new Map());

  const topMesas = Array.from(mesas.values())
    .sort((a, b) => b.total - a.total || b.pedidos - a.pedidos)
    .slice(0, 8);

  const salonRows = rows.filter((row) => row.tipo_entrega === 'mesa');
  const ticketPromedio = salonRows.length
    ? Math.round(salonRows.reduce((acc, row) => acc + Number(row.total || 0), 0) / salonRows.length)
    : 0;

  return {
    topMesas,
    totalPedidos: salonRows.length,
    totalVentas: salonRows.reduce((acc, row) => acc + Number(row.total || 0), 0),
    ticketPromedio,
  };
}

function buildBirthdayAnalytics(desde, hasta) {
  // Collect all unique months covered by the date range
  const months = new Set();
  const d = new Date(desde);
  const h = new Date(hasta);
  const cursor = new Date(d.getFullYear(), d.getMonth(), 1);
  while (cursor <= h) {
    months.add(String(cursor.getMonth() + 1).padStart(2, '0'));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const monthList = Array.from(months);
  if (monthList.length === 0) return [];

  const placeholders = monthList.map(() => '?').join(',');
  return db
    .prepare(
      `
    SELECT id, nombre, telefono, fecha_nacimiento, total_gastado, total_pedidos
    FROM clientes
    WHERE fecha_nacimiento != ''
      AND strftime('%m', fecha_nacimiento) IN (${placeholders})
    ORDER BY strftime('%m-%d', fecha_nacimiento) ASC, total_gastado DESC
    LIMIT 20
  `
    )
    .all(...monthList);
}

function buildTopProductsAllTime(productosPorId, productosPorNombre, limit = 5) {
  const rows = db
    .prepare(
      `
    SELECT
      pi.producto_id,
      pi.nombre,
      MAX(pi.precio_unitario) AS precio,
      COALESCE(SUM(pi.cantidad), 0) AS cantidad,
      COALESCE(SUM(pi.subtotal), 0) AS total
    FROM pedido_items pi
    JOIN pedidos p ON p.id = pi.pedido_id
    WHERE p.estado != 'cancelado'
    GROUP BY COALESCE(CAST(pi.producto_id AS TEXT), lower(trim(pi.nombre)))
    ORDER BY cantidad DESC, total DESC
    LIMIT ?
  `
    )
    .all(limit);

  return rows.map((item) => {
    const productoRelacionado =
      productosPorId.get(String(item.producto_id || '')) ||
      productosPorNombre.get(
        String(item.nombre || '')
          .trim()
          .toLowerCase()
      );
    return {
      id: productoRelacionado?.id || item.producto_id || null,
      nombre: item.nombre || productoRelacionado?.nombre || 'Producto',
      categoria: productoRelacionado?.categoria || 'Otros',
      imagen: productoRelacionado?.imagen || '',
      precio: Number(item.precio || 0),
      cantidad: Number(item.cantidad || 0),
      total: Number(item.total || 0),
    };
  });
}

function buildTopCustomersAllTime(limit = 5) {
  return db
    .prepare(
      `
    SELECT
      c.id,
      c.nombre,
      c.total_pedidos,
      c.total_gastado,
      c.nivel,
      COALESCE(MAX(CASE WHEN p.estado = 'entregado' THEN p.creado_en END), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id
    WHERE c.total_pedidos > 0
    GROUP BY c.id
    ORDER BY c.total_gastado DESC, c.total_pedidos DESC, c.nombre ASC
    LIMIT ?
  `
    )
    .all(limit);
}

router.get('/dashboard', auth, requirePermission('dashboard.view'), (req, res) => {
  const hoy = hoyArgentina();
  const ayer = hoyArgentina(new Date(Date.now() - 86400000));
  const rangoDashboard = parseDashboardRange(req);
  const catalogoProductos = db
    .prepare(
      `
    SELECT p.id, p.nombre, p.imagen, COALESCE(c.nombre, 'Otros') as categoria
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
  `
    )
    .all();
  const productosPorId = new Map(
    catalogoProductos.map((producto) => [String(producto.id), producto])
  );
  const productosPorNombre = new Map(
    catalogoProductos.map((producto) => [
      String(producto.nombre || '')
        .trim()
        .toLowerCase(),
      producto,
    ])
  );

  // Ventas hoy
  const ventasHoy = db
    .prepare(
      `SELECT COUNT(*) as pedidos, COALESCE(SUM(total),0) as total FROM pedidos WHERE ${fechaLocal('creado_en')}=? AND estado!='cancelado'`
    )
    .get(hoy);

  // Ventas ayer para calcular tendencia
  const ventasAyerRow = db
    .prepare(
      `SELECT COUNT(*) as pedidos, COALESCE(SUM(total),0) as total FROM pedidos WHERE ${fechaLocal('creado_en')}=? AND estado!='cancelado'`
    )
    .get(ayer);
  const ventasAyer = ventasAyerRow.total || 0;
  const pedidosAyer = ventasAyerRow.pedidos || 0;

  // Calcular tendencias porcentuales
  const tendenciaVentas =
    ventasAyer > 0 ? Math.round(((ventasHoy.total - ventasAyer) / ventasAyer) * 100) : 0;
  const tendenciaPedidos =
    pedidosAyer > 0 ? Math.round(((ventasHoy.pedidos - pedidosAyer) / pedidosAyer) * 100) : 0;

  const pedidosActivos = db
    .prepare("SELECT COUNT(*) as c FROM pedidos WHERE estado NOT IN ('entregado','cancelado')")
    .get();
  const pedidosEnDelivery = db
    .prepare(
      "SELECT COUNT(*) as c FROM pedidos WHERE tipo_entrega='delivery' AND estado NOT IN ('entregado','cancelado')"
    )
    .get();

  const ventas7diasRows = db
    .prepare(
      `
    SELECT ${fechaLocal('creado_en')} as fecha, COUNT(*) as pedidos, COALESCE(SUM(total),0) as total
    FROM pedidos WHERE ${fechaLocal('creado_en')} >= DATE('now','-3 hours','-6 days') AND estado!='cancelado'
    GROUP BY ${fechaLocal('creado_en')} ORDER BY fecha ASC
  `
    )
    .all();
  const ventas7diasPorFecha = new Map(ventas7diasRows.map((row) => [row.fecha, row]));
  const ventas7dias = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${hoy}T12:00:00-03:00`);
    date.setDate(date.getDate() - (6 - index));
    const fecha = date.toISOString().slice(0, 10);
    return ventas7diasPorFecha.get(fecha) || { fecha, pedidos: 0, total: 0 };
  });

  const pedidosHoyDetallados = db
    .prepare(`SELECT * FROM pedidos WHERE ${fechaLocal('creado_en')}=? AND estado!='cancelado'`)
    .all(hoy);
  const paymentSummaryHoy = summarizePaymentRows(pedidosHoyDetallados);
  const porMetodoPago = paymentSummaryHoy.byMethod;

  // Margen bruto hoy
  const itemsHoy = getPedidoItemRows(pedidosHoyDetallados.map((p) => p.id));
  const costoHoy = itemsHoy.reduce((acc, item) => {
    const prod =
      productosPorId.get(String(item.producto_id || '')) ||
      productosPorNombre.get(
        String(item.nombre || '')
          .trim()
          .toLowerCase()
      );
    const costo = Number(prod?.costo || item.costo || 0);
    return acc + costo * Number(item.cantidad || 1);
  }, 0);
  const margenBrutoHoy = ventasHoy.total - costoHoy;
  const margenPctHoy =
    ventasHoy.total > 0 ? Math.round((margenBrutoHoy / ventasHoy.total) * 100) : 0;

  // Margen bruto ayer (para tendencia)
  const pedidosAyerDetallados = db
    .prepare(`SELECT * FROM pedidos WHERE ${fechaLocal('creado_en')}=? AND estado!='cancelado'`)
    .all(ayer);
  const itemsAyer = getPedidoItemRows(pedidosAyerDetallados.map((p) => p.id));
  const costoAyer = itemsAyer.reduce((acc, item) => {
    const prod =
      productosPorId.get(String(item.producto_id || '')) ||
      productosPorNombre.get(
        String(item.nombre || '')
          .trim()
          .toLowerCase()
      );
    const costo = Number(prod?.costo || item.costo || 0);
    return acc + costo * Number(item.cantidad || 1);
  }, 0);
  const margenAyer = ventasAyer - costoAyer;
  const tendenciaMargen =
    margenAyer > 0 ? Math.round(((margenBrutoHoy - margenAyer) / margenAyer) * 100) : 0;

  const ultimosPedidos = db
    .prepare('SELECT * FROM pedidos ORDER BY creado_en DESC LIMIT 5')
    .all()
    .map(hydratePedido);

  // Productos más vendidos hoy
  const productosVendidos = {};
  getPedidoItemRows(pedidosHoyDetallados.map((pedido) => pedido.id)).forEach((item) => {
    const productoRelacionado =
      productosPorId.get(String(item.producto_id || '')) ||
      productosPorNombre.get(
        String(item.nombre || '')
          .trim()
          .toLowerCase()
      );
    const key = item.producto_id || item.nombre;
    if (!productosVendidos[key]) {
      productosVendidos[key] = {
        id: productoRelacionado?.id || item.producto_id || null,
        nombre: item.nombre || productoRelacionado?.nombre || 'Producto',
        categoria: productoRelacionado?.categoria || item.categoria || 'Otros',
        imagen: productoRelacionado?.imagen || item.imagen || '',
        precio: Number(item.precio_unitario || 0),
        cantidad: 0,
        total: 0,
      };
    }
    productosVendidos[key].cantidad += Number(item.cantidad || 0);
    productosVendidos[key].total += Number(item.subtotal || 0);
  });
  const productosEstrella = Object.values(productosVendidos)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);
  const productosMasVendidosGeneral = buildTopProductsAllTime(
    productosPorId,
    productosPorNombre,
    5
  );

  const clientesVIP = buildVipCustomers(5);
  const clientesMasCompran = buildTopCustomersAllTime(5);
  const stockCritico = buildCriticalStock(10);

  const pedidosPeriodo = db
    .prepare(
      `SELECT id, estado, total, cliente_id, cliente_telefono
       FROM pedidos
       WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ?`
    )
    .all(rangoDashboard.desde, rangoDashboard.hasta);
  const pedidosValidosPeriodo = pedidosPeriodo.filter((pedido) => pedido.estado !== 'cancelado');
  const clientesPeriodo = new Set(
    pedidosValidosPeriodo
      .map((pedido) =>
        pedido.cliente_id
          ? `id:${pedido.cliente_id}`
          : String(pedido.cliente_telefono || '').trim()
            ? `tel:${String(pedido.cliente_telefono).trim()}`
            : null
      )
      .filter(Boolean)
  );
  const estadoOrden = [
    'nuevo',
    'confirmado',
    'preparando',
    'listo',
    'en_camino',
    'entregado',
    'cancelado',
  ];
  const conteoEstados = pedidosPeriodo.reduce((acc, pedido) => {
    const estado = String(pedido.estado || 'nuevo');
    acc[estado] = (acc[estado] || 0) + 1;
    return acc;
  }, {});
  const estadosPeriodo = [
    ...estadoOrden.filter((estado) => conteoEstados[estado] !== undefined),
    ...Object.keys(conteoEstados).filter((estado) => !estadoOrden.includes(estado)),
  ].map((estado) => ({ estado, cantidad: conteoEstados[estado] }));
  const totalPeriodo = pedidosValidosPeriodo.reduce(
    (total, pedido) => total + Number(pedido.total || 0),
    0
  );

  // Estado de caja actual
  const cajaActiva = db
    .prepare("SELECT id, abierta_en, abierta_por_nombre FROM cierres_caja WHERE estado = 'abierta'")
    .get();

  res.json({
    ventasHoy,
    ventasAyer,
    pedidosAyer,
    tendenciaVentas,
    tendenciaPedidos,
    pedidosActivos: pedidosActivos.c,
    pedidosEnDelivery: pedidosEnDelivery.c,
    ventas7dias,
    porMetodoPago,
    ultimosPedidos,
    productosEstrella,
    productosMasVendidosGeneral,
    clientesVIP,
    clientesMasCompran,
    stockCritico,
    cajaEstado: cajaActiva ? { abierta: true, ...cajaActiva } : { abierta: false },
    margenBrutoHoy,
    margenPctHoy,
    tendenciaMargen,
    // El tablero necesita saber si la comparacion de margen es valida.
    // Antes usaba `ventasAyer` como sustituto, asi que un dia con ventas
    // pero sin costos cargados mostraba "0% vs ayer" como si fuera un dato
    // real. Con el margen de ayer explicito puede distinguir "sin datos".
    margenBrutoAyer: margenAyer,
    periodo: {
      ...rangoDashboard,
      pedidos: pedidosValidosPeriodo.length,
      total: totalPeriodo,
      ticketPromedio: pedidosValidosPeriodo.length
        ? Math.round(totalPeriodo / pedidosValidosPeriodo.length)
        : 0,
      clientes: clientesPeriodo.size,
      estados: estadosPeriodo,
    },
  });
});

router.get('/ventas', auth, requirePermission('reportes.view'), (req, res) => {
  const { desde, hasta } = parseDateRange(req);
  const pedidos = db
    .prepare(
      `SELECT * FROM pedidos WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ? AND estado!='cancelado' ORDER BY creado_en DESC`
    )
    .all(desde, hasta)
    .map(hydratePedido);
  const totales = db
    .prepare(
      `SELECT COUNT(*) as cantidad, COALESCE(SUM(total),0) as total FROM pedidos WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ? AND estado!='cancelado'`
    )
    .get(desde, hasta);
  res.json({ pedidos, totales });
});

/**
 * Estado de resultados: si el negocio gana plata o no.
 *
 * ── Lo primero: este reporte puede mentir ──────────────────────────────────
 *
 * Vender no es ganar. La cuenta es:
 *
 *     ventas − costo de lo vendido − gastos = resultado
 *
 * Si no hay costos cargados, el "costo de lo vendido" da cero y el reporte
 * diría que se gana el 100% de lo que se vende. Eso no es un reporte
 * incompleto: es un número que puede hacer tomar una decisión mala —bajar un
 * precio creyendo que hay margen de sobra—.
 *
 * Por eso devuelve **`cobertura`**: cuántos de los productos vendidos tenían
 * costo cargado. Con cobertura baja, la pantalla tiene que decir que el
 * resultado no es confiable en vez de mostrar un número lindo.
 *
 * ── De dónde sale cada cosa ────────────────────────────────────────────────
 *
 * · Ventas: `pedidos.total` de los no cancelados.
 * · Costo: `productos.costo` × cantidad vendida. Si un producto no tiene costo,
 *   suma cero y se cuenta como "sin cubrir".
 * · Gastos: los egresos manuales de caja.
 * · Mermas: la plata tirada, que es un costo real y hasta ahora no figuraba en
 *   ningún lado.
 *
 * Las propinas quedan afuera a propósito: no son ingreso del local.
 */
router.get('/resultados', auth, requirePermission('reportes.view'), (req, res) => {
  const { desde, hasta } = parseDateRange(req);

  const ventas = db
    .prepare(
      `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total), 0) AS total
         FROM pedidos
        WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ? AND estado != 'cancelado'`
    )
    .get(desde, hasta);

  /*
    El costo de lo vendido, ítem por ítem. Se mira `productos.costo` y no la
    receta: la receta da el costo teórico y `costo` es el que el dueño cargó.
    Cuando no hay ninguno de los dos, el ítem queda sin cubrir y se dice.
  */
  const items = db
    .prepare(
      `SELECT pi.cantidad, pi.subtotal, COALESCE(p.costo, 0) AS costo, p.nombre
         FROM pedido_items pi
         JOIN pedidos ped ON ped.id = pi.pedido_id
         LEFT JOIN productos p ON p.id = pi.producto_id
        WHERE ${fechaLocal('ped.creado_en')} BETWEEN ? AND ? AND ped.estado != 'cancelado'`
    )
    .all(desde, hasta);

  let costoVendido = 0;
  let itemsConCosto = 0;
  let ventasCubiertas = 0;
  let ventasSinCubrir = 0;
  const sinCosto = new Map();

  for (const item of items) {
    const costo = Number(item.costo || 0);
    const subtotal = Number(item.subtotal || 0);
    if (costo > 0) {
      costoVendido += costo * Number(item.cantidad || 0);
      itemsConCosto += 1;
      ventasCubiertas += subtotal;
    } else {
      ventasSinCubrir += subtotal;
      const nombre = item.nombre || 'Producto borrado';
      sinCosto.set(nombre, (sinCosto.get(nombre) || 0) + subtotal);
    }
  }

  const gastos = db
    .prepare(
      `SELECT COALESCE(SUM(monto), 0) AS total
         FROM caja_movimientos
        WHERE tipo = 'salida' AND ${fechaLocal('creado_en')} BETWEEN ? AND ?`
    )
    .get(desde, hasta);

  const mermas = db
    .prepare(
      `SELECT detalle FROM inventario_movimientos
        WHERE tipo = 'merma' AND ${fechaLocal('creado_en')} BETWEEN ? AND ?`
    )
    .all(desde, hasta)
    .reduce((acc, fila) => {
      try {
        return acc + Number(JSON.parse(fila.detalle || '{}')?.costo_perdido || 0);
      } catch {
        return acc;
      }
    }, 0);

  const totalVentas = Number(ventas.total || 0);
  const totalGastos = Number(gastos.total || 0);
  const resultado = totalVentas - costoVendido - totalGastos - mermas;

  /*
    Qué porcentaje de lo vendido tiene costo conocido. Es el número que decide
    si el resultado de arriba se puede creer.
  */
  const cobertura = totalVentas > 0 ? Math.round((ventasCubiertas / totalVentas) * 100) : 0;

  res.json({
    desde,
    hasta,
    ventas: totalVentas,
    pedidos: Number(ventas.pedidos || 0),
    costo_vendido: costoVendido,
    gastos: totalGastos,
    mermas,
    resultado,
    margen_porcentaje: totalVentas > 0 ? Math.round((resultado / totalVentas) * 100) : 0,
    cobertura: {
      porcentaje: cobertura,
      // Con cobertura baja el resultado infla la ganancia: los productos sin
      // costo aportan venta y cero costo.
      confiable: cobertura >= 80,
      ventas_cubiertas: ventasCubiertas,
      ventas_sin_cubrir: ventasSinCubrir,
      items_con_costo: itemsConCosto,
      items_totales: items.length,
      // Los que más plata mueven sin tener costo: es la lista de qué cargar
      // primero para que este reporte empiece a servir.
      productos_sin_costo: Array.from(sinCosto.entries())
        .map(([nombre, venta]) => ({ nombre, venta }))
        .sort((a, b) => b.venta - a.venta)
        .slice(0, 15),
    },
  });
});

router.get('/premium', auth, requirePermission('reportes.view'), (req, res) => {
  const { desde, hasta } = parseDateRange(req);
  const config = getConfigMap();

  const rows = db
    .prepare(
      `
    SELECT *
    FROM pedidos
    WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ?
    ORDER BY datetime(creado_en) DESC
  `
    )
    .all(desde, hasta);

  const validRows = rows.filter((row) => row.estado !== 'cancelado');
  const entregados = validRows.filter((row) => row.estado === 'entregado');
  const cancelados = rows.filter((row) => row.estado === 'cancelado').length;

  const totalVentas = validRows.reduce((acc, row) => acc + Number(row.total || 0), 0);
  const cantidadPedidos = validRows.length;
  const ticketPromedio = cantidadPedidos ? Math.round(totalVentas / cantidadPedidos) : 0;
  const leadTimes = entregados
    .map((row) => diffMinutes(row.creado_en, row.actualizado_en))
    .filter((value) => value !== null);
  const tiempoPromedio = leadTimes.length
    ? Math.round(leadTimes.reduce((acc, value) => acc + value, 0) / leadTimes.length)
    : 0;

  const paymentSummary = summarizePaymentRows(validRows);
  const paymentMethods = paymentSummary.byMethod;

  const deliveryCount = validRows.filter((row) => row.tipo_entrega === 'delivery').length;
  const retiroCount = validRows.filter((row) => row.tipo_entrega === 'retiro').length;
  const mesaCount = validRows.filter((row) => row.tipo_entrega === 'mesa').length;
  const origins = validRows.reduce((acc, row) => {
    const key = row.origen || 'sin_origen';
    const current = acc.get(key) || { origen: key, pedidos: 0, total: 0 };
    current.pedidos += 1;
    current.total += Number(row.total || 0);
    acc.set(key, current);
    return acc;
  }, new Map());

  const productos = buildProductAnalytics(validRows);
  const totalCosto = productos.totalCosto || 0;
  const margenBruto = totalVentas - totalCosto;
  const margenPct = totalVentas > 0 ? Math.round((margenBruto / totalVentas) * 100) : 0;
  const clientes = buildClientAnalytics(validRows, desde, hasta);
  const delivery = buildDeliveryAnalytics(validRows, desde, hasta);
  const salon = buildSalonAnalytics(validRows);
  const cumpleMes = buildBirthdayAnalytics(desde, hasta);
  const vipCustomers = buildVipCustomers(6);
  const stockCritico = buildCriticalStock(8);

  res.json({
    rango: { desde, hasta },
    resumen: {
      totalVentas,
      totalCosto,
      margenBruto,
      margenPct,
      cantidadPedidos,
      ticketPromedio,
      totalCobrado: paymentSummary.totalCobrado,
      totalPendienteCobro: paymentSummary.totalPendiente,
      entregados: entregados.length,
      cancelados,
      tiempoPromedio,
      deliveryCount,
      retiroCount,
      mesaCount,
      clientesActivos: clientes.activosUnicos,
    },
    series: {
      ventasPorDia: groupByDay(validRows, desde, hasta),
      ventasPorHora: groupByHour(validRows),
      ventasPorTurno: groupByShift(validRows, config),
      ventasPorOrigen: Array.from(origins.values()).sort(
        (a, b) => b.total - a.total || b.pedidos - a.pedidos
      ),
    },
    products: productos,
    clients: {
      ...clientes,
      cumpleMes,
    },
    highlights: {
      vipCustomers,
      stockCritico,
    },
    delivery,
    salon,
    paymentMethods,
    recentOrders: validRows.map(hydratePedido),
  });
});

module.exports = router;
