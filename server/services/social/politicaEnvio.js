/**
 * Decide si un destino se puede publicar ahora.
 *
 * ── Por qué esto vive afuera del motor ─────────────────────────────────────
 *
 * Hoy el único motor es `claimWork()`, que atiende al worker. Pronto va a
 * haber un segundo: el scheduler del servidor, para los destinos que se
 * publican por API sin navegador.
 *
 * Si las reglas de cupo y ritmo vivieran adentro de `claimWork()`, el
 * scheduler necesitaría las mismas y terminarían duplicadas. Dos motores con
 * dos criterios de cuota sobre la misma identidad es peor que no tener cuota:
 * cada uno creería estar respetando un límite que el otro ya gastó.
 *
 * Por eso este módulo **no sabe nada del mundo**. No abre la base, no conoce
 * al worker, no conoce la API de Meta, no publica. Recibe el estado ya leído y
 * devuelve una decisión. Los dos motores le preguntan lo mismo.
 *
 * ── Qué devuelve ───────────────────────────────────────────────────────────
 *
 *   { permitido: bool, motivo: string, codigo: string, reintentarEn: Date|null }
 *
 * `reintentarEn` es cuándo tiene sentido volver a preguntar. `null` significa
 * que no se sabe o que no depende del tiempo — por ejemplo una pausa manual,
 * que se levanta cuando una persona la levanta.
 *
 * ── Por qué las reglas están en este orden ─────────────────────────────────
 *
 * De la más terminante a la más pasajera. Si hay una pausa manual, no importa
 * el cupo ni el intervalo: no se publica y punto. Empezar por el intervalo
 * haría que la respuesta dijera "esperá 40 segundos" cuando en realidad está
 * todo frenado a mano, y eso confunde a quien mira el resumen.
 */

/** Los valores por omisión, todos configurables desde la pantalla. */
const LIMITES = {
  /* Entre un destino y el siguiente de la misma identidad. */
  intervaloSegundos: 90,

  /*
    Cuánto se mueve ese intervalo al azar, hacia arriba o hacia abajo.

    Un intervalo exacto es el patrón más reconocible que existe: nadie publica
    cada noventa segundos clavados. 0,4 significa ±40%, o sea entre 54 y 126
    segundos con el valor por omisión.
  */
  jitter: 0.4,

  /* Destinos por día y por identidad. */
  cupoDiario: 25,

  /* Horas antes de volver a publicar en el mismo grupo. */
  cooldownGrupoHoras: 24,

  /* Instagram tiene su propio techo, impuesto por Meta. */
  cupoDiarioInstagram: 50,

  /* Fallos seguidos antes de frenar sola a la identidad. */
  fallosParaPausar: 5,

  /*
    Días para considerar que una publicación es repetida.

    Una semana es lo que tarda un grupo activo en renovar su primera pantalla.
    Repetir antes de eso es lo que hace que la gente te silencie.
  */
  ventanaDedupeDias: 7,
};

const NEGADO = (codigo, motivo, reintentarEn = null) => ({
  permitido: false,
  codigo,
  motivo,
  reintentarEn,
});

const PERMITIDO = { permitido: true, codigo: 'OK', motivo: '', reintentarEn: null };

/** Suma segundos a una fecha sin ensuciar la original. */
const sumarSegundos = (fecha, segundos) => new Date(fecha.getTime() + segundos * 1000);

/**
 * El intervalo de esta vez, con el desvío al azar aplicado.
 *
 * Se puede pasar `azar` para que un test lo controle: sin eso, una regla que
 * depende de `Math.random()` no se puede probar, y esta es justamente la que
 * hay que poder probar.
 */
function intervaloConJitter(config, azar = Math.random) {
  const base = Math.max(0, Number(config.intervaloSegundos ?? LIMITES.intervaloSegundos));
  const amplitud = Math.min(Math.max(Number(config.jitter ?? LIMITES.jitter), 0), 0.9);
  /* azar() da 0..1; se lleva a -1..1 para que desvíe para los dos lados. */
  const desvio = (azar() * 2 - 1) * amplitud;
  return Math.max(1, Math.round(base * (1 + desvio)));
}

/**
 * ¿Se puede despachar este destino ahora?
 *
 * @param estado Todo ya leído de la base por quien llama:
 *   - pausaGlobal            bool
 *   - identidadPausada       bool
 *   - identidadPausadaMotivo string
 *   - fallosSeguidos         número
 *   - enviadosHoyIdentidad   número
 *   - enviadosHoyInstagram   número
 *   - ultimoEnvioIdentidad   Date | null
 *   - ultimoEnvioAlDestino   Date | null
 *   - esInstagram            bool
 *   - esGrupo                bool
 */
