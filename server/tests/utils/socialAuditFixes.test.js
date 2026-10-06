const assert = require('assert');
const db = require('../../db');
const social = require('../../services/socialService');
const providers = require('../../services/social/providers');
const oauthFacebook = require('../../services/social/oauthFacebook');

async function pruebaRevalidacionAutomatica() {
  db.exec('SAVEPOINT social_audit_revalidacion');
  try {
    const ahora = Date.parse('2026-10-06T18:00:00.000Z');
    const metadata = {
      tipo: 'page',
      token: 'enc:prueba',
      pageId: 'pagina-auto',
      igId: 'instagram-auto',
      verificaciones: {
        pagina: {
          estado: 'ACTIVE',
          en: new Date(ahora - 13 * 60 * 60 * 1000).toISOString(),
        },
        instagram: {
          estado: 'ACTIVE',
          en: new Date(ahora - 60 * 60 * 1000).toISOString(),
        },
      },
    };
    const cuentaId = Number(
      db
        .prepare(
          `INSERT INTO social_accounts (provider, nombre, identificador_externo, metadata)
           VALUES ('facebook', 'Renovación automática', 'audit-revalidacion', ?)`
        )
        .run(JSON.stringify(metadata)).lastInsertRowid
    );
    const insertarDestino = db.prepare(
      `INSERT INTO social_destinations
         (cuenta_id, provider, tipo, nombre, identificador_externo, execution_class)
       VALUES (?, 'facebook', ?, ?, ?, 'api')`
    );
    insertarDestino.run(cuentaId, 'facebook_page', 'Página automática', 'pagina-auto');
    insertarDestino.run(cuentaId, 'instagram_feed', 'Instagram automático', 'instagram-auto');

    const llamadas = [];
    const resultados = await social.revalidarCredencialesApi({
      now: ahora,
      comprobar: async (id, canal) => {
        llamadas.push([id, canal]);
        return { estado: 'ACTIVE' };
      },
    });

    assert.deepStrictEqual(llamadas, [[cuentaId, 'pagina']]);
    assert.strictEqual(resultados.length, 1);
  } finally {
    db.exec('ROLLBACK TO social_audit_revalidacion; RELEASE social_audit_revalidacion');
  }
}

async function pruebaTipoDeCuentaInstagram() {
  const instagram = providers.resolverProvider({ tipo: 'instagram_feed' });
  const contenido = {
    texto: '',
    formato: 'historia',
    media: [{ mime: 'image/jpeg', ruta: '/uploads/social-media/historia.jpg' }],
  };
  const creador = instagram.validar({
    contenido,
    destino: { tipo: 'instagram_feed', metadata: { accountType: 'MEDIA_CREATOR' } },
  });
  assert.strictEqual(creador.ok, false);
  assert.ok(creador.errores.some((error) => /business/i.test(error)));

  const negocio = instagram.validar({
    contenido,
    destino: { tipo: 'instagram_feed', metadata: { accountType: 'BUSINESS' } },
  });
  assert.strictEqual(negocio.ok, true);

  const originalFetch = global.fetch;
  let urlPedida = '';
  global.fetch = async (url) => {
    urlPedida = String(url);
    return {
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'pagina-ig-tipo',
            name: 'Modo Sabor',
            access_token: 'token-prueba',
            instagram_business_account: {
              id: 'ig-tipo',
              username: 'modosabor',
              account_type: 'MEDIA_CREATOR',
            },
          },
        ],
      }),
    };
  };
  try {
    const paginas = await oauthFacebook.paginasDelUsuario('token-usuario');
    assert.match(decodeURIComponent(urlPedida), /account_type/);
    assert.strictEqual(paginas[0].instagram.tipo, 'MEDIA_CREATOR');
  } finally {
    global.fetch = originalFetch;
  }

  db.exec('SAVEPOINT social_audit_tipo_instagram');
  try {
    const metadata = {
      token: 'enc:prueba',
      igId: 'ig-creator',
      igAccountType: 'MEDIA_CREATOR',
      verificaciones: {
        instagram: { estado: 'ACTIVE', en: new Date().toISOString() },
      },
    };
    const cuentaId = Number(
      db
        .prepare(
          `INSERT INTO social_accounts (provider, nombre, identificador_externo, metadata)
           VALUES ('facebook', 'Instagram Creator', 'audit-ig-creator', ?)`
        )
        .run(JSON.stringify(metadata)).lastInsertRowid
    );
    const destinoId = Number(
      db
        .prepare(
          `INSERT INTO social_destinations
             (cuenta_id, provider, tipo, nombre, identificador_externo, execution_class)
           VALUES (?, 'facebook', 'instagram_feed', 'Instagram Creator', 'ig-creator', 'api')`
        )
        .run(cuentaId).lastInsertRowid
    );
    const mediaId = Number(
      db
        .prepare(
          `INSERT INTO social_media (nombre, ruta, mime, tamano, tipo)
           VALUES ('historia.jpg', '/uploads/social-media/historia.jpg', 'image/jpeg', 1000, 'imagen')`
        )
        .run().lastInsertRowid
    );

    assert.throws(
      () =>
        social.createCampaign({
          nombre: 'Historia no compatible',
          texto: '',
          mediaIds: [mediaId],
          destinoIds: [destinoId],
          formato: 'historia',
          programadaPara: new Date(Date.now() + 60_000).toISOString(),
        }),
      /business/i
    );
  } finally {
    db.exec('ROLLBACK TO social_audit_tipo_instagram; RELEASE social_audit_tipo_instagram');
  }
}

async function run() {
  await pruebaRevalidacionAutomatica();
  await pruebaTipoDeCuentaInstagram();
  console.log('socialAuditFixes.test.js OK');
}

module.exports = { run };
