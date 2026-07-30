const db = require('../db');

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const CATEGORY = {
  nombre: 'Menu del Dia',
  icono: '\u{1F37D}',
  color: '#16a34a',
  orden: 0,
};

const MENU_PRICE = 5000;
const MENU_STOCK = 20;

const MENU_ITEMS = [
  {
    nombre: 'Bombita de papas',
    descripcion: 'Menu del dia.',
    tiempo_preparacion: 15,
  },
  {
    nombre: 'Costillita de cerdo al horno con papas',
    descripcion: 'Menu del dia.',
    tiempo_preparacion: 20,
  },
  {
    nombre: 'Canelones',
    descripcion: 'Menu del dia.',
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Suprema a la napolitana',
    descripcion: 'Menu del dia.',
    tiempo_preparacion: 20,
  },
  {
    nombre: 'Wok de verduras con pollo',
    descripcion: 'Menu del dia. Elegi fideo o arroz.',
    tiempo_preparacion: 18,
    variantes: [
      {
        nombre: 'Acompanamiento',
        opciones: [
          { nombre: 'Fideo', precio_extra: 0 },
          { nombre: 'Arroz', precio_extra: 0 },
        ],
      },
    ],
  },
];

const selectCategory = db.prepare(`
  SELECT *
  FROM categorias
  WHERE lower(nombre) = lower(?)
  LIMIT 1
`);
const insertCategory = db.prepare(`
  INSERT INTO categorias (nombre, icono, color, orden, activo, imagen, subcategorias)
  VALUES (?, ?, ?, ?, 1, '', '[]')
`);
const updateCategory = db.prepare(`
  UPDATE categorias
  SET nombre = ?, icono = ?, color = ?, orden = ?, activo = 1
  WHERE id = ?
`);

const selectProductsByCategory = db.prepare(`
  SELECT *
  FROM productos
  WHERE categoria_id = ?
`);
const insertProduct = db.prepare(`
  INSERT INTO productos (
    nombre, descripcion, precio, costo, precio_anterior, categoria_id, imagen, variantes, extras,
    activo, destacado, tiempo_preparacion, stock_directo, stock_mode, menu_dia_base, menu_dia_disponible_hoy
  ) VALUES (?, ?, ?, ?, NULL, ?, '', ?, ?, 1, 1, ?, ?, 'direct', 1, 1)
`);
const updateProduct = db.prepare(`
  UPDATE productos
  SET nombre = ?,
      descripcion = ?,
      precio = ?,
      costo = ?,
      categoria_id = ?,
      variantes = ?,
      extras = ?,
      activo = 1,
      destacado = 1,
      tiempo_preparacion = ?,
      stock_directo = ?,
      stock_mode = 'direct',
      menu_dia_base = 1,
      menu_dia_disponible_hoy = 1
  WHERE id = ?
`);
const deactivateProduct = db.prepare(`
  UPDATE productos
  SET activo = 0,
      destacado = 0
  WHERE id = ?
`);

let categoryId = null;
let inserted = 0;
let updated = 0;
let deactivated = 0;

db.exec('BEGIN');
try {
  const existingCategory = selectCategory.get(CATEGORY.nombre);
  if (existingCategory) {
    updateCategory.run(
      CATEGORY.nombre,
      CATEGORY.icono,
      CATEGORY.color,
      CATEGORY.orden,
      existingCategory.id
    );
    categoryId = Number(existingCategory.id);
  } else {
    const result = insertCategory.run(
      CATEGORY.nombre,
      CATEGORY.icono,
      CATEGORY.color,
      CATEGORY.orden
    );
    categoryId = Number(result.lastInsertRowid);
  }

  const existingProducts = selectProductsByCategory.all(categoryId);
  const existingByName = new Map(
    existingProducts.map((product) => [normalizeName(product.nombre), product])
  );
  const keepNames = new Set();

  for (const item of MENU_ITEMS) {
    const key = normalizeName(item.nombre);
    keepNames.add(key);

    const variantes = JSON.stringify(item.variantes || []);
    const extras = '[]';
    const existing = existingByName.get(key);

    if (existing) {
      updateProduct.run(
        item.nombre,
        item.descripcion,
        MENU_PRICE,
        0,
        categoryId,
        variantes,
        extras,
        item.tiempo_preparacion,
        MENU_STOCK,
        existing.id
      );
      updated += 1;
    } else {
      insertProduct.run(
        item.nombre,
        item.descripcion,
        MENU_PRICE,
        0,
        categoryId,
        variantes,
        extras,
        item.tiempo_preparacion,
        MENU_STOCK
      );
      inserted += 1;
    }
  }

  for (const product of existingProducts) {
    if (!keepNames.has(normalizeName(product.nombre))) {
      deactivateProduct.run(product.id);
      deactivated += 1;
    }
  }

  db.exec('COMMIT');
} catch (error) {
  try {
    db.exec('ROLLBACK');
  } catch {}
  throw error;
}

const current = db
  .prepare(
    `
  SELECT id, nombre, precio, activo, destacado, stock_directo, variantes
  FROM productos
  WHERE categoria_id = ?
  ORDER BY nombre ASC
`
  )
  .all(categoryId);

console.log(
  JSON.stringify(
    {
      ok: true,
      categoria: CATEGORY.nombre,
      categoria_id: categoryId,
      precio: MENU_PRICE,
      insertados: inserted,
      actualizados: updated,
      desactivados: deactivated,
      productos: current.map((product) => ({
        ...product,
        variantes: JSON.parse(product.variantes || '[]'),
      })),
    },
    null,
    2
  )
);
