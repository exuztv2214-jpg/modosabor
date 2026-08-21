/**
 * Los dos motores: el Worker y el servidor.
 *
 * ── Qué se está probando ───────────────────────────────────────────────────
 *
 * Hasta acá había un solo camino: el Worker pedía trabajo y publicaba abriendo
 * Chrome. Eso significa que nada avanzaba si la PC del local estaba apagada.
 *
 * Para los grupos y el perfil no hay alternativa —no existe API oficial que
 * los cubra—, pero para lo que sí se puede publicar por API es absurdo: la Fan
 * Page no necesita que haya alguien en el local a las nueve de la noche.
 *
 * Lo peligroso de tener dos motores es que cada uno lleve su propia cuenta de
 * cupo. Entre los dos publicarían el doble de lo permitido, cada uno creyendo
 * que está respetando el límite. Por eso el test que más importa acá es el que
 * verifica que **comparten los frenos**.
 */
const assert = require('assert');
const db = require('../../db');
const social = require('../../services/socialService');
const { resolverProvider, claseDeEjecucion } = require('../../services/social/providers');

let n = 0;
const unico = () => `${Date.now()}-${++n}`;

function vaciarCola() {
  db.prepare(
    "UPDATE social_post_targets SET estado = 'cancelled' WHERE estado IN ('queued','scheduled','processing')"
  ).run();
  db.prepare(
    "UPDATE social_worker_commands SET estado = 'cancelled' WHERE estado IN ('pending','processing')"
  ).run();
}

function armarIdentidad() {
  return Number(
    db
      .prepare(
        `INSERT INTO social_accounts (provider, clave, nombre, habilitada, metadata)
         VALUES ('facebook', ?, ?, 1, '{"tipo":"perfil"}')`
      )
      .run(`disp_${unico()}`, `Identidad ${unico()}`).lastInsertRowid
  );
}

function armarDestino(cuentaId, { tipo = 'facebook_group', clase = 'browser' } = {}) {
  return Number(
    db
      .prepare(
        `INSERT INTO social_destinations
           (provider, cuenta_id, tipo, identificador_externo, nombre, habilitada, execution_class)
         VALUES ('facebook', ?, ?, ?, ?, 1, ?)`
      )
      .run(cuentaId, tipo, `d_${unico()}`, `Destino ${unico()}`, clase).lastInsertRowid
  );
}

function armarCampana(destinos, { ensayo = false, texto = null } = {}) {
  const campanaId = Number(
    db
      .prepare(
        `INSERT INTO social_campaigns (nombre, texto, personalizaciones, estado, ensayo)
         VALUES (?, ?, '{}', 'draft', ?)`
      )
      .run(`C ${unico()}`, texto || `Texto ${unico()}`, ensayo ? 1 : 0).lastInsertRowid
  );

  const targetIds = destinos.map((destinoId) =>
    Number(
      db
        .prepare(
          "INSERT INTO social_post_targets (campana_id, destino_id, estado) VALUES (?, ?, 'draft')"
        )
        .run(campanaId, destinoId).lastInsertRowid
    )
  );

  return { campanaId, targetIds };
}

const estadoDe = (id) =>
  db.prepare('SELECT estado, ultimo_error FROM social_post_targets WHERE id = ?').get(id);

