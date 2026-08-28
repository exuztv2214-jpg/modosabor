/**
 * Conectar una página tiene que dejar listo dónde publicar.
 *
 * ── El bug que esto impide ─────────────────────────────────────────────────
 *
 * Conectar guardaba el token y el ID de Instagram en la identidad, y ahí
 * terminaba. Pero el sistema no publica en identidades: publica en **destinos**,
 * y nadie los creaba.
 *
 * En pantalla se veía "Conectada «Modo Sabor Delivery», con Instagram
 * @modosaborok" —cierto— y después Instagram no aparecía por ningún lado para
 * poder elegirlo. Nada fallaba, nada avisaba, y no se podía usar.
 *
 * Es el mismo patrón que las fechas ISO y que `/groups/joined/`: el sistema
 * afirmando algo verdadero mientras la parte que importa no existe.
 */
const assert = require('assert');
const db = require('../../db');
const oauth = require('../../services/social/oauthFacebook');

let n = 0;
const unico = () => `${Date.now()}-${++n}`;

/** Una identidad con el token ya puesto, como queda después de conectar. */
function identidadConectada({ igId, igUsuario } = {}) {
  const marca = unico();
  const metadata = {
    tipo: 'page',
    token: 'enc:fingido',
    pageId: `page_${marca}`,
    pageNombre: 'Modo Sabor Delivery',
    ...(igId ? { igId, igUsuario } : {}),
  };

  const r = db
    .prepare(
      `INSERT INTO social_accounts (provider, clave, nombre, habilitada, metadata)
       VALUES ('facebook', ?, 'Fan Page', 1, ?)`
    )
    .run(`dest_${marca}`, JSON.stringify(metadata));

  return { id: Number(r.lastInsertRowid), metadata };
}

const destinosDe = (cuentaId) =>
  db
    .prepare(
      'SELECT tipo, nombre, identificador_externo, execution_class, provider_clave FROM social_destinations WHERE cuenta_id = ?'
    )
    .all(cuentaId);

module.exports = {
  'conectar deja creado el destino de la página': () => {
    const cuenta = identidadConectada();
    oauth.crearDestinosDeLaPagina(cuenta.id, {
      id: cuenta.metadata.pageId,
      nombre: 'Modo Sabor Delivery',
    });

    const pagina = destinosDe(cuenta.id).find((d) => d.tipo === 'facebook_page');
    assert.ok(pagina, 'tiene que existir el destino de la página');
    assert.strictEqual(pagina.nombre, 'Modo Sabor Delivery');
  },

  'y el de Instagram, que era el que faltaba': () => {
    const cuenta = identidadConectada();
    oauth.crearDestinosDeLaPagina(cuenta.id, {
      id: cuenta.metadata.pageId,
      nombre: 'Modo Sabor Delivery',
      instagram: { id: '17841400000000000', usuario: 'modosaborok' },
    });

    const ig = destinosDe(cuenta.id).find((d) => d.tipo === 'instagram_feed');
    assert.ok(ig, 'sin esto Instagram no aparece para elegir');
    assert.strictEqual(ig.nombre, '@modosaborok');
    assert.strictEqual(ig.identificador_externo, '17841400000000000');
  },

  'los dos salen por la API oficial, no por el navegador': () => {
    /*
      Si quedaran como `browser`, el despachador del servidor los ignoraría y
      se los pasaría a la extensión — que no sabe publicar en una Fan Page por
      API. Se quedarían esperando para siempre.
    */
    const cuenta = identidadConectada();
    oauth.crearDestinosDeLaPagina(cuenta.id, {
      id: cuenta.metadata.pageId,
      nombre: 'Modo Sabor Delivery',
      instagram: { id: '178414999', usuario: 'modosaborok' },
    });

    for (const destino of destinosDe(cuenta.id)) {
      assert.strictEqual(destino.execution_class, 'api', `${destino.tipo} sale por API`);
      assert.ok(destino.provider_clave, `${destino.tipo} tiene provider`);
    }
  },

  'reconectar no duplica': () => {
    /*
      Reconectar tiene que poder hacerse mil veces —para renovar el token, para
      cambiar de página— sin llenar la lista de copias. Con veintinueve grupos
      ya cargados, duplicar destinos vuelve la pantalla ilegible.
    */
    const cuenta = identidadConectada();
    const pagina = {
      id: cuenta.metadata.pageId,
      nombre: 'Modo Sabor Delivery',
      instagram: { id: '178414111', usuario: 'modosaborok' },
    };

    oauth.crearDestinosDeLaPagina(cuenta.id, pagina);
    oauth.crearDestinosDeLaPagina(cuenta.id, pagina);
    oauth.crearDestinosDeLaPagina(cuenta.id, pagina);

    assert.strictEqual(
      destinosDe(cuenta.id).length,
      2,
      'la página y su Instagram, una vez cada uno'
    );
  },

  'reconectar actualiza el nombre si cambió': () => {
    const cuenta = identidadConectada();
    const base = { id: cuenta.metadata.pageId };

    oauth.crearDestinosDeLaPagina(cuenta.id, { ...base, nombre: 'Nombre viejo' });
    oauth.crearDestinosDeLaPagina(cuenta.id, { ...base, nombre: 'Modo Sabor Delivery' });

    const pagina = destinosDe(cuenta.id).find((d) => d.tipo === 'facebook_page');
    assert.strictEqual(pagina.nombre, 'Modo Sabor Delivery');
  },

  'una página sin Instagram no inventa el destino': () => {
    /*
      No todas las páginas tienen Instagram vinculado. Crear el destino igual
      dejaría en la lista un lugar donde publicar que no existe, y la campaña
      fallaría al salir en vez de al elegirlo.
    */
    const cuenta = identidadConectada();
    oauth.crearDestinosDeLaPagina(cuenta.id, {
      id: cuenta.metadata.pageId,
      nombre: 'Sin Instagram',
    });

    const destinos = destinosDe(cuenta.id);
    assert.strictEqual(destinos.length, 1);
    assert.strictEqual(destinos[0].tipo, 'facebook_page');
  },

  'un Instagram sin nombre de usuario igual se crea': () => {
    /*
      Meta a veces devuelve el ID y no el usuario. El destino sirve igual —
      publicar necesita el ID, no el nombre— así que se crea con una etiqueta
      genérica en vez de descartarlo.
    */
    const cuenta = identidadConectada();
    oauth.crearDestinosDeLaPagina(cuenta.id, {
      id: cuenta.metadata.pageId,
      nombre: 'Página',
      instagram: { id: '178414222' },
    });

    const ig = destinosDe(cuenta.id).find((d) => d.tipo === 'instagram_feed');
    assert.ok(ig);
    assert.strictEqual(ig.nombre, 'Instagram');
  },
};
