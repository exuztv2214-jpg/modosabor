/**
 * Los providers: quién sabe publicar en cada tipo de destino.
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 *
 * Hoy todo se publica igual: el Worker abre Chrome en la PC del local y hace
 * clic. Mañana la Fan Page y Instagram van a publicar por la API oficial de
 * Meta, desde el servidor, sin navegador.
 *
 * Son dos formas de ejecutar completamente distintas, y si el resto del
 * sistema tuviera que saber cuál le toca a cada destino, ese `if` aparecería
 * en el compositor, en la cola, en el reintento, en las métricas y en la
 * pantalla. Cinco lugares para olvidarse de uno.
 *
 * Acá se decide una sola vez. El resto del sistema pregunta "¿quién publica
 * esto?" y recibe algo que siempre tiene la misma forma.
 *
 * ── El contrato ────────────────────────────────────────────────────────────
 *
 *   clave           string   Identificador estable, se guarda en la base.
 *   nombre          string   Para mostrar.
 *   executionClass  'browser' | 'api'
 *   soporta(destino)                    → bool
 *   validar({ destino, contenido })     → { ok, errores[] }
 *   publicar({ destino, contenido })    → { estado, externalUrl, referencia }
 *   salud({ identidad })                → { estado, detalle }
 *
 * `publicar` sólo lo llama el servidor, y sólo para la clase `api`. Los de
 * clase `browser` lo dejan sin implementar a propósito: si alguien lo llamara
 * por error, tiene que romperse fuerte y no publicar en silencio por un camino
 * que no existe.
 *
 * ── La regla que no se negocia ─────────────────────────────────────────────
 *
 * **La clase `browser` no crece nunca.** Perfil y grupos son los únicos dos
 * casos que no tienen un camino oficial. Todo lo que Meta permita hacer por
 * API se hace por API. Cada destino que se agregue al navegador es un riesgo
 * de bloqueo que se podría haber evitado.
 */

const metaApi = require('./metaApi');

const NO_IMPLEMENTADO = (clave) => () => {
  throw new Error(
    `El provider "${clave}" es de clase browser: lo publica el Worker, no el servidor.`
  );
};

/**
 * Qué formato acepta cada destino.
 *
 * ── Por qué está acá y no en la pantalla ───────────────────────────────────
 *
 * Es la misma tabla que hay que consultar en tres momentos: cuando el usuario
 * arma la campaña, cuando el servidor la encola y cuando la publica. Si viviera
 * en el compositor, el servidor aceptaría un reel para un grupo y fallaría
 * recién en Meta, con un error que no explica nada.
 *
 * ── De dónde salen los límites ─────────────────────────────────────────────
 *
 * De la documentación de Meta de agosto de 2026, no de suposiciones:
 *
 *   - La API oficial publica Reels e Historias en páginas. El Perfil personal
 *     los crea el Worker local sobre la sesión abierta de Facebook.
 *   - La API de grupos no existe más desde abril de 2024 y esos destinos sólo
 *     reciben un posteo común mediante el Worker.
 *   - **El carrusel es sólo de Instagram.** Facebook no tiene un equivalente
 *     por API.
 */
const FORMATOS_POR_DESTINO = {
  facebook_page: ['post', 'reel', 'historia'],
  instagram_feed: ['post', 'reel', 'historia', 'carrusel'],
  facebook_group: ['post'],
  facebook_profile: ['post', 'reel', 'historia'],
  ensayo: ['post', 'reel', 'historia', 'carrusel'],
};

const FORMATOS = ['post', 'reel', 'historia', 'carrusel'];

const NOMBRE_DE_FORMATO = {
  post: 'publicación',
  reel: 'reel',
  historia: 'historia',
  carrusel: 'carrusel',
};

/** Los formatos que este destino puede recibir. */
function formatosDe(destino) {
  return FORMATOS_POR_DESTINO[destino?.tipo] || ['post'];
}

/**
 * ¿Este destino puede recibir este formato?
 *
 * Devuelve el motivo en castellano, o cadena vacía si se puede. Se devuelve el
 * motivo y no un booleano porque quien pregunta casi siempre necesita
 * explicárselo a alguien.
 */
