const db = require('../db');

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const CATEGORY_DEFS = [
  { nombre: 'Pizzas', icono: '🍕', color: '#ef4444', orden: 1 },
  { nombre: 'Empanadas', icono: '🥟', color: '#f97316', orden: 2 },
  { nombre: 'Milanesas', icono: '🥩', color: '#84cc16', orden: 3 },
  { nombre: 'Hamburguesas', icono: '🍔', color: '#dc2626', orden: 4 },
  { nombre: 'Papas', icono: '🍟', color: '#f59e0b', orden: 5 },
  { nombre: 'Bebidas', icono: '🥤', color: '#3b82f6', orden: 6 },
  { nombre: 'Sandwichs', icono: '🥪', color: '#8b5cf6', orden: 7 },
  { nombre: 'Agregados', icono: '➕', color: '#e11d48', orden: 8 },
];

function pizzaVariants(mediaCremoso, enteraCremoso, mediaMuzza, enteraMuzza) {
  return JSON.stringify([
    {
      nombre: 'Presentacion',
      opciones: [
        { nombre: 'Media Cremoso', precio_extra: 0 },
        { nombre: 'Entera Cremoso', precio_extra: enteraCremoso - mediaCremoso },
        { nombre: 'Media Muzza', precio_extra: mediaMuzza - mediaCremoso },
        { nombre: 'Entera Muzza', precio_extra: enteraMuzza - mediaCremoso },
      ],
    },
  ]);
}

function milanesaVariants(precioPollo, precioCarne) {
  return JSON.stringify([
    {
      nombre: 'Tipo',
      opciones: [
        { nombre: 'Pollo', precio_extra: 0 },
        { nombre: 'Carne', precio_extra: precioCarne - precioPollo },
      ],
    },
  ]);
}

function empanadaVariants(mediaDocena, docena) {
  return JSON.stringify([
    {
      nombre: 'Presentacion',
      opciones: [
        { nombre: 'Media docena', precio_extra: 0 },
        { nombre: 'Docena', precio_extra: docena - mediaDocena },
      ],
    },
  ]);
}

function sizeVariants(basePrice, xlPrice) {
  return JSON.stringify([
    {
      nombre: 'Tamano',
      opciones: [
        { nombre: 'S', precio_extra: 0 },
        { nombre: 'XL', precio_extra: xlPrice - basePrice },
      ],
    },
  ]);
}

function lomitoVariants(chico, grande) {
  return JSON.stringify([
    {
      nombre: 'Tamano',
      opciones: [
        { nombre: 'Chico', precio_extra: 0 },
        { nombre: 'Grande', precio_extra: grande - chico },
      ],
    },
  ]);
}

