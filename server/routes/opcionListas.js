const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { textoNormalizado } = require('../utils/opcionesCompartidas');

/**
 * Listas de opciones compartidas.
 *
 * Guarniciones, salsas, agregados y postres cargados una sola vez y asignados
 * a los platos que los llevan. La motivación está escrita en
 * `utils/opcionesCompartidas.js`; acá va sólo el CRUD.
 *
 * ── Unidades ───────────────────────────────────────────────────────────────
 *
 * `opcion_items.precio` está en centavos. El middleware global reconoce
 * "precio" como campo de plata, así que multiplica por cien al entrar y divide
 * al salir: la ruta recibe y devuelve centavos sin convertir nada a mano.
 *
 * Esto anda **porque estas rutas hablan JSON**. Si algún día alguna pasa a
 * recibir multipart —para subirle una foto a una opción, por ejemplo— el
 * middleware corre antes que multer y el precio llegaría en pesos a una
 * columna de centavos. Es exactamente el error que ya nos comió el módulo de
 * Personal.
 *
 * ── Todo o nada ────────────────────────────────────────────────────────────
 *
 * Guardar una lista borra sus opciones y las vuelve a escribir. Va en
 * transacción: si algo falla en el medio, una lista sin opciones deja un grupo
 * vacío en el TPV que nadie puede completar, y con eso no se puede cobrar.
 */

const TIPOS = new Set(['variante', 'extra']);

// Images are uploaded separately through the existing authenticated product upload.
// Keep prices in JSON to preserve the centavos conversion middleware.
router.use((req, res, next) => {
  if (
    Array.isArray(req.body?.opciones) &&
    req.body.opciones.some(
      (o) =>
        o?.imagen !== undefined &&
        o.imagen !== '' &&
        (typeof o.imagen !== 'string' ||
          !/^\/uploads\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(png|jpe?g|webp|gif)$/i.test(o.imagen))
    )
  ) {
    return res.status(400).json({ error: 'Subí una imagen válida para la opción' });
  }
  next();
});

function normalizarTipo(valor) {
  const tipo = String(valor || '')
    .trim()
    .toLowerCase();
  return TIPOS.has(tipo) ? tipo : 'variante';
}

function normalizarOpciones(opciones) {
  const vistas = new Set();
  return (Array.isArray(opciones) ? opciones : [])
    .map((opcion) => ({
      nombre: String(opcion?.nombre || '').trim(),
      precio: Math.round(Number(opcion?.precio || 0)),
      activo: Number(opcion?.activo ?? 1) === 1 ? 1 : 0,
      ...(opcion?.imagen !== undefined ? { imagen: opcion.imagen } : {}),
    }))
    .filter((opcion) => {
      if (!opcion.nombre) return false;
      // Dos opciones con el mismo nombre en un grupo son indistinguibles al
      // vender y al leer la comanda. Gana la primera.
      const clave = textoNormalizado(opcion.nombre);
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    });
}

function leerLista(id) {
  const lista = db.prepare('SELECT * FROM opcion_listas WHERE id = ?').get(id);
  if (!lista) return null;
  return {
    ...lista,
    opciones: db
      .prepare(
        'SELECT id, nombre, precio, orden, activo, imagen FROM opcion_items WHERE lista_id = ? ORDER BY orden ASC, id ASC'
      )
      .all(id),
    productos: db
      .prepare(
        `SELECT p.id, p.nombre
           FROM producto_opcion_listas pol
           JOIN productos p ON p.id = pol.producto_id
          WHERE pol.lista_id = ?
          ORDER BY p.nombre ASC`
      )
      .all(id),
  };
}

router.get('/', auth, (_req, res) => {
  const listas = db.prepare('SELECT * FROM opcion_listas ORDER BY orden ASC, nombre ASC').all();
  res.json(listas.map((lista) => leerLista(lista.id)));
});

router.get('/:id', auth, (req, res) => {
  const lista = leerLista(req.params.id);
  if (!lista) return res.status(404).json({ error: 'La lista no existe' });
  res.json(lista);
});

