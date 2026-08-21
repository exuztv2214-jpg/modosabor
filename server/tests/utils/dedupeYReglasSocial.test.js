/**
 * No repetir, y respetar las reglas de cada grupo.
 *
 * ── Por qué esto importa más que casi todo lo demás ────────────────────────
 *
 * Los grupos de Facebook no son nuestros. Cada uno tiene un administrador que
 * puso reglas, y romperlas no da un error: da una expulsión, que no se
 * deshace. Publicar dos veces lo mismo en la misma semana es la forma más
 * rápida de conseguirlo.
 *
 * El sistema no puede leer esas reglas —están escritas en prosa, en la
 * descripción del grupo—, así que se cargan a mano. Lo que sí puede es
 * respetarlas sin fallar nunca, que es lo que prueban estos tests.
 */
/*
  Los destinos de prueba usan `facebook_group`, que es **el tipo real** con el
  que se guardan los grupos.

  Antes usaban `'grupo'`, un tipo que no existe en el sistema. Con eso,
  `esGrupo` daba false y el descanso de 24 horas por grupo no se probaba nunca
  —ni en los tests ni en producción, donde llevaba meses sin funcionar—.
  Un fixture que no se parece al dato real no prueba nada: sólo da
  tranquilidad, que es peor que no tener test.
*/
const assert = require('assert');
const db = require('../../db');
const social = require('../../services/socialService');

let n = 0;
const unico = () => `${Date.now()}-${++n}`;

function armarIdentidad() {
  const marca = unico();
  const cuenta = db
    .prepare(
      `INSERT INTO social_accounts (provider, clave, nombre, habilitada, metadata)
       VALUES ('facebook', ?, ?, 1, '{"tipo":"perfil"}')`
    )
    .run(`ded_${marca}`, `Identidad ${marca}`);
  return Number(cuenta.lastInsertRowid);
}

function armarGrupo(cuentaId, reglas = {}) {
  const grupo = db
    .prepare(
      `INSERT INTO social_destinations
         (provider, cuenta_id, tipo, identificador_externo, nombre, habilitada,
          permite_comercial, bloqueado_manualmente, frecuencia_maxima_horas)
       VALUES ('facebook', ?, 'facebook_group', ?, ?, 1, ?, ?, ?)`
    )
    .run(
      cuentaId,
      `g_${unico()}`,
      reglas.nombre || 'Grupo de prueba',
      reglas.permiteComercial === false ? 0 : 1,
      reglas.bloqueado ? 1 : 0,
      reglas.frecuenciaHoras ?? null
    );
  return Number(grupo.lastInsertRowid);
}

function armarCampana(texto, destinos, personalizaciones = {}) {
  const campana = db
    .prepare(
      `INSERT INTO social_campaigns (nombre, texto, personalizaciones, estado)
       VALUES (?, ?, ?, 'draft')`
    )
    .run(`Campaña ${unico()}`, texto, JSON.stringify(personalizaciones));
  const campanaId = Number(campana.lastInsertRowid);

  const ids = destinos.map((destinoId) =>
    Number(
      db
        .prepare(
          "INSERT INTO social_post_targets (campana_id, destino_id, estado) VALUES (?, ?, 'draft')"
        )
        .run(campanaId, destinoId).lastInsertRowid
    )
  );
  return { campanaId, targetIds: ids };
}

/**
 * Deja la cola limpia.
 *
 * Hace falta para los tests que llaman a `claimWork()`: sin esto se llevarían
 * un destino encolado por un test anterior y estarían midiendo otra cosa. Me
 * pasó justamente con el del tope de frecuencia.
 */
function vaciarCola() {
  db.prepare(
    "UPDATE social_post_targets SET estado = 'cancelled' WHERE estado IN ('queued','scheduled','processing')"
  ).run();
  db.prepare(
    "UPDATE social_worker_commands SET estado = 'cancelled' WHERE estado IN ('pending','processing')"
  ).run();
}

const estadoDe = (targetId) =>
  db.prepare('SELECT estado, ultimo_error FROM social_post_targets WHERE id = ?').get(targetId);

