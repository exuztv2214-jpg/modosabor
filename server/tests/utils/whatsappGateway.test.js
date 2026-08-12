const assert = require('assert');

const {
  textFromMessage,
  phoneFromMessage,
  enqueueIncoming,
  serializeByKey,
} = require('../../services/whatsappGateway');

async function run() {
  console.log('\nTests del Gateway único de WhatsApp');

  assert.strictEqual(
    textFromMessage({ message: { conversation: '  hola  ' } }),
    'hola',
    'debe leer mensajes de texto simples'
  );

  const order = [];
  const first = serializeByKey('chat-prueba', async () => {
    order.push('primero-inicio');
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push('primero-fin');
  });
  const second = serializeByKey('chat-prueba', async () => {
    order.push('segundo');
  });
  await Promise.all([first, second]);
  assert.deepStrictEqual(order, ['primero-inicio', 'primero-fin', 'segundo']);

  assert.strictEqual(
    typeof enqueueIncoming,
    'function',
    'el gateway debe serializar mensajes por conversación'
  );
  assert.strictEqual(
    textFromMessage({
      message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'confirmo' } } } },
    }),
    'confirmo',
    'debe abrir mensajes efímeros'
  );

  assert.strictEqual(
    phoneFromMessage({
      key: {
        remoteJid: '252153369210986@lid',
        remoteJidAlt: '5493863123456@s.whatsapp.net',
      },
    }),
    '5493863123456',
    'debe preferir el teléfono real antes que el LID'
  );
  assert.strictEqual(
    phoneFromMessage({ key: { remoteJid: '5493863123456@s.whatsapp.net' } }),
    '5493863123456',
    'debe aceptar el JID tradicional'
  );

  console.log('  ✓ texto, efímeros y teléfonos @lid normalizados');
  console.log('✅ Gateway único de WhatsApp verificado\n');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