function porQueNoAceptaElFormato(destino, formato) {
  const pedido = String(formato || 'post');
  if (!FORMATOS.includes(pedido)) return `No existe el formato «${pedido}».`;

  const admitidos = formatosDe(destino);
  if (admitidos.includes(pedido)) return '';

  const nombre = NOMBRE_DE_FORMATO[pedido] || pedido;

  if (destino?.tipo === 'facebook_group') {
    return `Los grupos de Facebook sólo reciben publicaciones comunes: Meta cerró la API de grupos en abril de 2024, así que un ${nombre} no tiene por dónde salir.`;
  }
  if (pedido === 'carrusel') {
    return 'El carrusel existe sólo en Instagram.';
  }
  return `Este destino no acepta ${nombre}.`;
}

/** Lo mínimo que tiene que tener cualquier publicación para salir. */
function validarContenidoBasico({ contenido }) {
  const errores = [];
  const texto = String(contenido?.texto || '').trim();
  const media = contenido?.media || [];

  if (!texto && !media.length) errores.push('No hay ni texto ni imágenes para publicar');
  if (texto.length > 60000) errores.push('El texto es demasiado largo');

  return { ok: errores.length === 0, errores };
}

/**
 * Lo básico, más el formato.
 *
 * ── Por qué los destinos del Worker también lo validan ─────────────────────
 *
 * El Worker puede crear Reels e Historias en el Perfil, pero un grupo sólo
 * admite un posteo común. Si acá se dejara pasar un Reel para un grupo, el
 * formato, la campaña se encolaría, el Worker publicaría **un posteo normal** y
 * el sistema lo reportaría como éxito.
 *
 * O sea: pediste un reel, salió un posteo, y nadie te avisó. Ese es exactamente
 * el tipo de error que no se descubre hasta que alguien mira Facebook a mano.
 */
const validarConFormato = ({ contenido, destino }) => {
  const base = validarContenidoBasico({ contenido });
  const errores = [...base.errores];

  const motivo = porQueNoAceptaElFormato(destino, String(contenido?.formato || 'post'));
  if (motivo) errores.push(motivo);

  const formato = String(contenido?.formato || 'post');
  const media = contenido?.media || [];
  if (destino?.tipo === 'facebook_profile' && formato === 'reel') {
    if (!media.some((archivo) => String(archivo?.mime || '').startsWith('video/'))) {
      errores.push('Un reel del Perfil necesita un video.');
    }
  }
  if (destino?.tipo === 'facebook_profile' && formato === 'historia' && !media.length) {
    errores.push('Una historia del Perfil necesita una foto o un video.');
  }

  return { ok: errores.length === 0, errores };
};

/* ────────────────────────────────────────────────────────────────────────────
   Clase browser — lo que hace el Worker en la PC del local
   ──────────────────────────────────────────────────────────────────────────── */

const grupoPorNavegador = {
  clave: 'facebook_group_browser',
  nombre: 'Grupo de Facebook (Worker)',
  executionClass: 'browser',
  soporta: (destino) => destino.tipo === 'facebook_group',
  validar: validarConFormato,
  publicar: NO_IMPLEMENTADO('facebook_group_browser'),
  salud: () => ({ estado: 'DEPENDE_DEL_WORKER', detalle: 'Lo informa el health check del Worker' }),
};

const perfilPorNavegador = {
  clave: 'facebook_profile_browser',
  nombre: 'Perfil de Facebook (Worker)',
  executionClass: 'browser',
  soporta: (destino) => destino.tipo === 'facebook_profile',
  validar: validarConFormato,
  publicar: NO_IMPLEMENTADO('facebook_profile_browser'),
  salud: () => ({ estado: 'DEPENDE_DEL_WORKER', detalle: 'Lo informa el health check del Worker' }),
};

/* ────────────────────────────────────────────────────────────────────────────
   Clase api — lo que hace el servidor
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * El ensayo: recorre todo el camino y no publica nada.
 *
 * ── Por qué existe y por qué es un provider de verdad ──────────────────────
 *
 * Es la única forma honesta de probar la cola completa. Un ensayo hecho con un
 * `if (ensayo) return` metido en medio del motor probaría un camino que no es
 * el que se usa en producción, y justamente los bugs viven en lo que el `if`
 * se saltea.
 *
 * Siendo un provider más, el ensayo pasa por el mismo despachador, los mismos
 * frenos, el mismo cupo, el mismo dedupe y el mismo reporte. Lo único que
 * cambia es la última línea, la que hablaría con Meta.
 *
 * También es lo que hace testeable la Fase 5 antes de que exista un adaptador
 * real: el despachador del servidor se puede probar entero, hoy, sin tener un
 * token de Meta ni arriesgar una cuenta.
 */
