const assert = require('assert');
const { summarizePaymentRows, getPagosParciales } = require('../../utils/paymentStatus');

/**
 * Cierre parcial: cobrar una parte de la cuenta sin cerrarla.
 *
 * Lo que se prueba no es que el cobro se guarde, sino que **la caja siga
 * cerrando**.
 *
 * El riesgo concreto: antes, un pedido pendiente contaba su total entero como
 * pendiente y no miraba los cobros parciales. Esa plata estaba en el cajón y el
 * arqueo no la veía, así que al cerrar el turno aparecía un sobrante que
 * parecía un error de caja.
 *
 * No hace falta base de datos: `summarizePaymentRows` es una función pura.
 */

const conParciales = (pagos) => JSON.stringify({ split_payments: pagos });

function run() {
  // ── 1. Tres de seis pagaron lo suyo ────────────────────────────────────────
  let r = summarizePaymentRows([
    {
      total: 2000000,
      metodo_pago: 'efectivo',
      pago_estado: 'pendiente',
      pago_detalle: conParciales([{ metodo: 'efectivo', monto: 900000 }]),
    },
  ]);
  assert.strictEqual(r.totalCobrado, 900000, 'lo cobrado a cuenta tiene que contar');
  assert.strictEqual(r.efectivoCobrado, 900000, 'y tiene que ir al cajón');
  assert.strictEqual(r.totalPendiente, 1100000, 'pendiente es sólo lo que falta');

  // ── 2. Sin cobros parciales, todo como antes ───────────────────────────────
  r = summarizePaymentRows([{ total: 2000000, metodo_pago: 'efectivo', pago_estado: 'pendiente' }]);
  assert.strictEqual(r.totalCobrado, 0);
  assert.strictEqual(r.totalPendiente, 2000000);

  // ── 3. Pagado entero: no cambia nada ───────────────────────────────────────
  r = summarizePaymentRows([{ total: 2000000, metodo_pago: 'efectivo', pago_estado: 'pagado' }]);
  assert.strictEqual(r.totalCobrado, 2000000);
  assert.strictEqual(r.totalPendiente, 0);

  // ── 4. Parcial con dos medios distintos ────────────────────────────────────
  r = summarizePaymentRows([
    {
      total: 2000000,
      metodo_pago: 'efectivo',
      pago_estado: 'pendiente',
      pago_detalle: conParciales([
        { metodo: 'efectivo', monto: 500000 },
        { metodo: 'tarjeta', monto: 500000 },
      ]),
    },
  ]);
  assert.strictEqual(r.efectivoCobrado, 500000, 'sólo el efectivo va al cajón');
  assert.strictEqual(r.digitalesCobrados, 500000, 'la tarjeta no pasa por el cajón');
  assert.strictEqual(r.totalPendiente, 1000000);

  /*
    ── 5. Cobraron de más ─────────────────────────────────────────────────────

    El endpoint no lo permite, pero un pedido viejo o una carga a mano pueden
    dejarlo así. El pendiente tiene que ser cero y no un número negativo que
    descuadre el resumen entero del turno.
  */
  r = summarizePaymentRows([
    {
      total: 1000000,
      metodo_pago: 'efectivo',
      pago_estado: 'pendiente',
      pago_detalle: conParciales([{ metodo: 'efectivo', monto: 1200000 }]),
    },
  ]);
  assert.strictEqual(r.totalPendiente, 0, 'el pendiente nunca puede ser negativo');

  // ── 6. Basura en pago_detalle no rompe nada ────────────────────────────────
  assert.deepStrictEqual(getPagosParciales({ pago_detalle: 'no es json' }), []);
  assert.deepStrictEqual(getPagosParciales({}), []);
  assert.deepStrictEqual(
    getPagosParciales({ pago_detalle: conParciales([{ metodo: 'efectivo', monto: 0 }]) }),
    [],
    'un cobro en cero no es un cobro'
  );

  /*
    Un cobro sin método cae en efectivo, porque `normalizeMetodoPago` usa
    efectivo como valor por defecto. No es una decisión de este módulo: viene de
    antes y la comparte todo el sistema.

    Se deja escrito acá porque tiene consecuencia sobre el cajón —un cobro sin
    método suma al efectivo esperado— y conviene que sea explícito en vez de una
    sorpresa. En la práctica no pasa: el endpoint de cobro parcial siempre
    resuelve el método antes de guardar.
  */
  assert.deepStrictEqual(
    getPagosParciales({ pago_detalle: conParciales([{ metodo: '', monto: 500 }]) }),
    [{ metodo_pago: 'efectivo', monto: 500 }],
    'sin método, se asume efectivo (comportamiento heredado)'
  );

  console.log('cierreParcial.test.js OK');
}

if (require.main === module) run();

module.exports = { run };
