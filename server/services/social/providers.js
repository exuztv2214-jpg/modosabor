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

/** Lo mínimo que tiene que tener cualquier publicación para salir. */
function validarContenidoBasico({ contenido }) {
  const errores = [];
  const texto = String(contenido?.texto || '').trim();
  const media = contenido?.media || [];

  if (!texto && !media.length) errores.push('No hay ni texto ni imágenes para publicar');
  if (texto.length > 60000) errores.push('El texto es demasiado largo');

  return { ok: errores.length === 0, errores };
}

/* ────────────────────────────────────────────────────────────────────────────
   Clase browser — lo que hace el Worker en la PC del local
   ──────────────────────────────────────────────────────────────────────────── */

const grupoPorNavegador = {
  clave: 'facebook_group_browser',
  nombre: 'Grupo de Facebook (Worker)',
  executionClass: 'browser',
  soporta: (destino) => destino.tipo === 'facebook_group',
  validar: validarContenidoBasico,
  publicar: NO_IMPLEMENTADO('facebook_group_browser'),
  salud: () => ({ estado: 'DEPENDE_DEL_WORKER', detalle: 'Lo informa el health check del Worker' }),
};

const perfilPorNavegador = {
  clave: 'facebook_profile_browser',
  nombre: 'Perfil de Facebook (Worker)',
  executionClass: 'browser',
  soporta: (destino) => destino.tipo === 'facebook_profile',
  validar: validarContenidoBasico,
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
  validar: validarContenidoBasico,
  publicar: async ({ contenido, identidad }) => {
    const { token, pageId } = credencialesDe(identidad);
    if (!token) throw faltaConfigurar(identidad, 'el token de acceso');
    if (!pageId) throw faltaConfigurar(identidad, 'el ID de la página');

    const foto = (contenido.media || []).find((m) => String(m.mime || '').startsWith('image/'));

    const resultado = await metaApi.publicarEnPagina({
      pageId,
      token,
      texto: contenido.texto,
      fotoUrl: foto ? urlPublicaDe(foto) : '',
      link: contenido.personalizaciones?.link || '',
    });

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
  validar: ({ contenido }) => {
    const base = validarContenidoBasico({ contenido });
    const errores = [...base.errores];

    const imagenes = (contenido.media || []).filter((m) =>
      String(m.mime || '').startsWith('image/')
    );

    if (!imagenes.length) {
      errores.push('Instagram no permite publicar sin imagen');
    } else if (!imagenes.some((m) => /jpe?g/i.test(m.mime))) {
      errores.push('Instagram sólo acepta JPEG: ni PNG ni WebP');
    }

    if (String(contenido.texto || '').length > 2200) {
      errores.push('El pie de Instagram no puede pasar de 2200 caracteres');
    }

    return { ok: errores.length === 0, errores };
  },
  publicar: async ({ contenido, identidad }) => {
    const { token, igId } = credencialesDe(identidad);
    if (!token) throw faltaConfigurar(identidad, 'el token de acceso');
    if (!igId) throw faltaConfigurar(identidad, 'el ID de la cuenta de Instagram');

    const imagen = (contenido.media || []).find((m) => /jpe?g/i.test(m.mime || ''));

    const resultado = await metaApi.publicarEnInstagram({
      igId,
      token,
      texto: contenido.texto,
      imagenUrl: urlPublicaDe(imagen),
    });

    return { estado: 'published', externalUrl: resultado.url, referencia: resultado.id };
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
  REGISTRO,
};