const ensayo = {
  clave: 'ensayo',
  nombre: 'Ensayo (no publica)',
  executionClass: 'api',
  soporta: (destino) => destino.tipo === 'ensayo',
  validar: validarContenidoBasico,
  publicar: ({ destino, contenido }) => ({
    estado: 'published',
    externalUrl: '',
    referencia: `ensayo:${destino.id}`,
    /*
      Se devuelve lo que se habría mandado. Es todo el valor del ensayo: poder
      leer el texto final, con las personalizaciones ya aplicadas, antes de que
      lo lea alguien del grupo.
    */
    detalle: {
      ensayo: true,
      textoQueSeHabriaMandado: String(contenido?.texto || '').slice(0, 2000),
      cuantasImagenes: (contenido?.media || []).length,
    },
  }),
  salud: () => ({ estado: 'ACTIVE', detalle: 'El ensayo siempre está disponible' }),
};

/**
 * De dónde saca cada identidad su token.
 *
 * ── Por qué el token vive en la identidad y no en el destino ───────────────
 *
 * Una Fan Page tiene un token; sus destinos —el feed, las historias, los
 * reels— comparten ese token. Guardarlo en cada destino significaría tener la
 * misma llave copiada en cinco lugares y tener que acordarse de rotarlos todos
 * el día que venza.
 *
 * Se guarda cifrado en `social_accounts.metadata`. `metaApi.pedir` lo
 * desencripta en el último momento, justo antes de armar el pedido.
 */
function credencialesDe(identidad) {
  const metadata = identidad?.metadata || {};
  return {
    token: metadata.token || '',
    pageId: metadata.pageId || identidad?.clave || '',
    igId: metadata.igId || '',
  };
}

function faltaConfigurar(identidad, campo) {
  return new Error(
    `Falta configurar ${campo} de "${identidad?.nombre || 'esta identidad'}". ` +
      'Se carga una vez desde la pantalla de identidades.'
  );
}

const paginaPorApi = {
  clave: 'facebook_page_api',
  nombre: 'Fan Page (API oficial)',
  executionClass: 'api',
  soporta: (destino) => destino.tipo === 'facebook_page',
  validar: ({ contenido, destino }) => {
    const base = validarContenidoBasico({ contenido });
    const errores = [...base.errores];

    const formato = String(contenido?.formato || 'post');
    const motivo = porQueNoAceptaElFormato(destino || { tipo: 'facebook_page' }, formato);
    if (motivo) errores.push(motivo);

    if (formato === 'reel' && !primerVideo(contenido)) {
      errores.push('Un reel necesita un video: con una foto no se puede.');
    }

    return { ok: errores.length === 0, errores };
  },
  publicar: async ({ contenido, identidad }) => {
    const { token, pageId } = credencialesDe(identidad);
    if (!token) throw faltaConfigurar(identidad, 'el token de acceso');
    if (!pageId) throw faltaConfigurar(identidad, 'el ID de la página');

    const formato = String(contenido.formato || 'post');
    const foto = primerImagen(contenido);
    const video = primerVideo(contenido);

    /*
      Cada formato es un flujo distinto en Meta: el posteo es un pedido, el
      reel son tres y la historia depende de si es foto o video. El `switch`
      vive acá y no adentro de metaApi para que ese módulo siga siendo un
      traductor de la API y nada más.
    */
    let resultado;
    if (formato === 'reel') {
      resultado = await metaApi.publicarReelEnPagina({
        pageId,
        token,
        texto: contenido.texto,
        videoUrl: urlPublicaDe(video),
        duracionSegundos: Number(video?.duracion_segundos || 0),
      });
    } else if (formato === 'historia') {
      resultado = await metaApi.publicarHistoriaEnPagina({
        pageId,
        token,
        fotoUrl: video ? '' : urlPublicaDe(foto),
        videoUrl: video ? urlPublicaDe(video) : '',
        duracionSegundos: Number(video?.duracion_segundos || 0),
      });
    } else {
      resultado = await metaApi.publicarEnPagina({
        pageId,
        token,
        texto: contenido.texto,
        fotoUrl: foto ? urlPublicaDe(foto) : '',
        link: contenido.personalizaciones?.link || '',
      });
    }

    return { estado: 'published', externalUrl: resultado.url, referencia: resultado.id };
  },
  salud: async ({ identidad }) => {
    const { token, pageId } = credencialesDe(identidad);
    if (!token) return { estado: 'SIN_CONFIGURAR', detalle: 'Falta cargar el token' };
    try {
      const datos = await metaApi.pedir(pageId, { token, parametros: { fields: 'id,name' } });
      return { estado: 'ACTIVE', detalle: `Conectado a ${datos.name || pageId}` };
    } catch (error) {
      return { estado: error.codigo || 'ERROR', detalle: error.message };
    }
  },
};

