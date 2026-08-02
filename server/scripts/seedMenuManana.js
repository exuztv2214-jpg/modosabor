/**
 * Script para pre-cargar el menu del dia de MAÑANA con guarniciones.
 *
 * Uso:
 *   node server/scripts/seedMenuManana.js
 *
 * Qué hace:
 *   1. Se asegura que estén las guarniciones globales cargadas en `configuracion`.
 *   2. Crea/actualiza los 4 económicos y 4 ejecutivos pedidos por el local.
 *   3. Deja stock 10 en todos y desactiva alias/duplicados viejos del menú.
 *   4. Marca todos como disponibles hoy en el snapshot histórico.
 *
 * Idempotente: se puede correr varias veces sin duplicar.
 */
const db = require('../db');

const CATEGORY_NAME = 'Menu del Dia';

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

const PRECIO_ECONOMICO = 5000;
const PRECIO_EJECUTIVO = 7000;
const STOCK_MENU_DIA = 10;

function pesosToStorage(value) {
  return Math.round(Number(value || 0) * 100);
}

const PLATOS = [
  {
    nombre: 'Wok de verduras y pollo',
    tipo: 'economico',
    descripcion: 'Wok casero de verduras y pollo. Elegí acompañamiento.',
    guarniciones: ['Arroz', 'Fideo'],
    aliases: ['Wok de verduras con pollo'],
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Canelón',
    tipo: 'economico',
    descripcion: 'Canelón casero. Elegí la salsa.',
    guarniciones: ['Salsa roja', 'Salsa blanca', 'Salsa mixta'],
    aliases: ['Canelones'],
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Guiso de lentejas y arroz',
    tipo: 'economico',
    descripcion: 'Guiso casero de lentejas y arroz.',
    guarniciones: [],
    aliases: ['Guiso de lenteja y arroz'],
    tiempo_preparacion: 20,
  },
  {
    nombre: 'Tarta de pollo y puerro',
    tipo: 'economico',
    descripcion: 'Porción de tarta de pollo y puerro.',
    guarniciones: [],
    tiempo_preparacion: 20,
  },
  {
    nombre: 'Costeleta de res a caballo',
    tipo: 'ejecutivo',
    descripcion: 'Costeleta de res con huevo a caballo.',
    guarniciones: [],
    aliases: ['Costeleta a la riojana'],
    tiempo_preparacion: 22,
  },
  {
    nombre: 'Costillita de cerdo al horno con papas',
    tipo: 'ejecutivo',
    descripcion: 'Costillita de cerdo al horno. Elegí guarnición.',
    guarniciones: [
      'Papas al horno',
      'Arroz blanco',
      'Arroz a la provenzal',
      'Fideo a la provenzal',
      'Papas',
      'Puré',
      'Arroz primavera',
    ],
    aliases: ['1/4 de pollo al horno'],
    tiempo_preparacion: 25,
  },
  {
    nombre: 'Albóndigas rellenas',
    tipo: 'ejecutivo',
    descripcion: 'Albóndigas rellenas. Elegí guarnición.',
    guarniciones: [
      'Arroz blanco',
      'Arroz a la provenzal',
      'Fideo a la provenzal',
      'Papas',
      'Puré',
      'Arroz primavera',
    ],
    tiempo_preparacion: 20,
  },
  {
    nombre: 'Suprema a la suiza',
    tipo: 'ejecutivo',
    descripcion: 'Suprema a la suiza. Elegí guarnición.',
    guarniciones: [
      'Arroz blanco',
      'Arroz a la provenzal',
      'Fideo a la provenzal',
      'Papas',
      'Puré',
      'Arroz primavera',
    ],
    aliases: [
      'Suprema a la suisa',
      'Suprema suiza',
      'Suprema napolitana',
      'Suprema a la napolitana',
    ],
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

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

console.log('Cargando configuración global...');
const upsertConfig = db.prepare(
  `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
   ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
);
upsertConfig.run('menu_dia_precio_economico', String(pesosToStorage(PRECIO_ECONOMICO)));
upsertConfig.run('menu_dia_precio_ejecutivo', String(pesosToStorage(PRECIO_EJECUTIVO)));
upsertConfig.run('menu_dia_extra_postre_precio', '0');
upsertConfig.run('menu_dia_extra_bebida_postre_precio', '0');
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
const findAlias = db.prepare(
  `SELECT id FROM productos WHERE categoria_id = ? AND lower(nombre) = lower(?) LIMIT 1`
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

console.log('\nMenú del día cargado con éxito.');
console.log(
  `   ${PLATOS.filter((p) => p.tipo === 'economico').length} económicos + ${PLATOS.filter((p) => p.tipo === 'ejecutivo').length} ejecutivos`
);
console.log(`   Stock: ${STOCK_MENU_DIA} unidades por plato`);
console.log(`   ${GUARNICIONES_GLOBALES.length} guarniciones globales disponibles`);
console.log('\nAbrí Operación → Menú del día para verificar y editar.\n');
