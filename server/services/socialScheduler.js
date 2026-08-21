const db = require('../db');
const logger = require('../utils/logger');
const social = require('./socialService');
const autolistas = require('./social/autolistas');

const { log } = social;

/**
 * Mantenimiento de la cola: recuperar lo trabado y soltar lo programado.
 *
 * Corre siempre, sin importar quién publique después.
 */
function recoverAndQueueSocialWork() {
  const recovered = db
    .prepare(
      `UPDATE social_post_targets SET estado = 'ambiguous', lock_token = '', lock_hasta = NULL,
     ultimo_error = 'La ejecución se interrumpió después de reclamar el destino. No se reintenta automáticamente para evitar una publicación duplicada.',
     actualizado_en = CURRENT_TIMESTAMP
     WHERE estado = 'processing' AND lock_hasta < CURRENT_TIMESTAMP`
    )
    .run().changes;
  const queued = db
    .prepare(
      `UPDATE social_post_targets SET estado = 'queued', actualizado_en = CURRENT_TIMESTAMP
     WHERE estado = 'scheduled' AND programada_para <= CURRENT_TIMESTAMP`
    )
    .run().changes;
  if (recovered || queued) {
    log({
      nivel: recovered ? 'warn' : 'info',
      codigo: recovered ? 'PUBLICATION_AMBIGUOUS' : '',
      mensaje: `Cola Social actualizada: ${queued} programadas, ${recovered} marcadas ambiguas`,
    });
  }
}

/**
 * El despachador de la clase API.
 *
 * ── Por qué el servidor necesita su propio motor ───────────────────────────
 *
 * Hasta ahora el único camino de ejecución pasaba por el Worker: nada avanzaba
 * si la PC del local estaba apagada. Para los grupos y el perfil eso es
 * inevitable —no hay API oficial que los cubra—, pero para lo que sí se puede
 * publicar por API sería absurdo: la Fan Page no necesita que haya alguien en
 * el local para publicar a las nueve de la noche.
 *
 * ── De a uno por vuelta ────────────────────────────────────────────────────
 *
 * El ritmo real lo pone `canDispatch`, no este reloj: después de publicar una,
 * el intervalo mínimo niega todas las demás hasta que pase. Lo comprobé
 * haciendo que esta función vaciara la cola de un saque — no cambió nada, la
 * política la frenó igual.
 *
 * Así que despachar de a uno es un cinturón además de los tirantes. Se queda
 * porque no cuesta nada y porque deja el motor simple: una vuelta, una
 * decisión, un reporte.
 */
async function despacharUnaPublicacionApi() {
  let trabajo = null;
  try {
    trabajo = social.claimApiWork();
  } catch (error) {
    logger.error('[social] no se pudo reclamar trabajo de API', error);
    return false;
  }
  if (!trabajo) return false;

  try {
    await social.publicarPorApi(trabajo);
  } catch (error) {
    /*
      Si `publicarPorApi` revienta, el destino queda reclamado y con lock. No
      se toca acá: el mantenimiento lo va a levantar cuando venza el lock y lo
      va a marcar ambiguo, que es lo correcto — no sabemos si llegó a salir.
    */
    logger.error('[social] falló el despacho por API', error);
  }
  return true;
}

/**
 * Las autolistas que tienen que publicar en esta hora.
 *
 * ── Por qué arma una campaña en vez de publicar ────────────────────────────
 *
 * Una autolista **no publica**: arma una campaña y la encola, igual que si la
 * hubieras armado a mano en el compositor.
 *
 * Es la decisión más importante del módulo. Si publicara por su cuenta se
 * saltearía el cupo diario, el descanso por grupo, el dedupe, el freno de mano
 * y el registro. Sería un segundo camino sin ninguna de las protecciones que
 * costaron construir — y encima automático, que es el peor lugar donde no
 * tenerlas.
 */
function correrAutolistas() {
  let listas;
  try {
    listas = autolistas.listar();
  } catch (error) {
    logger.error('[social] no se pudieron leer las autolistas', error);
    return 0;
  }

  let encoladas = 0;

  for (const lista of listas) {
    if (!autolistas.leToca(lista)) continue;

    if (!lista.destinos.length) {
      log({
        nivel: 'warn',
        codigo: 'AUTOLISTA_SIN_DESTINOS',
        mensaje: `«${lista.nombre}» tenía que publicar pero no tiene destinos elegidos`,
      });
      continue;
    }

    const pieza = autolistas.proximaPieza(lista.id);
    if (!pieza) {
      log({
        nivel: 'warn',
        codigo: 'AUTOLISTA_VACIA',
        mensaje: `«${lista.nombre}» tenía que publicar pero se quedó sin piezas`,
      });
      continue;
    }

    try {
      const campana = social.createCampaign({
        nombre: `${lista.nombre} · automática`,
        texto: pieza.texto,
        mediaIds: pieza.media_id ? [pieza.media_id] : [],
        destinoIds: lista.destinos,
        /*
          Se marca de dónde salió. Sin esto, dentro de tres meses nadie va a
          entender por qué apareció una campaña que nadie armó.
        */
        personalizaciones: { origen: 'autolista', autolistaId: lista.id },
      });

      social.queueCampaign(campana.id, { now: true });
      autolistas.mandarAlFinal(pieza);

      db.prepare('UPDATE social_autolistas SET ultima_salida = CURRENT_TIMESTAMP WHERE id = ?').run(
        lista.id
      );

      encoladas += 1;
      log({
        campanaId: campana.id,
        codigo: 'AUTOLISTA',
        mensaje: `«${lista.nombre}» encoló una publicación automática`,
      });
    } catch (error) {
      log({
        nivel: 'error',
        codigo: 'AUTOLISTA_ERROR',
        mensaje: `«${lista.nombre}» no pudo encolar: ${error.message}`,
      });
    }
  }

  return encoladas;
}

function startSocialScheduler() {
  recoverAndQueueSocialWork();

  const timer = setInterval(() => {
    recoverAndQueueSocialWork();
    correrAutolistas();
    despacharUnaPublicacionApi().catch((error) =>
      logger.error('[social] error inesperado en el despachador', error)
    );
  }, 30_000);

  timer.unref?.();
  return timer;
}

module.exports = {
  startSocialScheduler,
  recoverAndQueueSocialWork,
  despacharUnaPublicacionApi,
  correrAutolistas,
};
