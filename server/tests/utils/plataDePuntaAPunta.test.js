const assert = require('assert');
const Module = require('module');
const path = require('path');

/**
 * Un pedido, todos los lugares donde se muestra su plata.
 *
 * ── Por qué existe este test ───────────────────────────────────────────────
 *
 * En una semana aparecieron cinco errores del mismo tipo, y los cinco los
 * encontró el dueño mirando una pantalla o un papel:
 *
 *   1. `facturado` en la app del rider: "Cobrado hoy $1.900.000" por $19.000.
 *   2. Los recargos dentro de `extras`, que viven en una columna de texto.
 *   3. El renglón del ticket #183: $1.400.000 arriba de un total de $14.000.
 *   4. El tablero con el pedido #184 en $1.300.000, que al recargar se
 *      arreglaba solo porque llegaba por HTTP en vez de por socket.
 *   5. El margen del panel: $5.700.000 sobre ventas de $57.000.
 *
 * Cada uno se arregló con su test. Pero todos los tests miraban una pieza, y
 * el problema nunca estuvo en una pieza: está en que el mismo pedido pasa por
 * cinco caminos distintos hasta llegar a los ojos de alguien, y cada camino
 * puede olvidarse de convertir por su cuenta.
 *
 * Este test agarra UN pedido y lo sigue por todos los caminos a la vez. Si dos
 * caminos no coinciden, falla diciendo cuáles. Es el test que habría agarrado
 * los cinco de una.
 *
 * ── Qué NO cubre ───────────────────────────────────────────────────────────
 *
 * No levanta el servidor ni pega a la API: prueba las funciones que cada
 * camino usa para mostrar plata. Un camino nuevo que no use ninguna de estas
 * se le escapa igual, y por eso hay una lista al final que hay que mantener.
 */

// ── El pedido, tal como queda guardado ────────────────────────────────────

/*
  Los números son los del pedido #184 real: ñoquis $5.000, matambre $7.000 con
  la promo de bebida y postre de $1.000. Total $13.000.

  En la base todo está en centavos, que es la unidad de la que salen todos los
  errores.
*/
const PESOS = { nioquis: 5000, matambre: 7000, promo: 1000, total: 13000 };
const c = (pesos) => pesos * 100;

const PEDIDO_EN_LA_BASE = {
  id: 184,
  numero: 184,
  estado: 'entregado',
  tipo_entrega: 'delivery',
  metodo_pago: 'efectivo',
  pago_estado: 'pagado',
  origen: 'tpv',
  costo_envio: 0,
  descuento: 0,
  subtotal: c(PESOS.total),
  total: c(PESOS.total),
  items: [
    {
      nombre: 'Ñoquis de Espinaca',
      cantidad: 1,
      precio_unitario: c(PESOS.nioquis),
      subtotal: c(PESOS.nioquis),
    },
    {
      nombre: 'Matambre de cerdo a la pizza',
      cantidad: 1,
      precio_unitario: c(PESOS.matambre),
      subtotal: c(PESOS.matambre + PESOS.promo),
      /*
        Como TEXTO y no como lista, a propósito: así es como sale de la
        columna `extras_json`. Con una lista el test no reproduce el error de
        los recargos —lo comprobé: se le escapaba.
      */
      extras: JSON.stringify([{ nombre: 'Bebida + Postre', precio: c(PESOS.promo) }]),
    },
  ],
};

/**
 * Saca los recargos de los ítems, vengan como lista o como texto.
 *
 * Los dos casos existen de verdad: `pedido_items.extras_json` es texto y el
 * pedido hidratado los devuelve como lista.
 */
function recargosDe(items) {
  return items.flatMap((i) => {
    const lista = Array.isArray(i.extras) ? i.extras : JSON.parse(i.extras || '[]');
    return lista.map((e) => e.precio);
  });
}

/** Copia limpia, para que un camino no ensucie al siguiente. */
const copia = () => JSON.parse(JSON.stringify(PEDIDO_EN_LA_BASE));

// ── Los caminos ───────────────────────────────────────────────────────────

/**
 * Carga `socketRooms` con una base de mentira.
 *
 * El módulo pide `../db` al cargarse, y eso abre la base de producción. Se
 * intercepta la resolución para que reciba un doble.
 */
