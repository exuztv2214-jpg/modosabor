const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { recalculateClienteStats, recalculateAllClientes } = require('../utils/loyalty');
const { asegurarCodigoTarjeta, canjearRecompensa } = require('../services/fidelizacionService');
const { requirePermission } = require('../utils/permissions');
const { getConfigMap } = require('../utils/mercadoPago');
const { hydratePedido } = require('../services/pedidoService');
const { hoyArgentina } = require('../utils/fechaLocal');
const { findClienteDuplicate, phoneKey, emailKey } = require('../utils/clienteDuplicates');
const {
  createClienteDireccion,
  deleteClienteDireccion,
  getClienteDirecciones,
  replaceClienteDirecciones,
  updateClienteDireccion,
} = require('../utils/clienteAddresses');

function tagsToString(tags) {
  if (!tags) return '[]';
  return typeof tags === 'string' ? tags : JSON.stringify(tags);
}

const SEGMENT_TEMPLATE_KEYS = {
  'premio-listo': 'crm_template_premio_listo',
  vip: 'crm_template_vip',
  riesgo: 'crm_template_riesgo',
  nuevo: 'crm_template_nuevo',
};

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) return `54${digits.slice(1)}`;
  return `54${digits}`;
}

function normalizeCliente(row) {
  if (!row) return row;

  let tags = [];
  try {
    const parsed = JSON.parse(row.tags || '[]');
    tags = Array.isArray(parsed) ? parsed : [];
  } catch {
    tags = [];
  }

  return {
    ...row,
    tags,
    puntos: Number(row.puntos || 0),
    sellos: Number(row.sellos_actuales ?? row.sellos ?? 0),
    sellos_actuales: Number(row.sellos_actuales ?? row.sellos ?? 0),
    canjes_premio: Number(row.canjes_premio || 0),
    recompensas_pendientes: Number(row.recompensas_pendientes || 0),
    frecuencia_dias: Number(row.frecuencia_dias || 7),
    total_gastado: Number(row.total_gastado || 0),
    total_pedidos: Number(row.total_pedidos || 0),
    fidelizacion_activa: Boolean(row.fidelizacion_activa !== 0),
    codigo_tarjeta: row.codigo_tarjeta || '',
    ultima_compra: row.ultima_compra || '',
    nivel: row.nivel || 'Bronce',
    fecha_nacimiento: row.fecha_nacimiento || '',
  };
}

