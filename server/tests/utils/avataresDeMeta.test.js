/**
 * Las fotos de perfil de las cuentas conectadas.
 *
 * ── El bug que esto impide ─────────────────────────────────────────────────
 *
 * La vista previa mostraba un círculo de color con las iniciales de la cuenta.
 * Existe para contestar "¿cómo va a salir esto?", y en Facebook ahí va la foto
 * de la página — así que la respuesta era que no.
 *
 * ── Y el bug que se puede introducir arreglándolo ──────────────────────────
 *
 * El CDN de Meta contesta **200** cuando una URL firmada venció: devuelve una
 * página de error, no la imagen. Guardar esa respuesta deja un archivo que
 * existe y no es una foto, y como `avatarDelDestino` sólo mira si el archivo
 * está, la vista previa quedaría con un cuadrado roto **para siempre** — y sin
 * forma de que el sistema se dé cuenta solo.
 *
 * Por eso los tests de acá se dividen en dos grupos: los que verifican que se
 * pide a la red correcta, y los que verifican que no se guarda basura.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { avatarDelDestino, bajarAvatar, CARPETA } = require('../../services/social/avatares');
const { encriptar } = require('../../utils/encryptConfig');

/* Un JPEG mínimo de verdad, del tamaño que tiene una foto de perfil real. */
const UNA_FOTO = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 0x42)]);

const TOKEN = encriptar('token-de-prueba');

/*
  Se reemplaza `fetch` en vez de levantar un servidor.

  Lo que se está probando es a qué URL se le pide qué y qué se hace con la
  respuesta. Un servidor de mentira agregaría puertos, esperas y una fuente más
  de fallas intermitentes sin verificar nada extra.
*/
function conRespuestas(guion) {
  const original = global.fetch;
  const pedidos = [];

  global.fetch = async (url) => {
    pedidos.push(String(url));
    const respuesta = guion(String(url), pedidos.length);
    if (!respuesta) throw new Error(`El test no previó este pedido: ${url}`);
    return respuesta;
  };

  return {
    pedidos,
    restaurar: () => {
      global.fetch = original;
    },
  };
}

const respuestaJson = (datos, ok = true) => ({
  ok,
  status: ok ? 200 : 400,
  json: async () => datos,
});

const respuestaBinaria = (bytes) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
});

/* Un id por test para que no se pisen los archivos entre sí. */
let siguienteId = 900000;
const nuevoId = () => (siguienteId += 1);

const limpiar = (id) => {
  try {
    fs.unlinkSync(path.join(CARPETA, `${id}.jpg`));
  } catch {
    /* No haberla creado es un resultado válido en varios de estos tests. */
  }
};

