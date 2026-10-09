/**
 * El motor de la extensión.
 *
 * ── Qué reemplaza y por qué ────────────────────────────────────────────────
 *
 * Antes esto era un programa de escritorio en Electron: había que instalarlo,
 * abrir un Chrome aparte con un puerto de depuración, copiar una clave de un
 * archivo `.env` a una ventana, y dejarlo prendido. Cinco cosas que fallan por
 * separado y ninguna con forma de botón.
 *
 * Acá vive adentro del Chrome que ya está abierto, con la sesión de Facebook
 * que ya está iniciada. No hay puerto, ni perfil aparte, ni programa que
 * prender.
 *
 * ── Por qué sigue siendo un navegador y no una API ─────────────────────────
 *
 * Meta eliminó la API de grupos en abril de 2024: `publish_to_groups` no
 * existe más en ninguna versión. Publicar en un grupo del que sos **miembro**
 * sólo se puede haciendo lo mismo que haría una persona.
 *
 * La Fan Page e Instagram no pasan por acá: eso sale del servidor por la API
 * oficial, sin navegador y sin que la PC esté prendida.
 *
 * ── El ritmo ───────────────────────────────────────────────────────────────
 *
 * El servidor decide cuándo sale cada publicación —cupo diario, descanso por
 * grupo, intervalo con variación—. Acá no se decide nada de eso: se pregunta
 * "¿hay algo?" y se hace. Duplicar esa lógica sería tener dos frenos que se
 * pueden desincronizar, y el que falle va a ser el que importaba.
 */

const CADA_SEGUNDOS = 20;

/* ────────────────────────────────────────────────────────────────────────────
   Lo que la extensión recuerda
   ──────────────────────────────────────────────────────────────────────────── */

const leer = () => chrome.storage.local.get(['servidor', 'clave', 'ultimo', 'ultimoError']);
const guardar = (datos) => chrome.storage.local.set(datos);

/*
  Opciones de la ventanita. Por omisión: la pestaña de publicar queda en
  segundo plano y hay avisos de Windows al publicar o al fallar.
*/
const OPCIONES_POR_OMISION = { verPestana: false, avisos: true };
async function opciones() {
  const { opciones: guardadas } = await chrome.storage.local.get(['opciones']);
  return { ...OPCIONES_POR_OMISION, ...(guardadas || {}) };
}

/* Hasta cuántas fotos y de qué tamaño. Facebook acepta más, pero cada foto
   viaja dentro de la página y conviene no pasar de esto. */
const MAX_FOTOS = 10;
const MAX_BYTES_FOTO = 8 * 1024 * 1024;

async function pedir(ruta, cuerpo) {
  const { servidor, clave } = await leer();
  if (!servidor || !clave) throw new Error('SIN_VINCULAR');

  const respuesta = await fetch(`${servidor.replace(/\/+$/, '')}${ruta}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-social-worker-key': clave,
      'x-social-worker-code': 'chrome-extension',
      /* Versión 2: sabe subir fotos a los posteos. */
      'x-social-worker-media': '1',
    },
    body: JSON.stringify(cuerpo || {}),
  });

  if (respuesta.status === 401) {
    /*
      La clave dejó de servir. Se borra en vez de reintentar para siempre: una
      extensión que golpea un servidor que la rechaza cada veinte segundos es
      una extensión que va a terminar bloqueada.
    */
    await guardar({ clave: '', ultimoError: 'La vinculación con el panel dejó de valer.' });
    throw new Error('SIN_VINCULAR');
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error || `El panel respondió ${respuesta.status}`);
  return datos;
}

/**
 * Baja una foto de la campaña desde el panel y la devuelve en base64, que es
 * como puede viajar hasta la página de Facebook.
 */
async function bajarFoto({ id, nombre, mime }) {
  const { servidor, clave } = await leer();
  const respuesta = await fetch(`${servidor.replace(/\/+$/, '')}/media/${id}`, {
    headers: { 'x-social-worker-key': clave, 'x-social-worker-code': 'chrome-extension' },
  });
  if (!respuesta.ok)
    throw new Error(`No pude bajar la foto «${nombre || id}» (${respuesta.status}).`);
  const bytes = new Uint8Array(await respuesta.arrayBuffer());
  if (bytes.length > MAX_BYTES_FOTO) {
    throw new Error(`La foto «${nombre || id}» pesa más de 8 MB: achicala antes de publicarla.`);
  }
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return {
    nombre: nombre || `foto-${id}.jpg`,
    mime: mime || respuesta.headers.get('content-type') || 'image/jpeg',
    base64: btoa(binario),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Avisos, insignia y contadores del día
   ──────────────────────────────────────────────────────────────────────────── */

const hoyLocal = () => new Date().toLocaleDateString('en-CA');

async function contadores() {
  const { contadores: c } = await chrome.storage.local.get(['contadores']);
  return c && c.fecha === hoyLocal() ? c : { fecha: hoyLocal(), publicadas: 0, fallidas: 0 };
}

async function sumar(campo) {
  const c = await contadores();
  c[campo] = (c[campo] || 0) + 1;
  await guardar({ contadores: c });
  await actualizarInsignia();
}

/**
 * La insignia del ícono dice el estado sin abrir nada: cuántas publicó hoy,
 * «!» si lo último falló, «II» si está pausada.
 */
async function actualizarInsignia() {
  const { clave, pausada, ultimoError } = await chrome.storage.local.get([
    'clave',
    'pausada',
    'ultimoError',
  ]);
  const c = await contadores();
  let texto = '';
  let color = '#12b76a';
  if (!clave) {
    texto = '?';
    color = '#98a2b3';
  } else if (pausada) {
    texto = 'II';
    color = '#f79009';
  } else if (ultimoError) {
    texto = '!';
    color = '#e3242b';
  } else if (c.publicadas) {
    texto = String(c.publicadas);
  }
  await chrome.action.setBadgeText({ text: texto });
  await chrome.action.setBadgeBackgroundColor({ color });
}

async function avisar(titulo, mensaje) {
  if (!(await opciones()).avisos) return;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icono-128.png',
    title: titulo,
    message: String(mensaje || '').slice(0, 240),
    priority: 1,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Vincularse
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Canjea el código del panel por la clave.
 *
 * El código dura cinco minutos y sirve una sola vez. La clave no vence, así
 * que no viaja por la página ni queda en ningún historial: la pide la
 * extensión, directo al servidor.
 */
async function vincular({ servidor, codigo }) {
  const base = String(servidor || '').replace(/\/+$/, '');
  if (!base || !codigo) throw new Error('El panel mandó una vinculación incompleta.');

  const respuesta = await fetch(`${base}/vincular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo }),
  });

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || !datos.clave) {
    throw new Error(datos.error || 'El panel no aceptó la vinculación.');
  }

  await guardar({ servidor: base, clave: datos.clave, ultimoError: '' });
  await latir();
  return true;
}

