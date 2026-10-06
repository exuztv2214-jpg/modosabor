const crypto = require('crypto');

const db = require('../db');
const { sqlFecha, desdeSql } = require('../utils/fechaLocal');
const { encriptar } = require('../utils/encryptConfig');
const { canDispatch, repartirPorDia, LIMITES } = require('./social/politicaEnvio');
const providers = require('./social/providers');
const { resolverProvider, claseDeEjecucion } = providers;
const { porQueNoHayMetricas } = require('./social/metaApi');
const { avatarDelDestino } = require('./social/avatares');
const { porQueFrenaElModoSeguro } = require('./social/modoSeguro');

const TARGET_STATES = new Set([
  'draft',
  'scheduled',
  'queued',
  'processing',
  'published',
  'requires_approval',
  'ambiguous',
  'failed',
  'cancelled',
  /*
    Estados neutros: no se publicó, pero tampoco falló nada.

    Existen para no mentir en el resumen. Un grupo bloqueado a mano o una
    publicación repetida no son errores —son decisiones—, y meterlos en
    `failed` haría que la campaña se viera rota y que el botón de "reintentar
    fallidos" volviera a intentar exactamente lo que se decidió no hacer.
  */
  'skipped_duplicate',
  'skipped_rule',
]);

/** Los que no cuentan ni como éxito ni como fracaso. */
const ESTADOS_NEUTROS = new Set(['skipped_duplicate', 'skipped_rule', 'cancelled']);
const DESTINATION_TYPES = new Set([
  'facebook_page',
  'facebook_profile',
  'facebook_group',
  'facebook_story',
  'facebook_reel',
  'instagram_feed',
  'instagram_story',
  'instagram_reel',
]);

function clean(value, max = 2000) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function json(value, fallback = {}) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}
function parse(value, fallback = {}) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}
function nowSql() {
  return sqlFecha();
}
function token() {
  return crypto.randomUUID();
}

function log({
  campanaId = null,
  targetId = null,
  destinoId = null,
  nivel = 'info',
  codigo = '',
  mensaje,
  detalle = {},
  screenshotRuta = '',
}) {
  db.prepare(
    `INSERT INTO social_publication_logs
      (campana_id, target_id, destino_id, nivel, codigo, mensaje, detalle, screenshot_ruta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    campanaId,
    targetId,
    destinoId,
    nivel,
    clean(codigo, 80),
    clean(mensaje, 1000),
    json(detalle),
    clean(screenshotRuta, 300)
  );
}

function mapDestination(row) {
  const metadata = row ? parse(row.metadata) : {};
  return (
    row && {
      ...row,
      habilitada: Boolean(row.habilitada),
      favorita: Boolean(row.favorita),
      metadata,
      permiteComercial: Number(row.permite_comercial ?? 1) === 1,
      bloqueadoManualmente: Number(row.bloqueado_manualmente || 0) === 1,
      frecuenciaMaximaHoras: row.frecuencia_maxima_horas ?? null,
      notas: row.notas || '',
      executionClass: row.execution_class || claseDeEjecucion(row),
      providerClave: row.provider_clave || '',
      /*
        La foto de perfil, si se pudo bajar alguna vez.

        Se calcula mirando el disco en vez de guardarse en una columna: así no
        hay forma de que la base diga que hay foto y el archivo no esté —que es
        exactamente lo que pasa después de restaurar un backup de la base sin
        los uploads—. Es un `existsSync` sobre una carpeta chica, no un
        problema de velocidad.
      */
      avatar: avatarDelDestino(row.id) || avatarRemotoSeguro(metadata?.avatarUrl),
    }
  );
}

function avatarRemotoSeguro(valor) {
  try {
    const url = new URL(String(valor || ''));
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' &&
      (host === 'facebook.com' || host.endsWith('.facebook.com') || host.endsWith('.fbcdn.net'))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
function mapCampaign(row) {
  return (
    row && {
      ...row,
      personalizaciones: parse(row.personalizaciones),
      total: Number(row.total || 0),
      publicados: Number(row.publicados || 0),
      fallidos: Number(row.fallidos || 0),
    }
  );
}

function listDestinations({ type = '', enabledOnly = false, cuentaId = null } = {}) {
  const conditions = [];
  const params = [];
  if (type) {
    conditions.push('d.tipo = ?');
    params.push(type);
  }
  /*
    Filtrar por identidad. Sin esto, la pantalla de Grupos mostraría mezclados
    los del Perfil y los de la Page, y no habría forma de saber cuál es cuál
    mirando la lista.
  */
  if (cuentaId) {
    conditions.push('d.cuenta_id = ?');
    params.push(Number(cuentaId));
  }
  if (enabledOnly) conditions.push('d.habilitada = 1');
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(
      `SELECT d.*, a.nombre AS cuenta_nombre, a.estado AS cuenta_estado
       FROM social_destinations d
       LEFT JOIN social_accounts a ON a.id = d.cuenta_id
       ${where}
       ORDER BY d.favorita DESC, d.nombre COLLATE NOCASE`
    )
    .all(...params)
    .map(mapDestination);
}

const PRUEBA_API_MAX_MS = 24 * 60 * 60 * 1000;

function estadoWorkerSocial(now = Date.now()) {
  const marker = db
    .prepare(
      "SELECT valor FROM configuracion WHERE clave = 'social_worker_linked_after_command_id'"
    )
    .get();
  if (!marker) {
    return {
      estado: 'sin_conectar',
      motivo: 'Vinculá esta PC para publicar desde el perfil o grupos.',
      comprobadoEn: null,
      accion: 'vincular',
    };
  }
  const worker = estadoRealDelWorker(
    db.prepare('SELECT * FROM social_workers ORDER BY ultimo_heartbeat_en DESC LIMIT 1').get(),
    now
  );
  if (!worker?.vivo || worker.estado !== 'online') {
    return {
      estado: 'sin_conectar',
      motivo: 'La extensión no está comunicándose con el servidor.',
      comprobadoEn: null,
      accion: 'vincular',
    };
  }
  const health = db
    .prepare(
      "SELECT id, estado, resultado, finalizado_en FROM social_worker_commands WHERE tipo = 'health_check' AND id > ? AND estado IN ('done','failed') ORDER BY id DESC LIMIT 1"
    )
    .get(Number(marker.valor) || 0);
  if (!health) {
    return {
      estado: 'comprobando',
      motivo: 'Falta comprobar la sesión de Facebook después de vincular esta PC.',
      comprobadoEn: null,
      accion: 'probar_worker',
    };
  }
  const comprobadoEn = health.finalizado_en || null;
  if (health.estado !== 'done' || parse(health.resultado)?.facebook_session !== 'ACTIVE') {
    return {
      estado: 'requiere_atencion',
      motivo: 'La sesión de Facebook necesita revisión.',
      comprobadoEn,
      accion: 'probar_worker',
    };
  }
  return { estado: 'lista', motivo: 'Extensión y sesión comprobadas.', comprobadoEn, accion: null };
}

function estadoDeDestinoSocial(destino, { now = Date.now() } = {}) {
  const row = destino?.id
    ? db.prepare('SELECT * FROM social_destinations WHERE id = ?').get(Number(destino.id))
    : destino;
  if (!row) {
    return {
      estado: 'sin_configurar',
      motivo: 'El destino ya no existe.',
      comprobadoEn: null,
      accion: 'destinos',
    };
  }
  if (!Number(row.habilitada)) {
    return {
      estado: 'en_pausa',
      motivo: 'El destino está deshabilitado.',
      comprobadoEn: null,
      accion: 'destinos',
    };
  }
  const cuenta = db.prepare('SELECT * FROM social_accounts WHERE id = ?').get(row.cuenta_id);
  if (!cuenta) {
    return {
      estado: 'sin_configurar',
      motivo: 'Falta la cuenta de este destino.',
      comprobadoEn: null,
      accion: 'destinos',
    };
  }
  if (Number(cuenta.pausada) || !Number(cuenta.habilitada)) {
    return {
      estado: 'en_pausa',
      motivo: 'La cuenta está pausada.',
      comprobadoEn: null,
      accion: 'identidades',
    };
  }
  if (
    ['facebook_profile', 'facebook_group'].includes(row.tipo) ||
    row.execution_class === 'browser'
  ) {
    return estadoWorkerSocial(now);
  }
  const canal = String(row.tipo).startsWith('instagram') ? 'instagram' : 'pagina';
  const meta = parse(cuenta.metadata);
  if (!meta.token || !(canal === 'instagram' ? meta.igId : meta.pageId)) {
    return {
      estado: 'sin_conectar',
      motivo: `Falta conectar ${canal === 'instagram' ? 'Instagram' : 'la Página de Facebook'}.`,
      comprobadoEn: null,
      accion: 'conectar',
    };
  }
  const check = meta.verificaciones?.[canal];
  const fecha = desdeSql(check?.en);
  const edad = fecha ? now - fecha.getTime() : Infinity;
  if (
    check?.estado !== 'ACTIVE' ||
    !Number.isFinite(edad) ||
    edad < 0 ||
    edad > PRUEBA_API_MAX_MS
  ) {
    return {
      estado: 'requiere_atencion',
      motivo: 'Comprobá las credenciales antes de publicar.',
      comprobadoEn: check?.en || null,
      accion: 'probar',
    };
  }
  return {
    estado: 'lista',
    motivo: 'Credenciales comprobadas.',
    comprobadoEn: check.en,
    accion: null,
  };
}

function estadoViasSocial({ now = Date.now() } = {}) {
  const destinos = db
    .prepare('SELECT id, tipo FROM social_destinations WHERE habilitada = 1')
    .all();
  const estadoCanal = (tipos, sinConfigurar) => {
    const encontrados = destinos.filter((d) => tipos.includes(d.tipo));
    if (!encontrados.length) return sinConfigurar;
    const estados = encontrados.map((d) => estadoDeDestinoSocial(d, { now }));
    return estados.find((e) => e.estado === 'lista') || estados[0];
  };
  const falta = (nombre) => ({
    estado: 'sin_configurar',
    motivo: `Todavía no hay destino de ${nombre}.`,
    comprobadoEn: null,
    accion: 'conectar',
  });
  const perfil = estadoWorkerSocial(now);
  const pausa = db
    .prepare("SELECT pausada FROM social_accounts WHERE identificador_externo = 'fb_perfil'")
    .get();
  return {
    pagina: estadoCanal(['facebook_page'], falta('Página de Facebook')),
    instagram: estadoCanal(['instagram_feed'], falta('Instagram')),
    perfilGrupos: Number(pausa?.pausada)
      ? {
          estado: 'en_pausa',
          motivo: 'La cuenta de perfil está pausada.',
          comprobadoEn: null,
          accion: 'identidades',
        }
      : perfil,
  };
}

/** Las identidades de publicación disponibles, ordenadas. */
function listIdentities(provider = null) {
  const where = provider ? 'WHERE provider = ?' : '';
  const params = provider ? [clean(provider, 40).toLowerCase()] : [];
  const fallosParaPausar = Number(getSocialConfig().fallosParaPausar || 5);
  return db
    .prepare(`SELECT * FROM social_accounts ${where} ORDER BY provider, id`)
    .all(...params)
    .map((fila) => {
      /*
        El token sale de la metadata antes de que la fila salga de acá.

        Estaba viajando al navegador cifrado, que no es una catástrofe pero
        tampoco tiene ningún sentido: nadie del otro lado lo necesita, y una
        llave que no viaja es una llave que no se puede interceptar. Lo
        encontró un test, no yo.
      */
      const metadataCompleta = parse(fila.metadata);
      const { token: _token, ...metadataSinToken } = metadataCompleta;

      const destinoConAvatar = db
        .prepare(
          `SELECT id FROM social_destinations
           WHERE cuenta_id = ? AND tipo IN ('facebook_page','facebook_profile','instagram_feed')
           ORDER BY CASE tipo WHEN 'facebook_page' THEN 1 WHEN 'facebook_profile' THEN 2 ELSE 3 END
           LIMIT 1`
        )
        .get(fila.id);

      const pausada = Number(fila.pausada) === 1;
      const fallosSeguidos = Number(fila.fallos_seguidos || 0);

      return {
        ...fila,
        metadata: metadataSinToken,
        avatar:
          avatarDelDestino(destinoConAvatar?.id) || avatarRemotoSeguro(metadataSinToken.avatarUrl),
        habilitada: Boolean(fila.habilitada),
        pausada,
        fallosSeguidos,
        /*
          La política también frena una identidad al llegar al tope de fallos,
          aunque la columna `pausada` siga en cero. Si esto no viaja explícito,
          el panel la pinta verde mientras el despachador la está rechazando.
        */
        frenadaAutomaticamente: !pausada && fallosSeguidos >= fallosParaPausar,
        fallosParaPausar,
        /*
          Si hay token, se dice que hay. **Nunca cuál es**: alcanza con saber
          si la identidad está conectada para poder mostrarlo en pantalla.
        */
        tieneToken: Boolean(parse(fila.metadata)?.token),
      };
    });
}

/**
 * Guarda las credenciales de Meta de una identidad.
 *
 * ── Cómo se trata el token ─────────────────────────────────────────────────
 *
 * Un token de página con permisos de publicación es, en la práctica, la llave
 * de la Fan Page: con eso se publica, se borra y se responde en su nombre.
 *
 * Por eso:
 *   - Se guarda cifrado con AES-256-GCM, igual que las claves de IA.
 *   - **No se devuelve nunca**, ni recortado. La pantalla sabe si hay token
 *     cargado o no, y nada más. Un token que viaja al navegador termina en la
 *     memoria del navegador, y de ahí en cualquier extensión que esté mirando.
 *   - Mandar el campo vacío no lo borra: significa "dejá el que está". Para
 *     borrarlo hay que pedirlo explícitamente.
 */
function guardarCredenciales(cuentaId, { token, pageId, igId, borrarToken = false } = {}) {
  const id = Number(cuentaId);
  const cuenta = db
    .prepare('SELECT id, nombre, metadata FROM social_accounts WHERE id = ?')
    .get(id);
  if (!cuenta) throw new Error('No existe esa identidad');

  const metadata = parse(cuenta.metadata);
  if (borrarToken || token || pageId !== undefined || igId !== undefined) {
    delete metadata.verificaciones;
  }

  if (borrarToken) {
    delete metadata.token;
  } else if (token) {
    const limpio = String(token).trim();
    /*
      Una validación mínima de forma, para avisar en el momento y no media
      hora después con un error de Meta que no explica nada. Los tokens de
      Meta son largos; cualquier cosa de veinte caracteres es un pegado a
      medias o el ID en vez del token.
    */
    if (limpio.length < 40) {
      throw new Error('Ese token parece incompleto. Copiá el token entero desde Meta.');
    }
    metadata.token = encriptar(limpio);
  }

  if (pageId !== undefined) metadata.pageId = clean(pageId, 60);
  if (igId !== undefined) metadata.igId = clean(igId, 60);

  db.prepare('UPDATE social_accounts SET metadata = ? WHERE id = ?').run(json(metadata), id);

  log({
    nivel: 'info',
    codigo: 'CREDENCIALES',
    mensaje: `Se actualizaron las credenciales de ${cuenta.nombre}`,
  });

  return estadoDeCredenciales(id);
}

/** Qué sabe la pantalla de las credenciales: si están, no cuáles son. */
function estadoDeCredenciales(cuentaId) {
  const cuenta = db
    .prepare('SELECT id, nombre, metadata FROM social_accounts WHERE id = ?')
    .get(Number(cuentaId));
  if (!cuenta) throw new Error('No existe esa identidad');

  const metadata = parse(cuenta.metadata);
  return {
    id: cuenta.id,
    nombre: cuenta.nombre,
    tieneToken: Boolean(metadata.token),
    pageId: metadata.pageId || '',
    igId: metadata.igId || '',
  };
}

/**
 * Prueba la conexión con Meta y dice qué pasó, en castellano.
 *
 * Se prueba contra la API de verdad y no se simula nada: el único momento en
 * que sirve enterarse de que el token no anda es antes de armar una campaña.
 */
async function probarCredenciales(cuentaId, tipo = 'pagina') {
  const cuenta = db
    .prepare(
      'SELECT id, nombre, identificador_externo AS clave, metadata FROM social_accounts WHERE id = ?'
    )
    .get(Number(cuentaId));
  if (!cuenta) throw new Error('No existe esa identidad');

  const identidad = { ...cuenta, metadata: parse(cuenta.metadata) };
  const provider = resolverProvider({
    tipo: tipo === 'instagram' ? 'instagram_feed' : 'facebook_page',
  });

  let resultado;
  try {
    resultado = await provider.salud({ identidad });
  } catch (error) {
    resultado = { estado: 'ERROR', detalle: error.message };
  }
  const canal = tipo === 'instagram' ? 'instagram' : 'pagina';
  const metadata = { ...identidad.metadata };
  metadata.verificaciones = {
    ...metadata.verificaciones,
    [canal]: { estado: resultado.estado, en: new Date().toISOString(), detalle: resultado.detalle },
  };
  db.prepare(
    'UPDATE social_accounts SET metadata = ?, ultimo_check_en = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(json(metadata), cuenta.id);
  log({
    nivel: resultado.estado === 'ACTIVE' ? 'info' : 'warn',
    codigo: `PRUEBA_${resultado.estado}`,
    mensaje: `${cuenta.nombre}: ${resultado.detalle}`,
  });
  return resultado;
}

/**
 * Alta o actualización de un destino, siempre atado a una identidad.
 *
 * ── Por qué `cuentaId` es obligatorio ──────────────────────────────────────
 *
 * Un grupo no es un destino por sí solo: es un destino *para una identidad*.
 * "Compra Venta Monteros como Perfil" y "Compra Venta Monteros como Fan Page"
 * son dos destinos distintos, con permisos y resultados distintos.
 *
 * Antes esta función no recibía la identidad y el `ON CONFLICT` sólo miraba
 * provider + tipo + id externo. Con eso, sincronizar los grupos de la Page
 * **pisaba** los del Perfil: quedaba una sola fila que cambiaba de dueño con
 * la última sincronización. La columna `cuenta_id` existía y quedaba siempre
 * en NULL.
 */
function createDestination({
  provider = 'facebook',
  cuentaId,
  tipo,
  nombre,
  url = '',
  identificadorExterno = '',
}) {
  const normalizedProvider = clean(provider, 40).toLowerCase();
  if (!['facebook', 'instagram'].includes(normalizedProvider)) throw new Error('Provider inválido');

  const identidad = Number(cuentaId);
  if (!Number.isFinite(identidad) || identidad <= 0) {
    throw new Error('Falta indicar con qué identidad se publica en este destino');
  }
  const cuenta = db.prepare('SELECT id, provider FROM social_accounts WHERE id = ?').get(identidad);
  if (!cuenta) throw new Error('No existe esa identidad de publicación');
  /*
    La identidad y el destino tienen que ser de la misma red. Un grupo de
    Facebook no se puede publicar con la identidad de Instagram, y dejar pasar
    esa combinación produciría un destino que nunca va a funcionar y que nadie
    entendería por qué falla.
  */
  if (cuenta.provider !== normalizedProvider) {
    throw new Error('La identidad no corresponde a esa red');
  }

  const normalizedType = clean(tipo, 60).toLowerCase();
  const normalizedName = clean(nombre, 200);
  if (!DESTINATION_TYPES.has(normalizedType) || !normalizedName) {
    throw new Error('Destino inválido');
  }
  if (!url && !identificadorExterno) throw new Error('Indicá la URL pública del destino');

  const externalId = clean(identificadorExterno || url, 500);

  /*
    ── Por dónde sale este destino ──────────────────────────────────────────

    Lo decide el registro de providers, no una lista de tipos escrita acá. Si
    mañana Instagram Stories pasa a tener API oficial, se agrega un provider y
    este alta empieza a marcarlo bien sin tocar esta función.

    Antes esta columna **nunca se escribía** y quedaba en `'browser'` por
    omisión. O sea que cargar el token de la Fan Page no servía de nada: el
    destino seguía yendo al Worker, que para la Page no tiene camino, y el
    despachador del servidor no lo miraba nunca. Toda la capa de API estaba
    construida y desconectada.
  */
  const clase = claseDeEjecucion({ tipo: normalizedType, provider: normalizedProvider });
  const providerClave =
    resolverProvider({ tipo: normalizedType, provider: normalizedProvider })?.clave || '';

  db.prepare(
    `INSERT INTO social_destinations
       (cuenta_id, provider, tipo, nombre, identificador_externo, url, habilitada, ultimo_estado,
        execution_class, provider_clave)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'pendiente', ?, ?)
     ON CONFLICT(provider, cuenta_id, tipo, identificador_externo) DO UPDATE SET
       nombre = excluded.nombre,
       url = excluded.url,
       habilitada = 1,
       execution_class = excluded.execution_class,
       provider_clave = excluded.provider_clave,
       actualizado_en = CURRENT_TIMESTAMP`
  ).run(
    identidad,
    normalizedProvider,
    normalizedType,
    normalizedName,
    externalId,
    clean(url, 1000),
    clase,
    providerClave
  );

  return db
    .prepare(
      `SELECT * FROM social_destinations
        WHERE provider = ? AND cuenta_id = ? AND tipo = ? AND identificador_externo = ?`
    )
    .get(normalizedProvider, identidad, normalizedType, externalId);
}

/**
 * Edita un destino, incluidas las reglas del grupo.
 *
 * ── Las reglas las carga una persona, no el sistema ────────────────────────
 *
 * Nadie puede leer automáticamente las reglas de un grupo de Facebook: están
 * escritas en prosa, en la descripción, y cada administrador las redacta como
 * quiere. Intentar adivinarlas sería peor que no tenerlas, porque daría una
 * falsa sensación de que el sistema las está respetando.
 *
 * Así que se cargan a mano, una vez, y el sistema las respeta siempre.
 */
function updateDestination(
  id,
  {
    nombre,
    url,
    habilitada,
    favorita,
    permiteComercial,
    bloqueadoManualmente,
    frecuenciaMaximaHoras,
    notas,
  } = {}
) {
  const current = db.prepare('SELECT * FROM social_destinations WHERE id = ?').get(id);
  if (!current) throw new Error('No existe el destino');
  const nextName = nombre === undefined ? current.nombre : clean(nombre, 200);
  if (!nextName) throw new Error('El destino necesita un nombre');
  const nextUrl = url === undefined ? current.url : clean(url, 1000);

  /*
    Un tope propio de horas para este grupo. `null` significa "usá el general".
    Se acota entre una hora y un mes: por debajo de una hora no es un tope y
    por encima de un mes conviene deshabilitar el grupo directamente.
  */
  let frecuencia = current.frecuencia_maxima_horas;
  if (frecuenciaMaximaHoras !== undefined) {
    const n = Number(frecuenciaMaximaHoras);
    frecuencia = Number.isFinite(n) && n > 0 ? Math.min(Math.max(Math.round(n), 1), 720) : null;
  }

  db.prepare(
    `UPDATE social_destinations
     SET nombre = ?, url = ?, habilitada = ?, favorita = ?,
         permite_comercial = ?, bloqueado_manualmente = ?, frecuencia_maxima_horas = ?, notas = ?,
         actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    nextName,
    nextUrl,
    habilitada === undefined ? current.habilitada : habilitada ? 1 : 0,
    favorita === undefined ? current.favorita : favorita ? 1 : 0,
    permiteComercial === undefined ? (current.permite_comercial ?? 1) : permiteComercial ? 1 : 0,
    bloqueadoManualmente === undefined
      ? current.bloqueado_manualmente || 0
      : bloqueadoManualmente
        ? 1
        : 0,
    frecuencia,
    notas === undefined ? current.notas || '' : clean(notas, 500),
    id
  );
  return mapDestination(db.prepare('SELECT * FROM social_destinations WHERE id = ?').get(id));
}