const MENU = {
  Pizzas: [
    {
      nombre: 'Común',
      descripcion: 'Prepizza, salsa, queso, aceitunas y oregano.',
      precio: 4500,
      variantes: pizzaVariants(4500, 8000, 5000, 9000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Común con huevo',
      descripcion: 'Prepizza, salsa, queso, huevo rallado, aceitunas y oregano.',
      precio: 5000,
      variantes: pizzaVariants(5000, 9000, 5500, 10000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Al Ajillo',
      descripcion: 'Prepizza, salsa, queso, chimichurri pizzero, aceitunas y oregano.',
      precio: 4500,
      variantes: pizzaVariants(4500, 8000, 5000, 9000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Napolitana',
      descripcion:
        'Prepizza, salsa, queso, rodajas de tomate, chimichurri pizzero, aceitunas y oregano.',
      precio: 5000,
      variantes: pizzaVariants(5000, 9000, 5500, 10000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Napolitana Especial',
      descripcion:
        'Prepizza, salsa, queso, jamón, rodajas de tomate, chimichurri pizzero, aceitunas y oregano.',
      precio: 5500,
      variantes: pizzaVariants(5500, 10000, 5500, 11000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Jamón y Morrones',
      descripcion:
        'Prepizza, salsa, queso, jamón, morrones, chimichurri pizzero, aceitunas y oregano.',
      precio: 5000,
      variantes: pizzaVariants(5000, 9000, 5500, 10000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Choclo',
      descripcion: 'Prepizza, salsa, queso, choclo en crema, aceitunas y oregano.',
      precio: 5000,
      variantes: pizzaVariants(5000, 9000, 5500, 10000),
      tiempo_preparacion: 20,
    },
    {
      nombre: '4 Quesos',
      descripcion: 'Prepizza, salsa, queso, mix de quesos, aceitunas y oregano.',
      precio: 5500,
      variantes: pizzaVariants(5500, 10000, 6000, 11000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Roquefort',
      descripcion: 'Prepizza, salsa, queso, roquefort, aceitunas y oregano.',
      precio: 5500,
      variantes: pizzaVariants(5500, 10000, 6000, 11000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Rúcula y Panceta',
      descripcion:
        'Prepizza, salsa, queso, hojas de rúcula, panceta salteada, aceitunas y oregano.',
      precio: 6000,
      variantes: pizzaVariants(6000, 11000, 6500, 12000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Full Cheddar',
      descripcion:
        'Prepizza, salsa, queso, papas fritas, panceta salteada, mucho cheddar, aceitunas y oregano.',
      precio: 7000,
      variantes: pizzaVariants(7000, 13000, 7500, 14000),
      tiempo_preparacion: 22,
    },
  ],
  Empanadas: [
    {
      nombre: 'Pollo',
      descripcion: 'Empanadas de pollo.',
      precio: 4500,
      variantes: empanadaVariants(4500, 8000),
      tiempo_preparacion: 15,
    },
    {
      nombre: 'Jamón y Queso',
      descripcion: 'Empanadas de jamón y queso.',
      precio: 5000,
      variantes: empanadaVariants(5000, 9000),
      tiempo_preparacion: 15,
    },
    {
      nombre: 'Verdura',
      descripcion: 'Empanadas de verdura.',
      precio: 4500,
      variantes: empanadaVariants(4500, 8000),
      tiempo_preparacion: 15,
    },
    {
      nombre: 'Matambre',
      descripcion: 'Empanadas de matambre.',
      precio: 7000,
      variantes: empanadaVariants(7000, 13000),
      tiempo_preparacion: 15,
    },
    {
      nombre: 'Mondongo',
      descripcion: 'Empanadas de mondongo.',
      precio: 4500,
      variantes: empanadaVariants(4500, 9000),
      tiempo_preparacion: 15,
    },
    {
      nombre: 'Sfijas',
      descripcion: 'Empanadas árabes sfijas.',
      precio: 5500,
      variantes: empanadaVariants(5500, 10000),
      tiempo_preparacion: 15,
    },
  ],
  Milanesas: [
    {
      nombre: 'Clásica',
      descripcion:
        'Milanesa de ternera o pollo. Simple, crocante y rendidora. La de siempre, la que nunca falla.',
      precio: 8500,
      variantes: milanesaVariants(8500, 10000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'A Caballo',
      descripcion: 'Milanesa de ternera o pollo, con dos huevos fritos.',
      precio: 9500,
      variantes: milanesaVariants(9500, 11000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Napolitana',
      descripcion:
        'Salsa de tomate, queso, jamón cocido opcional, oregano, rodajas de tomate, morrones y aceitunas. Jugosa, gratinada y bien clásica.',
      precio: 10500,
      variantes: milanesaVariants(10500, 12000),
      tiempo_preparacion: 22,
    },
    {
      nombre: '4 Quesos',
      descripcion: 'Mila clásica + queso + queso roquefort.',
      precio: 10500,
      variantes: milanesaVariants(10500, 12000),
      tiempo_preparacion: 22,
    },
    {
      nombre: 'Roquefort',
      descripcion: 'Mila clásica + queso + queso roquefort.',
      precio: 10500,
      variantes: milanesaVariants(10500, 12000),
      tiempo_preparacion: 22,
    },
    {
      nombre: 'Modo Suiza',
      descripcion:
        'Milanesa + jamón cocido + salsa blanca cremosa (bechamel) + queso gratinado. Opcional pro: toque de parmesano arriba.',
      precio: 10500,
      variantes: milanesaVariants(10500, 12000),
      tiempo_preparacion: 22,
    },
    {
      nombre: 'Modo Cheddar',
      descripcion: 'Milanesa + cheddar + panceta (bacon) + verdeo/ciboulette.',
      precio: 10500,
      variantes: milanesaVariants(10500, 12000),
      tiempo_preparacion: 22,
    },
    {
      nombre: 'Modo Sabor BBQ',
      descripcion:
        'Milanesa + cheddar + panceta (bacon) + cebolla caramelizada + 2 huevos fritos + salsa barbacoa.',
      precio: 11500,
      variantes: milanesaVariants(11500, 13000),
      tiempo_preparacion: 22,
    },
    {
      nombre: 'Dulce Picante',
      descripcion:
        'Milanesa + muzzarella + morrones asados + cebolla crispy + salsa picante agridulce (ají y ajo) + salsa fresca de tomate y cebolla con limón + verdeo.',
      precio: 11500,
      variantes: milanesaVariants(11500, 13000),
      tiempo_preparacion: 22,
    },
    {
      nombre: 'Mediterranea',
      descripcion:
        'Salsa de tomate + queso + rúcula + panceta + tomate confitado + parmesano + toque de oliva.',
      precio: 11500,
      variantes: milanesaVariants(11500, 13000),
      tiempo_preparacion: 22,
    },
  ],
  Hamburguesas: [
    {
      nombre: 'Smash Simple',
      descripcion: 'Pan de queso, smash 90g, cheddar, cebolla picada y salsa Big Sabor.',
      precio: 6000,
      variantes: '[]',
      tiempo_preparacion: 18,
    },
    {
      nombre: 'Bacon Cheese',
      descripcion: 'Pan de queso, smash 90g, cheddar, bacon y salsa BBQ.',
      precio: 6000,
      variantes: '[]',
      tiempo_preparacion: 18,
    },
    {
      nombre: 'Fast love',
      descripcion: 'Pan de queso, smash 90g, cheddar, lechuga, tomate y salsa teasty.',
      precio: 6000,
      variantes: '[]',
      tiempo_preparacion: 18,
    },
    {
      nombre: 'Golpe Bajo',
      descripcion: 'Pan de queso, smash 90g, cheddar, cebolla, pepinillos y salsa beat em up.',
      precio: 6500,
      variantes: '[]',
      tiempo_preparacion: 18,
    },
    {
      nombre: 'Street',
      descripcion: 'Pan de queso, smash 90g, cheddar, papas y ketchup.',
      precio: 6500,
      variantes: '[]',
      tiempo_preparacion: 18,
    },
    {
      nombre: 'Clasica',
      descripcion: 'Pan de queso, smash 90g, jamón, tybo, lechuga, tomate, huevo y mayonesa.',
      precio: 7000,
      variantes: '[]',
      tiempo_preparacion: 18,
    },
    {
      nombre: 'Bacon Cheese Doble',
      descripcion: 'Pan de papa, doble smash 90g, doble cheddar, bacon y salsa alioli / teasty.',
      precio: 9000,
      variantes: '[]',
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Onion Crispy',
      descripcion: 'Pan de papa, doble smash 90g, cheddar, cebolla crispy y salsa teasty / BBQ.',
      precio: 9000,
      variantes: '[]',
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Bajon Extremo',
      descripcion:
        'Pan de papa, doble smash 90g, doble cheddar, bacon, huevo, aros de cebolla y salsa teasty / BBQ.',
      precio: 9500,
      variantes: '[]',
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Tentación',
      descripcion:
        'Pan de papa, doble smash 90g, doble cheddar, doble bacon, cebolla caramelizada y salsa honey / BBQ.',
      precio: 9500,
      variantes: '[]',
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Blue Nuts',
      descripcion:
        'Pan de papa, doble smash 90g, queso azul, doble bacon, cebolla caramelizada, nueces y salsa honey / BBQ.',
      precio: 9500,
      variantes: '[]',
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Route 66',
      descripcion:
        'Pan de papa, doble smash 90g, queso dambo, hongos salteados, cebolla caramelizada y salsa honey / BBQ.',
      precio: 9500,
      variantes: '[]',
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Sin Culpa',
      descripcion: 'Pan de papa, triple smash 90g, triple cheddar, bacon y salsa teasty.',
      precio: 12000,
      variantes: '[]',
      tiempo_preparacion: 22,
    },
    {
      nombre: 'Demencial',
      descripcion:
        'Pan de papa, triple smash 90g, triple cheddar, bacon, huevo, papas y salsa teasty.',
      precio: 13000,
      variantes: '[]',
      tiempo_preparacion: 22,
    },
    {
      nombre: 'Overdose',
      descripcion:
        'Pan de papa, triple smash 90g, triple cheddar, bacon, cebolla caramelizada y salsa teasty.',
      precio: 13000,
      variantes: '[]',
      tiempo_preparacion: 22,
    },
    {
      nombre: 'Apocalipsis',
      descripcion:
        'Pan de papa, cuádruple smash 90g, cuádruple cheddar, bacon, lechuga, tomate, huevo y salsa teasty.',
      precio: 16000,
      variantes: '[]',
      tiempo_preparacion: 24,
    },
  ],
  Papas: [
    {
      nombre: 'Papas Full Cheddar',
      descripcion:
        'Papas fritas (250 g), panceta crocante (25 g), abundante cheddar (120 g) y verdeo.',
      precio: 4000,
      variantes: sizeVariants(4000, 7000),
      tiempo_preparacion: 15,
    },
    {
      nombre: 'Salchipapas',
      descripcion: 'Papas fritas (250 g) con salchichas doradas, cheddar y verdeo.',
      precio: 4000,
      variantes: sizeVariants(4000, 7000),
      tiempo_preparacion: 15,
    },
    {
      nombre: 'Papas Criollas',
      descripcion: 'Papas fritas, huevo frito, cebolla salteada y verdeo.',
      precio: 4000,
      variantes: sizeVariants(4000, 7000),
      tiempo_preparacion: 15,
    },
  ],
  Bebidas: [
    {
      nombre: 'Jugo Fresh 600 ml',
      descripcion: 'Bebida Jugo Fresh 600 ml.',
      precio: 2000,
      variantes: '[]',
      tiempo_preparacion: 2,
    },
    {
      nombre: 'Jugo Fresh 1.5 lt',
      descripcion: 'Bebida Jugo Fresh 1.5 lt.',
      precio: 2500,
      variantes: '[]',
      tiempo_preparacion: 2,
    },
    {
      nombre: 'Pepsi lata',
      descripcion: 'Bebida Pepsi lata.',
      precio: 1500,
      variantes: '[]',
      tiempo_preparacion: 2,
    },
    {
      nombre: 'Pepsi 2 lt',
      descripcion: 'Bebida Pepsi 2 lt.',
      precio: 4000,
      variantes: '[]',
      tiempo_preparacion: 2,
    },
    {
      nombre: 'Mirinda 2 lt',
      descripcion: 'Bebida Mirinda 2 lt.',
      precio: 4000,
      variantes: '[]',
      tiempo_preparacion: 2,
    },
    {
      nombre: 'Pepsi 3 lt',
      descripcion: 'Bebida Pepsi 3 lt.',
      precio: 5000,
      variantes: '[]',
      tiempo_preparacion: 2,
    },
    {
      nombre: 'Mirinda 3 lt',
      descripcion: 'Bebida Mirinda 3 lt.',
      precio: 5000,
      variantes: '[]',
      tiempo_preparacion: 2,
    },
  ],
  Sandwichs: [
    {
      nombre: 'Común',
      descripcion: 'Pan bastón, lomito 150 gr, queso, lechuga, tomate y mayonesa casera.',
      precio: 8000,
      variantes: lomitoVariants(8000, 13000),
      tiempo_preparacion: 18,
    },
    {
      nombre: 'Especial',
      descripcion:
        'Pan bastón, lomito 150 gr, queso, jamón, huevo, lechuga, tomate y mayonesa casera.',
      precio: 8500,
      variantes: lomitoVariants(8500, 14000),
      tiempo_preparacion: 18,
    },
    {
      nombre: 'Modo Sabor',
      descripcion:
        'Pan bastón, lomito, doble cheddar, doble panceta, huevo, cebolla caramelizada, barbacoa y mayonesa de la casa.',
      precio: 9000,
      variantes: lomitoVariants(9000, 15000),
      tiempo_preparacion: 20,
    },
    {
      nombre: 'Napolitana',
      descripcion:
        'Pan bastón, lomito, cheddar, panceta crocante, huevo, cebolla crispy, morrón salteado y salsa picante de la casa.',
      precio: 10000,
      variantes: lomitoVariants(10000, 15500),
      tiempo_preparacion: 20,
    },
  ],
  Agregados: [
    {
      nombre: 'Papas',
      descripcion: 'Extra de papas.',
      precio: 1500,
      variantes: '[]',
      tiempo_preparacion: 5,
    },
    {
      nombre: 'Medallón de Carne',
      descripcion: 'Extra de medallón de carne.',
      precio: 2500,
      variantes: '[]',
      tiempo_preparacion: 5,
    },
    {
      nombre: 'Cheddar',
      descripcion: 'Extra de cheddar.',
      precio: 1000,
      variantes: '[]',
      tiempo_preparacion: 3,
    },
    {
      nombre: 'Huevo',
      descripcion: 'Extra de huevo.',
      precio: 1000,
      variantes: '[]',
      tiempo_preparacion: 3,
    },
  ],
};

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
    nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras, activo, destacado, tiempo_preparacion, stock_directo, stock_mode, precio_anterior
  ) VALUES (?, ?, ?, ?, ?, '', ?, ?, 1, 0, ?, 0, 'direct', NULL)
`);
const updateProduct = db.prepare(`
  UPDATE productos
  SET nombre = ?, descripcion = ?, precio = ?, categoria_id = ?, variantes = ?, extras = ?, activo = 1, tiempo_preparacion = ?, precio_anterior = NULL
  WHERE id = ?
`);
const deactivateProduct = db.prepare('UPDATE productos SET activo = 0 WHERE id = ?');

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
let deactivated = 0;
const authoritativeKeys = new Set();

db.exec('BEGIN');

try {
  for (const [categoryName, products] of Object.entries(MENU)) {
    const categoriaId = categories[categoryName];
    for (const product of products) {
      const key = `${normalizeName(product.nombre)}::${categoriaId}`;
      authoritativeKeys.add(key);
      const existing = existingMap.get(key);

      if (existing) {
        updateProduct.run(
          product.nombre,
          product.descripcion,
          product.precio,
          categoriaId,
          product.variantes,
          product.extras || '[]',
          product.tiempo_preparacion || 15,
          existing.id
        );
        updated += 1;
      } else {
        insertProduct.run(
          product.nombre,
          product.descripcion,
          product.precio,
          0,
          categoriaId,
          product.variantes,
          product.extras || '[]',
          product.tiempo_preparacion || 15
        );
        inserted += 1;
      }
    }
  }

  const managedCategoryIds = new Set(Object.values(categories));
  for (const product of existingProducts) {
    if (!managedCategoryIds.has(product.categoria_id)) continue;
    const key = `${normalizeName(product.nombre)}::${product.categoria_id || ''}`;
    if (!authoritativeKeys.has(key) && Number(product.activo || 0) === 1) {
      deactivateProduct.run(product.id);
      deactivated += 1;
    }
  }

  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

const resumen = db
  .prepare(
    `
  SELECT c.nombre AS categoria, COUNT(*) AS total, SUM(CASE WHEN p.activo = 1 THEN 1 ELSE 0 END) AS activos
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
  WHERE c.nombre IN (${CATEGORY_DEFS.map(() => '?').join(',')})
  GROUP BY c.nombre
  ORDER BY c.orden ASC, c.nombre ASC
`
  )
  .all(...CATEGORY_DEFS.map((item) => item.nombre));

console.log(
  JSON.stringify(
    {
      ok: true,
      inserted,
      updated,
      deactivated,
      categorias: CATEGORY_DEFS.length,
      resumen,
      nota: 'Lomito Napolitana grande cargado en 15500 por consistencia de escala de la carta.',
    },
    null,
    2
  )
);