function buildCampaignMessage(template, payload) {
  return String(template || '')
    .replace(/\{\{(.*?)\}\}/g, (_, key) => {
      const clean = String(key || '').trim();
      return payload[clean] ?? '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function _buildCampaignPayload(cliente, config = {}) {
  const codigo = cliente?.codigo_tarjeta || `MS-${String(cliente?.id || '').padStart(6, '0')}`;
  const telefono = normalizePhone(cliente?.telefono);
  const pedidoUrl = String(config.public_app_url || config.crm_link_campanas || '').replace(
    /\/$/,
    ''
  );

  return {
    cliente: cliente?.nombre || 'cliente',
    nombre: cliente?.nombre || 'cliente',
    negocio: config.negocio_nombre || 'Modo Sabor',
    telefono: cliente?.telefono || '',
    telefono_normalizado: telefono,
    codigo,
    codigo_tarjeta: codigo,
    nivel: cliente?.nivel || 'Bronce',
    puntos: Number(cliente?.puntos || 0),
    sellos: Number(cliente?.sellos_actuales ?? cliente?.sellos ?? 0),
    premios: Number(cliente?.recompensas_pendientes || 0),
    total_pedidos: Number(cliente?.total_pedidos || 0),
    total_gastado: Number(cliente?.total_gastado || 0),
    ultima_compra: cliente?.ultima_compra || '',
    pedido_url: pedidoUrl,
    link: pedidoUrl,
    contacto_link: telefono ? `tel:${telefono}` : '',
  };
}

function summarizeCampaignResults(results = [], totalClientes = 0) {
  const safeResults = Array.isArray(results) ? results : [];
  const enviadosOk = safeResults.filter((item) => item?.ok).length;
  const enviadosError = safeResults.length - enviadosOk;
  const enviadosManual = safeResults.filter((item) => item?.mode === 'manual').length;
  const enviadosApi = safeResults.filter((item) => item?.mode === 'api').length;
  const enviadosLocal = safeResults.filter((item) => item?.mode === 'local').length;
  const total = Number(totalClientes || safeResults.length || 0);
  const cobertura = total > 0 ? Number(((safeResults.length / total) * 100).toFixed(1)) : 0;
  const tasaEnvio =
    safeResults.length > 0 ? Number(((enviadosOk / safeResults.length) * 100).toFixed(1)) : 0;

  return {
    total_clientes: total,
    procesados: safeResults.length,
    enviados_ok: enviadosOk,
    enviados_error: enviadosError,
    enviados_manual: enviadosManual,
    enviados_api: enviadosApi,
    enviados_local: enviadosLocal,
    cobertura,
    tasa_envio: tasaEnvio,
  };
}

function summarizeCampaignConversion(item) {
  const clienteIds = Array.isArray(item?.cliente_ids)
    ? item.cliente_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const createdAt = item?.creado_en || new Date().toISOString();
  const windowDays = 30;

  if (!clienteIds.length) {
    return {
      ventana_dias: windowDays,
      clientes_convertidos: 0,
      pedidos_generados: 0,
      ingreso_generado: 0,
      tasa_conversion: 0,
    };
  }

  const placeholders = clienteIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `
    SELECT
      p.cliente_id,
      COUNT(*) AS pedidos_generados,
      COALESCE(SUM(p.total), 0) AS ingreso_generado
    FROM pedidos p
    WHERE p.estado = 'entregado'
      AND p.cliente_id IN (${placeholders})
      AND datetime(p.creado_en) >= datetime(?)
      AND datetime(p.creado_en) <= datetime(?, '+${windowDays} days')
    GROUP BY p.cliente_id
  `
    )
    .all(...clienteIds, createdAt, createdAt);

  const clientesConvertidos = rows.length;
  const pedidosGenerados = rows.reduce((acc, row) => acc + Number(row.pedidos_generados || 0), 0);
  const ingresoGenerado = rows.reduce((acc, row) => acc + Number(row.ingreso_generado || 0), 0);

  return {
    ventana_dias: windowDays,
    clientes_convertidos: clientesConvertidos,
    pedidos_generados: pedidosGenerados,
    ingreso_generado: Number(ingresoGenerado.toFixed(2)),
    tasa_conversion:
      clienteIds.length > 0
        ? Number(((clientesConvertidos / clienteIds.length) * 100).toFixed(1))
        : 0,
  };
}

function buildCampaignInsights(item) {
  const metricas = summarizeCampaignResults(item?.ultimo_resultado, item?.total_clientes);
  const conversion = summarizeCampaignConversion(item);
  return {
    ...item,
    metricas: {
      ...metricas,
      ...conversion,
    },
  };
}

function getRecompraCandidates() {
  recalculateAllClientes(db);
  const config = getConfigMap(db);
  const dias = Math.max(1, Number(config.crm_dias_inactividad || 15));
  const rows = db
    .prepare(
      `
    SELECT
      c.*,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    WHERE COALESCE(c.telefono, '') != ''
    GROUP BY c.id
    HAVING MAX(p.creado_en) IS NOT NULL
    ORDER BY datetime(MAX(p.creado_en)) ASC
  `
    )
    .all();

  return rows
    .map(normalizeCliente)
    .map((cliente) => ({
      ...cliente,
      dias_inactivo: cliente.ultima_compra
        ? Math.max(
            0,
            Math.floor((Date.now() - new Date(cliente.ultima_compra).getTime()) / 86400000)
          )
        : 999,
    }))
    .filter((cliente) => cliente.dias_inactivo >= dias);
}

function getBirthdayCandidates() {
  return db
    .prepare(
      `
    SELECT
      c.*,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    WHERE COALESCE(c.telefono, '') != ''
      AND c.fecha_nacimiento != ''
      AND strftime('%m', c.fecha_nacimiento) = strftime('%m', 'now')
    GROUP BY c.id
    ORDER BY strftime('%d', c.fecha_nacimiento) ASC, c.total_gastado DESC
  `
    )
    .all()
    .map(normalizeCliente);
}

function classifyCliente(cliente) {
  const ultimaCompra = cliente.ultima_compra ? new Date(cliente.ultima_compra).getTime() : 0;
  const diasInactivo = ultimaCompra
    ? Math.max(0, Math.floor((Date.now() - ultimaCompra) / 86400000))
    : null;
  const totalPedidos = Number(cliente.total_pedidos || 0);
  const totalGastado = Number(cliente.total_gastado || 0);
  const recompensasPendientes = Number(cliente.recompensas_pendientes || 0);

  let estado = 'activo';
  if (recompensasPendientes > 0) estado = 'premio-listo';
  else if (
    totalPedidos >= 10 ||
    ['Oro', 'Platino'].includes(cliente.nivel) ||
    totalGastado >= 120000
  ) {
    estado = 'vip';
  } else if (diasInactivo !== null && diasInactivo >= 60) estado = 'perdido';
  else if (diasInactivo !== null && diasInactivo >= 30) estado = 'riesgo';
  else if (totalPedidos <= 1 || !cliente.ultima_compra) estado = 'nuevo';
  else if (totalPedidos >= 5 && (diasInactivo === null || diasInactivo < 30)) estado = 'recurrente';

  return {
    ...cliente,
    dias_inactivo: diasInactivo ?? 999,
    estado_segmento: estado,
  };
}

function getClienteRow(clienteId) {
  return db
    .prepare(
      `
        SELECT
          c.*,
          COALESCE(MAX(p.creado_en), '') AS ultima_compra
        FROM clientes c
        LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
        WHERE c.id = ?
        GROUP BY c.id
      `
    )
    .get(clienteId);
}

function _getClientesByIds(clienteIds = []) {
  if (!Array.isArray(clienteIds) || !clienteIds.length) return [];
  const placeholders = clienteIds.map(() => '?').join(', ');
  return db
    .prepare(
      `
    SELECT
      c.*,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    WHERE c.id IN (${placeholders})
    GROUP BY c.id
  `
    )
    .all(...clienteIds)
    .map(normalizeCliente)
    .map(classifyCliente);
}

function getClienteDetail(clienteId) {
  recalculateClienteStats(db, clienteId);
  const cliente = getClienteRow(clienteId);
  if (!cliente) return null;

  const pedidos = db
    .prepare('SELECT * FROM pedidos WHERE cliente_id = ? ORDER BY creado_en DESC LIMIT 50')
    .all(clienteId)
    .map(hydratePedido);
  const direcciones = getClienteDirecciones(db, clienteId);
  const timeline = [
    ...pedidos.slice(0, 10).map((pedido) => ({
      id: `pedido-${pedido.id}`,
      fecha: pedido.creado_en,
      tipo: 'pedido',
      tone: 'blue',
      title: `Pedido #${pedido.numero}`,
      subtitle: `${pedido.estado || 'sin estado'} · ${Number(pedido.total || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}`,
    })),
    ...db
      .prepare(
        `
      SELECT id, tipo, puntos, descripcion, fecha
      FROM puntos_transacciones
      WHERE cliente_id = ?
      ORDER BY datetime(fecha) DESC
      LIMIT 10
    `
      )
      .all(clienteId)
      .map((movimiento) => ({
        id: `puntos-${movimiento.id}`,
        fecha: movimiento.fecha,
        tipo: 'puntos',
        tone:
          movimiento.tipo === 'canje'
            ? 'amber'
            : movimiento.tipo === 'expiracion'
              ? 'rose'
              : 'emerald',
        title: movimiento.tipo === 'canje' ? 'Canje de puntos' : 'Movimiento de puntos',
        subtitle: `${Number(movimiento.puntos || 0)} pts${movimiento.descripcion ? ` · ${movimiento.descripcion}` : ''}`,
      })),
    ...db
      .prepare(
        `
      SELECT id, nivel_anterior, nivel_nuevo, fecha_cambio
      FROM cliente_niveles_historial
      WHERE cliente_id = ?
      ORDER BY datetime(fecha_cambio) DESC
      LIMIT 5
    `
      )
      .all(clienteId)
      .map((cambio) => ({
        id: `nivel-${cambio.id}`,
        fecha: cambio.fecha_cambio,
        tipo: 'nivel',
        tone: 'sky',
        title: 'Cambio de nivel',
        subtitle: `${cambio.nivel_anterior || 'Sin nivel'} -> ${cambio.nivel_nuevo}`,
      })),
  ]
    .filter((item) => item.fecha)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    .slice(0, 12);

  return classifyCliente({ ...normalizeCliente(cliente), pedidos, direcciones, timeline });
}

function resolveDireccionesInput(body, fallbackDirecciones = []) {
  if (Array.isArray(body?.direcciones)) return body.direcciones;
  if (!body || !Object.prototype.hasOwnProperty.call(body, 'direccion')) return null;

  const copied = fallbackDirecciones.map((direccion) => ({ ...direccion }));
  const currentPrincipalIndex = copied.findIndex((direccion) => direccion.principal);
  const principalIndex = currentPrincipalIndex >= 0 ? currentPrincipalIndex : 0;
  const basePrincipal = copied[principalIndex] || { etiqueta: 'Principal', principal: true };
  const nextPrincipal = {
    ...basePrincipal,
    principal: true,
    direccion: String(body.direccion || '').trim(),
  };

  if (copied.length) copied[principalIndex] = nextPrincipal;
  else copied.push(nextPrincipal);

  return copied;
}

router.get('/', auth, requirePermission('clientes.view'), (req, res) => {
  recalculateAllClientes(db);
  const { search, page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  let q = `
    SELECT
      c.*,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    q += `
      AND (
        c.nombre LIKE ?
        OR c.telefono LIKE ?
        OR c.direccion LIKE ?
        OR c.codigo_tarjeta LIKE ?
        OR EXISTS (
          SELECT 1
          FROM cliente_direcciones cd
          WHERE cd.cliente_id = c.id
            AND (
              cd.direccion LIKE ?
              OR cd.etiqueta LIKE ?
              OR cd.referencia LIKE ?
            )
        )
      )
    `;
    params.push(
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`,
      `%${search}%`
    );
  }

  q += ' GROUP BY c.id ORDER BY c.total_pedidos DESC, c.nombre ASC';
  q += ' LIMIT ? OFFSET ?';
  params.push(limitNum, offset);
  const rows = db.prepare(q).all(...params);
  res.json(rows.map(normalizeCliente).map(classifyCliente));
});

