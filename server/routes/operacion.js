const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { createDatabaseBackup, listBackups } = require('../utils/backupManager');
const { insertInventoryMovement, roundStock } = require('../utils/inventory');
const { summarizePaymentRows } = require('../utils/paymentStatus');
const { recalculateClienteStats } = require('../utils/loyalty');

const { fechaLocal } = require('../utils/fechaLocal');
router.use(auth);

const BASE_INSUMOS = [
  'Prepizza',
  'Queso cremoso 200g',
  'Muzzarella 200g',
  'Pan hamburguesa',
  'Medallon smash 90g',
  'Milanesa de pollo',
  'Milanesa de carne',
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  return Math.round(Number(value || 0));
}

function findMenuDiaCategory() {
  return (
    db
      .prepare(
        `
    SELECT id, nombre, icono, color
    FROM categorias
    WHERE lower(nombre) = lower('Menu del Dia')
    LIMIT 1
  `
      )
      .get() || null
  );
}

function ensureMenuDiaCategory() {
  const existing = findMenuDiaCategory();
  if (existing) return existing;

  const result = db
    .prepare(
      `
    INSERT INTO categorias (nombre, icono, color, orden, activo, imagen, subcategorias)
    VALUES ('Menu del Dia', '🍽', '#16a34a', 0, 1, '', '[]')
  `
    )
    .run();

  return {
    id: Number(result.lastInsertRowid),
    nombre: 'Menu del Dia',
    icono: '🍽',
    color: '#16a34a',
  };
}

// ── Menú del día v2: guarniciones + extras (postre / bebida+postre) ─────
// Los platos del menú del día tienen 2 tipos de opciones:
//   1. Guarnición: variante OBLIGATORIA (elegir 1 de N), sin costo extra.
//      Ejemplo: suprema napolitana → arroz blanco, puré, papas, etc.
//   2. Extras opcionales:
//      - "Postre" (económicos + ejecutivos): suma un precio configurable.
//      - "Bebida + Postre" (solo ejecutivos): suma un precio configurable.
// Los precios y la lista global de guarniciones se guardan en `configuracion`
// para poder editarlos desde la UI sin re-deployar.
const EXTRA_POSTRE_NOMBRE = 'Postre';
const EXTRA_BEBIDA_POSTRE_NOMBRE = 'Bebida + Postre';
const VARIANTE_GUARNICION_NOMBRE = 'Guarnición';
const LEGACY_PROMO_NOMBRE = 'Jugo + Postre'; // se ignora al leer, para retrocompat.
/* En centavos, igual que lo que guarda `configuracion`. Estaba en pesos, asi
   que si la clave faltaba el menu economico salia a $50. */
const MENU_DIA_PRECIO_SUGERIDO_FALLBACK = { economico: 500000, ejecutivo: 700000 };
const MENU_DIA_EXTRA_PRECIO_FALLBACK = 100000; // $1.000

function parseJsonList(raw, fallback = []) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
const parseExtrasList = parseJsonList; // alias por compatibilidad

/**
 * Lee los settings del menú del día (precios base + precios de extras +
 * lista global de guarniciones). Con fallback razonable si no están.
 */
function loadMenuDiaSettings() {
  const rows = db
    .prepare("SELECT clave, valor FROM configuracion WHERE clave LIKE 'menu_dia_%'")
    .all();
  const map = new Map(rows.map((r) => [r.clave, r.valor]));
  const num = (key, def) => {
    const n = Number(map.get(key));
    return Number.isFinite(n) && n >= 0 ? n : def;
  };
  return {
    precioEconomico: num('menu_dia_precio_economico', MENU_DIA_PRECIO_SUGERIDO_FALLBACK.economico),
    precioEjecutivo: num('menu_dia_precio_ejecutivo', MENU_DIA_PRECIO_SUGERIDO_FALLBACK.ejecutivo),
    extraPostrePrecio: num('menu_dia_extra_postre_precio', MENU_DIA_EXTRA_PRECIO_FALLBACK),
    extraBebidaPostrePrecio: num(
      'menu_dia_extra_bebida_postre_precio',
      MENU_DIA_EXTRA_PRECIO_FALLBACK
    ),
    guarnicionesLista: parseJsonList(map.get('menu_dia_guarniciones_lista'), []),
  };
}

/** Construye el JSON de variantes según las guarniciones seleccionadas.
 *  Si no hay guarniciones, no genera variante alguna. */
