const db = require('../db');
const { fechaLocal } = require('../utils/fechaLocal');
const { buildCajaResumen } = require('../routes/caja');
const { buildMenuDiaManagerPayload } = require('../routes/operacion');
const { normalizePagoEstado, normalizeMetodoPago } = require('../utils/paymentStatus');
const { envolverDato, envolverDatoInline } = require('../utils/sanitizarPrompt');

/**
 * Lo que el asistente puede consultar.
 *
 * ── Todas leen, ninguna escribe ────────────────────────────────────────────
 *
 * Es a propósito y es la garantía principal de esta primera versión: por más
 * que alguien logre confundir al modelo, no hay ninguna herramienta acá que
 * pueda cambiar un precio, borrar un pedido ni tocar el stock. El daño máximo
 * posible es que conteste una pregunta que no le hiciste.
 *
 * Cuando se agreguen herramientas que escriben, no van a vivir en este
 * archivo: van a ir en uno aparte, con confirmación obligatoria del usuario.
 * Mantener la separación física hace difícil equivocarse.
 *
 * ── La plata ───────────────────────────────────────────────────────────────
 *
 * La base guarda todo en centavos. El middleware de respuesta divide por 100
 * antes de mandar algo al navegador, pero acá el resultado no pasa por ese
 * middleware: se convierte en texto y se le da al modelo. Así que la división
 * hay que hacerla a mano, en cada consulta. Si se olvida, el asistente contesta
 * cifras cien veces más grandes con total seguridad.
 *
 * ── Las fechas ─────────────────────────────────────────────────────────────
 *
 * SQLite guarda en UTC. Agrupar por día sin corregir mete las ventas de después
 * de las 21:00 en el día siguiente. `fechaLocal()` aplica el desfase argentino.
 */

const CENTAVOS = 100;

function aPesos(centavos) {
  return Math.round(Number(centavos || 0)) / CENTAVOS;
}

/*
  Sólo estos estados cuentan como venta.

  Un pedido cancelado sigue en la tabla con su total intacto. Sumarlo daría
  cifras infladas y el asistente las diría sin dudar, que es peor que no
  contestar.
*/
const FILTRO_VENTA = `estado NOT IN ('cancelado', 'rechazado')`;

/**
 * Convierte una descripción de período en un rango de fechas locales.
 * Se acepta un rango explícito porque el modelo a veces ya lo calculó.
 */
function resolverRango({ desde, hasta, periodo } = {}) {
  const hoy = new Date();
  // Se trabaja en horario argentino, no en el del servidor (que en Railway
  // corre en UTC): si no, después de las 21:00 "hoy" sería mañana.
  const local = new Date(hoy.getTime() - 3 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);
  const menosDias = (n) => {
    const d = new Date(local);
    d.setUTCDate(d.getUTCDate() - n);
    return iso(d);
  };

  if (desde || hasta) {
    return { desde: desde || menosDias(30), hasta: hasta || iso(local) };
  }

  switch (String(periodo || 'hoy').toLowerCase()) {
    case 'ayer':
      return { desde: menosDias(1), hasta: menosDias(1) };
    case 'semana':
      return { desde: menosDias(6), hasta: iso(local) };
    case 'mes':
      return { desde: menosDias(29), hasta: iso(local) };
    default:
      return { desde: iso(local), hasta: iso(local) };
  }
}

// ── Herramientas existentes ────────────────────────────────────────────────

function ventasDelPeriodo(args = {}) {
  const { desde, hasta } = resolverRango(args);
  const fila = db
    .prepare(
      `SELECT COUNT(*) AS cantidad,
              COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(costo_envio), 0) AS envios
         FROM pedidos
        WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ?
          AND ${FILTRO_VENTA}`
    )
    .get(desde, hasta);

  const porMetodo = db
    .prepare(
      `SELECT COALESCE(metodo_pago, 'sin especificar') AS metodo,
              COUNT(*) AS cantidad,
              COALESCE(SUM(total), 0) AS total
         FROM pedidos
        WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ?
          AND ${FILTRO_VENTA}
        GROUP BY metodo
        ORDER BY total DESC`
    )
    .all(desde, hasta);

  const cantidad = fila.cantidad || 0;
  return {
    desde,
    hasta,
    pedidos: cantidad,
    total_pesos: aPesos(fila.total),
    envios_pesos: aPesos(fila.envios),
    ticket_promedio_pesos: cantidad ? aPesos(fila.total / cantidad) : 0,
    por_metodo_de_pago: porMetodo.map((m) => ({
      metodo: m.metodo,
      pedidos: m.cantidad,
      total_pesos: aPesos(m.total),
    })),
  };
}

