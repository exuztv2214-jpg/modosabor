/**
 * Conectar Facebook con un botón, como lo hace Metricool.
 *
 * ── Qué reemplaza ──────────────────────────────────────────────────────────
 *
 * Antes había que ir a developers.facebook.com, generar un token a mano y
 * pegarlo en un campo. Funciona, pero nadie que no sea programador lo va a
 * hacer, y un token pegado a mano vence a los dos meses sin avisar.
 *
 * Esto es el camino de verdad: tocás "Conectar Facebook", Facebook te pregunta
 * si querés dar permiso, elegís la página y listo. El token lo pide el
 * servidor, lo guarda cifrado y nunca pasa por tus manos ni por la pantalla.
 *
 * ── La buena noticia: no hace falta la App Review ──────────────────────────
 *
 * Meta exige revisión sólo si la app la van a usar personas **sin un rol en la
 * app**. Como acá el único usuario sos vos, y vos sos el administrador de tu
 * propia app, tenés todos los permisos desde el día uno. La app queda en modo
 * desarrollo y funciona igual.
 *
 * Verificado contra la documentación de Meta del 21 de agosto de 2026:
 * "People listed in the Roles section of your App Dashboard — including
 * Admins, Developers and Testers — can grant any permission without review."
 *
 * ── Qué hace falta configurar una sola vez ─────────────────────────────────
 *
 *   FACEBOOK_APP_ID       en las variables del servidor
 *   FACEBOOK_APP_SECRET   ídem, y nunca en el repositorio
 *   PUBLIC_URL            para armar la dirección de vuelta
 *
 * Y en la app de Meta, agregar esa dirección de vuelta a las URIs permitidas.
 */

const crypto = require('crypto');
const db = require('../../db');
const { encriptar } = require('../../utils/encryptConfig');
const { bajarAvatar } = require('./avatares');

const VERSION = 'v25.0';
const DIALOGO = `https://www.facebook.com/${VERSION}/dialog/oauth`;
const GRAPH = `https://graph.facebook.com/${VERSION}`;

/**
 * Los permisos que se piden.
 *
 * Se piden **sólo los que se usan**. Cada permiso de más es una pantalla más
 * intimidante para quien la lee, y una cosa más que explicar si algún día hay
 * que pasar por revisión.
 */
const PERMISOS = [
  'pages_show_list', // para poder listar tus páginas y que elijas cuál
  'pages_manage_posts', // publicar
  'pages_read_engagement', // leer lo publicado
  'read_insights', // alcance e interacciones
  'instagram_basic', // ver la cuenta de Instagram vinculada
  'instagram_content_publish', // publicar en Instagram
  'instagram_manage_comments', // publicar el primer comentario pedido en el compositor
];

