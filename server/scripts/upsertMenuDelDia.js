/**
 * Carga el menú del día de HOY.
 *
 * Uso:
 *   node server/scripts/upsertMenuDelDia.js
 *
 * Idempotente: se puede correr las veces que haga falta sin duplicar platos.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Este archivo estaba desactualizado y escribía mal dos cosas:
 *
 * 1. PRECIO. Tenía `MENU_PRICE = 5000` y lo guardaba tal cual, pero
 *    `productos.precio` se migró de REAL a INTEGER en centavos (ver
 *    `migrateMoneyColumns` en db/migrations.js). Cinco mil centavos son $50:
 *    el menú aparecía a cincuenta pesos en el TPV y en la carta online.
 *
 * 2. MECANISMO. No conocía `menu_dia_tipo` (económico / ejecutivo), ni las
 *    guarniciones como variantes, ni el snapshot diario en
 *    `menu_dia_historial`. Es decir, cargaba los platos pero por fuera de
 *    todo lo que la pantalla de Operación → Menú del día usa para funcionar.
 *
 * Ahora sigue el mismo mecanismo que `seedMenuManana.js`, que es el que el
 * sistema realmente lee. Si algún día se unifican los dos scripts, este es
 * el que hay que conservar.
 * ─────────────────────────────────────────────────────────────────────────
 */
const db = require('../db');

const CATEGORY_NAME = 'Menu del Dia';

const PRECIO_ECONOMICO = 5000;
const PRECIO_EJECUTIVO = 7000;
const STOCK_MENU_DIA = 20;

/** Los precios se escriben en pesos y la base guarda centavos. */
function pesosToStorage(value) {
  return Math.round(Number(value || 0) * 100);
}

const GUARNICIONES_GLOBALES = [
  'Arroz blanco',
  'Arroz a la provenzal',
  'Arroz primavera',
  'Puré',
  'Papas',
  'Papas al horno',
  'Papas fritas',
  'Fideo a la provenzal',
  'Arroz',
  'Fideo',
  'Salsa roja',
  'Salsa blanca',
  'Salsa mixta',
];

/** El juego de guarniciones que llevan los platos de milanesa/suprema. */
const GUARNICIONES_SUPREMA = [
  'Arroz blanco',
  'Arroz a la provenzal',
  'Fideo a la provenzal',
  'Papas',
  'Puré',
  'Arroz primavera',
];

const PLATOS = [
  // ── Menú económico · $5.000 ──
  {
    nombre: 'Canelón',
    tipo: 'economico',
    descripcion: 'Canelón casero. Elegí la salsa.',
    guarniciones: ['Salsa roja', 'Salsa blanca', 'Salsa mixta'],
    aliases: ['Canelones'],
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Wok de verduras y pollo',
    tipo: 'economico',
    descripcion: 'Wok casero de verduras y pollo. Elegí acompañamiento.',
    guarniciones: ['Arroz', 'Fideo'],
    aliases: ['Wok de verduras con pollo', 'Wok'],
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Fideo casero con salsa de pollo',
    tipo: 'economico',
    descripcion: 'Fideo casero con salsa de pollo.',
    guarniciones: [],
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Suprema a la napolitana',
    tipo: 'economico',
    descripcion: 'Suprema a la napolitana. Elegí guarnición.',
    guarniciones: GUARNICIONES_SUPREMA,
    // La fila de la suprema se reutiliza y se renombra según la del día.
    // `pedido_items` guarda el nombre como snapshot propio, así que los
    // pedidos viejos siguen mostrando el plato con el que se vendieron.
    aliases: ['Suprema a la suiza', 'Suprema suiza', 'Suprema napolitana'],
    tiempo_preparacion: 20,
  },
  {
    nombre: 'Zapallitos rellenos',
    tipo: 'economico',
    descripcion: 'Zapallitos rellenos caseros.',
    guarniciones: [],
    tiempo_preparacion: 20,
  },

  // ── Menú ejecutivo · $7.000 ──
  {
    nombre: 'Costeleta a la riojana',
    tipo: 'ejecutivo',
    descripcion: 'Costeleta a la riojana.',
    guarniciones: [],
    aliases: ['Costeleta de res a caballo'],
    tiempo_preparacion: 22,
  },
  {
    nombre: 'Marinera',
    tipo: 'ejecutivo',
    // No es suprema ni milanesa: es un corte fino aparte, que según la zona
    // se pide como escalope o como lampreado. Los tres nombres van en la
    // descripción para que el cliente que busca cualquiera de ellos la
    // reconozca en la carta online.
    descripcion: 'Marinera (escalope o lampreado). Elegí guarnición.',
    guarniciones: GUARNICIONES_SUPREMA,
    aliases: ['Escalope', 'Lampreado'],
    tiempo_preparacion: 22,
  },
  {
    nombre: 'Bife de pollo al verdeo',
    tipo: 'ejecutivo',
    descripcion: 'Bife de pollo con salsa de verdeo.',
    guarniciones: [],
    tiempo_preparacion: 20,
  },
];