function ventasPorDia(args = {}) {
  const { desde, hasta } = resolverRango({ periodo: 'semana', ...args });
  const filas = db
    .prepare(
      `SELECT ${fechaLocal('creado_en')} AS dia,
              COUNT(*) AS cantidad,
              COALESCE(SUM(total), 0) AS total
         FROM pedidos
        WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ?
          AND ${FILTRO_VENTA}
        GROUP BY dia
        ORDER BY dia`
    )
    .all(desde, hasta);

  return {
    desde,
    hasta,
    dias: filas.map((f) => ({
      fecha: f.dia,
      pedidos: f.cantidad,
      total_pesos: aPesos(f.total),
    })),
  };
}

function productosMasVendidos(args = {}) {
  const { desde, hasta } = resolverRango({ periodo: 'mes', ...args });
  const limite = Math.min(Math.max(Number(args.limite) || 10, 1), 30);

  const filas = db
    .prepare(
      `SELECT i.nombre,
              SUM(i.cantidad) AS unidades,
              COALESCE(SUM(i.subtotal), 0) AS total
         FROM pedido_items i
         JOIN pedidos p ON p.id = i.pedido_id
        WHERE ${fechaLocal('p.creado_en')} BETWEEN ? AND ?
          AND p.${FILTRO_VENTA}
        GROUP BY i.nombre
        ORDER BY unidades DESC
        LIMIT ?`
    )
    .all(desde, hasta, limite);

  return {
    desde,
    hasta,
    productos: filas.map((f) => ({
      nombre: f.nombre,
      unidades: f.unidades,
      total_pesos: aPesos(f.total),
    })),
  };
}

function stockBajo() {
  const filas = db
    .prepare(
      `SELECT nombre, rubro, unidad, stock_actual, stock_minimo
         FROM inventario_insumos
        WHERE activo = 1
          AND stock_minimo > 0
          AND stock_actual <= stock_minimo
        ORDER BY (stock_actual * 1.0 / NULLIF(stock_minimo, 0)) ASC`
    )
    .all();

  return {
    cantidad: filas.length,
    insumos: filas.map((f) => ({
      nombre: f.nombre,
      rubro: f.rubro,
      stock_actual: f.stock_actual,
      stock_minimo: f.stock_minimo,
      unidad: f.unidad,
    })),
  };
}

function menuDelDiaActual(args = {}) {
  const termino = String(args.plato || '')
    .trim()
    .toLowerCase();
  const data = buildMenuDiaManagerPayload();
  const items = data.items
    .filter(
      (item) =>
        !termino ||
        String(item.nombre || '')
          .toLowerCase()
          .includes(termino)
    )
    .map((item) => ({
      id: Number(item.id),
      nombre: item.nombre,
      activo_en_biblioteca: Number(item.activo) === 1,
      activo_hoy: Number(item.disponible_hoy) === 1,
      precio_pesos: aPesos(item.precio_hoy),
      stock_hoy: Number(item.stock_hoy || 0),
      tipo: item.tipo_hoy,
      descripcion: envolverDatoInline(item.descripcion_hoy || ''),
      guarniciones: item.guarniciones_hoy || [],
      ofrece_postre: Number(item.ofrece_postre_hoy) === 1,
      ofrece_bebida_postre: Number(item.ofrece_bebida_postre_hoy) === 1,
      destacado: Number(item.destacado_hoy) === 1,
      tiempo_preparacion_min: Number(item.tiempo_preparacion || 0),
    }));
  return { fecha: data.fecha, cantidad: items.length, platos: items };
}