/* ────────────────────────────────────────────────────────────────────────────
   Facebook
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Abre una pestaña, hace algo adentro, y la cierra.
 *
 * ── Por qué una pestaña nueva y no la que esté abierta ─────────────────────
 *
 * Si usara la pestaña de Facebook que la persona tiene abierta, la publicación
 * le movería la pantalla de abajo de las manos mientras está leyendo algo. Una
 * pestaña propia se abre, hace lo suyo y desaparece.
 *
 * Se abre en segundo plano (`active: false`) por el mismo motivo.
 */
async function enUnaPestana(url, funcion, argumentos = [], { visible = false } = {}) {
  const pestana = await chrome.tabs.create({ url, active: visible });

  try {
    await esperarCarga(pestana.id);

    const [resultado] = await chrome.scripting.executeScript({
      target: { tabId: pestana.id },
      func: funcion,
      args: argumentos,
      world: 'MAIN',
    });

    return resultado?.result;
  } finally {
    await chrome.tabs.remove(pestana.id).catch(() => {});
  }
}

/**
 * Espera a que la pestaña termine de cargar.
 *
 * ── Por qué se pregunta en vez de escuchar ─────────────────────────────────
 *
 * La primera versión escuchaba el evento `tabs.onUpdated` con
 * `status === 'complete'`. Tenía una condición de carrera: el escucha se
 * agregaba **después** de crear la pestaña, así que si la página cargaba
 * rápido, el evento ya había pasado y la promesa se quedaba esperando algo que
 * nunca iba a volver a ocurrir.
 *
 * El resultado era "Facebook tardó demasiado en cargar" con Facebook cargado
 * hace cuarenta segundos.
 *
 * Preguntando el estado en un ciclo no hay carrera posible: si ya terminó, la
 * primera pregunta lo dice.
 */
async function esperarCarga(tabId, techoMs = 45000) {
  const hasta = Date.now() + techoMs;

  while (Date.now() < hasta) {
    let pestana;
    try {
      pestana = await chrome.tabs.get(tabId);
    } catch {
      throw new Error('La pestaña se cerró antes de terminar.');
    }

    if (pestana.status === 'complete') return;
    await new Promise((r) => setTimeout(r, 300));
  }

  /*
    Se sigue igual en vez de fallar.

    Facebook a veces deja la pestaña en "cargando" para siempre por algún
    pedido que nunca cierra, con la pantalla ya dibujada y usable. La función
    que corre adentro espera al elemento que necesita, así que puede arreglarse
    sola. Fallar acá sería frenar por un semáforo que no mira la calle.
  */
}

/**
 * Cambia la identidad activa dentro de Facebook usando su selector visible.
 * Corre en la página, así que es autocontenida y no depende del código de la
 * extensión. Devuelve un diagnóstico en vez de adivinar que el clic funcionó.
 */
