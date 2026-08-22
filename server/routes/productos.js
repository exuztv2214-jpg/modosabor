const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const {
  uploadsDir,
  uploadPathFromFilename,
  uploadPublicPathToFile,
} = require('../utils/storagePaths');
const {
  decorateProductsWithInventory,
  registerManualStockAdjustment,
  roundStock,
} = require('../utils/inventory');
const {
  createFileFilter,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
} = require('../utils/uploadValidation');

const { validateBody } = require('../middleware/validate');
const { createProductoSchema, updateProductoSchema } = require('../schemas');
const { pesosToCents } = require('../utils/moneyConversion');
const authOpcional = require('../middleware/authOpcional');
const { aplicarListasCompartidas } = require('../utils/opcionesCompartidas');
const {
  applyMenuDiaPricingList,
  applyMenuDiaSnapshotAvailabilityList,
} = require('../utils/menuDiaPricing');
const { fechaLocal, hoyArgentina, hoyLocal } = require('../utils/fechaLocal');
const { aplicarListaDePrecios, CANALES } = require('../utils/listasPrecios');

/**
 * Lo que ve alguien que no está adentro del panel.
 *
 * ── Qué pasaba ─────────────────────────────────────────────────────────────
 *
 * El catálogo se sirve sin login, y así tiene que ser: de ahí come la web
 * pública. Pero la consulta era `SELECT p.*`, o sea que devolvía la fila
 * entera. Comprobado contra producción, sin ninguna credencial:
 *
 *     GET /api/productos  →  "costo": 0, "stock_directo": 16, "stock": 16
 *
 * El costo de cada plato es tu estructura de márgenes. Hoy no filtra nada
 * porque están todos en cero, pero el día que los cargues quedan a un click de
 * cualquiera —incluido el de la esquina—. El stock ya está expuesto: se puede
 * ver cuántas porciones quedan de cada cosa.
 *
 * ── Cómo se resolvió ───────────────────────────────────────────────────────
 *
 * En vez de tapar campos uno por uno —que es una lista que se olvida de
 * actualizar cuando alguien agrega una columna— se arma la respuesta pública
 * nombrando lo que se necesita. Si mañana se agrega `costo_proveedor`, no sale
 * por accidente: hay que agregarlo acá a propósito.
 *
 * La lista salió de leer qué usa la web de verdad. `disponible_para_venta` sí
 * va —el cliente tiene que saber si puede pedirlo— pero es un sí o un no, no
 * el número de porciones.
 */
const CAMPOS_PUBLICOS = [
  'id',
  'nombre',
  'descripcion',
  'precio',
  'precio_anterior',
  'categoria_id',
  'categoria_nombre',
  'categoria_icono',
  'imagen',
  'variantes',
  'extras',
  'activo',
  'destacado',
  'tiempo_preparacion',
  'menu_dia_tipo',
  'menu_dia_base',
  'menu_dia_disponible_hoy',
  'menu_dia_precio_economico',
  'menu_dia_precio_ejecutivo',
  /*
    El orden en que el dueño acomodó el menú de hoy arrastrando las tarjetas.
    Va al público a propósito: sin él la web ordenaba alfabéticamente y el
    arrastre no servía para nada de cara al cliente.
  */
  'menu_dia_orden',
  'disponible_para_venta',
];

function paraElPublico(productos) {
  return (productos || []).map((p) =>
    CAMPOS_PUBLICOS.reduce((acc, campo) => {
      if (p[campo] !== undefined) acc[campo] = p[campo];
      return acc;
    }, {})
  );
}

/** El panel ve todo; cualquier otro, sólo lo que la carta necesita mostrar. */
function segunQuienPregunta(req, productos) {
  return req.user ? productos : paraElPublico(productos);
}

// Multer populates req.body AFTER the global money middleware has already run,
// so multipart requests skip pesos→centavos conversion.  This route-level
// middleware applies the conversion after multer.
/**
 * Convierte la plata del cuerpo cuando llega como multipart.
 *
 * El middleware global de `index.js` corre antes que multer, asi que con
 * FormData `req.body` todavia esta vacio y no convierte nada: por eso hace
 * falta repetirlo aca, despues de multer.
 *
 * El chequeo de `multipart` no es decorativo. Si la peticion viene en JSON el
 * middleware global ya la convirtio, y volver a convertirla aca multiplicaba
 * por cien dos veces. Antes pasaba desapercibido porque `extras` y `variantes`
 * viajaban como texto y quedaban afuera del conversor; ahora que entran, un
 * POST en JSON guardaria el extra diez mil veces mas caro.
 */