function updateDestinationsBulk(ids = [], { habilitada } = {}) {
  const unicos = [
    ...new Set((ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  ];
  if (!unicos.length) throw new Error('Elegí al menos un grupo');
  if (unicos.length > 300) throw new Error('Demasiados grupos en una sola operación');
  if (typeof habilitada !== 'boolean') throw new Error('Indicá si los grupos quedan seleccionados');

  const placeholders = unicos.map(() => '?').join(',');
  return db.transaction(() => {
    const encontrados = db
      .prepare(
        `SELECT id FROM social_destinations
         WHERE tipo = 'facebook_group' AND id IN (${placeholders})`
      )
      .all(...unicos);
    if (encontrados.length !== unicos.length) {
      throw new Error('Uno de los destinos no es un grupo de Facebook');
    }
    db.prepare(
      `UPDATE social_destinations
       SET habilitada = ?, actualizado_en = CURRENT_TIMESTAMP
       WHERE id IN (${placeholders})`
    ).run(habilitada ? 1 : 0, ...unicos);
    return { actualizados: unicos.length, habilitada };
  })();
}

function deleteDestination(id) {
  const current = db.prepare('SELECT id FROM social_destinations WHERE id = ?').get(id);
  if (!current) throw new Error('No existe el destino');
  const uses = db
    .prepare('SELECT COUNT(*) AS total FROM social_post_targets WHERE destino_id = ?')
    .get(id).total;
  if (uses) throw new Error('El destino ya tiene publicaciones; pausalo en lugar de eliminarlo');
  db.prepare('DELETE FROM social_destinations WHERE id = ?').run(id);
  return { id: Number(id), eliminado: true };
}

function mapTemplate(row) {
  return (
    row && {
      ...row,
      activa: Boolean(row.activa),
      destinos_sugeridos: parse(row.destinos_sugeridos, []),
      conjuntos_sugeridos: parse(row.conjuntos_sugeridos, []),
    }
  );
}

function listTemplates() {
  return db
    .prepare('SELECT * FROM social_templates WHERE activa = 1 ORDER BY nombre COLLATE NOCASE')
    .all()
    .map(mapTemplate);
}

function createTemplate({
  nombre,
  texto = '',
  tipo = 'post',
  destinos_sugeridos: destinosSugeridos = [],
  conjuntos_sugeridos: conjuntosSugeridos = [],
  horario_sugerido: horarioSugerido = '',
  media_id: mediaId = null,
} = {}) {
  const name = clean(nombre, 120);
  if (!name) throw new Error('La plantilla necesita un nombre');
  const result = db
    .prepare(
      `INSERT INTO social_templates
       (nombre, texto, tipo, destinos_sugeridos, conjuntos_sugeridos, horario_sugerido, media_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      String(texto || '')
        .trim()
        .slice(0, 8000),
      clean(tipo, 40) || 'post',
      json([...new Set((destinosSugeridos || []).map(Number).filter(Boolean))]),
      json([...new Set((conjuntosSugeridos || []).map(Number).filter(Boolean))]),
      clean(horarioSugerido, 40),
      mediaId ? Number(mediaId) : null
    );
  return mapTemplate(
    db.prepare('SELECT * FROM social_templates WHERE id = ?').get(result.lastInsertRowid)
  );
}

function updateTemplate(id, input = {}) {
  const current = db.prepare('SELECT * FROM social_templates WHERE id = ?').get(id);
  if (!current) throw new Error('No existe la plantilla');
  const nextName = input.nombre === undefined ? current.nombre : clean(input.nombre, 120);
  if (!nextName) throw new Error('La plantilla necesita un nombre');
  db.prepare(
    `UPDATE social_templates SET nombre = ?, texto = ?, tipo = ?, destinos_sugeridos = ?,
     conjuntos_sugeridos = ?, horario_sugerido = ?, media_id = ?, activa = ?, actualizado_en = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    nextName,
    input.texto === undefined
      ? current.texto
      : String(input.texto || '')
          .trim()
          .slice(0, 8000),
    input.tipo === undefined ? current.tipo : clean(input.tipo, 40) || 'post',
    input.destinos_sugeridos === undefined
      ? current.destinos_sugeridos
      : json([...new Set((input.destinos_sugeridos || []).map(Number).filter(Boolean))]),
    input.conjuntos_sugeridos === undefined
      ? current.conjuntos_sugeridos
      : json([...new Set((input.conjuntos_sugeridos || []).map(Number).filter(Boolean))]),
    input.horario_sugerido === undefined
      ? current.horario_sugerido
      : clean(input.horario_sugerido, 40),
    input.media_id === undefined
      ? current.media_id
      : input.media_id
        ? Number(input.media_id)
        : null,
    input.activa === undefined ? current.activa : input.activa ? 1 : 0,
    id
  );
  return mapTemplate(db.prepare('SELECT * FROM social_templates WHERE id = ?').get(id));
}

function deleteTemplate(id) {
  const result = db.prepare('DELETE FROM social_templates WHERE id = ?').run(id);
  if (!result.changes) throw new Error('No existe la plantilla');
  return { id: Number(id), eliminado: true };
}

function listSets() {
  return db
    .prepare(
      `SELECT s.*, COUNT(i.destino_id) AS total
       FROM social_destination_sets s
       LEFT JOIN social_destination_set_items i ON i.conjunto_id = s.id
       GROUP BY s.id ORDER BY s.nombre COLLATE NOCASE`
    )
    .all()
    .map((set) => ({ ...set, total: Number(set.total), destinos: listSetDestinations(set.id) }));
}
function listSetDestinations(setId) {
  return db
    .prepare(
      `SELECT d.* FROM social_destination_set_items i
      JOIN social_destinations d ON d.id = i.destino_id
      WHERE i.conjunto_id = ? ORDER BY d.nombre COLLATE NOCASE`
    )
    .all(setId)
    .map(mapDestination);
}

function createSet({ nombre, descripcion = '', destinoIds = [] }) {
  const name = clean(nombre, 100);
  if (!name) throw new Error('El conjunto necesita un nombre');
  const ids = [...new Set((destinoIds || []).map(Number).filter(Boolean))];
  const result = db
    .prepare('INSERT INTO social_destination_sets (nombre, descripcion) VALUES (?, ?)')
    .run(name, clean(descripcion, 500));
  const insert = db.prepare(
    'INSERT OR IGNORE INTO social_destination_set_items (conjunto_id, destino_id) VALUES (?, ?)'
  );
  db.transaction(() => ids.forEach((id) => insert.run(result.lastInsertRowid, id)))();
  return listSets().find((set) => Number(set.id) === Number(result.lastInsertRowid));
}

function destinationIds({ destinoIds = [], conjuntoIds = [] }) {
  const direct = (destinoIds || []).map(Number).filter(Boolean);
  const sets = (conjuntoIds || []).map(Number).filter(Boolean);
  if (!sets.length) return [...new Set(direct)];
  const placeholders = sets.map(() => '?').join(',');
  const fromSets = db
    .prepare(
      `SELECT destino_id FROM social_destination_set_items WHERE conjunto_id IN (${placeholders})`
    )
    .all(...sets)
    .map((row) => Number(row.destino_id));
  return [...new Set([...direct, ...fromSets])];
}

function createCampaign({
  nombre,
  texto,
  personalizaciones = {},
  mediaIds = [],
  destinoIds = [],
  conjuntoIds = [],
  programadaPara = '',
  usuarioId = null,
  ensayo = false,
  formato = 'post',
  formatos = {},
}) {
  const name = clean(nombre, 160);
  const textosPorRed = {};
  for (const red of ['facebook', 'instagram']) {
    const valor = personalizaciones?.textos_por_red?.[red];
    if (typeof valor === 'string') textosPorRed[red] = valor.trim().slice(0, 8000);
  }
  const ajustes = {
    ...personalizaciones,
    editar_por_red: Boolean(personalizaciones?.editar_por_red),
    textos_por_red: textosPorRed,
  };
  const content = String(
    texto || (ajustes.editar_por_red ? Object.values(textosPorRed).find(Boolean) : '') || ''
  )
    .trim()
    .slice(0, 8000);
  if (!name) throw new Error('La publicación necesita un nombre interno');
  if (!content && !(mediaIds || []).length) {
    throw new Error('Escribí un texto o adjuntá multimedia');
  }

  /*
    El formato se valida acá, contra la lista real, y no más adelante.

    Un formato inventado guardado en la base es una bomba de tiempo: la campaña
    se crea sin quejarse, se encola sin quejarse, y explota recién cuando le
    toca salir — probablemente de madrugada, con una autolista, sin nadie
    mirando.
  */
  const formatoElegido = String(formato || 'post').toLowerCase();
  if (!providers.FORMATOS.includes(formatoElegido)) {
    throw new Error(
      `No existe el formato «${formato}». Los que hay: ${providers.FORMATOS.join(', ')}.`
    );
  }

  /*
    El formato por red, validado uno por uno.

    Se acota a las redes que conocemos en vez de guardar lo que venga: una
    clave inventada —"tiktok", un error de tipeo— quedaría en la base sin que
    nadie la mire, y el día que exista TikTok de verdad estaría ahí con un
    valor puesto por accidente hace meses.
  */
  const formatosElegidos = {};
  for (const [clave, valor] of Object.entries(formatos || {})) {
    /*
      Las campañas nuevas guardan `cuentaId|red`, porque Perfil y Fan Page son
      dos cuentas de Facebook y pueden llevar formatos distintos. Las claves
      históricas `facebook` e `instagram` siguen admitidas para no romper
      borradores ni campañas anteriores.
    */
    const esRedHistorica = ['facebook', 'instagram'].includes(clave);
    const esCuenta = /^\d+\|(facebook|instagram)$/.test(clave);
    if (!esRedHistorica && !esCuenta) continue;

    const limpio = String(valor || '').toLowerCase();
    if (!providers.FORMATOS.includes(limpio)) {
      throw new Error(`No existe el formato «${valor}» que elegiste para ${clave}.`);
    }
    formatosElegidos[clave] = limpio;
  }

  const ids = destinationIds({ destinoIds, conjuntoIds });
  const scheduledAt = programadaPara ? new Date(programadaPara) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    throw new Error('La fecha programada no es válida');
  }
  const state = scheduledAt && ajustes.auto_publicar !== false ? 'scheduled' : 'draft';
  /*
    El modo de prueba viejo obliga a elegir un solo destino: es un seguro para
    no mandar una tanda sin querer. El ensayo es otra cosa —recorre todo y no
    publica nada—, así que no necesita ese límite: probar con un solo grupo
    justamente no probaría el reparto ni el cupo, que es lo que uno quiere ver.
  */
  const frena = porQueFrenaElModoSeguro({
    modoSeguro: Boolean(ajustes.modo_prueba),
    ensayo,
    cantidadConjuntos: (conjuntoIds || []).length,
    cantidadDestinos: ids.length,
  });
  if (frena) throw new Error(frena);
  if (!ids.length && state !== 'draft') throw new Error('Elegí al menos un destino para programar');
  const destinations = ids.length
    ? db
        .prepare(
          `SELECT id FROM social_destinations WHERE habilitada = 1 AND id IN (${ids.map(() => '?').join(',')})`
        )
        .all(...ids)
    : [];
  if (ids.length && destinations.length !== ids.length) {
    throw new Error('Uno de los destinos elegidos no está habilitado');
  }
  if (state === 'scheduled' && !ensayo) {
    for (const destination of destinations) {
      const conexion = estadoDeDestinoSocial(destination);
      if (conexion.estado !== 'lista') throw new Error(conexion.motivo);
    }
  }
  const result = db
    .prepare(
      `INSERT INTO social_campaigns (nombre, texto, personalizaciones, estado, programada_para, creado_por, ensayo, formato, formatos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      content,
      json(ajustes),
      state,
      scheduledAt ? sqlFecha(scheduledAt) : null,
      usuarioId,
      ensayo ? 1 : 0,
      formatoElegido,
      json(formatosElegidos)
    );
  const campaignId = Number(result.lastInsertRowid);
  const insertTarget = db.prepare(
    `INSERT INTO social_post_targets (campana_id, destino_id, estado, programada_para)
     VALUES (?, ?, ?, ?)`
  );
  const insertMedia = db.prepare(
    'INSERT OR IGNORE INTO social_campaign_media (campana_id, media_id, orden) VALUES (?, ?, ?)'
  );
  db.transaction(() => {
    destinations.forEach((destination) =>
      insertTarget.run(
        campaignId,
        destination.id,
        state,
        scheduledAt ? sqlFecha(scheduledAt) : null
      )
    );
    [...new Set((mediaIds || []).map(Number).filter(Boolean))].forEach((mediaId, index) =>
      insertMedia.run(campaignId, mediaId, index)
    );
  })();
  log({
    campanaId: campaignId,
    mensaje: state === 'scheduled' ? 'Campaña programada' : 'Borrador creado',
  });
  return getCampaign(campaignId);
}

function getCampaign(id) {
  const campaign = db
    .prepare(
      `SELECT c.*, COUNT(t.id) AS total,
      SUM(CASE WHEN t.estado IN ('published', 'requires_approval') THEN 1 ELSE 0 END) AS publicados,
      SUM(CASE WHEN t.estado = 'failed' THEN 1 ELSE 0 END) AS fallidos
     FROM social_campaigns c LEFT JOIN social_post_targets t ON t.campana_id = c.id
     WHERE c.id = ? GROUP BY c.id`
    )
    .get(id);
  if (!campaign) return null;
  return {
    ...mapCampaign(campaign),
    targets: db
      .prepare(
        `SELECT t.*, d.nombre AS destino_nombre, d.tipo AS destino_tipo, d.provider, d.metadata AS destino_metadata
       FROM social_post_targets t JOIN social_destinations d ON d.id = t.destino_id
       WHERE t.campana_id = ? ORDER BY d.nombre COLLATE NOCASE`
      )
      .all(id)
      .map((target) => ({ ...target, destino_metadata: parse(target.destino_metadata) })),
    media: db
      .prepare(
        `SELECT m.* FROM social_campaign_media cm JOIN social_media m ON m.id = cm.media_id
       WHERE cm.campana_id = ? ORDER BY cm.orden, m.id`
      )
      .all(id),
  };
}

function listCampaigns(limit = 100) {
  return db
    .prepare(
      `SELECT c.*, COUNT(t.id) AS total,
      SUM(CASE WHEN t.estado IN ('published', 'requires_approval') THEN 1 ELSE 0 END) AS publicados,
      SUM(CASE WHEN t.estado = 'failed' THEN 1 ELSE 0 END) AS fallidos
     FROM social_campaigns c LEFT JOIN social_post_targets t ON t.campana_id = c.id
     GROUP BY c.id ORDER BY COALESCE(c.programada_para, c.creado_en) DESC LIMIT ?`
    )
    .all(Math.min(Math.max(Number(limit) || 50, 1), 200))
    .map(mapCampaign);
}

/**
 * Devolver a la vida una campaña cancelada.
 *
 * ── Por qué existe la papelera ─────────────────────────────────────────────
 *
 * Cancelar es la única acción del módulo que se siente definitiva, y por eso
 * es la que da miedo apretar. Con una papelera, cancelar deja de ser una
 * decisión que hay que pensar dos veces: si te equivocaste, la traés de vuelta.
 *
 * Vuelve como **borrador**, no encolada. Recuperar y publicar son dos
 * decisiones distintas, y juntarlas haría que un clic de arrepentimiento
 * termine en treinta grupos.
 */
function restaurarCampana(id) {
  const campana = db
    .prepare("SELECT id, nombre FROM social_campaigns WHERE id = ? AND estado = 'cancelled'")
    .get(Number(id));
  if (!campana) throw new Error('Esa campaña no está en la papelera');

  db.transaction(() => {
    db.prepare(
      "UPDATE social_campaigns SET estado = 'draft', finalizada_en = NULL, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(campana.id);

    /*
      Los destinos vuelven a borrador **sólo si se cancelaron con la campaña**.
      Los que ya se habían publicado antes de cancelar se quedan publicados: eso
      pasó de verdad y el historial no se reescribe.
    */
    db.prepare(
      "UPDATE social_post_targets SET estado = 'draft', ultimo_error = '', actualizado_en = CURRENT_TIMESTAMP WHERE campana_id = ? AND estado = 'cancelled'"
    ).run(campana.id);
  })();

  log({
    campanaId: campana.id,
    mensaje: `«${campana.nombre}» volvió de la papelera como borrador`,
  });
  return getCampaign(campana.id);
}

/** Lo que está en la papelera, para poder recuperarlo. */
function listarPapelera(limite = 50) {
  return db
    .prepare(
      `SELECT c.*, COUNT(t.id) AS total,
              SUM(CASE WHEN t.estado IN ('published','requires_approval') THEN 1 ELSE 0 END) AS publicados,
              0 AS fallidos
         FROM social_campaigns c
         LEFT JOIN social_post_targets t ON t.campana_id = c.id
        WHERE c.estado = 'cancelled'
        GROUP BY c.id
        ORDER BY c.actualizado_en DESC
        LIMIT ?`
    )
    .all(Math.min(Math.max(Number(limite) || 50, 1), 200))
    .map(mapCampaign);
}

/**
 * La huella del contenido de una campaña.
 *
 * ── Qué cuenta como "la misma publicación" ─────────────────────────────────
 *
 * El texto normalizado más las imágenes adjuntas. Nada más.
 *
 * Se normalizan los espacios y se pasa a minúsculas porque a un lector del
 * grupo no le cambia nada que hayas corregido una mayúscula o sacado un
 * espacio de más: para él es el mismo mensaje otra vez.
 *
 * No entra la fecha ni el nombre de la campaña: dos campañas distintas con el
 * mismo texto son, para el grupo, la misma publicación repetida.
 *
 * Sí entran las imágenes: el mismo texto con la foto del menú de hoy no es una
 * repetición, es la publicación de hoy.
 */
function huellaDeCampana(campaign) {
  const texto = String(campaign.texto || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const media = db
    .prepare('SELECT media_id FROM social_campaign_media WHERE campana_id = ? ORDER BY media_id')
    .all(campaign.id)
    .map((fila) => fila.media_id)
    .join(',');

  return crypto.createHash('sha256').update(`${texto}|${media}`).digest('hex').slice(0, 32);
}

/**
 * ¿Hay que apartar este destino? Devuelve el estado y el motivo, o null.
 *
 * Las reglas van de la más terminante a la más circunstancial, igual que en
 * `canDispatch`: si un grupo está bloqueado a mano, no importa si además sería
 * repetido.
 */
function motivoParaSaltear(destino, campaign, huella, config) {
  if (Number(destino.bloqueado_manualmente) === 1) {
    return {
      estado: 'skipped_rule',
      motivo: 'Grupo bloqueado a mano. Se salteó sin intentar.',
    };
  }

  /*
    Una campaña es comercial salvo que se diga lo contrario. Es el criterio
    prudente: equivocarse hacia "no publiqué en un grupo donde podía" cuesta
    una publicación; equivocarse al revés cuesta el grupo.
  */
  const esComercial = campaign.personalizaciones?.comercial !== false;
  if (esComercial && Number(destino.permite_comercial) === 0) {
    return {
      estado: 'skipped_rule',
      motivo: 'Este grupo no permite contenido comercial.',
    };
  }

  /*
    `??` y no `||`: la ventana en cero significa "no controles repetidos", y con
    `||` ese cero se caía al valor por omisión de siete días. O sea que apagar
    el control no lo apagaba.
  */
  const dias = Number(config.ventanaDedupeDias ?? LIMITES.ventanaDedupeDias);
  if (dias <= 0) return null;
  const repetida = db
    .prepare(
      `SELECT finalizado_en FROM social_post_targets
        WHERE destino_id = ? AND contenido_hash = ? AND contenido_hash <> ''
          AND estado IN ('published', 'requires_approval')
          AND finalizado_en >= datetime('now', ?)
        ORDER BY finalizado_en DESC LIMIT 1`
    )
    .get(destino.destino_id, huella, `-${dias} days`);

  if (repetida) {
    return {
      estado: 'skipped_duplicate',
      motivo: `Ya se publicó esto mismo en este grupo dentro de los últimos ${dias} días.`,
    };
  }

  return null;
}

function queueCampaign(id, { now = false } = {}) {
  const campaign = getCampaign(id);
  if (!campaign) throw new Error('No existe la campaña');
  if (campaign.estado === 'cancelled') throw new Error('La campaña fue cancelada');
  const when = now ? nowSql() : campaign.programada_para || nowSql();

  /*
    ── El excedente no es un error ──────────────────────────────────────────

    Si se eligen 35 grupos y el cupo diario es 25, los 10 que sobran **no
    fallan**: quedan programados para mañana.

    Marcarlos como fallidos sería mentir —no falló nada— y encima obligaría a
    rearmar la campaña a mano. Encolarlos todos para hoy sería peor: el motor
    los frenaría de a uno con "cupo agotado" y la pantalla mostraría diez
    errores donde no hay ninguno.

    El reparto se calcula acá, al encolar, para poder decirle a la persona en
    ese momento —y no media hora después— que su campaña va a tardar dos días.
  */
  const candidatos = db
    .prepare(
      `SELECT t.id, t.destino_id, d.cuenta_id, d.nombre AS destino_nombre,
              d.permite_comercial, d.bloqueado_manualmente, d.habilitada
         FROM social_post_targets t
         JOIN social_destinations d ON d.id = t.destino_id
        WHERE t.campana_id = ? AND t.estado IN ('draft', 'scheduled', 'failed')
        ORDER BY t.id`
    )
    .all(id);
  if (!candidatos.length) throw new Error('La campaña no tiene destinos para publicar');

  const config = getSocialConfig();
  const huella = huellaDeCampana(campaign);
  const descartados = [];

  /*
    ── Los que no se van a publicar ─────────────────────────────────────────

    Se apartan **antes** de repartir por día. Si no, ocuparían cupo: un grupo
    bloqueado a mano se llevaría uno de los 25 lugares del día y desplazaría a
    otro que sí se podía publicar.

    Van a un estado propio, `skipped_rule` o `skipped_duplicate`, y no a
    `failed`. La diferencia importa: `failed` invita a reintentar y ensucia el
    resumen con errores que no existen. Estos no fallaron — se decidió no
    mandarlos, y el motivo está escrito al lado.
  */
  const pendientes = [];
  for (const candidato of candidatos) {
    const motivo = motivoParaSaltear(candidato, campaign, huella, config);
    if (motivo) {
      descartados.push({ ...candidato, ...motivo });
      continue;
    }
    if (!Number(campaign.ensayo)) {
      const conexion = estadoDeDestinoSocial({ id: candidato.destino_id });
      if (conexion.estado !== 'lista') {
        throw new Error(`${candidato.destino_nombre}: ${conexion.motivo}`);
      }
    }
    pendientes.push(candidato);
  }

  const arranque = desdeSql(when) || new Date();

  /*
    El cupo es por identidad, así que se reparte por separado para cada una:
    treinta grupos del Perfil y treinta de la Page son dos colas distintas y
    ninguna consume el cupo de la otra.
  */
  const porIdentidad = new Map();
  for (const fila of pendientes) {
    const clave = Number(fila.cuenta_id) || 0;
    if (!porIdentidad.has(clave)) porIdentidad.set(clave, []);
    porIdentidad.get(clave).push(fila.id);
  }

  const plan = [];
  for (const [cuentaId, targets] of porIdentidad) {
    const yaEnviadosHoy = cuentaId
      ? Number(
          db
            .prepare(
              `SELECT COUNT(*) AS total FROM social_post_targets t
                 JOIN social_destinations d ON d.id = t.destino_id
                WHERE d.cuenta_id = ? AND t.estado IN ('published','requires_approval')
                  AND date(t.finalizado_en, '-3 hours') = date('now', '-3 hours')`
            )
            .get(cuentaId)?.total || 0
        )
      : 0;

    plan.push(
      ...repartirPorDia(targets, {
        cupoDiario: config.cupoDiario,
        yaEnviadosHoy,
        ahora: arranque,
      })
    );
  }

  const paraHoy = plan.filter((p) => p.dia === 0).length;
  const paraDespues = plan.length - paraHoy;
  const dias = plan.length ? Math.max(...plan.map((p) => p.dia)) + 1 : 0;

  db.transaction(() => {
    db.prepare(
      `UPDATE social_campaigns SET estado = 'queued', programada_para = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(when, id);

    const encolar = db.prepare(
      `UPDATE social_post_targets SET estado = 'queued', programada_para = ?, contenido_hash = ?,
              ultimo_error = '', actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    for (const item of plan) {
      const cuando = item.programadoPara ? sqlFecha(item.programadoPara) : when;
      encolar.run(cuando, huella, item.destino);
    }

    /*
      Los apartados guardan el motivo en `ultimo_error` porque es el campo que
      la pantalla ya muestra al lado de cada destino. No es un error: es la
      explicación de por qué ese grupo no recibió nada, que es justo lo que la
      persona va a querer saber al ver la campaña terminada.
    */
    const saltear = db.prepare(
      `UPDATE social_post_targets SET estado = ?, ultimo_error = ?, contenido_hash = ?,
              finalizado_en = CURRENT_TIMESTAMP, actualizado_en = CURRENT_TIMESTAMP
       WHERE id = ?`
    );
    for (const item of descartados) {
      saltear.run(item.estado, clean(item.motivo, 300), huella, item.id);
    }
  })();

  const porRegla = descartados.filter((d) => d.estado === 'skipped_rule').length;
  const repetidos = descartados.filter((d) => d.estado === 'skipped_duplicate').length;

  const partes = [];
  if (paraHoy) partes.push(`${paraHoy} hoy`);
  if (paraDespues) partes.push(`${paraDespues} en los días siguientes por el cupo diario`);
  if (porRegla) partes.push(`${porRegla} excluidos por reglas del grupo`);
  if (repetidos) partes.push(`${repetidos} salteados por repetidos`);

  log({
    campanaId: id,
    mensaje: partes.length
      ? `${candidatos.length} destinos: ${partes.join(', ')}`
      : 'No quedó ningún destino para publicar',
  });

  return {
    ...getCampaign(id),
    reparto: {
      total: plan.length,
      hoy: paraHoy,
      despues: paraDespues,
      dias,
      porRegla,
      repetidos,
      /* Lo que se apartó, con nombre y motivo, para poder mostrarlo. */
      apartados: descartados.map((d) => ({
        destino: d.destino_nombre,
        estado: d.estado,
        motivo: d.motivo,
      })),
    },
  };
}

function cancelCampaign(id) {
  const result = db.transaction(() => {
    const campaign = db
      .prepare(
        "UPDATE social_campaigns SET estado = 'cancelled', actualizado_en = CURRENT_TIMESTAMP WHERE id = ? AND estado NOT IN ('published', 'cancelled')"
      )
      .run(id);
    if (!campaign.changes) return false;
    db.prepare(
      "UPDATE social_post_targets SET estado = 'cancelled', actualizado_en = CURRENT_TIMESTAMP WHERE campana_id = ? AND estado IN ('draft', 'scheduled', 'queued')"
    ).run(id);
    return true;
  })();
  if (!result) throw new Error('La campaña no se puede cancelar en su estado actual');
  log({ campanaId: id, mensaje: 'Campaña cancelada', nivel: 'warn' });
  return getCampaign(id);
}

function retryFailedCampaign(id) {
  const campaign = getCampaign(id);
  if (!campaign) throw new Error('No existe la campaña');
  const result = db.transaction(() => {
    const changed = db
      .prepare(
        `UPDATE social_post_targets SET estado = 'queued', lock_token = '', lock_hasta = NULL,
       proximo_reintento_en = NULL, ultimo_error = '', actualizado_en = CURRENT_TIMESTAMP
       WHERE campana_id = ? AND estado = 'failed' AND intentos < max_intentos`
      )
      .run(id).changes;
    if (changed) {
      db.prepare(
        "UPDATE social_campaigns SET estado = 'queued', finalizada_en = NULL, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(id);
    }
    return changed;
  })();
  if (!result) {
    throw new Error(
      'No hay destinos fallidos que puedan reintentarse. Los resultados ambiguos no se repiten automáticamente.'
    );
  }
  log({
    campanaId: id,
    nivel: 'warn',
    codigo: 'MANUAL_RETRY',
    mensaje: `Reintento manual de ${result} destino(s) fallido(s)`,
  });
  return getCampaign(id);
}

function duplicateCampaign(id) {
  const source = getCampaign(id);
  if (!source) throw new Error('No existe la campaña');
  const result = db.transaction(() => {
    const campaign = db
      .prepare(
        `INSERT INTO social_campaigns (nombre, texto, personalizaciones, estado, creado_por)
         VALUES (?, ?, ?, 'draft', ?)`
      )
      .run(
        `${clean(source.nombre, 145)} (copia)`,
        source.texto,
        json(source.personalizaciones),
        source.creado_por
      );
    const campaignId = Number(campaign.lastInsertRowid);
    const target = db.prepare(
      `INSERT INTO social_post_targets (campana_id, destino_id, estado)
       VALUES (?, ?, 'draft')`
    );
    const media = db.prepare(
      'INSERT INTO social_campaign_media (campana_id, media_id, orden) VALUES (?, ?, ?)'
    );
    source.targets.forEach((item) => target.run(campaignId, item.destino_id));
    source.media.forEach((item, index) => media.run(campaignId, item.id, index));
    return campaignId;
  })();
  log({ campanaId: result, mensaje: `Campaña duplicada desde #${id}` });
  return getCampaign(result);
}

function deleteCampaign(id) {
  const campaign = getCampaign(id);
  if (!campaign) throw new Error('No existe la campaña');
  if (!['draft', 'scheduled', 'cancelled'].includes(campaign.estado)) {
    throw new Error('Sólo se eliminan borradores, programadas o campañas canceladas');
  }
  db.prepare('DELETE FROM social_campaigns WHERE id = ?').run(id);
  return { id: Number(id), eliminado: true };
}

function getMetrics(days = 30) {
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), 365);
  /*
    En formato SQLite, no ISO. Las consultas de abajo comparan `creado_en >= ?`
    contra la columna pelada, y un ISO es siempre "mayor" que cualquier fecha
    guardada por SQLite. Con ISO, todas las métricas daban cero.
  */
  const since = sqlFecha(new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000));
  const summary = db
    .prepare(
      `SELECT COUNT(DISTINCT c.id) AS totalCampanas,
       COUNT(t.id) AS totalPublicaciones,
       SUM(CASE WHEN t.estado IN ('published', 'requires_approval') THEN 1 ELSE 0 END) AS exitosos,
       SUM(CASE WHEN t.estado = 'failed' THEN 1 ELSE 0 END) AS fallidos
       FROM social_campaigns c LEFT JOIN social_post_targets t ON t.campana_id = c.id
       WHERE c.creado_en >= ?`
    )
    .get(since);
  const totalPublicaciones = Number(summary.totalPublicaciones || 0);
  const exitosos = Number(summary.exitosos || 0);
  return {
    resumen: {
      totalCampanas: Number(summary.totalCampanas || 0),
      totalPublicaciones,
      tasaExito: totalPublicaciones ? Math.round((exitosos / totalPublicaciones) * 100) : null,
      destinosActivos: Number(
        db.prepare('SELECT COUNT(*) AS total FROM social_destinations WHERE habilitada = 1').get()
          .total
      ),
      /*
        ── Si alguna vez salió algo de verdad ────────────────────────────────

        Sin ventana de tiempo, a propósito. Todo lo demás de este resumen mira
        los últimos N días porque son métricas; esto no es una métrica, es una
        pregunta de una sola vez: ¿este sistema publicó algo alguna vez?

        La usa el modo seguro del compositor para decidir si viene prendido. Si
        mirara los últimos 30 días, un mes tranquilo volvería a poner las
        rueditas de atrás sin que nadie las pidiera.
      */
      yaPublicoAlgunaVez:
        Number(
          db
            .prepare("SELECT COUNT(*) AS total FROM social_post_targets WHERE estado = 'published'")
            .get().total
        ) > 0,
    },
    porDia: db
      .prepare(
        `SELECT substr(COALESCE(finalizado_en, creado_en), 1, 10) AS fecha, COUNT(*) AS total,
         SUM(CASE WHEN estado IN ('published', 'requires_approval') THEN 1 ELSE 0 END) AS exitosos,
         SUM(CASE WHEN estado = 'failed' THEN 1 ELSE 0 END) AS fallidos
         FROM social_post_targets WHERE creado_en >= ? GROUP BY fecha ORDER BY fecha DESC`
      )
      .all(since),
    destinosTop: db
      .prepare(
        `SELECT d.id, d.nombre, COUNT(t.id) AS total FROM social_destinations d
         LEFT JOIN social_post_targets t ON t.destino_id = d.id AND t.creado_en >= ?
         GROUP BY d.id HAVING total > 0 ORDER BY total DESC, d.nombre COLLATE NOCASE LIMIT 8`
      )
      .all(since),
    porHora: db
      .prepare(
        `SELECT CAST(substr(COALESCE(finalizado_en, creado_en), 12, 2) AS INTEGER) AS hora,
         COUNT(*) AS total, SUM(CASE WHEN estado IN ('published', 'requires_approval') THEN 1 ELSE 0 END) AS exitosos
         FROM social_post_targets WHERE creado_en >= ? GROUP BY hora ORDER BY hora`
      )
      .all(since)
      .map((row) => ({
        ...row,
        tasa: row.total ? Math.round((Number(row.exitosos || 0) / row.total) * 100) : 0,
      })),
    estados: db
      .prepare(
        'SELECT estado, COUNT(*) AS cantidad FROM social_post_targets WHERE creado_en >= ? GROUP BY estado'
      )
      .all(since),

    /*
      ── Dos clases de métricas que no hay que mezclar ────────────────────────

      Todo lo de arriba son métricas **de ejecución**: cuántas publicaciones
      salieron, cuántas fallaron, a qué hora. Son nuestras y son exactas.

      El **alcance** —cuánta gente lo vio— es otra cosa, y sólo existe donde
      Meta lo publica: la Fan Page e Instagram. Del perfil y de los grupos no
      hay datos.

      Se dice explícitamente en vez de mostrar un cero. Un cero significa
      "nadie lo vio"; esto significa "no se puede saber", y son cosas muy
      distintas para quien está decidiendo dónde publicar.
    */
    alcance: {
      disponible: false,
      sinDatosPara: db
        .prepare(
          `SELECT DISTINCT d.tipo FROM social_post_targets t
             JOIN social_destinations d ON d.id = t.destino_id
            WHERE t.creado_en >= ? AND COALESCE(d.execution_class, 'browser') = 'browser'`
        )
        .all(since)
        .map((fila) => ({ tipo: fila.tipo, motivo: porQueNoHayMetricas(fila.tipo) }))
        .filter((x) => x.motivo),
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Configuración de la política de envío

   Todas las perillas de `politicaEnvio.js` se guardan en `configuracion` y se
   editan desde la pantalla. El módulo de política no lee la base —recibe estos
   valores ya resueltos—, así que este es el único lugar donde viven.
   ──────────────────────────────────────────────────────────────────────────── */

const PERILLAS = {
  intervaloSegundos: { clave: 'social_intervalo_segundos', min: 5, max: 900 },
  jitter: { clave: 'social_jitter', min: 0, max: 0.9, decimal: true },
  cupoDiario: { clave: 'social_cupo_diario', min: 1, max: 200 },
  cooldownGrupoHoras: { clave: 'social_cooldown_grupo_horas', min: 1, max: 168 },
  cupoDiarioInstagram: { clave: 'social_cupo_instagram', min: 1, max: 200 },
  fallosParaPausar: { clave: 'social_fallos_para_pausar', min: 2, max: 50 },
  ventanaDedupeDias: { clave: 'social_ventana_dedupe_dias', min: 0, max: 90 },
};

const leerClave = (clave) =>
  db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave)?.valor;

const guardarClave = (clave, valor) =>
  db
    .prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)')
    .run(clave, String(valor));

const acotar = (valor, { min, max, decimal }) => {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const dentro = Math.min(Math.max(n, min), max);
  return decimal ? Math.round(dentro * 100) / 100 : Math.round(dentro);
};

function getSocialConfig() {
  const config = {};
  for (const [campo, regla] of Object.entries(PERILLAS)) {
    const guardado = acotar(leerClave(regla.clave), regla);
    config[campo] = guardado === null ? LIMITES[campo] : guardado;
  }

  /*
    El intervalo antes se llamaba `social_delay_segundos` y era un delay global
    sin desvío. Si todavía existe y nadie configuró el nuevo, se respeta lo que
    el usuario ya había elegido en vez de pisárselo con el valor por omisión.
  */
  if (leerClave(PERILLAS.intervaloSegundos.clave) === undefined) {
    const viejo = acotar(leerClave('social_delay_segundos'), PERILLAS.intervaloSegundos);
    if (viejo !== null) config.intervaloSegundos = viejo;
  }

  config.pausaGlobal = leerClave('social_pausa_global') === '1';
  config.pausaGlobalMotivo = leerClave('social_pausa_global_motivo') || '';

  /* El nombre viejo sigue viajando para no romper la pantalla actual. */
  config.delaySegundos = config.intervaloSegundos;
  return config;
}

function setSocialConfig(cambios = {}) {
  for (const [campo, regla] of Object.entries(PERILLAS)) {
    if (cambios[campo] === undefined) continue;
    const valor = acotar(cambios[campo], regla);
    if (valor !== null) guardarClave(regla.clave, valor);
  }
  /* Compatibilidad con la pantalla vieja, que manda `delaySegundos`. */
  if (cambios.delaySegundos !== undefined && cambios.intervaloSegundos === undefined) {
    const valor = acotar(cambios.delaySegundos, PERILLAS.intervaloSegundos);
    if (valor !== null) guardarClave(PERILLAS.intervaloSegundos.clave, valor);
  }
  return getSocialConfig();
}

/* ────────────────────────────────────────────────────────────────────────────
   Freno de mano

   Dos niveles: pausar todo, o pausar una identidad sola.

   Es lo primero que se implementa de esta fase a propósito. Cuando algo salga
   mal —y con publicación masiva en grupos ajenos algo va a salir mal— tiene que
   haber una forma de frenarlo que no sea apagar el servidor. Pausar **no
   cancela nada**: los destinos quedan en cola tal como están y siguen cuando se
   reanuda.
   ──────────────────────────────────────────────────────────────────────────── */

function pausarTodo(motivo = '') {
  guardarClave('social_pausa_global', '1');
  guardarClave('social_pausa_global_motivo', clean(motivo, 300));
  log({ nivel: 'warn', codigo: 'PAUSA_GLOBAL', mensaje: motivo || 'Se pausó todo a mano' });
  return getSocialConfig();
}

function reanudarTodo() {
  guardarClave('social_pausa_global', '0');
  guardarClave('social_pausa_global_motivo', '');
  log({ nivel: 'info', codigo: 'REANUDADO', mensaje: 'Se reanudó la publicación' });
  return getSocialConfig();
}

function pausarIdentidad(cuentaId, motivo = '') {
  const id = Number(cuentaId);
  const cuenta = db.prepare('SELECT id, nombre FROM social_accounts WHERE id = ?').get(id);
  if (!cuenta) throw new Error('No existe esa identidad');
  db.prepare(
    `UPDATE social_accounts SET pausada = 1, pausada_en = CURRENT_TIMESTAMP, pausada_motivo = ? WHERE id = ?`
  ).run(clean(motivo, 300), id);
  log({
    nivel: 'warn',
    codigo: 'PAUSA_IDENTIDAD',
    mensaje: `${cuenta.nombre}: ${motivo || 'pausada a mano'}`,
  });
  return { id, pausada: true };
}

/**
 * Reanuda una identidad.
 *
 * Pone los fallos seguidos en cero además de sacar la pausa. Si no, una
 * identidad que se frenó sola por fallos quedaría frenada igual al reanudarla:
 * el contador seguiría en el tope y `canDispatch` la volvería a negar en el
 * primer intento. Reanudar tiene que significar reanudar.
 */
function reanudarIdentidad(cuentaId) {
  const id = Number(cuentaId);
  db.prepare(
    `UPDATE social_accounts SET pausada = 0, pausada_en = NULL, pausada_motivo = '', fallos_seguidos = 0 WHERE id = ?`
  ).run(id);
  return { id, pausada: false };
}

/**
 * Junta de la base todo lo que `canDispatch` necesita para decidir.
 *
 * Los cupos se cuentan por **día del negocio**, no por día UTC: el servidor
 * corre tres horas adelantado, así que sin el `-3 hours` el cupo se reiniciaría
 * a las nueve de la noche, en plena hora de venta.
 *
 * El contador es por identidad y no distingue cómo se publicó. Cuando la Fan
 * Page pase a publicar por API y el Perfil siga por navegador, los dos van a
 * descontar del mismo cupo — que es el punto: un cupo que sólo mira una clase
 * de ejecución no protege nada.
 */
function estadoDeEnvio(destino, config) {
  const cuentaId = Number(destino.cuenta_id);
  const identidad =
    db
      .prepare('SELECT pausada, pausada_motivo, fallos_seguidos FROM social_accounts WHERE id = ?')
      .get(cuentaId) || {};

  const publicados = "t.estado IN ('published','requires_approval')";
  const hoy = "date(t.finalizado_en, '-3 hours') = date('now', '-3 hours')";

  const delDia = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN d.provider = 'instagram' THEN 1 ELSE 0 END) AS instagram,
              MAX(t.finalizado_en) AS ultimo
         FROM social_post_targets t
         JOIN social_destinations d ON d.id = t.destino_id
        WHERE d.cuenta_id = ? AND ${publicados} AND ${hoy}`
    )
    .get(cuentaId);

  /*
    El último envío de la identidad se busca sin filtrar por día: a las 00:05 el
    contador diario arranca de cero pero el intervalo entre publicaciones sigue
    corriendo desde la de las 23:58.
  */
  const ultimoIdentidad = db
    .prepare(
      `SELECT MAX(t.finalizado_en) AS ultimo FROM social_post_targets t
         JOIN social_destinations d ON d.id = t.destino_id
        WHERE d.cuenta_id = ? AND ${publicados}`
    )
    .get(cuentaId);

  const ultimoDestino = db
    .prepare(
      `SELECT MAX(t.finalizado_en) AS ultimo FROM social_post_targets t
        WHERE t.destino_id = ? AND ${publicados}`
    )
    .get(Number(destino.destino_id));

  const fecha = desdeSql;

  return {
    pausaGlobal: config.pausaGlobal,
    identidadPausada: Number(identidad.pausada) === 1,
    identidadPausadaMotivo: identidad.pausada_motivo || '',
    fallosSeguidos: Number(identidad.fallos_seguidos || 0),
    enviadosHoyIdentidad: Number(delDia?.total || 0),
    enviadosHoyInstagram: Number(delDia?.instagram || 0),
    ultimoEnvioIdentidad: fecha(ultimoIdentidad?.ultimo),
    ultimoEnvioAlDestino: fecha(ultimoDestino?.ultimo),
    esInstagram: destino.provider === 'instagram',
    /*
      ── El tipo real es `facebook_group`, no `grupo` ─────────────────────────

      Acá decía `=== 'grupo'`. Los grupos de verdad se guardan como
      `facebook_group`, así que `esGrupo` daba **false para todos los grupos
      reales** y el descanso de 24 horas no se aplicaba nunca en producción.

      Es decir: la protección más importante de todo el módulo —no publicar dos
      veces en el mismo grupo, que es lo que hace que un administrador te
      eche— estaba muerta, y los tests decían que andaba.

      ¿Por qué no lo vieron? Porque los fixtures creaban destinos con
      `tipo: 'grupo'`, un tipo que no existe en el sistema real. Un test con
      datos que no se parecen a los de verdad no prueba nada; sólo da
      tranquilidad, que es peor que no tenerlo.
    */
    esGrupo: destino.destino_tipo === 'facebook_group',
  };
}

/**
 * Le da al worker lo próximo que tiene que hacer.
 *
 * ── Los comandos no pasan por el freno ─────────────────────────────────────
 *
 * Antes el delay estaba **antes** de buscar comandos, así que después de
 * publicar no se podía correr un health check ni sincronizar grupos durante
 * todo el intervalo. Eso es exactamente al revés de lo que conviene: cuando la
 * cola está frenada es cuando más falta hace poder mirar qué está pasando.
 *
 * Un comando no publica nada. No gasta cupo, no lo ve nadie desde afuera y no
 * puede hacer que te bloqueen. Va primero y sin freno.
 */
function claimWork({ puedeSubirMedia = false } = {}) {
  const config = getSocialConfig();
  const lock = token();
  const item = db.transaction(() => {
    const command = db
      .prepare(
        `SELECT * FROM social_worker_commands WHERE estado = 'pending'
       OR (estado = 'processing' AND lock_hasta < CURRENT_TIMESTAMP)
       ORDER BY id LIMIT 1`
      )
      .get();
    if (command) {
      db.prepare(
        "UPDATE social_worker_commands SET estado = 'processing', lock_token = ?, lock_hasta = datetime('now', '+10 minutes') WHERE id = ?"
      ).run(lock, command.id);
      /*
        Al entregar el comando se le suma el nombre de la identidad.

        El worker sólo recibe un id, y con un número no puede hacer nada: para
        pararse en el Perfil o en la Fan Page necesita saber cuál es. Se
        resuelve acá y no allá porque la base es del servidor; el worker no
        tiene forma de consultarla.
      */
      const payload = parse(command.payload);
      if (payload?.identityId) {
        const identidad = db
          .prepare('SELECT nombre, metadata FROM social_accounts WHERE id = ?')
          .get(Number(payload.identityId));
        const meta = parse(identidad?.metadata) || {};

        /*
          Se manda el nombre **de Facebook**, no el nuestro.

          En el sistema la identidad se llama "Fan Page Modo Sabor Delivery"
          porque así se distingue del Perfil en la lista. En Facebook la página
          se llama "Modo Sabor Delivery" a secas.

          El Worker busca ese nombre en el menú de cambio de perfil para saber
          dónde hacer clic. Con el nuestro no lo encontraría nunca, y el error
          sería "Facebook no ofrece cambiar a «Fan Page Modo Sabor Delivery»",
          que suena a que falta un permiso cuando en realidad sobran dos
          palabras.

          `pageNombre` lo guarda el conectar-con-un-botón, tal como lo devolvió
          Meta. Si no está —identidades cargadas a mano antes de eso— se cae al
          nuestro, que es mejor que nada.
        */
        payload.identityNombre =
          meta.pageNombre ||
          meta.profileNombre ||
          String(identidad?.nombre || '').replace(/^Perfil\s+/i, '') ||
          '';
        payload.identityTipo = meta.tipo || '';
      }

      return { kind: 'command', lock, item: { ...command, payload } };
    }
    /*
      Se miran varios candidatos, no uno.

      Con un solo candidato, un grupo en descanso frenaría toda la cola: el
      primero de la fila diría "todavía no" y los treinta de atrás —que sí
      podrían salir— se quedarían esperando con él. Se recorre en orden y sale
      el primero que la política deje pasar.

      El tope de 25 es para no recorrer una cola de cientos en cada pedido del
      worker. Si los primeros 25 están todos frenados, es que la política está
      diciendo que hay que esperar, y esperar es la respuesta correcta.
    */
    const candidatos = db
      .prepare(
        `SELECT t.*, c.nombre AS campana_nombre, c.texto, c.personalizaciones, c.formato, c.formatos,
              d.nombre AS destino_nombre, d.provider, d.tipo AS destino_tipo, d.url AS destino_url,
              d.metadata AS destino_metadata, d.cuenta_id,
              (SELECT COUNT(*) FROM social_campaign_media cm WHERE cm.campana_id = c.id) AS media_total,
              d.frecuencia_maxima_horas, d.bloqueado_manualmente,
              d.execution_class, d.provider_clave
         FROM social_post_targets t
         JOIN social_campaigns c ON c.id = t.campana_id
         JOIN social_destinations d ON d.id = t.destino_id
        WHERE t.estado IN ('queued', 'scheduled')
          AND COALESCE(t.programada_para, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP
          AND d.habilitada = 1
          AND COALESCE(d.bloqueado_manualmente, 0) = 0
          -- Sólo lo que se publica con navegador. La clase api la despacha el
          -- servidor por su cuenta: si el Worker se la llevara, quedaría
          -- esperando a una PC encendida para algo que no necesita ninguna.
          --
          -- Un ensayo tampoco sale por acá: no tiene sentido abrir Chrome y
          -- pararse frente al grupo para después no publicar. Lo resuelve el
          -- servidor, que es donde vive el provider de ensayo.
          AND COALESCE(d.execution_class, 'browser') = 'browser'
          AND COALESCE(c.ensayo, 0) = 0
        ORDER BY COALESCE(t.programada_para, t.creado_en), t.id LIMIT 25`
      )
      .all();

    let target = null;
    for (const candidato of candidatos) {
      const conexion = estadoDeDestinoSocial({ id: candidato.destino_id });
      if (conexion.estado !== 'lista') {
        db.prepare(
          'UPDATE social_post_targets SET ultimo_error = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(clean(conexion.motivo, 300), candidato.id);
        continue;
      }
      /*
        La extensión puede escribir en un compositor, pero no puede cargar un
        archivo local en Facebook de forma segura. Si tomara estos trabajos,
        un Reel o una Historia terminarían como un posteo de texto común. El
        Worker de escritorio sí usa Playwright y `setInputFiles`, por eso sólo
        él puede reclamarlos.
      */
      if (
        !puedeSubirMedia &&
        (formatoParaLaRed(candidato) !== 'post' || Number(candidato.media_total || 0) > 0)
      ) {
        continue;
      }

      /*
        El descanso propio del grupo pisa al general. Si el administrador dijo
        "una vez por semana", el tope de 24 horas del sistema no alcanza — y el
        que manda es el del grupo, que es el que te puede echar.
      */
      const configDestino = candidato.frecuencia_maxima_horas
        ? { ...config, cooldownGrupoHoras: Number(candidato.frecuencia_maxima_horas) }
        : config;

      const decision = canDispatch({
        estado: estadoDeEnvio(candidato, configDestino),
        config: configDestino,
      });
      if (decision.permitido) {
        target = candidato;
        break;
      }
      /*
        Atajo, no regla: la pausa general niega a todos por igual, así que
        recorrer los 24 que faltan daría el mismo resultado más lento. Sacar
        este `return` no cambia lo que hace el sistema.
      */
      if (decision.codigo === 'PAUSA_GLOBAL') return null;
    }
    if (!target) return null;
    db.prepare(
      `UPDATE social_post_targets SET estado = 'processing', lock_token = ?, lock_hasta = datetime('now', '+10 minutes'),
       intentos = intentos + 1, iniciado_en = COALESCE(iniciado_en, CURRENT_TIMESTAMP), actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(lock, target.id);
    db.prepare(
      "UPDATE social_campaigns SET estado = 'processing', iniciada_en = COALESCE(iniciada_en, CURRENT_TIMESTAMP), actualizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(target.campana_id);
    const media = db
      .prepare(
        `SELECT m.id, m.nombre, m.ruta, m.mime FROM social_campaign_media cm JOIN social_media m ON m.id = cm.media_id
       WHERE cm.campana_id = ? ORDER BY cm.orden, m.id`
      )
      .all(target.campana_id);
    return {
      kind: 'publication',
      lock,
      item: {
        ...target,
        texto: textoParaLaRed(target),
        formato: formatoParaLaRed(target),
        personalizaciones: parse(target.personalizaciones),
        destino_metadata: parse(target.destino_metadata),
        media,
      },
    };
  })();
  return item;
}

