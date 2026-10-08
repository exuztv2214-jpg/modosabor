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
    const listedStates = new Map(
      social
        .listDestinations()
        .map((destination) => [destination.id, destination.estadoConexion?.estado])
    );
    assert.strictEqual(listedStates.get(pageId), 'lista');
    assert.notStrictEqual(listedStates.get(otherPageId), 'lista');
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
    const syncProfileCommand = social.createWorkerCommand('sync_facebook_groups', {
      identityId: profileId,
    });
    assert.deepStrictEqual(
      JSON.parse(
        db
          .prepare('SELECT payload FROM social_worker_commands WHERE id = ?')
          .get(syncProfileCommand).payload
      ),
      { identityId: profileId, identityTipo: 'perfil', identityNombre: 'Perfil de Facebook' },
      'El Worker recibe la identidad completa para cambiar al Perfil antes de leer sus grupos'
    );
    db.prepare(
      "DELETE FROM configuracion WHERE clave = 'social_worker_linked_after_command_id'"
    ).run();
    db.prepare("UPDATE social_workers SET ultimo_heartbeat_en = '2000-01-01 00:00:00'").run();
    db.prepare(
      "INSERT INTO social_workers (codigo, nombre, estado, ultimo_heartbeat_en) VALUES ('test-worker', 'Prueba', 'online', ?) "
    ).run(sqlFecha(new Date(now - 15_000)));
    assert.deepStrictEqual(
      {
        estado: social.estadoViasSocial({ now }).perfilGrupos.estado,
        accion: social.estadoViasSocial({ now }).perfilGrupos.accion,
      },
      { estado: 'comprobando', accion: 'probar_worker' },
      'Un heartbeat vivo se reconoce aunque falte el marcador histórico'
    );
    const healthId = social.createWorkerCommand('health_check');
    assert.strictEqual(
      Number(
        db
          .prepare(
            "SELECT valor FROM configuracion WHERE clave = 'social_worker_linked_after_command_id'"
          )
          .get().valor
      ),
      healthId - 1,
      'La primera comprobación deja afuera los controles históricos'
    );
    db.prepare(
      'UPDATE social_worker_commands SET estado = \'done\', resultado = \'{"facebook_session":"ACTIVE"}\', finalizado_en = ? WHERE id = ?'
    ).run(sqlFecha(new Date(now - 60_000)), healthId);
    db.prepare(
      "UPDATE social_workers SET ultimo_heartbeat_en = ? WHERE codigo = 'test-worker'"
    ).run(sqlFecha(new Date(now - 121_000)));
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

  db.exec('SAVEPOINT social_operativo_campanas');
  try {
    const draft = social.createCampaign({
      nombre: 'Borrador sin cuenta',
      texto: 'Contenido guardado',
    });
    assert.strictEqual(draft.estado, 'draft');
    assert.deepStrictEqual(draft.targets, []);
    assert.throws(
      () =>
        social.createCampaign({
          nombre: 'Programada vacía',
          texto: 'Contenido',
          programadaPara: new Date(Date.now() + 60_000).toISOString(),
        }),
      /destino/i
    );
    assert.throws(() => social.queueCampaign(draft.id, { now: true }), /destino/i);

    const disconnectedAccountId = Number(
      db
        .prepare(
          'INSERT INTO social_accounts (provider, nombre, identificador_externo, metadata) VALUES (\'facebook\', \'Página sin comprobar\', \'schedule-disconnected-test\', \'{"tipo":"page","token":"x","pageId":"page-x"}\')'
        )
        .run().lastInsertRowid
    );
    const disconnectedDestinationId = Number(
      db
        .prepare(
          "INSERT INTO social_destinations (cuenta_id, provider, tipo, nombre, identificador_externo, habilitada, execution_class) VALUES (?, 'facebook', 'facebook_page', 'Página sin comprobar', 'page-x', 1, 'api')"
        )
        .run(disconnectedAccountId).lastInsertRowid
    );
    assert.throws(
      () =>
        social.createCampaign({
          nombre: 'Programada sin conexión',
          texto: 'Contenido',
          destinoIds: [disconnectedDestinationId],
          programadaPara: new Date(Date.now() + 60_000).toISOString(),
        }),
      /comprob|conect|credencial/i
    );

    const accountId = db
      .prepare("SELECT id FROM social_accounts WHERE identificador_externo = 'fb_perfil'")
      .get().id;
    const destinationId = Number(
      db
        .prepare(
          "INSERT INTO social_destinations (cuenta_id, provider, tipo, nombre, identificador_externo, habilitada, execution_class) VALUES (?, 'facebook', 'facebook_group', 'Grupo temporal', 'queue-disabled-test', 1, 'browser')"
        )
        .run(accountId).lastInsertRowid
    );
    const campaign = social.createCampaign({
      nombre: 'Destino retirado',
      texto: 'Contenido',
      destinoIds: [destinationId],
    });
    db.prepare('UPDATE social_destinations SET habilitada = 0 WHERE id = ?').run(destinationId);
    assert.throws(
      () => social.queueCampaign(campaign.id, { now: true }),
      /habilitado|disponible|destino/i
    );
    assert.strictEqual(social.getCampaign(campaign.id).targets[0].estado, 'draft');

    db.prepare('UPDATE social_destinations SET habilitada = 1 WHERE id = ?').run(destinationId);
    const mixed = social.createCampaign({
      nombre: 'Selección mixta',
      texto: 'Contenido',
      destinoIds: [destinationId, disconnectedDestinationId],
    });
    assert.throws(
      () => social.queueCampaign(mixed.id, { now: true }),
      /comprob|conect|credencial/i
    );
    assert.deepStrictEqual(
      social.getCampaign(mixed.id).targets.map((target) => target.estado),
      ['draft', 'draft'],
      'Una vía caída no deja la otra encolada a medias'
    );

    db.prepare(
      "UPDATE social_post_targets SET estado = 'cancelled' WHERE estado IN ('queued','scheduled','processing')"
    ).run();
    const pending = social.createCampaign({
      nombre: 'Conexión perdida',
      texto: 'Contenido',
      destinoIds: [destinationId],
    });
    social.queueCampaign(pending.id, { now: true });
    db.prepare("UPDATE social_workers SET ultimo_heartbeat_en = '2000-01-01 00:00:00'").run();
    assert.strictEqual(social.claimWork(), null);
    const pendingTarget = social.getCampaign(pending.id).targets[0];
    assert.strictEqual(pendingTarget.estado, 'queued');
    assert.match(pendingTarget.ultimo_error, /extensión|servidor|vincul/i);
  } finally {
    db.exec('ROLLBACK TO social_operativo_campanas; RELEASE social_operativo_campanas');
  }

  db.exec('SAVEPOINT social_operativo_sin_relleno');
  try {
    const destinosActivosAntes = social.getMetrics(30).resumen.destinosActivos;
    const accountId = Number(
      db
        .prepare(
          "INSERT INTO social_accounts (provider, nombre, identificador_externo, metadata) VALUES ('facebook', 'Cuenta de prueba visible', 'test-social-relleno', '{}')"
        )
        .run().lastInsertRowid
    );
    db.prepare(
      "INSERT INTO social_destinations (cuenta_id, provider, tipo, nombre, identificador_externo) VALUES (?, 'facebook', 'facebook_page', 'Destino de ensayo visible', 'demo-visible')"
    ).run(accountId);
    assert.ok(
      !social.listIdentities().some((item) => item.id === accountId),
      'Las identidades técnicas no aparecen en el panel'
    );
    assert.ok(
      !social.listDestinations().some((item) => item.cuenta_id === accountId),
      'Los destinos técnicos no aparecen en el panel'
    );
    assert.strictEqual(
      social.getMetrics(30).resumen.destinosActivos,
      destinosActivosAntes,
      'Los destinos técnicos tampoco inflan las métricas'
    );
  } finally {
    db.exec('ROLLBACK TO social_operativo_sin_relleno; RELEASE social_operativo_sin_relleno');
  }

  db.exec('SAVEPOINT social_operativo_metricas');
  try {
    db.prepare('DELETE FROM social_post_targets').run();
    db.prepare('DELETE FROM social_campaigns').run();
    const empty = social.getMetrics(30);
    assert.strictEqual(empty.resumen.tasaExito, null);
    assert.strictEqual(empty.alcance.disponible, false);
    assert.deepStrictEqual(empty.porHora, []);
    assert.strictEqual(social.dashboard().resumen.yaPublicoAlgunaVez, false);

    const accountId = db
      .prepare("SELECT id FROM social_accounts WHERE identificador_externo = 'fb_perfil'")
      .get().id;
    const destinationId = Number(
      db
        .prepare(
          "INSERT INTO social_destinations (cuenta_id, provider, tipo, nombre, identificador_externo, habilitada) VALUES (?, 'facebook', 'facebook_group', 'Grupo métricas', 'metrics-test', 1)"
        )
        .run(accountId).lastInsertRowid
    );
    const secondDestinationId = Number(
      db
        .prepare(
          "INSERT INTO social_destinations (cuenta_id, provider, tipo, nombre, identificador_externo, habilitada) VALUES (?, 'facebook', 'facebook_group', 'Grupo métricas 2', 'metrics-test-2', 1)"
        )
        .run(accountId).lastInsertRowid
    );
    const campaignId = Number(
      db
        .prepare(
          "INSERT INTO social_campaigns (nombre, texto, estado) VALUES ('Métricas reales', 'Contenido', 'failed')"
        )
        .run().lastInsertRowid
    );
    db.prepare(
      'INSERT INTO social_post_targets (campana_id, destino_id, estado) VALUES (?, ?, ?)'
    ).run(campaignId, destinationId, 'published');
    db.prepare(
      'INSERT INTO social_post_targets (campana_id, destino_id, estado) VALUES (?, ?, ?)'
    ).run(campaignId, secondDestinationId, 'failed');
    assert.strictEqual(social.getMetrics(30).resumen.tasaExito, 50);

    const targetId = db
      .prepare('SELECT id FROM social_post_targets WHERE campana_id = ? AND destino_id = ?')
      .get(campaignId, destinationId).id;
    db.prepare(
      `INSERT INTO social_publication_logs
        (campana_id, target_id, destino_id, codigo, mensaje, detalle)
       VALUES (?, ?, ?, 'METRICAS_META', 'Métricas actualizadas', ?)`
    ).run(
      campaignId,
      targetId,
      destinationId,
      JSON.stringify({ disponible: true, personasQueLoVieron: 123, clics: 4 })
    );
    const conAlcance = social.getMetrics(30).alcance;
    assert.strictEqual(conAlcance.disponible, true);
    assert.strictEqual(conAlcance.personasQueLoVieron, 123);
    assert.strictEqual(conAlcance.clics, 4);

    const cuentaPaginaId = Number(
      db
        .prepare(
          "INSERT INTO social_accounts (provider, nombre, identificador_externo, metadata) VALUES ('facebook', 'Página métricas', 'pagina-metricas', ?)"
        )
        .run(JSON.stringify({ token: 'token-de-prueba' })).lastInsertRowid
    );
    const destinoPaginaId = Number(
      db
        .prepare(
          `INSERT INTO social_destinations
            (cuenta_id, provider, tipo, nombre, identificador_externo, execution_class)
           VALUES (?, 'facebook', 'facebook_page', 'Página métricas', 'pagina-metricas', 'api')`
        )
        .run(cuentaPaginaId).lastInsertRowid
    );
    const targetPaginaId = Number(
      db
        .prepare(
          'INSERT INTO social_post_targets (campana_id, destino_id, estado) VALUES (?, ?, ?)'
        )
        .run(campaignId, destinoPaginaId, 'published').lastInsertRowid
    );
    db.prepare(
      `INSERT INTO social_publication_logs
        (campana_id, target_id, destino_id, codigo, mensaje, detalle)
       VALUES (?, ?, ?, 'facebook_page_api', 'Destino published', ?)`
    ).run(
      campaignId,
      targetPaginaId,
      destinoPaginaId,
      JSON.stringify({ referencia: 'post-de-prueba' })
    );
    const actualizado = await social.actualizarAlcanceMeta({
      consultar: async ({ postId, token }) => {
        assert.strictEqual(postId, 'post-de-prueba');
        assert.strictEqual(token, 'token-de-prueba');
        return { disponible: true, personasQueLoVieron: 200, clics: 8 };
      },
    });
    assert.deepStrictEqual(actualizado, { consultadas: 1, disponibles: 1, sinReferencia: 0 });
    assert.strictEqual(social.getMetrics(30).alcance.personasQueLoVieron, 323);
    assert.strictEqual(social.getMetrics(30).alcance.clics, 12);

    db.prepare(
      "UPDATE social_campaigns SET creado_en = datetime('now', '-40 days') WHERE id = ?"
    ).run(campaignId);
    db.prepare(
      "UPDATE social_post_targets SET creado_en = datetime('now', '-40 days') WHERE campana_id = ?"
    ).run(campaignId);
    assert.strictEqual(social.getMetrics(30).resumen.tasaExito, null);
    assert.strictEqual(social.dashboard().resumen.yaPublicoAlgunaVez, true);
  } finally {
    db.exec('ROLLBACK TO social_operativo_metricas; RELEASE social_operativo_metricas');
  }
}

module.exports = { run };