module.exports = {
  // ── Reglas del grupo ────────────────────────────────────────────────────
  'un grupo bloqueado a mano no recibe nada': () => {
    const cuenta = armarIdentidad();
    const bloqueado = armarGrupo(cuenta, { bloqueado: true });
    const { campanaId, targetIds } = armarCampana('Hola vecinos', [bloqueado]);

    const r = social.queueCampaign(campanaId, { now: true });

    assert.strictEqual(estadoDe(targetIds[0]).estado, 'skipped_rule');
    assert.strictEqual(r.reparto.porRegla, 1);
    assert.strictEqual(r.reparto.hoy, 0);
  },

  'un grupo que no permite comercio no recibe una publi comercial': () => {
    const cuenta = armarIdentidad();
    const sinComercio = armarGrupo(cuenta, { permiteComercial: false });
    const { campanaId, targetIds } = armarCampana('Milanesas a $8000', [sinComercio]);

    social.queueCampaign(campanaId, { now: true });
    assert.strictEqual(estadoDe(targetIds[0]).estado, 'skipped_rule');
  },

  'ese mismo grupo sí recibe algo que no es comercial': () => {
    /*
      Un aviso de que el local no abre por el feriado no es publicidad. La
      regla del grupo es contra el comercio, no contra que exista.
    */
    const cuenta = armarIdentidad();
    const sinComercio = armarGrupo(cuenta, { permiteComercial: false });
    const { campanaId, targetIds } = armarCampana('Mañana no abrimos', [sinComercio], {
      comercial: false,
    });

    social.queueCampaign(campanaId, { now: true });
    assert.strictEqual(estadoDe(targetIds[0]).estado, 'queued');
  },

  'sin decir nada, una campaña se considera comercial': () => {
    /*
      El criterio prudente. Equivocarse hacia "no publiqué donde podía" cuesta
      una publicación; equivocarse al revés cuesta el grupo.
    */
    const cuenta = armarIdentidad();
    const sinComercio = armarGrupo(cuenta, { permiteComercial: false });
    const { campanaId, targetIds } = armarCampana('Cualquier cosa', [sinComercio]);

    social.queueCampaign(campanaId, { now: true });
    assert.strictEqual(estadoDe(targetIds[0]).estado, 'skipped_rule');
  },

  'los apartados no ocupan cupo del día': () => {
    /*
      Si un grupo bloqueado se llevara uno de los 25 lugares del día,
      desplazaría a otro que sí se podía publicar. Se apartan antes de repartir.
    */
    const cuenta = armarIdentidad();
    social.setSocialConfig({ cupoDiario: 2 });

    const bloqueado = armarGrupo(cuenta, { bloqueado: true });
    const buenos = [armarGrupo(cuenta), armarGrupo(cuenta)];
    const { campanaId } = armarCampana('Texto único ' + unico(), [bloqueado, ...buenos]);

    const r = social.queueCampaign(campanaId, { now: true });

    assert.strictEqual(r.reparto.hoy, 2, 'los dos buenos entran hoy');
    assert.strictEqual(r.reparto.despues, 0, 'ninguno quedó desplazado');
    assert.strictEqual(r.reparto.porRegla, 1);

    social.setSocialConfig({ cupoDiario: 25 });
  },

  // ── No repetir ──────────────────────────────────────────────────────────
  'la misma publicación no se manda dos veces al mismo grupo': () => {
    const cuenta = armarIdentidad();
    const grupo = armarGrupo(cuenta);
    const texto = 'Hoy tenemos guiso de lentejas ' + unico();

    /* La primera sale y se publica. */
    const primera = armarCampana(texto, [grupo]);
    social.queueCampaign(primera.campanaId, { now: true });
    db.prepare(
      "UPDATE social_post_targets SET estado = 'published', finalizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(primera.targetIds[0]);

    /* La segunda, con el mismo texto, se saltea. */
    const segunda = armarCampana(texto, [grupo]);
    const r = social.queueCampaign(segunda.campanaId, { now: true });

    assert.strictEqual(estadoDe(segunda.targetIds[0]).estado, 'skipped_duplicate');
    assert.strictEqual(r.reparto.repetidos, 1);
  },

  'cambiar mayúsculas o espacios no la convierte en otra publicación': () => {
    /*
      Al que lee el grupo no le cambia nada que hayas corregido una mayúscula.
      Para él es el mismo mensaje otra vez.
    */
    const cuenta = armarIdentidad();
    const grupo = armarGrupo(cuenta);
    const marca = unico();

    const primera = armarCampana(`Milanesas con papas ${marca}`, [grupo]);
    social.queueCampaign(primera.campanaId, { now: true });
    db.prepare(
      "UPDATE social_post_targets SET estado = 'published', finalizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(primera.targetIds[0]);

    const segunda = armarCampana(`  MILANESAS   con papas ${marca}  `, [grupo]);
    social.queueCampaign(segunda.campanaId, { now: true });

    assert.strictEqual(estadoDe(segunda.targetIds[0]).estado, 'skipped_duplicate');
  },

  'un texto distinto sí se publica': () => {
    const cuenta = armarIdentidad();
    const grupo = armarGrupo(cuenta);

    const primera = armarCampana('Guiso de lentejas ' + unico(), [grupo]);
    social.queueCampaign(primera.campanaId, { now: true });
    db.prepare(
      "UPDATE social_post_targets SET estado = 'published', finalizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(primera.targetIds[0]);

    const segunda = armarCampana('Locro para el 25 ' + unico(), [grupo]);
    social.queueCampaign(segunda.campanaId, { now: true });

    assert.strictEqual(estadoDe(segunda.targetIds[0]).estado, 'queued');
  },

  'la repetición es por grupo, no por texto': () => {
    /*
      El mismo texto en OTRO grupo no es una repetición: cada grupo tiene su
      propia gente, y la mayoría no está en los dos.
    */
    const cuenta = armarIdentidad();
    const grupoA = armarGrupo(cuenta);
    const grupoB = armarGrupo(cuenta);
    const texto = 'Pizza los viernes ' + unico();

    const primera = armarCampana(texto, [grupoA]);
    social.queueCampaign(primera.campanaId, { now: true });
    db.prepare(
      "UPDATE social_post_targets SET estado = 'published', finalizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(primera.targetIds[0]);

    const segunda = armarCampana(texto, [grupoB]);
    social.queueCampaign(segunda.campanaId, { now: true });

    assert.strictEqual(estadoDe(segunda.targetIds[0]).estado, 'queued');
  },

  'pasada la ventana se puede volver a publicar lo mismo': () => {
    const cuenta = armarIdentidad();
    const grupo = armarGrupo(cuenta);
    const texto = 'Empanadas de carne ' + unico();

    const primera = armarCampana(texto, [grupo]);
    social.queueCampaign(primera.campanaId, { now: true });
    db.prepare(
      `UPDATE social_post_targets SET estado = 'published', finalizado_en = datetime('now', '-10 days') WHERE id = ?`
    ).run(primera.targetIds[0]);

    const segunda = armarCampana(texto, [grupo]);
    social.queueCampaign(segunda.campanaId, { now: true });

    assert.strictEqual(estadoDe(segunda.targetIds[0]).estado, 'queued');
  },

  'lo que falló no cuenta como ya publicado': () => {
    /*
      Si el intento anterior falló, la gente del grupo nunca lo vio. Tratarlo
      como repetido dejaría esa publicación sin poder reintentarse nunca.
    */
    const cuenta = armarIdentidad();
    const grupo = armarGrupo(cuenta);
    const texto = 'Promo del mediodía ' + unico();

    const primera = armarCampana(texto, [grupo]);
    social.queueCampaign(primera.campanaId, { now: true });
    db.prepare(
      "UPDATE social_post_targets SET estado = 'failed', finalizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(primera.targetIds[0]);

    const segunda = armarCampana(texto, [grupo]);
    social.queueCampaign(segunda.campanaId, { now: true });

    assert.strictEqual(estadoDe(segunda.targetIds[0]).estado, 'queued');
  },

  'la ventana se puede apagar poniéndola en cero': () => {
    const cuenta = armarIdentidad();
    const grupo = armarGrupo(cuenta);
    const texto = 'Repetible ' + unico();

    const primera = armarCampana(texto, [grupo]);
    social.queueCampaign(primera.campanaId, { now: true });
    db.prepare(
      "UPDATE social_post_targets SET estado = 'published', finalizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(primera.targetIds[0]);

    social.setSocialConfig({ ventanaDedupeDias: 0 });
    const segunda = armarCampana(texto, [grupo]);
    social.queueCampaign(segunda.campanaId, { now: true });

    assert.strictEqual(
      estadoDe(segunda.targetIds[0]).estado,
      'queued',
      'con la ventana en cero no se saltea nada'
    );

    social.setSocialConfig({ ventanaDedupeDias: 7 });
  },

  // ── El resumen no miente ────────────────────────────────────────────────
  'una campaña completa con salteados queda como publicada, no como parcial': () => {
    /*
      ── La trampa de todo este cambio ────────────────────────────────────────

      Si se eligen dos grupos y uno está bloqueado, la campaña que publicó en
      el otro está **completa**. Contar el salteado en el total la dejaría para
      siempre en "parcial" y mostraría un problema donde el sistema hizo
      exactamente lo que tenía que hacer.

      El test pasa por `claimWork` + `reportPublication`, que es el camino real
      del worker. Una versión anterior armaba su propio SQL y por eso no vio
      nada cuando rompí la consulta a propósito.
    */
    vaciarCola();
    const cuenta = armarIdentidad();
    const bueno = armarGrupo(cuenta);
    const bloqueado = armarGrupo(cuenta, { bloqueado: true });
    const { campanaId } = armarCampana('Publicá esto ' + unico(), [bueno, bloqueado]);

    social.queueCampaign(campanaId, { now: true });

    const trabajo = social.claimWork();
    assert.ok(trabajo, 'el grupo bueno tiene que salir');

    const resultado = social.reportPublication({
      targetId: trabajo.item.id,
      lockToken: trabajo.lock,
      estado: 'published',
    });

    assert.strictEqual(
      resultado.campaign,
      'published',
      'publicó en todo lo que había para publicar'
    );
  },

  'una campaña donde todo se salteó no queda marcada como fallida': () => {
    vaciarCola();
    const cuenta = armarIdentidad();
    const bloqueado = armarGrupo(cuenta, { bloqueado: true });
    const bueno = armarGrupo(cuenta);
    const { campanaId } = armarCampana('Casi todo salteado ' + unico(), [bloqueado, bueno]);

    social.queueCampaign(campanaId, { now: true });

    const trabajo = social.claimWork();
    const resultado = social.reportPublication({
      targetId: trabajo.item.id,
      lockToken: trabajo.lock,
      estado: 'published',
    });

    assert.notStrictEqual(resultado.campaign, 'failed', 'no falló nada: se decidió no mandarlo');
    assert.notStrictEqual(resultado.campaign, 'partial', 'tampoco quedó a medias');
  },

  // ── El descanso propio de cada grupo ────────────────────────────────────
  'un grupo con su propio tope de frecuencia lo hace valer': () => {
    /*
      Si el administrador dijo "una vez por semana", el tope general de 24
      horas no alcanza. Manda el del grupo, que es el que te puede echar.
    */
    vaciarCola();
    const cuenta = armarIdentidad();
    const grupo = armarGrupo(cuenta, { frecuenciaHoras: 168 });
    const { campanaId, targetIds } = armarCampana('Algo ' + unico(), [grupo]);
    social.queueCampaign(campanaId, { now: true });

    /* Se publicó hace tres días: pasó el tope general, no el del grupo. */
    db.prepare(
      `INSERT INTO social_post_targets (campana_id, destino_id, estado, finalizado_en)
       VALUES (?, ?, 'published', datetime('now', '-3 days'))`
    ).run(campanaId, grupo);

    assert.ok(targetIds[0]);
    const trabajo = social.claimWork();
    assert.strictEqual(trabajo, null, 'todavía está en descanso según la regla del grupo');
  },

  'editar las reglas de un grupo las guarda': () => {
    const cuenta = armarIdentidad();
    const grupo = armarGrupo(cuenta);

    const guardado = social.updateDestination(grupo, {
      permiteComercial: false,
      bloqueadoManualmente: true,
      frecuenciaMaximaHoras: 72,
      notas: 'El admin pidió sólo los martes',
    });

    assert.strictEqual(guardado.permiteComercial, false);
    assert.strictEqual(guardado.bloqueadoManualmente, true);
    assert.strictEqual(guardado.frecuenciaMaximaHoras, 72);
    assert.strictEqual(guardado.notas, 'El admin pidió sólo los martes');
  },

  'una frecuencia absurda se recorta': () => {
    const cuenta = armarIdentidad();
    const grupo = armarGrupo(cuenta);

    assert.strictEqual(
      social.updateDestination(grupo, { frecuenciaMaximaHoras: 99999 }).frecuenciaMaximaHoras,
      720
    );
    assert.strictEqual(
      social.updateDestination(grupo, { frecuenciaMaximaHoras: 0 }).frecuenciaMaximaHoras,
      null,
      'cero significa "usá el general", no "sin descanso"'
    );
  },
};