function convertMultipartMoney(req, _res, next) {
  if (req.is('multipart/form-data') && req.body && typeof req.body === 'object') {
    req.body = pesosToCents(req.body);
  }
  next();
}

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) =>
    cb(
      null,
      `producto-${Date.now()}${String(path.extname(file.originalname) || '').toLowerCase()}`
    ),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: createFileFilter({
    allowedExtensions: IMAGE_EXTENSIONS,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    message: 'La imagen debe ser JPG, PNG, WEBP o GIF',
  }),
});

function imagePathToFile(imagen) {
  return uploadPublicPathToFile(imagen);
}

function deleteFileIfExists(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function cleanText(value) {
  return String(value || '').trim();
}

function parseArrayField(value, fieldName) {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error(`Formato invalido para ${fieldName}`);
  }
}

function normalizeVariantGroups(groups) {
  return (groups || [])
    .map((group) => ({
      nombre: cleanText(group?.nombre),
      opciones: (group?.opciones || [])
        .map((option) => {
          const precioExtra = Number(option?.precio_extra ?? 0);
          return {
            nombre: cleanText(option?.nombre),
            precio_extra: Number.isFinite(precioExtra) ? roundStock(precioExtra) : 0,
          };
        })
        .filter((option) => option.nombre),
    }))
    .filter((group) => group.nombre && group.opciones.length > 0);
}

function normalizeExtras(extras) {
  return (extras || [])
    .map((extra) => {
      const precio = Number(extra?.precio ?? 0);
      return {
        nombre: cleanText(extra?.nombre),
        precio: Number.isFinite(precio) ? roundStock(Math.max(0, precio)) : 0,
      };
    })
    .filter((extra) => extra.nombre);
}

function parseNonNegativeNumber(value, fallback = 0) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return roundStock(parsed);
}

function parseFlag(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return Number(fallback) === 0 ? 0 : 1;
  return Number(value) === 1 ? 1 : 0;
}

function parseCategoriaId(value, fallback = null) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  if (raw === undefined || raw === null || raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function buildProductPayload(body, options = {}) {
  const existing = options.existing || null;
  const nombre = cleanText(body?.nombre ?? existing?.nombre);
  const descripcion = cleanText(body?.descripcion ?? existing?.descripcion);
  const precio = parseNonNegativeNumber(body?.precio, existing?.precio);
  const costo = parseNonNegativeNumber(body?.costo, existing?.costo ?? 0);
  const tiempoPreparacion = parseNonNegativeNumber(
    body?.tiempo_preparacion,
    existing?.tiempo_preparacion ?? 15
  );
  const categoriaId = parseCategoriaId(body?.categoria_id, existing?.categoria_id ?? null);
  const activo = parseFlag(body?.activo, existing?.activo ?? 1);
  const destacado = parseFlag(body?.destacado, existing?.destacado ?? 0);
  const variantes = JSON.stringify(
    normalizeVariantGroups(
      parseArrayField(body?.variantes ?? existing?.variantes ?? '[]', 'variantes')
    )
  );
  const extras = JSON.stringify(
    normalizeExtras(parseArrayField(body?.extras ?? existing?.extras ?? '[]', 'extras'))
  );

  if (!nombre) {
    throw new Error('Nombre requerido');
  }

  if (precio === null || precio <= 0) {
    throw new Error('Precio invalido');
  }

  if (costo === null || tiempoPreparacion === null) {
    throw new Error('Costo o tiempo de preparacion invalidos');
  }

  if (categoriaId !== null) {
    const categoria = db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoriaId);
    if (!categoria) {
      throw new Error('Categoria invalida');
    }
  }

  // precio_anterior: nullable, only set if explicitly provided
  let precioAnterior = existing?.precio_anterior ?? null;
  if (
    body?.precio_anterior !== undefined &&
    body?.precio_anterior !== null &&
    body?.precio_anterior !== ''
  ) {
    const pa = Number(body.precio_anterior);
    precioAnterior = Number.isFinite(pa) && pa > 0 ? roundStock(pa) : null;
  }

  return {
    nombre,
    descripcion,
    precio,
    costo,
    precio_anterior: precioAnterior,
    categoria_id: categoriaId,
    variantes,
    extras,
    activo,
    destacado,
    tiempo_preparacion: tiempoPreparacion,
  };
}

