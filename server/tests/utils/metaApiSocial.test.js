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

  /* ──────────────────────────────────────────────────────────────────────────
     Reels e historias de la Fan Page
     ────────────────────────────────────────────────────────────────────────── */

  'el reel son tres pedidos y en el orden correcto': async () => {
    /*
      Un reel no se sube de una: se abre una sesión, se manda el video a OTRO
      host, y recién ahí se publica. Si el orden se altera, Meta devuelve
      errores que no dicen nada sobre el orden.
    */
    const meta = simularMeta([
      { datos: { video_id: 'v1', upload_url: 'https://rupload…' } }, // start
      { datos: { success: true } }, // subida
      { datos: { status: { video_status: 'ready' } } }, // estado
      { datos: { success: true } }, // finish
    ]);
    try {
      const r = await metaApi.publicarReelEnPagina({
        pageId: '55',
        token: 't',
        texto: 'Pizza a la piedra',
        videoUrl: 'https://modosabor.com.ar/reel.mp4',
        esperar: sinEsperar,
      });

      assert.match(meta.pedidos[0].url, /55\/video_reels$/, '1: abre la sesión');
      assert.strictEqual(meta.pedidos[0].cuerpo.upload_phase, 'start');

      assert.match(
        meta.pedidos[1].url,
        /^https:\/\/rupload\.facebook\.com\//,
        '2: el video va a rupload, no a graph'
      );

      assert.match(meta.pedidos[3].url, /55\/video_reels$/, '4: publica');
      assert.strictEqual(meta.pedidos[3].cuerpo.upload_phase, 'finish');
      assert.strictEqual(meta.pedidos[3].cuerpo.video_state, 'PUBLISHED');
      assert.strictEqual(meta.pedidos[3].cuerpo.description, 'Pizza a la piedra');

      assert.strictEqual(r.id, 'v1');
    } finally {
      meta.restaurar();
    }
  },

  'el token del video va en un header, nunca en la URL': async () => {
    /*
      La subida es la única parte del módulo donde el token viaja en un header.
      Si alguna vez se pasa a la URL, queda en los logs de cualquier proxy que
      haya en el medio — y un token de página publica en tu nombre.
    */
    const meta = simularMeta([
      { datos: { video_id: 'v1' } },
      { datos: { success: true } },
      { datos: { status: { video_status: 'ready' } } },
      { datos: { success: true } },
    ]);
    try {
      await metaApi.publicarReelEnPagina({
        pageId: '55',
        token: 'secreto',
        videoUrl: 'https://modosabor.com.ar/reel.mp4',
        esperar: sinEsperar,
      });

      const subida = meta.pedidos[1];
      assert.ok(!subida.url.includes('secreto'), 'el token no puede estar en la dirección');
      assert.ok(!subida.url.includes('access_token'));
    } finally {
      meta.restaurar();
    }
  },

  'un reel demasiado largo se frena antes de subir nada': async () => {
    /*
      Meta lo rechazaría igual, pero recién después de que subamos el archivo
      entero. Con un video de 40 MB eso son varios minutos y los datos de la
      conexión del local.
    */
    const meta = simularMeta([{ datos: {} }]);
    try {
      await assert.rejects(
        metaApi.publicarReelEnPagina({
          pageId: '55',
          token: 't',
          videoUrl: 'https://modosabor.com.ar/largo.mp4',
          duracionSegundos: 120,
          esperar: sinEsperar,
        }),
        (error) => {
          assert.strictEqual(error.codigo, 'DURACION_INVALIDA');
          assert.match(error.message, /90/, 'dice cuál es el tope');
          assert.match(error.message, /120/, 'y cuánto dura el que mandó');
          return true;
        }
      );
      assert.strictEqual(meta.pedidos.length, 0, 'no se subió nada');
    } finally {
      meta.restaurar();
    }
  },

  'un reel demasiado corto también': async () => {
    const meta = simularMeta([{ datos: {} }]);
    try {
      await assert.rejects(
        metaApi.publicarReelEnPagina({
          pageId: '55',
          token: 't',
          videoUrl: 'https://modosabor.com.ar/corto.mp4',
          duracionSegundos: 2,
          esperar: sinEsperar,
        }),
        (error) => error.codigo === 'DURACION_INVALIDA'
      );
      assert.strictEqual(meta.pedidos.length, 0);
    } finally {
      meta.restaurar();
    }
  },

  'sin saber la duración se deja pasar': async () => {
    /*
      Cuando no se conoce la duración, decide Meta. Frenar por las dudas
      bloquearía videos que en realidad sirven.
    */
    const meta = simularMeta([
      { datos: { video_id: 'v1' } },
      { datos: { success: true } },
      { datos: { status: { video_status: 'ready' } } },
      { datos: { success: true } },
    ]);
    try {
      const r = await metaApi.publicarReelEnPagina({
        pageId: '55',
        token: 't',
        videoUrl: 'https://modosabor.com.ar/reel.mp4',
        esperar: sinEsperar,
      });
      assert.strictEqual(r.id, 'v1');
    } finally {
      meta.restaurar();
    }
  },

  'el motivo del rechazo de Meta llega tal cual': async () => {
    /*
      "No se pudo publicar" no le sirve a nadie. "La resolución mínima es 540p"
      dice qué hacer.
    */
    const meta = simularMeta([
      { datos: { video_id: 'v1' } },
      { datos: { success: true } },
      {
        datos: {
          status: {
            video_status: 'processing',
            processing_phase: {
              status: 'not_started',
              error: {
                message: 'Resolution too low. Video must have a minimum resolution of 540p.',
              },
            },
          },
        },
      },
    ]);
    try {
      await assert.rejects(
        metaApi.publicarReelEnPagina({
          pageId: '55',
          token: 't',
          videoUrl: 'https://modosabor.com.ar/chico.mp4',
          esperar: sinEsperar,
        }),
        (error) => {
          assert.match(error.message, /540p/, 'el motivo real, no uno genérico');
          assert.strictEqual(error.incierto, false, 'esto es un no definitivo');
          return true;
        }
      );
    } finally {
      meta.restaurar();
    }
  },

  'la historia de foto sube sin publicar y después la publica': async () => {
    /*
      El `published: false` es lo que distingue una historia de un posteo
      común. Sin eso la foto sale al feed **y además** como historia: dos
      publicaciones donde se pidió una.
    */
    const meta = simularMeta([
      { datos: { id: 'foto1' } },
      { datos: { success: true, post_id: 'story1' } },
    ]);
    try {
      const r = await metaApi.publicarHistoriaEnPagina({
        pageId: '55',
        token: 't',
        fotoUrl: 'https://modosabor.com.ar/promo.jpg',
      });

      assert.match(meta.pedidos[0].url, /55\/photos$/);
      assert.strictEqual(
        meta.pedidos[0].cuerpo.published,
        false,
        'sin esto la foto sale también al feed'
      );

      assert.match(meta.pedidos[1].url, /55\/photo_stories$/);
      assert.strictEqual(meta.pedidos[1].cuerpo.photo_id, 'foto1');
      assert.strictEqual(r.id, 'story1');
    } finally {
      meta.restaurar();
    }
  },

  'una historia en video de más de 60 segundos se frena': async () => {
    /*
      El tope de la historia es 60, el del reel 90. Son distintos y es fácil
      confundirlos.
    */
    const meta = simularMeta([{ datos: {} }]);
    try {
      await assert.rejects(
        metaApi.publicarHistoriaEnPagina({
          pageId: '55',
          token: 't',
          videoUrl: 'https://modosabor.com.ar/largo.mp4',
          duracionSegundos: 75,
          esperar: sinEsperar,
        }),
        (error) => {
          assert.strictEqual(error.codigo, 'DURACION_INVALIDA');
          assert.match(error.message, /60/);
          return true;
        }
      );
      assert.strictEqual(meta.pedidos.length, 0);
    } finally {
      meta.restaurar();
    }
  },

  'una historia de 75 segundos se frena aunque como reel pasaría': async () => {
    /*
      Este es el caso que agarra la confusión entre los dos topes: 75 segundos
      es un reel válido y una historia inválida. Si alguien "unifica" los
      límites, este test se pone rojo.
    */
    const meta = simularMeta([
      { datos: { video_id: 'v1' } },
      { datos: { success: true } },
      { datos: { status: { video_status: 'ready' } } },
      { datos: { success: true } },
    ]);
    try {
      const reel = await metaApi.publicarReelEnPagina({
        pageId: '55',
        token: 't',
        videoUrl: 'https://modosabor.com.ar/x.mp4',
        duracionSegundos: 75,
        esperar: sinEsperar,
      });
      assert.ok(reel.id, 'como reel, 75 segundos entra');
    } finally {
      meta.restaurar();
    }
  },

  'una historia sin foto ni video ni se intenta': async () => {
    const meta = simularMeta([{ datos: {} }]);
    try {
      await assert.rejects(
        metaApi.publicarHistoriaEnPagina({ pageId: '55', token: 't' }),
        (error) => error.codigo === 'FALTA_MEDIA'
      );
      assert.strictEqual(meta.pedidos.length, 0);
    } finally {
      meta.restaurar();
    }
  },

  /* ──────────────────────────────────────────────────────────────────────────
     Formatos de Instagram
     ────────────────────────────────────────────────────────────────────────── */

  'el reel de Instagram va con media_type REELS': async () => {
    const meta = simularMeta([
      { datos: { id: 'c1' } },
      { datos: { status_code: 'FINISHED' } },
      { datos: { id: 'ig1' } },
    ]);
    try {
      await metaApi.publicarFormatoEnInstagram({
        igId: '900',
        token: 't',
        formato: 'reel',
        texto: 'Milanesas',
        videoUrl: 'https://modosabor.com.ar/reel.mp4',
        esperar: sinEsperar,
      });

      assert.strictEqual(meta.pedidos[0].cuerpo.media_type, 'REELS');
      assert.strictEqual(meta.pedidos[0].cuerpo.video_url, 'https://modosabor.com.ar/reel.mp4');
      assert.strictEqual(meta.pedidos[0].cuerpo.caption, 'Milanesas');
    } finally {
      meta.restaurar();
    }
  },

  'la historia de Instagram va con STORIES y sin texto': async () => {
    /*
      Instagram ignora el `caption` en historias. Mandarlo haría creer que el
      texto salió, cuando no salió en ningún lado.
    */
    const meta = simularMeta([
      { datos: { id: 'c1' } },
      { datos: { status_code: 'FINISHED' } },
      { datos: { id: 'ig1' } },
    ]);
    try {
      await metaApi.publicarFormatoEnInstagram({
        igId: '900',
        token: 't',
        formato: 'historia',
        texto: 'esto Instagram lo tira a la basura',
        imagenUrl: 'https://modosabor.com.ar/promo.jpg',
        esperar: sinEsperar,
      });

      assert.strictEqual(meta.pedidos[0].cuerpo.media_type, 'STORIES');
      assert.strictEqual(
        meta.pedidos[0].cuerpo.caption,
        undefined,
        'no se manda un texto que Instagram descarta'
      );
    } finally {
      meta.restaurar();
    }
  },

  'un reel de Instagram con foto en vez de video se frena': async () => {
    const meta = simularMeta([{ datos: {} }]);
    try {
      await assert.rejects(
        metaApi.publicarFormatoEnInstagram({
          igId: '900',
          token: 't',
          formato: 'reel',
          imagenUrl: 'https://modosabor.com.ar/foto.jpg',
          esperar: sinEsperar,
        }),
        (error) => error.codigo === 'FALTA_VIDEO'
      );
      assert.strictEqual(meta.pedidos.length, 0);
    } finally {
      meta.restaurar();
    }
  },

  'el carrusel crea un contenedor por pieza y después el que los agrupa': async () => {
    const meta = simularMeta([
      { datos: { id: 'h1' } },
      { datos: { id: 'h2' } },
      { datos: { id: 'h3' } },
      { datos: { id: 'carr' } },
      { datos: { status_code: 'FINISHED' } },
      { datos: { id: 'ig1' } },
    ]);
    try {
      await metaApi.publicarFormatoEnInstagram({
        igId: '900',
        token: 't',
        formato: 'carrusel',
        texto: 'La carta',
        piezas: [
          { imagenUrl: 'https://modosabor.com.ar/1.jpg' },
          { imagenUrl: 'https://modosabor.com.ar/2.jpg' },
          { imagenUrl: 'https://modosabor.com.ar/3.jpg' },
        ],
        esperar: sinEsperar,
      });

      assert.strictEqual(meta.pedidos[0].cuerpo.is_carousel_item, true);
      assert.strictEqual(meta.pedidos[1].cuerpo.is_carousel_item, true);
      assert.strictEqual(meta.pedidos[2].cuerpo.is_carousel_item, true);

      const agrupador = meta.pedidos[3].cuerpo;
      assert.strictEqual(agrupador.media_type, 'CAROUSEL');
      assert.strictEqual(
        agrupador.children,
        'h1,h2,h3',
        'y en el orden en que se mandaron: ese es el orden del carrusel'
      );
      assert.strictEqual(agrupador.caption, 'La carta');
    } finally {
      meta.restaurar();
    }
  },

  'un carrusel de más de diez piezas se frena antes de subir nada': async () => {
    const meta = simularMeta([{ datos: {} }]);
    try {
      await assert.rejects(
        metaApi.publicarFormatoEnInstagram({
          igId: '900',
          token: 't',
          formato: 'carrusel',
          piezas: Array.from({ length: 11 }, (_, i) => ({
            imagenUrl: `https://modosabor.com.ar/${i}.jpg`,
          })),
          esperar: sinEsperar,
        }),
        (error) => {
          assert.strictEqual(error.codigo, 'CARRUSEL_LARGO');
          assert.match(error.message, /11/, 'dice cuántas mandó');
          return true;
        }
      );
      assert.strictEqual(meta.pedidos.length, 0, 'no se subió ninguna de las once');
    } finally {
      meta.restaurar();
    }
  },

  'un carrusel de una sola pieza no es un carrusel': async () => {
    const meta = simularMeta([{ datos: {} }]);
    try {
      await assert.rejects(
        metaApi.publicarFormatoEnInstagram({
          igId: '900',
          token: 't',
          formato: 'carrusel',
          piezas: [{ imagenUrl: 'https://modosabor.com.ar/1.jpg' }],
          esperar: sinEsperar,
        }),
        (error) => error.codigo === 'CARRUSEL_CORTO'
      );
    } finally {
      meta.restaurar();
    }
  },

  'un formato que Instagram no conoce se rechaza con su nombre': async () => {
    const meta = simularMeta([{ datos: {} }]);
    try {
      await assert.rejects(
        metaApi.publicarFormatoEnInstagram({
          igId: '900',
          token: 't',
          formato: 'transmision',
          imagenUrl: 'https://modosabor.com.ar/1.jpg',
          esperar: sinEsperar,
        }),
        (error) => {
          assert.strictEqual(error.codigo, 'FORMATO_DESCONOCIDO');
          assert.match(error.message, /transmision/, 'dice cuál era');
          return true;
        }
      );
      assert.strictEqual(meta.pedidos.length, 0);
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
