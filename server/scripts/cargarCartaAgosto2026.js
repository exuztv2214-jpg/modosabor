/*
 * Carta Modo Sabor - agosto 2026
 *
 * La fuente es el flyer aprobado en D:\Gato negro Creaciones\Flyer\Modo Sabor\Cartas.
 * Es idempotente: actualiza los productos que ya existen conservando sus IDs
 * (y por lo tanto el historial de pedidos). Por seguridad sólo escribe con
 * `--apply`; antes crea un backup SQLite con el administrador oficial.
 */
const db = require('../db');
const { createDatabaseBackup } = require('../utils/backupManager');

const aplicar = process.argv.includes('--apply');
const pesos = (importe) => Math.round(importe * 100);
const variantes = (nombre, opciones) =>
  JSON.stringify([
    {
      nombre,
      opciones: opciones.map(([opcion, precioExtra]) => ({
        nombre: opcion,
        precio_extra: pesos(precioExtra),
      })),
    },
  ]);

const presentacionPizza = (mediaCremoso, enteraCremoso, mediaMuzza, enteraMuzza) =>
  variantes('Presentación', [
    ['Media Cremoso', 0],
    ['Entera Cremoso', enteraCremoso - mediaCremoso],
    ['Media Muzza', mediaMuzza - mediaCremoso],
    ['Entera Muzza', enteraMuzza - mediaCremoso],
  ]);

const tipoMilanesa = (pollo, carne) =>
  variantes('Tipo', [
    ['Pollo', 0],
    ['Carne', carne - pollo],
  ]);
const tamanio = (chico, grande) =>
  variantes('Tamaño', [
    ['Chico', 0],
    ['Grande', grande - chico],
  ]);
const porcion = (media, docena) =>
  variantes('Presentación', [
    ['Media docena', 0],
    ['Docena', docena - media],
  ]);
const tamanioPapas = (s, xl) =>
  variantes('Tamaño', [
    ['S', 0],
    ['XL', xl - s],
  ]);

