const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { centsToPesos } = require('../../utils/moneyConversion');

/**
 * Tests de los importes del ticket.
 *
 * ── Qué salió mal impreso ──────────────────────────────────────────────────
 *
 * El pedido #183 salió con dos milanesas de merluza, el renglón decía
 * "$1.400.000" y abajo el total decía "$14.000". El mismo papel, dos números
 * que no cierran entre sí.
 *
 * La causa es la de siempre en este sistema: `pedidos.items` es una columna
 * de TEXTO con JSON adentro. `pedidos.total` es numérica, así que el conversor
 * de centavos la divide; los importes que viven dentro del string quedan
 * afuera y se imprimen crudos.
 *
 * La ruta de impresión usaba la fila cruda de la tabla. Ahora usa el pedido
 * hidratado, que devuelve los ítems como lista —y a una lista el conversor sí
 * entra.
 *
 * ── Por qué esto merece un test y no sólo el arreglo ───────────────────────
 *
 * Un ticket mal impreso no rompe nada: el sistema sigue andando, la caja
 * cierra bien, y el error sólo se ve en el papel que se le da al cliente. Lo
 * descubrió el dueño mirando un ticket, no el sistema.
 */

function testElRenglonYElTotalCoinciden() {
  /*
    El pedido tal como se hidrata: `items` como lista. Es lo que tiene que
    recibir la plantilla.
  */
  const hidratado = {
    id: 183,
    total: 1400000,
    subtotal: 1400000,
    items: [
      { nombre: 'Milanesa de merluza', cantidad: 2, precio_unitario: 700000, subtotal: 1400000 },
    ],
  };

  const alTicket = centsToPesos(hidratado);
  assert.strictEqual(alTicket.total, 14000, 'el total tiene que quedar en pesos');
  assert.strictEqual(
    alTicket.items[0].subtotal,
    14000,
    'el renglón tiene que dar lo mismo que el total: era $1.400.000 contra $14.000'
  );
  assert.strictEqual(alTicket.items[0].precio_unitario, 7000);

  console.log('  OK el renglón y el total del ticket dan lo mismo');
}

function testLaFilaCrudaSigueSinServir() {
  /*
    Esto documenta por qué no alcanza con convertir la fila de la tabla: si
    alguien vuelve a imprimir desde `SELECT * FROM pedidos`, el renglón
    vuelve a salir cien veces más grande.

    No es un caso hipotético: es exactamente lo que pasó.
  */
  const cruda = {
    total: 1400000,
    items: JSON.stringify([
      { nombre: 'Milanesa de merluza', cantidad: 2, precio_unitario: 700000, subtotal: 1400000 },
    ]),
  };
  const convertida = centsToPesos(cruda);
  assert.strictEqual(convertida.total, 14000);
  assert.strictEqual(
    JSON.parse(convertida.items)[0].subtotal,
    1400000,
    'si esto empieza a dar 14000, el conversor cambió y se puede simplificar la ruta'
  );

  console.log('  OK queda documentado que la fila cruda no sirve para imprimir');
}

function testLasRutasDeImpresionUsanElHidratado() {
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../routes/pedidos.js'), 'utf8');

  /*
    El chequeo mira el código porque el error no es de cálculo sino de qué
    dato se le pasa a la plantilla, y eso no se ve en el resultado de ninguna
    función: se ve en la línea que elige la fuente.
  */
  const rutaTicket = fuente.slice(fuente.indexOf("router.get('/:id/impresion/:tipo'"));
  const cuerpoTicket = rutaTicket.slice(0, rutaTicket.indexOf('});'));
  assert.ok(
    /getPedidoHydratedById/.test(cuerpoTicket),
    'la ruta del ticket volvió a imprimir desde la fila cruda: los renglones salen en centavos'
  );
  assert.ok(!/getPedidoOr404/.test(cuerpoTicket), 'quedó un getPedidoOr404 en la ruta del ticket');

  const rutaPrecuenta = fuente.slice(fuente.indexOf("router.post('/mesa/:mesa/precuenta'"));
  const cuerpoPrecuenta = rutaPrecuenta.slice(0, rutaPrecuenta.indexOf('registerPrintJob'));
  assert.ok(
    /getPedidoHydratedById/.test(cuerpoPrecuenta),
    'la precuenta de mesa volvió a imprimir desde filas crudas'
  );

  console.log('  OK las dos rutas de impresión parten del pedido hidratado');
}

function run() {
  console.log('\nTests de los importes del ticket');
  testElRenglonYElTotalCoinciden();
  testLaFilaCrudaSigueSinServir();
  testLasRutasDeImpresionUsanElHidratado();
  console.log('Todos los tests de los importes del ticket pasaron\n');
}

run();
