/**
 * El freno de mano y los cupos, contra la base de verdad.
 *
 * Los tests de `politicaEnvioSocial.test.js` prueban las reglas en aislamiento:
 * le pasan un estado inventado y miran la decisión. Estos prueban lo otro —que
 * el estado que se arma **leyendo la base** sea el que las reglas esperan—, que
 * es donde se rompen estas cosas: la regla está bien pero la consulta cuenta
 * mal, o cuenta el día equivocado, o mira la identidad equivocada.
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

/** Una identidad, un grupo y una campaña encolada, todo nuevo. */
function armarEscenario() {
  const marca = unico();

  const cuenta = db
    .prepare(
      `INSERT INTO social_accounts (provider, clave, nombre, habilitada, metadata)
       VALUES ('facebook', ?, ?, 1, '{"tipo":"perfil"}')`
    )
    .run(`test_${marca}`, `Identidad ${marca}`);
  const cuentaId = Number(cuenta.lastInsertRowid);

  const destino = db
    .prepare(
      `INSERT INTO social_destinations (provider, cuenta_id, tipo, identificador_externo, nombre, habilitada)
       VALUES ('facebook', ?, 'facebook_group', ?, ?, 1)`
    )
    .run(cuentaId, `grupo_${marca}`, `Grupo ${marca}`);
  const destinoId = Number(destino.lastInsertRowid);

  const campana = db
    .prepare("INSERT INTO social_campaigns (nombre, texto, estado) VALUES (?, 'hola', 'queued')")
    .run(`Campaña ${marca}`);
  const campanaId = Number(campana.lastInsertRowid);

  const target = db
    .prepare(
      "INSERT INTO social_post_targets (campana_id, destino_id, estado) VALUES (?, ?, 'queued')"
    )
    .run(campanaId, destinoId);

  return { cuentaId, destinoId, campanaId, targetId: Number(target.lastInsertRowid) };
}

/**
 * Deja la cola limpia para que un escenario no arrastre al siguiente.
 *
 * Los comandos también: `claimWork` los devuelve antes que las publicaciones,
 * así que un comando olvidado de un test anterior haría que el siguiente
 * recibiera un comando donde esperaba un destino.
 */
function vaciarCola() {
  db.prepare(
    "UPDATE social_post_targets SET estado = 'cancelled' WHERE estado IN ('queued','scheduled','processing')"
  ).run();
  db.prepare(
    "UPDATE social_worker_commands SET estado = 'cancelled' WHERE estado IN ('pending','processing')"
  ).run();
  db.prepare("UPDATE configuracion SET valor = '0' WHERE clave = 'social_pausa_global'").run();
}