const carta = [
  [
    'Hamburguesas',
    [
      [
        'Smash Simple',
        6000,
        'Pan de queso, smash 90 g, cheddar, cebolla picada y salsa Big Sabor.',
      ],
      ['Bacon Cheese', 6000, 'Pan de queso, smash 90 g, cheddar, bacon y salsa BBQ.'],
      ['Fast love', 6000, 'Pan de queso, smash 90 g, cheddar, lechuga, tomate y salsa teasty.'],
      [
        'Golpe Bajo',
        6500,
        'Pan de queso, smash 90 g, cheddar, cebolla, pepinillos y salsa beat em up.',
      ],
      ['Street', 6500, 'Pan de queso, smash 90 g, cheddar, papas y ketchup.'],
      [
        'Clasica',
        7000,
        'Pan de queso, smash 90 g, jamón, tybo, lechuga, tomate, huevo y mayonesa.',
      ],
      [
        'Bacon Cheese Doble',
        9000,
        'Pan de papa, doble smash 90 g, doble cheddar, bacon y salsa alioli / teasty.',
      ],
      [
        'Onion Crispy',
        9000,
        'Pan de papa, doble smash 90 g, cheddar, cebolla crispy y salsa teasty / BBQ.',
      ],
      [
        'Bajon Extremo',
        9500,
        'Pan de papa, doble smash 90 g, doble cheddar, bacon, huevo, aros de cebolla y salsa teasty / BBQ.',
      ],
      [
        'Tentación',
        9500,
        'Pan de papa, doble smash 90 g, doble cheddar, doble bacon, cebolla caramelizada y salsa honey / BBQ.',
      ],
      [
        'Blue Nuts',
        9500,
        'Pan de papa, doble smash 90 g, queso azul, doble bacon, cebolla caramelizada, nueces y salsa honey / BBQ.',
      ],
      [
        'Route 66',
        9500,
        'Pan de papa, doble smash 90 g, queso dambo, hongos salteados, cebolla caramelizada y salsa honey / BBQ.',
      ],
      ['Sin Culpa', 12000, 'Pan de papa, triple smash 90 g, triple cheddar, bacon y salsa teasty.'],
      [
        'Demencial',
        13000,
        'Pan de papa, triple smash 90 g, triple cheddar, bacon, huevo, papas y salsa teasty.',
      ],
      [
        'Overdose',
        13000,
        'Pan de papa, triple smash 90 g, triple cheddar, bacon, cebolla caramelizada y salsa teasty.',
      ],
      [
        'Apocalipsis',
        16000,
        'Pan de papa, cuádruple smash 90 g, cuádruple cheddar, bacon, lechuga, tomate, huevo y salsa teasty.',
      ],
    ].map(([nombre, precio, descripcion]) => ({
      nombre,
      precio: pesos(precio),
      descripcion,
      variantes: '[]',
      extras: '[]',
    })),
  ],
  [
    'Milanesas',
    [
      [
        'Clásica',
        8500,
        10000,
        'Milanesa de ternera o pollo. Simple, crocante y rendidora. La de siempre, la que nunca falla.',
      ],
      ['A Caballo', 9500, 11000, 'Milanesa de ternera o pollo, con dos huevos fritos.'],
      [
        'Napolitana',
        10500,
        12000,
        'Salsa de tomate, queso, jamón cocido opcional, orégano, rodajas de tomate, morrones y aceitunas. Jugosa, gratinada y bien clásica.',
      ],
      ['4 Quesos', 10500, 12000, 'Mila clásica, queso y queso roquefort.'],
      ['Roquefort', 10500, 12000, 'Mila clásica, queso y queso roquefort.'],
      [
        'Modo Suiza',
        10500,
        12000,
        'Milanesa, jamón cocido, salsa blanca cremosa, queso gratinado y toque opcional de parmesano.',
      ],
      ['Modo Cheddar', 10500, 12000, 'Milanesa, cheddar, panceta (bacon) y verdeo/ciboulette.'],
      [
        'Modo Sabor BBQ',
        11500,
        13000,
        'Milanesa, cheddar, panceta (bacon), cebolla caramelizada, dos huevos fritos y salsa barbacoa.',
      ],
      [
        'Dulce Picante',
        11500,
        13000,
        'Milanesa, muzzarella, morrones asados, cebolla crispy, salsa picante agridulce y salsa fresca de tomate, cebolla, limón y verdeo.',
      ],
      [
        'Mediterranea',
        11500,
        13000,
        'Salsa de tomate, queso, rúcula, panceta, tomate confitado, parmesano y toque de oliva.',
      ],
    ].map(([nombre, pollo, carne, descripcion]) => ({
      nombre,
      precio: pesos(pollo),
      descripcion,
      variantes: tipoMilanesa(pollo, carne),
      extras: '[]',
    })),
  ],
  [
    'Pizzas',
    [
      ['Común', 4500, 8000, 5000, 9000, 'Prepizza, salsa, queso, aceitunas y orégano.'],
      [
        'Común con huevo',
        5000,
        9000,
        5500,
        10000,
        'Prepizza, salsa, queso, huevo rallado, aceitunas y orégano.',
      ],
      [
        'Al Ajillo',
        4500,
        8000,
        5000,
        9000,
        'Prepizza, salsa, queso, chimichurri pizzero, aceitunas y orégano.',
      ],
      [
        'Napolitana',
        5000,
        9000,
        5500,
        10000,
        'Prepizza, salsa, queso, rodajas de tomate, chimichurri pizzero, aceitunas y orégano.',
      ],
      [
        'Napolitana Especial',
        5500,
        10000,
        5500,
        11000,
        'Prepizza, salsa, queso, jamón, rodajas de tomate, chimichurri pizzero, aceitunas y orégano.',
      ],
      [
        'Jamón y Morrones',
        5000,
        9000,
        5500,
        10000,
        'Prepizza, salsa, queso, jamón, morrones, chimichurri pizzero, aceitunas y orégano.',
      ],
      [
        'Choclo',
        5000,
        9000,
        5500,
        10000,
        'Prepizza, salsa, queso, choclo en crema, aceitunas y orégano.',
      ],
      [
        '4 Quesos',
        5500,
        10000,
        6000,
        11000,
        'Prepizza, salsa, queso, mix de quesos, aceitunas y orégano.',
      ],
      [
        'Roquefort',
        5500,
        10000,
        6000,
        11000,
        'Prepizza, salsa, queso, roquefort, aceitunas y orégano.',
      ],
      [
        'Rúcula y Panceta',
        6000,
        11000,
        6500,
        12000,
        'Prepizza, salsa, queso, hojas de rúcula, panceta salteada, aceitunas y orégano.',
      ],
      [
        'Full Cheddar',
        7000,
        13000,
        7500,
        14000,
        'Prepizza, salsa, queso, papas fritas, panceta salteada, mucho cheddar, aceitunas y orégano.',
      ],
    ].map(([nombre, mediaC, enteraC, mediaM, enteraM, descripcion]) => ({
      nombre,
      precio: pesos(mediaC),
      descripcion,
      variantes: presentacionPizza(mediaC, enteraC, mediaM, enteraM),
      extras: '[]',
    })),
  ],
  [
    'Sandwichs',
    [
      [
        'Lomito Común',
        8000,
        13000,
        'Pan bastón, lomito 150 g, queso, lechuga, tomate y mayonesa casera.',
      ],
      [
        'Lomito Especial',
        8500,
        14000,
        'Pan bastón, lomito 150 g, queso, jamón, huevo, lechuga, tomate y mayonesa casera.',
      ],
      [
        'Lomito Modo Sabor',
        9000,
        15000,
        'Pan bastón, lomito, doble cheddar, doble panceta, huevo, cebolla caramelizada, barbacoa y mayonesa de la casa.',
      ],
      [
        'Lomito Super Modo',
        10000,
        16000,
        'Pan bastón, lomito, cheddar, panceta crocante, huevo, cebolla crispy, morrón salteado y salsa picante de la casa.',
      ],
      [
        'Milanesa Común',
        8000,
        13000,
        'Pan bastón, milanesa, queso, lechuga, tomate y mayonesa casera.',
      ],
      [
        'Milanesa Especial',
        8500,
        14000,
        'Pan bastón, milanesa, queso, jamón, huevo, lechuga, tomate y mayonesa casera.',
      ],
      [
        'Milanesa Modo Sabor',
        9000,
        15000,
        'Pan bastón, milanesa, doble cheddar, doble panceta, huevo, cebolla caramelizada, barbacoa y mayonesa de la casa.',
      ],
      [
        'Milanesa Super Modo',
        10000,
        16000,
        'Pan bastón, milanesa, cheddar, panceta crocante, huevo, cebolla crispy, morrón salteado y salsa picante de la casa.',
      ],
    ].map(([nombre, chico, grande, descripcion]) => ({
      nombre,
      precio: pesos(chico),
      descripcion,
      variantes: tamanio(chico, grande),
      extras: '[]',
    })),
  ],
  [
    'Empanadas',
    [
      ['Pollo', 4500, 8000, 'Empanadas de pollo.'],
      ['Jamón y Queso', 5500, 10000, 'Empanadas de jamón y queso.'],
      ['Verdura', 5000, 9000, 'Empanadas de verdura.'],
      ['Matambre', 7000, 13000, 'Empanadas de matambre.'],
      ['Mondongo', 5500, 10000, 'Empanadas de mondongo.'],
      ['Sfijas', 5500, 10000, 'Empanadas árabes sfijas.'],
    ].map(([nombre, media, docena, descripcion]) => ({
      nombre,
      precio: pesos(media),
      descripcion,
      variantes: porcion(media, docena),
      extras: '[]',
    })),
  ],
  [
    'Papas',
    [
      [
        'Papas Full Cheddar',
        4000,
        7000,
        'Papas fritas (250 g), panceta crocante (25 g), abundante cheddar (120 g) y verdeo.',
      ],
      ['Salchipapas', 4000, 7000, 'Papas fritas (250 g) con salchichas doradas, cheddar y verdeo.'],
      ['Papas Criollas', 4000, 7000, 'Papas fritas, huevo frito, cebolla salteada y verdeo.'],
    ].map(([nombre, s, xl, descripcion]) => ({
      nombre,
      precio: pesos(s),
      descripcion,
      variantes: tamanioPapas(s, xl),
      extras: '[]',
    })),
  ],
  [
    'Bebidas',
    [
      ['Jugo Fresh 600 ml', 2000],
      ['Jugo Fresh 1.5 lt', 2500],
      ['Pepsi lata', 2000],
      ['Pepsi 2 lt', 4000],
      ['Mirinda 2 lt', 4000],
      ['Pepsi 3 lt', 5000],
      ['Mirinda 3 lt', 5000],
    ].map(([nombre, precio]) => ({
      nombre,
      precio: pesos(precio),
      descripcion: `Bebida ${nombre}.`,
      variantes: '[]',
      extras: '[]',
    })),
  ],
];

