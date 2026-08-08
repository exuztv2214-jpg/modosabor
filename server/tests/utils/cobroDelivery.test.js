/**
 * El cobro de un delivery no ocurre cuando se carga el pedido.
 *
 * Un pedido del mostrador se cobra y recién ahí se entrega: nace cobrado y
 * está bien. Un delivery no. La plata está en el bolsillo del cliente, a
 * cuarenta minutos de ahí, y el método que se eligió en el TPV es una
 * suposición —el cliente muchas veces no dice cómo va a pagar hasta que el
 * repartidor toca el timbre—.
 *
 * Marcarlo cobrado desde el vamos rompía dos cosas a la vez:
 *
 *   - El cierre de caja reparte efectivo contra digital según el método de
 *     cada pedido cobrado. Suposición equivocada, reparto equivocado. Y el
 *     efectivo que se le pide rendir al repartidor sale de esa misma cuenta.
 *
 *   - En la app del repartidor el selector de forma de pago aparece cuando el
 *     cobro figura pendiente. Como nunca lo estaba, la pantalla mostraba "Ya
 *     cobrado · Efectivo" y ningún botón para corregirlo.
 *
 * Este test cubre las dos puntas: con qué estado nace cada combinación, y que
 * al entregar se salde solo.
 */

const assert = require('assert');
const {
  resolveInitialPagoEstado,
  shouldAutoSettleOnEntrega,
  normalizePagoEstado,
} = require('../../utils/paymentStatus');