function guardarOpciones(listaId, opciones) {
  const imagenes = new Map(
    db
      .prepare('SELECT nombre, imagen FROM opcion_items WHERE lista_id = ?')
      .all(listaId)
      .map((o) => [textoNormalizado(o.nombre), o.imagen])
  );
  db.prepare('DELETE FROM opcion_items WHERE lista_id = ?').run(listaId);
  const insertar = db.prepare(
    'INSERT INTO opcion_items (lista_id, nombre, precio, orden, activo, imagen) VALUES (?, ?, ?, ?, ?, ?)'
  );
  opciones.forEach((opcion, indice) => {
    insertar.run(
      listaId,
      opcion.nombre,
      opcion.precio,
      indice,
      opcion.activo,
      opcion.imagen ?? imagenes.get(textoNormalizado(opcion.nombre)) ?? ''
    );
  });
}

router.post('/', auth, requirePermission('productos.edit'), (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Poné un nombre para la lista' });

  const opciones = normalizarOpciones(req.body?.opciones);
  const crear = db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO opcion_listas (nombre, tipo, obligatorio, descripcion, orden, activo) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        nombre,
        normalizarTipo(req.body?.tipo),
        Number(req.body?.obligatorio) === 1 ? 1 : 0,
        String(req.body?.descripcion || '').trim(),
        Number(req.body?.orden) || 0,
        Number(req.body?.activo ?? 1) === 1 ? 1 : 0
      );
    guardarOpciones(lastInsertRowid, opciones);
    return lastInsertRowid;
  });

  res.json(leerLista(crear()));
});

router.put('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const existente = db.prepare('SELECT * FROM opcion_listas WHERE id = ?').get(req.params.id);
  if (!existente) return res.status(404).json({ error: 'La lista no existe' });

  const nombre = String(req.body?.nombre ?? existente.nombre).trim();
  if (!nombre) return res.status(400).json({ error: 'Poné un nombre para la lista' });

  const guardar = db.transaction(() => {
    db.prepare(
      'UPDATE opcion_listas SET nombre = ?, tipo = ?, obligatorio = ?, descripcion = ?, orden = ?, activo = ? WHERE id = ?'
    ).run(
      nombre,
      normalizarTipo(req.body?.tipo ?? existente.tipo),
      Number(req.body?.obligatorio ?? existente.obligatorio) === 1 ? 1 : 0,
      String(req.body?.descripcion ?? existente.descripcion ?? '').trim(),
      Number(req.body?.orden ?? existente.orden) || 0,
      Number(req.body?.activo ?? existente.activo) === 1 ? 1 : 0,
      existente.id
    );
    // Sin `opciones` en el cuerpo se está editando sólo la cabecera. Borrarlas
    // ahí sería vaciar la lista por omisión.
    if (req.body?.opciones !== undefined) {
      guardarOpciones(existente.id, normalizarOpciones(req.body.opciones));
    }
  });

  guardar();
  res.json(leerLista(existente.id));
});

/**
 * Cuántos platos usan la lista, para poder avisar antes de borrarla.
 */
router.get('/:id/uso', auth, (req, res) => {
  const productos = db
    .prepare(
      `SELECT p.id, p.nombre, p.activo, c.nombre AS categoria
         FROM producto_opcion_listas pol
         JOIN productos p ON p.id = pol.producto_id
         LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE pol.lista_id = ?
        ORDER BY c.nombre ASC, p.nombre ASC`
    )
    .all(req.params.id);
  res.json({ productos, total: productos.length });
});

router.delete('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const lista = db.prepare('SELECT * FROM opcion_listas WHERE id = ?').get(req.params.id);
  if (!lista) return res.status(404).json({ error: 'La lista no existe' });

  const enUso = db
    .prepare('SELECT COUNT(*) AS n FROM producto_opcion_listas WHERE lista_id = ?')
    .get(lista.id).n;

  /*
    Igual que con los productos: borrar por defecto es dar de baja. Una lista
    asignada a veinte platos que desaparece de golpe se lleva puesta la
    guarnición de los veinte, y nadie lo nota hasta que alguien pide milanesa.
  */
  if (enUso > 0 && String(req.query.definitivo || '') !== '1') {
    db.prepare('UPDATE opcion_listas SET activo = 0 WHERE id = ?').run(lista.id);
    return res.json({
      success: true,
      accion: 'baja',
      mensaje: `"${lista.nombre}" queda desactivada. La usan ${enUso} plato${enUso === 1 ? '' : 's'}, así que no se borró.`,
      productos: enUso,
    });
  }

  db.prepare('DELETE FROM opcion_listas WHERE id = ?').run(lista.id);
  res.json({ success: true, accion: 'borrada' });
});

