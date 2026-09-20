/**
 * Carga el menú del día de HOY y los platos de parrilla.
 *
 * Uso:
 *   node server/scripts/upsertMenuDelDia.js
 *   node server/scripts/upsertMenuDelDia.js --dry
 *
 * Idempotente: se puede correr las veces que haga falta sin duplicar platos.
 *
 * ── Dos cosas que este script NO hace, a propósito ─────────────────────────
 *
 * 1. NO RENOMBRA platos que ya existen. La versión anterior usaba los alias
 *    para encontrar una fila y después le escribía el nombre nuevo encima: con
 *    el alias "Costeleta de res a caballo" colgado de "Costeleta a la riojana",
 *    una corrida convertía un plato del repertorio en otro. Acá el alias sólo
 *    sirve para *encontrar* la fila y no pisarla con un duplicado; el nombre
 *    que ya tiene se respeta.
 *
 * 2. NO da de baja lo que no esté en la lista de hoy. Sólo lo saca del menú
 *    del día (`menu_dia_disponible_hoy = 0`), que es lo que corresponde: un
 *    plato que hoy no se cocina no es un plato que dejó de existir.
 *
 * ── Precio por plato, no por nivel ─────────────────────────────────────────
 *
 * Antes había dos constantes de precio y cada plato caía en una. El menú real
 * no siempre entra en dos cajas: hoy hay uno de $7.000 y otro de $9.000, y la
 * parrilla va de $12.000 a $14.000. Cada plato lleva su precio.
 */
const db = require('../db');

const SOLO_SIMULAR = process.argv.includes('--dry');

const CATEGORIA_MENU = 'Menu del Dia';
const CATEGORIA_PARRILLA = 'Parrilla';
const LISTA_GUARNICIONES = 'Guarniciones';
const STOCK_POR_PLATO = 20;

/** Los precios se escriben en pesos y la base guarda centavos. */
function aCentavos(pesos) {
  return Math.round(Number(pesos || 0) * 100);
}

/*
  El menú del día de hoy, tal como salió publicado.

  `alias` son los nombres con los que el plato puede estar ya cargado en el
  repertorio. Sirven para reusar la fila y no crear un duplicado; el nombre
  guardado no se toca.
*/
const MENU_DEL_DIA = [
  // ── $7.000 · incluye guarnición a elección ──
  { nombre: 'Wok de verduras y pollo', precio: 7000, alias: ['Wok de Verduras y Pollo', 'Wok'] },
  { nombre: 'Arroz chaufa', precio: 7000, alias: ['Arroz Chaufa'] },
  { nombre: 'Costeleta a la riojana', precio: 7000, alias: ['Costeleta a la Riojana'] },
  { nombre: 'Suprema napolitana', precio: 7000, alias: ['Suprema a la Napolitana'] },
  { nombre: 'Suprema a la suiza', precio: 7000, alias: ['Suprema a la Suiza'] },
  { nombre: 'Merluza a la romana', precio: 7000, alias: ['Merluza a la Romana'] },
  { nombre: '1/4 de pollo a la parrilla', precio: 7000, alias: [] },
  { nombre: 'Pollo al ajillo', precio: 7000, alias: ['Pollo al Ajillo'] },
  { nombre: 'Pollo al horno', precio: 7000, alias: [] },
  { nombre: 'Marinera', precio: 7000, alias: ['Marinera'] },

  // ── $9.000 · incluye guarnición + bebida + postre ──
  { nombre: 'Milanesa napolitana', precio: 9000, alias: ['Mila Napo', 'Milanesa a la Napolitana'] },
  { nombre: 'Milanesa a caballo', precio: 9000, alias: ['Milanesa a Caballo'] },
  { nombre: 'Costeleta de res a caballo', precio: 9000, alias: ['Costeleta de Res a Caballo'] },
  {
    nombre: 'Matambre de cerdo a la pizza',
    precio: 9000,
    alias: ['Matambre de Cerdo a la Pizza'],
  },
  { nombre: 'Matambre de vaca a la pizza', precio: 9000, alias: [] },
];