/*
  La dirección pública del servidor.

  El proyecto ya venía usando `PUBLIC_API_URL`; yo había escrito `PUBLIC_URL`,
  que no existe en ninguna parte. Con eso, la conexión con Facebook nunca se
  habría podido configurar y el mensaje habría dicho que falta una variable que
  el usuario ya tenía puesta con otro nombre.

  Se acepta `PUBLIC_URL` igual, por si algún día se despliega con ese nombre.
*/
const config = () => ({
  appId: String(process.env.FACEBOOK_APP_ID || '').trim(),
  appSecret: String(process.env.FACEBOOK_APP_SECRET || '').trim(),
  publicUrl: String(process.env.PUBLIC_API_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
});

/**
 * La dirección a la que Facebook devuelve al usuario.
 *
 * ── Por qué se puede fijar a mano ──────────────────────────────────────────
 *
 * Meta **exige HTTPS** en las direcciones de retorno desde 2018, y además usa
 * coincidencia exacta: la dirección tiene que estar escrita igual en la app de
 * Meta y en el pedido, sin un carácter de diferencia.
 *
 * Eso choca con el desarrollo: acá `PUBLIC_API_URL` apunta a
 * `http://192.168.1.92:3001`, una dirección de red local sin HTTPS. Meta la va
 * a rechazar con «URL bloqueada».
 *
 * `FACEBOOK_REDIRECT_URI` permite fijar la dirección exacta que se cargó en la
 * app de Meta, sin tocar el resto de la configuración del sistema. Para probar
 * en la PC alcanza con una de localhost; para producción, el dominio con
 * HTTPS.
 */
const direccionDeVuelta = () => {
  const fijada = String(process.env.FACEBOOK_REDIRECT_URI || '').trim();
  if (fijada) return fijada.replace(/\/+$/, '');
  return `${config().publicUrl}/api/social/oauth/facebook/callback`;
};

/**
 * A dónde se manda al usuario **después** de que Facebook lo devolvió.
 *
 * ── Por qué no alcanza con un redirect relativo ────────────────────────────
 *
 * La ruta de retorno vive en el servidor de la API. Un `res.redirect('/social')`
 * se resuelve contra **ese** host: en producción el panel y la API comparten
 * dominio y funciona, pero en desarrollo la API está en el 3001 y la pantalla
 * en el 5173. El usuario terminaba en `localhost:3001/social` viendo un
 * «Cannot GET /social» — con la conexión ya hecha y guardada, o sea con todo
 * bien pero pareciendo que falló.
 *
 * ── Por qué tiene variable propia y no usa PUBLIC_APP_URL ──────────────────
 *
 * `PUBLIC_APP_URL` es el link que el cliente recibe por WhatsApp para hacer un
 * pedido, y el que se imprime en los tickets. Apuntarla a `localhost` para
 * poder probar Facebook en la PC dejaría a los clientes con un link muerto.
 *
 * Es el mismo motivo por el que `FACEBOOK_REDIRECT_URI` existe aparte de
 * `PUBLIC_API_URL`: probar en la PC no puede costar romper producción.
 *
 * Cuando no hay ninguna de estas variables se devuelve cadena vacía, que deja
 * el salto relativo de siempre: es lo correcto cuando el panel y la API son el
 * mismo servidor.
 */
const dondeVuelveElUsuario = () =>
  String(process.env.FACEBOOK_PANEL_URL || process.env.PUBLIC_APP_URL || '')
    .trim()
    .replace(/\/+$/, '');

/**
 * ¿La dirección de retorno le va a servir a Meta?
 *
 * Se comprueba antes de mandar al usuario a Facebook. Si no, el error aparece
 * recién en la pantalla de Meta —«URL bloqueada»— y desde ahí no hay ninguna
 * pista de qué hay que corregir ni dónde.
 */
function problemaConLaDireccion() {
  const url = direccionDeVuelta();
  const esLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

  if (!url.startsWith('https://') && !esLocalhost) {
    return (
      `Meta sólo acepta direcciones con HTTPS (o localhost para probar). La actual es «${url}». ` +
      'Configurá FACEBOOK_REDIRECT_URI con el dominio público, o con una de localhost para probar en la PC.'
    );
  }
  return '';
}

function estaConfigurado() {
  const { appId, appSecret } = config();
  return Boolean(appId && appSecret && direccionDeVuelta().startsWith('http'));
}

/* ────────────────────────────────────────────────────────────────────────────
   El `state`: lo que impide que alguien te conecte una cuenta ajena
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Un pase de un solo uso que viaja hasta Facebook y vuelve.
 *
 * ── Por qué no alcanza con confiar en la vuelta ────────────────────────────
 *
 * Cualquiera puede armar un link a nuestro `/callback` con un `code` suyo. Si
 * lo aceptáramos, un tercero podría hacer que tu sistema quede conectado a
 * **su** página de Facebook, y desde ahí publicar creyendo que es la tuya.
 *
 * El pase se crea del lado del servidor cuando vos apretás el botón estando
 * con sesión iniciada, se guarda, y se exige de vuelta. Se usa una sola vez y
 * vence a los diez minutos: un pase que se puede reusar es un pase que se
 * puede robar.
 */
function crearPase(usuarioId) {
  const pase = crypto.randomBytes(32).toString('hex');
  db.prepare(
    `INSERT OR REPLACE INTO configuracion (clave, valor)
     VALUES (?, ?)`
  ).run(`social_oauth_pase_${pase}`, JSON.stringify({ usuarioId, creado: Date.now() }));
  return pase;
}

function consumirPase(pase) {
  const clave = `social_oauth_pase_${String(pase || '')}`;
  const fila = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave);
  if (!fila) return null;

  /* Se borra apenas se lee: un solo uso, sin excepciones. */
  db.prepare('DELETE FROM configuracion WHERE clave = ?').run(clave);

  const datos = JSON.parse(fila.valor || '{}');
  const minutos = (Date.now() - Number(datos.creado || 0)) / 60000;
  if (minutos > 10) return null;

  return datos;
}

