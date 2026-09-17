const path = require('path');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');

const db = require('../db');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { requirePermission, hasPermission } = require('../utils/permissions');
const { conexion } = require('../services/whatsappMasivo/conexion');
const { motor, registrarRespuesta } = require('../services/whatsappMasivo/motor');
const {
  normalizarTelefono,
  formatearTelefono,
  aJid,
  deJid,
} = require('../services/whatsappMasivo/telefono');
const reglas = require('../services/whatsappMasivo/reglas');
const fotosPerfil = require('../services/whatsappMasivo/fotosPerfil');
const {
  audiencia,
  contarConversacionesEsperandoPersona,
  recuperarAgendaDesdeConversaciones,
} = require('../services/whatsappMasivo/agenda');
const { redactarCampana } = require('../services/whatsappMasivo/redactor');
const { resumenGateway, gatewayConfig } = require('../services/whatsappGateway');
const { testEmergencyProvider } = require('../services/whatsappEmergencyProvider');
const { uploadsDir, ensureDir } = require('../utils/storagePaths');

const router = express.Router();
const whatsappMediaDir = path.join(uploadsDir, 'whatsapp-campanas');
ensureDir(whatsappMediaDir);
const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, whatsappMediaDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype);
    cb(ok ? null : new Error('Sólo se permiten imágenes JPG, PNG, WEBP o PDF'), ok);
  },
});

/**
 * Envío masivo de WhatsApp, desde el sistema.
 *
 * ── Por qué todo pide login y permiso ──────────────────────────────────────
 *
 * Cualquiera de estos endpoints le escribe a doscientos clientes con el
 * número del local. No es una pantalla de consulta: es la que más daño puede
 * hacer del panel entero, así que va detrás del mismo permiso que marketing.
 */
/**
 * Cuántos chats están esperando a una persona ahora mismo.
 *
 * Va **antes** del permiso de marketing y con `auth` solo, a propósito. El
 * badge del menú lo pide quien está atendiendo —el cajero—, y el rol `caja` no
 * tiene `marketing.edit`: detrás de ese permiso el pedido devolvía 403, el
 * error se tragaba con un `.catch(() => {})` y **el badge no aparecía nunca**,
 * justo para la persona que tiene que verlo.
 *
 * Devuelve un número y nada más. No expone teléfonos, mensajes ni nombres, así
 * que no hay motivo para esconderlo detrás del permiso que protege el envío
 * masivo.
 */
router.get('/conversaciones/esperando-persona', auth, (_req, res) => {
  res.json({ cantidad: contarConversacionesEsperandoPersona(db) });
});

router.use(auth, (req, res, next) => {
  const { permisoWhatsapp } = require('../utils/whatsappPermissions');
  return requirePermission(permisoWhatsapp(req.method, req.path))(req, res, next);
});

router.post('/media', uploadMedia.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Elegí una imagen o un PDF' });
  res.status(201).json({
    path: `/uploads/whatsapp-campanas/${req.file.filename}`,
    nombre: path.basename(req.file.originalname || req.file.filename),
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
});

/**
 * El código QR, ya dibujado, como imagen embebida en la respuesta.
 *
 * ── Por qué se dibuja acá y no se manda el texto ───────────────────────────
 *
 * La pantalla lo resolvía pidiéndole la imagen a api.qrserver.com, un servicio
 * ajeno: `<img src="...qrserver.com/...?data=EL_CODIGO">`.
 *
 * Ese código no es un dato cualquiera. Es la credencial de vinculación: quien
 * lo tenga, mientras está vigente, puede vincular su propio teléfono al
 * WhatsApp del local y quedarse adentro —leer todas las conversaciones con los
 * clientes y escribir en nombre del negocio—. Mandárselo a un tercero para que
 * lo dibuje es entregarle la llave a cambio de una imagen de 240 píxeles.
 *
 * Dibujarlo acá cuesta una dependencia chica y sin compilación (`qrcode`, JS
 * puro), y el código no sale nunca del sistema.
 *
 * Si el dibujo falla se devuelve null en vez de romper la pantalla entera: el
 * resto del estado —si está conectado, cuánto queda de cupo— sigue sirviendo.
 */
async function qrDibujado(resumen) {
  if (!resumen?.qr) return null;
  try {
    return await QRCode.toDataURL(resumen.qr, {
      width: 260,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
  } catch (error) {
    logger.error('No se pudo dibujar el QR de WhatsApp', { message: error.message });
    return null;
  }
}

/** Todo junto: sesión, motor y números del día. Es lo que la pantalla pide. */
router.get('/estado', async (_req, res) => {
  const config = motor.leerConfig();
  const whatsapp = conexion.resumen();
  res.json({
    whatsapp: { ...whatsapp, qr: undefined, qrImagen: await qrDibujado(whatsapp) },
    gateway: resumenGateway(),
    motor: motor.resumen(),
    hoy: {
      enviados: motor.enviadosHoy(),
      cupoUsado: motor.enviadosEnVentana(config.ventanaMinutos),
      cupoTotal: config.maxPorVentana,
      ventanaMinutos: config.ventanaMinutos,
      tope: reglas.limiteDeHoy(config, motor.diasConEnvios()),
      esDiaDeEnvio: reglas.esDiaDeEnvio(config),
    },
    pendientes: motor.destinatarios().length,
  });
});

// ── Sesión ────────────────────────────────────────────────────────────────

router.post('/conectar', async (_req, res) => {
  const resumen = await conexion.conectar();
  // Mismo criterio que en /estado: el código sale dibujado, nunca en crudo.
  res.json({ ...resumen, qr: undefined, qrImagen: await qrDibujado(resumen) });
});

router.post('/desconectar', async (_req, res) => {
  res.json(await conexion.desvincular());
});

router.put('/gateway', (req, res) => {
  const guardar = db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  );
  const mapa = {
    pausaTotal: 'whatsapp_gateway_pausa_total',
    atencionIa: 'whatsapp_atencion_ia_activa',
    masivos: 'whatsapp_masivos_activo',
  };
  Object.entries(mapa).forEach(([campo, clave]) => {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, campo)) return;
    guardar.run(clave, req.body[campo] === true ? '1' : '0');
  });
  if (req.body?.pausaTotal === true || req.body?.masivos === false) motor.pausar();
  res.json({ ok: true, gateway: resumenGateway() });
});

router.post('/emergencia/probar', async (_req, res) => {
  try {
    res.json(await testEmergencyProvider());
  } catch (error) {
    logger.warn('No se pudo probar la IA de emergencia', { message: error.message });
    res.status(400).json({ error: error.message });
  }
});

router.get('/conversaciones', (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite) || 30, 1), 100);
  const offset = Math.max(0, Math.floor(Number(req.query.offset) || 0));
  const items = db
    .prepare(
      `SELECT c.*,
              (SELECT contenido FROM whatsapp_mensajes m
                WHERE m.conversacion_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje,
              (SELECT tipo FROM whatsapp_mensajes m
                WHERE m.conversacion_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_tipo,
              (SELECT COUNT(*) FROM pedidos p
                WHERE REPLACE(REPLACE(REPLACE(p.cliente_telefono, ' ', ''), '+', ''), '-', '')
                  LIKE '%' || REPLACE(REPLACE(REPLACE(c.telefono, ' ', ''), '+', ''), '-', '')
                  AND p.origen = 'whatsapp') AS pedidos_creados
         FROM whatsapp_conversaciones c
        ORDER BY CASE WHEN c.escalado_humano = 1 AND c.bot_silenciado = 1
          AND (c.bot_silenciado_hasta IS NULL OR c.bot_silenciado_hasta > CURRENT_TIMESTAMP) THEN 0 ELSE 1 END,
          datetime(c.ultimo_mensaje_en) DESC, c.id DESC
        LIMIT ? OFFSET ?`
    )
    .all(limite, offset);
  const total = db.prepare('SELECT COUNT(*) total FROM whatsapp_conversaciones').get().total;
  res.json({ items, total });
});

