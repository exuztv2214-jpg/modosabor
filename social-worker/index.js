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

const apiRoot = String(
  process.env.SOCIAL_API_URL || 'http://localhost:3001/api/social-worker'
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
    headers: { 'Content-Type': 'application/json', 'X-Social-Worker-Key': key },
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
      groups_page: 'PENDIENTE_DE_VALIDACION',
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
  try {
    /*
      Se prioriza el rol y el texto accesible por sobre las clases CSS, que
      Facebook cambia seguido. Si esto deja de encontrar nada, el resultado es
      null y el comando falla con un error claro — que es mucho mejor que
      seguir de largo con la identidad equivocada.
    */
    const boton = page.locator('[aria-label*="Tu perfil"], [aria-label*="Your profile"]').first();
    if ((await boton.count()) === 0) return null;
    const etiqueta = await boton.getAttribute('aria-label');
    return (
      String(etiqueta || '')
        .replace(/^(Tu perfil|Your profile)[,:\s]*/i, '')
        .trim() || null
    );
  } catch {
    return null;
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
  try {
    await page.goto('https://www.facebook.com/groups/joined/', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await page.waitForTimeout(1200);

    const activa = await identidadActiva(page);

    if (esPagina) {
      throw new Error(
        'IDENTITY_NOT_AVAILABLE: todavía no se puede sincronizar los grupos de la Fan Page. ' +
          'Falta implementar el cambio de identidad en Facebook. Los del Perfil sí funcionan.'
      );
    }

    const grupos = await page.locator('a[href*="/groups/"]').evaluateAll((links) => {
      const found = new Map();
      links.forEach((link) => {
        const href = link.href || '';
        const match = href.match(/facebook\.com\/groups\/([^/?#]+)/i);
        const name = (link.textContent || '').replace(/\s+/g, ' ').trim();
        if (match && name && !/groups\/joined/i.test(href))
          found.set(match[1], {
            id: match[1],
            nombre: name.slice(0, 200),
            url: href.split('?')[0],
          });
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

async function publishFacebookGroup(item) {
  if (!['facebook_group', 'facebook_page'].includes(item.destino_tipo))
    throw new Error(`Destino no disponible aún: ${item.destino_tipo}`);
  const { browser, page } = await facebookPage();
  const downloaded = [];
  try {
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
    version: '1.0.0',
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