/*
  La parrilla no es menú del día: son platos con su propio precio y su propio
  gramaje, que se venden igual a la noche. Van en su categoría, sin
  `menu_dia_base`, así no quedan atados a la regla de la mañana ni aparecen
  como si fueran un menú de $7.000.
*/
const PARRILLA = [
  {
    nombre: 'Parrillada individual',
    precio: 12000,
    descripcion:
      'Costilla de vaca, cerdo, pollo, chinchulín, riñón, chorizo y morcilla. Aprox. 350-400 g cocidos + guarnición.',
    alias: ['Parrillada'],
  },
  {
    nombre: 'Vacío a la parrilla',
    precio: 14000,
    descripcion: 'Aprox. 300 g cocidos + guarnición.',
    alias: [],
  },
  {
    nombre: 'Costillita de vaca a la parrilla',
    precio: 14000,
    descripcion: 'Aprox. 300-350 g cocidos + guarnición.',
    alias: [],
  },
  {
    nombre: 'Costillita de cerdo a la parrilla',
    precio: 12000,
    descripcion: 'Aprox. 300 g cocidos + guarnición.',
    alias: [],
  },
];

function hoy() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function asegurarCategoria(nombre, icono, orden) {
  const existente = db
    .prepare('SELECT * FROM categorias WHERE lower(nombre) = lower(?) LIMIT 1')
    .get(nombre);
  if (existente) return existente;
  const res = db
    .prepare(
      `INSERT INTO categorias (nombre, icono, color, orden, activo, imagen, subcategorias, turno_id)
       VALUES (?, ?, '#16a34a', ?, 1, '', '[]', '')`
    )
    .run(nombre, icono, orden);
  return db.prepare('SELECT * FROM categorias WHERE id = ?').get(res.lastInsertRowid);
}

/** Busca la fila del plato por su nombre o por cualquiera de sus alias. */
function buscarProducto(nombres) {
  const buscar = db.prepare(
    'SELECT id, nombre FROM productos WHERE lower(nombre) = lower(?) LIMIT 1'
  );
  for (const nombre of nombres) {
    const fila = buscar.get(nombre);
    if (fila) return fila;
  }
  return null;
}

const fecha = hoy();
const resumen = { creados: [], actualizados: [], parrilla: [] };

