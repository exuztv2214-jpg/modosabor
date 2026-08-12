const assert = require('assert');
const { normalizeAgentOrderPayload } = require('../../utils/agentOrderPayload');

function run() {
  console.log('\nTests del payload de pedidos del agente');
  const order = {
    cliente_nombre: 'Prueba',
    cliente_telefono: '5493810000000',
    tipo_entrega: 'retiro',
    metodo_pago: 'efectivo',
    items: [{ producto_id: 2, cantidad: 1 }],
  };

  assert.deepStrictEqual(normalizeAgentOrderPayload({ pedido_json_texto: order }), order);
  assert.deepStrictEqual(
    normalizeAgentOrderPayload({ pedido_json_texto: JSON.stringify(order) }),
    order
  );
  assert.deepStrictEqual(normalizeAgentOrderPayload(order), order);
  assert.deepStrictEqual(
    normalizeAgentOrderPayload({
      pedido_json_texto: JSON.stringify({
        ...order,
        tipo_entrega: 'delivery',
        direccion: 'Las Piedras 415',
      }),
    }).cliente_direccion,
    'Las Piedras 415'
  );
  assert.throws(
    () => normalizeAgentOrderPayload({ pedido_json_texto: '{mal' }),
    /pedido_json_texto no es JSON valido/
  );
  console.log('  ✓ acepta objeto JSON, string JSON, body plano y el alias direccion');
  console.log('✅ Payload del agente verificado\n');
}

module.exports = { run };