const instagramPorApi = {
  clave: 'instagram_feed_api',
  nombre: 'Instagram (API oficial)',
  executionClass: 'api',
  soporta: (destino) => destino.tipo === 'instagram_feed',
  /**
   * Instagram valida más que los demás, y a propósito.
   *
   * Sus límites no son negociables: sin imagen no publica, y sólo acepta JPEG.
   * Comprobarlo acá —antes de encolar— es la diferencia entre avisar en el
   * momento de armar la campaña y que falle media hora después sin que nadie
   * entienda por qué.
   */
  validar: ({ contenido, destino }) => {
    const base = validarContenidoBasico({ contenido });
    const errores = [...base.errores];

    const formato = String(contenido?.formato || 'post');
    const motivo = porQueNoAceptaElFormato(destino || { tipo: 'instagram_feed' }, formato);
    if (motivo) errores.push(motivo);

    const media = contenido.media || [];
    const imagenes = media.filter((m) => String(m.mime || '').startsWith('image/'));
    const videos = media.filter((m) => String(m.mime || '').startsWith('video/'));

    if (formato === 'reel') {
      if (!videos.length) errores.push('Un reel de Instagram necesita un video.');
    } else if (formato === 'carrusel') {
      /*
        Meta cuenta el carrusel como una sola publicación para el tope diario,
        pero exige entre 2 y 10 piezas. Con una sola no es un carrusel: es un
        posteo, y conviene decirlo antes de encolar.
      */
      if (media.length < 2) errores.push('Un carrusel necesita al menos dos piezas.');
      if (media.length > metaApi.LIMITES_IG.piezasCarrusel) {
        errores.push(
          `Un carrusel admite hasta ${metaApi.LIMITES_IG.piezasCarrusel} piezas y hay ${media.length}.`
        );
      }
    } else if (!imagenes.length && !videos.length) {
      errores.push('Instagram no permite publicar sin imagen ni video');
    }

    /*
      El JPEG se exige sólo cuando hay imágenes en juego. Un reel es puro
      video: pedirle JPEG lo frenaría por una regla que no le corresponde.
    */
    if (imagenes.length && !imagenes.some((m) => /jpe?g/i.test(m.mime))) {
      errores.push('Instagram sólo acepta JPEG: ni PNG ni WebP');
    }

    /* Las historias no llevan pie, así que su largo no importa. */
    if (formato !== 'historia' && String(contenido.texto || '').length > 2200) {
      errores.push('El pie de Instagram no puede pasar de 2200 caracteres');
    }

    return { ok: errores.length === 0, errores };
  },
  publicar: async ({ contenido, identidad }) => {
    const { token, igId } = credencialesDe(identidad);
    if (!token) throw faltaConfigurar(identidad, 'el token de acceso');
    if (!igId) throw faltaConfigurar(identidad, 'el ID de la cuenta de Instagram');

    const formato = String(contenido.formato || 'post');
    const video = primerVideo(contenido);
    const imagen = primerImagen(contenido);

    const resultado = await metaApi.publicarFormatoEnInstagram({
      igId,
      token,
      formato,
      texto: contenido.texto,
      imagenUrl: imagen ? urlPublicaDe(imagen) : '',
      videoUrl: video ? urlPublicaDe(video) : '',
      piezas:
        formato === 'carrusel'
          ? (contenido.media || []).map((m) =>
              String(m.mime || '').startsWith('video/')
                ? { videoUrl: urlPublicaDe(m) }
                : { imagenUrl: urlPublicaDe(m) }
            )
          : [],
    });

    const primerComentario = String(
      contenido.personalizaciones?.primer_comentario_instagram || ''
    ).trim();
    let advertenciaComentario = '';

    if (primerComentario && formato !== 'historia') {
      try {
        await metaApi.comentarEnInstagram({
          mediaId: resultado.id,
          token,
          texto: primerComentario,
        });
      } catch (error) {
        /*
          El post ya salió. Marcarlo como fallido haría que un retry publique
          todo de nuevo sólo porque falló el comentario.
        */
        advertenciaComentario = `La publicación salió, pero no se pudo agregar el primer comentario: ${error.message}`;
      }
    }

    return {
      estado: 'published',
      externalUrl: resultado.url,
      referencia: resultado.id,
      detalle: advertenciaComentario ? { advertenciaComentario } : {},
    };
  },
  salud: async ({ identidad }) => {
    const { token, igId } = credencialesDe(identidad);
    if (!token) return { estado: 'SIN_CONFIGURAR', detalle: 'Falta cargar el token' };
    try {
      const datos = await metaApi.pedir(igId, { token, parametros: { fields: 'id,username' } });
      return { estado: 'ACTIVE', detalle: `Conectado a @${datos.username || igId}` };
    } catch (error) {
      return { estado: error.codigo || 'ERROR', detalle: error.message };
    }
  },
};