function buildMenuDiaVariantes(guarniciones) {
  const opciones = (guarniciones || [])
    .map((g) => String(g || '').trim())
    .filter(Boolean)
    .map((nombre) => ({ nombre, precio_extra: 0 }));
  if (opciones.length === 0) return '[]';
  return JSON.stringify([{ nombre: VARIANTE_GUARNICION_NOMBRE, opciones }]);
}

/** Construye el JSON de extras según flags de postre / bebida+postre. */
function buildMenuDiaExtras(flags = {}, settings = loadMenuDiaSettings()) {
  const extras = [];
  if (flags.ofrecePostre) {
    extras.push({ nombre: EXTRA_POSTRE_NOMBRE, precio: settings.extraPostrePrecio });
  }
  if (flags.ofreceBebidaPostre) {
    extras.push({
      nombre: EXTRA_BEBIDA_POSTRE_NOMBRE,
      precio: settings.extraBebidaPostrePrecio,
    });
  }
  return JSON.stringify(extras);
}

/** Lee del `variantes` existente qué guarniciones tenía seleccionadas. */
function extractGuarnicionesFromVariantes(variantesRaw) {
  const list = parseJsonList(variantesRaw);
  const target = list.find(
    (v) =>
      String(v?.nombre || '')
        .trim()
        .toLowerCase() === VARIANTE_GUARNICION_NOMBRE.toLowerCase()
  );
  if (!target) return [];
  return (target.opciones || []).map((o) => String(o?.nombre || '').trim()).filter(Boolean);
}

/** Lee del `extras` existente si tenía activado postre / bebida+postre. */
function extractExtrasFlagsFromExtras(extrasRaw) {
  const list = parseJsonList(extrasRaw);
  const norm = (s) =>
    String(s || '')
      .trim()
      .toLowerCase();
  return {
    ofrecePostre: list.some((e) => norm(e?.nombre) === norm(EXTRA_POSTRE_NOMBRE)),
    ofreceBebidaPostre: list.some((e) => norm(e?.nombre) === norm(EXTRA_BEBIDA_POSTRE_NOMBRE)),
  };
}

function loadMenuDiaLibrary() {
  const category = findMenuDiaCategory();
  if (!category?.id) return [];

  return db
    .prepare(
      `
    SELECT
      p.id,
      p.nombre,
      p.descripcion,
      p.precio,
      p.stock_directo,
      p.tiempo_preparacion,
      p.destacado,
      p.activo,
      -- La foto del plato viaja al panel para que el control diario pueda
      -- mostrarla igual que la web pública. Sin ella, elegir el menú del día
      -- es leer una lista de nombres.
      p.imagen,
      p.menu_dia_base,
      p.menu_dia_disponible_hoy,
      p.menu_dia_tipo,
      p.variantes,
      p.extras
    FROM productos p
    WHERE p.categoria_id = ?
       OR COALESCE(p.menu_dia_base, 0) = 1
    ORDER BY COALESCE(p.menu_dia_disponible_hoy, 0) DESC, p.nombre ASC
  `
    )
    .all(category.id)
    .map((item) => ({
      ...item,
      stock_directo: roundStock(item.stock_directo || 0),
      precio: roundStock(item.precio || 0),
      menu_dia_tipo: item.menu_dia_tipo === 'ejecutivo' ? 'ejecutivo' : 'economico',
    }));
}

function latestMenuDiaSnapshotDate(beforeDate = null) {
  const row = beforeDate
    ? db
        .prepare(
          `
      SELECT fecha
      FROM menu_dia_historial
      WHERE fecha < ?
      ORDER BY fecha DESC
      LIMIT 1
    `
        )
        .get(beforeDate)
    : db
        .prepare(
          `
      SELECT fecha
      FROM menu_dia_historial
      ORDER BY fecha DESC
      LIMIT 1
    `
        )
        .get();

  return row?.fecha || null;
}

function loadMenuDiaSnapshot(fecha) {
  if (!fecha) return [];
  return db
    .prepare(
      `
    SELECT fecha, producto_id, disponible, precio, stock_directo, descripcion, destacado, orden
    FROM menu_dia_historial
    WHERE fecha = ?
    ORDER BY orden ASC, id ASC
  `
    )
    .all(fecha)
    .map((item) => ({
      ...item,
      producto_id: Number(item.producto_id),
      disponible: Number(item.disponible) === 1 ? 1 : 0,
      precio: roundStock(item.precio || 0),
      stock_directo: roundStock(item.stock_directo || 0),
      destacado: Number(item.destacado) === 1 ? 1 : 0,
      orden: Number(item.orden || 0),
    }));
}