function cargarSocket() {
  const S = path.resolve(__dirname, '../..');

  /*
    ── Por qué se guarda y se repone la caché ───────────────────────────────

    Para cargar `socketRooms` con una base falsa hay que sacarlo de la caché
    de módulos, y de paso sale `db/index.js`. Si no se repone, el siguiente
    test que pida la base la abre de nuevo —una segunda conexión al mismo
    archivo— y falla.

    Pasó: este test dejaba caídos a `asistente` y `whatsappCopiloto`, que
    corren después. Un test que rompe a otros es peor que no tenerlo.
  */
  const guardado = {};
  [`${S}/utils/socketRooms.js`, `${S}/db/index.js`].forEach((r) => {
    try {
      const clave = require.resolve(r);
      guardado[clave] = require.cache[clave];
      delete require.cache[clave];
    } catch {
      /* puede no estar cargado */
    }
  });

  const original = Module._resolveFilename;
  Module._resolveFilename = function (pedido, ...resto) {
    if (pedido === '../db') return 'db-falsa-socket';
    return original.call(this, pedido, ...resto);
  };
  require.cache['db-falsa-socket'] = {
    id: 'db-falsa-socket',
    filename: 'db-falsa-socket',
    loaded: true,
    exports: { prepare: () => ({ get: () => null, all: () => [], run: () => ({}) }) },
  };

  const mod = require(`${S}/utils/socketRooms.js`);
  Module._resolveFilename = original;
  delete require.cache['db-falsa-socket'];

  // Se repone lo que había, así los tests que siguen no se enteran de nada.
  Object.entries(guardado).forEach(([clave, valor]) => {
    if (valor) require.cache[clave] = valor;
    else delete require.cache[clave];
  });
  return mod;
}

/**
 * Recorre los caminos y devuelve, para cada uno, el total y los renglones
 * como los vería una persona.
 */
function recorrerLosCaminos() {
  const { centsToPesos } = require('../../utils/moneyConversion');
  const { buildPrintDocument } = require('../../utils/printTemplates');
  const caminos = {};

  // 1. El panel al abrir la pantalla: respuesta HTTP.
  const porHttp = centsToPesos(copia());
  caminos['panel (HTTP)'] = {
    total: porHttp.total,
    renglones: porHttp.items.map((i) => i.subtotal),
    unitarios: porHttp.items.map((i) => i.precio_unitario),
    recargos: recargosDe(porHttp.items),
  };

  // 2. El tablero cuando entra un pedido en vivo: Socket.IO.
  const socket = cargarSocket();
  let capturado = null;
  /* `emitNuevoPedido` también pide estadísticas de salas para el log, así que
     el doble tiene que tener `sockets.adapter.rooms`. */
  const io = {
    to: () => ({
      emit: (evento, payload) => {
        if (evento === 'nuevo_pedido') capturado = payload;
      },
    }),
    sockets: { adapter: { rooms: new Map() } },
  };
  socket.emitNuevoPedido(io, copia());
  caminos['tablero (socket)'] = capturado
    ? {
        total: capturado.total,
        renglones: capturado.items.map((i) => i.subtotal),
        unitarios: capturado.items.map((i) => i.precio_unitario),
        recargos: recargosDe(capturado.items),
      }
    : null;

  // 3. El papel que se le da al cliente.
  /*
    El doble tiene que contestar `pedido_items` con importes en CENTAVOS. Si
    sólo contesta la configuración, el camino que relee los ítems de la base
    no se ejercita y el error se escapa. Comprobado.
  */
  const db = {
    prepare: (sql) => ({
      all: () =>
        /pedido_items/.test(sql)
          ? [
              {
                id: 1,
                pedido_id: 184,
                nombre: 'Ñoquis de Espinaca',
                cantidad: 1,
                precio_unitario: c(PESOS.nioquis),
                subtotal: c(PESOS.nioquis),
                variantes_json: '{}',
                extras_json: '[]',
              },
              {
                id: 2,
                pedido_id: 184,
                nombre: 'Matambre de cerdo a la pizza',
                cantidad: 1,
                precio_unitario: c(PESOS.matambre),
                subtotal: c(PESOS.matambre + PESOS.promo),
                variantes_json: '{}',
                extras_json: JSON.stringify([
                  { nombre: 'Bebida + Postre', precio: c(PESOS.promo) },
                ]),
              },
            ]
          : [{ clave: 'negocio_nombre', valor: 'Modo Sabor' }],
      get: () => null,
      run: () => ({}),
    }),
  };
  const { html } = buildPrintDocument(db, centsToPesos(copia()), 'ticket_cliente');
  const importes = [...new Set(html.match(/\$[\d.]+/g) || [])];
  caminos['ticket (papel)'] = { importes };

  // 4. La comanda de cocina: no lleva precios, pero se mira que no se cuelen.
  const { html: comanda } = buildPrintDocument(db, centsToPesos(copia()), 'comanda_cocina');
  caminos['comanda'] = { importes: [...new Set(comanda.match(/\$[\d.]+/g) || [])] };

  // 5. El cierre de caja.
  const { summarizePaymentRows } = require('../../utils/paymentStatus');
  const resumen = centsToPesos(summarizePaymentRows([copia()]));
  caminos['cierre de caja'] = { total: resumen.totalCobrado };

  return caminos;
}