router.get('/', authOpcional, (req, res) => {
  const { categoria_id, activo } = req.query;
  /*
    El orden del menú del día no vive en `productos`: vive en
    `menu_dia_historial`, una fila por plato y por día. Por eso el JOIN va
    atado a la fecha de hoy.

    Es LEFT JOIN: los platos que no son del menú del día no tienen fila ahí y
    tienen que seguir apareciendo igual, con `menu_dia_orden` en null.

    La fecha va primero en los parámetros porque el JOIN se escribe antes del
    WHERE, y SQLite los toma en el orden en que aparecen en el texto.
  */
  let q =
    'SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono, mdh.orden AS menu_dia_orden,' +
    ' mdh.disponible AS menu_dia_disponible_fecha,' +
    ' mdh.precio_economico AS menu_dia_precio_economico,' +
    ' mdh.precio_ejecutivo AS menu_dia_precio_ejecutivo' +
    ' FROM productos p' +
    ' LEFT JOIN categorias c ON p.categoria_id = c.id' +
    ' LEFT JOIN menu_dia_historial mdh ON mdh.producto_id = p.id AND mdh.fecha = ?' +
    ' WHERE 1=1';
  const params = [hoyLocal()];
  if (categoria_id) {
    q += ' AND p.categoria_id = ?';
    params.push(categoria_id);
  }
  if (activo !== undefined) {
    q += ' AND p.activo = ?';
    params.push(Number(activo));
  }
  q += ' ORDER BY c.orden ASC, p.nombre ASC';
  /*
    Las listas compartidas se mezclan acá, sobre las filas crudas, para que
    todo lo que viene después —la proyección pública, el conversor de plata, el
    TPV, la web y la app del rider— vea el mismo JSON de siempre.
  */
  /*
    ── El orden de estas tres capas no es casual ──────────────────────────────

    1. Lista de precios del canal, sobre el precio base.
    2. Listas de opciones compartidas: los recargos de las variantes se suman
       sobre el precio ya ajustado.
    3. Menú del día, que manda por encima de todo: el precio de hoy para ese
       plato lo decidió el dueño esta mañana y ninguna lista de canal tiene por
       qué pisarlo.

    Es el mismo orden que usa `preciosServidor.js` al validar un pedido. Si los
    dos no coincidieran, la carta mostraría un precio y la caja cobraría otro.

    El canal lo manda quien pregunta: la web pide `?canal=delivery` cuando el
    cliente eligió envío. Por defecto, mostrador. Sin listas configuradas —el
    estado inicial— esto no cambia ningún precio.
  */
  const canal = CANALES.includes(String(req.query.canal || '')) ? req.query.canal : 'mostrador';
  const conPrecioDeCanal = aplicarListaDePrecios(db, db.prepare(q).all(...params), canal);
  const productosConListas = aplicarListasCompartidas(db, conPrecioDeCanal);
  const productos = applyMenuDiaSnapshotAvailabilityList(
    applyMenuDiaPricingList(productosConListas)
  );
  res.json(segunQuienPregunta(req, decorateProductsWithInventory(db, productos)));
});

/**
 * Catálogo mínimo que necesita el TPV para seguir pudiendo leer la carta si
 * se corta internet. Se mantiene separado de GET /productos porque el panel
 * autenticado recibe también costo y stock interno; esos datos no pueden
 * quedar persistidos en el caché del navegador.
 */
router.get('/catalogo-tpv', auth, requirePermission('tpv.use'), (req, res) => {
  let q =
    'SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono, mdh.orden AS menu_dia_orden,' +
    ' mdh.disponible AS menu_dia_disponible_fecha,' +
    ' mdh.precio_economico AS menu_dia_precio_economico,' +
    ' mdh.precio_ejecutivo AS menu_dia_precio_ejecutivo' +
    ' FROM productos p' +
    ' LEFT JOIN categorias c ON p.categoria_id = c.id' +
    ' LEFT JOIN menu_dia_historial mdh ON mdh.producto_id = p.id AND mdh.fecha = ?' +
    ' WHERE p.activo = 1';
  const params = [hoyLocal()];
  const canal = CANALES.includes(String(req.query.canal || '')) ? req.query.canal : 'mostrador';

  q += ' ORDER BY c.orden ASC, p.nombre ASC';
  const conPrecioDeCanal = aplicarListaDePrecios(db, db.prepare(q).all(...params), canal);
  const productosConListas = aplicarListasCompartidas(db, conPrecioDeCanal);
  const productos = applyMenuDiaSnapshotAvailabilityList(
    applyMenuDiaPricingList(productosConListas)
  );

  // `paraElPublico` es la lista explícita de campos seguros: precio y opciones
  // sí, costo y cantidades reales de stock no.
  res.json(paraElPublico(decorateProductsWithInventory(db, productos)));
});

/**
 * Planilla de costos: todos los productos activos, empezando por los que más
 * se vendieron en los últimos 30 días.  No reutiliza el catálogo público:
 * costo y margen son datos internos del negocio y sólo los puede ver quien
 * ya puede editar Productos.
 */
