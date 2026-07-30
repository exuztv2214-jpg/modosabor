const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { dataDir, uploadsDir, uploadPublicPathToFile, ensureDir } = require('../utils/storagePaths');

const profileDir = path.join(dataDir, 'facebook-automation-profile-v2');
const previewsDir = path.join(uploadsDir, 'marketing-publicador-grupos');
ensureDir(profileDir);
ensureDir(previewsDir);

function resolveBrowserExecutable() {
  const candidates = [
    process.env.FACEBOOK_AUTOMATION_BROWSER || '',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function withFacebookContext(callback, options = {}) {
  const context = await createFacebookContext(options);

  try {
    const page = context.pages()[0] || (await context.newPage());
    return await callback(page, context);
  } finally {
    await context.close();
  }
}

async function createFacebookContext(options = {}) {
  const executablePath = resolveBrowserExecutable();
  if (!executablePath) {
    throw new Error('No encontre Chrome o Edge para automatizar Facebook');
  }

  const extraArgs = ['--disable-blink-features=AutomationControlled'];
  if (options.background) {
    extraArgs.push('--start-minimized', '--window-position=-2400,-2400');
  }

  return chromium.launchPersistentContext(profileDir, {
    headless: Boolean(options.headless),
    executablePath,
    viewport: { width: 1366, height: 900 },
    args: extraArgs,
  });
}

async function ensureLoggedIn(page) {
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const loginNeeded = await page.locator('input[name="email"]').count();
  if (loginNeeded) {
    throw new Error(
      'Facebook no esta logueado en Chrome. Se abrio la ventana para que inicies sesion. Despues vuelve a probar.'
    );
  }
}

async function closeOpenDialog(page) {
  const closeSelectors = [
    'div[role="dialog"] [aria-label="Cerrar"]',
    'div[role="dialog"] [aria-label="Close"]',
    'div[role="dialog"] div[role="button"][aria-label="Cerrar"]',
    'div[role="dialog"] div[role="button"][aria-label="Close"]',
  ];
  for (const selector of closeSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 1000 });
        await page.waitForTimeout(500);
        return;
      } catch {}
    }
  }
  try {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } catch {}
}

async function openComposer(page) {
  const composerTriggers = [
    'div[role="button"][aria-label*="¿Qué"]',
    'div[role="button"][aria-label*="Que"]',
    'div[role="button"][aria-label*="Crear una publicación"]',
    'div[role="button"][aria-label*="Create a post"]',
    'div[role="button"]:has-text("Escribe algo")',
    'div[role="button"]:has-text("What\'s on your mind")',
  ];

  for (const selector of composerTriggers) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 4000 });
        await page.waitForTimeout(1500);
        return true;
      } catch {}
    }
  }
  return false;
}

async function fillPostText(page, text) {
  const textboxSelectors = [
    'div[role="dialog"] div[role="textbox"]',
    'div[aria-label*="¿Qué"] [contenteditable="true"]',
    'div[aria-label*="Que"] [contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
  ];

  for (const selector of textboxSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 3000 });
        await page.keyboard.press('Control+A');
        await page.keyboard.type(text, { delay: 8 });
        return true;
      } catch {}
    }
  }
  return false;
}

async function attachMedia(page, mediaFile) {
  if (!mediaFile) return true;
  const input = page.locator('input[type="file"]').first();
  if (!(await input.count())) {
    const addPhotoButton = page
      .locator(
        'div[role="button"]:has-text("Foto"), div[role="button"]:has-text("Photo"), div[role="button"]:has-text("Video")'
      )
      .first();
    if (await addPhotoButton.count()) {
      try {
        await addPhotoButton.click({ timeout: 3000 });
        await page.waitForTimeout(1000);
      } catch {}
    }
  }
  const fileInput = page.locator('input[type="file"]').first();
  if (!(await fileInput.count())) return false;
  await fileInput.setInputFiles(mediaFile);
  await page.waitForTimeout(2500);
  return true;
}

async function publishDialog(page) {
  const publishSelectors = [
    'div[role="dialog"] div[role="button"]:has-text("Publicar")',
    'div[role="dialog"] div[role="button"]:has-text("Post")',
    'div[aria-label="Publicar"]',
  ];
  for (const selector of publishSelectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 4000 });
        await page.waitForTimeout(3500);
        return true;
      } catch {}
    }
  }
  return false;
}

