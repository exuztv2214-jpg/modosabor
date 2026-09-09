const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { centsToPesos } = require('../../utils/moneyConversion');

/**
 * Tests de la plata que sale por Socket.IO.
 *
 * ── Qué se veía ────────────────────────────────────────────────────────────
 *
 * El tablero de Pedidos mostraba el pedido #184 —dos platos y una promo, trece
 * mil pesos— como "$1.300.000". Pero si recargabas la página, aparecía bien.
 *
 * Esa es la firma exacta del problema: los pedidos que se cargan al abrir
 * vienen por HTTP y pasan por el middleware que divide los centavos; los que
 * entran en vivo llegan por socket, que no pasa por ahí y manda el número
 * crudo de la base.
 *
 * ── Por qué costó verlo ────────────────────────────────────────────────────
 *
 * El error se borraba solo. Cualquiera que fuera a mirarlo con más atención
 * recargaba la página, y al recargar el número aparecía correcto. Sólo se ve
 * en el momento en que entra el pedido, que es cuando nadie está mirando el
 * código.
 */

function testElSocketMandaPesos() {
  /*
    Se prueba la forma del payload, que es lo que el panel recibe. El pedido
    real: ñoquis $5.000 + matambre con bebida y postre $8.000 = $13.000.
  */
  const deLaBase = {
    id: 184,
    numero: 184,
    total: 1300000,
    subtotal: 1300000,
    costo_envio: 0,
    items: [
      { nombre: 'Ñoquis de Espinaca', cantidad: 1, precio_unitario: 500000, subtotal: 500000 },
      {
        nombre: 'Matambre de cerdo a la pizza',
        cantidad: 1,
        precio_unitario: 700000,
        subtotal: 800000,
        extras: [{ nombre: 'Bebida + Postre', precio: 100000 }],
      },
    ],
  };

  const alPanel = centsToPesos(deLaBase);

  assert.strictEqual(alPanel.total, 13000, 'el total tiene que salir $13.000, no $1.300.000');
  assert.strictEqual(alPanel.items[0].subtotal, 5000, 'el ñoquis vale $5.000');
  assert.strictEqual(alPanel.items[1].subtotal, 8000, 'el matambre con la promo vale $8.000');
  assert.strictEqual(
    alPanel.items[1].extras[0].precio,
    1000,
    'la promo de bebida y postre son $1.000'
  );

  console.log('  OK el pedido sale del socket con los importes en pesos');
}

function testTodoPedidoPasaPorLaMismaPuerta() {
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../utils/socketRooms.js'), 'utf8');

  /*
    Se mira el código porque el error no está en un cálculo sino en una
    omisión: faltaba una conversión. Eso no se ve mirando lo que devuelve una
    función, se ve mirando si la llamada existe.
  */
  const desde = fuente.indexOf('function paraElCliente');
  assert.ok(desde > 0, 'desapareció paraElCliente: no hay puerta única al socket');
  const cuerpoPuerta = fuente.slice(desde, fuente.indexOf('\n}', desde));
  /*
    Se mira ADENTRO de la función y no el archivo entero: si sólo se busca la
    palabra, el `require` de arriba la satisface y el test pasa aunque la
    llamada real haya desaparecido. Comprobado: la primera versión de este
    test no agarraba esa regresión.
  */
  assert.ok(
    /centsToPesos\(/.test(cuerpoPuerta),
    'paraElCliente dejó de convertir la plata: los importes salen del socket en centavos'
  );

  /*
    Y que no haya vuelto a aparecer un pedido armado a mano salteándose la
    conversión. Antes había tres lugares que hacían lo mismo por su cuenta, y
    bastaba con que alguien agregara un cuarto para volver al problema.
  */
  const desdePuerta = fuente.indexOf('function paraElCliente');
  const finPuerta = fuente.indexOf('\n}', desdePuerta) + 2;
  const sinLaPuerta = fuente.slice(0, desdePuerta) + fuente.slice(finPuerta);
  const armadosAMano = sinLaPuerta.match(/\{\s*\.\.\.pedido,\s*items: parsePedidoItems/g) || [];
  assert.strictEqual(
    armadosAMano.length,
    0,
    `hay ${armadosAMano.length} lugares armando el pedido sin convertir: tienen que usar paraElCliente()`
  );

  const puerta = fuente.match(/function paraElCliente/g) || [];
  assert.strictEqual(puerta.length, 1, 'tiene que haber una sola puerta de entrada al socket');

  console.log('  OK todos los pedidos entran al socket por la misma puerta');
}

function testLosEmitUsanLaPuerta() {
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../utils/socketRooms.js'), 'utf8');

  ['emitNuevoPedido', 'emitPedidoAsignado', 'emitPedidoActualizado'].forEach((nombre) => {
    const desde = fuente.indexOf(`function ${nombre}(`);
    assert.ok(desde > 0, `no existe ${nombre}`);
    const cuerpo = fuente.slice(desde, desde + 900);
    assert.ok(
      /paraElCliente/.test(cuerpo),
      `${nombre} manda el pedido sin convertir la plata: el panel lo va a mostrar 100 veces más grande`
    );
  });

  console.log('  OK las tres emisiones de pedido convierten la plata');
}

function testLasRutasNoSalteanLasRooms() {
  const pedidosRoute = fs.readFileSync(path.resolve(__dirname, '../../routes/pedidos.js'), 'utf8');
  assert.ok(
    !/io\.emit\(['"]pedido_actualizado['"]/.test(pedidosRoute),
    'Una ruta de pedidos emitió pedido_actualizado globalmente y salteó la normalización y las rooms'
  );
  console.log('  OK las rutas no emiten pedidos crudos fuera de las rooms');
}

function run() {
  console.log('\nTests de la plata en Socket.IO');
  testElSocketMandaPesos();
  testTodoPedidoPasaPorLaMismaPuerta();
  testLosEmitUsanLaPuerta();
  testLasRutasNoSalteanLasRooms();
  console.log('Todos los tests de la plata en Socket.IO pasaron\n');
}

run();