router.get('/costos', auth, requirePermission('productos.edit'), (_req, res) => {
  const hasta = hoyArgentina();
  const desdeDate = new Date(`${hasta}T12:00:00-03:00`);
  desdeDate.setDate(desdeDate.getDate() - 29);
  const desde = desdeDate.toISOString().slice(0, 10);

  const productos = db
    .prepare(
      `SELECT
         p.id,
         p.nombre,
         p.precio,
         COALESCE(p.costo, 0) AS costo,
         c.nombre AS categoria_nombre,
         COALESCE(SUM(CASE
           WHEN ped.estado != 'cancelado'
            AND ${fechaLocal('ped.creado_en')} BETWEEN ? AND ?
           THEN pi.cantidad
           ELSE 0
         END), 0) AS unidades_vendidas
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       LEFT JOIN pedido_items pi ON pi.producto_id = p.id
       LEFT JOIN pedidos ped ON ped.id = pi.pedido_id
       WHERE p.activo = 1
       GROUP BY p.id
       ORDER BY unidades_vendidas DESC, p.nombre COLLATE NOCASE ASC`
    )
    .all(desde, hasta)
    .map((producto) => ({
      ...producto,
      unidades_vendidas: Number(producto.unidades_vendidas || 0),
    }));

  res.json({
    desde,
    hasta,
    productos,
    activos: productos.length,
    sin_costo: productos.filter((producto) => Number(producto.costo || 0) <= 0).length,
  });
});

router.post(
  '/upload',
  auth,
  requirePermission('productos.edit'),
  upload.single('imagen'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen' });
    res.json({ url: uploadPathFromFilename(req.file.filename) });
  }
);

router.get('/:id', authOpcional, (req, res) => {
  const p = db
    .prepare(
      'SELECT p.*, c.nombre as categoria_nombre FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.id = ?'
    )
    .get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  const [conListas] = aplicarListasCompartidas(db, [p]);
  res.json(segunQuienPregunta(req, decorateProductsWithInventory(db, [conListas]))[0]);
});

router.post(
  '/',
  auth,
  requirePermission('productos.edit'),
  upload.single('imagen'),
  validateBody(createProductoSchema),
  convertMultipartMoney,
  (req, res) => {
    try {
      const payload = buildProductPayload(req.body);
      const stockDirecto = parseNonNegativeNumber(req.body?.stock, 0);
      if (stockDirecto === null) {
        throw new Error('Stock invalido');
      }

      const imagen = uploadPathFromFilename(req.file?.filename);
      db.exec('BEGIN');
      const r = db
        .prepare(
          'INSERT INTO productos (nombre, descripcion, precio, costo, precio_anterior, categoria_id, imagen, variantes, extras, activo, destacado, tiempo_preparacion, stock_directo, stock_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          payload.nombre,
          payload.descripcion,
          payload.precio,
          payload.costo,
          payload.precio_anterior,
          payload.categoria_id,
          imagen,
          payload.variantes,
          payload.extras,
          payload.activo,
          payload.destacado,
          payload.tiempo_preparacion,
          stockDirecto,
          'direct'
        );
      const created = db.prepare('SELECT * FROM productos WHERE id = ?').get(r.lastInsertRowid);

      if (stockDirecto !== 0) {
        registerManualStockAdjustment(
          db,
          { ...created, stock_directo: 0 },
          stockDirecto,
          `Stock inicial para ${payload.nombre}`
        );
      }

      db.exec('COMMIT');
      res.json(
        decorateProductsWithInventory(db, [
          db.prepare('SELECT * FROM productos WHERE id = ?').get(r.lastInsertRowid),
        ])[0]
      );
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      deleteFileIfExists(imagePathToFile(uploadPathFromFilename(req.file?.filename)));
      res.status(400).json({ error: error.message || 'No se pudo crear el producto' });
    }
  }
);