function categoria(nombre, orden) {
  let row = db.prepare('SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?)').get(nombre);
  if (!row) {
    if (!aplicar) return null;
    const result = db
      .prepare('INSERT INTO categorias (nombre, orden, activo) VALUES (?, ?, 1)')
      .run(nombre, orden);
    row = { id: Number(result.lastInsertRowid) };
  } else if (aplicar) {
    db.prepare('UPDATE categorias SET activo = 1, orden = ? WHERE id = ?').run(orden, row.id);
  }
  return row.id;
}

function guardarProducto(categoriaId, producto) {
  if (!categoriaId) return 'omitido';
  const existente = db
    .prepare('SELECT id FROM productos WHERE categoria_id = ? AND LOWER(nombre) = LOWER(?)')
    .get(categoriaId, producto.nombre);
  if (!existente) {
    if (aplicar) {
      db.prepare(
        'INSERT INTO productos (nombre, descripcion, precio, categoria_id, variantes, extras, activo) VALUES (?, ?, ?, ?, ?, ?, 1)'
      ).run(
        producto.nombre,
        producto.descripcion,
        producto.precio,
        categoriaId,
        producto.variantes,
        producto.extras
      );
    }
    return 'nuevo';
  }
  if (aplicar) {
    db.prepare(
      'UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, variantes = ?, extras = ?, activo = 1 WHERE id = ?'
    ).run(
      producto.nombre,
      producto.descripcion,
      producto.precio,
      producto.variantes,
      producto.extras,
      existente.id
    );
  }
  return 'actualizado';
}