/** Limpia los pases que quedaron sin usar. */
function limpiarPasesViejos() {
  db.prepare(
    `DELETE FROM configuracion
      WHERE clave LIKE 'social_oauth_pase_%'
        AND CAST(json_extract(valor, '$.creado') AS INTEGER) < ?`
  ).run(Date.now() - 10 * 60 * 1000);
}

/* ────────────────────────────────────────────────────────────────────────────
   El baile con Facebook
   ──────────────────────────────────────────────────────────────────────────── */

/** La dirección a la que hay que mandar al usuario para que dé permiso. */
function urlParaConectar(usuarioId) {
  if (!estaConfigurado()) {
    throw new Error('Falta configurar FACEBOOK_APP_ID y FACEBOOK_APP_SECRET en el servidor.');
  }

  const problema = problemaConLaDireccion();
  if (problema) throw new Error(problema);

  limpiarPasesViejos();

  const parametros = new URLSearchParams({
    client_id: config().appId,
    redirect_uri: direccionDeVuelta(),
    state: crearPase(usuarioId),
    response_type: 'code',
    scope: PERMISOS.join(','),
  });

  return `${DIALOGO}?${parametros}`;
}

async function pedirAMeta(ruta, parametros) {
  const url = `${GRAPH}/${ruta}?${new URLSearchParams(parametros)}`;
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok || datos.error) {
    /*
      El mensaje de Meta se limpia antes de salir de acá: en algunos errores
      devuelve el pedido completo, con el secreto de la app adentro.
    */
    const mensaje = String(datos.error?.message || 'Meta rechazó el pedido')
      .replace(/client_secret=[^&\s]+/gi, 'client_secret=***')
      .replace(/access_token=[^&\s]+/gi, 'access_token=***');
    throw new Error(mensaje);
  }

  return datos;
}

/**
 * Cambia el código que trajo Facebook por un token que dure.
 *
 * ── Por qué son dos pasos y no uno ─────────────────────────────────────────
 *
 * El primer token que da Facebook vive una hora. El segundo pedido lo cambia
 * por uno de sesenta días. Y los tokens de página que se sacan **a partir de
 * uno largo no vencen nunca**, que es lo que hace que esto se conecte una vez
 * y siga andando.
 *
 * Saltear el segundo paso es el error clásico: anda perfecto la primera hora
 * y deja de andar cuando ya nadie se acuerda de haberlo conectado.
 */
async function canjearCodigo(codigo) {
  const { appId, appSecret } = config();

  const corto = await pedirAMeta('oauth/access_token', {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: direccionDeVuelta(),
    code: codigo,
  });

  const largo = await pedirAMeta('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: corto.access_token,
  });

  return largo.access_token;
}

/**
 * Las páginas que administrás, con su token y su Instagram vinculado.
 *
 * Cada página trae **su propio token**. No se usa el token del usuario para
 * publicar: se usa el de la página, que es el que Meta espera y el que
 * sobrevive a que vos cambies la contraseña.
 */
async function paginasDelUsuario(tokenDeUsuario) {
  const datos = await pedirAMeta('me/accounts', {
    access_token: tokenDeUsuario,
    fields: 'id,name,access_token,instagram_business_account{id,username,account_type}',
  });

  return (datos.data || []).map((pagina) => ({
    id: pagina.id,
    nombre: pagina.name,
    token: pagina.access_token,
    instagram: pagina.instagram_business_account
      ? {
          id: pagina.instagram_business_account.id,
          usuario: pagina.instagram_business_account.username || '',
          tipo: pagina.instagram_business_account.account_type || '',
        }
      : null,
  }));
}