router.put(
  '/:id',
  auth,
  requirePermission('productos.edit'),
  upload.single('imagen'),
  validateBody(updateProductoSchema),
  convertMultipartMoney,
  (req, res) => {
    const existing = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

    try {
      const payload = buildProductPayload(req.body, { existing });
      const wantsRemoveImage = String(req.body.remove_imagen || '0') === '1';
      const imagen = req.file
        ? uploadPathFromFilename(req.file.filename)
        : wantsRemoveImage
          ? ''
          : existing.imagen;

      db.exec('BEGIN');
      db.prepare(
        'UPDATE productos SET nombre=?, descripcion=?, precio=?, costo=?, precio_anterior=?, categoria_id=?, imagen=?, variantes=?, extras=?, activo=?, destacado=?, tiempo_preparacion=? WHERE id=?'
      ).run(
        payload.nombre,
        payload.descripcion,
        payload.precio,
        payload.costo,
        payload.precio_anterior,
        payload.categoria_id,
        imagen,
        payload.variantes,
        payload.extras,
        payload.activo,
        payload.destacado,
        payload.tiempo_preparacion,
        req.params.id
      );

      if (
        req.body.stock !== undefined &&
        req.body.stock !== null &&
        req.body.stock !== '' &&
        existing.stock_mode !== 'recipe'
      ) {
        const nextStock = parseNonNegativeNumber(req.body.stock, existing.stock_directo || 0);
        if (nextStock === null) {
          throw new Error('Stock invalido');
        }

        registerManualStockAdjustment(
          db,
          db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id),
          nextStock,
          `Ajuste de stock directo para ${payload.nombre}`
        );
      }

      db.exec('COMMIT');
      if (existing.imagen && (req.file || wantsRemoveImage) && existing.imagen !== imagen) {
        deleteFileIfExists(imagePathToFile(existing.imagen));
      }

      res.json(
        decorateProductsWithInventory(db, [
          db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id),
        ])[0]
      );
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      deleteFileIfExists(imagePathToFile(uploadPathFromFilename(req.file?.filename)));
      res.status(400).json({ error: error.message || 'No se pudo actualizar el producto' });
    }
  }
);

/**
 * Qué se lleva puesto borrar este producto de verdad.
 *
 * La pantalla lo pregunta antes de mostrar el cartel de confirmación, para
 * poder decir qué se pierde en vez de "se quitará del sistema".
 */
router.get('/:id/dependencias', auth, requirePermission('productos.edit'), (req, res) => {
  const id = req.params.id;
  const contar = (sql) => {
    try {
      return db.prepare(sql).get(id).n;
    } catch {
      return 0;
    }
  };

  res.json({
    receta: contar('SELECT COUNT(*) AS n FROM inventario_recetas WHERE producto_id = ?'),
    menuDia: contar('SELECT COUNT(*) AS n FROM menu_dia_historial WHERE producto_id = ?'),
    vendido: contar('SELECT COUNT(*) AS n FROM pedido_items WHERE producto_id = ?'),
  });
});

/**
 * Sacar un producto de circulación.
 *
 * ── Por qué ya no borra ────────────────────────────────────────────────────
 *
 * Antes esto era un `DELETE` de verdad, y hay dos tablas que se van en cascada
 * con el producto:
 *
 *     inventario_recetas    ON DELETE CASCADE
 *     menu_dia_historial    ON DELETE CASCADE
 *
 * Las claves foráneas están activas, así que borrar un plato **destruía su
 * receta** —qué insumos lleva y en qué cantidad, que es carga de datos que
 * nadie quiere repetir— y lo sacaba del historial del menú del día, de donde
 * salen los reportes de qué se cocinó.
 *
 * Y el cartel que se leía antes de confirmar decía nada más que "el producto se
 * quitará del sistema y dejará de estar disponible para venta". Alguien que
 * quiere dejar de vender un plato lee eso y aprieta tranquilo.
 *
 * Casi siempre lo que se quiere es justamente eso: que deje de venderse. Para
 * eso alcanza con darlo de baja, y así la receta queda esperando por si el
 * plato vuelve —que en un restaurante con menú del día, vuelve—.
 *
 * ── Cuándo borra igual ─────────────────────────────────────────────────────
 *
 * Con `?definitivo=1`, y eso lo manda la pantalla sólo después de mostrar qué
 * se pierde. La opción existe porque un producto cargado por error no tiene
 * por qué quedar dando vueltas.
 */
router.delete('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const producto = db
    .prepare('SELECT id, nombre, imagen, activo FROM productos WHERE id = ?')
    .get(req.params.id);
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

  const definitivo = String(req.query.definitivo || '') === '1';

  if (!definitivo) {
    db.prepare('UPDATE productos SET activo = 0 WHERE id = ?').run(producto.id);
    return res.json({
      success: true,
      accion: 'baja',
      mensaje: `${producto.nombre} ya no se vende. La receta y el historial quedan guardados.`,
    });
  }

  // La imagen se borra sólo en el borrado definitivo: si es una baja, el plato
  // puede volver y sería una lástima tener que subir la foto de nuevo.
  if (producto.imagen) {
    const file = imagePathToFile(producto.imagen);
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare('DELETE FROM productos WHERE id = ?').run(producto.id);
  res.json({ success: true, accion: 'eliminado' });
});

module.exports = router;
