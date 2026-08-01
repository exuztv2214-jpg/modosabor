/**
 * Script para pre-cargar el menú del día de MAÑANA con guarniciones y extras
 * ya asignados por plato. Usa el sistema nuevo de variantes+extras autogenerado.
 *
 * Uso:
 *   node server/scripts/seedMenuManana.js
 *
 * Qué hace:
 *   1. Se asegura que estén las guarniciones globales cargadas en `configuracion`.
 *   2. Crea/actualiza los 4 económicos y 3 ejecutivos de mañana.
 *   3. Marca todos como disponibles hoy en el snapshot histórico.
 *
 * Idempotente: se puede correr varias veces sin duplicar.
 */
const db = require('../db');

const CATEGORY_NAME = 'Menu del Dia';

// ── Config global obligatoria ────────────────────────────────────────
const GUARNICIONES_GLOBALES = [
  'Arroz blanco',
  'Arroz a la provenzal',
  'Arroz primavera',
  'Puré',
  'Papas fritas',
  'Ensalada mixta',
  'Ensalada rusa',
  'Fideo a la provenzal',
  'Arroz',
  'Fideo',
  'Salsa roja',
  'Salsa blanca',
  'Salsa mixta',
];
const PRECIO_ECONOMICO = 5000;
const PRECIO_EJECUTIVO = 7000;
const EXTRA_POSTRE = 1000;
const EXTRA_BEBIDA_POSTRE = 1000;

