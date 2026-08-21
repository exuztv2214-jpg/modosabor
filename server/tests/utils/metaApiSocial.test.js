/**
 * La conversación con la API oficial de Meta.
 *
 * ── Qué se puede probar y qué no ───────────────────────────────────────────
 *
 * Estos tests reemplazan `fetch` y verifican que armamos bien el pedido y que
 * entendemos bien la respuesta. **No prueban que funcione contra Facebook**:
 * para eso hace falta un token con permisos aprobados, y eso depende de una
 * App Review que sólo puede hacer el dueño de la cuenta.
 *
 * O sea: si estos tests están en verde, el día que llegue el token la única
 * incógnita van a ser los permisos, no el código.
 *
 * Los endpoints salieron de la documentación de v25.0 del 21 de agosto de
 * 2026, no de memoria.
 */
const assert = require('assert');
const metaApi = require('../../services/social/metaApi');

/** Reemplaza fetch y devuelve lo que se le pidió a Meta. */
function simularMeta(respuestas) {
  const pedidos = [];
  const original = global.fetch;
  let turno = 0;

  global.fetch = async (url, opciones = {}) => {
    pedidos.push({
      url: String(url),
      metodo: opciones.method || 'GET',
      cuerpo: opciones.body ? JSON.parse(opciones.body) : null,
    });
    const respuesta = respuestas[Math.min(turno, respuestas.length - 1)];
    turno += 1;
    if (respuesta instanceof Error) throw respuesta;
    return {
      ok: respuesta.ok !== false,
      json: async () => respuesta.datos,
    };
  };

  return { pedidos, restaurar: () => (global.fetch = original) };
}

/* En los tests no se espera de verdad: el reloj es lo único simulado además de fetch. */
const sinEsperar = async () => {};

