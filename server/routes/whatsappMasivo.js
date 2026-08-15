const express = require('express');
const QRCode = require('qrcode');

const db = require('../db');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { conexion } = require('../services/whatsappMasivo/conexion');
const { motor, registrarRespuesta } = require('../services/whatsappMasivo/motor');
const { normalizarTelefono, formatearTelefono } = require('../services/whatsappMasivo/telefono');
const reglas = require('../services/whatsappMasivo/reglas');
const { resumenGateway, gatewayConfig } = require('../services/whatsappGateway');
const {
  testEmergencyProvider,
  applyEmergencyProvider,
} = require('../services/whatsappEmergencyProvider');

const router = express.Router();

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
  const { cantidad } = db
    .prepare(
      `SELECT COUNT(*) AS cantidad FROM whatsapp_conversaciones
        WHERE escalado_humano = 1 AND bot_silenciado = 1`
    )
    .get();
  res.json({ cantidad });
});

router.use(auth, requirePermission('marketing.edit'));

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
    motorPropio: 'whatsapp_motor_propio',
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

router.post('/emergencia/aplicar', (_req, res) => {
  try {
    res.json(applyEmergencyProvider());
  } catch (error) {
    logger.error('No se pudo aplicar la IA de emergencia', { message: error.message });
    res.status(400).json({ error: error.message });
  }
});

router.get('/conversaciones', (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite) || 30, 1), 100);
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
        ORDER BY datetime(c.ultimo_mensaje_en) DESC, c.id DESC
        LIMIT ?`
    )
    .all(limite);
  res.json({ items });
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
  res.json({ periodo_dias: 7, ...totals, pedidos: Number(pedidos || 0) });
});

// ── Destinatarios ─────────────────────────────────────────────────────────

/**
 * A quiénes se les puede escribir hoy.
 *
 * Va con el teléfono formateado porque trece dígitos pegados no se leen ni se
 * comparan de un vistazo, y el operador tiene que poder reconocer al cliente.
 */
router.get('/destinatarios', (_req, res) => {
  const lista = motor.destinatarios();
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

// ── Campañas ──────────────────────────────────────────────────────────────

router.post('/preparar', (req, res) => {
  const gateway = gatewayConfig();
  if (gateway.pausaTotal || !gateway.masivos) {
    return res.status(409).json({ error: 'WhatsApp masivo está desactivado en Configuración' });
  }
  const { mensaje, nombre, imagen, simulacro, clientesIds } = req.body || {};
  try {
    res.json(
      motor.preparar({
        mensaje: String(mensaje || ''),
        nombre: String(nombre || ''),
        imagen: String(imagen || ''),
        simulacro: Boolean(simulacro),
        clientesIds: Array.isArray(clientesIds) && clientesIds.length ? clientesIds : null,
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
  res.json({ ok: true, telefono: tel });
});

router.delete('/excluidos/:telefono', (req, res) => {
  const tel = normalizarTelefono(req.params.telefono);
  db.prepare('DELETE FROM wa_excluidos WHERE telefono = ?').run(tel);
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

module.exports = router;
module.exports.registrarRespuesta = registrarRespuesta;
