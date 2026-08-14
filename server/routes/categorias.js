const path = require('path');
const fs = require('fs');
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
  createFileFilter,
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
} = require('../utils/uploadValidation');

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) =>
    cb(
      null,
      `categoria-${Date.now()}${String(path.extname(file.originalname) || '').toLowerCase()}`
    ),
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: createFileFilter({
    allowedExtensions: IMAGE_EXTENSIONS,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    message: 'La imagen debe ser JPG, PNG, WEBP o GIF',
  }),
});

function parseSubcategorias(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item) => item?.nombre?.trim());

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.nombre?.trim());
  } catch {
    return [];
  }
}

function normalizeCategoria(row) {
  if (!row) return row;

  return {
    ...row,
    imagen: row.imagen || '',
    subcategorias: parseSubcategorias(row.subcategorias),
  };
}

function imagePathToFile(imagen) {
  return uploadPublicPathToFile(imagen);
}

router.get('/', (_req, res) => {
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY orden ASC, nombre ASC').all();
  res.json(categorias.map(normalizeCategoria));
});

router.get('/:id', (_req, res) => {
  const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(_req.params.id);
  if (!categoria) return res.status(404).json({ error: 'Categoria no encontrada' });
  res.json(normalizeCategoria(categoria));
});

router.post('/', auth, requirePermission('productos.edit'), upload.single('imagen'), (req, res) => {
  const {
    nombre,
    icono = '🍽️',
    color = '#f97316',
    orden = 0,
    activo = 1,
    turno_id = '',
  } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

  const subcategorias = JSON.stringify(parseSubcategorias(req.body.subcategorias));
  const imagen = uploadPathFromFilename(req.file?.filename);

  const result = db
    .prepare(
      'INSERT INTO categorias (nombre, icono, color, orden, activo, imagen, subcategorias, turno_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      nombre,
      icono,
      color,
      Number(orden) || 0,
      Number(activo) === 1 ? 1 : 0,
      imagen,
      subcategorias,
      String(turno_id || '')
    );

  const created = db.prepare('SELECT * FROM categorias WHERE id = ?').get(result.lastInsertRowid);
  res.json(normalizeCategoria(created));
});

router.put(
  '/:id',
  auth,
  requirePermission('productos.edit'),
  upload.single('imagen'),
  (req, res) => {
    const existing = db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Categoria no encontrada' });

    const nombre = req.body.nombre ?? existing.nombre;
    const icono = req.body.icono ?? existing.icono;
    const color = req.body.color ?? existing.color;
    const orden = req.body.orden ?? existing.orden;
    const activo = req.body.activo ?? existing.activo;
    const turno_id = req.body.turno_id ?? existing.turno_id ?? '';
    const subcategorias = JSON.stringify(
      parseSubcategorias(req.body.subcategorias ?? existing.subcategorias)
    );
    const wantsRemoveImage = String(req.body.remove_imagen || '0') === '1';
    const imagen = req.file
      ? uploadPathFromFilename(req.file.filename)
      : wantsRemoveImage
        ? ''
        : existing.imagen || '';

    if ((req.file || wantsRemoveImage) && existing.imagen) {
      const oldFile = imagePathToFile(existing.imagen);
      if (oldFile && fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }

    db.prepare(
      'UPDATE categorias SET nombre=?, icono=?, color=?, orden=?, activo=?, imagen=?, subcategorias=?, turno_id=? WHERE id=?'
    ).run(
      nombre,
      icono,
      color,
      Number(orden) || 0,
      Number(activo) === 1 ? 1 : 0,
      imagen,
      subcategorias,
      String(turno_id || ''),
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id);
    res.json(normalizeCategoria(updated));
  }
);

router.delete('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const categoria = db.prepare('SELECT imagen FROM categorias WHERE id = ?').get(req.params.id);
  if (categoria?.imagen) {
    const file = imagePathToFile(categoria.imagen);
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  }

  db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