function pedidosEnCurso() {
  const filas = db
    .prepare(
      `SELECT numero, estado, tipo_entrega, cliente_nombre, repartidor_nombre,
              total, creado_en
         FROM pedidos
        WHERE estado IN ('pendiente', 'preparando', 'listo', 'en_camino')
        ORDER BY creado_en ASC
        LIMIT 40`
    )
    .all();

  return {
    cantidad: filas.length,
    pedidos: filas.map((f) => ({
      numero: f.numero,
      estado: f.estado,
      entrega: f.tipo_entrega,
      cliente: envolverDatoInline(f.cliente_nombre),
      repartidor: envolverDatoInline(f.repartidor_nombre),
      total_pesos: aPesos(f.total),
      creado_en: f.creado_en,
    })),
  };
}

function resumenPorRepartidor(args = {}) {
  const { desde, hasta } = resolverRango(args);
  const filas = db
    .prepare(
      `SELECT COALESCE(repartidor_nombre, 'sin asignar') AS repartidor,
              COUNT(*) AS entregas,
              COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN total ELSE 0 END), 0) AS efectivo
         FROM pedidos
        WHERE ${fechaLocal('creado_en')} BETWEEN ? AND ?
          AND tipo_entrega = 'delivery'
          AND ${FILTRO_VENTA}
        GROUP BY repartidor
        ORDER BY entregas DESC`
    )
    .all(desde, hasta);

  return {
    desde,
    hasta,
    repartidores: filas.map((f) => ({
      repartidor: envolverDatoInline(f.repartidor),
      entregas: f.entregas,
      total_pesos: aPesos(f.total),
      efectivo_a_rendir_pesos: aPesos(f.efectivo),
    })),
  };
}

function estadoDeCaja() {
  const caja = db
    .prepare(`SELECT * FROM cierres_caja WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1`)
    .get();

  if (!caja) return { abierta: false, mensaje: 'No hay ninguna caja abierta en este momento.' };

  const movimientos = db
    .prepare(
      `SELECT tipo, COALESCE(SUM(monto), 0) AS total
         FROM caja_movimientos
        WHERE cierre_id = ?
        GROUP BY tipo`
    )
    .all(caja.id);

  return {
    abierta: true,
    abierta_en: caja.abierta_en,
    abierta_por: caja.abierta_por_nombre,
    monto_inicial_pesos: aPesos(caja.monto_inicial),
    movimientos: movimientos.map((m) => ({ tipo: m.tipo, total_pesos: aPesos(m.total) })),
  };
}

function revisionDeCaja() {
  const caja = db
    .prepare(`SELECT * FROM cierres_caja WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1`)
    .get();

  if (!caja) {
    return { abierta: false, mensaje: 'No hay ninguna caja abierta para revisar.' };
  }

  const resumen = buildCajaResumen(caja.abierta_en, null, caja.id);
  const esperado = Number(caja.monto_inicial || 0) + Number(resumen.efectivoNeto || 0);

  const pedidos = db
    .prepare(
      `SELECT numero, estado, metodo_pago, pago_estado, total, origen, cliente_nombre,
              repartidor_nombre, creado_en
         FROM pedidos
        WHERE datetime(creado_en) >= datetime(?)`
    )
    .all(caja.abierta_en);

  const problemas = [];
  pedidos.forEach((p) => {
    const metodo = normalizeMetodoPago(p.metodo_pago);
    const pago = normalizePagoEstado(p.pago_estado, { metodoPago: metodo, origen: p.origen });
    const base = {
      pedido: p.numero,
      cliente: envolverDatoInline(p.cliente_nombre),
      repartidor: envolverDatoInline(p.repartidor_nombre),
      total_pesos: aPesos(p.total),
    };

    if (p.estado === 'cancelado' && pago === 'pagado') {
      problemas.push({ ...base, problema: 'Está cancelado pero figura cobrado.' });
      return;
    }
    if (p.estado === 'cancelado') return;

    if (!String(p.metodo_pago || '').trim()) {
      problemas.push({ ...base, problema: 'No tiene método de pago cargado.' });
      return;
    }
    if (p.estado === 'entregado' && pago !== 'pagado') {
      problemas.push({ ...base, problema: 'Se entregó pero figura sin cobrar.' });
    }
  });

  return {
    abierta: true,
    abierta_en: caja.abierta_en,
    monto_inicial_pesos: aPesos(caja.monto_inicial),
    ventas_pesos: aPesos(resumen.totalVentas),
    efectivo_de_ventas_pesos: aPesos(resumen.efectivoVentas),
    efectivo_esperado_pesos: aPesos(esperado),
    pedidos_con_problemas: problemas,
    total_en_problemas_pesos: problemas.reduce((s, p) => s + p.total_pesos, 0),
  };
}

