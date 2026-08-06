const assert = require('assert');
const Module = require('module');
const path = require('path');

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

const dbFalsa = {
  prepare() {
    return { get: (id) => PRODUCTOS[Number(id)] || undefined };
  },
};

// Interceptar el require de '../db' para inyectar la base falsa.
const rutaDb = path.resolve(__dirname, '../../db');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && request === '../db' && parent.filename.includes('preciosServidor')) {
    return dbFalsa;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const {
  recalcularPreciosPublicos,
  PrecioInvalidoError,
} = require('../../services/preciosServidor');

Module._load = originalLoad;

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