// ── Platos del menú de mañana ────────────────────────────────────────
const PLATOS = [
  // ─── ECONÓMICOS ($5.000) ───
  {
    nombre: 'Wok de verduras con pollo',
    tipo: 'economico',
    descripcion: 'Wok casero. Elegí acompañamiento.',
    guarniciones: ['Arroz', 'Fideo'],
    ofrece_postre: true,
    ofrece_bebida_postre: false,
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Canelones',
    tipo: 'economico',
    descripcion: 'Canelones caseros. Elegí la salsa.',
    guarniciones: ['Salsa roja', 'Salsa blanca', 'Salsa mixta'],
    ofrece_postre: true,
    ofrece_bebida_postre: false,
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Suprema napolitana',
    tipo: 'economico',
    descripcion: 'Suprema con jamón, tomate y queso. Elegí guarnición.',
    guarniciones: [
      'Arroz blanco',
      'Arroz a la provenzal',
      'Arroz primavera',
      'Puré',
      'Papas fritas',
      'Ensalada mixta',
      'Ensalada rusa',
      'Fideo a la provenzal',
    ],
    ofrece_postre: true,
    ofrece_bebida_postre: false,
    tiempo_preparacion: 20,
  },
  {
    nombre: 'Pollo al verdeo',
    tipo: 'economico',
    descripcion: 'Pollo a la sartén con salsa de verdeo. Elegí guarnición.',
    guarniciones: ['Arroz blanco', 'Puré', 'Papas fritas', 'Ensalada mixta', 'Ensalada rusa'],
    ofrece_postre: true,
    ofrece_bebida_postre: false,
    tiempo_preparacion: 20,
  },
  // ─── EJECUTIVOS ($7.000) ───
  {
    nombre: 'Costeleta a la riojana',
    tipo: 'ejecutivo',
    descripcion: 'Costeleta con jamón, huevo y tomate. Elegí guarnición.',
    guarniciones: [
      'Arroz blanco',
      'Arroz a la provenzal',
      'Puré',
      'Papas fritas',
      'Ensalada mixta',
      'Ensalada rusa',
    ],
    ofrece_postre: true,
    ofrece_bebida_postre: true,
    tiempo_preparacion: 22,
  },
  {
    nombre: '1/4 de pollo al horno',
    tipo: 'ejecutivo',
    descripcion: '1/4 de pollo al horno. Elegí guarnición.',
    guarniciones: ['Papas fritas', 'Puré', 'Ensalada mixta', 'Ensalada rusa', 'Arroz blanco'],
    ofrece_postre: true,
    ofrece_bebida_postre: true,
    tiempo_preparacion: 25,
  },
  {
    nombre: 'Bombita de papas',
    tipo: 'ejecutivo',
    descripcion: 'Bombitas rellenas. Elegí guarnición.',
    guarniciones: ['Ensalada mixta', 'Ensalada rusa', 'Arroz primavera'],
    ofrece_postre: true,
    ofrece_bebida_postre: true,
    tiempo_preparacion: 20,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────
function buildVariantes(guarniciones) {
  const opciones = (guarniciones || [])
    .map((g) => String(g || '').trim())
    .filter(Boolean)
    .map((nombre) => ({ nombre, precio_extra: 0 }));
  if (opciones.length === 0) return '[]';
  return JSON.stringify([{ nombre: 'Guarnición', opciones }]);
}

function buildExtras(ofrecePostre, ofreceBebidaPostre) {
  const arr = [];
  if (ofrecePostre) arr.push({ nombre: 'Postre', precio: EXTRA_POSTRE });
  if (ofreceBebidaPostre) arr.push({ nombre: 'Bebida + Postre', precio: EXTRA_BEBIDA_POSTRE });
  return JSON.stringify(arr);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 1. Configuración global ──────────────────────────────────────────
console.log('▶ Cargando configuración global...');
const upsertConfig = db.prepare(
  `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
   ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
);
upsertConfig.run('menu_dia_precio_economico', String(PRECIO_ECONOMICO));
upsertConfig.run('menu_dia_precio_ejecutivo', String(PRECIO_EJECUTIVO));
upsertConfig.run('menu_dia_extra_postre_precio', String(EXTRA_POSTRE));
upsertConfig.run('menu_dia_extra_bebida_postre_precio', String(EXTRA_BEBIDA_POSTRE));
upsertConfig.run('menu_dia_guarniciones_lista', JSON.stringify(GUARNICIONES_GLOBALES));

// ── 2. Categoría Menú del Día ────────────────────────────────────────
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

// ── 3. Reset de disponibilidad ───────────────────────────────────────
db.prepare(
  `UPDATE productos SET menu_dia_disponible_hoy = 0
   WHERE categoria_id = ? OR COALESCE(menu_dia_base, 0) = 1`
).run(categoria.id);

// ── 4. Upsert de cada plato ──────────────────────────────────────────
const fecha = today();
console.log(`▶ Cargando ${PLATOS.length} platos para la fecha ${fecha}...`);

const findByName = db.prepare(
  `SELECT id FROM productos WHERE lower(nombre) = lower(?) AND categoria_id = ? LIMIT 1`
);
const insertProduct = db.prepare(
  `INSERT INTO productos (
    nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras,
    activo, destacado, tiempo_preparacion, stock_directo, stock_mode,
    menu_dia_base, menu_dia_disponible_hoy, menu_dia_tipo
  ) VALUES (?, ?, ?, 0, ?, '', ?, ?, 1, 0, ?, ?, 'direct', 1, 1, ?)`
);
const updateProduct = db.prepare(
  `UPDATE productos
   SET descripcion = ?, precio = ?, variantes = ?, extras = ?,
       tiempo_preparacion = ?, stock_directo = ?, stock_mode = 'direct',
       activo = 1, menu_dia_base = 1, menu_dia_disponible_hoy = 1, menu_dia_tipo = ?
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

db.exec('BEGIN');
try {
  PLATOS.forEach((plato, index) => {
    const precio = plato.tipo === 'ejecutivo' ? PRECIO_EJECUTIVO : PRECIO_ECONOMICO;
    const variantes = buildVariantes(plato.guarniciones);
    const extras = buildExtras(plato.ofrece_postre, plato.ofrece_bebida_postre);
    const stockDefault = 20;

    const existing = findByName.get(plato.nombre, categoria.id);
    let productId;
    if (existing) {
      updateProduct.run(
        plato.descripcion,
        precio,
        variantes,
        extras,
        plato.tiempo_preparacion,
        stockDefault,
        plato.tipo,
        existing.id
      );
      productId = existing.id;
      console.log(`  ✓ Actualizado: ${plato.nombre} (${plato.tipo}, $${precio})`);
    } else {
      const res = insertProduct.run(
        plato.nombre,
        plato.descripcion,
        precio,
        categoria.id,
        variantes,
        extras,
        plato.tiempo_preparacion,
        stockDefault,
        plato.tipo
      );
      productId = res.lastInsertRowid;
      console.log(`  + Creado: ${plato.nombre} (${plato.tipo}, $${precio})`);
    }

    upsertSnapshot.run(fecha, productId, precio, stockDefault, plato.descripcion, index);
  });
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  console.error('✖ Error:', error.message);
  process.exit(1);
}

console.log('\n✅ Menú del día cargado con éxito.');
console.log(
  `   ${PLATOS.filter((p) => p.tipo === 'economico').length} económicos + ${PLATOS.filter((p) => p.tipo === 'ejecutivo').length} ejecutivos`
);
console.log(`   ${GUARNICIONES_GLOBALES.length} guarniciones globales disponibles`);
console.log('\nAbrí Operación → Menú del día para verificar y editar.\n');