/** Simula que ya se publicó en ese destino, hace tantos minutos. */
function yaSePublico(destinoId, campanaId, haceMinutos) {
  const cuando = new Date(Date.now() - haceMinutos * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  db.prepare(
    `INSERT INTO social_post_targets (campana_id, destino_id, estado, finalizado_en)
     VALUES (?, ?, 'published', ?)`
  ).run(campanaId, destinoId, cuando);
}

module.exports = {
  'con todo en orden, el worker recibe trabajo': () => {
    vaciarCola();
    const { targetId } = armarEscenario();
    const trabajo = social.claimWork();

    assert.ok(trabajo, 'tendría que haber trabajo');
    assert.strictEqual(trabajo.kind, 'publication');
    assert.strictEqual(trabajo.item.id, targetId);
  },

  'con todo pausado no sale nada': () => {
    vaciarCola();
    armarEscenario();
    social.pausarTodo('probando');

    assert.strictEqual(social.claimWork(), null);

    social.reanudarTodo();
    assert.ok(social.claimWork(), 'al reanudar tiene que volver a salir');
  },

  'pausar no cancela lo que estaba en cola': () => {
    /*
      Es la diferencia entre pausar y cancelar. Si pausar borrara la cola, no
      serviría para nada: habría que rearmar la campaña a mano después de cada
      susto.
    */
    vaciarCola();
    const { targetId } = armarEscenario();
    social.pausarTodo('probando');
    social.claimWork();

    const estado = db
      .prepare('SELECT estado FROM social_post_targets WHERE id = ?')
      .get(targetId).estado;
    assert.strictEqual(estado, 'queued', 'sigue esperando, no se canceló');

    social.reanudarTodo();
  },

  'una identidad pausada no frena a las demás': () => {
    /*
      Que la Fan Page tenga un problema no es motivo para frenar al Perfil. Es
      la razón de que la pausa exista en dos niveles y no en uno solo.
    */
    vaciarCola();
    const frenada = armarEscenario();
    const libre = armarEscenario();

    social.pausarIdentidad(frenada.cuentaId, 'probando');

    const trabajo = social.claimWork();
    assert.ok(trabajo, 'la otra identidad tiene que poder seguir');
    assert.strictEqual(trabajo.item.id, libre.targetId);
  },

  'reanudar una identidad le borra los fallos': () => {
    /*
      Si no, reanudar no reanuda: el contador seguiría en el tope y la política
      la volvería a frenar en el primer intento.
    */
    vaciarCola();
    const { cuentaId } = armarEscenario();
    db.prepare('UPDATE social_accounts SET fallos_seguidos = 9 WHERE id = ?').run(cuentaId);
    social.pausarIdentidad(cuentaId, 'se rompió');
    social.reanudarIdentidad(cuentaId);

    const fila = db
      .prepare('SELECT pausada, fallos_seguidos FROM social_accounts WHERE id = ?')
      .get(cuentaId);
    assert.strictEqual(Number(fila.pausada), 0);
    assert.strictEqual(Number(fila.fallos_seguidos), 0);
  },

  'después de varios fallos seguidos se frena sola': () => {
    vaciarCola();
    const { cuentaId } = armarEscenario();
    const { intervaloSegundos } = social.getSocialConfig();
    assert.ok(intervaloSegundos > 0);

    db.prepare('UPDATE social_accounts SET fallos_seguidos = 5 WHERE id = ?').run(cuentaId);
    assert.strictEqual(social.claimWork(), null);
  },

  'un grupo donde se publicó hace un rato queda en descanso': () => {
    vaciarCola();
    const { destinoId, campanaId } = armarEscenario();
    yaSePublico(destinoId, campanaId, 60); // hace una hora

    assert.strictEqual(social.claimWork(), null, 'el descanso es de 24 horas');
  },

  'el descanso de un grupo no frena a los otros grupos': () => {
    /*
      Este es el que importa de todos.

      Si se mirara un solo candidato, el primero de la fila —en descanso— haría
      que la cola entera se quedara esperando con él. Con treinta grupos
      elegidos y uno en descanso, no se publicaría en ninguno.
    */
    vaciarCola();
    const enDescanso = armarEscenario();
    const disponible = armarEscenario();
    yaSePublico(enDescanso.destinoId, enDescanso.campanaId, 60);

    const trabajo = social.claimWork();
    assert.ok(trabajo, 'el segundo grupo tiene que poder salir');
    assert.strictEqual(trabajo.item.id, disponible.targetId);
  },

  'los comandos salen aunque la cola de publicación esté frenada': () => {
    /*
      El health check y la sincronización no publican nada: no gastan cupo, no
      los ve nadie desde afuera y no pueden hacer que te bloqueen.

      Antes el freno estaba **antes** de buscar comandos, así que justo cuando
      la cola estaba esperando —el momento en que más falta hace ver qué está
      pasando— no se podía correr un diagnóstico.
    */
    vaciarCola();
    const { destinoId, campanaId } = armarEscenario();

    /*
      Recién publicado: dentro del intervalo mínimo, que es lo que frenaba a los
      comandos. Publicar hace cinco minutos no sirve para este test —el
      intervalo por omisión es de noventa segundos y ya habría pasado—, y lo
      comprobé reponiendo el freno viejo: el test seguía en verde.
    */
    yaSePublico(destinoId, campanaId, 1);

    social.createWorkerCommand('health_check', {});

    const trabajo = social.claimWork();
    assert.ok(trabajo, 'el comando tiene que salir igual');
    assert.strictEqual(trabajo.kind, 'command');
    assert.strictEqual(trabajo.item.tipo, 'health_check');
  },

  'el cupo diario se cuenta por identidad': () => {
    vaciarCola();
    const { cuentaId, campanaId, destinoId } = armarEscenario();
    social.setSocialConfig({ cupoDiario: 2 });

    /* Dos publicaciones de hoy, en otros destinos de la misma identidad. */
    for (let i = 0; i < 2; i += 1) {
      const otro = db
        .prepare(
          `INSERT INTO social_destinations (provider, cuenta_id, tipo, identificador_externo, nombre, habilitada)
           VALUES ('facebook', ?, 'facebook_group', ?, 'otro', 1)`
        )
        .run(cuentaId, `otro_${unico()}`);
      yaSePublico(Number(otro.lastInsertRowid), campanaId, 5);
    }

    assert.ok(destinoId);
    assert.strictEqual(social.claimWork(), null, 'ya gastó el cupo del día');

    social.setSocialConfig({ cupoDiario: 25 });
  },

  'el cupo de una identidad no consume el de la otra': () => {
    vaciarCola();
    social.setSocialConfig({ cupoDiario: 1 });

    const gastada = armarEscenario();
    const fresca = armarEscenario();

    const otro = db
      .prepare(
        `INSERT INTO social_destinations (provider, cuenta_id, tipo, identificador_externo, nombre, habilitada)
         VALUES ('facebook', ?, 'facebook_group', ?, 'otro', 1)`
      )
      .run(gastada.cuentaId, `otro_${unico()}`);
    yaSePublico(Number(otro.lastInsertRowid), gastada.campanaId, 5);

    const trabajo = social.claimWork();
    assert.ok(trabajo, 'la identidad fresca todavía tiene cupo');
    assert.strictEqual(trabajo.item.id, fresca.targetId);

    social.setSocialConfig({ cupoDiario: 25 });
  },

  'lo que no entra en el cupo queda para mañana, no falla': () => {
    /*
      El caso real: elegir 35 grupos con un cupo de 25. Los 10 que sobran no
      son un error. Marcarlos como fallidos sería mentir y obligaría a rearmar
      la campaña a mano.
    */
    vaciarCola();
    social.setSocialConfig({ cupoDiario: 3 });
    const { cuentaId, campanaId, targetId } = armarEscenario();
    /* `queueCampaign` sólo reparte lo que todavía no está encolado. */
    db.prepare("UPDATE social_post_targets SET estado = 'draft' WHERE id = ?").run(targetId);

    /* Cuatro destinos más para la misma identidad: cinco en total. */
    for (let i = 0; i < 4; i += 1) {
      const otro = db
        .prepare(
          `INSERT INTO social_destinations (provider, cuenta_id, tipo, identificador_externo, nombre, habilitada)
           VALUES ('facebook', ?, 'facebook_group', ?, 'otro', 1)`
        )
        .run(cuentaId, `mas_${unico()}`);
      db.prepare(
        "INSERT INTO social_post_targets (campana_id, destino_id, estado) VALUES (?, ?, 'draft')"
      ).run(campanaId, Number(otro.lastInsertRowid));
    }

    const resultado = social.queueCampaign(campanaId, { now: true });

    assert.strictEqual(resultado.reparto.total, 5);
    assert.strictEqual(resultado.reparto.hoy, 3, 'entran tres hoy');
    assert.strictEqual(resultado.reparto.despues, 2, 'los otros dos quedan para mañana');

    const fallidos = db
      .prepare(
        "SELECT COUNT(*) AS n FROM social_post_targets WHERE campana_id = ? AND estado = 'failed'"
      )
      .get(campanaId).n;
    assert.strictEqual(Number(fallidos), 0, 'ninguno falló');

    const conFecha = db
      .prepare(
        `SELECT COUNT(*) AS n FROM social_post_targets
          WHERE campana_id = ? AND programada_para > datetime('now', '+1 hour')`
      )
      .get(campanaId).n;
    assert.strictEqual(Number(conFecha), 2, 'los dos de mañana tienen fecha futura');

    social.setSocialConfig({ cupoDiario: 25 });
  },

  'el cupo de una identidad no le come el reparto a la otra': () => {
    vaciarCola();
    social.setSocialConfig({ cupoDiario: 2 });
    const uno = armarEscenario();
    const otro = armarEscenario();

    /* Un segundo destino para cada identidad, en la misma campaña. */
    for (const escenario of [uno, otro]) {
      const extra = db
        .prepare(
          `INSERT INTO social_destinations (provider, cuenta_id, tipo, identificador_externo, nombre, habilitada)
           VALUES ('facebook', ?, 'facebook_group', ?, 'extra', 1)`
        )
        .run(escenario.cuentaId, `extra_${unico()}`);
      db.prepare(
        "INSERT INTO social_post_targets (campana_id, destino_id, estado) VALUES (?, ?, 'draft')"
      ).run(uno.campanaId, Number(extra.lastInsertRowid));
    }
    /*
      Los dos targets originales entran a la misma campaña y vuelven a
      borrador: `queueCampaign` sólo reparte lo que todavía no está encolado.
    */
    db.prepare(
      "UPDATE social_post_targets SET campana_id = ?, estado = 'draft' WHERE id IN (?, ?)"
    ).run(uno.campanaId, uno.targetId, otro.targetId);

    const resultado = social.queueCampaign(uno.campanaId, { now: true });

    assert.strictEqual(resultado.reparto.total, 4);
    assert.strictEqual(
      resultado.reparto.hoy,
      4,
      'dos por identidad: con el cupo en dos, entran los cuatro hoy'
    );

    social.setSocialConfig({ cupoDiario: 25 });
  },

  'una campaña encolada sale de verdad, no queda esperando para siempre': () => {
    /*
      ── El bug que esto cuida ────────────────────────────────────────────────

      SQLite no tiene tipo fecha: guarda texto y compara texto.
      `CURRENT_TIMESTAMP` escribe `2026-08-21 14:19:13`, con un espacio;
      `toISOString()` escribe `2026-08-21T13:19:13.931Z`, con una T. Y la T es
      mayor que el espacio comparando texto.

      Así que `programada_para <= CURRENT_TIMESTAMP` **nunca daba verdadero**
      para una fecha guardada en ISO, aunque fuera de hace una hora.
      `queueCampaign` guardaba ISO. Resultado: las campañas quedaban en cola
      para siempre, el worker pedía trabajo y no recibía nada, y no había nada
      en los logs que lo explicara.

      Este test pasa por el camino real —encolar y después pedir trabajo— en
      vez de insertar el destino a mano, que es lo que hacía que el resto de
      los tests no lo vieran.
    */
    vaciarCola();
    const { campanaId, targetId } = armarEscenario();
    db.prepare("UPDATE social_post_targets SET estado = 'draft' WHERE id = ?").run(targetId);

    social.queueCampaign(campanaId, { now: true });

    const trabajo = social.claimWork();
    assert.ok(trabajo, 'una campaña recién encolada tiene que salir ya');
    assert.strictEqual(trabajo.item.id, targetId);
  },

  'las perillas se guardan y se leen acotadas': () => {
    social.setSocialConfig({ intervaloSegundos: 120, jitter: 0.25, cupoDiario: 40 });
    let config = social.getSocialConfig();
    assert.strictEqual(config.intervaloSegundos, 120);
    assert.strictEqual(config.jitter, 0.25);
    assert.strictEqual(config.cupoDiario, 40);

    /* Un valor absurdo se recorta, no se guarda tal cual. */
    social.setSocialConfig({ cupoDiario: 99999, jitter: 5 });
    config = social.getSocialConfig();
    assert.strictEqual(config.cupoDiario, 200);
    assert.strictEqual(config.jitter, 0.9);

    social.setSocialConfig({ intervaloSegundos: 90, jitter: 0.4, cupoDiario: 25 });
  },
};
