/**
 * La papelera de campañas.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Cancelar era la única acción del módulo que se sentía definitiva, y por eso
 * era la que daba miedo apretar. Con una papelera, cancelar deja de ser una
 * decisión que hay que pensar dos veces.
 */
const assert = require('assert');
const db = require('../../db');
const social = require('../../services/socialService');

let n = 0;
const unico = () => `${Date.now()}-${++n}`;

function armarCampana() {
  const marca = unico();

  const cuenta = db
    .prepare(
      `INSERT INTO social_accounts (provider, clave, nombre, habilitada, metadata)
       VALUES ('facebook', ?, 'Perfil', 1, '{"tipo":"perfil"}')`
    )
    .run(`pap_${marca}`);

  const destino = db
    .prepare(
      `INSERT INTO social_destinations (provider, cuenta_id, tipo, identificador_externo, nombre, habilitada)
       VALUES ('facebook', ?, 'facebook_group', ?, 'Grupo', 1)`
    )
    .run(Number(cuenta.lastInsertRowid), `g_${marca}`);

  const campana = db
    .prepare("INSERT INTO social_campaigns (nombre, texto, estado) VALUES (?, 'hola', 'queued')")
    .run(`Campaña ${marca}`);
  const campanaId = Number(campana.lastInsertRowid);

  const target = db
    .prepare(
      "INSERT INTO social_post_targets (campana_id, destino_id, estado) VALUES (?, ?, 'queued')"
    )
    .run(campanaId, Number(destino.lastInsertRowid));

  return { campanaId, targetId: Number(target.lastInsertRowid) };
}

const estadoCampana = (id) =>
  db.prepare('SELECT estado FROM social_campaigns WHERE id = ?').get(id).estado;
const estadoTarget = (id) =>
  db.prepare('SELECT estado FROM social_post_targets WHERE id = ?').get(id).estado;

module.exports = {
  'lo cancelado aparece en la papelera': () => {
    const { campanaId } = armarCampana();
    social.cancelCampaign(campanaId);

    const enPapelera = social.listarPapelera().some((c) => c.id === campanaId);
    assert.strictEqual(enPapelera, true);
  },

  'restaurar la devuelve como borrador, no encolada': () => {
    /*
      Recuperar y publicar son dos decisiones distintas. Juntarlas haría que un
      clic de arrepentimiento termine en treinta grupos.
    */
    const { campanaId, targetId } = armarCampana();
    social.cancelCampaign(campanaId);
    social.restaurarCampana(campanaId);

    assert.strictEqual(estadoCampana(campanaId), 'draft');
    assert.strictEqual(estadoTarget(targetId), 'draft');
  },

  'lo que ya se había publicado no se reescribe': () => {
    /*
      Si un destino salió antes de cancelar, eso pasó de verdad. Devolverlo a
      borrador diría que no se publicó, y la próxima vez saldría dos veces en
      el mismo grupo.
    */
    const { campanaId, targetId } = armarCampana();
    db.prepare(
      "UPDATE social_post_targets SET estado = 'published', finalizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(targetId);

    social.cancelCampaign(campanaId);
    social.restaurarCampana(campanaId);

    assert.strictEqual(estadoTarget(targetId), 'published', 'sigue publicado');
  },

  'al restaurar sale de la papelera': () => {
    const { campanaId } = armarCampana();
    social.cancelCampaign(campanaId);
    social.restaurarCampana(campanaId);

    assert.strictEqual(
      social.listarPapelera().some((c) => c.id === campanaId),
      false
    );
  },

  'no se puede restaurar algo que no está cancelado': () => {
    const { campanaId } = armarCampana();
    assert.throws(() => social.restaurarCampana(campanaId), /no está en la papelera/);
  },

  'restaurar algo que no existe no rompe nada': () => {
    assert.throws(() => social.restaurarCampana(999999), /no está en la papelera/);
  },

  'la papelera no ensucia el listado normal': () => {
    /*
      Lo cancelado no es parte del trabajo del día. Mezclarlo obligaría a leer
      y descartar en cada vistazo.
    */
    const { campanaId } = armarCampana();
    social.cancelCampaign(campanaId);

    const enLaLista = social.listCampaigns(200).find((c) => c.id === campanaId);

    assert.ok(enLaLista, 'sigue existiendo');
    assert.strictEqual(enLaLista.estado, 'cancelled', 'y se puede distinguir por su estado');
  },
};