function crearListaDeExtras(hamburguesasId) {
  let lista = db
    .prepare("SELECT id FROM opcion_listas WHERE LOWER(nombre) = 'agregados hamburguesas'")
    .get();
  if (!lista) {
    const result = db
      .prepare(
        "INSERT INTO opcion_listas (nombre, tipo, obligatorio, descripcion, orden, activo) VALUES ('Agregados hamburguesas', 'extra', 0, 'Extras compartidos para hamburguesas.', 1, 1)"
      )
      .run();
    lista = { id: Number(result.lastInsertRowid) };
  } else {
    db.prepare(
      "UPDATE opcion_listas SET tipo = 'extra', obligatorio = 0, descripcion = 'Extras compartidos para hamburguesas.', activo = 1 WHERE id = ?"
    ).run(lista.id);
  }
  db.prepare('DELETE FROM opcion_items WHERE lista_id = ?').run(lista.id);
  const insertarOpcion = db.prepare(
    'INSERT INTO opcion_items (lista_id, nombre, precio, orden, activo) VALUES (?, ?, ?, ?, 1)'
  );
  [
    ['Papas', 1500],
    ['Medallón de carne', 2500],
    ['Cheddar', 1000],
    ['Huevo', 1000],
  ].forEach(([nombre, precio], orden) =>
    insertarOpcion.run(lista.id, nombre, pesos(precio), orden)
  );
  const hamburguesas = db
    .prepare('SELECT id FROM productos WHERE categoria_id = ? AND activo = 1')
    .all(hamburguesasId);
  db.prepare('DELETE FROM producto_opcion_listas WHERE lista_id = ?').run(lista.id);
  const asignar = db.prepare(
    'INSERT INTO producto_opcion_listas (producto_id, lista_id, orden) VALUES (?, ?, 0)'
  );
  hamburguesas.forEach(({ id }) => asignar.run(id, lista.id));
  return { listaId: lista.id, asignadas: hamburguesas.length };
}

function ejecutar() {
  const resumen = { nuevos: 0, actualizados: 0, categorias: 0, extras: null };
  const categorias = new Map();
  carta.forEach(([nombre, productos], indice) => {
    const id = categoria(nombre, indice + 1);
    categorias.set(nombre, id);
    resumen.categorias += 1;
    productos.forEach((producto) => {
      const accion = guardarProducto(id, producto);
      if (accion !== 'omitido') resumen[accion + 's'] += 1;
    });
  });
  if (aplicar) {
    resumen.extras = crearListaDeExtras(categorias.get('Hamburguesas'));
    const agregados = db
      .prepare("SELECT id FROM categorias WHERE LOWER(nombre) = 'agregados'")
      .get();
    if (agregados) {
      db.prepare('UPDATE productos SET activo = 0 WHERE categoria_id = ?').run(agregados.id);
      db.prepare('UPDATE categorias SET activo = 0 WHERE id = ?').run(agregados.id);
    }
  }
  return resumen;
}

if (!aplicar) {
  console.log(
    'Vista previa: se revisarían 61 productos de la carta. Ejecutá con --apply para guardar.'
  );
  process.exit(0);
}

const backup = createDatabaseBackup(db, { reason: 'antes-carta-agosto-2026' });
const resultado = db.transaction(ejecutar)();
console.log(JSON.stringify({ backup, ...resultado }, null, 2));