/**
 * Guarda las páginas encontradas hasta que la persona elija cuál conectar.
 *
 * Los tokens se guardan cifrados desde este momento, no recién al elegir: en
 * el medio hay un viaje a la pantalla y una decisión humana, y durante ese
 * rato no tienen por qué estar legibles en la base.
 */
function guardarHallazgo(usuarioId, paginas) {
  db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)').run(
    `social_oauth_paginas_${usuarioId}`,
    JSON.stringify({
      creado: Date.now(),
      paginas: paginas.map((p) => ({ ...p, token: encriptar(p.token) })),
    })
  );
}

/** Las páginas que se encontraron, **sin los tokens**, para mostrarlas. */
function paginasEncontradas(usuarioId) {
  const fila = db
    .prepare('SELECT valor FROM configuracion WHERE clave = ?')
    .get(`social_oauth_paginas_${usuarioId}`);
  if (!fila) return [];

  const datos = JSON.parse(fila.valor || '{}');
  /* Media hora para elegir. Después hay que volver a conectar. */
  if ((Date.now() - Number(datos.creado || 0)) / 60000 > 30) return [];

  return (datos.paginas || []).map(({ token: _token, ...resto }) => resto);
}

/**
 * Conecta la página elegida a una identidad del sistema.
 *
 * Devuelve qué quedó conectado para poder decirlo en pantalla: "Modo Sabor
 * Delivery, con Instagram @modosabor" es una confirmación; "listo" no.
 */
/**
 * Deja creados los destinos donde se va a publicar.
 *
 * ── Por qué son dos y no uno ───────────────────────────────────────────────
 *
 * La Fan Page y su Instagram son **dos lugares distintos**: tienen formatos
 * distintos, límites distintos y salen por endpoints distintos de Meta. Que se
 * conecten juntos —porque Meta sólo expone Instagram a través de la página— no
 * los hace el mismo destino.
 *
 * ── Por qué no se duplican ─────────────────────────────────────────────────
 *
 * `ON CONFLICT DO UPDATE` sobre la clave única. Reconectar la página tiene que
 * poder hacerse mil veces —para renovar el token, para cambiar de página— sin
 * que la lista de destinos se llene de copias.
 */
function crearDestinosDeLaPagina(cuentaId, pagina) {
  const guardar = db.prepare(
    `INSERT INTO social_destinations
      (provider, cuenta_id, tipo, identificador_externo, nombre, url, metadata, habilitada, execution_class, provider_clave)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'api', ?)
     ON CONFLICT(provider, cuenta_id, tipo, identificador_externo)
     DO UPDATE SET nombre = excluded.nombre, url = excluded.url, habilitada = 1,
                   metadata = excluded.metadata, execution_class = 'api',
                   provider_clave = excluded.provider_clave`
  );

  guardar.run(
    'facebook',
    cuentaId,
    'facebook_page',
    String(pagina.id),
    pagina.nombre,
    `https://www.facebook.com/${pagina.id}`,
    '{}',
    'facebook_page_api'
  );

  if (pagina.instagram?.id) {
    guardar.run(
      'facebook',
      cuentaId,
      'instagram_feed',
      String(pagina.instagram.id),
      pagina.instagram.usuario ? `@${pagina.instagram.usuario}` : 'Instagram',
      pagina.instagram.usuario ? `https://www.instagram.com/${pagina.instagram.usuario}/` : '',
      JSON.stringify({ accountType: pagina.instagram.tipo || '' }),
      'instagram_feed_api'
    );
  }

  /*
    Las fotos de perfil, después de que existan los destinos.

    Va sin `await` a propósito. Conectar una página tiene que contestar apenas
    quedó conectada: son dos viajes más a Meta y la persona está mirando una
    pantalla que dice "conectando". Si la foto tarda o falla, la conexión ya
    está hecha igual y la vista previa muestra la inicial hasta la próxima
    sincronización.
  */
  bajarAvataresDeLaCuenta(cuentaId).catch(() => {});
}

/**
 * Baja las fotos de perfil de los destinos por API de una identidad.
 *
 * Se usa al conectar y también sola, desde la pantalla, para las conexiones
 * que ya existían antes de que esto estuviera escrito — que es el caso de la
 * Fan Page y el Instagram que ya estaban andando.
 */
