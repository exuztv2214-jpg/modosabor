/**
 * Cobrar una mesa: el estado y el método viajan juntos.
 *
 * `PUT /pedidos/:id/pago` aceptaba solamente el estado. Con las mesas naciendo
 * pendientes eso dejaba un agujero: la mesa se marcaba cobrada arrastrando el
 * método elegido al cargar el pedido —una suposición hecha una hora antes,
 * cuando el cliente todavía miraba la carta—. Si pagaban distinto, el cierre de
 * caja repartía mal entre efectivo y digital.
 *
 * Es el mismo problema que en el delivery, donde el repartidor sí puede
 * corregir el método desde la app. El mozo no tenía cómo.
 *
 * Estos casos son sobre la forma del pedido que manda la pantalla de Mesas y
 * sobre lo que el servidor tiene que aceptar o rechazar.
 */

const assert = require('assert');
const { normalizeMetodoPago, normalizePagoEstado } = require('../../utils/paymentStatus');

/**
 * Copia de la decisión que toma la ruta, sin la base de datos de por medio.
 *
 * No es un doble de la ruta: es exactamente el orden de guardas que tiene
 * `PUT /:id/pago`. Si alguien cambia ese orden y se olvida de acá, el test
 * queda mintiendo — por eso el bloque final compara contra el archivo real.
 */
function decidirCobro(pedido, body) {
  const metodoActual = normalizeMetodoPago(pedido.metodo_pago);
  if (metodoActual === 'mercadopago') {
    return { error: 'Los pagos de MercadoPago se sincronizan desde el proveedor' };
  }

  const pedido_metodo = String(body?.metodo_pago || '').trim();
  let metodoFinal = metodoActual;
  if (pedido_metodo) {
    const normalizado = normalizeMetodoPago(pedido_metodo);
    if (normalizado === 'mercadopago') {
      return { error: 'No se puede pasar un cobro a MercadoPago a mano' };
    }
    metodoFinal = normalizado;
  }

  return {
    metodo_pago: metodoFinal,
    pago_estado: normalizePagoEstado(body?.pago_estado, {
      metodoPago: metodoFinal,
      origen: pedido.origen,
      tipoEntrega: pedido.tipo_entrega,
    }),
  };
}

function run() {
  console.log('\n🍽️  Cobrar una mesa\n');

  const mesaAbierta = {
    id: 1,
    metodo_pago: 'efectivo', // lo que se supuso al cargar el pedido
    pago_estado: 'pendiente',
    origen: 'tpv',
    tipo_entrega: 'mesa',
  };

  // ── El caso que motivó el cambio ──────────────────────────────────────────
  //
  // Se cargó como efectivo y terminaron pagando por transferencia. Antes esto
  // era imposible de decir: la mesa quedaba cobrada en efectivo y el cierre
  // buscaba una plata que nunca estuvo en el cajón.
  const corregido = decidirCobro(mesaAbierta, {
    pago_estado: 'pagado',
    metodo_pago: 'transferencia',
  });
  assert.strictEqual(corregido.pago_estado, 'pagado');
  assert.strictEqual(
    corregido.metodo_pago,
    'transferencia',
    'el método que dice el mozo tiene que ganarle al que se supuso en el TPV'
  );
  console.log('  ✓ se cobra con el método que dice el mozo, no con el supuesto');

  // ── Compatibilidad ────────────────────────────────────────────────────────
  //
  // La pantalla de Pedidos ya llamaba a esta ruta sin mandar método. Tiene que
  // seguir funcionando igual: conserva el que estaba.
  const sinMetodo = decidirCobro(mesaAbierta, { pago_estado: 'pagado' });
  assert.strictEqual(sinMetodo.pago_estado, 'pagado');
  assert.strictEqual(
    sinMetodo.metodo_pago,
    'efectivo',
    'sin método explícito se conserva el que ya tenía'
  );
  console.log('  ✓ sin método explícito, se conserva el que estaba');

  // ── Volver atrás ──────────────────────────────────────────────────────────
  //
  // Cobrar por error tiene que poder deshacerse: vuelve a pendiente y el botón
  // reaparece en la pantalla de Mesas.
  const desandado = decidirCobro(
    { ...mesaAbierta, pago_estado: 'pagado' },
    { pago_estado: 'pendiente' }
  );
  assert.strictEqual(desandado.pago_estado, 'pendiente', 'un cobro por error tiene que deshacerse');
  console.log('  ✓ un cobro equivocado se puede volver a pendiente');

  // ── Mercado Pago no se toca ───────────────────────────────────────────────
  //
  // Ni de entrada ni de salida: ese cobro lo confirma el proveedor. Marcarlo a
  // mano sería inventar una acreditación que puede no existir.
  assert.ok(
    decidirCobro({ ...mesaAbierta, metodo_pago: 'mercadopago' }, { pago_estado: 'pagado' }).error,
    'un pedido de MercadoPago no se cobra a mano'
  );
  assert.ok(
    decidirCobro(mesaAbierta, { pago_estado: 'pagado', metodo_pago: 'mercadopago' }).error,
    'no se puede pasar un cobro a MercadoPago a mano'
  );
  console.log('  ✓ MercadoPago no se puede marcar a mano, ni entrando ni saliendo');

  // ── Entradas raras ────────────────────────────────────────────────────────
  const conEspacios = decidirCobro(mesaAbierta, {
    pago_estado: 'pagado',
    metodo_pago: '  TRANSFERENCIA  ',
  });
  assert.strictEqual(
    conEspacios.metodo_pago,
    'transferencia',
    'mayúsculas y espacios no pueden crear un método nuevo'
  );
  const vacio = decidirCobro(mesaAbierta, { pago_estado: 'pagado', metodo_pago: '   ' });
  assert.strictEqual(vacio.metodo_pago, 'efectivo', 'un método en blanco no pisa el que estaba');
  console.log('  ✓ mayúsculas, espacios y vacíos no rompen nada');

  // ── Que la ruta real siga haciendo esto ───────────────────────────────────
  //
  // Lo de arriba prueba la decisión, no el archivo. Si alguien saca el manejo
  // del método de la ruta, los casos anteriores seguirían pasando y el sistema
  // estaría roto. Esto ata el test al código real.
  const fs = require('fs');
  const path = require('path');
  const ruta = fs.readFileSync(path.join(__dirname, '../../routes/pedidos.js'), 'utf8');
  const bloque = ruta.slice(ruta.indexOf("router.put('/:id/pago'"));
  const cuerpo = bloque.slice(0, bloque.indexOf('\nrouter.'));
  assert.ok(
    cuerpo.includes('req.body?.metodo_pago'),
    'la ruta PUT /:id/pago dejó de leer el método de pago del cuerpo'
  );
  assert.ok(
    cuerpo.includes('UPDATE pedidos SET metodo_pago'),
    'la ruta PUT /:id/pago dejó de guardar el método corregido'
  );
  assert.ok(
    cuerpo.includes('tipoEntrega: pedido.tipo_entrega'),
    'la ruta PUT /:id/pago dejó de pasar el tipo de entrega al deducir el estado'
  );
  console.log('  ✓ la ruta real sigue aceptando y guardando el método\n');

  console.log('✅ Cobro de mesa: todo en orden\n');
}

if (require.main === module) run();

module.exports = { run };