router.get('/campanas/recompra', auth, requirePermission('clientes.edit'), (req, res) => {
  const config = getConfigMap(db);
  const clientes = getRecompraCandidates();
  const template = config.crm_mensaje_recompra || '';
  const cupon = config.crm_cupon_recompra || config.postventa_cupon_recompra || '';
  const pedidoUrl = String(config.public_app_url || '').replace(/\/$/, '');

  res.json({
    dias_inactividad: Number(config.crm_dias_inactividad || 15),
    cupon,
    total: clientes.length,
    clientes: clientes.map((cliente) => ({
      ...cliente,
      telefono_normalizado: normalizePhone(cliente.telefono),
      mensaje_preview: buildCampaignMessage(template, {
        cliente: cliente.nombre || 'cliente',
        negocio: config.negocio_nombre || 'Modo Sabor',
        cupon,
        pedido_url: pedidoUrl,
      }),
    })),
  });
});

router.get('/campanas/cumpleanos', auth, requirePermission('clientes.edit'), (req, res) => {
  const config = getConfigMap(db);
  const cupon = config.crm_cupon_recompra || config.postventa_cupon_recompra || '';
  const clientes = getBirthdayCandidates();
  const template = `Hola {{cliente}}. En ${config.negocio_nombre || 'Modo Sabor'} te deseamos feliz cumple. Tenes disponible el cupon {{cupon}} para tu proximo pedido: {{pedido_url}}`;
  const pedidoUrl = String(config.public_app_url || '').replace(/\/$/, '');

  res.json({
    cupon,
    total: clientes.length,
    clientes: clientes.map((cliente) => ({
      ...cliente,
      telefono_normalizado: normalizePhone(cliente.telefono),
      mensaje_preview: buildCampaignMessage(template, {
        cliente: cliente.nombre || 'cliente',
        cupon,
        pedido_url: pedidoUrl,
      }),
    })),
  });
});