function clientesHabituales(args = {}) {
  const limite = Math.min(Math.max(Number(args.limite) || 10, 1), 30);
  const filas = db
    .prepare(
      `SELECT nombre, total_pedidos, total_gastado
         FROM clientes
        WHERE total_pedidos > 0
        ORDER BY total_pedidos DESC
        LIMIT ?`
    )
    .all(limite);

  return {
    clientes: filas.map((f) => ({
      nombre: envolverDatoInline(f.nombre),
      pedidos: f.total_pedidos,
      gastado_pesos: aPesos(f.total_gastado),
    })),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// DIAGNÓSTICOS AUTOMÁTICOS (nuevos)
// ═════════════════════════════════════════════════════════════════════════════

function pedidosColgados(args = {}) {
  const horas = Math.min(Math.max(Number(args.horas) || 2, 1), 48);
  const limite = Math.min(Math.max(Number(args.limite) || 20, 1), 50);

  const filas = db
    .prepare(
      `SELECT numero, estado, tipo_entrega, cliente_nombre, repartidor_nombre,
              total, creado_en,
              ROUND((julianday('now') - julianday(creado_en)) * 24, 1) AS horas_pasadas
         FROM pedidos
        WHERE estado IN ('pendiente', 'preparando', 'listo', 'en_camino')
          AND creado_en < datetime('now', ?)
        ORDER BY creado_en ASC
        LIMIT ?`
    )
    .all(`-${horas} hours`, limite);

  return {
    horas_umbral: horas,
    cantidad: filas.length,
    pedidos: filas.map((f) => ({
      numero: f.numero,
      estado: f.estado,
      entrega: f.tipo_entrega,
      cliente: envolverDatoInline(f.cliente_nombre),
      repartidor: envolverDatoInline(f.repartidor_nombre),
      total_pesos: aPesos(f.total),
      horas_pasadas: f.horas_pasadas,
      creado_en: f.creado_en,
    })),
  };
}

function stockNegativo() {
  const filas = db
    .prepare(
      `SELECT nombre, rubro, unidad, stock_actual, stock_minimo
         FROM inventario_insumos
        WHERE activo = 1 AND stock_actual < 0
        ORDER BY stock_actual ASC`
    )
    .all();

  return {
    cantidad: filas.length,
    insumos: filas.map((f) => ({
      nombre: f.nombre,
      rubro: f.rubro,
      stock_actual: f.stock_actual,
      stock_minimo: f.stock_minimo,
      unidad: f.unidad,
    })),
  };
}

function productosSinPrecio() {
  const filas = db
    .prepare(
      `SELECT p.id, p.nombre, c.nombre AS categoria_nombre, p.precio
         FROM productos p
         LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE p.activo = 1 AND (p.precio IS NULL OR p.precio <= 0)
        ORDER BY p.nombre`
    )
    .all();

  return {
    cantidad: filas.length,
    productos: filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      categoria: f.categoria_nombre,
      precio: aPesos(f.precio),
    })),
  };
}

function deliverysSinRepartidor() {
  const filas = db
    .prepare(
      `SELECT numero, estado, cliente_nombre, cliente_direccion, total, creado_en
         FROM pedidos
        WHERE tipo_entrega = 'delivery'
          AND estado IN ('pendiente', 'preparando', 'listo')
          AND (repartidor_id IS NULL OR repartidor_id = '')
        ORDER BY creado_en ASC
        LIMIT 30`
    )
    .all();

  return {
    cantidad: filas.length,
    pedidos: filas.map((f) => ({
      numero: f.numero,
      estado: f.estado,
      cliente: envolverDatoInline(f.cliente_nombre),
      total_pesos: aPesos(f.total),
      creado_en: f.creado_en,
    })),
  };
}

