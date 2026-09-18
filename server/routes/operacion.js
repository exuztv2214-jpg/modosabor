const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { hasPermission, requirePermission } = require('../utils/permissions');
const {
  createDatabaseBackup,
  listBackups,
  backupStorageSummary,
} = require('../utils/backupManager');
const { getStorageUsage } = require('../utils/storagePaths');
const { insertInventoryMovement, roundStock } = require('../utils/inventory');
const { summarizePaymentRows } = require('../utils/paymentStatus');
const { recalculateClienteStats } = require('../utils/loyalty');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { asegurarNombreProductoUnico } = require('../utils/productosDuplicados');

const { fechaLocal, hoyArgentina } = require('../utils/fechaLocal');
const {
  guardarNombresDeLista,
  LISTA_GUARNICIONES,
  nombresDeLista,
} = require('../utils/opcionesCompartidas');
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
  return hoyArgentina();
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
const { menuDiaBenefits } = require('../utils/menuDiaBenefits');
const EXTRA_BEBIDA_POSTRE_NOMBRE = 'Bebida + Postre';
const VARIANTE_GUARNICION_NOMBRE = 'Guarnición';
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
    /*
      ── Una sola lista de guarniciones ────────────────────────────────────

      Antes vivía acá, en `configuracion.menu_dia_guarniciones_lista`, como un
      array de nombres sueltos. Cuando se agregaron las listas compartidas
      —guarniciones, salsas y agregados para toda la carta— quedaron dos
      sistemas haciendo lo mismo: uno para el menú del día y otro para el
      resto. Dos lugares donde cargar la misma guarnición, y ninguna forma de
      saber cuál era el bueno.

      Ahora la fuente es la lista compartida. La clave vieja queda sólo como
      red: si por lo que sea la lista no existe, el menú del día sigue
      funcionando con lo que había en vez de quedarse sin guarniciones en
      pleno servicio. La migración la crea en el primer arranque.
    */
    guarnicionesLista:
      nombresDeLista(db, LISTA_GUARNICIONES) ||
      parseJsonList(map.get('menu_dia_guarniciones_lista'), []),
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
    SELECT fecha, producto_id, disponible, precio, precio_economico, precio_ejecutivo,
           stock_directo, descripcion, destacado, orden
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
      /*
        Sin traerlos acá, la pantalla los recibía vacíos y al guardar se
        pisaban con cero: los dos tamaños se borraban solos en cada vuelta,
        sin que nadie tocara nada.
      */
      precio_economico: roundStock(item.precio_economico || 0),
      precio_ejecutivo: roundStock(item.precio_ejecutivo || 0),
      stock_directo: roundStock(item.stock_directo || 0),
      destacado: Number(item.destacado) === 1 ? 1 : 0,
      orden: Number(item.orden || 0),
    }));
}