/**
 * La dirección pública de un archivo nuestro.
 *
 * Meta baja la imagen por su cuenta desde internet: no se la mandamos, le
 * pasamos un link y él va a buscarla. Así que tiene que ser una dirección
 * accesible desde afuera y con HTTPS, no una ruta del disco del servidor.
 *
 * Sin `PUBLIC_URL` configurado no hay forma de armarla, y es mejor que falle
 * con ese mensaje a que Meta rechace la publicación con un error suyo que no
 * explica nada.
 */
/*
  Elegir la media según su tipo, en un solo lugar.

  Antes esto estaba escrito con un `find` distinto en cada provider, y uno de
  ellos pedía JPEG donde otro pedía `image/`. Con reels y carruseles encima
  serían seis variantes de lo mismo.
*/
const primerImagen = (contenido) =>
  (contenido?.media || []).find((m) => String(m.mime || '').startsWith('image/'));

const primerVideo = (contenido) =>
  (contenido?.media || []).find((m) => String(m.mime || '').startsWith('video/'));

function urlPublicaDe(archivo) {
  if (!archivo) return '';
  const base = String(process.env.PUBLIC_API_URL || process.env.PUBLIC_URL || '').replace(
    /\/+$/,
    ''
  );
  if (!base) {
    throw new Error(
      'Falta configurar PUBLIC_API_URL: Meta necesita bajar la imagen desde una dirección pública.'
    );
  }
  /*
    Meta baja la imagen desde internet, no desde la red del local. Una
    dirección 192.168.x.x o localhost no le sirve, y el error que devuelve no
    explica nada. Mejor decirlo acá.
  */
  if (/localhost|127\.0\.0\.1|192\.168\.|10\.\d+\./.test(base)) {
    throw new Error(
      'PUBLIC_API_URL apunta a una dirección de tu red local. Meta baja las imágenes desde internet: para publicar con foto hace falta el dominio público.'
    );
  }
  const ruta = String(archivo.ruta || '').replace(/^\/+/, '');
  return `${base}/${ruta}`;
}

const REGISTRO = [grupoPorNavegador, perfilPorNavegador, paginaPorApi, instagramPorApi, ensayo];

/**
 * ¿Quién publica en este destino?
 *
 * Devuelve `null` si no hay nadie. El que llama tiene que decidir qué hacer
 * con eso — normalmente marcar el destino como fallido con un motivo claro,
 * porque un destino sin provider es un error de configuración, no algo que se
 * arregle reintentando.
 */
function resolverProvider(destino) {
  if (!destino) return null;

  /*
    Si el destino dice explícitamente con qué provider se publica, manda eso.
    Sirve para migrar la Fan Page a la API sin tocar el resto: se le cambia la
    clave al destino y ya.
  */
  if (destino.provider_clave) {
    return REGISTRO.find((p) => p.clave === destino.provider_clave) || null;
  }

  return REGISTRO.find((p) => p.soporta(destino)) || null;
}

/** La clase de ejecución de un destino: por dónde sale. */
function claseDeEjecucion(destino) {
  return resolverProvider(destino)?.executionClass || 'browser';
}

function listarProviders() {
  return REGISTRO.map(({ clave, nombre, executionClass }) => ({
    clave,
    nombre,
    executionClass,
  }));
}

module.exports = {
  resolverProvider,
  claseDeEjecucion,
  listarProviders,
  validarContenidoBasico,
  formatosDe,
  porQueNoAceptaElFormato,
  FORMATOS,
  FORMATOS_POR_DESTINO,
  NOMBRE_DE_FORMATO,
  REGISTRO,
};