router.get('/conversaciones/:id/mensajes', (req, res) => {
  const conversacionId = Number(req.params.id);
  const conversation = db
    .prepare('SELECT * FROM whatsapp_conversaciones WHERE id = ?')
    .get(conversacionId);
  if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' });
  const mensajes = db
    .prepare(
      `SELECT id, direccion, tipo, contenido, creado_en, payload
         FROM whatsapp_mensajes WHERE conversacion_id = ? ORDER BY id DESC LIMIT 80`
    )
    .all(conversacionId)
    .reverse();
  res.json({ conversation, mensajes });
});

router.put('/conversaciones/:id/control', (req, res) => {
  const id = Number(req.params.id);
  const accion = String(req.body?.accion || '').toLowerCase();
  if (!['tomar', 'devolver'].includes(accion)) {
    return res.status(400).json({ error: 'Acción inválida' });
  }
  const result =
    accion === 'tomar'
      ? db
          .prepare(
            `UPDATE whatsapp_conversaciones SET bot_silenciado = 1, escalado_humano = 1,
                    bot_silenciado_hasta = NULL, ultimo_estado = 'esperando_humano',
                    actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
          )
          .run(id)
      : db
          .prepare(
            `UPDATE whatsapp_conversaciones SET bot_silenciado = 0, escalado_humano = 0,
                    bot_silenciado_hasta = NULL, ultimo_estado = 'atencion',
                    actualizado_en = CURRENT_TIMESTAMP WHERE id = ?`
          )
          .run(id);
  if (!result.changes) return res.status(404).json({ error: 'Conversación no encontrada' });
  res.json({ ok: true });
});

/**
 * Contestarle a alguien desde el panel.
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 *
 * Hasta ahora, para responderle a un cliente había que agarrar el teléfono del
 * local. Y el gateway, cuando ve un mensaje saliente que no salió del sistema,
 * asume que una persona tomó la conversación y **silencia al bot 30 minutos**
 * en ese chat. El comportamiento es correcto, pero pasaba sin que nadie lo
 * viera: ya nos costó una hora buscando un bot roto que no estaba roto.
 *
 * Contestando desde acá el mensaje sale marcado como del sistema, así que ese
 * silencio automático no se dispara. Pero el bot igual se retira: si una
 * persona ya contestó, el bot no puede seguir hablando por atrás y
 * contradecirla. La diferencia es que ahora **el silencio se decide acá y se
 * devuelve en la respuesta**, para que la pantalla lo diga en voz alta y
 * ofrezca devolverle la conversación al bot.
 *
 * Un dato silencioso es el que hace perder tiempo. Este deja de serlo.
 */
router.post('/responder', async (req, res) => {
  const telefono = normalizarTelefono(req.body?.telefono);
  const texto = String(req.body?.texto || '').trim();

  if (!telefono) return res.status(400).json({ error: 'Falta el teléfono' });
  if (!texto) return res.status(400).json({ error: 'Escribí algo para mandar' });
  if (texto.length > 4000) return res.status(400).json({ error: 'El mensaje es demasiado largo' });
  if (
    !hasPermission(req.user, 'marketing.edit') &&
    !db.prepare('SELECT id FROM whatsapp_conversaciones WHERE telefono = ?').get(telefono)
  ) {
    return res.status(404).json({ error: 'La respuesta requiere una conversación existente' });
  }

  if (!conexion.listo) {
    return res.status(409).json({ error: 'WhatsApp no está conectado' });
  }

  /*
    Una baja pedida es una baja respetada. Contestarle a alguien que pidió no
    recibir más es la forma más rápida de que te reporten, y un reporte pesa
    mucho más que un mensaje perdido.
  */
  const dadoDeBaja = db
    .prepare('SELECT 1 AS existe FROM wa_excluidos WHERE telefono = ?')
    .get(telefono);
  if (dadoDeBaja) {
    return res.status(409).json({ error: 'Esta persona pidió no recibir más mensajes' });
  }

  try {
    await conexion.enviarTexto(aJid(telefono), texto);
  } catch (error) {
    logger.warn('WhatsApp: no se pudo responder desde el panel', { message: error.message });
    return res.status(502).json({ error: error.message || 'No se pudo mandar' });
  }

  /* El bot se retira de este chat: ya hay una persona atendiendo. */
  const conversacion = db
    .prepare('SELECT id FROM whatsapp_conversaciones WHERE telefono = ?')
    .get(telefono);

  if (conversacion) {
    db.prepare(
      `UPDATE whatsapp_conversaciones
          SET bot_silenciado = 1,
              escalado_humano = 1,
              bot_silenciado_hasta = datetime('now', '+30 minutes'),
              actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?`
    ).run(conversacion.id);
  }

  return res.json({
    ok: true,
    conversacionId: conversacion?.id || null,
    botSilenciado: Boolean(conversacion),
    minutosSilencio: 30,
  });
});

/**
 * Quiénes recibieron una campaña y no contestaron.
 *
 * ── Por qué esto vale más que una campaña nueva ────────────────────────────
 *
 * Mandarle otra vez a toda la lista es empezar de cero y molestar de nuevo al
 * que ya contestó. Los que recibieron y no dijeron nada son otra cosa: ya
 * sabemos que el mensaje les llegó, así que no es un problema de entrega, y no
 * pidieron la baja, así que no les molestó. Es la lista más rentable que
 * tenemos y hasta ahora no se podía usar.
 *
 * ── Por qué "recibieron" y no "les mandamos" ───────────────────────────────
 *
 * La condición es `entregado_en IS NOT NULL`. Uno al que el mensaje nunca le
 * llegó no es alguien que ignoró la promo: es alguien a quien le falló la
 * entrega. Insistirle con el mismo texto no arregla nada, y si el número está
 * mal, sólo suma un fallo más.
 *
 * A los que quedaron sin recibo —los envíos viejos, de antes de que
 * existieran— se los cuenta aparte y no entran, para que el número que se ve
 * en pantalla no prometa más de lo que hay.
 */
router.get('/campanas/:id/sin-respuesta', (req, res) => {
  const campanaId = Number(req.params.id);
  if (!Number.isFinite(campanaId)) return res.status(400).json({ error: 'Campaña inválida' });

  const campana = db.prepare('SELECT id, nombre FROM wa_campanas WHERE id = ?').get(campanaId);
  if (!campana) return res.status(404).json({ error: 'La campaña no existe' });

  const items = db
    .prepare(
      `SELECT e.telefono, e.nombre, c.id AS contacto_id
         FROM wa_envios e
         LEFT JOIN wa_contactos c ON c.telefono = e.telefono
        WHERE e.campana_id = ?
          AND e.entregado_en IS NOT NULL
          AND e.telefono NOT IN (SELECT telefono FROM wa_excluidos)
          AND NOT EXISTS (
            SELECT 1 FROM wa_respuestas r
             WHERE r.telefono = e.telefono
               AND r.recibido_en >= e.enviado_en
          )`
    )
    .all(campanaId);

  const sinRecibo = db
    .prepare(
      `SELECT COUNT(*) AS total FROM wa_envios
        WHERE campana_id = ? AND estado = 'enviado' AND entregado_en IS NULL`
    )
    .get(campanaId);

  res.json({
    campana: { id: campana.id, nombre: campana.nombre },
    total: items.length,
    sinRecibo: Number(sinRecibo?.total || 0),
    /* Sólo los que tienen ficha en la agenda se pueden usar como destinatarios. */
    clientesIds: items.map((x) => x.contacto_id).filter(Boolean),
    items: items.slice(0, 200).map((x) => ({
      telefono: x.telefono,
      telefonoLegible: formatearTelefono(x.telefono),
      nombre: x.nombre || '',
    })),
  });
});

router.get('/metricas-atencion', (_req, res) => {
  const totals = db
    .prepare(
      `SELECT
         SUM(CASE WHEN direccion = 'entrante' THEN 1 ELSE 0 END) AS recibidos,
         SUM(CASE WHEN direccion = 'saliente' THEN 1 ELSE 0 END) AS respondidos,
         SUM(CASE WHEN tipo = 'audio' AND json_extract(payload, '$.transcripto') = 1 THEN 1 ELSE 0 END) AS audios_transcriptos,
         SUM(CASE WHEN json_extract(payload, '$.motivo') = 'audio_no_transcripto' THEN 1 ELSE 0 END) AS errores_audio,
         SUM(CASE WHEN json_extract(payload, '$.motivo') = 'proveedor_ia_temporal' THEN 1 ELSE 0 END) AS errores_ia
       FROM whatsapp_mensajes
       WHERE datetime(creado_en) >= datetime('now', '-7 days')`
    )
    .get();
  const pedidos = db
    .prepare(
      `SELECT COUNT(*) AS total FROM pedidos
        WHERE origen = 'whatsapp' AND datetime(creado_en) >= datetime('now', '-7 days')`
    )
    .get()?.total;
  const agenteResumen = db
    .prepare(
      `SELECT COUNT(DISTINCT conversacion_id) conversaciones,
              COUNT(DISTINCT CASE WHEN pedido_creado = 1 THEN conversacion_id END) completadas,
              ROUND(AVG(latencia_ms)) latencia_promedio_ms,
              SUM(handoff) handoffs,
              SUM(tokens_entrada) tokens_entrada,
              SUM(tokens_salida) tokens_salida
         FROM agente_metricas
        WHERE datetime(creado_en) >= datetime('now', '-7 days')`
    )
    .get();
  const trazas = db
    .prepare(
      `SELECT m.*, c.nombre
         FROM agente_metricas m
         LEFT JOIN whatsapp_conversaciones c ON c.id = m.conversacion_id
        ORDER BY m.id DESC LIMIT 20`
    )
    .all()
    .map((item) => ({
      ...item,
      herramientas: (() => {
        try {
          return JSON.parse(item.herramientas || '[]');
        } catch {
          return [];
        }
      })(),
    }));
  const usoHerramientas = {};
  trazas.forEach((traza) => {
    traza.herramientas.forEach((nombre) => {
      usoHerramientas[nombre] = (usoHerramientas[nombre] || 0) + 1;
    });
  });
  const conversaciones = Number(agenteResumen?.conversaciones || 0);
  const completadas = Number(agenteResumen?.completadas || 0);
  res.json({
    periodo_dias: 7,
    ...totals,
    pedidos: Number(pedidos || 0),
    agente: {
      ...agenteResumen,
      conversion_pct: conversaciones ? Math.round((completadas / conversaciones) * 100) : 0,
      herramientas_mas_usadas: Object.entries(usoHerramientas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([nombre, cantidad]) => ({ nombre, cantidad })),
      trazas,
    },
  });
});

// ── Destinatarios ─────────────────────────────────────────────────────────

/**
 * A quiénes se les puede escribir hoy.
 *
 * Va con el teléfono formateado porque trece dígitos pegados no se leen ni se
 * comparan de un vistazo, y el operador tiene que poder reconocer al cliente.
 */
router.get('/destinatarios', (req, res) => {
  const segmento = String(req.query.segmento || 'todos');
  const lista = motor.destinatarios({ segmento });
  res.json({
    total: lista.length,
    items: lista.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      telefono: c.tel,
      telefonoLegible: formatearTelefono(c.tel),
      totalPedidos: c.total_pedidos,
    })),
  });
});

// Segmentos calculados desde los chats y el historial del número conectado.
// No se mezclan con los segmentos comerciales del TPV: esta agenda puede
// incluir personas que todavía nunca hicieron una compra.
router.get('/segmentos', (_req, res) => {
  res.json({ items: motor.resumenSegmentos() });
});

// ── Agenda de chats de WhatsApp ──────────────────────────────────────────

function contactoPublico(contacto) {
  return {
    ...contacto,
    excluido: Boolean(contacto.excluido),
    telefonoLegible: formatearTelefono(contacto.telefono),
    /*
      La pantalla recibe la dirección lista para poner en un <img>, no el
      nombre del archivo. Si armara la ruta del lado del cliente, el día que
      se mueva la carpeta habría que acordarse de tocar los dos lados.
    */
    fotoUrl: contacto.foto ? `${fotosPerfil.RUTA_PUBLICA}/${contacto.foto}` : null,
  };
}

router.get('/contactos', (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite) || 60, 1), 200);
  const pagina = Math.max(Number(req.query.pagina) || 1, 1);
  const buscar = String(req.query.buscar || '')
    .trim()
    .slice(0, 100);
  const filtro = String(req.query.filtro || 'todos');
  const where = [];
  const valores = [];
  if (buscar) {
    where.push('(nombre LIKE ? OR telefono LIKE ?)');
    valores.push(`%${buscar}%`, `%${buscar.replace(/\D/g, '')}%`);
  }
  if (filtro === 'excluidos') where.push('excluido = 1');
  if (filtro === 'activos') where.push('excluido = 0');
  const condicion = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db
    .prepare(`SELECT COUNT(*) AS total FROM wa_contactos ${condicion}`)
    .get(...valores).total;
  const items = db
    .prepare(
      `SELECT * FROM wa_contactos ${condicion}
       ORDER BY COALESCE(ultimo_mensaje_en, creado_en) DESC, nombre COLLATE NOCASE
       LIMIT ? OFFSET ?`
    )
    .all(...valores, limite, (pagina - 1) * limite)
    .map(contactoPublico);

  /*
    Cada contacto sale con sus segmentos, sus envíos y sus respuestas.

    Ese cálculo ya existía en `audiencia()` y sólo lo usaba el motor para
    decidir a quién escribirle. La pantalla, mientras tanto, mostraba una fila
    con nombre y teléfono y nada más, porque nunca se le pasó el dato.

    Se calcula una vez para toda la agenda y se indexa por teléfono. Pedirlo de
    a uno sería una consulta por contacto: con 500 contactos, 500 consultas
    para armar una lista.
  */
  const enriquecidos = new Map(
    audiencia(db).map((c) => [
      c.telefono,
      {
        segmentos: c.segmentos || [],
        envios: Number(c.total_enviados || 0),
        respuestas: Number(c.total_respuestas || 0),
      },
    ])
  );

  const etiquetasPorContacto = new Map();
  db.prepare('SELECT contacto_id, etiqueta FROM wa_etiquetas')
    .all()
    .forEach((fila) => {
      if (!etiquetasPorContacto.has(fila.contacto_id)) {
        etiquetasPorContacto.set(fila.contacto_id, []);
      }
      etiquetasPorContacto.get(fila.contacto_id).push(fila.etiqueta);
    });

  res.json({
    total: Number(total),
    pagina,
    limite,
    items: items.map((c) => ({
      ...c,
      ...(enriquecidos.get(c.telefono) || { segmentos: [], envios: 0, respuestas: 0 }),
      etiquetas: etiquetasPorContacto.get(c.id) || [],
    })),
  });
});

/**
 * Reparación manual segura para una sesión que ya estaba vinculada antes de
 * habilitar el history sync. No conecta, no envía y no importa clientes del
 * TPV: sólo reconstruye la agenda con chats que WhatsApp IA ya registró.
 */
router.post('/contactos/recuperar', (_req, res) => {
  res.json({ ok: true, ...recuperarAgendaDesdeConversaciones(db) });
});

/**
 * Fotos de perfil: arrancar la sincronización y mirar cómo va.
 *
 * ── Por qué responde antes de terminar ─────────────────────────────────────
 *
 * Bajar las fotos de una agenda entera tarda minutos: hay medio segundo de
 * espera entre una y otra para no parecer un robot. Si la respuesta esperara
 * el final, el navegador cortaría el pedido por tiempo y la pantalla mostraría
 * un error mientras el trabajo sigue andando bien por detrás.
 *
 * Así que esto arranca el trabajo, contesta enseguida, y la pantalla pregunta
 * cada tanto por /fotos/estado. Es lo mismo que hace el script de Kimi con sus
 * eventos, resuelto sin necesidad de abrir un canal permanente.
 */
router.post('/fotos', (req, res) => {
  if (motor.corriendo) {
    return res.status(409).json({
      error: 'Hay un envío en curso. Esperá a que termine para bajar las fotos.',
    });
  }

  const opciones = {
    db,
    conexion,
    todos: req.body?.todos === true,
    limite: Number(req.body?.limite) || 0,
  };

  try {
    if (!conexion.listo) throw new Error('WhatsApp no está conectado');
    if (fotosPerfil.estado().corriendo) throw new Error('Ya se están bajando las fotos');
  } catch (error) {
    return res.status(409).json({ error: error.message });
  }

  /*
    El .catch() no puede faltar: sin él, un fallo acá adentro sería un rechazo
    sin atender, que en Node tumba el proceso entero. Un problema bajando una
    foto no puede voltear el sistema del local.
  */
  fotosPerfil.sincronizar(opciones).catch((error) => {
    logger.error('WhatsApp: falló la sincronización de fotos', { message: error.message });
  });

  return res.status(202).json({ ok: true, estado: fotosPerfil.estado() });
});

/**
 * Que la IA escriba el mensaje de la campaña.
 *
 * Devuelve texto y nada más: no manda, no guarda, no crea la campaña. Lo que
 * escribe entra en el editor y la persona decide qué hacer con eso.
 */
router.post('/redactar', async (req, res) => {
  try {
    const texto = await redactarCampana(req.body?.tema);
    res.json({ texto });
  } catch (error) {
    const crudo = String(error.message || '');
    logger.warn('No se pudo redactar la campaña', { message: crudo });

    /*
      El error del proveedor de IA no se le puede mostrar a nadie tal cual:
      "Otro (compatible con OpenAI) respondió 429. {status:429,...}" no le dice
      nada a quien está tratando de escribir una promo de milanesas. Peor:
      suena a que el sistema se rompió, cuando lo que pasa es que el proveedor
      está saturado y hay que esperar un minuto.
    */
    let mensaje = crudo || 'No se pudo escribir el mensaje';
    if (/\b429\b|too many requests|rate.?limit/i.test(crudo)) {
      mensaje = 'La IA está saturada en este momento. Probá de nuevo en un minuto.';
    } else if (/\b401\b|\b403\b|api.?key|unauthorized/i.test(crudo)) {
      mensaje = 'La clave de la IA no está funcionando. Revisala en Configuración del sistema.';
    } else if (/timeout|abort|fetch failed|ECONNRESET|ENOTFOUND/i.test(crudo)) {
      mensaje = 'La IA tardó demasiado en responder. Probá de nuevo.';
    } else if (/no hay proveedor|iaHabilitada|sin proveedor/i.test(crudo)) {
      mensaje = 'No hay ninguna IA configurada para escribir.';
    }

    res.status(400).json({ error: mensaje, detalle: crudo.slice(0, 300) });
  }
});

router.get('/fotos/estado', (_req, res) => res.json(fotosPerfil.estado()));

/*
  Las fotos que faltan se van bajando solas de a poco. Se arranca acá porque
  este módulo ya tiene todo lo que hace falta cargado; el goteo se salta a sí
  mismo si WhatsApp está desconectado o si hay una campaña saliendo.
*/
fotosPerfil.arrancarGoteo();

/**
 * Qué pasó cada día de la última semana.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * El gráfico "Actividad reciente" del tablero dibujaba una línea en cero fija.
 * En el código había un comentario que decía que en producción se pediría un
 * endpoint de histórico. Nunca se pidió, así que el gráfico más grande de la
 * pantalla no leía nada: era una decoración con forma de dato, que es peor que
 * no tener gráfico.
 *
 * ── Por qué se arman los siete días acá y no en la pantalla ────────────────
 *
 * Un GROUP BY sólo devuelve los días que tuvieron movimiento. Si el martes no
 * salió nada, el martes no viene en la respuesta y el gráfico dibujaría seis
 * puntos corridos, con el miércoles pegado al lunes. La serie tiene que estar
 * completa, con los ceros incluidos, o miente sobre la forma de la semana.
 */
router.get('/actividad', (req, res) => {
  const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 90);

  /*
    Todo se agrupa por día argentino, no por día UTC.

    El servidor corre en UTC y acá son tres horas menos, así que un envío de
    las 21:30 del viernes cae el sábado si se agrupa con `date(...)` a secas.
    Con eso, la columna del viernes a la noche —la franja en que más se
    vende— aparecía en el día siguiente. El resto del motor ya usa este mismo
    corrimiento de -3 horas.
  */
  const envios = db
    .prepare(
      `SELECT date(enviado_en, '-3 hours') AS dia,
              COUNT(*) AS enviados,
              SUM(CASE WHEN entregado_en IS NOT NULL THEN 1 ELSE 0 END) AS entregados,
              SUM(CASE WHEN leido_en IS NOT NULL THEN 1 ELSE 0 END) AS leidos
         FROM wa_envios
        WHERE date(enviado_en, '-3 hours') >= date('now', '-3 hours', ?)
        GROUP BY dia`
    )
    .all(`-${dias - 1} days`);

  const respuestas = db
    .prepare(
      `SELECT date(recibido_en, '-3 hours') AS dia, COUNT(*) AS respuestas
         FROM wa_respuestas
        WHERE date(recibido_en, '-3 hours') >= date('now', '-3 hours', ?)
        GROUP BY dia`
    )
    .all(`-${dias - 1} days`);

  const porDia = new Map();
  envios.forEach((f) => porDia.set(f.dia, { ...f }));
  respuestas.forEach((f) => {
    porDia.set(f.dia, { ...(porDia.get(f.dia) || {}), respuestas: f.respuestas });
  });

  /* Mismo criterio que las consultas: el "hoy" del negocio, no el del UTC. */
  const hoy = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const items = [];
  for (let i = dias - 1; i >= 0; i -= 1) {
    const d = new Date(hoy);
    d.setUTCDate(d.getUTCDate() - i);
    const clave = d.toISOString().slice(0, 10);
    const f = porDia.get(clave) || {};
    items.push({
      dia: clave,
      enviados: Number(f.enviados || 0),
      entregados: Number(f.entregados || 0),
      leidos: Number(f.leidos || 0),
      respuestas: Number(f.respuestas || 0),
    });
  }

  res.json({ dias, items });
});

router.get('/contactos/:id/historial', (req, res) => {
  const contacto = db.prepare('SELECT * FROM wa_contactos WHERE id = ?').get(Number(req.params.id));
  if (!contacto) return res.status(404).json({ error: 'No existe ese contacto' });
  const telefono = normalizarTelefono(contacto.telefono);
  const mensajes = db
    .prepare(
      `SELECT texto, es_baja, recibido_en FROM wa_respuestas
        WHERE telefono = ? ORDER BY datetime(recibido_en) DESC, id DESC LIMIT 30`
    )
    .all(telefono);
  const campanas = db
    .prepare(
      /*
        Se suman entregado y leído. Sin ellos la ficha decía "enviado" y punto,
        que sólo significa que salió de acá: no distinguía a quien nunca lo
        recibió de quien lo leyó y no contestó, que son dos personas muy
        distintas a la hora de decidir si insistir.
      */
      `SELECT c.id, c.nombre, c.estado, e.estado AS envio_estado, e.error,
              e.enviado_en, e.entregado_en, e.leido_en
         FROM wa_envios e JOIN wa_campanas c ON c.id = e.campana_id
        WHERE e.telefono = ? ORDER BY e.id DESC LIMIT 30`
    )
    .all(telefono);
  res.json({ contacto: contactoPublico(contacto), mensajes, campanas });
});

/**
 * Importación explícita de un snapshot de WhatsApp Web. Railway guarda los
 * chats en su propia base: nunca lee una ruta local ni la sesión de otra app.
 */
router.post('/contactos/importar', (req, res) => {
  const contactos = Array.isArray(req.body?.contactos) ? req.body.contactos : null;
  if (!contactos) return res.status(400).json({ error: 'Falta la lista de contactos' });
  if (contactos.length > 5000) {
    return res.status(400).json({ error: 'La lista supera el máximo permitido' });
  }
  const guardar = db.prepare(
    `INSERT INTO wa_contactos (jid, telefono, nombre, foto, ultimo_mensaje_en, excluido, origen)
     VALUES (?, ?, ?, ?, ?, ?, 'importacion')
     ON CONFLICT(jid) DO UPDATE SET
       telefono = excluded.telefono,
       nombre = CASE WHEN excluded.nombre <> '' THEN excluded.nombre ELSE wa_contactos.nombre END,
       foto = CASE WHEN excluded.foto <> '' THEN excluded.foto ELSE wa_contactos.foto END,
       ultimo_mensaje_en = COALESCE(excluded.ultimo_mensaje_en, wa_contactos.ultimo_mensaje_en),
       excluido = excluded.excluido,
       origen = 'importacion', actualizado_en = CURRENT_TIMESTAMP`
  );
  let importados = 0;
  let ignorados = 0;
  db.transaction(() => {
    contactos.forEach((entrada) => {
      const jidCrudo = String(entrada?.jid || entrada?.numero || entrada?.telefono || '').trim();
      const jidBase = jidCrudo.split('@')[0].split(':')[0];
      const telefono = normalizarTelefono(deJid(jidCrudo) || jidBase);
      if (!telefono) {
        ignorados += 1;
        return;
      }
      guardar.run(
        `${telefono}@s.whatsapp.net`,
        telefono,
        String(entrada?.nombre || entrada?.name || '')
          .trim()
          .slice(0, 160),
        String(entrada?.foto || '')
          .trim()
          .slice(0, 1000),
        entrada?.ultimoMensaje || entrada?.ultimo_mensaje_en || null,
        entrada?.excluido ? 1 : 0
      );
      importados += 1;
    });
  })();
  res.json({ ok: true, importados, ignorados });
});

// ── Campañas ──────────────────────────────────────────────────────────────

router.post('/preparar', (req, res) => {
  const gateway = gatewayConfig();
  if (gateway.pausaTotal || !gateway.masivos) {
    return res.status(409).json({ error: 'WhatsApp masivo está desactivado en Configuración' });
  }
  const { mensaje, nombre, imagen, simulacro, clientesIds, segmento } = req.body || {};
  try {
    res.json(
      motor.preparar({
        mensaje: String(mensaje || ''),
        nombre: String(nombre || ''),
        imagen: String(imagen || ''),
        simulacro: Boolean(simulacro),
        clientesIds: Array.isArray(clientesIds) && clientesIds.length ? clientesIds : null,
        segmento: String(segmento || 'todos'),
      })
    );
  } catch (error) {
    res.status(error.httpStatus || 400).json({ error: error.message });
  }
});

/**
 * Dispara. Va separado de `preparar` a propósito: un botón que le escribe a
 * ciento cincuenta personas no puede ser un solo click.
 */
router.post('/enviar', async (req, res) => {
  const gateway = gatewayConfig();
  if (gateway.pausaTotal || !gateway.masivos) {
    return res.status(409).json({ error: 'WhatsApp masivo está desactivado en Configuración' });
  }
  const campanaId = Number(req.body?.campanaId);
  if (!campanaId) return res.status(400).json({ error: 'Falta la campaña' });
  try {
    res.json(await motor.arrancar(campanaId));
  } catch (error) {
    res.status(error.httpStatus || 400).json({ error: error.message });
  }
});

router.post('/programar', (req, res) => {
  const gateway = gatewayConfig();
  if (gateway.pausaTotal || !gateway.masivos) {
    return res.status(409).json({ error: 'WhatsApp masivo está desactivado en Configuración' });
  }
  try {
    res.json(motor.programar(Number(req.body?.campanaId), req.body?.programadaPara));
  } catch (error) {
    res.status(error.httpStatus || 400).json({ error: error.message });
  }
});

router.post('/pausar', (_req, res) => res.json(motor.pausar()));
router.post('/reanudar', (_req, res) => res.json(motor.reanudar()));
router.post('/detener', (_req, res) => res.json(motor.detener()));

/** Historial con el resultado de cada campaña, que es lo que dice qué vendió. */
router.get('/campanas', (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 20, 100);
  res.json(
    db
      .prepare(
        `SELECT c.*,
                (SELECT COUNT(*) FROM wa_respuestas r
                  WHERE r.recibido_en >= c.iniciado_en
                    AND (c.terminado_en IS NULL OR r.recibido_en <= datetime(c.terminado_en, '+1 day'))
                ) AS respuestas
           FROM wa_campanas c
          ORDER BY c.id DESC LIMIT ?`
      )
      .all(limite)
  );
});

router.get('/campanas/:id', (req, res) => {
  const campana = db.prepare('SELECT * FROM wa_campanas WHERE id = ?').get(req.params.id);
  if (!campana) return res.status(404).json({ error: 'No existe esa campaña' });
  const envios = db
    .prepare('SELECT * FROM wa_envios WHERE campana_id = ? ORDER BY id')
    .all(req.params.id);
  res.json({
    ...campana,
    envios: envios.map((e) => ({ ...e, telefonoLegible: formatearTelefono(e.telefono) })),
  });
});

// ── Bajas ─────────────────────────────────────────────────────────────────

router.get('/excluidos', (_req, res) => {
  res.json(
    db
      .prepare('SELECT * FROM wa_excluidos ORDER BY creado_en DESC')
      .all()
      .map((x) => ({ ...x, telefonoLegible: formatearTelefono(x.telefono) }))
  );
});

router.post('/excluidos', (req, res) => {
  const tel = normalizarTelefono(req.body?.telefono);
  if (!tel) return res.status(400).json({ error: 'Ese teléfono no se entiende' });
  db.prepare('INSERT OR IGNORE INTO wa_excluidos (telefono, motivo) VALUES (?, ?)').run(
    tel,
    String(req.body?.motivo || 'a mano').slice(0, 120)
  );
  db.prepare('UPDATE wa_contactos SET excluido = 1 WHERE telefono = ?').run(tel);
  res.json({ ok: true, telefono: tel });
});

router.delete('/excluidos/:telefono', (req, res) => {
  const tel = normalizarTelefono(req.params.telefono);
  db.prepare('DELETE FROM wa_excluidos WHERE telefono = ?').run(tel);
  db.prepare('UPDATE wa_contactos SET excluido = 0 WHERE telefono = ?').run(tel);
  res.json({ ok: true });
});

// ── Plantillas ────────────────────────────────────────────────────────────

router.get('/plantillas', (_req, res) => {
  res.json(
    db.prepare('SELECT * FROM wa_plantillas WHERE activa = 1 ORDER BY nombre COLLATE NOCASE').all()
  );
});

router.post('/plantillas', (req, res) => {
  const nombre = String(req.body?.nombre || '')
    .trim()
    .slice(0, 100);
  const mensaje = String(req.body?.mensaje || '')
    .trim()
    .slice(0, 4000);
  if (!nombre || !mensaje) {
    return res.status(400).json({ error: 'La plantilla necesita nombre y mensaje' });
  }
  try {
    const result = db
      .prepare(
        `INSERT INTO wa_plantillas (nombre, mensaje, imagen, segmento)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        nombre,
        mensaje,
        String(req.body?.imagen || '').slice(0, 500),
        String(req.body?.segmento || 'todos').slice(0, 40)
      );
    res
      .status(201)
      .json(db.prepare('SELECT * FROM wa_plantillas WHERE id = ?').get(result.lastInsertRowid));
  } catch {
    res.status(409).json({ error: 'Ya existe una plantilla con ese nombre' });
  }
});