function run() {
  console.log('\n🛵 Cobro de los pedidos con delivery\n');

  // ── 1. Con qué estado nace cada pedido ────────────────────────────────────
  //
  // La tabla entera, no sólo el caso que se arregló: si mañana alguien toca
  // esta función, tiene que romper el caso equivocado y no los tres que ya
  // estaban bien.
  const casos = [
    // origen,     tipoEntrega, metodo,          esperado,     por qué
    ['tpv', 'delivery', 'efectivo', 'pendiente', 'cobra el repartidor en la puerta'],
    ['tpv', 'delivery', 'transferencia', 'pendiente', 'todavía no transfirió nadie'],
    ['tpv', 'retiro', 'transferencia', 'pagado', 'mostrador: transfiere y se lo lleva'],
    ['tpv', 'mesa', 'efectivo', 'pendiente', 'pide, come y paga al final'],
    ['tpv', 'retiro', 'efectivo', 'pagado', 'paga cuando lo retira, en el local'],
    ['mesa', 'mesa', 'transferencia', 'pendiente', 'salón: la cuenta queda abierta'],
    ['web', 'delivery', 'efectivo', 'pendiente', 'como siempre'],
    ['whatsapp', 'delivery', 'efectivo', 'pendiente', 'como siempre'],
    ['web', 'delivery', 'mercadopago', 'pendiente', 'lo confirma el proveedor'],
    ['tpv', 'delivery', 'mercadopago', 'pendiente', 'lo confirma el proveedor'],
  ];

  let fallas = 0;
  for (const [origen, tipoEntrega, metodoPago, esperado, porque] of casos) {
    const real = resolveInitialPagoEstado({ metodoPago, origen, tipoEntrega });
    const ok = real === esperado;
    if (!ok) fallas += 1;
    console.log(
      `  ${ok ? '✓' : '✗'} ${origen}/${tipoEntrega}/${metodoPago}`.padEnd(44) +
        `${real}` +
        (ok ? `   (${porque})` : `   ← esperaba ${esperado}`)
    );
  }
  assert.strictEqual(fallas, 0, `${fallas} combinaciones nacen con el estado equivocado`);

  // ── 2. Un estado explícito manda sobre la regla ───────────────────────────
  //
  // Si alguien ya cobró y lo dice, se le cree. Esta rama existía y tiene que
  // seguir funcionando: es la que usa la caja para saldar a mano.
  assert.strictEqual(
    resolveInitialPagoEstado({
      metodoPago: 'efectivo',
      origen: 'tpv',
      tipoEntrega: 'delivery',
      pagoEstado: 'pagado',
    }),
    'pagado',
    'un estado explícito tiene que ganarle a la regla'
  );
  console.log('\n  ✓ un "pagado" explícito le gana a la regla');

  // ── 3. Al entregar se salda solo ──────────────────────────────────────────
  //
  // Sin esto el arreglo sería peor que el problema: los delivery quedarían
  // pendientes para siempre y la caja cerraría con todo sin cobrar.
  const enViaje = {
    metodo_pago: 'efectivo',
    pago_estado: 'pendiente',
    origen: 'tpv',
    tipo_entrega: 'delivery',
  };
  assert.strictEqual(shouldAutoSettleOnEntrega(enViaje), true, 'al entregar tiene que saldarse');
  console.log('  ✓ al marcar entregado, se salda solo');

  // Y si el repartidor corrigió el método antes de entregar, se salda con el
  // corregido. Es el caso que motivó todo esto.
  assert.strictEqual(
    shouldAutoSettleOnEntrega({ ...enViaje, metodo_pago: 'transferencia' }),
    true,
    'tiene que saldarse también si el repartidor corrigió el método'
  );
  console.log('  ✓ se salda con el método corregido por el repartidor');

  // Lo ya cobrado no se vuelve a cobrar.
  assert.strictEqual(
    shouldAutoSettleOnEntrega({ ...enViaje, pago_estado: 'pagado' }),
    false,
    'lo ya cobrado no se re-cobra'
  );
  console.log('  ✓ lo que ya estaba cobrado no se vuelve a cobrar');

  // Y las mesas NO se saldan al cerrarse. Cerrar una mesa es liberar el lugar,
  // no cobrar: el mozo la aprieta cuando se van, haya cobrado alguien o no. Si
  // se saldara sola acá, todo lo de arriba no serviría de nada —la mesa
  // volvería a quedar cobrada con el método adivinado en el TPV—.
  assert.strictEqual(
    shouldAutoSettleOnEntrega({
      metodo_pago: 'efectivo',
      pago_estado: 'pendiente',
      origen: 'tpv',
      tipo_entrega: 'mesa',
    }),
    false,
    'cerrar una mesa no puede darla por cobrada'
  );
  console.log('  ✓ cerrar una mesa NO la da por cobrada');

  // ── 4. Los pedidos viejos, con la columna vacía ───────────────────────────
  //
  // En la base hay filas anteriores a que existiera `pago_estado`. Ahí el
  // estado se deduce, y la deducción tiene que usar el tipo de entrega igual
  // que el alta. Si no, un delivery viejo se deduce "cobrado" y nunca se salda.
  assert.strictEqual(
    normalizePagoEstado('', { metodoPago: 'efectivo', origen: 'tpv', tipoEntrega: 'delivery' }),
    'pendiente',
    'un delivery viejo sin estado tiene que deducirse pendiente'
  );
  assert.strictEqual(
    normalizePagoEstado('', { metodoPago: 'efectivo', origen: 'tpv', tipoEntrega: 'mostrador' }),
    'pagado',
    'un pedido de mostrador viejo sin estado sigue deduciéndose cobrado'
  );
  assert.strictEqual(
    shouldAutoSettleOnEntrega({
      metodo_pago: 'efectivo',
      pago_estado: '',
      origen: 'tpv',
      tipo_entrega: 'delivery',
    }),
    true,
    'un delivery viejo sin estado tiene que saldarse al entregar'
  );
  console.log('  ✓ los pedidos viejos sin estado se deducen bien');

  // ── 5. La condición que usa la app del repartidor ─────────────────────────
  //
  // La app muestra el selector cuando el estado se lee como "Pendiente". Esto
  // es esa misma cuenta, del lado del servidor: si acá da pagado, el
  // repartidor ve "Ya cobrado · Efectivo" y ningún botón, que es la pantalla
  // que motivó el cambio.
  const estadoQueVeElRepartidor = normalizePagoEstado(
    resolveInitialPagoEstado({ metodoPago: 'efectivo', origen: 'tpv', tipoEntrega: 'delivery' }),
    { metodoPago: 'efectivo', origen: 'tpv', tipoEntrega: 'delivery' }
  );
  assert.strictEqual(
    estadoQueVeElRepartidor,
    'pendiente',
    'el repartidor tiene que poder corregir el método durante todo el viaje'
  );
  console.log('  ✓ el repartidor ve el selector durante todo el viaje\n');

  console.log('✅ Cobro de delivery: todo en orden\n');
}

if (require.main === module) run();

module.exports = { run };
