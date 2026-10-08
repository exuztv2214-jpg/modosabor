const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { fechaLocal } = require('../utils/fechaLocal');
const { parseTurnos } = require('../utils/shifts');

/*
 * Datos del sistema que consume el servicio Masivos (servidor a servidor).
 * Se autentica con el mismo token del proxy de /masivos: no hay sesión de usuario.
 * Devuelve sólo lo necesario para segmentar: teléfono, nombre, cantidad de
 * pedidos, fecha del último y días con pedido. Masivos hace el cruce con sus contactos.
 */
const router = express.Router();

function tokenValido(req) {
  const esperado = String(process.env.MASIVOS_PROXY_TOKEN || '').trim();
  const recibido = String(req.headers['x-masivos-proxy-token'] || '');
  if (!esperado || !recibido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.get('/turnos', (req, res) => {
  if (!tokenValido(req)) return res.status(403).json({ error: 'No autorizado' });
  const valor = db
    .prepare("SELECT valor FROM configuracion WHERE clave = 'turnos_negocio'")
    .get()?.valor;
  res.json({ turnos: parseTurnos(valor) });
});

router.get('/pedidos-por-telefono', (req, res) => {
  if (!tokenValido(req)) return res.status(403).json({ error: 'No autorizado' });
  const filas = db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(p.cliente_telefono), ''), c.telefono, '') AS tel_pedido,
              MAX(COALESCE(NULLIF(TRIM(p.cliente_nombre), ''), c.nombre, '')) AS nombre,
              COUNT(*) AS pedidos,
              MAX(${fechaLocal('p.creado_en')}) AS ultimo,
              GROUP_CONCAT(DISTINCT ${fechaLocal('p.creado_en')}) AS fechas
         FROM pedidos p
         LEFT JOIN clientes c ON c.id = p.cliente_id
        WHERE COALESCE(p.estado, '') NOT IN ('cancelado', 'cancelada')
        GROUP BY tel_pedido
       HAVING tel_pedido <> ''`
    )
    .all();
  res.json({
    generado: new Date().toISOString(),
    clientes: filas.map((f) => ({
      telefono: f.tel_pedido,
      nombre: f.nombre || '',
      pedidos: Number(f.pedidos || 0),
      ultimoPedido: f.ultimo ? String(f.ultimo).slice(0, 10) : null,
      // Días con pedido (los últimos 30): Masivos mide quién pidió después de una promo.
      fechas: String(f.fechas || '')
        .split(',')
        .map((d) => d.slice(0, 10))
        .filter(Boolean)
        .sort()
        .slice(-30),
    })),
  });
});

module.exports = router;