async function cambiarIdentidadEnLaPagina(nombreBuscado) {
  const normalizar = (valor) =>
    String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const esperar = async (condicion, techoMs = 15000) => {
    const hasta = Date.now() + techoMs;
    while (Date.now() < hasta) {
      const valor = condicion();
      if (valor) return valor;
      await new Promise((r) => setTimeout(r, 350));
    }
    return null;
  };

  const menu = await esperar(() =>
    document.querySelector('[aria-label*="Tu perfil"], [aria-label*="Your profile"]')
  );
  if (!menu) return { ok: false, motivo: 'No apareció el menú del perfil de Facebook.' };
  menu.click();

  const objetivo = normalizar(nombreBuscado);
  const yaSeleccionada = await esperar(
    () =>
      [...document.querySelectorAll('[aria-label]')].find((elemento) => {
        const etiqueta = normalizar(elemento.getAttribute('aria-label'));
        return (
          etiqueta === `${objetivo}, seleccionado actualmente` ||
          etiqueta === `${objetivo}, currently selected`
        );
      }),
    3500
  );
  if (yaSeleccionada) {
    return { ok: true, nombre: nombreBuscado, yaActiva: true };
  }

  const verTodos = await esperar(
    () =>
      [...document.querySelectorAll('[role="button"], a, span')].find((elemento) =>
        /^(ver todos los perfiles|see all profiles)$/i.test((elemento.textContent || '').trim())
      ),
    5000
  );
  verTodos?.closest?.('[role="button"], a')?.click?.();
  if (verTodos) await new Promise((r) => setTimeout(r, 900));

  const seleccionadaEnListaCompleta = [...document.querySelectorAll('[aria-label]')].find(
    (elemento) => {
      const etiqueta = normalizar(elemento.getAttribute('aria-label'));
      return (
        etiqueta === `${objetivo}, seleccionado actualmente` ||
        etiqueta === `${objetivo}, currently selected`
      );
    }
  );
  if (seleccionadaEnListaCompleta) {
    return { ok: true, nombre: nombreBuscado, yaActiva: true };
  }

  const opcionDirecta = await esperar(() =>
    [...document.querySelectorAll('[role="button"][aria-label]')].find((elemento) => {
      const etiqueta = normalizar(elemento.getAttribute('aria-label'));
      return etiqueta === `cambiar a ${objetivo}` || etiqueta === `switch to ${objetivo}`;
    })
  );
  const textoExacto = await esperar(() =>
    [...document.querySelectorAll('[role="button"], [role="link"], a, span')].find(
      (elemento) => normalizar(elemento.textContent) === objetivo
    )
  );
  const opcion =
    opcionDirecta || textoExacto?.closest?.('[role="button"], [role="link"], a') || textoExacto;
  if (!opcion) {
    const disponibles = [...document.querySelectorAll('[role="button"], [role="link"]')]
      .map((elemento) => (elemento.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((texto) => texto && texto.length <= 120)
      .slice(0, 20);
    return {
      ok: false,
      motivo: `Facebook no mostró la identidad «${nombreBuscado}».`,
      disponibles,
    };
  }

  opcion.click();
  await new Promise((r) => setTimeout(r, 700));

  /*
    Facebook a veces no cambia de identidad con el primer clic: abre una
    confirmación «Cambiar ahora». Si no se confirma, la pantalla parece haber
    aceptado la Page pero `/me` sigue siendo el Perfil. Ese era el motivo por
    el que ambos terminaban con los mismos grupos.
  */
  const confirmar = await esperar(
    () =>
      [...document.querySelectorAll('[role="button"], button')].find((elemento) =>
        /^(cambiar( ahora)?|continuar|switch( now)?|continue)$/i.test(
          (elemento.textContent || elemento.getAttribute('aria-label') || '').trim()
        )
      ),
    5000
  );
  const botonConfirmar = confirmar?.closest?.('[role="button"], button') || confirmar;
  botonConfirmar?.click?.();
  if (botonConfirmar) await new Promise((r) => setTimeout(r, 1200));

  return { ok: true, nombre: nombreBuscado, confirmacion: Boolean(botonConfirmar) };
}

async function datosDeLaIdentidadActiva(tabId, nombreEsperado = '') {
  await chrome.tabs.update(tabId, { url: 'https://www.facebook.com/me/' });
  await esperarCarga(tabId);
  await new Promise((r) => setTimeout(r, 1200));
  const [resultado] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (objetivoCrudo) => {
      const limpiar = (valor) =>
        String(valor || '')
          .replace(/^\(\d+\+?\)\s*/, '')
          .replace(/\s*[|·-]\s*Facebook.*$/i, '')
          .trim();
      const normalizar = (valor) =>
        limpiar(valor)
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .toLowerCase();
      const objetivo = normalizar(objetivoCrudo);
      const hasta = Date.now() + 10000;
      while (Date.now() < hasta) {
        if (objetivo) {
          const encabezadoExacto = [
            ...document.querySelectorAll('h1, [role="heading"], .html-h1, .html-h2, .html-h3'),
          ].find((elemento) => normalizar(elemento.textContent) === objetivo);
          if (encabezadoExacto) return limpiar(encabezadoExacto.textContent);
        } else {
          const titulo = limpiar(document.title);
          if (titulo && !/^(facebook|inicio|home)$/i.test(titulo)) return titulo;
          const encabezado = limpiar(
            document.querySelector(
              'h1, [role="heading"][aria-level="1"], .html-h1, .html-h2, .html-h3'
            )?.textContent
          );
          if (encabezado && !/^(facebook|inicio|home)$/i.test(encabezado)) return encabezado;
        }
        await new Promise((resolver) => setTimeout(resolver, 350));
      }
      const tituloFinal = limpiar(document.title);
      if (!/^(facebook|inicio|home)$/i.test(tituloFinal)) return tituloFinal;
      return limpiar(
        document.querySelector('h1, [role="heading"], .html-h1, .html-h2, .html-h3')?.textContent
      );
    },
    args: [nombreEsperado],
  });
  const pestana = await chrome.tabs.get(tabId);
  const urlCruda = String(pestana?.url || '');
  let urlIdentidad = urlCruda;
  try {
    const url = new URL(urlCruda);
    const id = url.searchParams.get('id');
    urlIdentidad = `${url.origin}${url.pathname}${id ? `?id=${encodeURIComponent(id)}` : ''}`;
  } catch {
    /* Si Facebook entrega una URL transitoria, se conserva para diagnosticar. */
  }
  return {
    nombre: String(resultado?.result || '').trim(),
    url: urlIdentidad,
  };
}

async function nombreDeIdentidadSeleccionada(tabId) {
  const [resultado] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async () => {
      const esperar = async (condicion, techoMs = 8000) => {
        const hasta = Date.now() + techoMs;
        while (Date.now() < hasta) {
          const valor = condicion();
          if (valor) return valor;
          await new Promise((resolver) => setTimeout(resolver, 300));
        }
        return null;
      };
      const menu = await esperar(() =>
        document.querySelector('[aria-label*="Tu perfil"], [aria-label*="Your profile"]')
      );
      if (!menu) return '';
      menu.click();

      const verTodos = await esperar(
        () =>
          [...document.querySelectorAll('[role="button"], a, span')].find((elemento) =>
            /^(ver todos los perfiles|see all profiles)$/i.test((elemento.textContent || '').trim())
          ),
        4000
      );
      verTodos?.closest?.('[role="button"], a')?.click?.();

      const seleccionada = await esperar(() =>
        [...document.querySelectorAll('[aria-label]')].find((elemento) =>
          /,\s*(seleccionado actualmente|currently selected)$/i.test(
            elemento.getAttribute('aria-label') || ''
          )
        )
      );
      const etiqueta = seleccionada?.getAttribute('aria-label') || '';
      return etiqueta.replace(/,\s*(seleccionado actualmente|currently selected)$/i, '').trim();
    },
  });
  return String(resultado?.result || '').trim();
}

async function cambiarIdentidadDePestana(tabId, nombre) {
  await chrome.tabs.update(tabId, { url: 'https://www.facebook.com/' });
  await esperarCarga(tabId);
  let resultado = null;
  try {
    [resultado] = await chrome.scripting.executeScript({
      target: { tabId },
      func: cambiarIdentidadEnLaPagina,
      args: [nombre],
      world: 'MAIN',
    });
  } catch (error) {
    /*
      Al cambiar de perfil Facebook recarga la página y destruye el contexto
      donde corría el script. Eso es una señal compatible con un cambio real,
      no un fracaso. La comprobación autoritativa se hace después con `/me`.
    */
    if (!/context|frame|navigat|removed|destroyed/i.test(String(error?.message || error))) {
      throw error;
    }
  }
  if (resultado?.result && !resultado.result.ok) {
    throw new Error(
      resultado?.result?.motivo || `No se pudo cambiar la identidad de Facebook a «${nombre}».`
    );
  }
  await new Promise((r) => setTimeout(r, 1800));
  await esperarCarga(tabId);
  return resultado?.result || { ok: true, navegacion: true };
}

async function completarAvataresDeGrupos(tabId, grupos = []) {
  const faltantes = grupos.filter((grupo) => !grupo.avatarUrl && grupo.url).slice(0, 60);
  for (const grupo of faltantes) {
    await chrome.tabs.update(tabId, { url: grupo.url });
    await esperarCarga(tabId);
    await new Promise((r) => setTimeout(r, 650));
    const [resultado] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const meta = document.querySelector(
          'meta[property="og:image"], meta[name="twitter:image"]'
        );
        const desdeMeta = meta?.content || '';
        if (/^https:\/\//i.test(desdeMeta)) return desdeMeta;
        const imagen = [...document.querySelectorAll('img')].find((elemento) =>
          /(?:fbcdn\.net|facebook\.com)/i.test(elemento.currentSrc || elemento.src || '')
        );
        return imagen?.currentSrc || imagen?.src || '';
      },
    });
    const avatarUrl = String(resultado?.result || '').trim();
    if (/^https:\/\//i.test(avatarUrl)) grupo.avatarUrl = avatarUrl;
  }
  return grupos;
}