function buildMenuDiaManagerPayload() {
  const fecha = today();
  const ultimaFecha = latestMenuDiaSnapshotDate(fecha);
  const snapshotHoy = new Map(loadMenuDiaSnapshot(fecha).map((item) => [item.producto_id, item]));
  const settings = loadMenuDiaSettings();
  const items = loadMenuDiaLibrary().map((item, index) => {
    const snapshot = snapshotHoy.get(Number(item.id));
    const guarniciones = extractGuarnicionesFromVariantes(item.variantes);
    const extrasFlags = extractExtrasFlagsFromExtras(item.extras);
    return {
      ...item,
      disponible_hoy: snapshot
        ? snapshot.disponible
        : Number(item.menu_dia_disponible_hoy) === 1
          ? 1
          : 0,
      precio_hoy: snapshot ? snapshot.precio : roundStock(item.precio || 0),
      stock_hoy: snapshot ? snapshot.stock_directo : roundStock(item.stock_directo || 0),
      descripcion_hoy: snapshot ? snapshot.descripcion : item.descripcion || '',
      destacado_hoy: snapshot ? snapshot.destacado : Number(item.destacado) === 1 ? 1 : 0,
      orden_hoy: snapshot ? snapshot.orden : index,
      tipo_hoy: item.menu_dia_tipo,
      // Nuevo: exponer selección actual de guarniciones y extras opcionales
      // para que el UI pueda editarlas por plato.
      guarniciones_hoy: guarniciones,
      ofrece_postre_hoy: extrasFlags.ofrecePostre ? 1 : 0,
      ofrece_bebida_postre_hoy: extrasFlags.ofreceBebidaPostre ? 1 : 0,
    };
  });

  return {
    fecha,
    categoria: findMenuDiaCategory(),
    ultimaFechaDisponible: ultimaFecha,
    /*
      Antes esto era `precioSugerido: { economico, ejecutivo }`. El middleware
      de plata reconoce "precioSugerido" como plata, pero el valor es un objeto
      y adentro las claves se llaman "economico" y "ejecutivo", que no las
      reconoce nadie: los dos importes viajaban en centavos y el modal de plato
      nuevo prellenaba $500.000.

      Aplanarlo en dos claves que contienen "precio" hace que el conversor las
      agarre solo, sin dividir a mano en ningun lado.
    */
    precioSugeridoEconomico: settings.precioEconomico,
    precioSugeridoEjecutivo: settings.precioEjecutivo,
    // Config global para que la UI arme los selectors sin hardcodear.
    guarnicionesLista: settings.guarnicionesLista,
    extraPostrePrecio: settings.extraPostrePrecio,
    extraBebidaPostrePrecio: settings.extraBebidaPostrePrecio,
    items,
  };
}