async function autopublishFacebookGroup({ url, text, mediaPublicPath = '' }) {
  const mediaFile = mediaPublicPath ? uploadPublicPathToFile(mediaPublicPath) : null;
  if (mediaFile && !fs.existsSync(mediaFile)) {
    throw new Error('No encontre el adjunto de la publicacion');
  }

  return withFacebookContext(
    async (page) => {
      await ensureLoggedIn(page);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      const opened = await openComposer(page);
      if (!opened) {
        throw new Error('No pude abrir el editor de publicacion en Facebook');
      }

      const textOk = await fillPostText(page, text);
      if (!textOk) {
        throw new Error('No pude escribir el texto en Facebook');
      }

      const mediaOk = await attachMedia(page, mediaFile);
      if (!mediaOk) {
        throw new Error('No pude cargar el adjunto en Facebook');
      }

      const published = await publishDialog(page);
      if (!published) {
        throw new Error('No pude apretar Publicar en Facebook');
      }

      return { ok: true };
    },
    { background: true }
  );
}

async function autopublishFacebookQueue(items = []) {
  const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!normalizedItems.length) {
    return { ok: true, results: [] };
  }

  const context = await createFacebookContext({ background: true });
  const results = [];
  try {
    const bootstrapPage = context.pages()[0] || (await context.newPage());
    await ensureLoggedIn(bootstrapPage);

    for (const item of normalizedItems) {
      const mediaFile = item.mediaPublicPath ? uploadPublicPathToFile(item.mediaPublicPath) : null;
      if (mediaFile && !fs.existsSync(mediaFile)) {
        results.push({
          id: item.id ?? null,
          ok: false,
          error: 'No encontre el adjunto de la publicacion',
        });
        continue;
      }

      const page = await context.newPage();
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2500);

        const opened = await openComposer(page);
        if (!opened) {
          throw new Error('No pude abrir el editor de publicacion en Facebook');
        }

        const textOk = await fillPostText(page, item.text || '');
        if (!textOk) {
          throw new Error('No pude escribir el texto en Facebook');
        }

        const mediaOk = await attachMedia(page, mediaFile);
        if (!mediaOk) {
          throw new Error('No pude cargar el adjunto en Facebook');
        }

        const published = await publishDialog(page);
        if (!published) {
          throw new Error('No pude apretar Publicar en Facebook');
        }

        results.push({ id: item.id ?? null, ok: true });
        await page.waitForTimeout(2200);
      } catch (error) {
        results.push({
          id: item.id ?? null,
          ok: false,
          error: error.message || 'Error autopublicando',
        });
        try {
          await closeOpenDialog(page);
        } catch {}
        await page.waitForTimeout(1000);
      } finally {
        try {
          await page.close();
        } catch {}
      }
    }

    return { ok: true, results };
  } finally {
    await context.close();
  }
}

async function captureFacebookGroupPreview({ url, slug = 'grupo' }) {
  return withFacebookContext(
    async (page) => {
      await ensureLoggedIn(page);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3500);
      const fileName = `${Date.now()}-${
        String(slug || 'grupo')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '') || 'grupo'
      }.jpg`;
      const filePath = path.join(previewsDir, fileName);
      await page.screenshot({ path: filePath, type: 'jpeg', quality: 72, fullPage: false });
      return {
        ok: true,
        preview_path: `/uploads/marketing-publicador-grupos/${fileName}`,
      };
    },
    { background: true }
  );
}

async function openFacebookLoginSession() {
  return withFacebookContext(
    async (page) => {
      await page.goto('https://www.facebook.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(1000);
      const loginNeeded = await page.locator('input[name="email"]').count();
      if (loginNeeded) {
        await page.bringToFront();
        await page.waitForTimeout(60000);
        const stillNeeded = await page.locator('input[name="email"]').count();
        if (stillNeeded) {
          throw new Error('No se completo el login en Chrome a tiempo.');
        }
      } else {
        await page.waitForTimeout(2000);
      }
      return { ok: true };
    },
    { headless: false }
  );
}

module.exports = {
  autopublishFacebookGroup,
  autopublishFacebookQueue,
  captureFacebookGroupPreview,
  openFacebookLoginSession,
};