function buildMenuDiaManagerPayload() {
  const fecha = today();
  const ultimaFecha = latestMenuDiaSnapshotDate(fecha);
  const snapshotHoy = new Map(loadMenuDiaSnapshot(fecha).map((item) => [item.producto_id, item]));
  const tieneMenuGuardadoHoy = snapshotHoy.size > 0;
  const settings = loadMenuDiaSettings();
  const items = loadMenuDiaLibrary().map((item, index) => {
    const snapshot = snapshotHoy.get(Number(item.id));
    const guarniciones = extractGuarnicionesFromVariantes(item.variantes);
    const extrasFlags = extractExtrasFlagsFromExtras(item.extras);
    return {
      ...item,
      // Un menú es diario. Si todavía no se guardó la foto de esta fecha, no
      // se reutiliza la marca vieja del producto: podría ser la de ayer.
      disponible_hoy: snapshot ? snapshot.disponible : 0,
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
      // Los dos tamaños del día, si se cargaron. En cero significan "este
      // plato hoy no se vende en esa porción".
      precio_economico_hoy: snapshot?.precio_economico || 0,
      precio_ejecutivo_hoy: snapshot?.precio_ejecutivo || 0,
    };
  });

  return {
    fecha,
    tieneMenuGuardadoHoy,
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
  const snapshotById = new Map(
    loadMenuDiaSnapshot(fecha).map((item) => [Number(item.producto_id), item])
  );
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
    INSERT INTO menu_dia_historial (fecha, producto_id, disponible, precio, precio_economico, precio_ejecutivo, stock_directo, descripcion, destacado, orden, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(fecha, producto_id) DO UPDATE SET
      disponible = excluded.disponible,
      precio = excluded.precio,
      precio_economico = excluded.precio_economico,
      precio_ejecutivo = excluded.precio_ejecutivo,
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
      const benefits = menuDiaBenefits(precio, existing.extras, descripcion);
      const hasBenefitRule = [500000, 700000, 900000].includes(precio);

      updateProduct.run(
        category.id,
        precio,
        hasBenefitRule ? benefits.descripcion : descripcion,
        stock,
        destacado,
        disponible,
        tipo,
        variantes,
        hasBenefitRule ? benefits.extras : extras,
        id
      );
      /*
        ── Los dos tamaños del mismo plato ────────────────────────────────────

        La misma suprema puede salir a $5.000 en porción chica y a $7.000 en
        grande, el mismo día. `menu_dia_tipo` guarda un solo valor, así que eso
        no se podía decir: la única salida era cargar el plato dos veces, y de
        ahí salen los duplicados que hay en la carta.

        Si no vienen, quedan en NULL y todo funciona como siempre, con `precio`
        y `menu_dia_tipo`. Sólo se guardan los que valen algo: un cero acá
        querría decir "se vende gratis en ese tamaño".
      */
      const previousSnapshot = snapshotById.get(id);
      const precioEconomico = Object.hasOwn(rawItem || {}, 'precio_economico_hoy')
        ? roundStock(Math.max(0, Number(rawItem.precio_economico_hoy || 0)))
        : roundStock(Math.max(0, Number(previousSnapshot?.precio_economico || 0)));
      const precioEjecutivo = Object.hasOwn(rawItem || {}, 'precio_ejecutivo_hoy')
        ? roundStock(Math.max(0, Number(rawItem.precio_ejecutivo_hoy || 0)))
        : roundStock(Math.max(0, Number(previousSnapshot?.precio_ejecutivo || 0)));

      upsertSnapshot.run(
        fecha,
        id,
        disponible,
        precio,
        precioEconomico || null,
        precioEjecutivo || null,
        stock,
        hasBenefitRule ? benefits.descripcion : descripcion,
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

/**
 * Actualiza un solo plato sin reconstruir el menú a mano desde el cliente.
 *
 * `persistMenuDiaItems` recibe la foto completa de hoy porque esa es la forma
 * segura de dejar afuera los platos no elegidos. Para editar uno desde el
 * asistente necesitamos primero conservar todos los demás y recién ahí aplicar
 * el cambio puntual: de otro modo "subí el stock de la mila" apagaría todo el
 * menú por accidente.
 */
function updateMenuDiaProduct(productId, changes = {}) {
  const id = Number(productId);
  const current = buildMenuDiaManagerPayload().items.find((item) => Number(item.id) === id);
  if (!current) throw new Error('El plato no existe en la biblioteca del menú del día.');

  const nextName = String(changes.nombre ?? current.nombre).trim();
  if (!nextName) throw new Error('El nombre del plato no puede quedar vacío.');
  const duplicate = db
    .prepare('SELECT id FROM productos WHERE LOWER(nombre) = LOWER(?) AND id != ? LIMIT 1')
    .get(nextName, id);
  if (duplicate) throw new Error(`Ya existe otro producto llamado "${nextName}".`);

  const nextTime = Math.max(
    1,
    Number(changes.tiempo_preparacion ?? current.tiempo_preparacion ?? 15)
  );
  if (!Number.isFinite(nextTime)) throw new Error('El tiempo de preparación no es válido.');

  const items = buildMenuDiaManagerPayload().items.map((item) => {
    const base = {
      id: item.id,
      disponible_hoy: item.disponible_hoy,
      precio_hoy: item.precio_hoy,
      stock_hoy: item.stock_hoy,
      descripcion_hoy: item.descripcion_hoy,
      destacado_hoy: item.destacado_hoy,
      orden_hoy: item.orden_hoy,
      tipo_hoy: item.tipo_hoy,
      precio_economico_hoy: item.precio_economico_hoy,
      precio_ejecutivo_hoy: item.precio_ejecutivo_hoy,
      guarniciones_hoy: item.guarniciones_hoy,
      ofrece_postre_hoy: item.ofrece_postre_hoy,
      ofrece_bebida_postre_hoy: item.ofrece_bebida_postre_hoy,
    };
    if (Number(item.id) !== id) return base;
    return {
      ...base,
      disponible_hoy:
        changes.disponible_hoy === undefined ? base.disponible_hoy : changes.disponible_hoy ? 1 : 0,
      precio_hoy: changes.precio_hoy ?? base.precio_hoy,
      precio_economico_hoy: changes.precio_economico_hoy ?? base.precio_economico_hoy,
      precio_ejecutivo_hoy: changes.precio_ejecutivo_hoy ?? base.precio_ejecutivo_hoy,
      stock_hoy: changes.stock_hoy ?? base.stock_hoy,
      descripcion_hoy: changes.descripcion_hoy ?? base.descripcion_hoy,
      destacado_hoy:
        changes.destacado_hoy === undefined ? base.destacado_hoy : changes.destacado_hoy ? 1 : 0,
      tipo_hoy: changes.tipo_hoy ?? base.tipo_hoy,
      guarniciones_hoy: changes.guarniciones_hoy ?? base.guarniciones_hoy,
      ofrece_postre_hoy:
        changes.ofrece_postre_hoy === undefined
          ? base.ofrece_postre_hoy
          : changes.ofrece_postre_hoy
            ? 1
            : 0,
      ofrece_bebida_postre_hoy:
        changes.ofrece_bebida_postre_hoy === undefined
          ? base.ofrece_bebida_postre_hoy
          : changes.ofrece_bebida_postre_hoy
            ? 1
            : 0,
    };
  });

  persistMenuDiaItems(items);
  db.prepare('UPDATE productos SET nombre = ?, tiempo_preparacion = ? WHERE id = ?').run(
    nextName,
    roundStock(nextTime),
    id
  );
  return buildMenuDiaManagerPayload().items.find((item) => Number(item.id) === id);
}

function archiveMenuDiaProduct(productId) {
  const id = Number(productId);
  const product = db.prepare('SELECT id, nombre FROM productos WHERE id = ?').get(id);
  if (!product) throw new Error('El plato no existe.');
  db.prepare(
    `UPDATE productos
        SET activo = 0,
            menu_dia_disponible_hoy = 0
      WHERE id = ?`
  ).run(id);
  return product;
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
    SELECT COALESCE(SUM(p.monto_base), 0) AS total, COUNT(*) AS cantidad
    FROM personal p
    WHERE p.activo = 1
      AND lower(p.rol_operativo) = 'delivery'
      AND lower(p.frecuencia_pago) = 'diario'
      AND EXISTS (
        SELECT 1
        FROM personal_asistencia a
        WHERE a.personal_id = p.id
          AND a.fecha_operativa = ?
          AND lower(a.estado) IN ('presente', 'tarde')
      )
  `
    )
    .get(fecha);

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
  const costoRows = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(COALESCE(pi.costo_unitario, 0) * pi.cantidad), 0) AS costo,
      COALESCE(SUM(pi.cantidad), 0) AS unidades,
      COALESCE(SUM(CASE WHEN COALESCE(pi.costo_unitario, 0) > 0 THEN pi.cantidad ELSE 0 END), 0) AS unidades_con_costo
    FROM pedido_items pi
    JOIN pedidos p ON p.id = pi.pedido_id
    WHERE ${fechaLocal('p.creado_en')} = ?
      AND p.estado != 'cancelado'
  `
    )
    .get(fecha);
  const costoMercaderia = Number(costoRows?.costo || 0);
  const unidades = Number(costoRows?.unidades || 0);
  const coberturaCostos = unidades
    ? Math.round((Number(costoRows?.unidades_con_costo || 0) / unidades) * 100)
    : 100;
  const resultadoOperativo =
    totalVentas + ingresosExtra - costoMercaderia - gastos - Number(deliveryDiario.total || 0);

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
    costoMercaderia: money(costoMercaderia),
    coberturaCostos,
    resultadoOperativo: money(resultadoOperativo),
    // Compatibilidad temporal con clientes anteriores. Conserva la unidad,
    // pero ya representa el resultado correcto con costo de mercaderia.
    gananciaOperativa: money(resultadoOperativo),
    porMetodo: payment.byMethod,
    topProductos,
    movimientos,
  };
}

function buildPointStatus({
  close = null,
  backups = null,
  baseInsumos = null,
  includeFinancial = false,
} = {}) {
  const activeProducts = db.prepare('SELECT COUNT(*) AS c FROM productos WHERE activo = 1').get().c;
  const recipeProducts = db
    .prepare("SELECT COUNT(*) AS c FROM productos WHERE activo = 1 AND stock_mode = 'recipe'")
    .get().c;
  const recipeProductsMissing = db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM productos p
        WHERE p.activo = 1
          AND p.stock_mode = 'recipe'
          AND NOT EXISTS (SELECT 1 FROM inventario_recetas r WHERE r.producto_id = p.id)`
    )
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
    FROM menu_dia_historial h
    JOIN productos p ON p.id = h.producto_id
    JOIN categorias c ON c.id = p.categoria_id
    WHERE h.fecha = ?
      AND h.disponible = 1
      AND p.activo = 1
      AND lower(c.nombre) = lower('Menu del Dia')
  `
    )
    .get(today()).c;
  const backupList = backups || listBackups();
  const latestBackup = backupList[0] || null;
  const latestBackupTime = latestBackup ? new Date(latestBackup.created_at).getTime() : 0;
  const backupFresh =
    Number.isFinite(latestBackupTime) && Date.now() - latestBackupTime <= 36 * 60 * 60 * 1000;
  const config = Object.fromEntries(
    db
      .prepare('SELECT clave, valor FROM configuracion')
      .all()
      .map((row) => [row.clave, row.valor])
  );
  const backupStorage = backupStorageSummary(backupList, {
    maxFiles: Number(config.backup_max_archivos || 14),
    maxTotalBytes: Number(config.backup_max_total_mb || 64) * 1024 * 1024,
  });
  const storageUsage = getStorageUsage();
  const dailyClose = close || buildDailyClose(today());
  const bases = baseInsumos || loadBaseInsumos();

  return [
    {
      id: 'inventario-fino',
      title: 'Inventario fino',
      ok: recipeProductsMissing === 0,
      detail:
        recipeProductsMissing === 0
          ? `${recipeProducts}/${activeProducts} productos usan receta y ninguna está incompleta`
          : `${recipeProductsMissing} productos con modo receta no tienen ingredientes cargados`,
    },
    {
      id: 'stock-diario',
      title: 'Stock diario rápido',
      ok: bases.length === BASE_INSUMOS.length,
      detail:
        bases.length === BASE_INSUMOS.length
          ? 'Bases principales listas para cargar al inicio del día'
          : `Faltan ${BASE_INSUMOS.length - bases.length} bases de cocina por configurar`,
    },
    {
      id: 'cierre-diario',
      title: 'Cierre diario',
      ok: true,
      detail: includeFinancial
        ? `${dailyClose.pedidos} pedidos hoy, ventas $${dailyClose.totalVentas.toLocaleString('es-AR')}`
        : `${dailyClose.pedidos} pedidos operados hoy`,
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
      ok:
        Boolean(rider?.codigo_acceso) &&
        Number(riders?.activos || 0) > 0 &&
        Number(riders?.gps_atrasado || 0) === 0,
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
      ok:
        config.backup_automatico_activo === '1' &&
        Boolean(latestBackup) &&
        backupFresh &&
        backupStorage.percentUsed <= 100,
      detail: latestBackup
        ? `${backupFresh ? 'Último backup' : 'Backup atrasado desde'} ${new Date(latestBackup.created_at).toLocaleString('es-AR')} · ${backupStorage.files} archivos, ${Math.ceil(backupStorage.totalBytes / 1024 / 1024)} MB de ${Math.ceil(backupStorage.maxTotalBytes / 1024 / 1024)} MB`
        : 'Sin backups detectados',
    },
    {
      id: 'almacenamiento',
      title: 'Espacio de datos',
      // A 85% todavía queda margen para hacer un backup y corregir el origen
      // del crecimiento. Esperar a que el volumen esté lleno hace que falle la
      // venta, el upload o el backup que justamente podría recuperarla.
      ok: !storageUsage || storageUsage.percentUsed < 85,
      detail: storageUsage
        ? `${Math.ceil(storageUsage.usedBytes / 1024 / 1024)} MB usados de ${Math.ceil(storageUsage.totalBytes / 1024 / 1024)} MB · ${Math.ceil(storageUsage.availableBytes / 1024 / 1024)} MB libres`
        : 'No se pudo medir el volumen en este entorno',
    },
    {
      id: 'impresion',
      title: 'Impresión',
      ok: Boolean(config.impresion_formato),
      detail: `Formato ${config.impresion_formato || 'sin configurar'}, web auto ${config.impresion_auto_web === '1' ? 'sí' : 'no'}`,
    },
  ];
}

router.get('/resumen', requirePermission('dashboard.view'), (req, res) => {
  const puedeVerFinanzas = hasPermission(req.user, 'dashboard.finanzas');
  const puedeEditarStock = hasPermission(req.user, 'productos.edit');
  const puedeVerDelivery = hasPermission(req.user, 'delivery.view');
  const puedeConfigurar = hasPermission(req.user, 'config.manage');
  const riders = puedeVerDelivery
    ? db
        .prepare(
          `
      SELECT id, nombre, telefono, disponible, ultima_ubicacion_en
      FROM repartidores
      WHERE activo = 1
      ORDER BY disponible DESC, nombre ASC
    `
        )
        .all()
    : [];
  const menuDelDia = db
    .prepare(
      `
    SELECT p.id, p.nombre,
           COALESCE(h.precio_economico, h.precio_ejecutivo, h.precio, p.precio) AS precio,
           h.stock_directo,
           h.disponible AS menu_dia_disponible_hoy
    FROM menu_dia_historial h
    JOIN productos p ON p.id = h.producto_id
    JOIN categorias c ON c.id = p.categoria_id
    WHERE h.fecha = ?
      AND h.disponible = 1
      AND p.activo = 1
      AND lower(c.nombre) = lower('Menu del Dia')
    ORDER BY p.nombre ASC
  `
    )
    .all(today());

  const close = buildDailyClose(today());
  const backups = listBackups();
  const baseInsumos = puedeEditarStock ? loadBaseInsumos() : [];
  res.json({
    puntos: buildPointStatus({
      close,
      backups,
      baseInsumos: puedeEditarStock ? baseInsumos : null,
      includeFinancial: puedeVerFinanzas,
    }),
    stockDiario: puedeEditarStock
      ? {
          insumos: baseInsumos,
          productosDirectos: loadDirectStockProducts(),
        }
      : { insumos: [], productosDirectos: [] },
    arranque: {
      riders,
      ridersGpsAtrasado: riders.filter(
        (rider) =>
          !rider.ultima_ubicacion_en ||
          Date.now() - new Date(rider.ultima_ubicacion_en).getTime() > 3 * 60 * 1000
      ).length,
      menuDelDia,
    },
    cierreDiario: puedeVerFinanzas
      ? close
      : { fecha: close.fecha, pedidos: close.pedidos, cancelados: close.cancelados },
    backups: puedeConfigurar ? backups.slice(0, 5) : [],
  });
});

// Vista reducida para el Dashboard. El resumen completo incluye stock diario,
// cierres, backups y datos de riders que esta pantalla no usa. Además de
// desperdiciar consultas en cada refresco, antes exponía `codigo_acceso` a
// cualquier rol con dashboard.view.
router.get('/dashboard', requirePermission('dashboard.view'), (req, res) => {
  res.json({
    puntos: buildPointStatus({
      includeFinancial: hasPermission(req.user, 'dashboard.finanzas'),
    }),
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

  const validarLote = (items, campo, buscar, etiqueta) => {
    const ids = new Set();
    return items.map((item, index) => {
      const id = Number(item?.id);
      const raw = item?.[campo];
      const value = Number(raw);
      if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`${etiqueta} ${index + 1}: identificador inválido`);
      }
      if (ids.has(id)) throw new Error(`${etiqueta} ${id}: está repetido en la carga`);
      if (raw === '' || raw === null || raw === undefined || !Number.isFinite(value) || value < 0) {
        throw new Error(`${etiqueta} ${id}: el stock debe ser un número igual o mayor que cero`);
      }
      if (!buscar.get(id)) throw new Error(`${etiqueta} ${id}: ya no existe`);
      ids.add(id);
      return { id, stock: roundStock(value) };
    });
  };

  let insumosValidados;
  let productosValidados;
  try {
    insumosValidados = validarLote(insumos, 'stock_actual', currentInsumo, 'Insumo');
    productosValidados = validarLote(productos, 'stock_directo', currentProduct, 'Producto');
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  db.exec('BEGIN');
  try {
    insumosValidados.forEach(({ id, stock }) => {
      const previous = currentInsumo.get(id);
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

    productosValidados.forEach(({ id, stock }) => {
      const previous = currentProduct.get(id);
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
    precio_economico_hoy: item.precio_economico,
    precio_ejecutivo_hoy: item.precio_ejecutivo,
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
  let producto;
  try {
    producto = archiveMenuDiaProduct(req.params.productoId);
  } catch (error) {
    return res.status(404).json({ error: error.message });
  }

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
    /*
      Se guarda en la lista compartida, que es la única fuente. La guarnición
      que se agregue acá aparece también en las milanesas y las supremas, que
      es justamente el punto.

      `guardarNombresDeLista` conserva el precio de las que ya estaban: si
      alguien le puso recargo a la ensalada desde la pantalla de listas, editar
      el menú del día no se lo borra.
    */
    guardarNombresDeLista(db, LISTA_GUARNICIONES, body.guarnicionesLista, {
      tipo: 'variante',
      obligatorio: 1,
    });
  }
  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'operacion',
    accion: 'actualizar_menu_dia_config',
    entidad: 'configuracion',
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      claves: [
        body.precioEconomico !== undefined && 'menu_dia_precio_economico',
        body.precioEjecutivo !== undefined && 'menu_dia_precio_ejecutivo',
        body.extraPostrePrecio !== undefined && 'menu_dia_extra_postre_precio',
        body.extraBebidaPostrePrecio !== undefined && 'menu_dia_extra_bebida_postre_precio',
        Array.isArray(body.guarnicionesLista) && 'menu_dia_guarniciones_lista',
      ].filter(Boolean),
    },
  });
  res.json(loadMenuDiaSettings());
});

function createMenuDiaProduct(body = {}) {
  const fecha = today();
  const category = ensureMenuDiaCategory();
  const settings = loadMenuDiaSettings();
  const nombre = String(body?.nombre || '').trim();
  const descripcion = String(body?.descripcion || 'Menu del dia.').trim();
  const tipo = body?.tipo === 'ejecutivo' ? 'ejecutivo' : 'economico';
  const precioDefault = tipo === 'ejecutivo' ? settings.precioEjecutivo : settings.precioEconomico;
  const precio = roundStock(Math.max(0, Number(body?.precio || precioDefault)));
  const stock = roundStock(Math.max(0, Number(body?.stock_directo || 0)));
  const tiempo = roundStock(Math.max(1, Number(body?.tiempo_preparacion || 15)));

  // Guarniciones (variante obligatoria) y extras opcionales (postre / bebida+postre).
  // Todos vienen opcionales del UI para que crear un plato sin nada extra siga
  // funcionando exactamente igual que antes.
  const guarniciones = Array.isArray(body?.guarniciones) ? body.guarniciones : [];
  const ofrecePostre = Number(body?.ofrece_postre) === 1;
  const ofreceBebidaPostre = Number(body?.ofrece_bebida_postre) === 1 && tipo === 'ejecutivo';
  const variantes = buildMenuDiaVariantes(guarniciones);
  const extras = buildMenuDiaExtras({ ofrecePostre, ofreceBebidaPostre }, settings);

  if (!nombre) {
    throw new Error('Nombre requerido');
  }
  if (precio <= 0) {
    throw new Error('Precio inválido');
  }

  asegurarNombreProductoUnico(db, {
    nombre,
    categoriaId: category.id,
  });

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

  return { success: true, created, ...buildMenuDiaManagerPayload() };
}

router.post('/menu-dia/nuevo', requirePermission('productos.edit'), (req, res) => {
  try {
    res.json(createMenuDiaProduct(req.body));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
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
module.exports.createMenuDiaProduct = createMenuDiaProduct;
module.exports.buildMenuDiaManagerPayload = buildMenuDiaManagerPayload;
module.exports.updateMenuDiaProduct = updateMenuDiaProduct;
module.exports.archiveMenuDiaProduct = archiveMenuDiaProduct;
module.exports.buildDailyClose = buildDailyClose;
module.exports.buildPointStatus = buildPointStatus;