module.exports = {
  // ── El registro de providers ────────────────────────────────────────────
  'cada tipo de destino sabe quién lo publica': () => {
    assert.strictEqual(
      resolverProvider({ tipo: 'facebook_group' }).clave,
      'facebook_group_browser'
    );
    assert.strictEqual(
      resolverProvider({ tipo: 'facebook_profile' }).clave,
      'facebook_profile_browser'
    );
  },

  'los grupos y el perfil van por navegador': () => {
    /*
      Es la regla que no se negocia: la clase browser no crece nunca. Estos dos
      están ahí porque no tienen camino oficial, no por comodidad.
    */
    assert.strictEqual(claseDeEjecucion({ tipo: 'facebook_group' }), 'browser');
    assert.strictEqual(claseDeEjecucion({ tipo: 'facebook_profile' }), 'browser');
  },

  'un destino sin provider no rompe el sistema': () => {
    assert.strictEqual(resolverProvider({ tipo: 'tiktok' }), null);
    assert.strictEqual(resolverProvider(null), null);
  },

  'se le puede fijar el provider a un destino a mano': () => {
    /*
      Es lo que va a permitir migrar la Fan Page a la API sin tocar código: se
      le cambian dos campos a una fila.
    */
    const forzado = resolverProvider({ tipo: 'facebook_group', provider_clave: 'ensayo' });
    assert.strictEqual(forzado.clave, 'ensayo');
    assert.strictEqual(forzado.executionClass, 'api');
  },

  'un provider de navegador se niega a publicar desde el servidor': () => {
    /*
      Si alguien lo llamara por error tiene que romperse fuerte. Devolver algo
      parecido a un éxito haría creer que se publicó por un camino que no
      existe, y el destino quedaría marcado como publicado sin que nadie lo
      haya visto.
    */
    const provider = resolverProvider({ tipo: 'facebook_group' });
    assert.throws(() => provider.publicar({}), /Worker/);
  },

  // ── Los dos motores no se pisan ─────────────────────────────────────────
  'el Worker no se lleva lo que publica el servidor': () => {
    vaciarCola();
    const cuenta = armarIdentidad();
    const porApi = armarDestino(cuenta, { tipo: 'ensayo', clase: 'api' });
    const { campanaId } = armarCampana([porApi]);
    social.queueCampaign(campanaId, { now: true });

    assert.strictEqual(
      social.claimWork(),
      null,
      'si el Worker se lo llevara, quedaría esperando a una PC encendida sin necesidad'
    );
  },

  'el servidor no se lleva lo que publica el Worker': () => {
    vaciarCola();
    const cuenta = armarIdentidad();
    const porNavegador = armarDestino(cuenta);
    const { campanaId } = armarCampana([porNavegador]);
    social.queueCampaign(campanaId, { now: true });

    assert.strictEqual(social.claimApiWork(), null);
    assert.ok(social.claimWork(), 'el Worker sí se lo tiene que llevar');
  },

  'los dos motores comparten los frenos': () => {
    /*
      ── El test que más importa de este archivo ──────────────────────────────

      Si cada motor llevara su propia cuenta de cupo, entre los dos publicarían
      el doble de lo permitido, cada uno creyendo que respeta el límite. Acá se
      gasta el cupo con una publicación de navegador y se verifica que el
      motor de API también lo ve gastado.
    */
    vaciarCola();
    social.setSocialConfig({ cupoDiario: 1 });

    const cuenta = armarIdentidad();
    const porNavegador = armarDestino(cuenta);
    const porApi = armarDestino(cuenta, { tipo: 'ensayo', clase: 'api' });

    /* Ya se publicó una hoy por navegador: el cupo del día está gastado. */
    db.prepare(
      `INSERT INTO social_post_targets (campana_id, destino_id, estado, finalizado_en)
       SELECT id, ?, 'published', CURRENT_TIMESTAMP FROM social_campaigns LIMIT 1`
    ).run(porNavegador);

    const { campanaId } = armarCampana([porApi]);
    social.queueCampaign(campanaId, { now: true });

    assert.strictEqual(
      social.claimApiWork(),
      null,
      'el motor de API tiene que ver el cupo que gastó el navegador'
    );

    social.setSocialConfig({ cupoDiario: 25 });
  },

  'pausar todo también frena al servidor': () => {
    vaciarCola();
    const cuenta = armarIdentidad();
    const porApi = armarDestino(cuenta, { tipo: 'ensayo', clase: 'api' });
    const { campanaId } = armarCampana([porApi]);
    social.queueCampaign(campanaId, { now: true });

    social.pausarTodo('probando');
    assert.strictEqual(social.claimApiWork(), null);

    social.reanudarTodo();
    assert.ok(social.claimApiWork(), 'al reanudar vuelve a salir');
  },

  // ── El ensayo ───────────────────────────────────────────────────────────
  'un ensayo no lo toca el Worker': () => {
    /*
      No tiene sentido abrir Chrome y pararse frente al grupo para después no
      publicar. Lo resuelve el servidor.
    */
    vaciarCola();
    const cuenta = armarIdentidad();
    const grupo = armarDestino(cuenta);
    const { campanaId } = armarCampana([grupo], { ensayo: true });
    social.queueCampaign(campanaId, { now: true });

    assert.strictEqual(social.claimWork(), null);
    assert.ok(social.claimApiWork(), 'lo agarra el servidor');
  },

  'un ensayo recorre todo y no publica nada': async () => {
    vaciarCola();
    const cuenta = armarIdentidad();
    const grupo = armarDestino(cuenta);
    const texto = 'Milanesas a la napolitana ' + unico();
    const { campanaId, targetIds } = armarCampana([grupo], { ensayo: true, texto });
    social.queueCampaign(campanaId, { now: true });

    const trabajo = social.claimApiWork();
    await social.publicarPorApi(trabajo);

    assert.strictEqual(estadoDe(targetIds[0]).estado, 'published');

    /* Lo importante: quedó escrito qué se habría mandado. */
    const registro = db
      .prepare(
        `SELECT detalle FROM social_publication_logs
          WHERE target_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(targetIds[0]);
    const detalle = JSON.parse(registro.detalle || '{}');

    assert.strictEqual(detalle.ensayo, true);
    assert.strictEqual(detalle.textoQueSeHabriaMandado, texto);
  },

  'un ensayo pasa por los mismos frenos que una publicación de verdad': () => {
    /*
      Si el ensayo se saltara la política, probaría un camino que no es el que
      se usa después — y los bugs viven justamente en lo que el atajo se
      saltea.
    */
    vaciarCola();
    social.setSocialConfig({ cupoDiario: 3 });

    const cuenta = armarIdentidad();
    const grupos = [1, 2, 3, 4, 5].map(() => armarDestino(cuenta));
    const { campanaId } = armarCampana(grupos, { ensayo: true });

    const r = social.queueCampaign(campanaId, { now: true });
    assert.strictEqual(r.reparto.hoy, 3, 'el ensayo también respeta el cupo diario');
    assert.strictEqual(r.reparto.despues, 2);

    social.setSocialConfig({ cupoDiario: 25 });
  },

  // ── Errores del provider ────────────────────────────────────────────────
  'un destino sin provider falla con un motivo claro y no se reintenta': async () => {
    vaciarCola();
    const cuenta = armarIdentidad();
    const raro = armarDestino(cuenta, { tipo: 'tiktok', clase: 'api' });
    const { campanaId, targetIds } = armarCampana([raro]);
    social.queueCampaign(campanaId, { now: true });

    const trabajo = social.claimApiWork();
    await social.publicarPorApi(trabajo);

    const final = estadoDe(targetIds[0]);
    assert.strictEqual(final.estado, 'failed');
    assert.match(final.ultimo_error, /tiktok/);
  },

  'una campaña sin texto ni imágenes no llega a publicarse': async () => {
    vaciarCola();
    const cuenta = armarIdentidad();
    const destino = armarDestino(cuenta, { tipo: 'ensayo', clase: 'api' });
    const { campanaId, targetIds } = armarCampana([destino], { texto: ' ' });
    social.queueCampaign(campanaId, { now: true });

    const trabajo = social.claimApiWork();
    await social.publicarPorApi(trabajo);

    assert.strictEqual(estadoDe(targetIds[0]).estado, 'failed');
    assert.match(estadoDe(targetIds[0]).ultimo_error, /ni texto ni imágenes/);
  },

  'un provider que revienta no deja el destino colgado': async () => {
    vaciarCola();
    const cuenta = armarIdentidad();
    const destino = armarDestino(cuenta, { tipo: 'ensayo', clase: 'api' });
    const { campanaId, targetIds } = armarCampana([destino]);
    social.queueCampaign(campanaId, { now: true });

    const trabajo = social.claimApiWork();

    /* Se rompe el provider a propósito, sólo para este trabajo. */
    const { REGISTRO } = require('../../services/social/providers');
    const ensayoProvider = REGISTRO.find((p) => p.clave === 'ensayo');
    const original = ensayoProvider.publicar;
    ensayoProvider.publicar = () => {
      throw new Error('se cayó la red');
    };

    try {
      await social.publicarPorApi(trabajo);
    } finally {
      ensayoProvider.publicar = original;
    }

    assert.strictEqual(estadoDe(targetIds[0]).estado, 'failed');
  },

  'ante una respuesta incierta no se reintenta, se marca ambigua': async () => {
    /*
      Reintentar algo que quizás salió es la forma de publicar dos veces en el
      mismo grupo, que es justo lo que todo este módulo trata de evitar. Ante
      la duda, lo mira una persona.
    */
    vaciarCola();
    const cuenta = armarIdentidad();
    const destino = armarDestino(cuenta, { tipo: 'ensayo', clase: 'api' });
    const { campanaId, targetIds } = armarCampana([destino]);
    social.queueCampaign(campanaId, { now: true });

    const trabajo = social.claimApiWork();

    const { REGISTRO } = require('../../services/social/providers');
    const ensayoProvider = REGISTRO.find((p) => p.clave === 'ensayo');
    const original = ensayoProvider.publicar;
    ensayoProvider.publicar = () => {
      throw new Error('socket hang up');
    };

    try {
      await social.publicarPorApi(trabajo);
    } finally {
      ensayoProvider.publicar = original;
    }

    assert.strictEqual(estadoDe(targetIds[0]).estado, 'ambiguous');
  },

  // ── El reloj ────────────────────────────────────────────────────────────
  'después de publicar una, la siguiente tiene que esperar el intervalo': async () => {
    /*
      ── Lo que de verdad marca el ritmo ──────────────────────────────────────

      Escribí este test creyendo que probaba que el reloj despacha de a una por
      vuelta. No probaba eso: rompí el reloj para que vaciara la cola de un
      saque y el test siguió en verde.

      El motivo es que lo que frena no es el reloj sino `canDispatch`: después
      de la primera publicación, el intervalo mínimo niega a todas las demás.
      El "de a una por vuelta" es un cinturón además de los tirantes, no la
      protección.

      Así que el test prueba lo que realmente protege: que dos publicaciones
      seguidas no salgan dentro del mismo segundo.
    */
    vaciarCola();
    const { despacharUnaPublicacionApi } = require('../../services/socialScheduler');

    const cuenta = armarIdentidad();
    const destinos = [1, 2, 3].map(() => armarDestino(cuenta, { tipo: 'ensayo', clase: 'api' }));
    const { campanaId, targetIds } = armarCampana(destinos);
    social.queueCampaign(campanaId, { now: true });

    assert.strictEqual(await despacharUnaPublicacionApi(), true, 'la primera sale');
    assert.strictEqual(
      await despacharUnaPublicacionApi(),
      false,
      'la segunda tiene que esperar el intervalo'
    );

    const publicados = targetIds.filter((id) => estadoDe(id).estado === 'published').length;
    assert.strictEqual(publicados, 1, 'sólo salió una');
  },

  'el reloj avisa cuando no hay nada que hacer': async () => {
    vaciarCola();
    const { despacharUnaPublicacionApi } = require('../../services/socialScheduler');
    assert.strictEqual(await despacharUnaPublicacionApi(), false);
  },
};
