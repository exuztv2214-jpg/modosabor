const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  CARPETA,
  avatarDelDestino,
  cachearAvatarRemoto,
  normalizarAvatarRemoto,
} = require('../../services/social/avatares');

const FOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4096, 0x61)]);
const destinoId = 980001;

async function run() {
  const firmada = 'https://scontent.xx.fbcdn.net/grupo.jpg?oh=firma&amp;oe=vence&amp;_nc_cat=1';
  const normalizada = 'https://scontent.xx.fbcdn.net/grupo.jpg?oh=firma&oe=vence&_nc_cat=1';

  assert.strictEqual(
    normalizarAvatarRemoto(firmada),
    normalizada,
    'las URLs que entrega el DOM de Facebook no pueden conservar entidades HTML'
  );

  const anterior = global.fetch;
  let pedida = '';
  global.fetch = async (url) => {
    pedida = String(url);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        FOTO.buffer.slice(FOTO.byteOffset, FOTO.byteOffset + FOTO.byteLength),
    };
  };

  try {
    const avatar = await cachearAvatarRemoto({ destinoId, url: firmada });
    assert.strictEqual(pedida, normalizada, 'se descarga la URL usable, no la codificada por HTML');
    assert.strictEqual(avatar, `/uploads/social-avatares/${destinoId}.jpg`);
    assert.strictEqual(
      avatarDelDestino(destinoId),
      avatar,
      'el grupo se sirve desde el archivo local'
    );
  } finally {
    global.fetch = anterior;
    try {
      fs.unlinkSync(path.join(CARPETA, `${destinoId}.jpg`));
    } catch {
      /* No llegó a crearla: también hay que restaurar la prueba. */
    }
  }
}

module.exports = { run };
