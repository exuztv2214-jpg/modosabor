/**
 * Hablar con la API oficial de Meta.
 *
 * ── Qué está verificado y qué no ───────────────────────────────────────────
 *
 * Los endpoints, los parámetros y los nombres de permisos de este archivo
 * salieron de la documentación de Meta del 21 de agosto de 2026, versión
 * **v25.0**. No los escribí de memoria: esa API cambia seguido y lo que uno
 * recuerda suele estar viejo.
 *
 * Lo que **no** está verificado es que funcionen contra la cuenta real. Para
 * eso hace falta un token con los permisos aprobados, y eso depende de una
 * App Review de Meta que sólo puede hacer el dueño de la cuenta. Hasta que eso
 * pase, este módulo está escrito y probado contra respuestas simuladas, pero
 * nunca habló con Facebook.
 *
 * ── Por qué el token no se toca nunca en claro ─────────────────────────────
 *
 * Un token de página con permisos de publicación es, en la práctica, la llave
 * de la Fan Page. Se guarda cifrado, se desencripta sólo en el momento de
 * armar el pedido, y **no aparece en ningún log, error ni captura de
 * pantalla**. Los mensajes de error de Meta se limpian antes de guardarse
 * porque a veces devuelven el token adentro.
 */

const { desencriptar } = require('../../utils/encryptConfig');

/**
 * La versión de la API va fija y explícita.
 *
 * Meta rota versiones cada pocos meses y las viejas dejan de andar. Con la
 * versión escrita acá, el día que deje de funcionar el error va a decir
 * exactamente eso, en vez de romperse de formas raras. Sin versión, la API usa
 * la más vieja soportada y el comportamiento cambia solo bajo los pies.
 */
const VERSION = 'v25.0';
const GRAPH = `https://graph.facebook.com/${VERSION}`;

/** Cuánto se espera a Meta antes de darlo por perdido. */
const ESPERA_MS = 20000;

/**
 * Los permisos que hacen falta, según la documentación de v25.0.
 *
 * Están acá para que se puedan mostrar en pantalla: cuando la publicación
 * falle por permisos, hay que poder decir cuál falta y no "error 200".
 */
const PERMISOS = {
  pagina: [
    'pages_manage_posts',
    'pages_manage_engagement',
    'pages_read_engagement',
    'pages_read_user_engagement',
  ],
  instagram: [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'pages_read_engagement',
  ],
};

/**
 * Saca el token de cualquier texto antes de que se guarde.
 *
 * Meta devuelve el pedido completo en algunos errores, token incluido. Sin
 * esto, ese token terminaría en la tabla de logs, que es exactamente lo que
 * este módulo trata de evitar.
 */