async function leerGruposDeIdentidad(payload = {}) {
  const tipo = String(payload.identityTipo || '').toLowerCase();
  const nombre = String(payload.identityNombre || '').trim();
  const esPagina = tipo === 'page';
  const esPerfil = tipo === 'perfil';
  const pestana = await chrome.tabs.create({ url: 'https://www.facebook.com/me/', active: false });
  let anterior = { nombre: '', url: '' };
  let actual = { nombre: '', url: '' };

  try {
    await esperarCarga(pestana.id);
    anterior = await datosDeLaIdentidadActiva(pestana.id);

    if (esPagina || esPerfil) {
      if (!nombre)
        throw new Error('El panel no indicó el nombre real de la identidad de Facebook.');
      await cambiarIdentidadDePestana(pestana.id, nombre);
      actual = await datosDeLaIdentidadActiva(pestana.id, nombre);
      const identidadSeleccionada = await nombreDeIdentidadSeleccionada(pestana.id);
      const normalizar = (valor) =>
        String(valor || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      const coincideTitulo = normalizar(actual.nombre) === normalizar(nombre);
      const coincideSelector = normalizar(identidadSeleccionada) === normalizar(nombre);
      if (!coincideTitulo && !coincideSelector) {
        throw new Error(
          `Facebook quedó en «${identidadSeleccionada || actual.nombre || 'una identidad desconocida'}» en vez de «${nombre}».`
        );
      }
    } else {
      actual = anterior;
    }

    await chrome.tabs.update(pestana.id, {
      url: 'https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added',
    });
    await esperarCarga(pestana.id);
    const [resultado] = await chrome.scripting.executeScript({
      target: { tabId: pestana.id },
      func: leerGruposEnLaPagina,
      world: 'MAIN',
    });
    const lectura = resultado?.result || {};
    lectura.grupos = await completarAvataresDeGrupos(pestana.id, lectura.grupos || []);
    lectura.identityUrl = actual.url;
    return lectura;
  } finally {
    if (
      (esPagina || esPerfil) &&
      anterior.nombre &&
      anterior.nombre.toLowerCase() !== nombre.toLowerCase()
    ) {
      await cambiarIdentidadDePestana(pestana.id, anterior.nombre).catch(() => {});
    }
    await chrome.tabs.remove(pestana.id).catch(() => {});
  }
}

/**
 * Lee los grupos a los que pertenece la identidad activa.
 *
 * Corre adentro de la página de Facebook, así que no puede usar nada de acá:
 * todo lo que necesita tiene que estar escrito adentro de la función.
 */
async function leerGruposEnLaPagina() {
  /*
    ── Por qué se espera al elemento y no un tiempo fijo ────────────────────

    La pestaña se abre en segundo plano para no taparle la pantalla a nadie, y
    Chrome **frena el renderizado de las pestañas de fondo**: temporizadores
    lentos, dibujado diferido. Facebook es una aplicación que se arma sola con
    JavaScript, así que cuando la pestaña dice "cargué", la pantalla todavía
    puede estar vacía.

    Con una espera fija de dos segundos y medio el botón de perfil a veces no
    había aparecido, y la extensión informaba "no hay sesión de Facebook" con
    la sesión perfectamente abierta.

    Esperar al elemento en vez del reloj funciona igual en una PC rápida que en
    una lenta, y sin inventar un número.
  */
  const esperarA = async (selector, techoMs = 25000) => {
    const hasta = Date.now() + techoMs;
    while (Date.now() < hasta) {
      const encontrado = document.querySelector(selector);
      if (encontrado) return encontrado;
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  };

  await esperarA('[aria-label*="Tu perfil"], [aria-label*="Your profile"], input[name="email"]');

  /*
    ── Bajar hasta el final antes de leer ───────────────────────────────────

    Facebook carga la lista de grupos de a pedazos, a medida que bajás. Leer la
    pantalla apenas carga trae los dos o tres que entraron en el alto de la
    ventana — y con eso el sistema creía que tenías dos grupos.

    Se baja hasta que la cantidad de links deje de crecer dos veces seguidas.
    Contar los links y no las vueltas hace que funcione igual con cinco grupos
    que con ochenta, sin inventar un número de scrolls.

    El tope de vueltas existe igual: si Facebook cargara para siempre, esto se
    quedaría bajando hasta que se venza el lock del comando.
  */
  const encontrados = new Map();

  /*
    Facebook virtualiza la lista: mientras bajamos, saca del DOM las tarjetas
    que quedaron arriba. Si esperamos hasta el final para leerlas, conservamos
    los nombres que aparecen en otros links de la página pero perdemos muchas
    fotos. Por eso acumulamos cada tarjeta visible en cada paso del scroll.
  */
  const recolectarVisibles = () => {
    document.querySelectorAll('a[href*="/groups/"]').forEach((link) => {
      const href = link.href || '';
      const match = href.match(/facebook\.com\/groups\/([^/?#]+)/i);
      const nombre = (link.textContent || '').replace(/\s+/g, ' ').trim();

      if (!match || !nombre) return;
      if (/^(joined|joins|feed|discover|create|browse)$/i.test(match[1])) return;

      const limpio = nombre
        .replace(/Activo por última vez.*$/i, '')
        .replace(/Last active.*$/i, '')
        .replace(/\d+\s*miembros?.*$/i, '')
        .trim()
        .slice(0, 200);

      const NO_SON_GRUPOS =
        /^(ver (todo|grupo|m[áa]s)|unirte|descubrir|crear|tus grupos|inicio|see all)$/i;
      if (!limpio || limpio.length < 3 || NO_SON_GRUPOS.test(limpio)) return;

      const repetido = [...encontrados.entries()].find(
        ([id, grupo]) => id !== match[1] && grupo.nombre === limpio
      );
      if (repetido) return;

      let contenedor = link;
      let imagen = link.querySelector('img, image');
      for (let nivel = 0; !imagen && contenedor && nivel < 4; nivel += 1) {
        contenedor = contenedor.parentElement;
        imagen = contenedor?.querySelector?.('img, image') || null;
      }
      const avatarUrl =
        imagen?.src || imagen?.getAttribute?.('href') || imagen?.getAttribute?.('xlink:href') || '';

      const anterior = encontrados.get(match[1]);
      encontrados.set(match[1], {
        id: match[1],
        nombre: limpio,
        url: href.split('?')[0],
        ...(avatarUrl || anterior?.avatarUrl ? { avatarUrl: avatarUrl || anterior.avatarUrl } : {}),
      });
    });
  };

  const bajarHastaElFinal = async () => {
    let anterior = -1;
    let quietas = 0;

    for (let vuelta = 0; vuelta < 40 && quietas < 2; vuelta += 1) {
      recolectarVisibles();
      const cuantos = document.querySelectorAll('a[href*="/groups/"]').length;
      quietas = cuantos === anterior ? quietas + 1 : 0;
      anterior = cuantos;

      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 1200));
    }
  };

  if (/\/groups\/(joins|feed)/i.test(location.pathname)) {
    await bajarHastaElFinal();
  }
  recolectarVisibles();

  /*
    ── Dos preguntas distintas, y confundirlas costó una tarde ──────────────

    "¿Hay sesión iniciada?" y "¿con qué identidad?" no son lo mismo.

    La primera versión sacaba las dos del mismo lugar: leía la etiqueta del
    botón de perfil y le quitaba el prefijo "Tu perfil". Yo daba por hecho que
    la etiqueta decía "Tu perfil, Modo Sabor" — y dice sólo **"Tu perfil"**.
    Quitado el prefijo quedaba vacío, y el vacío se interpretaba como que no
    había sesión.

    Resultado: con la sesión abierta y funcionando, el panel informaba
    `facebook_session: EXPIRED` y mandaba a iniciar sesión de nuevo. Otra vez
    una pantalla afirmando algo falso con total seguridad.

    Ahora la sesión se decide por lo que sí es confiable —hay botón de perfil y
    no hay formulario de login— y el nombre queda como dato aparte, que puede
    faltar sin que eso signifique nada malo.
  */
  const boton = document.querySelector('[aria-label*="Tu perfil"], [aria-label*="Your profile"]');
  const hayLogin = Boolean(document.querySelector('input[name="email"]'));
  const haySesion = Boolean(boton) && !hayLogin;

  /*
    Facebook no siempre pone el nombre en el botón. Cuando no está, queda vacío
    y se sigue: para leer los grupos no hace falta saber cómo te llamás.
  */
  const identidad = (boton?.getAttribute('aria-label') || '')
    .replace(/^(Tu perfil|Your profile)[,:\s]*/i, '')
    .trim();
  const imagenIdentidad = boton?.querySelector?.('img, image');
  const avatarIdentidad =
    imagenIdentidad?.src ||
    imagenIdentidad?.getAttribute?.('href') ||
    imagenIdentidad?.getAttribute?.('xlink:href') ||
    '';

  return {
    grupos: [...encontrados.values()],
    identidad,
    ...(avatarIdentidad ? { avatarIdentidad } : {}),
    haySesion,
    /*
      Para poder diagnosticar sin adivinar cuando algo no cierra: si mañana
      vuelve a decir que no hay sesión, esto dice si el problema fue que no
      apareció el botón, que apareció el formulario de login, o que la pantalla
      cargó pero sin links de grupos.
    */
    diagnostico: {
      titulo: document.title,
      url: location.href,
      habiaBoton: Boolean(boton),
      habiaLogin: hayLogin,
      linksDeGrupos: document.querySelectorAll('a[href*="/groups/"]').length,
    },
  };
}

/**
 * Escribe y publica en el grupo abierto.
 *
 * ── Lo frágil, dicho en voz alta ───────────────────────────────────────────
 *
 * Facebook cambia su pantalla seguido y no tiene identificadores estables. Se
 * busca por el texto accesible —"Escribí algo", "Publicar"— porque es lo que
 * más aguanta, pero va a romperse alguna vez.
 *
 * Cuando eso pase, esto devuelve un motivo entendible en vez de decir que
 * publicó. Es la diferencia entre "revisá el grupo" y creer que salió algo que
 * nunca salió.
 */
async function publicarEnLaPagina(texto, fotos = []) {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  const buscarPorTexto = (selector, patron) =>
    [...document.querySelectorAll(selector)].find((el) =>
      patron.test(`${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`)
    );

  /*
    ── Cómo se llama el botón de escribir, en serio ──────────────────────────

    El patrón anterior era `/Escrib[íi] algo|.../` y ahí faltaba la mitad de
    los casos:

      · «Escribe algo» — el español neutro, que es lo que Facebook usa en la
        mayoría de los grupos aunque la cuenta esté en español de Argentina.
        `[íi]` no matchea la «e», así que ese caso —el más común— no entraba.
      · «¿Qué estás pensando?» — el texto del compositor cuando el grupo lo
        muestra igual que el muro.
      · «Escribir algo», «Publicá algo», y los mismos en inglés.

    Cinco grupos fallaron seguidos por esto y el sistema pausó la identidad
    sola, que fue lo único que funcionó bien.
  */
  const PATRON_COMPOSITOR =
    /Escrib[eíi]r?\s+algo|Publi[cq][áa]\s+algo|Qu[ée]\s+est[áa]s\s+pensando|Write\s+something|What'?s\s+on\s+your\s+mind|Crear\s+(una\s+)?publicaci[óo]n|Create\s+(a\s+)?post/i;

  /*
    ── Se espera, no se falla al primer intento ──────────────────────────────

    Facebook es una aplicación de una sola página: cuando la pestaña termina de
    cargar, el compositor todavía no existe. Y las pestañas en segundo plano
    —que es como las abre la extensión, para no robarte el foco— dibujan más
    lento todavía.

    Buscar una vez y rendirse era una carrera contra el navegador. Esto espera
    hasta quince segundos preguntando cada medio segundo, que es lo mismo que
    hace la lectura de grupos y por eso esa sí funciona.
  */
  let abrir = null;
  for (let intento = 0; intento < 30 && !abrir; intento += 1) {
    abrir = buscarPorTexto('[role="button"]', PATRON_COMPOSITOR);
    if (!abrir) await dormir(500);
  }

  if (!abrir) {
    /*
      ── Qué botones había, para no volver a adivinar ────────────────────────

      El mensaje anterior listaba tres causas posibles y no decía cuál. Con eso
      no se puede arreglar nada: hay que probar un patrón, esperar a que falle
      de nuevo, y volver a probar.

      Esto se lleva los textos de los botones que sí estaban. Si Facebook
      cambió el nombre, el nombre nuevo va a estar en esa lista y el arreglo es
      agregarlo al patrón. Una vez, no cinco.
    */
    const botones = [...document.querySelectorAll('[role="button"]')]
      .map((el) => (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40))
      .filter((t) => t.length > 2)
      .slice(0, 25);

    const soloLectura = /solo los administradores|only admins|no puedes publicar|can'?t post/i.test(
      document.body.innerText || ''
    );

    return {
      ok: false,
      motivo: soloLectura
        ? 'Este grupo no te deja publicar: sólo pueden los administradores.'
        : 'No apareció el compositor después de esperar 15 segundos.',
      diagnostico: {
        url: location.href,
        titulo: document.title,
        botonesVistos: botones,
        hayCajaDeTexto: Boolean(document.querySelector('[role="textbox"]')),
      },
    };
  }

  abrir.click();
  await dormir(2500);

  /*
    2. Escribir.

    El cuadro también se espera: el compositor de Facebook abre con una
    animación y el `[role="textbox"]` aparece después. Dos segundos y medio
    alcanzaban casi siempre, y "casi siempre" en un grupo que no se puede
    reintentar sin arriesgar publicar dos veces no alcanza.
  */
  let caja = null;
  for (let intento = 0; intento < 20 && !caja; intento += 1) {
    caja = document.querySelector('[role="textbox"][contenteditable="true"]');
    if (!caja) await dormir(500);
  }
  if (!caja)
    return { ok: false, motivo: 'Se abrió el compositor pero nunca apareció dónde escribir.' };

  /*
    2 bis. Las fotos.

    Se cargan en el mismo <input type="file"> que usa Facebook cuando uno
    arrastra o elige fotos: se arma la lista de archivos y se avisa con un
    evento «change», igual que el navegador. Si el input no está todavía, se
    toca «Foto/video», que es el que lo hace aparecer.

    Después se espera a que se vean las miniaturas: publicar antes de que
    terminen de subir saca el posteo sin fotos o con una sola.
  */
  if (fotos.length) {
    const dialogo = () =>
      caja.closest('[role="dialog"]') || document.querySelector('[role="dialog"]') || document;
    const buscarInput = () =>
      [...dialogo().querySelectorAll('input[type="file"]')].find((input) =>
        /image/i.test(input.getAttribute('accept') || 'image')
      );

    let input = buscarInput();
    if (!input) {
      // Se compara la etiqueta y el texto por separado: juntos no coinciden con
      // un nombre exacto ("Foto/video Foto/video").
      const PATRON_FOTO = /^\s*(Foto\/video|Photo\/video|Fotos?|Photos?)\s*$/i;
      const botonFoto = [...dialogo().querySelectorAll('[role="button"], [aria-label]')].find(
        (el) =>
          PATRON_FOTO.test(el.getAttribute('aria-label') || '') ||
          PATRON_FOTO.test(el.textContent || '')
      );
      botonFoto?.click();
      for (let intento = 0; intento < 16 && !input; intento += 1) {
        await dormir(500);
        input = buscarInput();
      }
    }
    if (!input) {
      return {
        ok: false,
        motivo: 'No encontré dónde cargar las fotos en el compositor de Facebook.',
      };
    }

    const lista = new DataTransfer();
    for (const foto of fotos) {
      const binario = atob(foto.base64);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
      lista.items.add(new File([bytes], foto.nombre, { type: foto.mime }));
    }
    input.files = lista.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const miniaturas = () =>
      dialogo().querySelectorAll('img[src^="blob:"], img[src^="data:image"]').length;
    let vistas = 0;
    for (let intento = 0; intento < 90; intento += 1) {
      vistas = miniaturas();
      if (vistas >= fotos.length) break;
      await dormir(500);
    }
    if (vistas < fotos.length) {
      return {
        ok: false,
        motivo: `Facebook mostró ${vistas} de ${fotos.length} fotos después de 45 segundos. No se publicó para no salir incompleto.`,
      };
    }
    await dormir(1500);
    caja =
      dialogo().querySelector('[role="textbox"][contenteditable="true"]') ||
      document.querySelector('[role="textbox"][contenteditable="true"]') ||
      caja;
  }

  caja.focus();
  /*
    `insertText` y no asignar el contenido a mano: Facebook escucha los eventos
    de tecleo para habilitar el botón de publicar. Poniendo el texto directo, el
    botón queda gris y la publicación nunca sale.
  */
  document.execCommand('insertText', false, texto);
  await dormir(1500);

  /*
    3. Publicar.

    El botón se espera igual, y por un motivo distinto a los otros dos: acá sí
    existe desde el principio, pero arranca **deshabilitado** y se habilita
    cuando Facebook registra que hay texto. Mirarlo una sola vez, justo
    después de escribir, lo agarra gris y aborta una publicación que estaba
    perfecta.
  */
  let publicar = null;
  for (let intento = 0; intento < (fotos.length ? 60 : 20); intento += 1) {
    publicar = buscarPorTexto('[role="button"]', /^\s*(Publicar|Post)\s*$/i);
    if (publicar && publicar.getAttribute('aria-disabled') !== 'true') break;
    await dormir(500);
  }

  if (!publicar) return { ok: false, motivo: 'No apareció el botón de publicar.' };

  if (publicar.getAttribute('aria-disabled') === 'true') {
    return {
      ok: false,
      motivo:
        'El botón de publicar quedó deshabilitado: Facebook no registró el texto que se escribió.',
    };
  }

  publicar.click();
  await dormir(5000);

  /*
    Algunos grupos ponen todo a revisión de un administrador. Eso no es un
    fallo —la publicación existe— pero tampoco es "publicado": decirlo así
    evita que alguien la busque en el grupo y no la encuentre.
  */
  const enRevision =
    /pendiente de aprobaci[óo]n|pending approval|revisar[áa] tu publicaci[óo]n/i.test(
      document.body.innerText
    );

  return { ok: true, enRevision, fotos: fotos.length };
}

/* ────────────────────────────────────────────────────────────────────────────
   El ciclo
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Un renglón de lo que fue pasando.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * La primera versión guardaba un solo `ultimoError`, y el latido lo limpiaba
 * al empezar cada vuelta. O sea: si el trabajo fallaba, el error duraba veinte
 * segundos y lo borraba el latido siguiente.
 *
 * Mirando la extensión desde afuera se veía "vinculada, sin errores" mientras
 * fallaba en cada intento. Es exactamente el problema que esta extensión vino
 * a resolver, cometido de nuevo acá adentro.
 *
 * Con un diario corto se puede ver qué pasó, aunque haya pasado hace un rato.
 */
async function anotar(texto) {
  const { diario = [] } = await chrome.storage.local.get(['diario']);
  const linea = `${new Date().toLocaleTimeString('es-AR')} · ${texto}`;
  /* Los últimos 20 alcanzan y no llenan el disco de nadie. */
  await guardar({ diario: [linea, ...diario].slice(0, 20) });
}

async function latir() {
  try {
    const { pausada } = await chrome.storage.local.get(['pausada']);
    await pedir('/heartbeat', {
      codigo: 'chrome-extension',
      nombre: 'Modo Sabor Social (Chrome)',
      version: chrome.runtime.getManifest().version,
      estado: 'online',
      /*
        Lo que sabe hacer, para que el panel no le mande lo que no puede (y
        avise por qué). `pausada` es informativo: el freno real es no pedir trabajo.
      */
      detalle: { puedeSubirMedia: true, formatos: ['post'], pausada: Boolean(pausada) },
    });
    /*
      El latido NO limpia `ultimoError`.

      Latir y trabajar son dos cosas distintas: se puede estar conectado y
      fallando cada intento. Limpiar el error acá borraba justo lo que había
      que leer.
    */
    await guardar({ ultimo: Date.now() });
  } catch (error) {
    if (error.message !== 'SIN_VINCULAR') {
      await guardar({ ultimoError: error.message });
      await anotar(`No pude latir: ${error.message}`);
    }
  }
}

async function hacerUnaCosa() {
  const trabajo = await pedir('/claim');
  if (!trabajo || trabajo.kind === 'idle') return;

  if (trabajo.kind === 'command') {
    await anotar(`Tomé un comando: ${trabajo.item?.tipo}`);
    const r = await hacerComando(trabajo);
    /* Se limpia el error sólo cuando algo salió bien de verdad. */
    await guardar({ ultimoError: '' });
    return r;
  }

  if (trabajo.kind === 'publication') {
    await anotar(`Tomé una publicación para ${trabajo.item?.destino_nombre || 'un destino'}`);
    const r = await hacerPublicacion(trabajo);
    await guardar({ ultimoError: '' });
    return r;
  }

  await anotar(`El panel mandó algo que no entiendo: ${trabajo.kind}`);
}

async function hacerComando({ item, lock }) {
  const reportar = (cuerpo) =>
    pedir(`/comandos/${item.id}/reportar`, { lockToken: lock, ...cuerpo });

  try {
    if (item.tipo === 'health_check') {
      const { haySesion, identidad, diagnostico } = await enUnaPestana(
        'https://www.facebook.com/',
        leerGruposEnLaPagina
      );

      /*
        La sesión se decide por `haySesion`, no por el nombre.

        Antes se miraba el nombre, y como Facebook no lo pone en el botón, la
        respuesta era siempre "sesión vencida" — con la sesión abierta. Eso
        mandaba a iniciar sesión otra vez, que no arreglaba nada porque no
        había nada roto.
      */
      return reportar({
        estado: 'done',
        resultado: {
          worker: 'READY',
          chrome: 'READY',
          facebook_session: haySesion ? 'ACTIVE' : 'EXPIRED',
          /* El nombre va sólo si Facebook lo dio. Vacío no es un problema. */
          ...(identidad ? { identidad } : {}),
          diagnostico,
        },
      });
    }

    if (item.tipo === 'sync_facebook_groups') {
      /*
        ── La dirección correcta es `/groups/joins/`, no `/groups/joined/` ────

        Una letra, y rompía todo en silencio.

        `/groups/joined/` **no existe** como pantalla: Facebook lo interpreta
        como el nombre corto de un grupo y abre un grupo público cualquiera que
        se llama así. La página cargaba bien, tenía links de grupos, no daba
        ningún error — y el sistema guardaba como "tus grupos" a gente que
        había posteado en un grupo ajeno en 2011.

        Este es el peor tipo de bug de todos los que aparecieron hoy: no falla,
        no avisa, y devuelve datos que parecen razonables.

        `/groups/joins/` es la pantalla "Tus grupos". Se agrega el orden por
        "los que me uní" para que la lista venga completa y no la mezcla de
        sugeridos que muestra la portada.
      */
      const { grupos, identidad, avatarIdentidad, identityUrl, diagnostico } =
        await leerGruposDeIdentidad(item.payload || {});

      await anotar(`Encontré ${grupos.length} grupo(s)`);

      /*
        Cero grupos no se guarda como éxito.

        Si guardáramos una lista vacía como resultado bueno, el sistema
        borraría o dejaría sin destinos una identidad que sí tiene grupos,
        sólo porque Facebook tardó o cambió la pantalla. Es mejor fallar y que
        se pueda reintentar.
      */
      if (!grupos.length) {
        return reportar({
          estado: 'failed',
          error:
            'Facebook no mostró ningún grupo. Puede que la pantalla haya cambiado o que la sesión no esté activa.',
          resultado: { diagnostico },
        });
      }

      return reportar({
        estado: 'done',
        resultado: {
          grupos,
          identidadActiva: identidad,
          identityUrl,
          ...(avatarIdentidad ? { avatarIdentidad } : {}),
          diagnostico,
        },
      });
    }

    return reportar({ estado: 'failed', error: `No sé hacer "${item.tipo}".` });
  } catch (error) {
    return reportar({ estado: 'failed', error: error.message });
  }
}

async function hacerPublicacion({ item, lock }) {
  const reportar = (cuerpo) =>
    pedir(`/publicaciones/${item.id}/reportar`, { lockToken: lock, ...cuerpo });

  const destino = item.destino_nombre || 'el grupo';
  const fallo = async (motivo) => {
    await sumar('fallidas');
    await anotar(`No pude publicar en ${destino}: ${motivo}`);
    await avisar('No se pudo publicar', `${destino}: ${motivo}`);
    return reportar({ estado: 'failed', error: motivo });
  };

  try {
    /* Sólo fotos, y hasta MAX_FOTOS: el servidor no manda otra cosa a esta versión. */
    const archivos = (item.media || [])
      .filter((m) => String(m.mime || '').startsWith('image/'))
      .slice(0, MAX_FOTOS);
    const fotos = [];
    for (const archivo of archivos) fotos.push(await bajarFoto(archivo));
    if (fotos.length) await anotar(`Bajé ${fotos.length} foto(s) para ${destino}`);

    const url = item.destino_url || `https://www.facebook.com/groups/${item.destino_externo}`;
    const { verPestana } = await opciones();
    const resultado = await enUnaPestana(url, publicarEnLaPagina, [item.texto || '', fotos], {
      visible: verPestana,
    });

    if (!resultado?.ok) return fallo(resultado?.motivo || 'No se pudo publicar.');

    await sumar('publicadas');
    const conFotos = resultado.fotos ? ` con ${resultado.fotos} foto(s)` : '';
    await anotar(
      resultado.enRevision
        ? `Publicado${conFotos} en ${destino}, queda a revisión del administrador`
        : `Publicado${conFotos} en ${destino}`
    );
    await avisar(
      resultado.enRevision ? 'Enviado a revisión' : 'Publicado',
      `${destino}${conFotos}`
    );
    return reportar({
      estado: resultado.enRevision ? 'pending_review' : 'published',
      error: resultado.enRevision
        ? 'El grupo recibió la publicación y requiere aprobación del administrador.'
        : '',
    });
  } catch (error) {
    return fallo(error.message);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   El reloj
   ──────────────────────────────────────────────────────────────────────────── */

/*
  Se usa `chrome.alarms` y no `setInterval`.

  Chrome apaga el service worker de una extensión a los treinta segundos de
  inactividad. Un `setInterval` de un minuto simplemente no llega a dispararse
  nunca: la extensión parecería instalada y no haría nada — otra vez el error
  que no avisa.
*/
chrome.runtime.onInstalled.addListener(() => programar());
chrome.runtime.onStartup.addListener(() => programar());

function programar() {
  chrome.alarms.create('trabajar', { periodInMinutes: CADA_SEGUNDOS / 60 });
}

/**
 * Una vuelta: latir, y si no está pausada, hacer lo que el panel tenga.
 * La usan el reloj y el botón «Trabajar ahora».
 */
let trabajando = false;
async function vuelta() {
  if (trabajando) return { ok: false, motivo: 'Ya está trabajando en algo.' };
  const { clave } = await leer();
  if (!clave) return { ok: false, motivo: 'Falta vincularla con el panel.' };

  trabajando = true;
  try {
    await latir();
    const { pausada } = await chrome.storage.local.get(['pausada']);
    if (pausada) return { ok: true, pausada: true };
    await hacerUnaCosa();
    return { ok: true };
  } catch (error) {
    if (error.message !== 'SIN_VINCULAR') {
      await guardar({ ultimoError: error.message });
      await anotar(`Falló el trabajo: ${error.message}`);
    }
    return { ok: false, motivo: error.message };
  } finally {
    trabajando = false;
    await actualizarInsignia();
  }
}

chrome.alarms.onAlarm.addListener((alarma) => {
  if (alarma.name === 'trabajar') vuelta();
});

/**
 * Prueba la sesión de Facebook desde acá, sin esperar al panel: abre Facebook
 * en segundo plano y mira si hay sesión iniciada.
 */
async function probarSesion() {
  const { haySesion, identidad } = await enUnaPestana(
    'https://www.facebook.com/',
    leerGruposEnLaPagina
  );
  await anotar(
    haySesion
      ? `Sesión de Facebook activa${identidad ? ` (${identidad})` : ''}`
      : 'No hay sesión de Facebook iniciada'
  );
  return { ok: true, haySesion: Boolean(haySesion), identidad: identidad || '' };
}

chrome.runtime.onMessage.addListener((mensaje, _emisor, responder) => {
  const responderCon = (promesa) => {
    promesa
      .then((r) => responder(r))
      .catch((error) => responder({ ok: false, error: error.message }));
    return true; /* la respuesta es asincrónica */
  };

  if (mensaje?.tipo === 'vincular') {
    return responderCon(
      vincular(mensaje).then(async () => {
        programar();
        await actualizarInsignia();
        return { ok: true };
      })
    );
  }

  if (mensaje?.tipo === 'estado') {
    /*
      Se lee directo del almacenamiento y no con `leer()`, porque esa función
      trae sólo lo que hace falta para hablar con el servidor. El diario es
      para mirar, no para trabajar.
    */
    return responderCon(
      Promise.all([
        chrome.storage.local.get([
          'servidor',
          'clave',
          'ultimo',
          'ultimoError',
          'diario',
          'pausada',
        ]),
        contadores(),
        opciones(),
      ]).then(([datos, hoy, ops]) => ({
        vinculada: Boolean(datos.clave),
        servidor: datos.servidor || '',
        ultimo: datos.ultimo || 0,
        ultimoError: datos.ultimoError || '',
        diario: datos.diario || [],
        pausada: Boolean(datos.pausada),
        trabajando,
        hoy,
        opciones: ops,
        version: chrome.runtime.getManifest().version,
      }))
    );
  }

  if (mensaje?.tipo === 'pausar') {
    return responderCon(
      (async () => {
        await guardar({ pausada: Boolean(mensaje.valor) });
        await anotar(mensaje.valor ? 'Pausada desde la ventanita' : 'Reanudada desde la ventanita');
        await latir();
        await actualizarInsignia();
        return { ok: true };
      })()
    );
  }

  if (mensaje?.tipo === 'opcion') {
    return responderCon(
      (async () => {
        const actuales = await opciones();
        if (!(mensaje.clave in OPCIONES_POR_OMISION)) throw new Error('Opción desconocida.');
        await guardar({ opciones: { ...actuales, [mensaje.clave]: Boolean(mensaje.valor) } });
        return { ok: true };
      })()
    );
  }

  if (mensaje?.tipo === 'trabajarAhora') return responderCon(vuelta());

  if (mensaje?.tipo === 'probarSesion') return responderCon(probarSesion());

  if (mensaje?.tipo === 'limpiarError') {
    return responderCon(
      (async () => {
        await guardar({ ultimoError: '' });
        await actualizarInsignia();
        return { ok: true };
      })()
    );
  }

  if (mensaje?.tipo === 'desvincular') {
    return responderCon(
      (async () => {
        await guardar({ clave: '', ultimoError: '', pausada: false });
        await anotar('Desvinculada desde la ventanita');
        await actualizarInsignia();
        return { ok: true };
      })()
    );
  }

  return false;
});

actualizarInsignia();
