const db = require('../db');

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function moneyToNumber(value) {
  return Number(
    String(value || '')
      .replace(/\$/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .trim()
  );
}

const CATEGORY_DEFS = [
  { nombre: 'Pizzas', icono: '\u{1F355}', color: '#ef4444', orden: 1 },
  { nombre: 'Empanadas', icono: '\u{1F95F}', color: '#f97316', orden: 2 },
  { nombre: 'Milanesas', icono: '\u{1F969}', color: '#84cc16', orden: 3 },
  { nombre: 'Papas', icono: '\u{1F35F}', color: '#f59e0b', orden: 4 },
];

const MENU = {
  Pizzas: [
    ['Com\u00fan', 'Salsa, queso', '$6.000', '$3.500'],
    ['Com\u00fan con huevo', 'Queso + huevo', '$7.000', '$4.000'],
    ['Al ajillo', 'Chimichurri', '$6.500', '$3.750'],
    ['Napolitana', 'Tomate', '$7.000', '$4.000'],
    ['Napolitana Especial', 'Jamon', '$8.000', '$4.500'],
    ['Jam\u00f3n y morrones', 'Jamon + morrones', '$8.000', '$4.500'],
    ['Choclo', 'Choclo', '$8.000', '$4.500'],
    ['4 Quesos', 'Mix quesos', '$8.500', '$4.750'],
    ['Roquefort', 'Roquefort', '$8.500', '$4.750'],
    ['Pepperoni', 'Pepperoni', '$9.000', '$5.000'],
    ['R\u00facula y panceta', 'Rucula', '$9.000', '$5.000'],
    ['Full Cheddar', 'Papas + cheddar', '$10.000', '$5.500'],
  ],
  Empanadas: [
    ['Pollo', 'Empanadas sabor pollo.', '$7.000', '$4.000'],
    ['Jam\u00f3n y queso', 'Empanadas sabor jamon y queso.', '$7.000', '$4.000'],
    ['Verdura', 'Empanadas sabor verdura.', '$7.000', '$4.000'],
    ['Mondongo', 'Empanadas sabor mondongo.', '$8.000', '$4.500'],
    ['Matambre', 'Empanadas sabor matambre.', '$10.000', '$5.500'],
  ],
  Milanesas: [
    ['Cl\u00e1sica', 'Milanesa clasica.', '$10.000', '$8.500'],
    ['A caballo', 'Milanesa a caballo.', '$11.000', '$9.500'],
    ['Napolitana', 'Milanesa napolitana.', '$12.000', '$10.500'],
    ['4 Quesos', 'Milanesa cuatro quesos.', '$12.000', '$10.500'],
    ['Roquefort', 'Milanesa roquefort.', '$12.000', '$10.500'],
    ['Suiza', 'Milanesa suiza.', '$12.000', '$10.500'],
    ['Modo Cheddar', 'Milanesa cheddar.', '$12.000', '$10.500'],
    ['Mediterr\u00e1nea', 'Milanesa mediterranea.', '$13.000', '$11.500'],
    ['Dulce Picante', 'Milanesa dulce picante.', '$13.000', '$11.500'],
    ['BBQ', 'Milanesa BBQ.', '$15.000', '$13.500'],
  ],
  Papas: [['Papas Full Cheddar', 'Papas Full Cheddar.', '$7.000']],
};

function buildProductPayload(categoryName, row) {
  const [nombre, descripcion, priceA, priceB] = row;

  if (categoryName === 'Pizzas') {
    const mitad = moneyToNumber(priceB);
    const entera = moneyToNumber(priceA);
    return {
      nombre,
      descripcion,
      precio: mitad,
      variantes: JSON.stringify([
        {
          nombre: 'Presentacion',
          opciones: [
            { nombre: 'Mitad', precio_extra: 0 },
            { nombre: 'Entera', precio_extra: entera - mitad },
          ],
        },
      ]),
      extras: '[]',
      tiempo_preparacion: 20,
    };
  }

  if (categoryName === 'Empanadas') {
    const media = moneyToNumber(priceB);
    const docena = moneyToNumber(priceA);
    return {
      nombre,
      descripcion,
      precio: media,
      variantes: JSON.stringify([
        {
          nombre: 'Presentacion',
          opciones: [
            { nombre: 'Media docena', precio_extra: 0 },
            { nombre: 'Docena', precio_extra: docena - media },
          ],
        },
      ]),
      extras: '[]',
      tiempo_preparacion: 15,
    };
  }

  if (categoryName === 'Milanesas') {
    const ternera = moneyToNumber(priceA);
    const pollo = moneyToNumber(priceB);
    return {
      nombre,
      descripcion,
      precio: pollo,
      variantes: JSON.stringify([
        {
          nombre: 'Tipo',
          opciones: [
            { nombre: 'Pollo', precio_extra: 0 },
            { nombre: 'Ternera', precio_extra: ternera - pollo },
          ],
        },
      ]),
      extras: '[]',
      tiempo_preparacion: 20,
    };
  }

  return {
    nombre,
    descripcion,
    precio: moneyToNumber(priceA),
    variantes: '[]',
    extras: '[]',
    tiempo_preparacion: 12,
  };
}

const selectCategory = db.prepare('SELECT * FROM categorias WHERE lower(nombre) = lower(?)');
const insertCategory = db.prepare(
  'INSERT INTO categorias (nombre, icono, color, orden, activo) VALUES (?, ?, ?, ?, 1)'
);
const updateCategory = db.prepare(
  'UPDATE categorias SET icono = ?, color = ?, orden = ?, activo = 1 WHERE id = ?'
);
const selectProducts = db.prepare('SELECT * FROM productos');
const insertProduct = db.prepare(`
  INSERT INTO productos (
    nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras, activo, destacado, tiempo_preparacion, stock_directo, stock_mode
  ) VALUES (?, ?, ?, ?, ?, '', ?, ?, 1, 0, ?, ?, ?)
`);
const updateProduct = db.prepare(`
  UPDATE productos
  SET nombre = ?, descripcion = ?, precio = ?, categoria_id = ?, variantes = ?, extras = ?, activo = 1, tiempo_preparacion = ?
  WHERE id = ?
`);

const categories = {};
for (const category of CATEGORY_DEFS) {
  const existing = selectCategory.get(category.nombre);
  if (existing) {
    updateCategory.run(category.icono, category.color, category.orden, existing.id);
    categories[category.nombre] = existing.id;
  } else {
    const result = insertCategory.run(
      category.nombre,
      category.icono,
      category.color,
      category.orden
    );
    categories[category.nombre] = Number(result.lastInsertRowid);
  }
}

const existingProducts = selectProducts.all();
const existingMap = new Map(
  existingProducts.map((product) => [
    `${normalizeName(product.nombre)}::${product.categoria_id || ''}`,
    product,
  ])
);

let inserted = 0;
let updated = 0;

for (const [categoryName, rows] of Object.entries(MENU)) {
  const categoriaId = categories[categoryName];
  for (const row of rows) {
    const payload = buildProductPayload(categoryName, row);
    const key = `${normalizeName(payload.nombre)}::${categoriaId}`;
    const existing = existingMap.get(key);

    if (existing) {
      updateProduct.run(
        payload.nombre,
        payload.descripcion,
        payload.precio,
        categoriaId,
        payload.variantes,
        payload.extras,
        payload.tiempo_preparacion,
        existing.id
      );
      updated += 1;
    } else {
      insertProduct.run(
        payload.nombre,
        payload.descripcion,
        payload.precio,
        0,
        categoriaId,
        payload.variantes,
        payload.extras,
        payload.tiempo_preparacion,
        999,
        'direct'
      );
      inserted += 1;
    }
  }
}

const totalProductos = db.prepare('SELECT COUNT(*) as c FROM productos').get().c;
console.log(
  JSON.stringify(
    {
      ok: true,
      categories: Object.keys(categories).length,
      inserted,
      updated,
      totalProductos,
    },
    null,
    2
  )
);