/**
 * Qué listas lleva un plato, y cambiarlas.
 *
 * Se maneja acá y no en `routes/productos.js` porque ese formulario manda
 * multipart —lleva la foto del plato— y el conversor de plata no ve adentro de
 * un multipart. Manteniendo la asignación en JSON, el precio de las opciones
 * viaja por el camino que ya funciona.
 */
router.get('/producto/:productoId', auth, (req, res) => {
  const listas = db
    .prepare(
      `SELECT l.*, pol.orden AS orden_asignada
         FROM producto_opcion_listas pol
         JOIN opcion_listas l ON l.id = pol.lista_id
        WHERE pol.producto_id = ?
        ORDER BY pol.orden ASC, l.nombre ASC`
    )
    .all(req.params.productoId);
  res.json(listas.map((lista) => leerLista(lista.id)));
});

router.put('/producto/:productoId', auth, requirePermission('productos.edit'), (req, res) => {
  const producto = db
    .prepare('SELECT id, nombre FROM productos WHERE id = ?')
    .get(req.params.productoId);
  if (!producto) return res.status(404).json({ error: 'El producto no existe' });

  const ids = [
    ...new Set(
      (Array.isArray(req.body?.listas) ? req.body.listas : [])
        .map((valor) => Number(valor?.id ?? valor))
        .filter(Boolean)
    ),
  ];

  // Una lista que no existe se ignora en lugar de romper el guardado: el
  // caso real es alguien con la pantalla abierta desde antes de que la
  // borraran.
  const existentes = ids.filter((id) =>
    db.prepare('SELECT 1 FROM opcion_listas WHERE id = ?').get(id)
  );

  const guardar = db.transaction(() => {
    db.prepare('DELETE FROM producto_opcion_listas WHERE producto_id = ?').run(producto.id);
    const insertar = db.prepare(
      'INSERT INTO producto_opcion_listas (producto_id, lista_id, orden) VALUES (?, ?, ?)'
    );
    existentes.forEach((listaId, indice) => insertar.run(producto.id, listaId, indice));
  });
  guardar();

  res.json({ success: true, listas: existentes });
});

/**
 * Asignar una lista a varios platos de una vez.
 *
 * Es el que resuelve el trabajo de verdad: los cuatro agregados de hamburguesa
 * estaban copiados en dieciséis platos, y sin esto pasarlos a una lista
 * compartida serían dieciséis ediciones a mano — el mismo trabajo que se está
 * tratando de eliminar.
 */
router.post('/:id/asignar', auth, requirePermission('productos.edit'), (req, res) => {
  const lista = db.prepare('SELECT * FROM opcion_listas WHERE id = ?').get(req.params.id);
  if (!lista) return res.status(404).json({ error: 'La lista no existe' });

  const productoIds = [
    ...new Set(
      (Array.isArray(req.body?.productos) ? req.body.productos : [])
        .map((valor) => Number(valor?.id ?? valor))
        .filter(Boolean)
    ),
  ];
  const categoriaId = Number(req.body?.categoria_id || 0);

  const objetivo = categoriaId
    ? db
        .prepare('SELECT id FROM productos WHERE categoria_id = ? AND activo = 1')
        .all(categoriaId)
        .map((fila) => fila.id)
    : productoIds;

  if (objetivo.length === 0) {
    return res.status(400).json({ error: 'Elegí a qué platos asignarle la lista' });
  }

  const asignar = db.transaction(() => {
    const insertar = db.prepare(
      'INSERT OR IGNORE INTO producto_opcion_listas (producto_id, lista_id, orden) VALUES (?, ?, 0)'
    );
    for (const productoId of objetivo) insertar.run(productoId, lista.id);
  });
  asignar();

  res.json({
    success: true,
    asignados: objetivo.length,
    mensaje: `"${lista.nombre}" quedó en ${objetivo.length} plato${objetivo.length === 1 ? '' : 's'}.`,
  });
});

module.exports = router;
