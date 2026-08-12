const assert = require('assert');

const { buildAgentTraining } = require('../../services/whatsappAgentTraining');

function run() {
  console.log('\nTests del entrenamiento de atención por WhatsApp');
  const training = buildAgentTraining(
    {
      whatsapp_agente_nombre: 'Mica',
      whatsapp_agente_estilo: 'Mensajes cortos.',
      whatsapp_agente_reglas_generales: 'No inventar.',
      whatsapp_agente_reglas_turnos: JSON.stringify({ noche: 'No ofrecer menú del día.' }),
    },
    { id: 'noche', nombre: 'Turno noche', desde: '20:30', hasta: '01:30' }
  );

  assert.strictEqual(training.nombre, 'Mica');
  assert.strictEqual(training.turno.instrucciones, 'No ofrecer menú del día.');
  assert.match(training.regla_catalogo, /precios salen de las herramientas/i);
  assert.doesNotThrow(() => buildAgentTraining({ whatsapp_agente_reglas_turnos: '{mal' }));
  console.log('  ✓ personalidad, turno y catálogo quedan separados');
  console.log('✅ Entrenamiento de WhatsApp verificado\n');
}

run();
