const assert = require('assert');
const db = require('../../db');
const { runMigrations } = require('../../db/migrations');
const social = require('../../services/socialService');
const providers = require('../../services/social/providers');
const vinculacion = require('../../services/social/vinculacion');
const { sqlFecha } = require('../../utils/fechaLocal');

async function run() {
  const accountId = Number(
    db
      .prepare(
        `INSERT INTO social_accounts (provider, nombre, identificador_externo, metadata)
                VALUES ('facebook', 'Perfil Modo Sabor histórico', 'legacy-social-test', '{"tipo":"perfil"}')`
      )
      .run().lastInsertRowid
  );
  let destinationId;
  let campaignId;
  let targetId;

  try {
    destinationId = Number(
      db
        .prepare(
          `INSERT INTO social_destinations
                  (cuenta_id, provider, tipo, nombre, identificador_externo, url)
                  VALUES (?, 'facebook', 'facebook_group', 'Grupo histórico', 'legacy-group-test', 'https://facebook.com/groups/legacy-group-test')`
        )
        .run(accountId).lastInsertRowid
    );
    campaignId = Number(
      db
        .prepare(
          "INSERT INTO social_campaigns (nombre, texto) VALUES ('Campaña histórica', 'Hola')"
        )
        .run().lastInsertRowid
    );
    targetId = Number(
      db
        .prepare('INSERT INTO social_post_targets (campana_id, destino_id) VALUES (?, ?)')
        .run(campaignId, destinationId).lastInsertRowid
    );

    runMigrations(db);
    assert.strictEqual(
      db.prepare('SELECT cuenta_id FROM social_destinations WHERE id = ?').get(destinationId)
        ?.cuenta_id,
      accountId,
      'Una migración repetida no reasigna el destino histórico'
    );
    assert.deepStrictEqual(
      db
        .prepare('SELECT campana_id, destino_id FROM social_post_targets WHERE id = ?')
        .get(targetId),
      { campana_id: campaignId, destino_id: destinationId },
      'La campaña y el target históricos siguen apuntando a los mismos IDs'
    );
  } finally {
    if (campaignId) {
      db.prepare('DELETE FROM social_campaigns WHERE id = ?').run(campaignId);
    }
    if (destinationId) {
      db.prepare('DELETE FROM social_destinations WHERE id = ?').run(destinationId);
    }
    db.prepare('DELETE FROM social_accounts WHERE id = ?').run(accountId);
  }

  const branded = db
    .prepare(
      "SELECT nombre FROM social_accounts WHERE nombre IN ('Perfil Modo Sabor', 'Fan Page Modo Sabor Delivery')"
    )
    .all();
  assert.deepStrictEqual(branded, [], 'Una instalación nueva no simula cuentas del negocio');
  const profile = db
    .prepare(
      "SELECT id FROM social_destinations WHERE tipo = 'facebook_profile' AND identificador_externo = 'me'"
    )
    .get();
  assert.strictEqual(profile, undefined, 'El perfil no es destino publicable antes de vincularlo');

  db.exec('SAVEPOINT social_operativo_estado');
  try {
    const now = Date.now();
    const checked = new Date(now - 60_000).toISOString();
    const metadata = {
      tipo: 'page',
      token: 'cifrado-de-prueba',
      pageId: 'page-1',
      igId: 'ig-1',
      verificaciones: { pagina: { estado: 'ACTIVE', en: checked } },
    };
    const accountId = Number(
      db
        .prepare(
          "INSERT INTO social_accounts (provider, nombre, identificador_externo, metadata) VALUES ('facebook', 'Página real', 'real-page-test', ?)"
        )
        .run(JSON.stringify(metadata)).lastInsertRowid
    );
    const otherAccountId = Number(
      db
        .prepare(
          "INSERT INTO social_accounts (provider, nombre, identificador_externo, metadata) VALUES ('facebook', 'Otra página', 'other-page-test', ?)"
        )
        .run(JSON.stringify({ ...metadata, pageId: 'page-2', verificaciones: {} })).lastInsertRowid
    );
    const pageId = Number(
      db
        .prepare(
          "INSERT INTO social_destinations (cuenta_id, provider, tipo, nombre, identificador_externo, execution_class) VALUES (?, 'facebook', 'facebook_page', 'Página real', 'page-1', 'api')"
        )
        .run(accountId).lastInsertRowid
    );
    const instagramId = Number(
      db
        .prepare(
          "INSERT INTO social_destinations (cuenta_id, provider, tipo, nombre, identificador_externo, execution_class) VALUES (?, 'facebook', 'instagram_feed', 'Instagram real', 'ig-1', 'api')"
        )
        .run(accountId).lastInsertRowid
    );
    const otherPageId = Number(
      db
        .prepare(
          "INSERT INTO social_destinations (cuenta_id, provider, tipo, nombre, identificador_externo, execution_class) VALUES (?, 'facebook', 'facebook_page', 'Otra página', 'page-2', 'api')"
        )
        .run(otherAccountId).lastInsertRowid
    );

    assert.strictEqual(social.estadoDeDestinoSocial({ id: pageId }, { now }).estado, 'lista');
    assert.notStrictEqual(
      social.estadoDeDestinoSocial({ id: instagramId }, { now }).estado,
      'lista'
    );
    assert.notStrictEqual(
      social.estadoDeDestinoSocial({ id: otherPageId }, { now }).estado,
      'lista'
    );
    assert.strictEqual(social.estadoViasSocial({ now }).pagina.estado, 'lista');
    assert.notStrictEqual(social.estadoViasSocial({ now }).instagram.estado, 'lista');
    assert.ok(social.dashboard().vias, 'El dashboard entrega el mismo estado real');
    assert.ok(!JSON.stringify(social.listIdentities()).includes('cifrado-de-prueba'));

    for (const en of [
      new Date(now - 25 * 60 * 60_000).toISOString(),
      new Date(now + 60_000).toISOString(),
      'fecha mala',
    ]) {
      db.prepare('UPDATE social_accounts SET metadata = ? WHERE id = ?').run(
        JSON.stringify({ ...metadata, verificaciones: { pagina: { estado: 'ACTIVE', en } } }),
        accountId
      );
      assert.strictEqual(
        social.estadoDeDestinoSocial({ id: pageId }, { now }).estado,
        'requiere_atencion'
      );
    }

    db.prepare('UPDATE social_accounts SET metadata = ?, pausada = 1 WHERE id = ?').run(
      JSON.stringify(metadata),
      accountId
    );
    assert.strictEqual(social.estadoDeDestinoSocial({ id: pageId }, { now }).estado, 'en_pausa');

    const profileId = db
      .prepare("SELECT id FROM social_accounts WHERE identificador_externo = 'fb_perfil'")
      .get().id;
    const healthId =
      Number(db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM social_worker_commands').get().id) +
      1;
    db.prepare(
      "INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('social_worker_linked_after_command_id', ?)"
    ).run(String(healthId - 1));
    db.prepare("UPDATE social_workers SET ultimo_heartbeat_en = '2000-01-01 00:00:00'").run();
    db.prepare(
      "INSERT INTO social_workers (codigo, nombre, estado, ultimo_heartbeat_en) VALUES ('test-worker', 'Prueba', 'online', ?) "
    ).run(sqlFecha(new Date(now - 121_000)));
    db.prepare(
      "INSERT INTO social_worker_commands (id, tipo, estado, resultado, finalizado_en) VALUES (?, 'health_check', 'done', '{\"facebook_session\":\"ACTIVE\"}', ?)"
    ).run(healthId, sqlFecha(new Date(now - 60_000)));
    assert.notStrictEqual(social.estadoViasSocial({ now }).perfilGrupos.estado, 'lista');
    db.prepare(
      "UPDATE social_workers SET ultimo_heartbeat_en = ? WHERE codigo = 'test-worker'"
    ).run(sqlFecha(new Date(now - 15_000)));
    db.prepare(
      "UPDATE configuracion SET valor = ? WHERE clave = 'social_worker_linked_after_command_id'"
    ).run(String(healthId));
    assert.notStrictEqual(social.estadoViasSocial({ now }).perfilGrupos.estado, 'lista');
    db.prepare(
      "UPDATE configuracion SET valor = ? WHERE clave = 'social_worker_linked_after_command_id'"
    ).run(String(healthId - 1));
    assert.strictEqual(social.estadoViasSocial({ now }).perfilGrupos.estado, 'lista');
    assert.ok(profileId);

    const provider = providers.resolverProvider({ tipo: 'facebook_page' });
    const originalSalud = provider.salud;
    provider.salud = async () => ({ estado: 'ACTIVE', detalle: 'Página comprobada' });
    try {
      await social.probarCredenciales(accountId, 'pagina');
      const saved = JSON.parse(
        db.prepare('SELECT metadata FROM social_accounts WHERE id = ?').get(accountId).metadata
      );
      assert.strictEqual(saved.verificaciones.pagina.estado, 'ACTIVE');
      assert.ok(saved.verificaciones.pagina.en);
      assert.strictEqual(saved.verificaciones.instagram, undefined);
      assert.ok(!JSON.stringify(social.listIdentities()).includes('cifrado-de-prueba'));
    } finally {
      provider.salud = originalSalud;
    }

    const oldKey = process.env.SOCIAL_WORKER_KEY;
    process.env.SOCIAL_WORKER_KEY = 'test-only-worker-key';
    try {
      const codigo = vinculacion.crearCodigo(1);
      assert.strictEqual(vinculacion.canjearCodigo(codigo).clave, 'test-only-worker-key');
      assert.strictEqual(vinculacion.canjearCodigo(codigo), null, 'El código sólo se usa una vez');
      assert.strictEqual(
        Number(
          db
            .prepare(
              "SELECT valor FROM configuracion WHERE clave = 'social_worker_linked_after_command_id'"
            )
            .get().valor
        ),
        healthId,
        'Revincular exige un control nuevo'
      );
    } finally {
      if (oldKey === undefined) {
        delete process.env.SOCIAL_WORKER_KEY;
      } else {
        process.env.SOCIAL_WORKER_KEY = oldKey;
      }
    }
    db.prepare(
      "INSERT INTO social_worker_commands (id, tipo, estado, lock_token) VALUES (?, 'health_check', 'processing', 'test-lock')"
    ).run(healthId + 1);
    social.reportCommand({
      commandId: healthId + 1,
      lockToken: 'test-lock',
      estado: 'done',
      resultado: { facebook_session: 'ACTIVE' },
    });
    assert.ok(
      db
        .prepare(
          "SELECT id FROM social_destinations WHERE cuenta_id = ? AND tipo = 'facebook_profile' AND identificador_externo = 'me'"
        )
        .get(profileId),
      'El perfil se vuelve seleccionable sólo después del control posterior a la vinculación'
    );
  } finally {
    db.exec('ROLLBACK TO social_operativo_estado; RELEASE social_operativo_estado');
  }
}

module.exports = { run };
