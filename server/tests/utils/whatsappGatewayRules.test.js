const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  asksForCarta,
  shouldAnswerMenuDayDirectly,
  requestedMenuDayKind,
  buildMenuDayReply,
  usableWhatsappName,
  claimsOrderWasCreated,
  safeWebhookUrl,
  closedBusinessMessage,
} = require('../../services/whatsappGateway');

function run() {
  console.log('\nTests de reglas del gateway de WhatsApp');
  assert.strictEqual(asksForCarta('Hola, me pasás la carta?'), true);
  assert.strictEqual(asksForCarta('quiero ver el menu'), false);
  assert.strictEqual(asksForCarta('quiero ver el menú completo'), true);
  assert.strictEqual(asksForCarta('qué hay de menú del día?'), false);
  assert.strictEqual(shouldAnswerMenuDayDirectly('Q hay de menu'), true);
  assert.strictEqual(shouldAnswerMenuDayDirectly('Qué tienen hoy?'), true);
  assert.strictEqual(shouldAnswerMenuDayDirectly('Qué pizzas tienen hoy?'), false);
  assert.strictEqual(
    shouldAnswerMenuDayDirectly('Cuánto valen', 'Chispita: Te paso el menú del día'),
    true
  );
  assert.strictEqual(
    shouldAnswerMenuDayDirectly(
      'Si',
      'Chispita: Si querés ver el precio de todos los demás platos del menú del día, decime.'
    ),
    true
  );
  assert.strictEqual(
    shouldAnswerMenuDayDirectly(
      'Eso no son',
      'Chispita: Los menús económicos del día son Bombita y Albóndigas.'
    ),
    true
  );
  assert.strictEqual(shouldAnswerMenuDayDirectly('Quiero un canelón'), false);
  for (const pregunta of ['cuánto sale el envío', 'cuánto falta para mi pedido']) {
    assert.strictEqual(shouldAnswerMenuDayDirectly(pregunta, 'Te paso el menú del día'), false);
  }
  assert.strictEqual(requestedMenuDayKind('precio de los económicos'), 'economico');
  assert.strictEqual(requestedMenuDayKind('precio ejecutivo'), 'ejecutivo');
  assert.strictEqual(
    requestedMenuDayKind('Eso no son', 'Chispita: Los menús económicos del día son otros.'),
    'economico'
  );
  const menuReply = buildMenuDayReply([
    {
      nombre: 'Wok de verduras y pollo',
      tipo_menu_dia: 'economico',
      precio_desde_texto: '$5.000',
      opciones_detalle: [],
    },
    {
      nombre: 'Lasaña',
      tipo_menu_dia: 'ejecutivo',
      precio_desde_texto: '$7.000',
      opciones_detalle: [],
    },
  ]);
  assert.match(menuReply, /Económicos \(\$5\.000\)/);
  assert.match(menuReply, /Wok de verduras y pollo/);
  assert.match(menuReply, /Ejecutivos \(\$7\.000\)/);
  assert.match(menuReply, /Lasaña/);
  assert.doesNotMatch(menuReply, /Bombita|Albóndigas/);
  const economicReply = buildMenuDayReply(
    [
      {
        nombre: 'Wok',
        tipo_menu_dia: 'economico',
        precio_desde_texto: '$5.000',
        opciones_detalle: [],
      },
      {
        nombre: 'Lasaña',
        tipo_menu_dia: 'ejecutivo',
        precio_desde_texto: '$7.000',
        opciones_detalle: [],
      },
    ],
    'economico'
  );
  assert.match(economicReply, /Wok/);
  assert.doesNotMatch(economicReply, /Lasaña|Ejecutivos/);
  assert.strictEqual(usableWhatsappName('  Juan Pérez  '), 'Juan Pérez');
  assert.strictEqual(usableWhatsappName('+5493863000000'), '');
  assert.strictEqual(claimsOrderWasCreated('¡Listo! Pedido cargado con éxito.'), true);
  assert.strictEqual(claimsOrderWasCreated('¿Confirmás así el pedido?'), false);
  assert.strictEqual(claimsOrderWasCreated('Tu pedido está confirmado'), true);
  assert.strictEqual(claimsOrderWasCreated('Ya lo pasé a cocina'), true);
  assert.strictEqual(claimsOrderWasCreated('Tu pedido no está confirmado'), false);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.strictEqual(
    safeWebhookUrl('http://127.0.0.1:5678/webhook/incorrecto', 'https://n8n.example/webhook/ok'),
    'https://n8n.example/webhook/ok'
  );
  assert.strictEqual(
    safeWebhookUrl('https://n8n.example/webhook/principal', 'https://fallback.example'),
    'https://n8n.example/webhook/principal'
  );
  const cierre = closedBusinessMessage([
    { nombre: 'Turno mañana', desde: '10:00', hasta: '15:00' },
    { nombre: 'Turno noche', desde: '20:30', hasta: '02:00' },
  ]);
  assert.match(cierre, /Gracias por escribir a Modo Sabor/i);
  assert.match(cierre, /10:00 a 15:00/);
  assert.match(cierre, /20:30 a 02:00/);
  assert.match(cierre, /preparamos algo rico para vos/i);
  process.env.NODE_ENV = previousNodeEnv;
  const agentRoute = fs.readFileSync(
    path.join(__dirname, '..', '..', 'routes', 'agente.js'),
    'utf8'
  );
  const workflow = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'agente-whatsapp', 'n8n', 'build-agent-workflow.js'),
    'utf8'
  );
  assert.match(agentRoute, /\/pedido-actual/);
  assert.match(agentRoute, /\/derivar/);
  assert.match(workflow, /consultar_pedido_actual/);
  assert.match(workflow, /derivar_a_persona/);
  assert.match(workflow, /ofrecé solamente el menú del día/i);
  console.log('  ✓ distingue carta de menú del día, valida el nombre y evita localhost');
  console.log('✅ Reglas del gateway verificadas\n');
}

module.exports = { run };
