const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
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

// Multer populates req.body AFTER the global money middleware has already run,
// so multipart requests skip pesos→centavos conversion.  This route-level
// middleware applies the conversion after multer.
function convertMultipartMoney(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
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

router.get('/', (req, res) => {
  const { categoria_id, activo } = req.query;
  let q =
    'SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE 1=1';
  const params = [];
  if (categoria_id) {
    q += ' AND p.categoria_id = ?';
    params.push(categoria_id);
  }
  if (activo !== undefined) {
    q += ' AND p.activo = ?';
    params.push(Number(activo));
  }
  q += ' ORDER BY c.orden ASC, p.nombre ASC';
  res.json(decorateProductsWithInventory(db, db.prepare(q).all(...params)));
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

router.get('/:id', (req, res) => {
  const p = db
    .prepare(
      'SELECT p.*, c.nombre as categoria_nombre FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.id = ?'
    )
    .get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(decorateProductsWithInventory(db, [p])[0]);
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

router.delete('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const p = db.prepare('SELECT imagen FROM productos WHERE id = ?').get(req.params.id);
  if (p?.imagen) {
    const file = imagePathToFile(p.imagen);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
