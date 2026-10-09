const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const { fechaLocal, hoyArgentina } = require('../utils/fechaLocal');
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

/*
 * ── Cupón por campaña ──────────────────────────────────────────────────────
 *
 * Masivos crea un cupón por campaña y lo pone en cada mensaje. Así se sabe con
 * números cuánto vendió cada promo: los pedidos que usaron ese código.
 *
 * Los montos de la base están en centavos. Se devuelven ya en pesos con nombres
 * que el convertidor de respuestas no toca (`plata…`), para no dividir dos veces.
 */
const LETRAS_CUPON = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L

function codigoNuevo() {
  for (let intento = 0; intento < 20; intento += 1) {
    let codigo = 'MS';
    for (let i = 0; i < 5; i += 1) {
      codigo += LETRAS_CUPON[crypto.randomInt(LETRAS_CUPON.length)];
    }
    if (!db.prepare('SELECT 1 FROM cupones WHERE codigo = ?').get(codigo)) return codigo;
  }
  throw new Error('No se pudo generar un código de cupón libre.');
}

function sumarDiasAr(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

router.post('/cupones', (req, res) => {
  if (!tokenValido(req)) return res.status(403).json({ error: 'No autorizado' });
  const b = req.body || {};
  const tipo = b.tipo === 'fijo' ? 'fijo' : 'porcentaje';
  const valor = Number(b.valor);
  if (!Number.isFinite(valor) || valor <= 0)
    return res.status(400).json({ error: 'El descuento tiene que ser mayor a 0.' });
  if (tipo === 'porcentaje' && valor > 90)
    return res.status(400).json({ error: 'El porcentaje no puede pasar de 90%.' });
  if (tipo === 'fijo' && valor > 100000)
    return res.status(400).json({ error: 'El descuento fijo es demasiado alto.' });
  const dias = Math.min(60, Math.max(1, Math.round(Number(b.dias) || 3)));
  const hoy = hoyArgentina();
  const vence = sumarDiasAr(hoy, dias - 1);
  const codigo = codigoNuevo();
  const descripcion = String(b.descripcion || 'Promo WhatsApp (Masivos)').slice(0, 120);
  db.prepare(
    `INSERT INTO cupones (codigo, descripcion, tipo_descuento, valor_descuento, minimo_compra,
       descuento_maximo, fecha_inicio, fecha_fin, limite_usos, limite_por_cliente, activo)
     VALUES (?, ?, ?, ?, 0, 0, ?, ?, 0, 1, 1)`
  ).run(
    codigo,
    descripcion,
    tipo,
    tipo === 'fijo' ? Math.round(valor * 100) : Math.round(valor),
    `${hoy} 00:00:00`,
    `${vence} 23:59:59`
  );
  res.status(201).json({ codigo, tipo, valor, vence, descripcion });
});

router.get('/cupones/:codigo', (req, res) => {
  if (!tokenValido(req)) return res.status(403).json({ error: 'No autorizado' });
  const codigo = String(req.params.codigo || '')
    .trim()
    .toUpperCase();
  const cupon = db.prepare('SELECT * FROM cupones WHERE codigo = ?').get(codigo);
  if (!cupon) return res.status(404).json({ error: 'Cupón no encontrado' });
  const usos = db
    .prepare(
      `SELECT COUNT(cu.id) AS usos,
              COALESCE(SUM(cu.monto_descuento), 0) AS descontado,
              COALESCE(SUM(CASE WHEN COALESCE(p.estado, '') NOT IN ('cancelado', 'cancelada')
                                THEN p.total ELSE 0 END), 0) AS vendido
         FROM cupones_usados cu
         LEFT JOIN pedidos p ON p.id = cu.pedido_id
        WHERE cu.cupon_id = ?`
    )
    .get(cupon.id);
  res.json({
    codigo: cupon.codigo,
    activo: Boolean(cupon.activo),
    vence: String(cupon.fecha_fin || '').slice(0, 10),
    usos: Number(usos.usos || 0),
    plataVendida: Number(usos.vendido || 0) / 100,
    plataDescontada: Number(usos.descontado || 0) / 100,
  });
});

module.exports = router;