/**
 * Lo próximo que tiene que publicar **el servidor**, sin navegador.
 *
 * ── Por qué es una función aparte y no un parámetro de claimWork ───────────
 *
 * Son dos motores distintos con dos ritmos distintos. `claimWork` responde a
 * un pedido del Worker, que puede estar apagado; este lo llama un reloj del
 * servidor, que siempre está.
 *
 * Lo que **no** es distinto es la política: los dos preguntan lo mismo a
 * `canDispatch` y descuentan del mismo cupo por identidad. Si cada motor
 * llevara su propia cuenta, entre los dos publicarían el doble de lo permitido
 * creyendo cada uno que está respetando el límite.
 */
function claimApiWork() {
  const config = getSocialConfig();
  const lock = token();

  return db.transaction(() => {
    const candidatos = db
      .prepare(
        `SELECT t.*, c.nombre AS campana_nombre, c.texto, c.personalizaciones, c.ensayo, c.formato, c.formatos,
                d.nombre AS destino_nombre, d.provider, d.tipo AS destino_tipo, d.url AS destino_url,
                d.metadata AS destino_metadata, d.cuenta_id,
                d.frecuencia_maxima_horas, d.execution_class, d.provider_clave
           FROM social_post_targets t
           JOIN social_campaigns c ON c.id = t.campana_id
           JOIN social_destinations d ON d.id = t.destino_id
          WHERE t.estado IN ('queued', 'scheduled')
            AND COALESCE(t.programada_para, CURRENT_TIMESTAMP) <= CURRENT_TIMESTAMP
            AND d.habilitada = 1
            AND COALESCE(d.bloqueado_manualmente, 0) = 0
            AND (COALESCE(d.execution_class, 'browser') = 'api' OR COALESCE(c.ensayo, 0) = 1)
          ORDER BY COALESCE(t.programada_para, t.creado_en), t.id LIMIT 25`
      )
      .all();

    for (const candidato of candidatos) {
      if (!Number(candidato.ensayo)) {
        const conexion = estadoDeDestinoSocial({ id: candidato.destino_id });
        if (conexion.estado !== 'lista') {
          db.prepare(
            'UPDATE social_post_targets SET ultimo_error = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
          ).run(clean(conexion.motivo, 300), candidato.id);
          continue;
        }
      }
      const configDestino = candidato.frecuencia_maxima_horas
        ? { ...config, cooldownGrupoHoras: Number(candidato.frecuencia_maxima_horas) }
        : config;

      const decision = canDispatch({
        estado: estadoDeEnvio(candidato, configDestino),
        config: configDestino,
      });
      if (!decision.permitido) {
        if (decision.codigo === 'PAUSA_GLOBAL') return null;
        continue;
      }

      db.prepare(
        `UPDATE social_post_targets SET estado = 'processing', lock_token = ?, lock_hasta = datetime('now', '+10 minutes'),
         intentos = intentos + 1, iniciado_en = COALESCE(iniciado_en, CURRENT_TIMESTAMP),
         actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(lock, candidato.id);

      db.prepare(
        "UPDATE social_campaigns SET estado = 'processing', iniciada_en = COALESCE(iniciada_en, CURRENT_TIMESTAMP), actualizado_en = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(candidato.campana_id);

      const media = db
        .prepare(
          `SELECT m.id, m.nombre, m.ruta, m.mime FROM social_campaign_media cm
             JOIN social_media m ON m.id = cm.media_id
            WHERE cm.campana_id = ? ORDER BY cm.orden, m.id`
        )
        .all(candidato.campana_id);

      return {
        lock,
        item: {
          ...candidato,
          texto: textoParaLaRed(candidato),
          formato: formatoParaLaRed(candidato),
          personalizaciones: parse(candidato.personalizaciones),
          destino_metadata: parse(candidato.destino_metadata),
          media,
        },
      };
    }

    return null;
  })();
}

/**
 * Publica un destino de clase API. La llama el reloj del servidor.
 *
 * ── Por qué el reporte pasa por `reportPublication` ────────────────────────
 *
 * Es el mismo camino que usa el Worker: mismo cálculo de estado de campaña,
 * mismo contador de fallos seguidos, mismo log. Un segundo camino de reporte
 * sería un segundo lugar donde arreglar cada bug.
 */
async function publicarPorApi(trabajo) {
  const { item, lock } = trabajo;

  const destino = {
    id: item.destino_id,
    tipo: item.destino_tipo,
    provider: item.provider,
    provider_clave: item.provider_clave,
    nombre: item.destino_nombre,
    url: item.destino_url,
  };

  /*
    En un ensayo manda el provider de ensayo, sea cual sea el destino. Es lo
    que permite ensayar una campaña de grupos —que normalmente iría por
    navegador— sin abrir Chrome ni tocar Facebook.
  */
  const provider =
    Number(item.ensayo) === 1
      ? resolverProvider({ ...destino, provider_clave: 'ensayo' })
      : resolverProvider(destino);

  /*
    Sin provider no se reintenta: un destino que nadie sabe publicar es un
    error de configuración, y reintentarlo cien veces no lo va a arreglar.
  */
  if (!provider) {
    return reportPublication({
      targetId: item.id,
      lockToken: lock,
      estado: 'failed',
      codigo: 'SIN_PROVIDER',
      error: `Ningún provider sabe publicar en un destino de tipo "${item.destino_tipo}".`,
    });
  }

  const contenido = {
    texto: item.texto,
    media: item.media,
    personalizaciones: item.personalizaciones,
    /*
      El formato que le toca a ESTE destino.

      ── Por qué depende de la red y no de la campaña ────────────────────────

      Una misma publicación sale como **posteo en Facebook y como reel en
      Instagram**: es el caso normal cuando hay un video vertical que también
      querés en el muro.

      El formato lo sigue eligiendo quien escribe —no el destino— pero lo
      elige una vez por red. Guardarlo en el destino obligaría a duplicar cada
      destino por formato, y "Modo Sabor Delivery (reel)" al lado de "Modo
      Sabor Delivery (historia)" es una lista que nadie puede leer.
    */
    formato: formatoParaLaRed(item),
  };

  /*
    La identidad lleva el token. Va cifrado en su metadata y se desencripta
    recién adentro de `metaApi`, en el momento de armar el pedido: acá viaja
    igual de cifrado que en la base.
  */
  const filaIdentidad = db
    .prepare(
      'SELECT id, nombre, identificador_externo AS clave, metadata FROM social_accounts WHERE id = ?'
    )
    .get(item.cuenta_id);
  const identidad = filaIdentidad
    ? { ...filaIdentidad, metadata: parse(filaIdentidad.metadata) }
    : null;

  const revision = provider.validar({ destino, contenido, identidad });
  if (!revision.ok) {
    return reportPublication({
      targetId: item.id,
      lockToken: lock,
      estado: 'failed',
      codigo: 'CONTENIDO_INVALIDO',
      error: revision.errores.join('. '),
    });
  }

  try {
    const resultado = await provider.publicar({ destino, contenido, identidad });
    return reportPublication({
      targetId: item.id,
      lockToken: lock,
      estado: resultado.estado || 'published',
      externalPostUrl: resultado.externalUrl || '',
      codigo: provider.clave,
      detalle: resultado.detalle || {},
    });
  } catch (error) {
    /*
      `ambiguous` y no `failed` cuando no se sabe si llegó a publicarse.

      Reintentar algo que quizás salió es la forma de publicar dos veces en el
      mismo grupo, que es justamente lo que todo este módulo trata de evitar.
      Ante la duda, se marca y lo mira una persona.
    */
    /*
      Los errores de Meta ya vienen sabiendo si son inciertos: `metaApi` los
      traduce y marca los que pudieron haber llegado igual. Para el resto queda
      la heurística del texto.
    */
    const dudoso =
      error.incierto === true ||
      /timeout|ETIMEDOUT|ECONNRESET|socket hang up/i.test(String(error.message));
    return reportPublication({
      targetId: item.id,
      lockToken: lock,
      estado: dudoso ? 'ambiguous' : 'failed',
      codigo: error.codigo || (dudoso ? 'RESPUESTA_INCIERTA' : 'ERROR_PROVIDER'),
      error: String(error.message || error).slice(0, 1000),
    });
  }
}

function refreshCampaignState(campaignId) {
  const summary = db
    .prepare(
      /*
        `total` deja afuera los estados neutros a propósito.

        Si se eligen 10 grupos y 3 se saltean por repetidos, la campaña que
        publicó en los otros 7 está **completa**, no incompleta. Contarlos en
        el total la dejaría para siempre en "parcial" y mostraría un problema
        donde el sistema hizo exactamente lo que tenía que hacer.
      */
      `SELECT SUM(CASE WHEN estado NOT IN (${[...ESTADOS_NEUTROS].map((e) => `'${e}'`).join(',')}) THEN 1 ELSE 0 END) AS total,
      SUM(CASE WHEN estado IN ('published', 'requires_approval') THEN 1 ELSE 0 END) AS ok,
      SUM(CASE WHEN estado = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN estado IN ('queued', 'scheduled', 'processing') THEN 1 ELSE 0 END) AS pending
     FROM social_post_targets WHERE campana_id = ?`
    )
    .get(campaignId);
  let state = 'processing';
  if (!summary.pending) {
    state =
      (summary.failed || summary.ok < summary.total) && summary.ok
        ? 'partial'
        : summary.failed || summary.ok < summary.total
          ? 'failed'
          : 'published';
  }
  db.prepare(
    `UPDATE social_campaigns SET estado = ?, finalizada_en = CASE WHEN ? IN ('published','partial','failed') THEN CURRENT_TIMESTAMP ELSE finalizada_en END, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(state, state, campaignId);
  return state;
}

function reportPublication({
  targetId,
  lockToken,
  estado,
  error = '',
  externalPostUrl = '',
  codigo = '',
  detalle = {},
  screenshotRuta = '',
}) {
  if (!TARGET_STATES.has(estado)) throw new Error('Estado de destino inválido');
  const target = db
    .prepare('SELECT * FROM social_post_targets WHERE id = ? AND lock_token = ? AND estado = ?')
    .get(targetId, lockToken, 'processing');
  if (!target) throw new Error('El trabajo no está reclamado por este worker');
  db.prepare(
    `UPDATE social_post_targets SET estado = ?, lock_token = '', lock_hasta = NULL, finalizado_en = CURRENT_TIMESTAMP,
     external_post_url = ?, ultimo_error = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(estado, clean(externalPostUrl, 1000), clean(error, 1200), targetId);
  log({
    campanaId: target.campana_id,
    targetId,
    destinoId: target.destino_id,
    nivel: ['failed', 'ambiguous'].includes(estado)
      ? 'error'
      : estado === 'requires_approval'
        ? 'warn'
        : 'info',
    codigo,
    mensaje: error || `Destino ${estado}`,
    detalle,
    screenshotRuta,
  });

  /*
    ── El contador de fallos seguidos ───────────────────────────────────────

    Sube con cada fallo y vuelve a cero con cada publicación buena. Cuando
    llega al tope, `canDispatch` frena esa identidad sola.

    Es "seguidos" y no "totales" a propósito: cinco fallos sueltos repartidos
    en una semana son ruido normal, cinco seguidos son algo roto —la sesión se
    venció, apareció un checkpoint, cambió el HTML de Facebook— y seguir
    intentando sólo empeora la situación.

    Se cuenta por identidad porque es lo que se puede bloquear. Que la Fan Page
    falle no es motivo para frenar al Perfil.
  */
  const cuenta = db
    .prepare('SELECT cuenta_id FROM social_destinations WHERE id = ?')
    .get(target.destino_id);
  if (cuenta?.cuenta_id) {
    if (estado === 'failed' || estado === 'ambiguous') {
      db.prepare(
        'UPDATE social_accounts SET fallos_seguidos = COALESCE(fallos_seguidos, 0) + 1 WHERE id = ?'
      ).run(cuenta.cuenta_id);
    } else if (estado === 'published' || estado === 'requires_approval') {
      db.prepare('UPDATE social_accounts SET fallos_seguidos = 0 WHERE id = ?').run(
        cuenta.cuenta_id
      );
    }
  }

  return { campaign: refreshCampaignState(target.campana_id) };
}

/**
 * Le encarga algo al worker de la PC del local.
 *
 * ── Por qué la sincronización exige identidad ──────────────────────────────
 *
 * Sincronizar "los grupos de Facebook" no significa nada: los grupos donde
 * puede publicar el Perfil no son los mismos que los de la Fan Page. Sin
 * identidad, el worker tendría que adivinar con cuál está mirando, y lo que
 * traiga se guardaría contra la identidad equivocada.
 *
 * Se valida acá y no en la ruta a propósito: el agente de IA también va a
 * llamar a esto, y la regla tiene que valer para los dos.
 */
function createWorkerCommand(tipo, payload = {}) {
  const allowed = new Set(['sync_facebook_groups', 'health_check', 'switch_identity']);
  if (!allowed.has(tipo)) throw new Error('Comando de worker inválido');

  const cuerpo = { ...payload };

  if (tipo === 'sync_facebook_groups' || tipo === 'switch_identity') {
    const identidad = Number(cuerpo.identityId);
    if (!Number.isFinite(identidad) || identidad <= 0) {
      throw new Error('Indicá con qué identidad: Perfil o Fan Page');
    }
    const cuenta = db
      .prepare("SELECT id FROM social_accounts WHERE id = ? AND provider = 'facebook'")
      .get(identidad);
    if (!cuenta) throw new Error('No existe esa identidad de Facebook');
    cuerpo.identityId = identidad;
  }

  const result = db
    .prepare('INSERT INTO social_worker_commands (tipo, payload) VALUES (?, ?)')
    .run(tipo, json(cuerpo));
  return Number(result.lastInsertRowid);
}

function reportCommand({ commandId, lockToken, estado, resultado = {}, error = '' }) {
  const command = db
    .prepare('SELECT * FROM social_worker_commands WHERE id = ? AND lock_token = ? AND estado = ?')
    .get(commandId, lockToken, 'processing');
  if (!command) throw new Error('El comando no está reclamado por este worker');
  if (estado === 'done' && command.tipo === 'sync_facebook_groups') {
    /*
      Los grupos que descubre el worker se guardan atados a la identidad con la
      que se sincronizó.

      El pedido de sincronización lleva `identityId` en su payload y acá se lee
      de ahí, no del cuerpo del reporte: el worker informa qué encontró, pero
      **quién lo mandó a buscar lo decide el servidor**. Si el worker pudiera
      elegir la identidad, un error suyo mezclaría los grupos del Perfil con
      los de la Page sin que nadie se entere.

      Antes este INSERT no tenía identidad y su ON CONFLICT miraba sólo
      provider + tipo + id externo. O sea que sincronizar la Page pisaba los
      grupos del Perfil: es el mismo bug que arreglamos en createDestination,
      viviendo en un segundo lugar.
    */
    const pedido = parse(command.payload);
    const identidad = Number(pedido?.identityId);

    if (!Number.isFinite(identidad) || identidad <= 0) {
      throw new Error('El pedido de sincronización no dice con qué identidad se hizo');
    }

    const cuenta = db
      .prepare("SELECT id FROM social_accounts WHERE id = ? AND provider = 'facebook'")
      .get(identidad);
    if (!cuenta) throw new Error('La identidad del pedido ya no existe');

    const upsert = db.prepare(
      `INSERT INTO social_destinations
         (cuenta_id, provider, tipo, nombre, identificador_externo, url, metadata, habilitada, ultimo_estado)
       VALUES (?, 'facebook', 'facebook_group', ?, ?, ?, ?, 1, 'detectado')
       ON CONFLICT(provider, cuenta_id, tipo, identificador_externo) DO UPDATE SET
         nombre = excluded.nombre,
         url = excluded.url,
         metadata = excluded.metadata,
         habilitada = 1,
         ultimo_estado = 'detectado',
         actualizado_en = CURRENT_TIMESTAMP`
    );

    let guardados = 0;
    const idsDetectados = new Set();
    (resultado.grupos || []).forEach((group) => {
      const id = clean(group.id, 200);
      if (!id) return;
      idsDetectados.add(id);
      upsert.run(
        identidad,
        clean(group.nombre || 'Grupo de Facebook', 200),
        id,
        clean(group.url, 1000),
        json({
          source: 'worker',
          detectedAt: nowSql(),
          avatarUrl: avatarRemotoSeguro(group.avatarUrl),
          /* Lo declara el worker: hay grupos donde un admin aprueba cada post. */
          requiereAprobacion: Boolean(group.requiereAprobacion),
          puedeAbrirCompositor: group.puedeAbrirCompositor !== false,
        })
      );
      guardados += 1;
    });

    /*
      Una sincronización también retira de la selección los destinos que la
      identidad ya no mostró. No se borran: quedan deshabilitados y se
      reactivan automáticamente si Facebook los devuelve en otra sincronía.
      Sólo afecta grupos descubiertos por el worker, nunca los cargados a mano.
    */
    let deshabilitados = 0;
    const anteriores = db
      .prepare(
        "SELECT id, identificador_externo, metadata FROM social_destinations WHERE cuenta_id = ? AND provider = 'facebook' AND tipo = 'facebook_group'"
      )
      .all(identidad);
    const deshabilitar = db.prepare(
      "UPDATE social_destinations SET habilitada = 0, ultimo_estado = 'no_detectado', actualizado_en = CURRENT_TIMESTAMP WHERE id = ?"
    );
    anteriores.forEach((destino) => {
      const metadata = parse(destino.metadata);
      if (metadata?.source !== 'worker' || idsDetectados.has(destino.identificador_externo)) return;
      deshabilitar.run(destino.id);
      deshabilitados += 1;
    });

    const avatarIdentidad = avatarRemotoSeguro(resultado.avatarIdentidad);
    const identityUrl = /^https:\/\/(?:www\.)?facebook\.com\//i.test(
      String(resultado.identityUrl || '')
    )
      ? clean(resultado.identityUrl, 1000)
      : '';
    if (avatarIdentidad || identityUrl) {
      const identidadActual = db
        .prepare('SELECT metadata FROM social_accounts WHERE id = ?')
        .get(identidad);
      db.prepare('UPDATE social_accounts SET metadata = ? WHERE id = ?').run(
        json({
          ...parse(identidadActual?.metadata),
          ...(avatarIdentidad ? { avatarUrl: avatarIdentidad } : {}),
          ...(identityUrl ? { facebookMeUrl: identityUrl } : {}),
        }),
        identidad
      );
    }

    resultado.identityId = identidad;
    resultado.guardados = guardados;
    resultado.deshabilitados = deshabilitados;
  }
  db.prepare(
    `UPDATE social_worker_commands SET estado = ?, resultado = ?, error = ?, lock_token = '', lock_hasta = NULL, finalizado_en = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(estado, json(resultado), clean(error, 1200), commandId);
  if (
    command.tipo === 'health_check' &&
    estado === 'done' &&
    resultado.facebook_session === 'ACTIVE'
  ) {
    const marker = db
      .prepare(
        "SELECT valor FROM configuracion WHERE clave = 'social_worker_linked_after_command_id'"
      )
      .get();
    if (marker && Number(command.id) > Number(marker.valor)) {
      const cuenta = db
        .prepare(
          "SELECT id, nombre, metadata FROM social_accounts WHERE identificador_externo = 'fb_perfil'"
        )
        .get();
      if (cuenta) {
        const nombre = parse(cuenta.metadata).profileNombre || 'Perfil de Facebook';
        db.prepare(
          `INSERT INTO social_destinations
          (provider, cuenta_id, tipo, identificador_externo, nombre, url, habilitada, execution_class, provider_clave)
          VALUES ('facebook', ?, 'facebook_profile', 'me', ?, 'https://www.facebook.com/me/', 1, 'browser', 'facebook_profile_browser')
          ON CONFLICT(provider, cuenta_id, tipo, identificador_externo) DO UPDATE SET
            nombre = excluded.nombre, execution_class = 'browser', provider_clave = excluded.provider_clave`
        ).run(cuenta.id, nombre);
      }
    }
  }
  log({
    nivel: estado === 'done' ? 'info' : 'error',
    codigo: command.tipo,
    mensaje: error || `Worker completó ${command.tipo}`,
    detalle: resultado,
  });
}

function dashboard() {
  const queued = db
    .prepare(
      "SELECT COUNT(*) AS c FROM social_post_targets WHERE estado IN ('queued','scheduled','processing')"
    )
    .get().c;
  const failed = db
    .prepare("SELECT COUNT(*) AS c FROM social_post_targets WHERE estado = 'failed'")
    .get().c;
  const groups = db
    .prepare(
      "SELECT COUNT(*) AS c FROM social_destinations WHERE tipo = 'facebook_group' AND habilitada = 1"
    )
    .get().c;
  const worker = db
    .prepare('SELECT * FROM social_workers ORDER BY ultimo_heartbeat_en DESC LIMIT 1')
    .get();
  const health = db
    .prepare(
      "SELECT resultado, error, finalizado_en FROM social_worker_commands WHERE tipo = 'health_check' AND estado IN ('done','failed') ORDER BY id DESC LIMIT 1"
    )
    .get();
  return {
    queued,
    failed,
    groups,
    resumen: {
      yaPublicoAlgunaVez:
        Number(
          db
            .prepare("SELECT COUNT(*) AS total FROM social_post_targets WHERE estado = 'published'")
            .get().total
        ) > 0,
    },
    worker: estadoRealDelWorker(worker),
    vias: estadoViasSocial(),
    health: health ? { ...health, resultado: parse(health.resultado) } : null,
    campaigns: listCampaigns(8),
    logs: db
      .prepare('SELECT * FROM social_publication_logs ORDER BY id DESC LIMIT 12')
      .all()
      .map((item) => ({ ...item, detalle: parse(item.detalle) })),
  };
}

/**
 * Cuánto puede pasar sin latidos antes de dar al Worker por apagado.
 *
 * El Worker late cada ocho segundos. Dos minutos es quince latidos perdidos:
 * suficiente para no marcar "apagado" por una PC que se trabó un rato, y poco
 * para no mentir durante media hora.
 */
const SILENCIO_MAXIMO_MS = 2 * 60 * 1000;

/**
 * El estado del Worker, mirando el reloj.
 *
 * ── El bug que arregla ─────────────────────────────────────────────────────
 *
 * `estado` se guardaba tal como lo mandaba el Worker y no se volvía a tocar.
 * O sea: un Worker que mandó un latido en julio y no se prendió nunca más
 * figuraba **"online" para siempre**.
 *
 * Eso hacía que el tablero tachara "Vincular esta PC" como hecho mientras la
 * tarjeta de al lado decía "Sin validar", y que uno se quedara esperando que
 * pasara algo que no iba a pasar. Es el mismo tipo de mentira que las fechas
 * ISO en la base: nada falla, nada avisa, y no anda.
 *
 * El estado ahora se calcula, no se recuerda.
 */
/**
 * La red a la que pertenece un destino.
 *
 * Instagram es el único que se distingue por el prefijo del tipo. Todo lo
 * demás —páginas, perfiles, grupos— es Facebook.
 */
const redDelTipo = (tipo) =>
  String(tipo || '').startsWith('instagram') ? 'instagram' : 'facebook';

/** Devuelve el texto común o la versión escrita específicamente para esa red. */
function textoParaLaRed(item) {
  const ajustes = parse(item?.personalizaciones) || {};
  if (!ajustes.editar_por_red) return String(item?.texto || '');

  const red = redDelTipo(item?.destino_tipo);
  return String(ajustes.textos_por_red?.[red] ?? item?.texto ?? '');
}

/**
 * Qué formato le corresponde a un destino.
 *
 * ── El orden de las respuestas, y por qué ──────────────────────────────────
 *
 * 1. Lo que se eligió para **esa cuenta** (`cuenta_id|red`).
 * 2. La clave histórica de esa red (`facebook` o `instagram`).
 * 3. El formato único de la campaña (`formato`).
 * 4. Si no hay ninguno, un posteo.
 *
 * Ese orden es lo que hace que las campañas viejas —que sólo tienen `formato`—
 * sigan saliendo exactamente igual que antes. Sin el paso 2, el día que se
 * agregó `formatos` todas las campañas guardadas habrían pasado a ser posteos
 * en silencio.
 */
function formatoParaLaRed(item) {
  const elegidos = parse(item?.formatos) || {};
  const red = redDelTipo(item?.destino_tipo);
  const claveCuenta = item?.cuenta_id ? `${item.cuenta_id}|${red}` : '';
  return elegidos[claveCuenta] || elegidos[red] || item?.formato || 'post';
}

function estadoRealDelWorker(fila, now = Date.now()) {
  if (!fila) return null;

  const ultimo = desdeSql(fila.ultimo_heartbeat_en);
  const silencio = ultimo ? now - ultimo.getTime() : Infinity;
  const vivo = silencio <= SILENCIO_MAXIMO_MS;

  return {
    ...fila,
    detalle: parse(fila.detalle),
    /*
      Si está callado, es 'offline' y no lo que dijo la última vez. El estado
      que informó el Worker se conserva aparte: sirve para saber que la última
      vez que habló estaba, por ejemplo, bloqueado por Facebook.
    */
    estado: vivo ? fila.estado : 'offline',
    estadoInformado: fila.estado,
    vivo,
    silencioSegundos: Number.isFinite(silencio) ? Math.round(silencio / 1000) : null,
  };
}

function heartbeatWorker({
  codigo = 'windows-local',
  nombre = 'Worker Social Windows',
  version = '',
  estado = 'online',
  detalle = {},
}) {
  db.prepare(
    `INSERT INTO social_workers (codigo, nombre, estado, version, detalle, ultimo_heartbeat_en)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(codigo) DO UPDATE SET nombre = excluded.nombre, estado = excluded.estado,
      version = excluded.version, detalle = excluded.detalle, ultimo_heartbeat_en = CURRENT_TIMESTAMP,
      actualizado_en = CURRENT_TIMESTAMP`
  ).run(
    clean(codigo, 80),
    clean(nombre, 120),
    clean(estado, 40),
    clean(version, 80),
    json(detalle)
  );
}

module.exports = {
  DESTINATION_TYPES,
  estadoDeDestinoSocial,
  estadoViasSocial,
  listIdentities,
  guardarCredenciales,
  estadoDeCredenciales,
  probarCredenciales,
  listDestinations,
  createDestination,
  updateDestination,
  updateDestinationsBulk,
  deleteDestination,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listSets,
  createSet,
  createCampaign,
  getCampaign,
  listCampaigns,
  queueCampaign,
  cancelCampaign,
  restaurarCampana,
  listarPapelera,
  retryFailedCampaign,
  duplicateCampaign,
  deleteCampaign,
  getMetrics,
  getSocialConfig,
  setSocialConfig,
  pausarTodo,
  reanudarTodo,
  pausarIdentidad,
  reanudarIdentidad,
  claimWork,
  claimApiWork,
  publicarPorApi,
  reportPublication,
  createWorkerCommand,
  reportCommand,
  heartbeatWorker,
  /*
    Se exporta para poder probarla sola.

    `dashboard()` toca una docena de tablas; esta función sólo mira una fila y
    el reloj. Probándola aparte, el test dice exactamente qué se está
    verificando y no se rompe cuando cambia cualquier otra consulta del
    tablero.
  */
  estadoRealDelWorker,
  /* Se exporta para probarla sola: decide en qué formato sale cada destino. */
  formatoParaLaRed,
  /* Se exporta para verificar que cada red reciba su propio texto. */
  textoParaLaRed,
  SILENCIO_MAXIMO_MS,
  dashboard,
  log,
};