function clientesDuplicados() {
  const filas = db
    .prepare(
      `SELECT telefono,
              COUNT(*) AS total,
              GROUP_CONCAT(nombre, ' | ') AS nombres
         FROM clientes
        WHERE telefono IS NOT NULL AND TRIM(telefono) != ''
        GROUP BY telefono
        HAVING COUNT(*) > 1
        ORDER BY total DESC
        LIMIT 20`
    )
    .all();

  return {
    cantidad: filas.length,
    duplicados: filas.map((f) => ({
      telefono_termina_en: String(f.telefono || '')
        .replace(/\D/g, '')
        .slice(-4),
      cantidad: f.total,
    })),
  };
}

function insumosSinMovimientos(args = {}) {
  const dias = Math.min(Math.max(Number(args.dias) || 30, 7), 365);
  const filas = db
    .prepare(
      `SELECT i.nombre, i.rubro, i.stock_actual, i.unidad,
              MAX(m.creado_en) AS ultimo_movimiento
         FROM inventario_insumos i
         LEFT JOIN inventario_movimientos m ON m.insumo_id = i.id
        WHERE i.activo = 1
        GROUP BY i.id
        HAVING ultimo_movimiento IS NULL
           OR ultimo_movimiento < datetime('now', ?)
        ORDER BY ultimo_movimiento ASC NULLS FIRST
        LIMIT 30`
    )
    .all(`-${dias} days`);

  return {
    dias_umbral: dias,
    cantidad: filas.length,
    insumos: filas.map((f) => ({
      nombre: f.nombre,
      rubro: f.rubro,
      stock_actual: f.stock_actual,
      unidad: f.unidad,
      ultimo_movimiento: f.ultimo_movimiento || 'Nunca',
    })),
  };
}

function revisionAutomatica() {
  const resultados = {
    stock_bajo: stockBajo(),
    stock_negativo: stockNegativo(),
    pedidos_colgados: pedidosColgados({ horas: 2 }),
    pedidos_en_curso: pedidosEnCurso(),
    deliverys_sin_repartidor: deliverysSinRepartidor(),
    productos_sin_precio: productosSinPrecio(),
    clientes_duplicados: clientesDuplicados(),
    insumos_sin_movimientos: insumosSinMovimientos({ dias: 30 }),
  };

  const problemas = [];
  if (resultados.stock_negativo.cantidad > 0) {
    problemas.push({
      severidad: 'critico',
      modulo: 'inventario',
      mensaje: `${resultados.stock_negativo.cantidad} insumo(s) con stock negativo`,
    });
  }
  if (resultados.stock_bajo.cantidad > 0) {
    problemas.push({
      severidad: 'advertencia',
      modulo: 'inventario',
      mensaje: `${resultados.stock_bajo.cantidad} insumo(s) con stock bajo`,
    });
  }
  if (resultados.pedidos_colgados.cantidad > 0) {
    problemas.push({
      severidad: 'critico',
      modulo: 'pedidos',
      mensaje: `${resultados.pedidos_colgados.cantidad} pedido(s) colgado(s) hace más de 2 horas`,
    });
  }
  if (resultados.deliverys_sin_repartidor.cantidad > 0) {
    problemas.push({
      severidad: 'advertencia',
      modulo: 'delivery',
      mensaje: `${resultados.deliverys_sin_repartidor.cantidad} delivery(s) sin repartidor asignado`,
    });
  }
  if (resultados.productos_sin_precio.cantidad > 0) {
    problemas.push({
      severidad: 'advertencia',
      modulo: 'productos',
      mensaje: `${resultados.productos_sin_precio.cantidad} producto(s) sin precio`,
    });
  }
  if (resultados.clientes_duplicados.cantidad > 0) {
    problemas.push({
      severidad: 'info',
      modulo: 'clientes',
      mensaje: `${resultados.clientes_duplicados.cantidad} teléfono(s) duplicado(s)`,
    });
  }

  return {
    problemas_detectados: problemas.length,
    severidad: problemas.some((p) => p.severidad === 'critico')
      ? 'critico'
      : problemas.some((p) => p.severidad === 'advertencia')
        ? 'advertencia'
        : 'ok',
    problemas,
    detalle: resultados,
  };
}

