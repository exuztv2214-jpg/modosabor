const assert = require('assert');

/**
 * Verifica que el precio de los pedidos públicos lo ponga el servidor y no el
 * navegador.
 *
 * El agujero que cubre: el pedido se creaba con el `precio_unitario` que
 * mandaba el cliente, sin contrastarlo contra la base. Alcanzaba con editar la
 * petición en las herramientas del navegador para llevarse la comida por un
 * peso.
 *
 * Los precios van en centavos, igual que en la base.
 */

// ── Base de datos falsa, para no depender de un SQLite real ────────────────
const PRODUCTOS = {
  67: {
    id: 67,
    nombre: 'Suprema a la napolitana',
    precio: 500000, // $5.000
    activo: 1,
    variantes: JSON.stringify([
      {
        nombre: 'Guarniciones',
        opciones: [
          { nombre: 'Papas', precio_extra: 0 },
          { nombre: 'Ensalada Mixta', precio_extra: 0 },
        ],
      },
    ]),
    extras: JSON.stringify([{ nombre: 'Jugo + Postre', precio: 100000 }]),
  },
  99: {
    id: 99,
    nombre: 'Plato dado de baja',
    precio: 700000,
    activo: 0,
    variantes: '[]',
    extras: '[]',
  },
};

/**
 * Listas de opciones compartidas asignadas a cada plato.
 *
 * La suprema lleva la lista "Salsas", que **no está** en su columna
 * `variantes`: vive en `opcion_listas` y se le asignó aparte. Es justo el caso
 * que puede sacar la web de servicio, porque una opción que el validador no
 * reconoce no se cobra mal — hace que se rechace el pedido entero.
 */
const LISTAS_POR_PRODUCTO = {
  67: [
    {
      id: 1,
      nombre: 'Salsas',
      tipo: 'variante',
      obligatorio: 0,
      opciones: [
        { nombre: 'Salsa de pollo', precio: 0 },
        { nombre: 'Salsa de carne', precio: 30000 }, // $300
      ],
    },
  ],
};

/*
  La base falsa tiene que saber responder `.all` y no sólo `.get`: al resolver
  las listas compartidas, preciosServidor hace dos consultas que devuelven
  varias filas. Con un `prepare` que sólo devolvía `get`, el módulo entero
  reventaba con "db.prepare(...).all is not a function" — y como esto se
  descubrió recién, queda dicho: si esta simulación se queda corta otra vez,
  el síntoma es ese.
*/
const dbFalsa = {
  prepare(sql) {
    return {
      get: (id) => PRODUCTOS[Number(id)] || undefined,
      all: (...ids) => {
        if (sql.includes('producto_opcion_listas')) {
          return ids.flatMap((id) =>
            (LISTAS_POR_PRODUCTO[Number(id)] || []).map((lista) => ({
              producto_id: Number(id),
              id: lista.id,
              nombre: lista.nombre,
              tipo: lista.tipo,
              obligatorio: lista.obligatorio,
              orden: 0,
            }))
          );
        }
        if (sql.includes('FROM opcion_items')) {
          const todas = Object.values(LISTAS_POR_PRODUCTO).flat();
          return ids.flatMap((listaId) => {
            const lista = todas.find((l) => l.id === Number(listaId));
            return (lista?.opciones || []).map((opcion) => ({
              lista_id: lista.id,
              nombre: opcion.nombre,
              precio: opcion.precio,
            }));
          });
        }
        return [];
      },
    };
  },
};

/*
  ── Por qué se limpia el caché antes de cargar ─────────────────────────────

  El truco de abajo intercepta el `require('../db')` de preciosServidor para
  darle una base falsa. Pero eso sólo funciona si el módulo se carga *acá*: si
  otro test lo cargó antes, `require` devuelve la copia que ya está en el caché,
  con la base real adentro, y el stub no se aplica nunca.

  Eso pasó de verdad. Al agregarse los tests del asistente —que cargan media
  aplicación, y con ella preciosServidor— este archivo empezó a fallar sin que
  nadie hubiera tocado preciosServidor. Los tests corren por orden alfabético,
  así que "asistente" cae antes que "preciosServidor".

  Borrando la entrada del caché, el módulo se carga de cero y el resultado no
  depende de qué corrió antes. Un test que sólo pasa según el orden no sirve
  para nada.
*/
const rutaPrecios = require.resolve('../../services/preciosServidor');
delete require.cache[rutaPrecios];

// Reemplazar la entrada del caché es estable entre Node 22 y Node 24. El
// gancho de Module._load dependía de detalles internos y en el CI dejaba pasar
// la base temporal real en vez del doble.
const rutaDb = require.resolve('../../db');
const moduloDbOriginal = require.cache[rutaDb];
require.cache[rutaDb] = {
  id: rutaDb,
  filename: rutaDb,
  loaded: true,
  exports: dbFalsa,
};

const {
  recalcularPreciosPublicos,
  PrecioInvalidoError,
} = require('../../services/preciosServidor');

Module._load = originalLoad;

/*
  Y se saca de nuevo al terminar: si quedara la copia con la base falsa, el
  problema pasaría al revés y rompería a cualquier test posterior que necesite
  la base real.
*/
delete require.cache[rutaPrecios];

