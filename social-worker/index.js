/*
 * Worker local de Modo Sabor Social.
 * Usa Chrome abierto por el operador mediante CDP. No exporta ni persiste
 * cookies, no resuelve CAPTCHAs y no modifica fingerprint ni ritmos humanos.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { chromium } = require('playwright-core');
const workerVersion = require('./package.json').version;

const apiRoot = String(
  process.env.SOCIAL_API_URL || 'https://modosabor.com.ar/api/social-worker'
).replace(/\/$/, '');
const key = String(process.env.SOCIAL_WORKER_KEY || '');
const cdpUrl = String(process.env.SOCIAL_CHROME_CDP_URL || 'http://127.0.0.1:9222');
const pollMs = Math.max(Number(process.env.SOCIAL_POLL_MS || 8000), 3000);
const workerCode = String(process.env.SOCIAL_WORKER_CODE || 'windows-local');

if (!key)
  throw new Error(
    'Falta SOCIAL_WORKER_KEY. Configurala en social-worker/.env o en las variables de Windows.'
  );
if (!/^https?:\/\//i.test(apiRoot))
  throw new Error(
    'SOCIAL_API_URL debe ser una URL http(s) del backend, terminada en /api/social-worker.'
  );
if (!/^http:\/\/127\.0\.0\.1:9222\/?$/i.test(cdpUrl))
  throw new Error('SOCIAL_CHROME_CDP_URL debe apuntar sólo a http://127.0.0.1:9222.');

async function request(method, url, body) {
  const response = await fetch(`${apiRoot}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Social-Worker-Key': key,
      'X-Social-Worker-Code': workerCode,
      'X-Social-Worker-Media': '1',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API ${response.status}`);
  return data;
}

async function facebookPage() {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const context = browser.contexts()[0];
  if (!context)
    throw new Error(
      'Chrome no tiene un perfil disponible. Abrilo con el acceso de Modo Sabor Social.'
    );
  const page =
    context.pages().find((item) => /facebook\.com/i.test(item.url())) || (await context.newPage());
  return { browser, page };
}

async function checkFacebook() {
  const { browser, page } = await facebookPage();
  try {
    await page.goto('https://www.facebook.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    const url = page.url();
    const login =
      /login|checkpoint/i.test(url) || (await page.locator('input[name="email"]').count()) > 0;

    /*
      Se distingue la sesión vencida del pedido de verificación.

      Los dos dejan a Facebook sin funcionar, pero se arreglan distinto: una
      vencida se resuelve iniciando sesión de nuevo; un checkpoint hay que
      resolverlo a mano en el navegador, y volver a iniciar sesión no sirve de
      nada. Decir "EXPIRED" en los dos casos manda a la persona a hacer algo
      que no funciona.
    */
    const checkpoint = /checkpoint/i.test(url);

    return {
      worker: 'READY',
      chrome: 'READY',
      facebook_session: checkpoint ? 'CHECKPOINT' : login ? 'EXPIRED' : 'ACTIVE',
      /*
        El Perfil está listo si la sesión está viva: es la identidad con la que
        Facebook abre por defecto.

        La Fan Page queda como pendiente de validar, y no por prudencia
        excesiva: el cambio de identidad todavía no está implementado, así que
        decir READY sería mentir. La especificación pide exactamente esto — no
        mostrar como operativo lo que no fue validado de punta a punta.
      */
      facebook_profile: login ? 'BLOCKED' : 'READY',
      facebook_page: 'PENDIENTE_DE_VALIDACION',
      groups_profile: login ? 'BLOCKED' : 'READY',
      /*
        Los grupos de la Page ya se pueden traer: el cambio de identidad está
        implementado y verificado contra `identidadActiva()` antes de guardar
        nada.

        Sigue dependiendo de que la sesión esté viva, igual que todo lo demás
        que hace el Worker. Y si el menú de Facebook cambia, el comando falla
        con un motivo entendible en vez de traer la lista equivocada.
      */
      groups_page: login ? 'BLOCKED' : 'READY',
      groups_sync: login ? 'BLOCKED' : 'READY',
      instagram: 'PENDIENTE_DE_VALIDACION',
      url,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Con qué identidad está parado Facebook ahora mismo.
 *
 * ── Por qué se comprueba y no se asume ─────────────────────────────────────
 *
 * Facebook recuerda con qué identidad estuviste la última vez. Si alguien dejó
 * el navegador en la Fan Page y el sistema pide sincronizar el Perfil, sin
 * comprobar traeríamos los grupos de la Page y los guardaríamos como si fueran
 * del Perfil. El error no se ve: la lista aparece llena y con nombres
 * plausibles. Se descubre recién cuando una publicación falla, semanas después.
 *
 * Devuelve el nombre que Facebook muestra como identidad activa, o null si no
 * se pudo leer. `null` es un resultado válido: preferimos frenar antes que
 * adivinar.
 */
async function identidadActiva(page) {
  let comprobacion;
  try {
    comprobacion = await page.context().newPage();
    await comprobacion.goto('https://www.facebook.com/me/', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    return (
      String(await comprobacion.title())
        .replace(/^\(\d+\+?\)\s*/, '')
        .replace(/\s*[|·-]\s*Facebook.*$/i, '')
        .trim() || null
    );
  } catch {
    return null;
  } finally {
    await comprobacion?.close().catch(() => {});
  }
}

/**
 * Los grupos donde puede publicar una identidad.
 *
 * ── Por qué el pedido tiene que decir cuál ─────────────────────────────────
 *
 * Los grupos del Perfil y los de la Fan Page son listas distintas, y el mismo
 * grupo puede estar en las dos siendo dos destinos separados. Sincronizar "los
 * grupos de Facebook" a secas no significa nada.
 *
 * ── Lo que todavía no hace, y se dice en voz alta ──────────────────────────
 *
 * Para la Fan Page hay que cambiar de identidad en Facebook antes de mirar, y
 * ese cambio todavía no está implementado. En vez de traer los grupos del
 * Perfil y hacerlos pasar por los de la Page —que es la peor salida posible—
 * el comando falla con un motivo entendible.
 *
 * Es lo que pide la especificación: no mostrar como operativo algo que no fue
 * validado de punta a punta.
 */
/**
 * Pasar a mirar Facebook como la Fan Page.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * Los grupos del Perfil y los de la Fan Page son listas distintas. Facebook
 * muestra la que corresponde a la identidad con la que estás parado, y no hay
 * forma de pedirle las dos de una: hay que cambiar y volver a mirar.
 *
 * ── Por qué se verifica en vez de confiar ──────────────────────────────────
 *
 * Facebook cambia el menú de cambio de perfil cada tanto. El día que estos
 * selectores dejen de encontrar nada, sin verificación el código seguiría de
 * largo, leería los grupos **del Perfil** y los guardaría como si fueran de la
 * Page. La lista quedaría llena, con nombres creíbles, y el error aparecería
 * semanas después: publicaciones que fallan en grupos donde la Page nunca
 * estuvo.
 *
 * Por eso se comprueba con `identidadActiva()` después de cambiar, y si el
 * nombre no coincide se aborta. Fallar es el resultado correcto acá.
 *
 * Devuelve el nombre de la identidad que había antes, para poder volver.
 */
async function cambiarIdentidad(page, nombreBuscado) {
  const objetivo = String(nombreBuscado || '').trim();
  if (!objetivo) throw new Error('IDENTITY_NOT_AVAILABLE: no se dijo a qué identidad cambiar.');

  const previa = await identidadActiva(page);
  if (previa && previa.toLowerCase() === objetivo.toLowerCase()) return previa;

  const menu = page.locator('[aria-label*="Tu perfil"], [aria-label*="Your profile"]').first();
  if ((await menu.count()) === 0) {
    throw new Error(
      'IDENTITY_NOT_AVAILABLE: no se encontró el menú de perfil de Facebook. ' +
        'Puede que haya cambiado la pantalla o que la sesión no esté iniciada.'
    );
  }
  await menu.click();
  await page.waitForTimeout(1500);

  /*
    Facebook a veces esconde las páginas detrás de "Ver todos los perfiles".
    Se intenta abrir ese submenú, y si no está no pasa nada: quiere decir que
    las páginas ya se ven en el menú principal.
  */
  const verTodos = page.locator('text=/Ver todos los perfiles|See all profiles/i').first();
  if ((await verTodos.count()) > 0) {
    await verTodos.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  const opcion = page.locator(`text="${objetivo}"`).first();
  if ((await opcion.count()) === 0) {
    throw new Error(
      `IDENTITY_NOT_AVAILABLE: Facebook no ofrece cambiar a «${objetivo}». ` +
        'Revisá que el nombre de la identidad en el sistema sea igual al de la página en Facebook.'
    );
  }
  await opcion.click();

  /*
    El cambio de identidad recarga Facebook entero. Sin esperar la navegación,
    la verificación de abajo leería la pantalla vieja y daría un falso negativo.
  */
  await page.waitForLoadState('domcontentloaded', { timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const ahora = await identidadActiva(page);
  if (!ahora || ahora.toLowerCase() !== objetivo.toLowerCase()) {
    throw new Error(
      `IDENTITY_NOT_AVAILABLE: se pidió cambiar a «${objetivo}» y Facebook quedó en ` +
        `«${ahora || 'no se pudo leer'}». No se sincroniza nada para no mezclar los grupos.`
    );
  }

  return previa;
}

async function syncGroups(payload = {}) {
  const identidad = payload.identityNombre || '';

  /*
    El tipo viene explícito desde el servidor ('perfil' o 'page'). Adivinarlo
    del nombre con una expresión regular sería frágil: alcanza con que alguien
    renombre la identidad para que el sistema empiece a tratar al Perfil como
    si fuera la Page, en silencio.

    Si el tipo no viene, se frena en vez de suponer.
  */
  const tipo = String(payload.identityTipo || '').toLowerCase();
  if (!tipo) {
    throw new Error('IDENTITY_NOT_AVAILABLE: el pedido no dice si es el Perfil o la Fan Page.');
  }
  const esPagina = tipo === 'page';

  const { browser, page } = await facebookPage();

  /*
    Se guarda a quién había que volver.

    Sin esto, sincronizar la Page dejaría el navegador parado en la Page, y la
    próxima sincronización del Perfil traería los grupos de la Page creyendo
    que son del Perfil. El error no se ve al momento: se ve después, cuando una
    publicación falla en un grupo donde el Perfil nunca estuvo.
  */
  let volverA = null;

  try {
    await page.goto('https://www.facebook.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForTimeout(1200);

    if (esPagina) {
      volverA = await cambiarIdentidad(page, identidad);
    }

    await page.goto('https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForTimeout(1200);

    let enlacesAnteriores = -1;
    let quietas = 0;
    for (let vuelta = 0; vuelta < 40 && quietas < 2; vuelta += 1) {
      const enlaces = await page.locator('a[href*="/groups/"]').count();
      quietas = enlaces === enlacesAnteriores ? quietas + 1 : 0;
      enlacesAnteriores = enlaces;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1200);
    }

    const activa = await identidadActiva(page);

    /*
      Se vuelve a comprobar acá, ya parados en la lista.

      El cambio de identidad se verificó en la home, pero navegar a otra
      pantalla es otra oportunidad para que Facebook nos devuelva al Perfil
      —pasa cuando la sesión de la Page expira sola—. Esta lista es la que se
      va a guardar: es acá donde importa con qué identidad se está mirando.
    */
    if (esPagina && (!activa || activa.toLowerCase() !== String(identidad).toLowerCase())) {
      throw new Error(
        `IDENTITY_NOT_AVAILABLE: al abrir la lista de grupos Facebook había vuelto a ` +
          `«${activa || 'no se pudo leer'}». No se guarda nada para no mezclar las dos listas.`
      );
    }

    const grupos = await page.locator('a[href*="/groups/"]').evaluateAll((links) => {
      const found = new Map();
      links.forEach((link) => {
        const href = link.href || '';
        const match = href.match(/facebook\.com\/groups\/([^/?#]+)/i);
        const name = (link.textContent || '')
          .replace(/\s+/g, ' ')
          .replace(/Activo por última vez.*$/i, '')
          .replace(/Last active.*$/i, '')
          .replace(/\d+\s*miembros?.*$/i, '')
          .trim();
        const noEsGrupo =
          /^(joins|joined|feed|discover|create|browse)$/i.test(match?.[1] || '') ||
          /^(ver (todo|grupo|m[áa]s)|unirte|descubrir|crear|tus grupos|inicio|see all)$/i.test(
            name
          );
        if (match && name.length >= 3 && !noEsGrupo) {
          let contenedor = link;
          let imagen = link.querySelector('img, image');
          for (let nivel = 0; !imagen && contenedor && nivel < 3; nivel += 1) {
            contenedor = contenedor.parentElement;
            imagen = contenedor?.querySelector?.('img, image') || null;
          }
          const avatarUrl =
            imagen?.src ||
            imagen?.getAttribute?.('href') ||
            imagen?.getAttribute?.('xlink:href') ||
            '';
          if ([...found.values()].some((grupo) => grupo.nombre === name)) return;
          found.set(match[1], {
            id: match[1],
            nombre: name.slice(0, 200),
            url: href.split('?')[0],
            ...(avatarUrl ? { avatarUrl } : {}),
          });
        }
      });
      return [...found.values()];
    });

    return {
      grupos,
      /* Se informa con qué identidad se miró, para poder auditarlo después. */
      identidadActiva: activa,
      identidadPedida: identidad || null,
    };
  } finally {
    /*
      Volver a la identidad de antes, pase lo que pase.

      Va en el `finally` y no al final del `try` porque el caso que importa es
      justamente el que falla: si algo se rompe con el navegador parado en la
      Page, el próximo comando —una publicación del Perfil, por ejemplo— saldría
      publicada por la Page sin que nadie lo pida.

      Si el regreso falla, no se re-lanza el error: taparía el error original,
      que es el que explica qué pasó de verdad.
    */
    if (volverA) {
      await cambiarIdentidad(page, volverA).catch(() => {});
    }
    await browser.close().catch(() => {});
  }
}

async function downloadMedia(media) {
  const target = path.join(
    os.tmpdir(),
    `modo-sabor-social-${media.id}-${path.basename(media.nombre || 'archivo')}`
  );
  const response = await fetch(`${apiRoot}/media/${media.id}`, {
    headers: { 'X-Social-Worker-Key': key },
  });
  if (!response.ok) throw new Error(`No se pudo descargar el adjunto ${media.nombre}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

async function captureFailure(page, item) {
  if (String(process.env.SOCIAL_CAPTURE_FAILURE_SCREENSHOTS || '') !== '1' || !page) return '';
  const file = path.join(os.tmpdir(), `modo-sabor-social-failure-${item.id}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return fs.existsSync(file) ? file : '';
}

async function uploadScreenshot(item, file) {
  if (!file) return '';
  try {
    const form = new FormData();
    form.append(
      'screenshot',
      new Blob([fs.readFileSync(file)], { type: 'image/png' }),
      'failure.png'
    );
    const response = await fetch(`${apiRoot}/publicaciones/${item.id}/screenshot`, {
      method: 'POST',
      headers: { 'X-Social-Worker-Key': key, 'X-Social-Lock-Token': item.lock },
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    return response.ok ? String(data.screenshotRuta || '') : '';
  } finally {
    fs.unlink(file, () => {});
  }
}

function reelIdDesdeUrl(url) {
  return String(url || '').match(/facebook\.com\/reel\/(\d+)/i)?.[1] || '';
}

async function reelsDelPerfil(page) {
  await page.goto('https://www.facebook.com/me/reels', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  await page.waitForTimeout(1200);
  const enlaces = await page
    .locator('a[href*="/reel/"]')
    .evaluateAll((items) => items.map((item) => item.href).filter(Boolean));
  return [...new Set(enlaces.map(reelIdDesdeUrl).filter(Boolean))];
}

async function publicarReelDePerfil(page, item, downloaded) {
  const video = (item.media || []).find((archivo) =>
    String(archivo?.mime || '').startsWith('video/')
  );
  if (!video) throw new Error('REEL_MEDIA_REQUIRED: el reel del Perfil necesita un video.');

  /*
    Facebook puede redirigir a cualquier Reel después de publicar. Por eso la
    URL final del navegador no demuestra qué Reel se creó: primero guardamos
    los ids reales del Perfil y, después del envío, buscamos el nuevo.
  */
  const reelsAntes = new Set(await reelsDelPerfil(page));
  downloaded.push(await downloadMedia(video));
  await page.goto('https://www.facebook.com/reels/create/', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  if (/login|checkpoint/i.test(page.url()))
    throw new Error('La sesión de Facebook venció o requiere una verificación manual.');

  const archivo = page.locator('input[type="file"][accept*="video"], input[type="file"]').first();
  await archivo.waitFor({ state: 'attached', timeout: 15_000 });
  await archivo.setInputFiles(downloaded[downloaded.length - 1]);

  /* Facebook intercala una o dos pantallas de edición según el video. */
  for (let paso = 0; paso < 2; paso += 1) {
    const siguiente = page.getByRole('button', { name: /siguiente|next/i }).last();
    if (!(await siguiente.count())) break;
    await siguiente.click();
    await page.waitForTimeout(1000);
  }

  if (item.texto) {
    const descripcion = page.locator('[role="textbox"][contenteditable="true"], textarea').last();
    if (await descripcion.count()) await descripcion.fill(item.texto);
  }

  const publicar = page.getByRole('button', { name: /publicar reel|publicar|share/i }).last();
  await publicar.waitFor({ state: 'visible', timeout: 20_000 });
  await publicar.click();
  await page.waitForTimeout(2500);

  for (let intento = 0; intento < 6; intento += 1) {
    const reelsDespues = await reelsDelPerfil(page).catch(() => []);
    const reelNuevo = reelsDespues.find((id) => !reelsAntes.has(id));
    if (reelNuevo) {
      return {
        estado: 'published',
        externalPostUrl: `https://www.facebook.com/reel/${reelNuevo}`,
        codigo: 'FACEBOOK_PROFILE_REEL_PUBLISHED',
        detalle: { destino: item.destino_nombre, formato: 'reel' },
      };
    }
    await page.waitForTimeout(2500);
  }

  return {
    estado: 'ambiguous',
    externalPostUrl: '',
    codigo: 'PUBLICATION_AMBIGUOUS',
    error:
      'Facebook recibió el Reel, pero no apareció uno nuevo en el Perfil. Revisalo antes de repetir.',
    detalle: { destino: item.destino_nombre, formato: 'reel' },
  };
}

async function publicarHistoriaDePerfil(page, item, downloaded) {
  const media = (item.media || [])[0];
  if (!media)
    throw new Error('STORY_MEDIA_REQUIRED: la historia del Perfil necesita una foto o un video.');

  downloaded.push(await downloadMedia(media));
  await page.goto('https://www.facebook.com/stories/create/', {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  });
  if (/login|checkpoint/i.test(page.url()))
    throw new Error('La sesión de Facebook venció o requiere una verificación manual.');

  const esVideo = String(media.mime || '').startsWith('video/');
  const iniciar = page
    .getByText(
      esVideo
        ? /crear una historia con video|create a video story/i
        : /crear una historia con foto|create a photo story/i
    )
    .first();
  if (await iniciar.count()) await iniciar.click();

  const archivo = page.locator('input[type="file"]').first();
  await archivo.waitFor({ state: 'attached', timeout: 15_000 });
  await archivo.setInputFiles(downloaded[downloaded.length - 1]);

  const compartir = page
    .getByRole('button', { name: /compartir en historia|share to story|publicar/i })
    .last();
  await compartir.waitFor({ state: 'visible', timeout: 20_000 });
  await compartir.click();

  const confirmacionHistoria = page
    .getByText(/tu historia se compartió|your story was shared|historia compartida/i)
    .last();
  for (let intento = 0; intento < 6; intento += 1) {
    if (await confirmacionHistoria.isVisible().catch(() => false)) {
      return {
        estado: 'published',
        externalPostUrl: page.url(),
        codigo: 'FACEBOOK_PROFILE_STORY_PUBLISHED',
        detalle: { destino: item.destino_nombre, formato: 'historia' },
      };
    }
    await page.waitForTimeout(2500);
  }

  return {
    estado: 'ambiguous',
    externalPostUrl: page.url(),
    codigo: 'PUBLICATION_AMBIGUOUS',
    error:
      'Facebook recibió la Historia pero no confirmó que terminara de publicarla. Revisala antes de repetir.',
    detalle: { destino: item.destino_nombre, formato: 'historia' },
  };
}

async function publishFacebookGroup(item) {
  if (!['facebook_group', 'facebook_page', 'facebook_profile'].includes(item.destino_tipo))
    throw new Error(`Destino no disponible aún: ${item.destino_tipo}`);
  const { browser, page } = await facebookPage();
  const downloaded = [];
  try {
    const formato = String(item.formato || 'post');
    if (item.destino_tipo === 'facebook_group' && formato !== 'post') {
      throw new Error(`FORMAT_NOT_SUPPORTED: los grupos no aceptan ${formato}.`);
    }
    if (item.destino_tipo === 'facebook_profile' && formato === 'reel') {
      return await publicarReelDePerfil(page, item, downloaded);
    }
    if (item.destino_tipo === 'facebook_profile' && formato === 'historia') {
      return await publicarHistoriaDePerfil(page, item, downloaded);
    }
    if (formato !== 'post') {
      throw new Error(
        `FORMAT_NOT_SUPPORTED: ${item.destino_tipo} no acepta ${formato} por Worker.`
      );
    }

    await page.goto(item.destino_url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (/login|checkpoint/i.test(page.url()))
      throw new Error('La sesión de Facebook venció o requiere una verificación manual.');
    const opener = page
      .getByRole('button', { name: /escrib|write something|what.s on your mind/i })
      .first();
    if (await opener.count()) await opener.click({ timeout: 8000 }).catch(() => {});
    const composer = page
      .locator('[role="dialog"] [role="textbox"], [role="textbox"][contenteditable="true"]')
      .last();
    await composer.waitFor({ state: 'visible', timeout: 12_000 });
    if (item.media?.length) {
      for (const media of item.media) downloaded.push(await downloadMedia(media));
      const fileInput = page.locator('input[type="file"]').last();
      if (await fileInput.count()) await fileInput.setInputFiles(downloaded);
    }
    await composer.fill(item.texto || '');
    const publish = page.getByRole('button', { name: /publicar|post/i }).last();
    await publish.waitFor({ state: 'visible', timeout: 12_000 });
    await publish.click();
    await page.waitForTimeout(1800);
    const content = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    if (/pendiente de aprobación|pending approval|requiere aprobación/i.test(content)) {
      return {
        estado: 'requires_approval',
        externalPostUrl: page.url(),
        codigo: 'REQUIRES_APPROVAL',
        error: 'El grupo recibió la publicación y requiere aprobación del administrador.',
        detalle: { destino: item.destino_nombre },
      };
    }
    // Facebook no ofrece un identificador confiable para todos los grupos. Si el
    // diálogo no desaparece no afirmamos éxito: queda como ambiguo y sin retry.
    if (await composer.isVisible().catch(() => false)) {
      return {
        estado: 'ambiguous',
        externalPostUrl: page.url(),
        codigo: 'PUBLICATION_AMBIGUOUS',
        error:
          'Facebook no confirmó de forma verificable la publicación. Revisá el destino antes de repetir.',
        detalle: { destino: item.destino_nombre },
      };
    }
    return {
      estado: 'published',
      externalPostUrl: page.url(),
      codigo:
        item.destino_tipo === 'facebook_page'
          ? 'FACEBOOK_PAGE_PUBLISHED'
          : item.destino_tipo === 'facebook_profile'
            ? 'FACEBOOK_PROFILE_PUBLISHED'
            : 'FACEBOOK_GROUP_PUBLISHED',
      detalle: { destino: item.destino_nombre },
    };
  } catch (error) {
    error.socialScreenshot = await captureFailure(page, item);
    throw error;
  } finally {
    downloaded.forEach((file) => fs.unlink(file, () => {}));
    await browser.close().catch(() => {});
  }
}

function actionableError(error) {
  const message = String(error?.message || error);
  if (/login|checkpoint|sesión|session/i.test(message))
    return {
      codigo: 'SESSION_EXPIRED',
      error:
        'La sesión de Facebook venció o requiere verificación. Abrí Chrome Social e iniciá sesión manualmente.',
    };
  if (/composer|textbox|timeout|visible/i.test(message))
    return {
      codigo: 'COMPOSER_NOT_FOUND',
      error:
        'Facebook no mostró el compositor para este destino. Revisá si el grupo permite publicaciones o requiere aprobación.',
    };
  if (/approval|aprobación/i.test(message))
    return {
      codigo: 'REQUIRES_APPROVAL',
      error: 'La publicación requiere aprobación del administrador del grupo.',
    };
  return { codigo: 'FACEBOOK_PUBLICATION_FAILED', error: message.slice(0, 1100) };
}

async function reportPublication(item, result) {
  return request('POST', `/publicaciones/${item.id}/reportar`, { lockToken: item.lock, ...result });
}

async function runCommand(command) {
  try {
    let result;
    /*
      El payload del comando llega desde el servidor y dice, entre otras cosas,
      con qué identidad hay que trabajar. El worker no la elige: la obedece.
    */
    const payload = command.payload || {};

    if (command.tipo === 'health_check') result = await checkFacebook();
    else if (command.tipo === 'sync_facebook_groups') result = await syncGroups(payload);
    else throw new Error(`Comando no soportado: ${command.tipo}`);
    await request('POST', `/comandos/${command.id}/reportar`, {
      lockToken: command.lock,
      estado: 'done',
      resultado: result,
    });
  } catch (error) {
    await request('POST', `/comandos/${command.id}/reportar`, {
      lockToken: command.lock,
      estado: 'failed',
      error: error.message,
    });
  }
}

async function tick() {
  await request('POST', '/heartbeat', {
    codigo: workerCode,
    version: workerVersion,
    detalle: { cdpUrl },
  });
  const work = await request('POST', '/claim');
  if (work.kind === 'idle') return;
  if (work.kind === 'command') return runCommand({ ...work.item, lock: work.lock });
  if (work.kind === 'publication') {
    try {
      await reportPublication(
        { ...work.item, lock: work.lock },
        await publishFacebookGroup(work.item)
      );
    } catch (error) {
      const screenshotRuta = await uploadScreenshot(
        { ...work.item, lock: work.lock },
        error.socialScreenshot || ''
      );
      await reportPublication(
        { ...work.item, lock: work.lock },
        { estado: 'failed', ...actionableError(error), screenshotRuta }
      );
    }
  }
}

(async () => {
  console.log(`Worker Social iniciado. API: ${apiRoot}; Chrome: ${cdpUrl}`);
  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error(`[Social worker] ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
})();