router.delete('/plantillas/:id', (req, res) => {
  db.prepare(
    'UPDATE wa_plantillas SET activa = 0, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Configuración ─────────────────────────────────────────────────────────

router.get('/config', (_req, res) => res.json(motor.leerConfig()));

router.put('/config', (req, res) => {
  const guardar = db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  );
  /*
    Sólo se aceptan claves que existan en los valores por defecto. Sin esa
    lista blanca, cualquier campo del cuerpo terminaría en `configuracion`.
  */
  const permitidas = new Set([...Object.keys(reglas.DEFECTOS), 'saludos', 'cierres', 'footerBaja']);
  const guardadas = [];
  Object.entries(req.body || {}).forEach(([k, v]) => {
    if (!permitidas.has(k)) return;
    guardar.run(`wa_${k}`, JSON.stringify(v));
    guardadas.push(k);
  });
  res.json({ ok: true, guardadas, config: motor.leerConfig() });
});

// ── Respuestas ────────────────────────────────────────────────────────────

router.get('/respuestas', (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 50, 200);
  res.json(
    db
      .prepare('SELECT * FROM wa_respuestas ORDER BY id DESC LIMIT ?')
      .all(limite)
      .map((r) => ({ ...r, telefonoLegible: formatearTelefono(r.telefono) }))
  );
});

// ── CRM ligero ────────────────────────────────────────────────────────────

router.get('/crm', (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 50, 200);
  const estado = String(req.query.estado || '');
  const where = estado ? 'WHERE c.estado = ?' : '';
  const valores = estado ? [estado] : [];
  const items = db
    .prepare(
      `SELECT crm.*, r.texto AS respuesta_texto, r.recibido_en
       FROM wa_crm crm
       LEFT JOIN wa_respuestas r ON r.id = crm.respuesta_id
       ${where}
       ORDER BY crm.creado_en DESC
       LIMIT ?`
    )
    .all(...valores, limite)
    .map((row) => ({ ...row, telefonoLegible: formatearTelefono(row.telefono) }));
  res.json({ items });
});

