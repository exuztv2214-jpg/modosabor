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
  instagram: ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement'],
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
 * `url`, y devuelve `post_id` además de `id`.
 */
async function publicarEnPagina({ pageId, token, texto, link = '', fotoUrl = '' }) {
  if (fotoUrl) {
    const datos = await pedir(`${pageId}/photos`, {
      metodo: 'POST',
      token,
      parametros: { url: fotoUrl, caption: texto },
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
   Instagram
   ──────────────────────────────────────────────────────────────────────────── */

/* Se puede reemplazar en los tests para no esperar de verdad. */
const esperarUnPoco = (ms) => new Promise((listo) => setTimeout(listo, ms));

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
  publicarEnInstagram,
  esperarContenedor,
  limpiarSecretos,
  explicarError,
  ErrorDeMeta,
  PERMISOS,
  VERSION,
  pedir,
};
