const crypto = require('crypto');
const path = require('path');
const express = require('express');
const multer = require('multer');

const auth = require('../middleware/auth');
const db = require('../db');
const { requirePermission } = require('../utils/permissions');
const { uploadsDir, ensureDir } = require('../utils/storagePaths');
const {
  MAX_TOTAL_BYTES,
  borrarArchivos,
  extensionParaMime,
  firmaCompatible,
} = require('../utils/socialMediaUpload');
const social = require('../services/socialService');
const { generarTextoSocial } = require('../services/socialTextGenerator');
const oauthFacebook = require('./../services/social/oauthFacebook');
const autolistas = require('./../services/social/autolistas');
const vinculacion = require('./../services/social/vinculacion');

const router = express.Router();

// Simple in-memory rate limiter
const rateLimits = new Map();
function rateLimit({ windowMs = 60_000, max = 10 }) {
  return (req, res, next) => {
    const key = `${req.user?.id || req.ip}:${req.method}:${req.path}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (rateLimits.get(key) || []).filter((t) => t > windowStart);
    if (timestamps.length >= max) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Probá en unos segundos.' });
    }
    timestamps.push(now);
    rateLimits.set(key, timestamps);
    next();
  };
}

const mediaDir = path.join(uploadsDir, 'social-media');
ensureDir(mediaDir);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, mediaDir),
    filename: (_req, file, done) => {
      const ext = extensionParaMime(file.mimetype) || '.bin';
      done(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 256 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, done) => {
    const accepted = Boolean(extensionParaMime(file.mimetype));
    done(accepted ? null : new Error('Sólo se permiten imágenes o videos compatibles'), accepted);
  },
});

const recibirMedia = (req, res, next) =>
  upload.array('archivos', 8)(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Cada archivo puede pesar hasta 256 MB' });
    }
    if (error.message === 'Sólo se permiten imágenes o videos compatibles') {
      return res.status(415).json({ error: error.message });
    }
    return next(error);
  });

/**
 * La vuelta de Facebook, **antes** del control de sesión.
 *
 * ── Por qué esta ruta no pide sesión ───────────────────────────────────────
 *
 * A esta dirección no llega el usuario haciendo clic en el panel: llega
 * **redirigido por Facebook**. Según cómo esté configurada la cookie del
 * sistema, el navegador puede no mandarla en ese salto, y entonces el usuario
 * vería un "no autorizado" después de haber dado permiso — el peor momento
 * posible para un error.
 *
 * Lo que protege esta ruta no es la cookie sino el `state`: un pase de un solo
 * uso, creado del lado del servidor cuando la persona apretó el botón **con
 * sesión iniciada**, guardado, y exigido acá de vuelta. Sin ese pase no se
 * conecta nada.
 */
router.get('/oauth/facebook/callback', async (req, res) => {
  const volverA = (parametros) =>
    res.redirect(
      `${oauthFacebook.dondeVuelveElUsuario()}/social?${new URLSearchParams(parametros)}`
    );

  if (req.query.error) {
    return volverA({ conexion: 'cancelada' });
  }

  const pase = oauthFacebook.consumirPase(req.query.state);
  if (!pase) {
    return volverA({ conexion: 'error', motivo: 'El pedido venció o no es válido' });
  }

  try {
    const tokenDeUsuario = await oauthFacebook.canjearCodigo(String(req.query.code || ''));
    const paginas = await oauthFacebook.paginasDelUsuario(tokenDeUsuario);

    if (!paginas.length) {
      return volverA({
        conexion: 'error',
        motivo: 'Tu cuenta no administra ninguna página de Facebook',
      });
    }

    oauthFacebook.guardarHallazgo(pase.usuarioId, paginas);
    return volverA({ conexion: 'elegir' });
  } catch (error) {
    return volverA({ conexion: 'error', motivo: error.message });
  }
});

router.use(auth);
router.use(requirePermission('marketing.view'));

/* ── Vincular el Worker con un botón ─────────────────────────────────────── */

/**
 * Devuelve el link que abre y configura el Worker.
 *
 * Pide sesión y permiso de marketing, como todo lo que está debajo de
 * `router.use(auth)`. El código que devuelve dura cinco minutos y sirve una
 * sola vez.
 *
 * No devuelve la clave del Worker: eso lo canjea el Worker por su cuenta,
 * servidor contra servidor. Así la clave nunca pasa por el navegador ni queda
 * en el historial.
 */
router.get('/worker/vinculacion', (req, res) => {
  try {
    const codigo = vinculacion.crearCodigo(req.user?.id ?? null);
    const servidor = vinculacion.direccionParaElWorker(req);

    return res.json({
      /*
        El código va suelto porque quien lo usa es la extensión de Chrome, que
        lo recibe por un mensaje de la página.

        El `link` con el protocolo `modosabor-social://` quedó del programa de
        escritorio, que la extensión reemplaza. Se sigue devolviendo para no
        romper una instalación vieja que todavía lo espere.

        Devolverlo **sólo** adentro del link fue un bug: el panel pedía
        `codigo` suelto, le llegaba `undefined`, y la extensión rechazaba la
        vinculación por incompleta. Apareció recién al probarlo en vivo.
      */
      codigo,
      servidor,
      link: `modosabor-social://vincular?servidor=${encodeURIComponent(servidor)}&codigo=${codigo}`,
      /* Para poder mostrar "el código vence en 5 minutos" sin hardcodearlo. */
      duraMinutos: Math.round(vinculacion.VIDA_MS / 60000),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/* ── Conectar Facebook con un botón ──────────────────────────────────────── */

router.get('/oauth/facebook/estado', (_req, res) =>
  res.json({
    configurado: oauthFacebook.estaConfigurado(),
    direccionDeVuelta: oauthFacebook.direccionDeVuelta(),
    problemaDireccion: oauthFacebook.problemaConLaDireccion(),
    permisos: oauthFacebook.PERMISOS,
  })
);

router.post('/oauth/facebook/iniciar', (req, res) => {
  try {
    return res.json({ url: oauthFacebook.urlParaConectar(req.user?.id || 0) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/oauth/facebook/paginas', (req, res) =>
  res.json({ items: oauthFacebook.paginasEncontradas(req.user?.id || 0) })
);

router.post('/oauth/facebook/elegir', async (req, res) => {
  try {
    const conexion = oauthFacebook.conectarPagina({
      usuarioId: req.user?.id || 0,
      pageId: req.body?.pageId,
      cuentaId: req.body?.cuentaId,
    });
    const pagina = await social.probarCredenciales(req.body?.cuentaId, 'pagina');
    const instagram = conexion.instagram
      ? await social.probarCredenciales(req.body?.cuentaId, 'instagram')
      : null;
    return res.json({ ...conexion, verificaciones: { pagina, instagram } });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

/**
 * Vuelve a bajar las fotos de perfil de todas las cuentas conectadas.
 *
 * Existe porque la Fan Page y el Instagram se conectaron **antes** de que el
 * sistema supiera bajar fotos. Sin esto habría que desconectar y reconectar
 * todo para tener una foto, que es pedirle a alguien que rompa algo que anda.
 *
 * Sirve también después: si cambiás la foto de la página, esto la actualiza.
 */
router.post('/avatares/refrescar', async (_req, res) => {
  try {
    const cuentas = social.listIdentities(null);
    const hechos = [];
    for (const cuenta of cuentas) {
      try {
        const resultados = await oauthFacebook.bajarAvataresDeLaCuenta(cuenta.id);
        hechos.push(...resultados.map((r) => ({ ...r, cuenta: cuenta.nombre })));
      } catch (error) {
        hechos.push({ cuenta: cuenta.nombre, avatar: null, error: error.message });
      }
    }
    const enCola = social.encolarAvataresRemotosPendientes();
    return res.json({
      total: hechos.length,
      conFoto: hechos.filter((h) => h.avatar).length,
      enCola,
      detalle: hechos,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/dashboard', (_req, res) => res.json(social.dashboard()));
router.get('/metricas', (req, res) => {
  try {
    return res.json(social.getMetrics(Number(req.query.dias) || 30));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
router.post(
  '/metricas/actualizar-alcance',
  rateLimit({ windowMs: 60_000, max: 4 }),
  async (req, res) => {
    try {
      return res.json(await social.actualizarAlcanceMeta({ days: Number(req.body?.dias) || 30 }));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
);
/**
 * Las identidades de publicación.
 *
 * Facebook no es una cuenta sola: son el Perfil y la Fan Page, cada uno con
 * sus propios grupos y permisos. La pantalla necesita esta lista para poder
 * preguntar "¿con cuál publicás?" antes de cualquier otra cosa.
 */
router.get('/identidades', (req, res) =>
  res.json({ items: social.listIdentities(req.query.provider || null) })
);

router.get('/destinos', (req, res) =>
  res.json(
    social.listDestinations({
      type: String(req.query.tipo || ''),
      enabledOnly: req.query.habilitados === '1',
      /* Filtrar por identidad: los grupos del Perfil no son los de la Page. */
      cuentaId: Number(req.query.identidad) || null,
    })
  )
);
router.get('/conjuntos', (_req, res) => res.json(social.listSets()));
router.get('/campanas', (req, res) => res.json(social.listCampaigns(req.query.limite)));
router.get('/campanas/:id', (req, res) => {
  const campaign = social.getCampaign(Number(req.params.id));
  if (!campaign) return res.status(404).json({ error: 'No existe la campaña' });
  return res.json(campaign);
});

router.use(requirePermission('marketing.edit'));

router.post('/media', recibirMedia, (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'Elegí al menos un archivo' });
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
    borrarArchivos(files);
    return res.status(413).json({ error: 'El conjunto de archivos puede pesar hasta 256 MB' });
  }
  if (files.some((file) => !firmaCompatible(file.path, file.mimetype))) {
    borrarArchivos(files);
    return res.status(415).json({ error: 'Un archivo no coincide con su formato declarado' });
  }
  const insert = db.prepare(
    'INSERT INTO social_media (nombre, ruta, mime, tamano, tipo) VALUES (?, ?, ?, ?, ?)'
  );
  const created = files.map((file) => {
    const id = Number(
      insert.run(
        file.originalname,
        `/uploads/social-media/${file.filename}`,
        file.mimetype,
        file.size,
        file.mimetype.startsWith('video/') ? 'video' : 'imagen'
      ).lastInsertRowid
    );
    return {
      id,
      nombre: file.originalname,
      ruta: `/uploads/social-media/${file.filename}`,
      mime: file.mimetype,
      tamano: file.size,
    };
  });
  return res.status(201).json(created);
});

router.get('/media', (_req, res) => {
  res.json(db.prepare('SELECT * FROM social_media ORDER BY id DESC LIMIT 200').all());
});
router.get('/plantillas', (_req, res) => res.json(social.listTemplates()));
router.post('/plantillas', (req, res) => {
  try {
    return res.status(201).json(social.createTemplate(req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.put('/plantillas/:id', (req, res) => {
  try {
    return res.json(social.updateTemplate(Number(req.params.id), req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.delete('/plantillas/:id', (req, res) => {
  try {
    return res.json(social.deleteTemplate(Number(req.params.id)));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/conjuntos', (req, res) => {
  try {
    return res.status(201).json(social.createSet(req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/destinos', (req, res) => {
  try {
    return res.status(201).json(social.createDestination(req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.put('/destinos/lote', (req, res) => {
  try {
    return res.json(
      social.updateDestinationsBulk(req.body?.ids || [], {
        habilitada: req.body?.habilitada,
      })
    );
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.put('/destinos/:id', (req, res) => {
  try {
    return res.json(social.updateDestination(Number(req.params.id), req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.delete('/destinos/:id', (req, res) => {
  try {
    return res.json(social.deleteDestination(Number(req.params.id)));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/campanas', rateLimit({ windowMs: 60_000, max: 8 }), (req, res) => {
  try {
    return res
      .status(201)
      .json(social.createCampaign({ ...(req.body || {}), usuarioId: req.user.id }));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/campanas/:id/encolar', rateLimit({ windowMs: 60_000, max: 12 }), (req, res) => {
  try {
    return res.json(social.queueCampaign(Number(req.params.id), { now: Boolean(req.body?.ahora) }));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/campanas/:id/cancelar', (req, res) => {
  try {
    return res.json(social.cancelCampaign(Number(req.params.id)));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/campanas/:id/reintentar-fallidos', (req, res) => {
  try {
    return res.json(social.retryFailedCampaign(Number(req.params.id)));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/campanas/:id/duplicar', rateLimit({ windowMs: 60_000, max: 5 }), (req, res) => {
  try {
    return res.status(201).json(social.duplicateCampaign(Number(req.params.id)));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.delete('/campanas/:id', (req, res) => {
  try {
    return res.json(social.deleteCampaign(Number(req.params.id)));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
/**
 * Sincronizar los grupos de una identidad, o de las dos.
 *
 * ── Por qué "ambas" son dos pedidos y no uno ───────────────────────────────
 *
 * El worker tiene que pararse en una identidad, mirar sus grupos, y recién
 * después cambiar a la otra. Son dos recorridos distintos del navegador. Si
 * fuera un solo comando, un fallo a la mitad dejaría la mitad sincronizada sin
 * forma de saber cuál.
 *
 * Con dos comandos independientes, cada uno reporta por separado: si el Perfil
 * anduvo y la Page falló, se ve exactamente así.
 */
router.post('/grupos/sincronizar', (req, res) => {
  try {
    const pedido = String(req.body?.identidad || req.body?.identityId || '').trim();

    if (pedido === 'ambas' || pedido === 'todas') {
      const identidades = social.listIdentities('facebook');
      if (!identidades.length) throw new Error('No hay identidades de Facebook cargadas');
      return res.status(202).json({
        comandos: identidades.map((identidad) => ({
          identityId: identidad.id,
          nombre: identidad.nombre,
          comandoId: social.createWorkerCommand('sync_facebook_groups', {
            identityId: identidad.id,
          }),
        })),
      });
    }

    return res.status(202).json({
      comandoId: social.createWorkerCommand('sync_facebook_groups', {
        identityId: Number(pedido),
      }),
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});
router.post('/worker/health-check', (_req, res) =>
  res.status(202).json({ comandoId: social.createWorkerCommand('health_check') })
);
router.get('/logs', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limite) || 100, 1), 300);
  res.json(db.prepare('SELECT * FROM social_publication_logs ORDER BY id DESC LIMIT ?').all(limit));
});
router.get('/logs/:id/screenshot', (req, res) => {
  const entry = db
    .prepare('SELECT screenshot_ruta FROM social_publication_logs WHERE id = ?')
    .get(Number(req.params.id));
  const name = path.basename(String(entry?.screenshot_ruta || ''));
  const { dataDir } = require('../utils/storagePaths');
  const file = name && path.join(dataDir, 'social-error-screenshots', name);
  if (!file || !require('fs').existsSync(file)) {
    return res.status(404).json({ error: 'No hay captura para este evento' });
  }
  return res.type('image/png').sendFile(file);
});

router.post('/generar-texto', async (req, res) => {
  try {
    const tema = String(req.body?.tema || '').trim();
    if (!tema) return res.status(400).json({ error: 'Indicá el tema de la publicación' });
    const texto = await generarTextoSocial(tema);
    return res.json({ texto });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/config', (_req, res) => res.json(social.getSocialConfig()));
router.post('/config', (req, res) => {
  try {
    return res.json(social.setSocialConfig(req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

/* ── Freno de mano ─────────────────────────────────────────────────────────
   Pausar no cancela: los destinos quedan en cola donde están y siguen al
   reanudar. Por eso no pide confirmación de "vas a perder algo" — no se pierde
   nada.
   ────────────────────────────────────────────────────────────────────────── */

router.post('/pausa', (req, res) => {
  try {
    const activa = req.body?.activa !== false;
    return res.json(activa ? social.pausarTodo(req.body?.motivo || '') : social.reanudarTodo());
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/identidades/:id/pausa', (req, res) => {
  try {
    const activa = req.body?.activa !== false;
    return res.json(
      activa
        ? social.pausarIdentidad(req.params.id, req.body?.motivo || '')
        : social.reanudarIdentidad(req.params.id)
    );
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

/* ── Conectar Facebook e Instagram por la API oficial ──────────────────────
   El token se guarda cifrado y no se devuelve nunca. La respuesta dice si hay
   token cargado, no cuál es.
   ────────────────────────────────────────────────────────────────────────── */

router.get('/identidades/:id/credenciales', (req, res) => {
  try {
    return res.json(social.estadoDeCredenciales(req.params.id));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/identidades/:id/credenciales', (req, res) => {
  try {
    return res.json(social.guardarCredenciales(req.params.id, req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/identidades/:id/probar', async (req, res) => {
  try {
    return res.json(await social.probarCredenciales(req.params.id, req.body?.tipo));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

/* ── La papelera ──────────────────────────────────────────────────────────
   Cancelar deja de ser definitivo. Se recupera como borrador, no encolada:
   recuperar y publicar son dos decisiones distintas.
   ────────────────────────────────────────────────────────────────────────── */

router.get('/papelera', (req, res) => res.json({ items: social.listarPapelera(req.query.limite) }));

router.post('/campanas/:id/restaurar', (req, res) => {
  try {
    return res.json(social.restaurarCampana(req.params.id));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

/* ── Autolistas ───────────────────────────────────────────────────────────
   Contenido que se publica solo. No publica por su cuenta: arma campañas y
   las encola, así pasa por los mismos frenos que todo lo demás.
   ────────────────────────────────────────────────────────────────────────── */

router.get('/autolistas', (_req, res) => res.json({ items: autolistas.listar() }));

router.get('/autolistas/:id', (req, res) => {
  const lista = autolistas.obtener(req.params.id);
  if (!lista) return res.status(404).json({ error: 'No existe esa autolista' });
  return res.json(lista);
});

router.post('/autolistas', (req, res) => {
  try {
    return res.status(201).json(autolistas.crear(req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.put('/autolistas/:id', (req, res) => {
  try {
    return res.json(autolistas.actualizar(req.params.id, req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/autolistas/:id', (req, res) => {
  try {
    return res.json(autolistas.eliminar(req.params.id));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.post('/autolistas/:id/piezas', (req, res) => {
  try {
    return res.status(201).json(autolistas.agregarPieza(req.params.id, req.body || {}));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/autolistas/piezas/:piezaId', (req, res) => {
  try {
    return res.json(autolistas.borrarPieza(req.params.piezaId));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

module.exports = router;