function persistMenuDiaItems(items = [], fecha = today()) {
  const category = ensureMenuDiaCategory();
  const existingById = new Map(loadMenuDiaLibrary().map((item) => [Number(item.id), item]));
  const updateProduct = db.prepare(`
    UPDATE productos
    SET categoria_id = ?,
        precio = ?,
        descripcion = ?,
        stock_directo = ?,
        stock_mode = 'direct',
        activo = 1,
        destacado = ?,
        menu_dia_base = 1,
        menu_dia_disponible_hoy = ?,
        menu_dia_tipo = ?,
        variantes = ?,
        extras = ?
    WHERE id = ?
  `);
  const resetAvailability = db.prepare(`
    UPDATE productos
    SET menu_dia_base = 1,
        menu_dia_disponible_hoy = 0
    WHERE categoria_id = ?
       OR COALESCE(menu_dia_base, 0) = 1
  `);
  const upsertSnapshot = db.prepare(`
    INSERT INTO menu_dia_historial (fecha, producto_id, disponible, precio, stock_directo, descripcion, destacado, orden, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(fecha, producto_id) DO UPDATE SET
      disponible = excluded.disponible,
      precio = excluded.precio,
      stock_directo = excluded.stock_directo,
      descripcion = excluded.descripcion,
      destacado = excluded.destacado,
      orden = excluded.orden,
      actualizado_en = CURRENT_TIMESTAMP
  `);

  const settings = loadMenuDiaSettings();

  db.exec('BEGIN');
  try {
    resetAvailability.run(category.id);

    (items || []).forEach((rawItem, index) => {
      const id = Number(rawItem?.id);
      const existing = existingById.get(id);
      if (!existing) return;

      const precio = roundStock(Math.max(0, Number(rawItem?.precio_hoy ?? existing.precio ?? 0)));
      const stock = roundStock(
        Math.max(0, Number(rawItem?.stock_hoy ?? existing.stock_directo ?? 0))
      );
      const disponible = Number(rawItem?.disponible_hoy) === 1 ? 1 : 0;
      const destacado = Number(rawItem?.destacado_hoy) === 1 ? 1 : 0;
      const descripcion = String(rawItem?.descripcion_hoy ?? existing.descripcion ?? '').trim();
      const tipo =
        (rawItem?.tipo_hoy ?? existing.menu_dia_tipo) === 'ejecutivo' ? 'ejecutivo' : 'economico';

      // Guarniciones: si el UI mandó array, lo usamos; si no, mantenemos las
      // que ya tenía el producto (para que no se borren al guardar sin tocarlas).
      const guarniciones = Array.isArray(rawItem?.guarniciones_hoy)
        ? rawItem.guarniciones_hoy
        : extractGuarnicionesFromVariantes(existing.variantes);
      const variantes = buildMenuDiaVariantes(guarniciones);

      // Extras opcionales (postre / bebida+postre). Idem: si el UI no mandó
      // los flags, se preservan los actuales del producto.
      const prevFlags = extractExtrasFlagsFromExtras(existing.extras);
      const ofrecePostre =
        rawItem?.ofrece_postre_hoy === undefined
          ? prevFlags.ofrecePostre
          : Number(rawItem.ofrece_postre_hoy) === 1;
      const ofreceBebidaPostre =
        rawItem?.ofrece_bebida_postre_hoy === undefined
          ? prevFlags.ofreceBebidaPostre
          : Number(rawItem.ofrece_bebida_postre_hoy) === 1 && tipo === 'ejecutivo';
      const extras = buildMenuDiaExtras({ ofrecePostre, ofreceBebidaPostre }, settings);

      updateProduct.run(
        category.id,
        precio,
        descripcion,
        stock,
        destacado,
        disponible,
        tipo,
        variantes,
        extras,
        id
      );
      upsertSnapshot.run(
        fecha,
        id,
        disponible,
        precio,
        stock,
        descripcion,
        destacado,
        Number.isFinite(Number(rawItem?.orden_hoy)) ? Number(rawItem.orden_hoy) : index
      );
    });

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  }
}

