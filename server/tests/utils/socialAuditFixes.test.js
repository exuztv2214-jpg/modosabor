const assert = require('assert');
const db = require('../../db');
const social = require('../../services/socialService');

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

async function run() {
  await pruebaRevalidacionAutomatica();
  console.log('socialAuditFixes.test.js OK');
}

module.exports = { run };