// ── El catálogo ────────────────────────────────────────────────────────────

const PERIODO = {
  type: 'string',
  enum: ['hoy', 'ayer', 'semana', 'mes'],
  description: 'Período a consultar. "semana" y "mes" son los últimos 7 y 30 días.',
};
const RANGO = {
  desde: { type: 'string', description: 'Fecha inicial en formato AAAA-MM-DD.' },
  hasta: { type: 'string', description: 'Fecha final en formato AAAA-MM-DD.' },
};

const HERRAMIENTAS = [
  {
    nombre: 'ventas_del_periodo',
    descripcion:
      'Total vendido, cantidad de pedidos, ticket promedio y desglose por método de pago. Los montos vienen en pesos. Excluye pedidos cancelados.',
    parametros: { type: 'object', properties: { periodo: PERIODO, ...RANGO } },
    ejecutar: ventasDelPeriodo,
  },
  {
    nombre: 'ventas_por_dia',
    descripcion: 'Ventas día por día, para comparar jornadas o ver una tendencia. Montos en pesos.',
    parametros: { type: 'object', properties: { periodo: PERIODO, ...RANGO } },
    ejecutar: ventasPorDia,
  },
  {
    nombre: 'productos_mas_vendidos',
    descripcion:
      'Ranking de productos por unidades vendidas en un período, con lo facturado por cada uno en pesos.',
    parametros: {
      type: 'object',
      properties: {
        periodo: PERIODO,
        ...RANGO,
        limite: { type: 'integer', description: 'Cuántos productos traer (máximo 30).' },
      },
    },
    ejecutar: productosMasVendidos,
  },
  {
    nombre: 'stock_bajo',
    descripcion:
      'Insumos cuyo stock actual está en o por debajo del mínimo configurado. Las cantidades son unidades de inventario, no pesos.',
    parametros: { type: 'object', properties: {} },
    ejecutar: stockBajo,
  },
  {
    nombre: 'consultar_menu_del_dia',
    descripcion:
      'Biblioteca y menú actual: platos, si están activos hoy, precio, stock, descripción, tipo, guarniciones, extras, destacado y tiempo de preparación. Usala antes de editar, activar, desactivar o archivar un plato.',
    parametros: {
      type: 'object',
      properties: {
        plato: { type: 'string', description: 'Nombre opcional para buscar un plato.' },
      },
    },
    ejecutar: menuDelDiaActual,
  },
  {
    nombre: 'pedidos_en_curso',
    descripcion:
      'Pedidos que todavía no se entregaron: pendientes, en preparación, listos o en camino.',
    parametros: { type: 'object', properties: {} },
    ejecutar: pedidosEnCurso,
  },
  {
    nombre: 'resumen_por_repartidor',
    descripcion:
      'Entregas por repartidor en un período, con el efectivo que cada uno tendría que rendir. Montos en pesos.',
    parametros: { type: 'object', properties: { periodo: PERIODO, ...RANGO } },
    ejecutar: resumenPorRepartidor,
  },
  {
    nombre: 'estado_de_caja',
    descripcion:
      'Si hay una caja abierta, desde cuándo, quién la abrió, el monto inicial y los movimientos registrados. Montos en pesos.',
    parametros: { type: 'object', properties: {} },
    ejecutar: estadoDeCaja,
  },
  {
    nombre: 'revision_de_caja',
    descripcion:
      'Revisa la caja abierta: cuánto efectivo debería haber, y qué pedidos puntuales no cuadran (entregados sin cobrar, sin método de pago, o cobrados y después cancelados). Usala cuando pregunten por el cierre, el arqueo o por qué no cuadra la caja.',
    parametros: { type: 'object', properties: {} },
    ejecutar: revisionDeCaja,
  },
  {
    nombre: 'clientes_habituales',
    descripcion: 'Clientes ordenados por cantidad de pedidos, con lo que gastaron en pesos.',
    parametros: {
      type: 'object',
      properties: { limite: { type: 'integer', description: 'Cuántos traer (máximo 30).' } },
    },
    ejecutar: clientesHabituales,
  },
  // ── Diagnósticos automáticos (nuevos) ────────────────────────────────────
  {
    nombre: 'pedidos_colgados',
    descripcion:
      'Pedidos que llevan mucho tiempo en curso sin entregarse. Por defecto detecta los de más de 2 horas. Usala cuando pregunten por pedidos atrasados o colgados.',
    parametros: {
      type: 'object',
      properties: {
        horas: {
          type: 'integer',
          description: 'Cuántas horas de demora para considerar colgado (default 2, máx 48).',
        },
        limite: {
          type: 'integer',
          description: 'Máximo de pedidos a devolver (default 20, máx 50).',
        },
      },
    },
    ejecutar: pedidosColgados,
  },
  {
    nombre: 'stock_negativo',
    descripcion:
      'Insumos con stock negativo. Esto es un problema grave porque indica errores de conteo o descuentos mal aplicados.',
    parametros: { type: 'object', properties: {} },
    ejecutar: stockNegativo,
  },
  {
    nombre: 'productos_sin_precio',
    descripcion:
      'Productos activos que no tienen precio o tienen precio cero. Estos productos no se pueden vender.',
    parametros: { type: 'object', properties: {} },
    ejecutar: productosSinPrecio,
  },
  {
    nombre: 'deliverys_sin_repartidor',
    descripcion:
      'Pedidos de delivery pendientes que no tienen repartidor asignado. Se van a enfriar si nadie los lleva.',
    parametros: { type: 'object', properties: {} },
    ejecutar: deliverysSinRepartidor,
  },
  {
    nombre: 'clientes_duplicados',
    descripcion:
      'Teléfonos de clientes que aparecen más de una vez en la base. Pueden ser el mismo cliente cargado varias veces.',
    parametros: { type: 'object', properties: {} },
    ejecutar: clientesDuplicados,
  },
  {
    nombre: 'insumos_sin_movimientos',
    descripcion:
      'Insumos que no tuvieron movimientos de stock en los últimos días. Pueden ser insumos que ya no se usan o que se olvidó cargar.',
    parametros: {
      type: 'object',
      properties: {
        dias: {
          type: 'integer',
          description: 'Cuántos días sin movimientos (default 30, mín 7, máx 365).',
        },
      },
    },
    ejecutar: insumosSinMovimientos,
  },
  {
    nombre: 'revision_automatica',
    descripcion:
      'Revisa todo el sistema de una sola vez: stock bajo, stock negativo, pedidos colgados, deliverys sin repartidor, productos sin precio, clientes duplicados e insumos sin movimientos. Devuelve un resumen con severidad (ok, advertencia o crítico). Usala cuando el usuario diga "revisá el sistema", "qué está mal" o "hacé un diagnóstico".',
    parametros: { type: 'object', properties: {} },
    ejecutar: revisionAutomatica,
  },
];