db.exec('BEGIN');
try {
  const categoriaMenu = asegurarCategoria(CATEGORIA_MENU, '🍽️', 0);
  const categoriaParrilla = asegurarCategoria(CATEGORIA_PARRILLA, '🥩', 12);

  const lista = db
    .prepare('SELECT id FROM opcion_listas WHERE lower(nombre) = lower(?) LIMIT 1')
    .get(LISTA_GUARNICIONES);
  const asignarLista = db.prepare(
    `INSERT OR IGNORE INTO producto_opcion_listas (producto_id, lista_id, orden) VALUES (?, ?, 0)`
  );

  // Se baja el menú de ayer antes de levantar el de hoy.
  db.prepare(
    'UPDATE productos SET menu_dia_disponible_hoy = 0 WHERE COALESCE(menu_dia_base,0) = 1'
  ).run();

  const crear = db.prepare(
    `INSERT INTO productos (
       nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras,
       activo, destacado, tiempo_preparacion, stock_directo, stock_mode,
       menu_dia_base, menu_dia_disponible_hoy, menu_dia_tipo
     ) VALUES (?, ?, ?, 0, ?, '', '[]', '[]', 1, 0, 20, ?, 'direct', ?, ?, ?)`
  );
  // El nombre NO se toca: la fila que ya existe conserva el suyo.
  const actualizar = db.prepare(
    `UPDATE productos
        SET precio = ?, activo = 1, categoria_id = ?, stock_directo = ?, stock_mode = 'direct',
            menu_dia_base = ?, menu_dia_disponible_hoy = ?, menu_dia_tipo = ?
      WHERE id = ?`
  );
  const snapshot = db.prepare(
    `INSERT INTO menu_dia_historial (fecha, producto_id, disponible, precio, stock_directo, descripcion, destacado, orden, actualizado_en)
     VALUES (?, ?, 1, ?, ?, '', 0, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(fecha, producto_id) DO UPDATE SET
       disponible = 1, precio = excluded.precio, stock_directo = excluded.stock_directo,
       orden = excluded.orden, actualizado_en = CURRENT_TIMESTAMP`
  );

  MENU_DEL_DIA.forEach((plato, indice) => {
    const encontrado = buscarProducto([plato.nombre, ...(plato.alias || [])]);
    // El nivel se deriva del precio del día: el más barato es el primero.
    const tipo = plato.precio >= 9000 ? 'ejecutivo' : 'economico';
    let id;
    if (encontrado) {
      actualizar.run(
        aCentavos(plato.precio),
        categoriaMenu.id,
        STOCK_POR_PLATO,
        1,
        1,
        tipo,
        encontrado.id
      );
      id = encontrado.id;
      resumen.actualizados.push(`${encontrado.nombre} → $${plato.precio.toLocaleString('es-AR')}`);
    } else {
      const res = crear.run(
        plato.nombre,
        '',
        aCentavos(plato.precio),
        categoriaMenu.id,
        STOCK_POR_PLATO,
        1,
        1,
        tipo
      );
      id = Number(res.lastInsertRowid);
      resumen.creados.push(`${plato.nombre} → $${plato.precio.toLocaleString('es-AR')}`);
    }
    if (lista) asignarLista.run(id, lista.id);
    snapshot.run(fecha, id, aCentavos(plato.precio), STOCK_POR_PLATO, indice);
  });

  PARRILLA.forEach((plato) => {
    const encontrado = buscarProducto([plato.nombre, ...(plato.alias || [])]);
    let id;
    if (encontrado) {
      // Si venía marcado como menú del día (la Parrillada lo estaba), se saca:
      // no es un menú de mediodía, es un plato de carta.
      actualizar.run(
        aCentavos(plato.precio),
        categoriaParrilla.id,
        STOCK_POR_PLATO,
        0,
        0,
        '',
        encontrado.id
      );
      id = encontrado.id;
      resumen.parrilla.push(
        `${encontrado.nombre} → $${plato.precio.toLocaleString('es-AR')} (actualizado)`
      );
    } else {
      const res = crear.run(
        plato.nombre,
        plato.descripcion,
        aCentavos(plato.precio),
        categoriaParrilla.id,
        STOCK_POR_PLATO,
        0,
        0,
        ''
      );
      id = Number(res.lastInsertRowid);
      resumen.parrilla.push(`${plato.nombre} → $${plato.precio.toLocaleString('es-AR')} (creado)`);
    }
    if (lista) asignarLista.run(id, lista.id);
  });

  const guardarConfig = db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  );
  guardarConfig.run('menu_dia_precio_economico', String(aCentavos(7000)));
  guardarConfig.run('menu_dia_precio_ejecutivo', String(aCentavos(9000)));
  guardarConfig.run('menu_dia_extra_bebida_postre_precio', String(aCentavos(1000)));

  if (SOLO_SIMULAR) {
    db.exec('ROLLBACK');
    console.log('\n── SIMULACIÓN: no se guardó nada ──');
  } else {
    db.exec('COMMIT');
  }
} catch (error) {
  db.exec('ROLLBACK');
  console.error('Error:', error.message);
  process.exit(1);
}

console.log(`\nMenú del día · ${fecha}`);
console.log(`\n  Creados (${resumen.creados.length}):`);
resumen.creados.forEach((x) => console.log('   +', x));
console.log(`\n  Reusados del repertorio (${resumen.actualizados.length}):`);
resumen.actualizados.forEach((x) => console.log('   ·', x));
console.log(`\n  Parrilla (${resumen.parrilla.length}):`);
resumen.parrilla.forEach((x) => console.log('   ·', x));
console.log('\n  Niveles: $7.000 y $9.000 · bebida + postre $1.000');
console.log('\nAbrí Operación → Menú del día para verificar.\n');