console.log('\nTests de preciosServidor.js');
let fallos = 0;
const test = (nombre, fn) => {
  try {
    fn();
    console.log(`  ✓ ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.error(`  ✗ ${nombre}`);
    console.error(`    ${error.message}`);
  }
};

// ── El ataque ──────────────────────────────────────────────────────────────
test('ignora el precio adulterado y usa el de la base', () => {
  const items = recalcularPreciosPublicos([
    { producto_id: 67, nombre: 'Suprema', cantidad: 2, precio_unitario: 100 }, // $1
  ]);
  assert.strictEqual(items[0].precio_unitario, 500000, 'debe cobrar $5.000, no $1');
  assert.strictEqual(items[0].subtotal, 1000000, 'subtotal = 2 x $5.000');
});

test('un precio en cero tampoco pasa', () => {
  const items = recalcularPreciosPublicos([
    { producto_id: 67, nombre: 'Suprema', cantidad: 1, precio_unitario: 0 },
  ]);
  assert.strictEqual(items[0].precio_unitario, 500000);
});

// ── Variantes y adicionales ────────────────────────────────────────────────
test('suma el adicional real del producto', () => {
  const items = recalcularPreciosPublicos([
    {
      producto_id: 67,
      cantidad: 1,
      precio_unitario: 0,
      extras: [{ nombre: 'Jugo + Postre' }],
    },
  ]);
  assert.strictEqual(items[0].precio_unitario, 600000, '$5.000 + $1.000');
});

test('acepta una guarnición válida sin recargo', () => {
  const items = recalcularPreciosPublicos([
    { producto_id: 67, cantidad: 1, variantes: { Guarniciones: 'Papas' } },
  ]);
  assert.strictEqual(items[0].precio_unitario, 500000);
});

test('rechaza una guarnición inventada', () => {
  assert.throws(
    () =>
      recalcularPreciosPublicos([
        { producto_id: 67, cantidad: 1, variantes: { Guarniciones: 'Langostinos' } },
      ]),
    PrecioInvalidoError
  );
});

// ── Listas de opciones compartidas ─────────────────────────────────────────
//
// "Salsas" no está en la columna `variantes` de la suprema: se le asignó como
// lista compartida. Si el validador no las resuelve, esto no cobra de menos
// —tira `PrecioInvalidoError` y el cliente no puede terminar el pedido—.
test('acepta una opción que viene de una lista compartida', () => {
  const items = recalcularPreciosPublicos([
    { producto_id: 67, cantidad: 1, variantes: { Salsas: 'Salsa de pollo' } },
  ]);
  assert.strictEqual(items[0].precio_unitario, 500000, 'una salsa sin recargo no cambia el precio');
});

test('cobra el recargo de una opción compartida', () => {
  const items = recalcularPreciosPublicos([
    { producto_id: 67, cantidad: 2, variantes: { Salsas: 'Salsa de carne' } },
  ]);
  assert.strictEqual(items[0].precio_unitario, 530000, '$5.000 + $300 de salsa de carne');
  assert.strictEqual(items[0].subtotal, 1060000, 'el recargo compartido va por unidad');
});

test('la lista compartida convive con las variantes propias del plato', () => {
  const items = recalcularPreciosPublicos([
    {
      producto_id: 67,
      cantidad: 1,
      variantes: { Guarniciones: 'Papas', Salsas: 'Salsa de carne' },
      extras: [{ nombre: 'Jugo + Postre' }],
    },
  ]);
  assert.strictEqual(items[0].precio_unitario, 630000, '$5.000 + $300 salsa + $1.000 postre');
});

test('sigue rechazando una salsa que no está en la lista', () => {
  assert.throws(
    () =>
      recalcularPreciosPublicos([
        { producto_id: 67, cantidad: 1, variantes: { Salsas: 'Salsa de trufa' } },
      ]),
    PrecioInvalidoError,
    'resolver las listas no puede aflojar la validación'
  );
});

test('rechaza un adicional que no existe', () => {
  assert.throws(
    () =>
      recalcularPreciosPublicos([
        { producto_id: 67, cantidad: 1, extras: [{ nombre: 'Botella de vino' }] },
      ]),
    PrecioInvalidoError
  );
});

// ── Productos que no corresponden ──────────────────────────────────────────
test('rechaza un producto inexistente', () => {
  assert.throws(
    () => recalcularPreciosPublicos([{ producto_id: 12345, cantidad: 1 }]),
    PrecioInvalidoError
  );
});

test('rechaza un producto inactivo', () => {
  assert.throws(
    () => recalcularPreciosPublicos([{ producto_id: 99, cantidad: 1 }]),
    PrecioInvalidoError
  );
});

test('rechaza un ítem inventado sin producto_id', () => {
  assert.throws(
    () =>
      recalcularPreciosPublicos([
        { nombre: 'Plato gratis inventado', cantidad: 1, precio_unitario: 0 },
      ]),
    PrecioInvalidoError
  );
});

// ── Detalles ───────────────────────────────────────────────────────────────
test('el nombre también sale de la base', () => {
  const items = recalcularPreciosPublicos([
    { producto_id: 67, nombre: 'NOMBRE FALSO', cantidad: 1 },
  ]);
  assert.strictEqual(items[0].nombre, 'Suprema a la napolitana');
});

test('un pedido vacío no rompe', () => {
  assert.deepStrictEqual(recalcularPreciosPublicos([]), []);
});

if (fallos > 0) {
  throw new Error(`${fallos} test(s) de preciosServidor fallaron`);
}
console.log('✅ Todos los tests de preciosServidor pasaron');