router.get('/segmentos', auth, requirePermission('clientes.view'), (req, res) => {
  recalculateAllClientes(db);
  const rows = db
    .prepare(
      `
    SELECT
      c.*,
      COALESCE(MAX(p.creado_en), '') AS ultima_compra
    FROM clientes c
    LEFT JOIN pedidos p ON p.cliente_id = c.id AND p.estado = 'entregado'
    GROUP BY c.id
    ORDER BY c.total_gastado DESC, c.total_pedidos DESC
  `
    )
    .all()
    .map(normalizeCliente)
    .map(classifyCliente);

  const mesActual = hoyArgentina().slice(5, 7);
  const summary = rows.reduce(
    (acc, cliente) => {
      acc.total += 1;
      if (cliente.estado_segmento === 'vip') acc.vip += 1;
      if (cliente.estado_segmento === 'riesgo') acc.riesgo += 1;
      if (cliente.estado_segmento === 'perdido') acc.perdidos += 1;
      if (cliente.dias_inactivo >= 30) acc.inactivos += 1;
      if ((cliente.total_pedidos || 0) >= 5) acc.recurrentes += 1;
      if (
        cliente.cumpleEsteMes ||
        (cliente.fecha_nacimiento && String(cliente.fecha_nacimiento).slice(5, 7) === mesActual)
      ) {
        acc.cumpleMes += 1;
      }
      return acc;
    },
    {
      total: 0,
      vip: 0,
      riesgo: 0,
      perdidos: 0,
      inactivos: 0,
      recurrentes: 0,
      cumpleMes: 0,
    }
  );

  const favoritos = db
    .prepare(
      `
    SELECT
      TRIM(pi.nombre) AS nombre,
      COUNT(*) AS veces
    FROM pedido_items pi
    INNER JOIN pedidos p ON p.id = pi.pedido_id
    WHERE p.estado = 'entregado'
    GROUP BY TRIM(pi.nombre)
    HAVING nombre IS NOT NULL AND nombre != ''
    ORDER BY veces DESC, nombre ASC
    LIMIT 8
  `
    )
    .all();

  res.json({
    summary,
    top_vip: rows.filter((cliente) => cliente.estado_segmento === 'vip').slice(0, 6),
    riesgo: rows.filter((cliente) => cliente.estado_segmento === 'riesgo').slice(0, 6),
    perdidos: rows.filter((cliente) => cliente.estado_segmento === 'perdido').slice(0, 6),
    favoritos,
  });
});

