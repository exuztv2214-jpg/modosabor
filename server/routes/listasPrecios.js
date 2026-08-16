const express = require('express');

const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { CANALES, CLAVE_POR_CANAL, listaDelCanal } = require('../utils/listasPrecios');

/**
 * Listas de precios.
 *
 * Una lista guarda **sólo las excepciones**: los productos que en ese canal
 * valen distinto. Un producto sin fila vale su precio de siempre.
 *
 * La lógica de resolución vive en `utils/listasPrecios.js` y la usan la carta,
 * el validador de pedidos públicos y el agente. Acá sólo se administran.
 */

function guardarConfig(clave, valor) {
  db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  ).run(clave, String(valor ?? ''));
}

router.get('/', auth, requirePermission('productos.edit'), (_req, res) => {
  const listas = db.prepare('SELECT * FROM listas_precios ORDER BY orden ASC, id ASC').all();
  const conteos = db
    .prepare('SELECT lista_id, COUNT(*) AS n FROM producto_precios GROUP BY lista_id')
    .all();
  const porLista = new Map(conteos.map((fila) => [Number(fila.lista_id), Number(fila.n)]));

  res.json({
    listas: listas.map((lista) => ({ ...lista, productos: porLista.get(Number(lista.id)) || 0 })),
    // Qué lista usa cada canal hoy. Vacío = precios de siempre.
    canales: Object.fromEntries(
      CANALES.map((canal) => [canal, listaDelCanal(db, canal)?.id || null])
    ),
  });
});

/** El detalle: qué productos tienen precio propio en esta lista. */
router.get('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const lista = db.prepare('SELECT * FROM listas_precios WHERE id = ?').get(req.params.id);
  if (!lista) return res.status(404).json({ error: 'No existe esa lista' });

  const precios = db
    .prepare(
      `SELECT pp.producto_id, pp.precio, p.nombre, p.precio AS precio_base, c.nombre AS categoria
         FROM producto_precios pp
         JOIN productos p ON p.id = pp.producto_id
         LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE pp.lista_id = ?
        ORDER BY c.nombre, p.nombre`
    )
    .all(lista.id);

  res.json({ ...lista, precios });
});

router.post('/', auth, requirePermission('productos.edit'), (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'La lista necesita un nombre' });

  const orden = Number(db.prepare('SELECT MAX(orden) AS m FROM listas_precios').get().m || 0) + 1;
  const { lastInsertRowid } = db
    .prepare('INSERT INTO listas_precios (nombre, descripcion, orden, activo) VALUES (?, ?, ?, 1)')
    .run(nombre, String(req.body?.descripcion || '').trim(), orden);

  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'precios',
    accion: 'crear_lista',
    entidad: 'lista_precios',
    entidad_id: Number(lastInsertRowid),
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: { nombre },
  });

  res.json(db.prepare('SELECT * FROM listas_precios WHERE id = ?').get(lastInsertRowid));
});

router.put('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const lista = db.prepare('SELECT * FROM listas_precios WHERE id = ?').get(req.params.id);
  if (!lista) return res.status(404).json({ error: 'No existe esa lista' });

  db.prepare('UPDATE listas_precios SET nombre = ?, descripcion = ?, activo = ? WHERE id = ?').run(
    String(req.body?.nombre ?? lista.nombre).trim() || lista.nombre,
    String(req.body?.descripcion ?? lista.descripcion),
    Number(req.body?.activo ?? lista.activo) === 1 ? 1 : 0,
    lista.id
  );

  res.json(db.prepare('SELECT * FROM listas_precios WHERE id = ?').get(lista.id));
});

/**
 * Poner o sacar el precio especial de un producto.
 *
 * Precio en cero o vacío = sacar la excepción, o sea volver al precio normal.
 * Es más intuitivo que un botón "quitar" aparte: se borra el número y listo.
 */
router.put('/:id/producto/:productoId', auth, requirePermission('productos.edit'), (req, res) => {
  const lista = db.prepare('SELECT * FROM listas_precios WHERE id = ?').get(req.params.id);
  if (!lista) return res.status(404).json({ error: 'No existe esa lista' });

  const producto = db
    .prepare('SELECT id, nombre, precio FROM productos WHERE id = ?')
    .get(req.params.productoId);
  if (!producto) return res.status(404).json({ error: 'No existe ese producto' });

  const precio = Math.round(Number(req.body?.precio || 0));
  if (!Number.isFinite(precio) || precio < 0) {
    return res.status(400).json({ error: 'El precio no puede ser negativo' });
  }

  const actor = actorFromRequest(req);

  if (precio === 0) {
    db.prepare('DELETE FROM producto_precios WHERE lista_id = ? AND producto_id = ?').run(
      lista.id,
      producto.id
    );
    logAudit(db, {
      modulo: 'precios',
      accion: 'quitar_precio',
      entidad: 'lista_precios',
      entidad_id: lista.id,
      actor_id: actor.actor_id,
      actor_nombre: actor.actor_nombre,
      detalle: { lista: lista.nombre, producto: producto.nombre },
    });
    return res.json({ producto_id: producto.id, precio: null });
  }

  db.prepare(
    `INSERT INTO producto_precios (lista_id, producto_id, precio) VALUES (?, ?, ?)
       ON CONFLICT(lista_id, producto_id)
       DO UPDATE SET precio = excluded.precio, actualizado_en = CURRENT_TIMESTAMP`
  ).run(lista.id, producto.id, precio);

  /*
    Queda auditado con el precio viejo y el nuevo. Un cambio de precio es de las
    cosas que después se discuten —"¿por qué le cobramos esto?"— y el registro
    tiene que poder responderlo.
  */
  logAudit(db, {
    modulo: 'precios',
    accion: 'fijar_precio',
    entidad: 'lista_precios',
    entidad_id: lista.id,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: {
      lista: lista.nombre,
      producto: producto.nombre,
      precio_base: producto.precio,
      precio_lista: precio,
    },
  });

  res.json({ producto_id: producto.id, precio });
});

/** Qué lista usa cada canal. Mandar null desasigna. */
router.put('/canales/asignar', auth, requirePermission('productos.edit'), (req, res) => {
  const asignaciones = [];
  for (const canal of CANALES) {
    if (!(canal in (req.body || {}))) continue;
    const valor = req.body[canal];
    if (
      valor !== null &&
      valor !== '' &&
      !db.prepare('SELECT 1 FROM listas_precios WHERE id = ?').get(valor)
    ) {
      return res.status(400).json({ error: `No existe la lista asignada a ${canal}` });
    }
    asignaciones.push([CLAVE_POR_CANAL[canal], valor ?? '']);
  }

  // Si una asignación no es válida, no se toca ningún canal. Evita dejar, por
  // ejemplo, delivery actualizado y web a medio guardar.
  db.transaction((cambios) => {
    cambios.forEach(([clave, valor]) => guardarConfig(clave, valor));
  })(asignaciones);

  const actor = actorFromRequest(req);
  logAudit(db, {
    modulo: 'precios',
    accion: 'asignar_canales',
    entidad: 'lista_precios',
    entidad_id: 0,
    actor_id: actor.actor_id,
    actor_nombre: actor.actor_nombre,
    detalle: req.body || {},
  });

  res.json(
    Object.fromEntries(CANALES.map((canal) => [canal, listaDelCanal(db, canal)?.id || null]))
  );
});

module.exports = router;
