const assert = require('assert');

const { textFromMessage, phoneFromMessage } = require('../../services/whatsappGateway');

function run() {
  console.log('\nTests del Gateway único de WhatsApp');

  assert.strictEqual(
    textFromMessage({ message: { conversation: '  hola  ' } }),
    'hola',
    'debe leer mensajes de texto simples'
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

run();