async function bajarAvataresDeLaCuenta(cuentaId) {
  const cuenta = db
    .prepare('SELECT metadata FROM social_accounts WHERE id = ?')
    .get(Number(cuentaId));
  const tokenCifrado = JSON.parse(cuenta?.metadata || '{}').token;
  if (!tokenCifrado) return [];

  const destinos = db
    .prepare(
      `SELECT id, tipo, identificador_externo FROM social_destinations
        WHERE cuenta_id = ? AND execution_class = 'api'`
    )
    .all(Number(cuentaId));

  const resultados = [];
  for (const destino of destinos) {
    /*
      De a uno, no en paralelo. Son dos o tres destinos por identidad: el
      paralelismo no ahorra nada perceptible y multiplica las chances de
      chocar con el límite de llamadas de Meta, que responde con un error
      genérico difícil de distinguir de un token vencido.
    */
    const avatar = await bajarAvatar({
      destinoId: destino.id,
      tipo: destino.tipo,
      idExterno: destino.identificador_externo,
      tokenCifrado,
    });
    resultados.push({ destinoId: destino.id, nombre: destino.tipo, avatar });
  }

  return resultados;
}

function conectarPagina({ usuarioId, pageId, cuentaId }) {
  const fila = db
    .prepare('SELECT valor FROM configuracion WHERE clave = ?')
    .get(`social_oauth_paginas_${usuarioId}`);
  if (!fila) throw new Error('La conexión venció. Volvé a tocar «Conectar Facebook».');

  const datos = JSON.parse(fila.valor || '{}');
  const pagina = (datos.paginas || []).find((p) => String(p.id) === String(pageId));
  if (!pagina) throw new Error('Esa página no estaba entre las que encontramos.');

  const cuenta = db
    .prepare('SELECT id, metadata FROM social_accounts WHERE id = ?')
    .get(Number(cuentaId));
  if (!cuenta) throw new Error('No existe esa identidad');

  const metadata = JSON.parse(cuenta.metadata || '{}');
  metadata.token = pagina.token; // ya viene cifrado
  metadata.pageId = pagina.id;
  metadata.pageNombre = pagina.nombre;
  delete metadata.verificaciones;
  if (pagina.instagram) {
    metadata.igId = pagina.instagram.id;
    metadata.igUsuario = pagina.instagram.usuario;
    metadata.igAccountType = pagina.instagram.tipo || '';
  }

  db.prepare('UPDATE social_accounts SET metadata = ? WHERE id = ?').run(
    JSON.stringify(metadata),
    cuenta.id
  );

  /*
    ── Los destinos, que faltaban ──────────────────────────────────────────

    Conectar guardaba el token y el ID de Instagram en la identidad, y ahí
    terminaba. Pero **el sistema no publica en identidades: publica en
    destinos**, y nadie los creaba.

    El resultado era el peor de los posibles: la pantalla decía "Conectada, con
    Instagram @modosaborok" —cierto— y después no aparecía Instagram por ningún
    lado para elegir. Todo bien, nada roto, imposible de usar.

    Conectar una página tiene que dejar listo lo que hace falta para publicar
    en ella. Si no, no conectó nada.
  */
  crearDestinosDeLaPagina(cuenta.id, pagina);

  /* Ya se usó: no tiene por qué seguir dando vueltas. */
  db.prepare('DELETE FROM configuracion WHERE clave = ?').run(`social_oauth_paginas_${usuarioId}`);

  return {
    pagina: pagina.nombre,
    pageId: pagina.id,
    instagram: pagina.instagram?.usuario || null,
  };
}

module.exports = {
  estaConfigurado,
  problemaConLaDireccion,
  urlParaConectar,
  consumirPase,
  canjearCodigo,
  paginasDelUsuario,
  guardarHallazgo,
  paginasEncontradas,
  conectarPagina,
  /* Se exporta para probarla sola: es la que crea dónde publicar. */
  crearDestinosDeLaPagina,
  bajarAvataresDeLaCuenta,
  direccionDeVuelta,
  dondeVuelveElUsuario,
  PERMISOS,
};