module.exports = {
  'la foto de una página se pide a la arista /picture de Facebook': async () => {
    const id = nuevoId();
    const red = conRespuestas((url) =>
      url.includes('/picture')
        ? respuestaJson({ data: { url: 'https://cdn.meta/foto.jpg' } })
        : respuestaBinaria(UNA_FOTO)
    );

    try {
      const avatar = await bajarAvatar({
        destinoId: id,
        tipo: 'facebook_page',
        idExterno: '123',
        tokenCifrado: TOKEN,
      });

      assert.strictEqual(avatar, `/uploads/social-avatares/${id}.jpg`);
      assert.ok(red.pedidos[0].includes('/123/picture'), red.pedidos[0]);
      /*
        `redirect=0` es lo que hace que Meta conteste JSON en vez de mandar la
        imagen directamente. Sin eso, `json()` recibe bytes y explota.
      */
      assert.ok(red.pedidos[0].includes('redirect=0'), 'tiene que pedir JSON');
    } finally {
      red.restaurar();
      limpiar(id);
    }
  },

  'la de Instagram se pide como un campo de la cuenta, no como /picture': async () => {
    /*
      Son dos productos distintos con dos formas distintas de dar lo mismo.
      Pedirle `/picture` a un id de Instagram devuelve un error de permisos que
      no dice nada sobre cuál es el problema real.
    */
    const id = nuevoId();
    const red = conRespuestas((url) =>
      url.includes('profile_picture_url')
        ? respuestaJson({ profile_picture_url: 'https://cdn.meta/ig.jpg' })
        : respuestaBinaria(UNA_FOTO)
    );

    try {
      const avatar = await bajarAvatar({
        destinoId: id,
        tipo: 'instagram_feed',
        idExterno: '178414',
        tokenCifrado: TOKEN,
      });

      assert.strictEqual(avatar, `/uploads/social-avatares/${id}.jpg`);
      assert.ok(red.pedidos[0].includes('fields=profile_picture_url'), red.pedidos[0]);
      assert.ok(!red.pedidos[0].includes('/picture'), 'no es la arista de Facebook');
    } finally {
      red.restaurar();
      limpiar(id);
    }
  },

  'una respuesta diminuta no se guarda como si fuera una foto': async () => {
    /*
      El caso del CDN vencido: contesta 200 con una página de error de 300
      bytes. Guardarla dejaría un archivo roto que `avatarDelDestino` daría por
      bueno para siempre.
    */
    const id = nuevoId();
    const red = conRespuestas((url) =>
      url.includes('/picture')
        ? respuestaJson({ data: { url: 'https://cdn.meta/vencida.jpg' } })
        : respuestaBinaria(Buffer.from('<html>URL signature expired</html>'))
    );

    try {
      const avatar = await bajarAvatar({
        destinoId: id,
        tipo: 'facebook_page',
        idExterno: '123',
        tokenCifrado: TOKEN,
      });

      assert.strictEqual(avatar, null, 'no se pudo, y se dice');
      assert.strictEqual(avatarDelDestino(id), null, 'y no quedó ningún archivo');
    } finally {
      red.restaurar();
      limpiar(id);
    }
  },

  'un error de Meta no rompe nada, devuelve null': async () => {
    /*
      Una foto que no se pudo bajar no puede impedir que la cuenta quede
      conectada. Si esto tirara, `crearDestinosDeLaPagina` se cortaría a la
      mitad y la conexión —que es lo importante— quedaría sin terminar.
    */
    const id = nuevoId();
    const red = conRespuestas(() =>
      respuestaJson({ error: { message: 'Error validating access token' } }, false)
    );

    try {
      const avatar = await bajarAvatar({
        destinoId: id,
        tipo: 'facebook_page',
        idExterno: '123',
        tokenCifrado: TOKEN,
      });
      assert.strictEqual(avatar, null);
    } finally {
      red.restaurar();
      limpiar(id);
    }
  },

  'sin token no se sale a la red': async () => {
    /*
      Los grupos y el perfil personal no tienen token propio. Pedirle la foto a
      Meta sin token es un viaje garantizado a un 400.
    */
    const red = conRespuestas(() => null);
    try {
      const avatar = await bajarAvatar({
        destinoId: nuevoId(),
        tipo: 'facebook_group',
        idExterno: '999',
        tokenCifrado: '',
      });

      assert.strictEqual(avatar, null);
      assert.strictEqual(red.pedidos.length, 0, 'ni un pedido');
    } finally {
      red.restaurar();
    }
  },

  'sin id externo tampoco se sale a la red': async () => {
    /*
      Un destino sin `identificador_externo` es un destino a medio crear. Sin
      esta guarda la URL queda como `.../v25.0//picture`, que Meta contesta con
      un 400 genérico: se gasta un viaje para enterarse de algo que se sabía
      antes de salir.
    */
    const red = conRespuestas(() => null);
    try {
      const avatar = await bajarAvatar({
        destinoId: nuevoId(),
        tipo: 'facebook_page',
        idExterno: '',
        tokenCifrado: TOKEN,
      });

      assert.strictEqual(avatar, null);
      assert.strictEqual(red.pedidos.length, 0, 'ni un pedido');
    } finally {
      red.restaurar();
    }
  },

  'sin archivo en el disco, el destino no tiene foto': () => {
    /*
      Se mira el disco y no una columna de la base a propósito: restaurar un
      backup de la base sin los uploads dejaría a la base afirmando que hay
      fotos que no están.
    */
    assert.strictEqual(avatarDelDestino(nuevoId()), null);
    assert.strictEqual(avatarDelDestino(null), null);
    assert.strictEqual(avatarDelDestino(0), null);
  },
};