router.put('/crm/:id', (req, res) => {
  const id = Number(req.params.id);
  const { estado, nota, actor_id, actor_nombre } = req.body || {};
  const estadosValidos = ['nuevo', 'contactado', 'interesado', 'descartado', 'cliente'];
  if (estado && !estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const sets = [];
  const vals = [];
  if (estado) {
    sets.push('estado = ?');
    vals.push(estado);
  }
  if (nota !== undefined) {
    sets.push('nota = ?');
    vals.push(String(nota).slice(0, 500));
  }
  if (actor_id) {
    sets.push('actor_id = ?');
    vals.push(actor_id);
  }
  if (actor_nombre) {
    sets.push('actor_nombre = ?');
    vals.push(String(actor_nombre).slice(0, 100));
  }
  sets.push('actualizado_en = CURRENT_TIMESTAMP');
  vals.push(id);
  db.prepare(`UPDATE wa_crm SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

// ── Etiquetas por contacto ────────────────────────────────────────────────

router.get('/contactos/:id/etiquetas', (req, res) => {
  const items = db
    .prepare('SELECT * FROM wa_etiquetas WHERE contacto_id = ? ORDER BY etiqueta COLLATE NOCASE')
    .all(Number(req.params.id));
  res.json({ items });
});

router.post('/contactos/:id/etiquetas', (req, res) => {
  const contactoId = Number(req.params.id);
  const etiqueta = String(req.body?.etiqueta || '')
    .trim()
    .toLowerCase()
    .slice(0, 40);
  if (!etiqueta) return res.status(400).json({ error: 'Falta la etiqueta' });
  try {
    db.prepare('INSERT INTO wa_etiquetas (contacto_id, etiqueta) VALUES (?, ?)').run(
      contactoId,
      etiqueta
    );
  } catch {
    // UNIQUE conflict, ignorar
  }
  res.json({ ok: true });
});

router.delete('/contactos/:id/etiquetas/:etiqueta', (req, res) => {
  db.prepare('DELETE FROM wa_etiquetas WHERE contacto_id = ? AND etiqueta = ?').run(
    Number(req.params.id),
    String(req.params.etiqueta).trim().toLowerCase()
  );
  res.json({ ok: true });
});

// ── Notas por contacto ────────────────────────────────────────────────────

router.get('/contactos/:id/notas', (req, res) => {
  const items = db
    .prepare('SELECT * FROM wa_notas WHERE contacto_id = ? ORDER BY creado_en DESC')
    .all(Number(req.params.id));
  res.json({ items });
});

router.post('/contactos/:id/notas', (req, res) => {
  const contactoId = Number(req.params.id);
  const nota = String(req.body?.nota || '')
    .trim()
    .slice(0, 2000);
  if (!nota) return res.status(400).json({ error: 'Falta la nota' });
  const result = db
    .prepare('INSERT INTO wa_notas (contacto_id, nota, actor_id, actor_nombre) VALUES (?, ?, ?, ?)')
    .run(
      contactoId,
      nota,
      req.body?.actor_id || null,
      String(req.body?.actor_nombre || '').slice(0, 100)
    );
  res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

router.delete('/notas/:notaId', (req, res) => {
  db.prepare('DELETE FROM wa_notas WHERE id = ?').run(Number(req.params.notaId));
  res.json({ ok: true });
});

// ── Recordatorios ─────────────────────────────────────────────────────────

router.get('/recordatorios', (req, res) => {
  const contactoId = req.query.contacto_id ? Number(req.query.contacto_id) : null;
  const hecho = req.query.hecho !== undefined ? Number(req.query.hecho) : null;
  const where = [];
  const vals = [];
  if (contactoId) {
    where.push('contacto_id = ?');
    vals.push(contactoId);
  }
  if (hecho !== null) {
    where.push('hecho = ?');
    vals.push(hecho);
  }
  const condicion = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = db
    .prepare(`SELECT * FROM wa_recordatorios ${condicion} ORDER BY vence ASC, creado_en DESC`)
    .all(...vals);
  res.json({ items });
});

router.post('/recordatorios', (req, res) => {
  const { contacto_id, texto, vence } = req.body || {};
  if (!contacto_id || !String(texto || '').trim()) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const result = db
    .prepare('INSERT INTO wa_recordatorios (contacto_id, texto, vence) VALUES (?, ?, ?)')
    .run(Number(contacto_id), String(texto).trim().slice(0, 500), vence || null);
  res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

router.put('/recordatorios/:id', (req, res) => {
  const id = Number(req.params.id);
  const { hecho, texto, vence } = req.body || {};
  const sets = [];
  const vals = [];
  if (hecho !== undefined) {
    sets.push('hecho = ?');
    vals.push(Number(hecho));
  }
  if (texto !== undefined) {
    sets.push('texto = ?');
    vals.push(String(texto).trim().slice(0, 500));
  }
  if (vence !== undefined) {
    sets.push('vence = ?');
    vals.push(vence || null);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
  sets.push('creado_en = creado_en'); // noop para trailing comma
  vals.push(id);
  db.prepare(`UPDATE wa_recordatorios SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

router.delete('/recordatorios/:id', (req, res) => {
  db.prepare('DELETE FROM wa_recordatorios WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Plantillas por segmento ───────────────────────────────────────────────

router.get('/plantillas-segmento', (_req, res) => {
  const items = db
    .prepare(
      'SELECT * FROM wa_plantillas_segmento WHERE activo = 1 ORDER BY segmento COLLATE NOCASE'
    )
    .all();
  res.json({ items });
});

router.post('/plantillas-segmento', (req, res) => {
  const segmento = String(req.body?.segmento || '')
    .trim()
    .toLowerCase()
    .slice(0, 40);
  const mensaje = String(req.body?.mensaje || '')
    .trim()
    .slice(0, 4000);
  if (!segmento || !mensaje) return res.status(400).json({ error: 'Faltan campos' });
  const result = db
    .prepare('INSERT INTO wa_plantillas_segmento (segmento, mensaje) VALUES (?, ?)')
    .run(segmento, mensaje);
  res.status(201).json({ id: result.lastInsertRowid, ok: true });
});

router.put('/plantillas-segmento/:id', (req, res) => {
  const id = Number(req.params.id);
  const { segmento, mensaje, activo } = req.body || {};
  const sets = [];
  const vals = [];
  if (segmento !== undefined) {
    sets.push('segmento = ?');
    vals.push(String(segmento).trim().toLowerCase().slice(0, 40));
  }
  if (mensaje !== undefined) {
    sets.push('mensaje = ?');
    vals.push(String(mensaje).trim().slice(0, 4000));
  }
  if (activo !== undefined) {
    sets.push('activo = ?');
    vals.push(Number(activo));
  }
  if (!sets.length) return res.status(400).json({ error: 'Nada que actualizar' });
  sets.push('actualizado_en = CURRENT_TIMESTAMP');
  vals.push(id);
  db.prepare(`UPDATE wa_plantillas_segmento SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ ok: true });
});

router.delete('/plantillas-segmento/:id', (req, res) => {
  db.prepare('DELETE FROM wa_plantillas_segmento WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ── Plan operativo ────────────────────────────────────────────────────────

router.get('/plan-operativo', (_req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const bandeja = db
    .prepare(
      `SELECT COUNT(*) AS total FROM wa_crm WHERE estado = 'nuevo'
       AND date(creado_en) = date('now')`
    )
    .get();
  const segmentos = db
    .prepare(
      `SELECT segmento, COUNT(*) AS total FROM wa_envios
       WHERE date(enviado_en) = date('now') GROUP BY segmento`
    )
    .all();
  const enviadosHoy = db
    .prepare(`SELECT COUNT(*) AS total FROM wa_envios WHERE date(enviado_en) = date('now')`)
    .get();
  const respuestasHoy = db
    .prepare(`SELECT COUNT(*) AS total FROM wa_respuestas WHERE date(recibido_en) = date('now')`)
    .get();
  const pasos = [
    {
      paso: 1,
      titulo: 'Revisar bandeja de entrada',
      descripcion: `${bandeja?.total || 0} respuestas nuevas sin clasificar`,
      hecho: (bandeja?.total || 0) === 0,
    },
    {
      paso: 2,
      titulo: 'Verificar salud del número',
      descripcion: 'Revisar score y métricas de entrega',
      hecho: false,
    },
    {
      paso: 3,
      titulo: 'Enviar campaña del día',
      descripcion: `Hoy: ${enviadosHoy?.total || 0} enviados / ${respuestasHoy?.total || 0} respuestas`,
      hecho: (enviadosHoy?.total || 0) > 0,
    },
    {
      paso: 4,
      titulo: 'Actualizar CRM',
      descripcion: 'Clasificar contactos y dejar notas',
      hecho: false,
    },
    {
      paso: 5,
      titulo: 'Cierre de jornada',
      descripcion: 'Registrar métricas y embudo del día',
      hecho: false,
    },
  ];
  res.json({ fecha: hoy, pasos, segmentos: segmentos || [] });
});

// ── Salud del número ──────────────────────────────────────────────────────

router.get('/salud-numero', (_req, res) => {
  const ventanaDias = 7;
  const totalEnvios = db
    .prepare(
      `SELECT COUNT(*) AS total FROM wa_envios
       WHERE enviado_en >= datetime('now', '-${ventanaDias} days')`
    )
    .get();
  /*
    "Exitoso" pasó a ser **entregado**, no "salió de acá".

    Antes contaba `estado = 'enviado'`, que sólo dice que el mensaje salió de
    este servidor. Con esa definición un número al que WhatsApp empezó a
    frenar puntuaba igual que uno sano: los mensajes figuraban enviados y no
    le llegaban a nadie. La tasa de éxito medía nuestra red, no la salud del
    número.

    Los envíos viejos —los de antes de que existiera `entregado_en`— no tienen
    recibo y no se pueden contar como entregados; tampoco como fallados. Por
    eso el total de la tasa mira sólo los que sí pudieron tener recibo.
  */
  const conRecibo = db
    .prepare(
      `SELECT COUNT(*) AS total FROM wa_envios
       WHERE mensaje_id <> '' AND enviado_en >= datetime('now', '-${ventanaDias} days')`
    )
    .get();
  const exitosos = db
    .prepare(
      `SELECT COUNT(*) AS total FROM wa_envios
       WHERE entregado_en IS NOT NULL AND enviado_en >= datetime('now', '-${ventanaDias} days')`
    )
    .get();
  const leidos = db
    .prepare(
      `SELECT COUNT(*) AS total FROM wa_envios
       WHERE leido_en IS NOT NULL AND enviado_en >= datetime('now', '-${ventanaDias} days')`
    )
    .get();
  const fallidos = db
    .prepare(
      `SELECT COUNT(*) AS total FROM wa_envios
       WHERE estado = 'fallido' AND enviado_en >= datetime('now', '-${ventanaDias} days')`
    )
    .get();
  /*
    Sólo cuentan las respuestas de gente a la que efectivamente le mandamos.

    Antes se contaban todas las de `wa_respuestas`, que incluye las del WhatsApp
    normal del local: alguien que escribe para pedir una pizza sin haber
    recibido ninguna campaña entraba igual en la cuenta. Con eso la tasa de
    respuesta daba cualquier cosa, y el tablero llegó a mostrar 101 respuestas
    con cero envíos, que es imposible.
  */
  const respuestas = db
    .prepare(
      `SELECT COUNT(DISTINCT r.id) AS total FROM wa_respuestas r
       WHERE r.recibido_en >= datetime('now', '-${ventanaDias} days')
         AND EXISTS (
           SELECT 1 FROM wa_envios e
           WHERE e.telefono = r.telefono
             AND e.enviado_en >= datetime('now', '-${ventanaDias} days')
             AND e.enviado_en <= r.recibido_en
         )`
    )
    .get();
  const bajas = db
    .prepare(
      `SELECT COUNT(DISTINCT r.id) AS total FROM wa_respuestas r
       WHERE r.es_baja = 1
         AND r.recibido_en >= datetime('now', '-${ventanaDias} days')
         AND EXISTS (
           SELECT 1 FROM wa_envios e
           WHERE e.telefono = r.telefono
             AND e.enviado_en >= datetime('now', '-${ventanaDias} days')
             AND e.enviado_en <= r.recibido_en
         )`
    )
    .get();

  /* La cuenta vive en reglas.js para poder probarla sin levantar el servidor. */
  const salud = reglas.evaluarSalud({
    enviados: conRecibo.total,
    exitosos: exitosos.total,
    respuestas: respuestas.total,
    bajas: bajas.total,
  });

  return res.json({
    sinDatos: salud.sinDatos,
    score: salud.score,
    riesgo: salud.riesgo,
    metricas: {
      enviados: totalEnvios.total,
      conRecibo: conRecibo.total,
      entregados: exitosos.total,
      leidos: leidos.total,
      fallidos: fallidos.total,
      respuestas: respuestas.total,
      bajas: bajas.total,
      tasaExito: salud.tasaExito,
      tasaRespuesta: salud.tasaRespuesta,
      tasaBaja: salud.tasaBaja,
      tasaLectura: exitosos.total > 0 ? Math.round((leidos.total / exitosos.total) * 100) : null,
    },
    ventanaDias,
  });
});

// ── Cierre de jornada ─────────────────────────────────────────────────────

router.get('/cierre-jornada', (req, res) => {
  const fecha = String(req.query.fecha || new Date().toISOString().slice(0, 10));
  const row = db.prepare('SELECT * FROM wa_cierres_dia WHERE fecha = ?').get(fecha);
  if (row) {
    let embudo;
    try {
      embudo = JSON.parse(row.embudo_json || '{}');
    } catch {
      embudo = {};
    }
    return res.json({ ...row, embudo });
  }
  // Si no existe, calcular al vuelo
  const enviados = db
    .prepare(`SELECT COUNT(*) AS total FROM wa_envios WHERE date(enviado_en) = ?`)
    .get(fecha);
  const respuestas = db
    .prepare(`SELECT COUNT(*) AS total FROM wa_respuestas WHERE date(recibido_en) = ?`)
    .get(fecha);
  res.json({
    fecha,
    enviados: enviados?.total || 0,
    respuestas: respuestas?.total || 0,
    salud_score: 0,
    embudo: {},
    provisional: true,
  });
});

router.post('/cierre-jornada', (req, res) => {
  const fecha = String(req.body?.fecha || new Date().toISOString().slice(0, 10));
  const saludScore = Number(req.body?.salud_score || 0);
  const enviados = db
    .prepare(`SELECT COUNT(*) AS total FROM wa_envios WHERE date(enviado_en) = ?`)
    .get(fecha);
  const respuestas = db
    .prepare(`SELECT COUNT(*) AS total FROM wa_respuestas WHERE date(recibido_en) = ?`)
    .get(fecha);

  /*
    El embudo se calcula acá, no se acepta el que manda la pantalla.

    Antes venía del cuerpo del pedido, y la pantalla mandaba
    `{nuevo: 0, contactado: 0, interesado: 0, cliente: 0}` fijo, escrito a
    mano. O sea que el botón "Cierre de jornada" guardaba cuatro ceros
    inventados en la base todos los días, y el tablero después los leía como
    si fueran el resultado real de la jornada.

    Un dato guardado pesa más que uno mostrado: el de pantalla se corrige
    recargando, el de la base queda y contamina los reportes de acá en
    adelante. Los números salen de las mismas tablas que todo lo demás.
  */
  const detalle = db
    .prepare(
      `SELECT COUNT(*) AS enviados,
              SUM(CASE WHEN entregado_en IS NOT NULL THEN 1 ELSE 0 END) AS entregados,
              SUM(CASE WHEN leido_en IS NOT NULL THEN 1 ELSE 0 END) AS leidos
         FROM wa_envios WHERE date(enviado_en) = ?`
    )
    .get(fecha);

  const embudo = {
    Enviados: Number(detalle?.enviados || 0),
    Entregados: Number(detalle?.entregados || 0),
    Leídos: Number(detalle?.leidos || 0),
    Respondieron: Number(respuestas?.total || 0),
  };
  db.prepare(
    `INSERT INTO wa_cierres_dia (fecha, enviados, respuestas, salud_score, embudo_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(fecha) DO UPDATE SET
       enviados = excluded.enviados,
       respuestas = excluded.respuestas,
       salud_score = excluded.salud_score,
       embudo_json = excluded.embudo_json`
  ).run(fecha, enviados?.total || 0, respuestas?.total || 0, saludScore, JSON.stringify(embudo));
  res.json({ ok: true, fecha });
});

module.exports = router;
module.exports.registrarRespuesta = registrarRespuesta;