module.exports = {
  // ── El token nunca se filtra ────────────────────────────────────────────
  /*
    ── Tres reglas, tres tests ──────────────────────────────────────────────

    Meta devuelve el pedido completo en algunos errores, token incluido. Sin
    esta limpieza ese token terminaría en la tabla de logs — es la llave de la
    Fan Page.

    Cada test usa un token que **sólo** cae en la regla que está probando. Una
    versión anterior usaba el mismo token para todo, y como caía en dos reglas
    a la vez, sacar cualquiera de las dos no se notaba: lo comprobé
    borrándolas de a una y los tests seguían en verde.
  */
  'limpia el token cuando viene como parámetro': () => {
    const sucio = 'Error en access_token=xyz123abc456def789 al publicar';
    const limpio = metaApi.limpiarSecretos(sucio);

    assert.ok(!limpio.includes('xyz123abc456def789'), 'el token no puede quedar');
    assert.match(limpio, /access_token=\*\*\*/);
  },

  'limpia el token cuando viene adentro de un JSON': () => {
    const sucio = '{"access_token":"zzz999888777666555","id":"1"}';
    const limpio = metaApi.limpiarSecretos(sucio);
    assert.ok(!limpio.includes('zzz999888777666555'));
  },

  'limpia un token suelto por su forma': () => {
    /*
      Los tokens de Meta empiezan con EAA. Aunque venga sin etiqueta, en medio
      de una frase, se reconoce y se tapa.
    */
    const sucio = 'el pedido EAABwzLixnjYBO1234567890abcdefghijklmnop no anduvo';
    const limpio = metaApi.limpiarSecretos(sucio);
    assert.ok(!limpio.includes('EAABwzLixnjYBO'));
  },

  'el error que se guarda ya viene limpio': () => {
    const error = new metaApi.ErrorDeMeta(
      'falló con access_token=EAABwzLixnjYBO1234567890abcdefghij'
    );
    assert.ok(!error.message.includes('EAABwzLix'));
  },

  'el token no viaja en la URL': async () => {
    /*
      Las URLs terminan en logs de servidores intermedios. Un token de
      publicación ahí es un problema serio, así que en los POST va en el
      cuerpo.
    */
    const meta = simularMeta([{ datos: { id: '123_456' } }]);
    try {
      await metaApi.publicarEnPagina({
        pageId: '123',
        token: 'secreto',
        texto: 'hola',
      });
      assert.ok(!meta.pedidos[0].url.includes('secreto'), 'no puede estar en la URL');
      assert.strictEqual(meta.pedidos[0].cuerpo.access_token, 'secreto');
    } finally {
      meta.restaurar();
    }
  },

  // ── Fan Page ────────────────────────────────────────────────────────────
  'un texto va al feed de la página': async () => {
    const meta = simularMeta([{ datos: { id: '123_456' } }]);
    try {
      const r = await metaApi.publicarEnPagina({
        pageId: '123',
        token: 't',
        texto: 'Hoy hay locro',
      });

      assert.match(meta.pedidos[0].url, /\/v25\.0\/123\/feed$/);
      assert.strictEqual(meta.pedidos[0].metodo, 'POST');
      assert.strictEqual(meta.pedidos[0].cuerpo.message, 'Hoy hay locro');
      assert.strictEqual(r.id, '123_456');
      assert.strictEqual(r.url, 'https://www.facebook.com/123_456');
    } finally {
      meta.restaurar();
    }
  },

  'una foto va a otro endpoint y devuelve el id del posteo': async () => {
    /*
      `/photos` devuelve dos ids: el de la foto y el del posteo. El que sirve
      para armar el link es `post_id`; quedarse con `id` daría un link a la
      foto suelta.
    */
    const meta = simularMeta([{ datos: { id: 'foto99', post_id: '123_777' } }]);
    try {
      const r = await metaApi.publicarEnPagina({
        pageId: '123',
        token: 't',
        texto: 'Mirá esto',
        fotoUrl: 'https://modosabor.com.ar/uploads/menu.jpg',
      });

      assert.match(meta.pedidos[0].url, /\/123\/photos$/);
      assert.strictEqual(meta.pedidos[0].cuerpo.url, 'https://modosabor.com.ar/uploads/menu.jpg');
      assert.strictEqual(r.id, '123_777', 'el id del posteo, no el de la foto');
    } finally {
      meta.restaurar();
    }
  },

  'el link va como parámetro aparte, no pegado al texto': async () => {
    const meta = simularMeta([{ datos: { id: '1_2' } }]);
    try {
      await metaApi.publicarEnPagina({
        pageId: '1',
        token: 't',
        texto: 'Pedí por acá',
        link: 'https://modosabor.com.ar',
      });
      assert.strictEqual(meta.pedidos[0].cuerpo.link, 'https://modosabor.com.ar');
      assert.strictEqual(meta.pedidos[0].cuerpo.message, 'Pedí por acá');
    } finally {
      meta.restaurar();
    }
  },

  // ── Instagram: dos pasos y una espera ───────────────────────────────────
  'Instagram crea el contenedor, espera y recién ahí publica': async () => {
    const meta = simularMeta([
      { datos: { id: 'cont1' } }, // crear contenedor
      { datos: { status_code: 'FINISHED' } }, // consulta de estado
      { datos: { id: 'media1' } }, // publicar
    ]);
    try {
      const r = await metaApi.publicarEnInstagram({
        igId: '900',
        token: 't',
        texto: 'Milanesas',
        imagenUrl: 'https://modosabor.com.ar/uploads/mila.jpg',
        esperar: sinEsperar,
      });

      assert.strictEqual(meta.pedidos.length, 3, 'son tres pedidos, no uno');
      assert.match(meta.pedidos[0].url, /\/900\/media$/);
      assert.match(meta.pedidos[2].url, /\/900\/media_publish$/);
      assert.strictEqual(meta.pedidos[2].cuerpo.creation_id, 'cont1');
      assert.strictEqual(r.id, 'media1');
    } finally {
      meta.restaurar();
    }
  },

  'si el contenedor sigue procesando, se vuelve a preguntar': async () => {
    const meta = simularMeta([
      { datos: { id: 'cont1' } },
      { datos: { status_code: 'IN_PROGRESS' } },
      { datos: { status_code: 'IN_PROGRESS' } },
      { datos: { status_code: 'FINISHED' } },
      { datos: { id: 'media1' } },
    ]);
    try {
      const r = await metaApi.publicarEnInstagram({
        igId: '900',
        token: 't',
        texto: 'x',
        imagenUrl: 'https://x/y.jpg',
        esperar: sinEsperar,
      });
      assert.strictEqual(r.id, 'media1');
    } finally {
      meta.restaurar();
    }
  },

  'un contenedor rechazado falla y no se reintenta': async () => {
    /*
      ERROR y EXPIRED son definitivos: la imagen no le sirvió a Meta y mandar
      el mismo contenedor otra vez va a dar lo mismo.
    */
    const meta = simularMeta([{ datos: { id: 'cont1' } }, { datos: { status_code: 'ERROR' } }]);
    try {
      await assert.rejects(
        metaApi.publicarEnInstagram({
          igId: '900',
          token: 't',
          texto: 'x',
          imagenUrl: 'https://x/y.jpg',
          esperar: sinEsperar,
        }),
        (error) => {
          assert.strictEqual(error.codigo, 'MEDIA_RECHAZADA');
          assert.strictEqual(error.incierto, false);
          return true;
        }
      );
    } finally {
      meta.restaurar();
    }
  },

  'un contenedor que nunca termina queda incierto, no fallido': async () => {
    /*
      Puede terminar solo más tarde y publicarse. Marcarlo como fallido
      invitaría a reintentar, y reintentar algo que quizás salió es publicar
      dos veces.
    */
    const meta = simularMeta([
      { datos: { id: 'cont1' } },
      { datos: { status_code: 'IN_PROGRESS' } },
    ]);
    try {
      await assert.rejects(
        metaApi.publicarEnInstagram({
          igId: '900',
          token: 't',
          texto: 'x',
          imagenUrl: 'https://x/y.jpg',
          esperar: sinEsperar,
        }),
        (error) => error.incierto === true
      );
    } finally {
      meta.restaurar();
    }
  },

  'Instagram sin imagen ni se intenta': async () => {
    const meta = simularMeta([{ datos: {} }]);
    try {
      await assert.rejects(
        metaApi.publicarEnInstagram({ igId: '900', token: 't', texto: 'x', imagenUrl: '' }),
        (error) => error.codigo === 'FALTA_IMAGEN'
      );
      assert.strictEqual(
        meta.pedidos.length,
        0,
        'no se gastó un pedido en algo que no puede salir'
      );
    } finally {
      meta.restaurar();
    }
  },

  // ── Los errores de Meta, traducidos ─────────────────────────────────────
  'un token vencido se dice en castellano': async () => {
    const meta = simularMeta([{ ok: false, datos: { error: { code: 190 } } }]);
    try {
      await assert.rejects(
        metaApi.publicarEnPagina({ pageId: '1', token: 't', texto: 'x' }),
        (error) => {
          assert.strictEqual(error.codigo, 'TOKEN_VENCIDO');
          assert.match(error.message, /venció|revocado/);
          return true;
        }
      );
    } finally {
      meta.restaurar();
    }
  },

  'un error de permisos dice cuáles faltan': () => {
    /*
      "Error 200" no le sirve a nadie. Hay que poder mostrar qué permiso pedir.
    */
    const error = metaApi.explicarError({ error: { code: 200 } });
    assert.strictEqual(error.codigo, 'SIN_PERMISOS');
    assert.match(error.message, /pages_manage_posts/);
  },

  'el límite de pedidos de Meta se distingue de un fallo': () => {
    assert.strictEqual(metaApi.explicarError({ error: { code: 32 } }).codigo, 'LIMITE_DE_META');
    assert.strictEqual(
      metaApi.explicarError({ error: { code: 1, error_subcode: 2446079 } }).codigo,
      'LIMITE_DE_META'
    );
  },

  'un problema temporal de Meta queda incierto': () => {
    const error = metaApi.explicarError({ error: { code: 2 } });
    assert.strictEqual(error.incierto, true);
  },

  'un error que no conocemos igual se muestra': () => {
    const error = metaApi.explicarError({ error: { code: 9999, message: 'algo raro pasó' } });
    assert.strictEqual(error.message, 'algo raro pasó');
    assert.strictEqual(error.codigo, 'META_9999');
  },

  'si no se pudo ni hablar con Meta, es incierto': async () => {
    /*
      El pedido pudo haber llegado igual y haberse publicado. No se sabe.
    */
    const meta = simularMeta([new Error('ECONNRESET')]);
    try {
      await assert.rejects(
        metaApi.publicarEnPagina({ pageId: '1', token: 't', texto: 'x' }),
        (error) => error.incierto === true
      );
    } finally {
      meta.restaurar();
    }
  },

  // ── La versión ──────────────────────────────────────────────────────────
  'la versión de la API va fija y explícita en cada llamada': async () => {
    /*
      Meta rota versiones cada pocos meses. Con la versión escrita, el día que
      deje de andar el error va a decir exactamente eso. Sin versión, la API
      usa la más vieja soportada y el comportamiento cambia solo.
    */
    const meta = simularMeta([{ datos: { id: '1' } }]);
    try {
      await metaApi.publicarEnPagina({ pageId: '1', token: 't', texto: 'x' });
      assert.match(meta.pedidos[0].url, /graph\.facebook\.com\/v\d+\.\d+\//);
    } finally {
      meta.restaurar();
    }
  },
};
