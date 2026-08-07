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

function testElHtmlImprimeLoMismoQueElTotal() {
  /*
    ── Por qué este test reemplaza al anterior ──────────────────────────────

    El test que había antes verificaba que la ruta llamara a
    `getPedidoHydratedById`. Pasaba, y el ticket seguía saliendo mal.

    El error estaba una capa más abajo: la ruta convertía bien, pero
    `buildPrintDocument` volvía a leer los ítems de la base con
    `loadPedidoItems` y pisaba lo convertido. La plantilla terminaba usando
    los renglones en centavos y los totales en pesos, en el mismo papel.

    Verificar qué función se llama no sirve cuando el error está en lo que
    pasa después. Así que ahora se genera el HTML de verdad y se mira lo que
    dice el papel.
  */
  /*
    El doble tiene que devolver las filas de `pedido_items` en CENTAVOS, que
    es de dónde salían los importes crudos. Un doble que sólo contesta la
    configuración no reproduce el error: lo comprobé, el test pasaba igual
    con el código roto.
  */
  const db = {
    prepare: (sql) => ({
      all: () =>
        /pedido_items/.test(sql)
          ? [
              {
                id: 1,
                pedido_id: 185,
                nombre: 'Ñoquis de Espinaca',
                cantidad: 1,
                precio_unitario: 500000,
                subtotal: 500000,
                variantes_json: '{}',
                extras_json: '[]',
              },
            ]
          : [{ clave: 'negocio_nombre', valor: 'Modo Sabor' }],
      get: () => null,
      run: () => ({}),
    }),
  };

  const { buildPrintDocument } = require('../../utils/printTemplates');

  // El pedido #185, ya convertido a pesos por la ruta.
  const pedidoEnPesos = {
    id: 185,
    numero: 185,
    tipo_entrega: 'delivery',
    metodo_pago: 'transferencia',
    total: 5000,
    subtotal: 5000,
    items: [{ nombre: 'Ñoquis de Espinaca', cantidad: 1, precio_unitario: 5000, subtotal: 5000 }],
  };

  const { html } = buildPrintDocument(db, pedidoEnPesos, 'ticket_cliente');

  /*
    Lo que se busca es el número que sale impreso. "$500.000" en el renglón
    arriba de "$5.000" en el total es exactamente lo que el dueño vio en el
    papel del #185.
  */
  assert.ok(
    !/\$500\.000/.test(html),
    'el renglón volvió a imprimirse en centavos: dice $500.000 donde son $5.000'
  );
  assert.ok(html.includes('$5.000'), 'el ticket tiene que mostrar $5.000');

  const importes = html.match(/\$[\d.]+/g) || [];
  const distintos = [...new Set(importes)];
  assert.deepStrictEqual(
    distintos,
    ['$5.000'],
    `el ticket mezcla unidades: ${distintos.join(', ')}. Renglón y total tienen que dar lo mismo.`
  );

  console.log('  OK el HTML del ticket imprime el renglón y el total en la misma unidad');
}

function testSiNoVienenItemsSeVanABuscar() {
  /*
    El arreglo no puede romper a quien llame sin ítems: en ese caso hay que
    seguir yendo a la base, como antes.
  */
  const fuente = fs.readFileSync(path.resolve(__dirname, '../../utils/printTemplates.js'), 'utf8');
  assert.ok(
    /Array\.isArray\(pedido\?\.items\) \? pedido\.items : loadPedidoItems/.test(fuente),
    'buildPrintDocument volvió a releer los ítems siempre: pisa la conversión del llamador'
  );
  console.log('  OK si el pedido llega sin ítems, se siguen buscando en la base');
}

function run() {
  console.log('\nTests de los importes del ticket');
  testElRenglonYElTotalCoinciden();
  testLaFilaCrudaSigueSinServir();
  testElHtmlImprimeLoMismoQueElTotal();
  testSiNoVienenItemsSeVanABuscar();
  console.log('Todos los tests de los importes del ticket pasaron\n');
}

run();