function loadBaseInsumos() {
  const placeholders = BASE_INSUMOS.map(() => '?').join(',');
  return db
    .prepare(
      `
    SELECT id, nombre, rubro, unidad, stock_actual, stock_minimo, nota_compra
    FROM inventario_insumos
    WHERE nombre IN (${placeholders})
    ORDER BY CASE nombre
      ${BASE_INSUMOS.map((name, index) => `WHEN '${name.replace(/'/g, "''")}' THEN ${index}`).join(' ')}
      ELSE 99
    END
  `
    )
    .all(...BASE_INSUMOS)
    .map((item) => ({
      ...item,
      stock_actual: roundStock(item.stock_actual || 0),
      stock_minimo: roundStock(item.stock_minimo || 0),
    }));
}

function loadDirectStockProducts() {
  return db
    .prepare(
      `
    SELECT p.id, p.nombre, p.stock_directo, c.nombre AS categoria
    FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
    WHERE p.activo = 1
      AND p.stock_mode != 'recipe'
      AND c.nombre IN ('Empanadas', 'Papas', 'Bebidas')
    ORDER BY c.orden ASC, p.nombre ASC
  `
    )
    .all()
    .map((item) => ({
      ...item,
      stock_directo: roundStock(item.stock_directo || 0),
    }));
}

function buildDailyClose(fecha = today()) {
  const pedidos = db
    .prepare(
      `
    SELECT *
    FROM pedidos
    WHERE ${fechaLocal('creado_en')} = ?
    ORDER BY datetime(creado_en) DESC
  `
    )
    .all(fecha);
  const validos = pedidos.filter((pedido) => pedido.estado !== 'cancelado');
  const payment = summarizePaymentRows(validos);
  const movimientos = db
    .prepare(
      `
    SELECT *
    FROM caja_movimientos
    WHERE ${fechaLocal('creado_en')} = ?
    ORDER BY datetime(creado_en) DESC
  `
    )
    .all(fecha);
  const gastos = movimientos
    .filter((mov) => mov.tipo === 'salida')
    .reduce((acc, mov) => acc + Number(mov.monto || 0), 0);
  const ingresosExtra = movimientos
    .filter((mov) => mov.tipo === 'entrada')
    .reduce((acc, mov) => acc + Number(mov.monto || 0), 0);
  const deliveryDiario = db
    .prepare(
      `
    SELECT COALESCE(SUM(monto_base), 0) AS total, COUNT(*) AS cantidad
    FROM personal
    WHERE activo = 1
      AND lower(rol_operativo) = 'delivery'
      AND lower(frecuencia_pago) = 'diario'
  `
    )
    .get();

  const topProductos = db
    .prepare(
      `
    SELECT pi.nombre, SUM(pi.cantidad) AS cantidad, SUM(pi.subtotal) AS total
    FROM pedido_items pi
    JOIN pedidos p ON p.id = pi.pedido_id
    WHERE ${fechaLocal('p.creado_en')} = ?
      AND p.estado != 'cancelado'
    GROUP BY pi.nombre
    ORDER BY cantidad DESC, total DESC
    LIMIT 8
  `
    )
    .all(fecha);

  const totalVentas = validos.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0);
  const gananciaOperativa = totalVentas - gastos - Number(deliveryDiario.total || 0);

  return {
    fecha,
    pedidos: validos.length,
    cancelados: pedidos.length - validos.length,
    totalVentas: money(totalVentas),
    ticketPromedio: validos.length ? money(totalVentas / validos.length) : 0,
    efectivo: money(payment.efectivoCobrado || 0),
    digitales: money(payment.digitalesCobrados || 0),
    pendiente: money(payment.totalPendiente || 0),
    gastos: money(gastos),
    ingresosExtra: money(ingresosExtra),
    deliveryDiario: money(deliveryDiario.total || 0),
    gananciaOperativa: money(gananciaOperativa),
    porMetodo: payment.byMethod,
    topProductos,
    movimientos,
  };
}

function buildPointStatus() {
  const activeProducts = db.prepare('SELECT COUNT(*) AS c FROM productos WHERE activo = 1').get().c;
  const recipeProducts = db
    .prepare("SELECT COUNT(*) AS c FROM productos WHERE activo = 1 AND stock_mode = 'recipe'")
    .get().c;
  const missingStock = db
    .prepare(
      `
    SELECT COUNT(*) AS c
    FROM productos p
    WHERE p.activo = 1
      AND (
        (p.stock_mode = 'direct' AND COALESCE(p.stock_directo, 0) <= 0)
        OR (p.stock_mode = 'recipe' AND NOT EXISTS (SELECT 1 FROM inventario_recetas r WHERE r.producto_id = p.id))
      )
  `
    )
    .get().c;
  const rider = db
    .prepare(
      'SELECT id, nombre, telefono, codigo_acceso, direccion, activo FROM repartidores WHERE activo = 1 ORDER BY id LIMIT 1'
    )
    .get();
  const riders = db
    .prepare(
      `
    SELECT
      COUNT(*) AS activos,
      COALESCE(SUM(CASE WHEN disponible = 1 THEN 1 ELSE 0 END), 0) AS disponibles,
      COALESCE(SUM(CASE WHEN ultima_ubicacion_en IS NULL OR datetime(ultima_ubicacion_en) < datetime('now', '-3 minutes') THEN 1 ELSE 0 END), 0) AS gps_atrasado
    FROM repartidores
    WHERE activo = 1
  `
    )
    .get();
  const clientesConCompras = db
    .prepare('SELECT COUNT(*) AS c FROM clientes WHERE total_pedidos > 0')
    .get().c;
  const menuDelDia = db
    .prepare(
      `
    SELECT COUNT(*) AS c
    FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
    WHERE p.activo = 1
      AND lower(c.nombre) = lower('Menu del Dia')
      AND COALESCE(p.menu_dia_disponible_hoy, 0) = 1
  `
    )
    .get().c;
  const backups = listBackups();
  const latestBackup = backups[0] || null;
  const config = Object.fromEntries(
    db
      .prepare('SELECT clave, valor FROM configuracion')
      .all()
      .map((row) => [row.clave, row.valor])
  );
  const close = buildDailyClose(today());

  return [
    {
      id: 'inventario-fino',
      title: 'Inventario fino',
      ok: recipeProducts >= 37,
      detail: `${recipeProducts}/${activeProducts} productos usan receta compartida`,
    },
    {
      id: 'stock-diario',
      title: 'Stock diario rápido',
      ok: loadBaseInsumos().length >= 7,
      detail: 'Bases principales listas para cargar al inicio del día',
    },
    {
      id: 'cierre-diario',
      title: 'Cierre diario',
      ok: true,
      detail: `${close.pedidos} pedidos hoy, ventas $${close.totalVentas.toLocaleString('es-AR')}`,
    },
    {
      id: 'online-blindado',
      title: 'Pedidos online blindados',
      ok: missingStock === 0,
      detail: missingStock
        ? `${missingStock} productos pueden frenarse por stock`
        : 'Menú online respeta disponibilidad',
    },
    {
      id: 'delivery',
      title: 'Delivery',
      ok: Boolean(rider?.codigo_acceso) && Number(riders?.activos || 0) > 0,
      detail:
        Number(riders?.activos || 0) > 0
          ? `${Number(riders?.activos || 0)} riders activos · ${Number(riders?.disponibles || 0)} libres · ${Number(riders?.gps_atrasado || 0)} GPS a revisar`
          : 'Sin repartidor activo',
    },
    {
      id: 'clientes',
      title: 'Clientes y fidelización',
      ok: clientesConCompras > 0,
      detail: `${clientesConCompras} clientes con historial de compra`,
    },
    {
      id: 'menu-dia',
      title: 'Menu del dia',
      ok: menuDelDia > 0,
      detail:
        menuDelDia > 0 ? `${menuDelDia} opciones listas para vender` : 'No hay menu del dia activo',
    },
    {
      id: 'backups',
      title: 'Backups automáticos',
      ok: config.backup_automatico_activo === '1' && Boolean(latestBackup),
      detail: latestBackup
        ? `Último backup ${new Date(latestBackup.created_at).toLocaleString('es-AR')}`
        : 'Sin backups detectados',
    },
    {
      id: 'impresion',
      title: 'Impresión',
      ok: Boolean(config.impresion_formato),
      detail: `Formato ${config.impresion_formato || 'sin configurar'}, web auto ${config.impresion_auto_web === '1' ? 'sí' : 'no'}`,
    },
  ];
}

router.get('/resumen', requirePermission('dashboard.view'), (_req, res) => {
  const riders = db
    .prepare(
      `
    SELECT id, nombre, telefono, disponible, codigo_acceso, ultima_ubicacion_en
    FROM repartidores
    WHERE activo = 1
    ORDER BY disponible DESC, nombre ASC
  `
    )
    .all();
  const menuDelDia = db
    .prepare(
      `
    SELECT p.id, p.nombre, p.precio, p.stock_directo, p.menu_dia_disponible_hoy
    FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
    WHERE p.activo = 1
      AND lower(c.nombre) = lower('Menu del Dia')
      AND COALESCE(p.menu_dia_disponible_hoy, 0) = 1
    ORDER BY p.nombre ASC
  `
    )
    .all();

  res.json({
    puntos: buildPointStatus(),
    stockDiario: {
      insumos: loadBaseInsumos(),
      productosDirectos: loadDirectStockProducts(),
    },
    arranque: {
      riders,
      ridersGpsAtrasado: riders.filter(
        (rider) =>
          !rider.ultima_ubicacion_en ||
          Date.now() - new Date(rider.ultima_ubicacion_en).getTime() > 3 * 60 * 1000
      ).length,
      menuDelDia,
    },
    cierreDiario: buildDailyClose(today()),
    backups: listBackups().slice(0, 5),
  });
});

router.post('/stock-diario', requirePermission('productos.edit'), (req, res) => {
  const insumos = Array.isArray(req.body?.insumos) ? req.body.insumos : [];
  const productos = Array.isArray(req.body?.productos) ? req.body.productos : [];
  const updateInsumo = db.prepare(
    'UPDATE inventario_insumos SET stock_actual = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
  );
  const currentInsumo = db.prepare(
    'SELECT id, nombre, stock_actual FROM inventario_insumos WHERE id = ?'
  );
  const updateProduct = db.prepare(
    "UPDATE productos SET stock_directo = ?, stock_mode = 'direct' WHERE id = ?"
  );
  const currentProduct = db.prepare('SELECT id, nombre, stock_directo FROM productos WHERE id = ?');

  db.exec('BEGIN');
  try {
    insumos.forEach((item) => {
      const id = Number(item.id);
      const stock = roundStock(item.stock_actual);
      if (!Number.isFinite(id) || stock < 0) return;
      const previous = currentInsumo.get(id);
      if (!previous) return;
      const delta = roundStock(stock - Number(previous.stock_actual || 0));
      updateInsumo.run(stock, id);
      if (delta !== 0) {
        insertInventoryMovement(db, {
          insumo_id: id,
          cantidad: delta,
          tipo: 'ajuste',
          motivo: 'Carga de stock diario',
          detalle: {
            insumo_nombre: previous.nombre,
            anterior: previous.stock_actual,
            nuevo: stock,
          },
        });
      }
    });

    productos.forEach((item) => {
      const id = Number(item.id);
      const stock = roundStock(item.stock_directo);
      if (!Number.isFinite(id) || stock < 0) return;
      const previous = currentProduct.get(id);
      if (!previous) return;
      const delta = roundStock(stock - Number(previous.stock_directo || 0));
      updateProduct.run(stock, id);
      if (delta !== 0) {
        insertInventoryMovement(db, {
          producto_id: id,
          cantidad: delta,
          tipo: 'ajuste',
          motivo: 'Carga de stock diario',
          detalle: {
            producto_nombre: previous.nombre,
            anterior: previous.stock_directo,
            nuevo: stock,
          },
        });
      }
    });
    db.exec('COMMIT');
    res.json({
      success: true,
      stockDiario: { insumos: loadBaseInsumos(), productosDirectos: loadDirectStockProducts() },
    });
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    res.status(400).json({ error: error.message || 'No se pudo guardar el stock diario' });
  }
});

router.get('/cierre-diario', requirePermission('reportes.view'), (req, res) => {
  res.json(buildDailyClose(req.query.fecha || today()));
});

router.post('/backup', requirePermission('config.manage'), (_req, res) => {
  const backup = createDatabaseBackup(db, { reason: 'operacion-manual' });
  res.json({ success: true, backup });
});

router.post('/clientes/sincronizar', requirePermission('clientes.edit'), (_req, res) => {
  const clientes = db.prepare('SELECT id FROM clientes').all();
  clientes.forEach((cliente) => recalculateClienteStats(db, cliente.id));
  res.json({ success: true, total: clientes.length });
});

router.get('/menu-dia', requirePermission('dashboard.view'), (_req, res) => {
  res.json(buildMenuDiaManagerPayload());
});

router.post('/menu-dia', requirePermission('productos.edit'), (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  try {
    persistMenuDiaItems(items, today());
    res.json({ success: true, ...buildMenuDiaManagerPayload() });
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo guardar el menú del día' });
  }
});

router.post('/menu-dia/copiar-ayer', requirePermission('productos.edit'), (_req, res) => {
  const fecha = today();
  const anterior = latestMenuDiaSnapshotDate(fecha);
  if (!anterior) {
    return res.status(400).json({ error: 'No hay un menú del día anterior para copiar' });
  }

  const snapshot = loadMenuDiaSnapshot(anterior);
  if (!snapshot.length) {
    return res.status(400).json({ error: 'El último menú guardado no tiene productos' });
  }

  const payload = snapshot.map((item, index) => ({
    id: item.producto_id,
    disponible_hoy: item.disponible,
    precio_hoy: item.precio,
    stock_hoy: item.stock_directo,
    descripcion_hoy: item.descripcion,
    destacado_hoy: item.destacado,
    orden_hoy: Number(item.orden || index),
  }));

  try {
    persistMenuDiaItems(payload, fecha);
    res.json({ success: true, fuente: anterior, ...buildMenuDiaManagerPayload() });
  } catch (error) {
    res.status(400).json({ error: error.message || 'No se pudo copiar el menú del día anterior' });
  }
});

/**
 * Archiva un plato de la biblioteca del menú del día.
 *
 * No borra la fila: la desactiva. Un plato puede aparecer en pedidos viejos,
 * en reportes y en el historial de un cliente, así que eliminarlo dejaría
 * huérfanas esas referencias y rompería el detalle de ventas pasadas. Con
 * `activo = 0` desaparece del panel y de la web, y todo lo histórico sigue
 * mostrando qué se vendió.
 *
 * También apaga `menu_dia_disponible_hoy` para que no quede colgado saliendo
 * en la carta pública si se archiva estando activo.
 */
router.delete('/menu-dia/:productoId', requirePermission('productos.edit'), (req, res) => {
  const producto = db
    .prepare('SELECT id, nombre FROM productos WHERE id = ?')
    .get(req.params.productoId);

  if (!producto) {
    return res.status(404).json({ error: 'El plato no existe' });
  }

  db.prepare(
    `UPDATE productos
        SET activo = 0,
            menu_dia_disponible_hoy = 0
      WHERE id = ?`
  ).run(producto.id);

  return res.json({
    success: true,
    archivado: producto.nombre,
    ...buildMenuDiaManagerPayload(),
  });
});

/**
 * Config global del menú del día: lista maestra de guarniciones + precios base
 * + precios de extras. Editable desde la UI para no tener que redeployar.
 */
router.get('/menu-dia/config', requirePermission('productos.edit'), (_req, res) => {
  res.json(loadMenuDiaSettings());
});

router.put('/menu-dia/config', requirePermission('productos.edit'), (req, res) => {
  const upsert = db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  );
  const body = req.body || {};
  const num = (key, val, min = 0) => {
    const n = Number(val);
    if (Number.isFinite(n) && n >= min) {
      upsert.run(key, String(Math.round(n)));
    }
  };
  num('menu_dia_precio_economico', body.precioEconomico, 100);
  num('menu_dia_precio_ejecutivo', body.precioEjecutivo, 100);
  num('menu_dia_extra_postre_precio', body.extraPostrePrecio, 0);
  num('menu_dia_extra_bebida_postre_precio', body.extraBebidaPostrePrecio, 0);
  if (Array.isArray(body.guarnicionesLista)) {
    const clean = Array.from(
      new Set(body.guarnicionesLista.map((g) => String(g || '').trim()).filter(Boolean))
    );
    upsert.run('menu_dia_guarniciones_lista', JSON.stringify(clean));
  }
  res.json(loadMenuDiaSettings());
});

router.post('/menu-dia/nuevo', requirePermission('productos.edit'), (req, res) => {
  const fecha = today();
  const category = ensureMenuDiaCategory();
  const settings = loadMenuDiaSettings();
  const nombre = String(req.body?.nombre || '').trim();
  const descripcion = String(req.body?.descripcion || 'Menu del dia.').trim();
  const tipo = req.body?.tipo === 'ejecutivo' ? 'ejecutivo' : 'economico';
  const precioDefault = tipo === 'ejecutivo' ? settings.precioEjecutivo : settings.precioEconomico;
  const precio = roundStock(Math.max(0, Number(req.body?.precio || precioDefault)));
  const stock = roundStock(Math.max(0, Number(req.body?.stock_directo || 0)));
  const tiempo = roundStock(Math.max(1, Number(req.body?.tiempo_preparacion || 15)));

  // Guarniciones (variante obligatoria) y extras opcionales (postre / bebida+postre).
  // Todos vienen opcionales del UI para que crear un plato sin nada extra siga
  // funcionando exactamente igual que antes.
  const guarniciones = Array.isArray(req.body?.guarniciones) ? req.body.guarniciones : [];
  const ofrecePostre = Number(req.body?.ofrece_postre) === 1;
  const ofreceBebidaPostre = Number(req.body?.ofrece_bebida_postre) === 1 && tipo === 'ejecutivo';
  const variantes = buildMenuDiaVariantes(guarniciones);
  const extras = buildMenuDiaExtras({ ofrecePostre, ofreceBebidaPostre }, settings);

  if (!nombre) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }
  if (precio <= 0) {
    return res.status(400).json({ error: 'Precio inválido' });
  }

  const result = db
    .prepare(
      `
    INSERT INTO productos (
      nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras,
      activo, destacado, tiempo_preparacion, stock_directo, stock_mode, menu_dia_base, menu_dia_disponible_hoy, menu_dia_tipo
    ) VALUES (?, ?, ?, 0, ?, '', ?, ?, 1, 0, ?, ?, 'direct', 1, 1, ?)
  `
    )
    .run(nombre, descripcion, precio, category.id, variantes, extras, tiempo, stock, tipo);

  const created = db
    .prepare(
      `
    SELECT id, nombre, descripcion, precio, stock_directo, tiempo_preparacion, destacado, activo, menu_dia_base, menu_dia_disponible_hoy, menu_dia_tipo, variantes
    FROM productos
    WHERE id = ?
  `
    )
    .get(result.lastInsertRowid);

  db.prepare(
    `
    INSERT INTO menu_dia_historial (fecha, producto_id, disponible, precio, stock_directo, descripcion, destacado, orden)
    VALUES (?, ?, 1, ?, ?, ?, 0, ?)
    ON CONFLICT(fecha, producto_id) DO UPDATE SET
      disponible = 1,
      precio = excluded.precio,
      stock_directo = excluded.stock_directo,
      descripcion = excluded.descripcion,
      destacado = 0,
      actualizado_en = CURRENT_TIMESTAMP
  `
  ).run(fecha, result.lastInsertRowid, precio, stock, descripcion, Date.now());

  res.json({ success: true, created, ...buildMenuDiaManagerPayload() });
});

module.exports = router;

/*
  Se exponen para que el asistente arme el menú del día con exactamente la
  misma lógica que la pantalla: la misma categoría, el mismo apagado del resto
  de los platos, el mismo registro histórico.

  Reimplementarlo aparte sería garantizar que en algún momento las dos versiones
  se separen y el menú quede distinto según por dónde se cargue.
*/
module.exports.persistMenuDiaItems = persistMenuDiaItems;
module.exports.loadMenuDiaLibrary = loadMenuDiaLibrary;