function limpiarSecretos(texto) {
  return String(texto || '')
    .replace(/access_token=[^&\s"']+/gi, 'access_token=***')
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"***"')
    .replace(/EAA[A-Za-z0-9_-]{20,}/g, '***');
}

/**
 * Un error de Meta, traducido.
 *
 * ── Por qué se distingue "no sé si salió" de "no salió" ────────────────────
 *
 * Un timeout no significa que no se publicó: significa que no sabemos. Si eso
 * se trata como un fallo y se reintenta, se publica dos veces en el mismo
 * lugar — que es el peor resultado posible de todo este módulo.
 */
class ErrorDeMeta extends Error {
  constructor(mensaje, { codigo = '', incierto = false, permisoFaltante = '' } = {}) {
    super(limpiarSecretos(mensaje));
    this.name = 'ErrorDeMeta';
    this.codigo = codigo;
    this.incierto = incierto;
    this.permisoFaltante = permisoFaltante;
  }
}

/** Los códigos de Meta que sabemos leer, con su explicación en castellano. */
function explicarError(cuerpo) {
  const error = cuerpo?.error || {};
  const codigo = Number(error.code);
  const subcodigo = Number(error.error_subcode);

  if (codigo === 190) {
    return new ErrorDeMeta(
      'El token de acceso venció o fue revocado. Hay que volver a generarlo.',
      { codigo: 'TOKEN_VENCIDO' }
    );
  }
  if (codigo === 200 || codigo === 10) {
    return new ErrorDeMeta(
      `Faltan permisos para publicar. Meta pide: ${PERMISOS.pagina.join(', ')}.`,
      { codigo: 'SIN_PERMISOS', permisoFaltante: PERMISOS.pagina.join(', ') }
    );
  }
  if (codigo === 4 || codigo === 17 || codigo === 32 || subcodigo === 2446079) {
    return new ErrorDeMeta('Meta está limitando la cantidad de pedidos. Hay que esperar.', {
      codigo: 'LIMITE_DE_META',
    });
  }
  if (codigo === 1 || codigo === 2) {
    /*
      Los errores transitorios de Meta son ambiguos por definición: el pedido
      pudo haber llegado igual. No se reintenta solo.
    */
    return new ErrorDeMeta('Meta tuvo un problema temporal y no confirmó si se publicó.', {
      codigo: 'RESPUESTA_INCIERTA',
      incierto: true,
    });
  }

  return new ErrorDeMeta(error.message || 'Meta rechazó el pedido sin explicar por qué.', {
    codigo: `META_${codigo || 'DESCONOCIDO'}`,
  });
}

/**
 * Un pedido a la Graph API.
 *
 * El token va en el cuerpo y no en la URL a propósito: las URLs terminan en
 * logs de servidores intermedios, y ahí un token de publicación es un
 * problema serio.
 */
async function pedir(ruta, { metodo = 'GET', token, parametros = {} } = {}) {
  const url = `${GRAPH}/${ruta}`;
  const cuerpo = { ...parametros, access_token: desencriptar(token) };

  let respuesta;
  try {
    respuesta = await fetch(metodo === 'GET' ? `${url}?${new URLSearchParams(cuerpo)}` : url, {
      method: metodo,
      headers: metodo === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
  } catch (error) {
    /*
      Ni siquiera llegamos a tener respuesta. Puede que el pedido haya llegado
      igual y se haya publicado: no se sabe, y por eso es incierto.
    */
    throw new ErrorDeMeta(`No se pudo hablar con Meta: ${error.message}`, {
      codigo: 'RESPUESTA_INCIERTA',
      incierto: true,
    });
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || datos.error) throw explicarError(datos);
  return datos;
}

/* ────────────────────────────────────────────────────────────────────────────
   Fan Page
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Publica en el feed de una página.
 *
 * Documentado en Pages API › Posts (v25.0): POST /{page-id}/feed con `message`
 * y opcionalmente `link`. Para una foto es otro endpoint, /{page-id}/photos con
 * `url`, y devuelve `post_id` además de `id`. Para varias fotos, primero se
 * crean como no publicadas y después se adjuntan juntas al post del feed.
 */
async function publicarEnPagina({ pageId, token, texto, link = '', fotoUrl = '', fotosUrl = [] }) {
  const fotos = [
    ...new Set([...(Array.isArray(fotosUrl) ? fotosUrl : []), fotoUrl].filter(Boolean)),
  ];

  if (fotos.length > 1) {
    const adjuntos = [];
    for (const url of fotos) {
      const datos = await pedir(`${pageId}/photos`, {
        metodo: 'POST',
        token,
        parametros: { url, published: false },
      });
      if (datos.id) adjuntos.push({ media_fbid: datos.id });
    }

    const datos = await pedir(`${pageId}/feed`, {
      metodo: 'POST',
      token,
      parametros: { message: texto, attached_media: adjuntos },
    });
    return { id: datos.id, url: datos.id ? `https://www.facebook.com/${datos.id}` : '' };
  }

  if (fotos[0]) {
    const datos = await pedir(`${pageId}/photos`, {
      metodo: 'POST',
      token,
      parametros: { url: fotos[0], caption: texto },
    });
    const id = datos.post_id || datos.id;
    return { id, url: id ? `https://www.facebook.com/${id}` : '' };
  }

  const datos = await pedir(`${pageId}/feed`, {
    metodo: 'POST',
    token,
    parametros: link ? { message: texto, link } : { message: texto },
  });
  return { id: datos.id, url: datos.id ? `https://www.facebook.com/${datos.id}` : '' };
}

/* ────────────────────────────────────────────────────────────────────────────
   Reels e historias de la Fan Page
   ──────────────────────────────────────────────────────────────────────────── */

/*
  Se define acá arriba, antes del primero que la usa.

  Las tres funciones que esperan a Meta la reciben como parámetro por omisión
  para poder reemplazarla en los tests y no esperar de verdad: un test que
  duerme treinta segundos es un test que nadie corre.
*/
const esperarUnPoco = (ms) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Los videos no se suben por donde se sube todo lo demás.
 *
 * Meta usa un host aparte, `rupload.facebook.com`, y ahí el token va en un
 * header `Authorization: OAuth`, no en el cuerpo. Es la única parte de este
 * archivo donde el token viaja en un header, y está acá y no en `pedir()`
 * justamente para que se vea que es la excepción.
 *
 * Dos cosas que Meta rechaza y conviene saber antes de perder media hora:
 *   - Archivos servidos desde un sitio que bloquea `facebookexternalhit` en su
 *     robots.txt. Meta baja el video él mismo y respeta el robots.
 *   - Archivos alojados en el CDN de Meta (`fbcdn`).
 */
const RUPLOAD = `https://rupload.facebook.com/video-upload/${VERSION}`;

async function subirVideoPorUrl({ videoId, token, videoUrl }) {
  let respuesta;
  try {
    respuesta = await fetch(`${RUPLOAD}/${videoId}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${desencriptar(token)}`,
        file_url: videoUrl,
      },
      /* Subir y procesar un video tarda bastante más que un pedido normal. */
      signal: AbortSignal.timeout(ESPERA_MS * 6),
    });
  } catch (error) {
    throw new ErrorDeMeta(`No se pudo subir el video a Meta: ${error.message}`, {
      codigo: 'RESPUESTA_INCIERTA',
      incierto: true,
    });
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || datos.success === false || datos.error) {
    /*
      Los errores de subida vienen en `debug_info`, con otra forma que los de
      la Graph API. Sin este caso el mensaje quedaría en "Meta rechazó el
      pedido sin explicar por qué", que no ayuda a nadie.
    */
    const detalle = datos.debug_info?.message || datos.error?.message || '';
    throw new ErrorDeMeta(
      detalle ? `Meta rechazó el video: ${detalle}` : 'Meta rechazó el video sin explicar por qué.',
      { codigo: 'VIDEO_RECHAZADO' }
    );
  }
  return true;
}

/**
 * Espera a que Meta termine de procesar un video.
 *
 * ── Por qué no se usa `esperarContenedor` ──────────────────────────────────
 *
 * Instagram devuelve un `status_code` plano; los videos de Facebook devuelven
 * un objeto `status` con tres fases anidadas y el error adentro de la fase que
 * falló. Son dos formas distintas de decir lo mismo, y mezclarlas en una sola
 * función terminaría en un `if` por cada campo.
 *
 * El motivo del rechazo se devuelve tal como lo dice Meta —resolución baja,
 * duración fuera de rango, relación de aspecto— porque es lo único accionable:
 * "no se pudo publicar" no le dice a nadie que el video dura 2 minutos y el
 * tope son 90 segundos.
 */
async function esperarVideo({ videoId, token, esperar = esperarUnPoco, intentos = 20 }) {
  for (let i = 0; i < intentos; i += 1) {
    const datos = await pedir(videoId, { token, parametros: { fields: 'status' } });
    const estado = datos.status || {};

    const falla =
      estado.processing_phase?.error?.message ||
      estado.uploading_phase?.error?.message ||
      estado.publishing_phase?.error?.message ||
      '';
    if (falla) return { listo: false, motivo: falla };

    if (estado.video_status === 'ready') return { listo: true, motivo: '' };
    if (estado.video_status === 'error') {
      return { listo: false, motivo: 'Meta no pudo procesar el video.' };
    }
    if (estado.video_status === 'expired') {
      return { listo: false, motivo: 'La sesión de subida venció antes de terminar.' };
    }

    await esperar(Math.min((i + 1) * 2000, 30000));
  }

  /* Sigue procesando: puede terminar solo más tarde, así que no es un "no". */
  return { listo: false, motivo: '', incierto: true };
}

/**
 * Publica un reel en la Fan Page.
 *
 * Tres pasos, documentados en Video API › Reels Publishing (v25.0):
 *   1. POST /{page-id}/video_reels con upload_phase=start
 *   2. subir el video a rupload.facebook.com
 *   3. POST /{page-id}/video_reels con upload_phase=finish
 *
 * ── Los límites que impone Meta ────────────────────────────────────────────
 *
 * Se validan **antes** de subir nada, porque subir un video de 40 MB para que
 * Meta lo rechace por la duración es tiempo y datos tirados. Los números salen
 * de la documentación:
 *   - Duración: entre 3 y 90 segundos
 *   - Relación de aspecto: 9x16
 *   - Resolución mínima: 540x960
 *   - Tope: 30 reels publicados por API cada 24 horas
 *
 * Sólo se puede publicar reels en **páginas**. En perfiles personales no, y no
 * es una limitación nuestra.
 */
const LIMITES_REEL = { duracionMin: 4, duracionMax: 60, porDia: 30 };

async function publicarReelEnPagina({
  pageId,
  token,
  texto = '',
  videoUrl,
  duracionSegundos = 0,
  esperar = esperarUnPoco,
}) {
  if (!videoUrl) {
    throw new ErrorDeMeta('Un reel necesita un video.', { codigo: 'FALTA_VIDEO' });
  }

  /*
    La duración se valida sólo si se conoce. Cuando no viene, se deja pasar y
    Meta decide: inventar un valor por omisión sería peor, porque frenaría
    videos que en realidad sirven.
  */
  if (duracionSegundos) {
    const { duracionMin, duracionMax } = LIMITES_REEL;
    if (duracionSegundos < duracionMin || duracionSegundos > duracionMax) {
      throw new ErrorDeMeta(
        `Un reel tiene que durar entre ${duracionMin} y ${duracionMax} segundos. Este dura ${Math.round(duracionSegundos)}.`,
        { codigo: 'DURACION_INVALIDA' }
      );
    }
  }

  const sesion = await pedir(`${pageId}/video_reels`, {
    metodo: 'POST',
    token,
    parametros: { upload_phase: 'start' },
  });
  if (!sesion.video_id) {
    throw new ErrorDeMeta('Meta no devolvió una sesión de subida para el reel.', {
      codigo: 'SIN_SESION',
    });
  }

  await subirVideoPorUrl({ videoId: sesion.video_id, token, videoUrl });

  const estado = await esperarVideo({ videoId: sesion.video_id, token, esperar });
  if (!estado.listo) {
    throw new ErrorDeMeta(
      estado.motivo || 'Meta sigue procesando el reel y no confirmó la publicación.',
      {
        codigo: estado.incierto ? 'RESPUESTA_INCIERTA' : 'VIDEO_RECHAZADO',
        incierto: !!estado.incierto,
      }
    );
  }

  await pedir(`${pageId}/video_reels`, {
    metodo: 'POST',
    token,
    parametros: {
      video_id: sesion.video_id,
      upload_phase: 'finish',
      video_state: 'PUBLISHED',
      description: texto,
    },
  });

  return {
    id: sesion.video_id,
    url: `https://www.facebook.com/reel/${sesion.video_id}`,
  };
}

/**
 * Publica una historia en la Fan Page.
 *
 * Foto y video son dos caminos distintos:
 *   - Foto: POST /{page-id}/photos con published=false, después
 *     POST /{page-id}/photo_stories con ese photo_id.
 *   - Video: la misma danza de tres pasos que el reel, pero contra
 *     /{page-id}/video_stories.
 *
 * ── Un límite que sorprende ────────────────────────────────────────────────
 *
 * Meta no acepta como historia una foto o un video **que ya se haya usado en
 * una publicación anterior**. No es un capricho del código: está en la
 * documentación, y explica por qué reusar la misma imagen falla sin motivo
 * aparente.
 *
 * Las historias en video no pueden pasar de 60 segundos — diez menos que un
 * reel, que llega a 90.
 */
const LIMITES_HISTORIA = { duracionMax: 60 };

async function publicarHistoriaEnPagina({
  pageId,
  token,
  fotoUrl = '',
  videoUrl = '',
  duracionSegundos = 0,
  esperar = esperarUnPoco,
}) {
  if (!fotoUrl && !videoUrl) {
    throw new ErrorDeMeta('Una historia necesita una foto o un video.', {
      codigo: 'FALTA_MEDIA',
    });
  }

  if (fotoUrl && !videoUrl) {
    const foto = await pedir(`${pageId}/photos`, {
      metodo: 'POST',
      token,
      parametros: { url: fotoUrl, published: false },
    });
    if (!foto.id) {
      throw new ErrorDeMeta('Meta no devolvió la foto subida para la historia.', {
        codigo: 'SIN_FOTO',
      });
    }

    const publicada = await pedir(`${pageId}/photo_stories`, {
      metodo: 'POST',
      token,
      parametros: { photo_id: foto.id },
    });
    const id = publicada.post_id || foto.id;
    return { id, url: id ? `https://www.facebook.com/stories/${id}` : '' };
  }

  if (duracionSegundos && duracionSegundos > LIMITES_HISTORIA.duracionMax) {
    throw new ErrorDeMeta(
      `Una historia en video no puede pasar de ${LIMITES_HISTORIA.duracionMax} segundos. Esta dura ${Math.round(duracionSegundos)}.`,
      { codigo: 'DURACION_INVALIDA' }
    );
  }

  const sesion = await pedir(`${pageId}/video_stories`, {
    metodo: 'POST',
    token,
    parametros: { upload_phase: 'start' },
  });
  if (!sesion.video_id) {
    throw new ErrorDeMeta('Meta no devolvió una sesión de subida para la historia.', {
      codigo: 'SIN_SESION',
    });
  }

  await subirVideoPorUrl({ videoId: sesion.video_id, token, videoUrl });

  const estado = await esperarVideo({ videoId: sesion.video_id, token, esperar });
  if (!estado.listo) {
    throw new ErrorDeMeta(
      estado.motivo || 'Meta sigue procesando la historia y no confirmó la publicación.',
      {
        codigo: estado.incierto ? 'RESPUESTA_INCIERTA' : 'VIDEO_RECHAZADO',
        incierto: !!estado.incierto,
      }
    );
  }

  const publicada = await pedir(`${pageId}/video_stories`, {
    metodo: 'POST',
    token,
    parametros: { video_id: sesion.video_id, upload_phase: 'finish' },
  });

  const id = publicada.post_id || sesion.video_id;
  return { id, url: id ? `https://www.facebook.com/stories/${id}` : '' };
}

/* ────────────────────────────────────────────────────────────────────────────
   Instagram
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Publica en Instagram, que son dos pasos y una espera.
 *
 * ── Por qué no alcanza con un solo pedido ──────────────────────────────────
 *
 * Instagram no publica de una: primero se crea un "contenedor" con la imagen,
 * Meta la baja y la procesa por su cuenta, y recién cuando terminó se publica.
 * Entre una cosa y la otra pueden pasar varios segundos.
 *
 * La documentación recomienda consultar el estado una vez por minuto durante
 * no más de cinco minutos. Acá se consulta más seguido al principio porque una
 * foto chica suele estar lista en segundos, y esperar un minuto entero para
 * algo que tardó dos es tiempo perdido.
 *
 * Dos límites que impone Meta y que no se pueden esquivar:
 *   - La imagen tiene que estar en un servidor público: Meta la baja él mismo.
 *   - Sólo JPEG. Ni PNG ni WebP.
 */
async function publicarEnInstagram({ igId, token, texto, imagenUrl, esperar = esperarUnPoco }) {
  if (!imagenUrl) {
    throw new ErrorDeMeta('Instagram no permite publicar sin imagen.', {
      codigo: 'FALTA_IMAGEN',
    });
  }

  const contenedor = await pedir(`${igId}/media`, {
    metodo: 'POST',
    token,
    parametros: { image_url: imagenUrl, caption: texto },
  });

  const estado = await esperarContenedor({ contenedorId: contenedor.id, token, esperar });
  if (estado !== 'FINISHED') {
    /*
      `EXPIRED` y `ERROR` son definitivos: no se publicó y reintentar el mismo
      contenedor no va a servir. `IN_PROGRESS` después de cinco minutos es
      incierto: quizás termine solo más tarde.
    */
    const definitivo = estado === 'ERROR' || estado === 'EXPIRED';
    throw new ErrorDeMeta(
      definitivo
        ? `Instagram no pudo procesar la imagen (${estado}).`
        : 'Instagram sigue procesando la imagen y no confirmó la publicación.',
      { codigo: definitivo ? 'MEDIA_RECHAZADA' : 'RESPUESTA_INCIERTA', incierto: !definitivo }
    );
  }

  const publicada = await pedir(`${igId}/media_publish`, {
    metodo: 'POST',
    token,
    parametros: { creation_id: contenedor.id },
  });

  return { id: publicada.id, url: '' };
}

/**
 * Reel, historia o carrusel de Instagram.
 *
 * ── Por qué es la misma función y no tres ──────────────────────────────────
 *
 * En Instagram los tres formatos son **el mismo par de pedidos**: se arma un
 * contenedor y se publica. Lo único que cambia es el `media_type` y de qué
 * campo cuelga la media. Tres funciones casi iguales significarían arreglar el
 * mismo bug tres veces y olvidarse de una.
 *
 * El carrusel es la excepción y por eso tiene su rama: primero se crea un
 * contenedor por cada pieza con `is_carousel_item`, y después uno que los
 * agrupa. Meta cuenta el carrusel entero como **una** publicación para el tope
 * diario, no como diez.
 *
 * Límites que impone Meta:
 *   - 100 publicaciones por API cada 24 horas
 *   - Hasta 10 piezas por carrusel
 *   - Sólo JPEG en imágenes. Ni PNG ni WebP.
 *   - La media tiene que estar en un servidor público: Meta la baja él mismo
 */
const FORMATOS_IG = new Set(['post', 'reel', 'historia', 'carrusel']);
const LIMITES_IG = { piezasCarrusel: 10, porDia: 100 };

async function publicarFormatoEnInstagram({
  igId,
  token,
  formato = 'post',
  texto = '',
  imagenUrl = '',
  videoUrl = '',
  piezas = [],
  esperar = esperarUnPoco,
}) {
  if (!FORMATOS_IG.has(formato)) {
    throw new ErrorDeMeta(`Instagram no conoce el formato «${formato}».`, {
      codigo: 'FORMATO_DESCONOCIDO',
    });
  }

  /* ── Carrusel ─────────────────────────────────────────────────────────── */
  if (formato === 'carrusel') {
    const lista = (piezas || []).filter((p) => p && (p.imagenUrl || p.videoUrl));
    if (lista.length < 2) {
      throw new ErrorDeMeta('Un carrusel necesita al menos dos piezas.', {
        codigo: 'CARRUSEL_CORTO',
      });
    }
    if (lista.length > LIMITES_IG.piezasCarrusel) {
      throw new ErrorDeMeta(
        `Un carrusel admite hasta ${LIMITES_IG.piezasCarrusel} piezas y mandaste ${lista.length}.`,
        { codigo: 'CARRUSEL_LARGO' }
      );
    }

    /*
      Los hijos se crean de a uno y en orden. En paralelo sería más rápido,
      pero Meta responde con límite de pedidos y además el orden del carrusel
      es el orden en que se mandan los `children`: paralelizar lo volvería
      impredecible.
    */
    const hijos = [];
    for (const pieza of lista) {
      const hijo = await pedir(`${igId}/media`, {
        metodo: 'POST',
        token,
        parametros: pieza.videoUrl
          ? { video_url: pieza.videoUrl, media_type: 'VIDEO', is_carousel_item: true }
          : { image_url: pieza.imagenUrl, is_carousel_item: true },
      });
      hijos.push(hijo.id);
    }

    const contenedor = await pedir(`${igId}/media`, {
      metodo: 'POST',
      token,
      parametros: { media_type: 'CAROUSEL', children: hijos.join(','), caption: texto },
    });

    return publicarContenedorIg({ igId, token, contenedorId: contenedor.id, esperar });
  }

  /* ── Post, reel e historia ────────────────────────────────────────────── */
  const media = videoUrl || imagenUrl;
  if (!media) {
    throw new ErrorDeMeta('Instagram no permite publicar sin imagen ni video.', {
      codigo: 'FALTA_MEDIA',
    });
  }
  if (formato === 'reel' && !videoUrl) {
    throw new ErrorDeMeta('Un reel de Instagram necesita un video, no una foto.', {
      codigo: 'FALTA_VIDEO',
    });
  }

  const tipo = formato === 'reel' ? 'REELS' : formato === 'historia' ? 'STORIES' : '';
  const parametros = videoUrl ? { video_url: videoUrl } : { image_url: imagenUrl };
  if (tipo) parametros.media_type = tipo;
  else if (videoUrl) parametros.media_type = 'VIDEO';

  /*
    Las historias no llevan texto. Meta ignora el `caption` en ese formato, así
    que mandarlo haría creer que el texto salió cuando no salió en ningún lado.
  */
  if (formato !== 'historia' && texto) parametros.caption = texto;

  const contenedor = await pedir(`${igId}/media`, {
    metodo: 'POST',
    token,
    parametros,
  });

  return publicarContenedorIg({ igId, token, contenedorId: contenedor.id, esperar });
}

/** El segundo paso, que es igual para todos los formatos. */
async function publicarContenedorIg({ igId, token, contenedorId, esperar }) {
  const estado = await esperarContenedor({ contenedorId, token, esperar });

  if (estado !== 'FINISHED') {
    const definitivo = estado === 'ERROR' || estado === 'EXPIRED';
    throw new ErrorDeMeta(
      definitivo
        ? `Instagram no pudo procesar la media (${estado}).`
        : 'Instagram sigue procesando y no confirmó la publicación.',
      { codigo: definitivo ? 'MEDIA_RECHAZADA' : 'RESPUESTA_INCIERTA', incierto: !definitivo }
    );
  }

  const publicada = await pedir(`${igId}/media_publish`, {
    metodo: 'POST',
    token,
    parametros: { creation_id: contenedorId },
  });

  return { id: publicada.id, url: '' };
}

/**
 * Agrega el primer comentario pedido desde el compositor.
 *
 * Se hace después de confirmar la publicación. Si falla, la publicación ya
 * existe y no debe reintentarse: el provider devuelve el post como publicado
 * y guarda la advertencia en el detalle.
 */
async function comentarEnInstagram({ mediaId, token, texto }) {
  const mensaje = String(texto || '')
    .trim()
    .slice(0, 2200);
  if (!mediaId || !mensaje) return null;

  return pedir(`${mediaId}/comments`, {
    metodo: 'POST',
    token,
    parametros: { message: mensaje },
  });
}

/**
 * Pregunta por el contenedor hasta que esté listo.
 *
 * Empieza consultando seguido y va espaciando: la mayoría de las fotos están
 * listas en pocos segundos, y las que tardan van a tardar bastante igual.
 */
async function esperarContenedor({ contenedorId, token, esperar, intentos = 12 }) {
  let estado = 'IN_PROGRESS';

  for (let i = 0; i < intentos; i += 1) {
    const datos = await pedir(contenedorId, {
      token,
      parametros: { fields: 'status_code' },
    });
    estado = datos.status_code || 'IN_PROGRESS';
    if (estado !== 'IN_PROGRESS') return estado;

    /* 2, 4, 6… segundos, con techo de 30. */
    await esperar(Math.min((i + 1) * 2000, 30000));
  }

  return estado;
}

/* ────────────────────────────────────────────────────────────────────────────
   Métricas de alcance
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Cuánta gente vio una publicación de la página.
 *
 * ── Lo que Meta deja saber y lo que no ─────────────────────────────────────
 *
 * Sólo hay métricas reales para lo que se publica **por la API oficial**: la
 * Fan Page e Instagram. Del perfil personal y de los grupos no hay datos, y no
 * porque falte implementarlo: Meta no los expone. Cualquier número que
 * mostráramos ahí sería inventado.
 *
 * Tres límites que impone Meta y conviene saber antes de mirar la pantalla:
 *
 *   - **Sólo hay Insights en páginas con 100 o más "me gusta".** Con menos, la
 *     API devuelve vacío y no es un error nuestro.
 *   - Los números se actualizan una vez por día, no en vivo.
 *   - En junio de 2026 Meta dio de baja varias métricas de página. Por eso acá
 *     se piden las de **posteo**, que siguen documentadas, y un "métrica
 *     inválida" se trata como "no disponible" en vez de como una falla.
 *
 * Permisos: `read_insights` y `pages_read_engagement`.
 */
async function alcanceDePosteo({ postId, token }) {
  try {
    const datos = await pedir(`${postId}/insights`, {
      token,
      parametros: { metric: 'post_impressions_unique,post_clicks' },
    });

    const leer = (nombre) =>
      Number(datos.data?.find((m) => m.name === nombre)?.values?.[0]?.value || 0);

    return {
      disponible: true,
      personasQueLoVieron: leer('post_impressions_unique'),
      clics: leer('post_clicks'),
    };
  } catch (error) {
    /*
      Una métrica dada de baja, una página chica o falta de permiso de lectura
      no son fallas de la publicación: la publicación salió igual. Se informa
      que no hay datos y se sigue.
    */
    return {
      disponible: false,
      motivo:
        error.codigo === 'SIN_PERMISOS'
          ? 'Falta el permiso read_insights para ver el alcance.'
          : 'Meta no devolvió métricas para esta publicación.',
    };
  }
}

/**
 * Por qué un destino no tiene métricas.
 *
 * Se dice explícitamente en vez de mostrar un cero. Un cero significa "nadie
 * lo vio"; esto significa "no se puede saber", y son cosas muy distintas para
 * quien está decidiendo dónde publicar.
 */
function porQueNoHayMetricas(tipoDeDestino) {
  if (tipoDeDestino === 'facebook_group') {
    return 'Facebook no publica métricas de grupos. Ni siquiera para el dueño del grupo.';
  }
  if (tipoDeDestino === 'facebook_profile') {
    return 'Los perfiles personales no tienen métricas: son sólo para páginas y cuentas de empresa.';
  }
  return '';
}

module.exports = {
  alcanceDePosteo,
  porQueNoHayMetricas,
  publicarEnPagina,
  publicarReelEnPagina,
  publicarHistoriaEnPagina,
  publicarEnInstagram,
  publicarFormatoEnInstagram,
  comentarEnInstagram,
  esperarContenedor,
  esperarVideo,
  subirVideoPorUrl,
  LIMITES_REEL,
  LIMITES_HISTORIA,
  LIMITES_IG,
  FORMATOS_IG,
  limpiarSecretos,
  explicarError,
  ErrorDeMeta,
  PERMISOS,
  VERSION,
  pedir,
};
