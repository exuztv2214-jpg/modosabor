const assert = require('assert');
const db = require('../../db');
const { runMigrations } = require('../../db/migrations');

function run() {
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
    if (campaignId) db.prepare('DELETE FROM social_campaigns WHERE id = ?').run(campaignId);
    if (destinationId)
      db.prepare('DELETE FROM social_destinations WHERE id = ?').run(destinationId);
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
}

module.exports = { run };
