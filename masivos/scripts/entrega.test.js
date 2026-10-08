const assert = require('node:assert/strict');
const { senalesEntrega } = require('../entrega');

const hoy = '2026-10-10';
const s = (...estados) => new Set(estados);

// Posible bloqueo: 2+ promos, nunca entregadas, la última hace 2+ días.
assert.equal(senalesEntrega(['2026-10-01', '2026-10-05'], [], s('enviado'), hoy).sinEntrega, true);
assert.equal(senalesEntrega(['2026-10-01', '2026-10-05'], [], undefined, hoy).sinEntrega, true);
assert.equal(
  senalesEntrega(['2026-10-01', '2026-10-09'], [], s('enviado'), hoy).sinEntrega,
  false,
  'la última promo es de ayer: todavía puede entregarse'
);
assert.equal(
  senalesEntrega(['2026-10-01'], [], s(), hoy).sinEntrega,
  false,
  'una sola promo no alcanza'
);
assert.equal(
  senalesEntrega(['2026-10-01', '2026-10-05'], [], s('entregado'), hoy).sinEntrega,
  false,
  'alguna entrega descarta el bloqueo'
);
assert.equal(
  senalesEntrega(['2026-10-01', '2026-10-05'], [{ texto: 'hola' }], s(), hoy).sinEntrega,
  false,
  'si respondió, no lo bloqueó'
);

// No lee: 3+ promos entregadas, ninguna leída, nunca respondió.
const tres = ['2026-10-01', '2026-10-03', '2026-10-05'];
assert.equal(senalesEntrega(tres, [], s('entregado'), hoy).noLee, true);
assert.equal(senalesEntrega(tres, [], s('entregado', 'leido'), hoy).noLee, false);
assert.equal(senalesEntrega(tres.slice(0, 2), [], s('entregado'), hoy).noLee, false);
assert.equal(senalesEntrega(tres, [{ texto: 'ok' }], s('entregado'), hoy).noLee, false);
assert.equal(senalesEntrega(tres, [], s('entregado'), hoy).sinEntrega, false);

console.log('señales de entrega: OK');