function canDispatch({ estado = {}, config = {}, ahora = new Date(), azar = Math.random } = {}) {
  const limites = { ...LIMITES, ...config };

  // 1 · Pausa manual, general o de la identidad ─────────────────────────────
  if (estado.pausaGlobal) {
    return NEGADO('PAUSA_GLOBAL', 'Está todo pausado a mano desde el panel.');
  }
  if (estado.identidadPausada) {
    return NEGADO(
      'PAUSA_IDENTIDAD',
      estado.identidadPausadaMotivo || 'Esta identidad está pausada a mano.'
    );
  }

  // 2 · Pausa automática por fallos seguidos ────────────────────────────────
  /*
    Va antes que los cupos porque es una señal de que algo se rompió del otro
    lado. Gastar cupo en intentos que van a fallar es tirar cupo.
  */
  const fallos = Number(estado.fallosSeguidos || 0);
  if (fallos >= limites.fallosParaPausar) {
    return NEGADO(
      'DEMASIADOS_FALLOS',
      `Fallaron ${fallos} seguidos. Se frenó sola para no empeorarlo: revisá qué pasó y reanudá a mano.`
    );
  }

  // 3 · Cupo diario de la identidad ─────────────────────────────────────────
  /*
    El contador es por identidad y **no distingue cómo se publica**. Si la Fan
    Page publica por API y el Perfil por navegador, cada una descuenta del suyo.
    Un cupo que sólo cuenta una clase de ejecución no protege nada.
  */
  const enviadosHoy = Number(estado.enviadosHoyIdentidad || 0);
  if (enviadosHoy >= limites.cupoDiario) {
    return NEGADO(
      'CUPO_DIARIO',
      `Esta identidad ya publicó en ${enviadosHoy} destinos hoy, que es el máximo.`,
      manana(ahora)
    );
  }

  // 4 · Cupo diario de Instagram ────────────────────────────────────────────
  if (estado.esInstagram) {
    const deInstagram = Number(estado.enviadosHoyInstagram || 0);
    if (deInstagram >= limites.cupoDiarioInstagram) {
      return NEGADO(
        'CUPO_INSTAGRAM',
        `Instagram permite ${limites.cupoDiarioInstagram} publicaciones por día y ya se usaron.`,
        manana(ahora)
      );
    }
  }

  // 5 · Descanso del grupo ──────────────────────────────────────────────────
  /*
    Publicar dos veces el mismo día en el mismo grupo es la forma más rápida
    de que un administrador te eche. El descanso es por destino, no por
    identidad.
  */
  if (estado.esGrupo && estado.ultimoEnvioAlDestino) {
    const desde = new Date(estado.ultimoEnvioAlDestino);
    const listoEn = sumarSegundos(desde, limites.cooldownGrupoHoras * 3600);
    if (ahora < listoEn) {
      return NEGADO(
        'GRUPO_EN_DESCANSO',
        `Ya se publicó en este grupo hace menos de ${limites.cooldownGrupoHoras} horas.`,
        listoEn
      );
    }
  }

  // 6 · Intervalo mínimo de la identidad, con desvío ────────────────────────
  if (estado.ultimoEnvioIdentidad) {
    const desde = new Date(estado.ultimoEnvioIdentidad);
    const espera = intervaloConJitter(limites, azar);
    const listoEn = sumarSegundos(desde, espera);
    if (ahora < listoEn) {
      const faltan = Math.ceil((listoEn - ahora) / 1000);
      return NEGADO('ESPERANDO_INTERVALO', `Faltan ${faltan} segundos para el próximo.`, listoEn);
    }
  }

  return PERMITIDO;
}

/**
 * El arranque del día siguiente, en hora argentina.
 *
 * Los cupos son diarios y el día del negocio no es el del UTC: el servidor
 * corre tres horas adelantado, así que sin corregir el cupo se reiniciaría a
 * las nueve de la noche, en plena hora de venta.
 */
function manana(ahora) {
  const local = new Date(ahora.getTime() - 3 * 3600 * 1000);
  local.setUTCHours(0, 0, 0, 0);
  local.setUTCDate(local.getUTCDate() + 1);
  return new Date(local.getTime() + 3 * 3600 * 1000);
}

/**
 * Reparte una tanda de destinos entre hoy y los días siguientes.
 *
 * ── Por qué el excedente no es un error ────────────────────────────────────
 *
 * Si se eligen 35 grupos y el cupo diario es 25, lo que no entra **no falla**:
 * queda programado para mañana. Marcarlo como fallido sería mentir —no falló
 * nada— y además obligaría a rearmar la campaña a mano.
 *
 * Devuelve, por cada destino, para qué día quedó.
 */
function repartirPorDia(
  destinos,
  { cupoDiario = LIMITES.cupoDiario, yaEnviadosHoy = 0, ahora = new Date() } = {}
) {
  const cupo = Math.max(1, Number(cupoDiario));
  let disponibleHoy = Math.max(0, cupo - Number(yaEnviadosHoy || 0));

  let dia = 0;
  let usadoEnElDia = 0;

  return destinos.map((destino) => {
    const tope = dia === 0 ? disponibleHoy : cupo;

    if (usadoEnElDia >= tope) {
      dia += 1;
      usadoEnElDia = 0;
      disponibleHoy = cupo;
    }

    usadoEnElDia += 1;

    return {
      destino,
      dia,
      /* El día 0 sale ahora; los siguientes, al abrir el día. */
      programadoPara: dia === 0 ? null : diasDespues(ahora, dia),
    };
  });
}

function diasDespues(ahora, dias) {
  const base = manana(ahora);
  return new Date(base.getTime() + (dias - 1) * 24 * 3600 * 1000);
}

module.exports = {
  canDispatch,
  repartirPorDia,
  intervaloConJitter,
  manana,
  LIMITES,
};