router.get(
  '/campanas/personalizadas/config',
  auth,
  requirePermission('clientes.view'),
  (req, res) => {
    const config = getConfigMap(db);
    const templates = Object.entries(SEGMENT_TEMPLATE_KEYS).reduce((acc, [segmento, clave]) => {
      const row = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
      acc[segmento] = row?.valor || '';
      return acc;
    }, {});

    const history = db
      .prepare(
        `
    SELECT id, segmento, titulo, mensaje, total_clientes, cliente_ids, enviados_ok, enviados_error, ultimo_resultado, actor_nombre, creado_en
    FROM crm_campanas_historial
    ORDER BY datetime(creado_en) DESC
    LIMIT 12
  `
      )
      .all()
      .map((item) => ({
        ...item,
        cliente_ids: parseJsonArray(item.cliente_ids),
        total_clientes: Number(item.total_clientes || 0),
        enviados_ok: Number(item.enviados_ok || 0),
        enviados_error: Number(item.enviados_error || 0),
        ultimo_resultado: parseJsonArray(item.ultimo_resultado),
      }))
      .map(buildCampaignInsights);

    const dashboard = history.reduce(
      (acc, item) => {
        acc.campanas += 1;
        acc.clientes += Number(item.metricas?.total_clientes || 0);
        acc.enviados_ok += Number(item.metricas?.enviados_ok || 0);
        acc.convertidos += Number(item.metricas?.clientes_convertidos || 0);
        acc.ingreso += Number(item.metricas?.ingreso_generado || 0);
        return acc;
      },
      {
        campanas: 0,
        clientes: 0,
        enviados_ok: 0,
        convertidos: 0,
        ingreso: 0,
      }
    );

    dashboard.tasa_conversion =
      dashboard.clientes > 0
        ? Number(((dashboard.convertidos / dashboard.clientes) * 100).toFixed(1))
        : 0;
    dashboard.tasa_envio =
      dashboard.clientes > 0
        ? Number(((dashboard.enviados_ok / dashboard.clientes) * 100).toFixed(1))
        : 0;

    const segmentos = Object.values(
      history.reduce((acc, item) => {
        const key = item.segmento || 'otro';
        if (!acc[key]) {
          acc[key] = {
            segmento: key,
            campanas: 0,
            clientes: 0,
            convertidos: 0,
            ingreso: 0,
          };
        }

        acc[key].campanas += 1;
        acc[key].clientes += Number(item.metricas?.total_clientes || 0);
        acc[key].convertidos += Number(item.metricas?.clientes_convertidos || 0);
        acc[key].ingreso += Number(item.metricas?.ingreso_generado || 0);
        return acc;
      }, {})
    )
      .map((item) => ({
        ...item,
        tasa_conversion:
          item.clientes > 0 ? Number(((item.convertidos / item.clientes) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => {
        if (b.tasa_conversion !== a.tasa_conversion) return b.tasa_conversion - a.tasa_conversion;
        return b.ingreso - a.ingreso;
      });

    const topCampaign =
      [...history].sort((a, b) => {
        const conversionDiff =
          Number(b.metricas?.tasa_conversion || 0) - Number(a.metricas?.tasa_conversion || 0);
        if (conversionDiff !== 0) return conversionDiff;
        return (
          Number(b.metricas?.ingreso_generado || 0) - Number(a.metricas?.ingreso_generado || 0)
        );
      })[0] || null;

    res.json({
      templates,
      history,
      dashboard,
      segmentos,
      top_campaign: topCampaign,
      variables: [
        { key: 'cliente', label: 'Cliente', example: 'Juan Perez' },
        { key: 'negocio', label: 'Negocio', example: config.negocio_nombre || 'Modo Sabor' },
        { key: 'telefono', label: 'Telefono', example: '1122334455' },
        { key: 'codigo', label: 'Codigo', example: 'MS-000123' },
        { key: 'nivel', label: 'Nivel', example: 'Oro' },
        { key: 'puntos', label: 'Puntos', example: '120' },
        { key: 'sellos', label: 'Sellos', example: '4' },
        { key: 'premios', label: 'Premios', example: '1' },
        { key: 'total_pedidos', label: 'Pedidos', example: '8' },
        { key: 'total_gastado', label: 'Gastado', example: '84500' },
        { key: 'pedido_url', label: 'Link pedido', example: config.public_app_url || '' },
        { key: 'contacto_link', label: 'Link contacto', example: 'tel:54...' },
      ],
    });
  }
);

router.put(
  '/campanas/personalizadas/template/:segmento',
  auth,
  requirePermission('clientes.edit'),
  (req, res) => {
    const segmento = String(req.params.segmento || '').trim();
    const clave = SEGMENT_TEMPLATE_KEYS[segmento];
    if (!clave) return res.status(400).json({ error: 'Segmento de plantilla no valido' });

    const mensaje = String(req.body?.mensaje || '').trim();
    db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)').run(
      clave,
      mensaje
    );
    res.json({ ok: true, segmento, mensaje });
  }
);

router.post(
  '/campanas/personalizadas/historial',
  auth,
  requirePermission('clientes.edit'),
  (req, res) => {
    const segmento = String(req.body?.segmento || '').trim();
    if (!SEGMENT_TEMPLATE_KEYS[segmento]) {
      return res.status(400).json({ error: 'Segmento de campaña no valido' });
    }

    const clienteIds = Array.isArray(req.body?.cliente_ids)
      ? req.body.cliente_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];

    const titulo = String(req.body?.titulo || '').trim() || segmento;
    const mensaje = String(req.body?.mensaje || '').trim();
    const totalClientes = Number(req.body?.total_clientes || clienteIds.length || 0);

    const result = db
      .prepare(
        `
    INSERT INTO crm_campanas_historial (segmento, titulo, mensaje, total_clientes, cliente_ids, actor_id, actor_nombre)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
      )
      .run(
        segmento,
        titulo,
        mensaje,
        totalClientes,
        JSON.stringify(clienteIds),
        req.user?.id || null,
        req.user?.nombre || req.user?.email || 'Sistema'
      );

    const item = db
      .prepare(
        `
    SELECT id, segmento, titulo, mensaje, total_clientes, cliente_ids, enviados_ok, enviados_error, ultimo_resultado, actor_nombre, creado_en
    FROM crm_campanas_historial
    WHERE id = ?
  `
      )
      .get(result.lastInsertRowid);

    res.json({
      ...item,
      cliente_ids: parseJsonArray(item?.cliente_ids),
      total_clientes: Number(item?.total_clientes || 0),
      enviados_ok: Number(item?.enviados_ok || 0),
      enviados_error: Number(item?.enviados_error || 0),
      ultimo_resultado: parseJsonArray(item?.ultimo_resultado),
      metricas: buildCampaignInsights({
        ...item,
        cliente_ids: parseJsonArray(item?.cliente_ids),
        total_clientes: Number(item?.total_clientes || 0),
        ultimo_resultado: parseJsonArray(item?.ultimo_resultado),
      }).metricas,
    });
  }
);

router.post(
  '/campanas/personalizadas/enviar',
  auth,
  requirePermission('clientes.edit'),
  async (_req, res) => {
    return res.status(410).json({ error: 'Las campanas automaticas fueron removidas del sistema' });
  }
);

router.post(
  '/campanas/recompra/enviar',
  auth,
  requirePermission('clientes.edit'),
  async (_req, res) => {
    return res.status(410).json({ error: 'Las campanas automaticas fueron removidas del sistema' });
  }
);

router.post(
  '/campanas/cumpleanos/enviar',
  auth,
  requirePermission('clientes.edit'),
  async (_req, res) => {
    return res.status(410).json({ error: 'Las campanas automaticas fueron removidas del sistema' });
  }
);

router.get('/:id', auth, requirePermission('clientes.view'), (req, res) => {
  const cliente = getClienteDetail(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(cliente);
});

router.get('/:id/direcciones', auth, requirePermission('clientes.view'), (req, res) => {
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(getClienteDirecciones(db, req.params.id));
});

router.post('/:id/direcciones', auth, requirePermission('clientes.edit'), (req, res) => {
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  try {
    const created = createClienteDireccion(db, req.params.id, req.body || {});
    res.json(created);
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo crear la direccion' });
  }
});

router.put(
  '/:id/direcciones/:direccionId',
  auth,
  requirePermission('clientes.edit'),
  (req, res) => {
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    try {
      const updated = updateClienteDireccion(
        db,
        req.params.id,
        req.params.direccionId,
        req.body || {}
      );
      if (!updated) return res.status(404).json({ error: 'Direccion no encontrada' });
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error.message || 'No se pudo actualizar la direccion' });
    }
  }
);

router.delete(
  '/:id/direcciones/:direccionId',
  auth,
  requirePermission('clientes.edit'),
  (req, res) => {
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const removed = deleteClienteDireccion(db, req.params.id, req.params.direccionId);
    if (!removed) return res.status(404).json({ error: 'Direccion no encontrada' });
    res.json({ success: true });
  }
);

router.post('/', auth, requirePermission('clientes.edit'), (req, res) => {
  const {
    nombre,
    telefono = '',
    email = '',
    direccion = '',
    notas = '',
    tags = '[]',
    fecha_nacimiento = '',
    avatar_url = '',
    fidelizacion_activa = 1,
  } = req.body;

  if (!String(nombre || '').trim()) return res.status(400).json({ error: 'Nombre requerido' });

  const outcome = db
    .transaction(() => {
      const duplicate = findClienteDuplicate(db, { telefono, email });
      if (duplicate) return { duplicate };
      const result = db
        .prepare(
          `
        INSERT INTO clientes (
          nombre, telefono, email, direccion, notas, tags,
          fecha_nacimiento, avatar_url, fidelizacion_activa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          String(nombre).trim(),
          telefono,
          email,
          direccion,
          notas,
          tagsToString(tags),
          fecha_nacimiento || '',
          avatar_url || '',
          fidelizacion_activa ? 1 : 0
        );

      const clienteId = result.lastInsertRowid;
      asegurarCodigoTarjeta(clienteId);

      const direccionesInput = resolveDireccionesInput(req.body, []);
      if (direccionesInput) {
        replaceClienteDirecciones(db, clienteId, direccionesInput);
      }

      return { created: getClienteDetail(clienteId) };
    })
    .immediate();
  if (outcome.duplicate) {
    return res.status(409).json({
      code: 'CLIENTE_DUPLICADO',
      error: `Ya existe un cliente con ese ${outcome.duplicate.campo}: ${outcome.duplicate.nombre}. Buscalo y seleccioná su ficha.`,
      cliente_existente_id: outcome.duplicate.id,
    });
  }
  res.json(outcome.created);
});

