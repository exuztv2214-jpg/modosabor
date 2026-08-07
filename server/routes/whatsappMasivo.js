const express = require('express');

const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { conexion } = require('../services/whatsappMasivo/conexion');
const { motor, registrarRespuesta } = require('../services/whatsappMasivo/motor');
const { normalizarTelefono, formatearTelefono } = require('../services/whatsappMasivo/telefono');
const reglas = require('../services/whatsappMasivo/reglas');

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
router.use(auth, requirePermission('marketing.edit'));

/** Todo junto: sesión, motor y números del día. Es lo que la pantalla pide. */
router.get('/estado', (_req, res) => {
  const config = motor.leerConfig();
  res.json({
    whatsapp: conexion.resumen(),
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
  res.json(await conexion.conectar());
});

router.post('/desconectar', async (_req, res) => {
  res.json(await conexion.desconectar());
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