function buildVariantes(guarniciones) {
  const opciones = (guarniciones || [])
    .map((g) => String(g || '').trim())
    .filter(Boolean)
    .map((nombre) => ({ nombre, precio_extra: 0 }));
  if (opciones.length === 0) return '[]';
  return JSON.stringify([{ nombre: 'Guarnición', opciones }]);
}

/** Fecha local. Con `toISOString()` after de las 21:00 en UTC-3 daría mañana. */
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

console.log('Cargando configuración global...');
const upsertConfig = db.prepare(
  `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
   ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
);
upsertConfig.run('menu_dia_precio_economico', String(pesosToStorage(PRECIO_ECONOMICO)));
upsertConfig.run('menu_dia_precio_ejecutivo', String(pesosToStorage(PRECIO_EJECUTIVO)));
upsertConfig.run('menu_dia_guarniciones_lista', JSON.stringify(GUARNICIONES_GLOBALES));

let categoria = db
  .prepare('SELECT * FROM categorias WHERE lower(nombre) = lower(?) LIMIT 1')
  .get(CATEGORY_NAME);
if (!categoria) {
  const res = db
    .prepare(
      `INSERT INTO categorias (nombre, icono, color, orden, activo, imagen, subcategorias)
       VALUES (?, '🍽️', '#16a34a', 0, 1, '', '[]')`
    )
    .run(CATEGORY_NAME);
  categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(res.lastInsertRowid);
}

const fecha = today();
console.log(`Cargando ${PLATOS.length} platos para la fecha ${fecha}...`);

const findByName = db.prepare(
  `SELECT id FROM productos WHERE lower(nombre) = lower(?) AND categoria_id = ? LIMIT 1`
);
const findAlias = db.prepare(
  `SELECT id FROM productos WHERE categoria_id = ? AND lower(nombre) = lower(?) LIMIT 1`
);
const insertProduct = db.prepare(
  `INSERT INTO productos (
    nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras,
    activo, destacado, tiempo_preparacion, stock_directo, stock_mode,
    menu_dia_base, menu_dia_disponible_hoy, menu_dia_tipo
  ) VALUES (?, ?, ?, 0, ?, '', ?, '[]', 1, 0, ?, ?, 'direct', 1, 1, ?)`
);
const updateProduct = db.prepare(
  `UPDATE productos
   SET nombre = ?, descripcion = ?, precio = ?, variantes = ?, extras = '[]',
       tiempo_preparacion = ?, stock_directo = ?, stock_mode = 'direct',
       activo = 1, menu_dia_base = 1, menu_dia_disponible_hoy = 1, menu_dia_tipo = ?
   WHERE id = ?`
);
const deactivateMenuProduct = db.prepare(
  `UPDATE productos
   SET activo = 0, menu_dia_base = 0, menu_dia_disponible_hoy = 0
   WHERE id = ?`
);
const upsertSnapshot = db.prepare(
  `INSERT INTO menu_dia_historial (fecha, producto_id, disponible, precio, stock_directo, descripcion, destacado, orden, actualizado_en)
   VALUES (?, ?, 1, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
   ON CONFLICT(fecha, producto_id) DO UPDATE SET
     disponible = 1,
     precio = excluded.precio,
     stock_directo = excluded.stock_directo,
     descripcion = excluded.descripcion,
     orden = excluded.orden,
     actualizado_en = CURRENT_TIMESTAMP`
);

const desiredNames = new Set(PLATOS.map((p) => p.nombre.toLocaleLowerCase('es')));
const aliasNames = new Set(
  PLATOS.flatMap((p) => p.aliases || []).map((name) => name.toLocaleLowerCase('es'))
);

db.exec('BEGIN');
try {
  // Primero se baja todo el menú de ayer y después se levanta el de hoy.
  db.prepare(
    `UPDATE productos SET menu_dia_disponible_hoy = 0
       WHERE categoria_id = ? OR COALESCE(menu_dia_base, 0) = 1`
  ).run(categoria.id);

  PLATOS.forEach((plato, index) => {
    const precio = pesosToStorage(plato.tipo === 'ejecutivo' ? PRECIO_EJECUTIVO : PRECIO_ECONOMICO);
    const variantes = buildVariantes(plato.guarniciones);

    let existing = findByName.get(plato.nombre, categoria.id);
    if (!existing) {
      for (const alias of plato.aliases || []) {
        existing = findAlias.get(categoria.id, alias);
        if (existing) break;
      }
    }

    let productId;
    if (existing) {
      updateProduct.run(
        plato.nombre,
        plato.descripcion,
        precio,
        variantes,
        plato.tiempo_preparacion,
        STOCK_MENU_DIA,
        plato.tipo,
        existing.id
      );
      productId = existing.id;
      console.log(`  ✓ Actualizado: ${plato.nombre} (${plato.tipo}, $${precio / 100})`);
    } else {
      const res = insertProduct.run(
        plato.nombre,
        plato.descripcion,
        precio,
        categoria.id,
        variantes,
        plato.tiempo_preparacion,
        STOCK_MENU_DIA,
        plato.tipo
      );
      productId = res.lastInsertRowid;
      console.log(`  + Creado: ${plato.nombre} (${plato.tipo}, $${precio / 100})`);
    }

    for (const alias of plato.aliases || []) {
      const duplicated = findAlias.get(categoria.id, alias);
      if (duplicated && Number(duplicated.id) !== Number(productId)) {
        deactivateMenuProduct.run(duplicated.id);
      }
    }

    upsertSnapshot.run(fecha, productId, precio, STOCK_MENU_DIA, plato.descripcion, index);
  });

  const staleRows = db
    .prepare(
      `SELECT id, nombre FROM productos
       WHERE categoria_id = ? AND (COALESCE(menu_dia_base, 0) = 1 OR COALESCE(menu_dia_disponible_hoy, 0) = 1)`
    )
    .all(categoria.id)
    .filter((row) => {
      const normalized = String(row.nombre || '').toLocaleLowerCase('es');
      return !desiredNames.has(normalized) && !aliasNames.has(normalized);
    });
  staleRows.forEach((row) => deactivateMenuProduct.run(row.id));

  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  console.error('Error:', error.message);
  process.exit(1);
}

const economicos = PLATOS.filter((p) => p.tipo === 'economico');
const ejecutivos = PLATOS.filter((p) => p.tipo === 'ejecutivo');

console.log('\nMenú del día cargado.');
console.log(`   ${economicos.length} económicos a $${PRECIO_ECONOMICO.toLocaleString('es-AR')}`);
console.log(`   ${ejecutivos.length} ejecutivos a $${PRECIO_EJECUTIVO.toLocaleString('es-AR')}`);
console.log(`   Stock: ${STOCK_MENU_DIA} por plato`);
console.log('\nAbrí Operación → Menú del día para verificar.\n');