router.put('/:id', auth, requirePermission('clientes.edit'), (req, res) => {
  const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Cliente no encontrado' });
  const direccionesExistentes = getClienteDirecciones(db, req.params.id);

  const payload = {
    nombre: req.body.nombre ?? existing.nombre,
    telefono: req.body.telefono ?? existing.telefono,
    email: req.body.email ?? existing.email,
    direccion: req.body.direccion ?? existing.direccion,
    notas: req.body.notas ?? existing.notas,
    tags: tagsToString(req.body.tags ?? existing.tags),
    fecha_nacimiento: req.body.fecha_nacimiento ?? existing.fecha_nacimiento ?? '',
    avatar_url: req.body.avatar_url ?? existing.avatar_url ?? '',
    fidelizacion_activa:
      req.body.fidelizacion_activa !== undefined
        ? req.body.fidelizacion_activa
          ? 1
          : 0
        : existing.fidelizacion_activa,
  };

  const outcome = db
    .transaction(() => {
      // Historical duplicates must not prevent unrelated edits. Check only new identities.
      const changed = {
        telefono:
          phoneKey(payload.telefono) !== phoneKey(existing.telefono) ? payload.telefono : '',
        email: emailKey(payload.email) !== emailKey(existing.email) ? payload.email : '',
      };
      const duplicate = findClienteDuplicate(db, changed, existing.id);
      if (duplicate) return { duplicate };
      db.prepare(
        `
      UPDATE clientes
      SET nombre = ?, telefono = ?, email = ?, direccion = ?, notas = ?, tags = ?,
          fecha_nacimiento = ?, avatar_url = ?, fidelizacion_activa = ?
      WHERE id = ?
    `
      ).run(
        payload.nombre,
        payload.telefono,
        payload.email,
        payload.direccion,
        payload.notas,
        payload.tags,
        payload.fecha_nacimiento,
        payload.avatar_url,
        payload.fidelizacion_activa,
        req.params.id
      );

      asegurarCodigoTarjeta(req.params.id);

      const direccionesInput = resolveDireccionesInput(req.body, direccionesExistentes);
      if (direccionesInput) {
        replaceClienteDirecciones(db, req.params.id, direccionesInput);
      }

      return { updated: getClienteDetail(req.params.id) };
    })
    .immediate();
  if (outcome.duplicate) {
    return res.status(409).json({
      code: 'CLIENTE_DUPLICADO',
      error: `Ese ${outcome.duplicate.campo} pertenece a ${outcome.duplicate.nombre}.`,
      cliente_existente_id: outcome.duplicate.id,
    });
  }
  res.json(outcome.updated);
});

router.post('/:id/canjear-regalo', auth, requirePermission('clientes.edit'), (req, res) => {
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

  try {
    canjearRecompensa(req.params.id);
    const updated = getClienteDetail(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo canjear la recompensa' });
  }
});

router.delete('/:id', auth, requirePermission('clientes.edit'), (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