/** Definiciones para el modelo, sin la implementación. */
function catalogoParaModelo() {
  return HERRAMIENTAS.map(({ nombre, descripcion, parametros }) => ({
    nombre,
    descripcion,
    parametros,
  }));
}

/**
 * Corre una herramienta por nombre.
 *
 * Si el modelo inventa un nombre o los argumentos rompen la consulta, se
 * devuelve el problema como resultado en vez de tirar una excepción: así el
 * modelo puede corregir y reintentar, en lugar de cortar toda la conversación.
 */
function ejecutarHerramienta(nombre, argumentos = {}) {
  const herramienta = HERRAMIENTAS.find((h) => h.nombre === nombre);
  if (!herramienta) return { error: `No existe la herramienta "${nombre}".` };
  try {
    return herramienta.ejecutar(argumentos || {});
  } catch (error) {
    return { error: `La consulta falló: ${String(error?.message || error).slice(0, 200)}` };
  }
}

module.exports = {
  HERRAMIENTAS,
  catalogoParaModelo,
  ejecutarHerramienta,
  resolverRango,
  aPesos,
  menuDelDiaActual,
  // Exportar diagnósticos para uso externo (ej: endpoint de revisión automática)
  revisionAutomatica,
  stockNegativo,
  pedidosColgados,
  productosSinPrecio,
  deliverysSinRepartidor,
  clientesDuplicados,
  insumosSinMovimientos,
};