// ── Tests ─────────────────────────────────────────────────────────────────

function testTodosLosCaminosDicenLoMismo() {
  const caminos = recorrerLosCaminos();

  const conTotal = Object.entries(caminos).filter(([, v]) => v && v.total !== undefined);
  const desacuerdos = conTotal.filter(([, v]) => v.total !== PESOS.total);

  assert.strictEqual(
    desacuerdos.length,
    0,
    `estos caminos muestran un total distinto de $${PESOS.total}: ` +
      desacuerdos.map(([nombre, v]) => `${nombre} dice ${v.total}`).join(' · ')
  );

  console.log(`  OK los ${conTotal.length} caminos con total dicen $${PESOS.total}`);
}

function testLosRenglonesCoinciden() {
  const caminos = recorrerLosCaminos();
  const esperado = [PESOS.nioquis, PESOS.matambre + PESOS.promo];

  Object.entries(caminos)
    .filter(([, v]) => v && v.renglones)
    .forEach(([nombre, v]) => {
      assert.deepStrictEqual(
        v.renglones,
        esperado,
        `${nombre} muestra los renglones en ${JSON.stringify(v.renglones)} y tendrían que ser ${JSON.stringify(esperado)}`
      );
    });

  /* Los precios unitarios y los recargos también: el renglón puede dar bien
     por casualidad si el subtotal viene precalculado. */
  Object.entries(caminos)
    .filter(([, v]) => v && v.unitarios)
    .forEach(([nombre, v]) => {
      assert.deepStrictEqual(
        v.unitarios,
        [PESOS.nioquis, PESOS.matambre],
        `${nombre} muestra los precios unitarios en ${JSON.stringify(v.unitarios)}`
      );
      assert.deepStrictEqual(
        v.recargos,
        [PESOS.promo],
        `${nombre} muestra el recargo de la promo en ${JSON.stringify(v.recargos)} y son $${PESOS.promo}`
      );
    });

  console.log('  OK renglones, precios unitarios y recargos coinciden en todos los caminos');
}

function testElPapelNoMezclaUnidades() {
  const caminos = recorrerLosCaminos();

  /*
    El ticket #185 tenía "$500.000" en el renglón y "$5.000" en el total. Un
    papel donde los importes no cierran entre sí es lo que ve el cliente, así
    que se comprueba que todo lo impreso esté dentro del rango del pedido.
  */
  const impresos = caminos['ticket (papel)'].importes;
  const aNumero = (t) => Number(t.replace(/[$.]/g, ''));
  const fuera = impresos.filter((t) => aNumero(t) > PESOS.total);

  assert.strictEqual(
    fuera.length,
    0,
    `el ticket imprime importes mayores que el total del pedido: ${fuera.join(', ')}. ` +
      'Casi seguro son centavos sin convertir.'
  );
  assert.ok(impresos.includes(`$${PESOS.total.toLocaleString('es-AR')}`), 'falta el total impreso');

  console.log(`  OK el papel no mezcla unidades: ${impresos.join(', ')}`);
}

function testLaListaDeCaminosEstaCompleta() {
  /*
    ── Por qué esta lista se escribe a mano ─────────────────────────────────

    Este test no puede descubrir solo un camino nuevo. Si mañana alguien
    agrega, por ejemplo, un resumen por correo o una exportación a Excel, va a
    tener su propia forma de mostrar plata y este archivo no se va a enterar.

    La lista obliga a que agregar un camino sea una decisión consciente: si
    aparece uno nuevo, hay que sumarlo acá y arriba.
  */
  const caminos = Object.keys(recorrerLosCaminos());
  assert.deepStrictEqual(
    caminos.sort(),
    ['cierre de caja', 'comanda', 'panel (HTTP)', 'tablero (socket)', 'ticket (papel)'],
    'cambió la lista de caminos por los que sale la plata: revisá que el nuevo también convierta'
  );

  console.log(`  OK los ${caminos.length} caminos conocidos están cubiertos`);
}

function run() {
  console.log('\nTests de la plata de punta a punta');
  testTodosLosCaminosDicenLoMismo();
  testLosRenglonesCoinciden();
  testElPapelNoMezclaUnidades();
  testLaListaDeCaminosEstaCompleta();
  console.log('Todos los tests de la plata de punta a punta pasaron\n');
}

run();
