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

function validarCategoria(req, res, next) {
  const existing = req.params.id
    ? db.prepare('SELECT * FROM categorias WHERE id=?').get(req.params.id)
    : null;
  const fail = (message, status = 400) => {
    if (req.file) {
      fs.rmSync(imagePathToFile(uploadPathFromFilename(req.file.filename)), { force: true });
    }
    return res.status(status).json({ error: message });
  };
  if (req.params.id && !existing) return fail('Categoría no encontrada', 404);
  const nombre = String(req.body.nombre ?? existing?.nombre ?? '').trim();
  if (!nombre || nombre.length > 120) return fail('El nombre debe tener entre 1 y 120 caracteres');
  if (
    db
      .prepare('SELECT id,nombre FROM categorias')
      .all()
      .some(
        (c) =>
          String(c.id) !== String(req.params.id) &&
          c.nombre.trim().localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0
      )
  ) {
    return fail('Ya existe una categoría con ese nombre', 409);
  }
  const orden = Number(req.body.orden ?? existing?.orden ?? 0);
  if (!Number.isSafeInteger(orden) || orden < 0) {
    return fail('El orden debe ser un entero mayor o igual a cero');
  }
  if (req.body.activo !== undefined && ![0, 1].includes(Number(req.body.activo))) {
    return fail('Estado inválido');
  }
  if (req.body.subcategorias !== undefined) {
    let subs;
    try {
      subs =
        typeof req.body.subcategorias === 'string'
          ? JSON.parse(req.body.subcategorias)
          : req.body.subcategorias;
    } catch {
      return fail('Subcategorías inválidas');
    }
    if (
      !Array.isArray(subs) ||
      subs.some(
        (s) => typeof s?.nombre !== 'string' || !s.nombre.trim() || s.nombre.trim().length > 120
      )
    ) {
      return fail('Cada subcategoría necesita un nombre válido');
    }
    subs = subs.map((s) => ({ nombre: s.nombre.trim() }));
    if (new Set(subs.map((s) => s.nombre.toLocaleLowerCase('es'))).size !== subs.length) {
      return fail('No se pueden repetir subcategorías');
    }
    if (
      existing &&
      db
        .prepare(
          "SELECT DISTINCT subcategoria FROM productos WHERE categoria_id=? AND subcategoria!=''"
        )
        .all(existing.id)
        .some((p) => !subs.some((s) => s.nombre === p.subcategoria))
    ) {
      return fail('Reasigná los productos antes de quitar o renombrar su subcategoría', 409);
    }
    req.body.subcategorias = subs;
  }
  req.body.nombre = nombre;
  req.body.orden = orden;
  next();
}

router.put('/:id/mover', auth, requirePermission('productos.edit'), (req, res) => {
  const direccion = Number(req.body.direccion);
  if (![-1, 1].includes(direccion)) return res.status(400).json({ error: 'Dirección inválida' });
  const result = db.transaction(() => {
    const rows = db
      .prepare('SELECT id FROM categorias ORDER BY orden ASC, nombre ASC, id ASC')
      .all();
    const index = rows.findIndex((c) => c.id === Number(req.params.id));
    if (index < 0) return false;
    const destino = index + direccion;
    if (destino >= 0 && destino < rows.length) {
      [rows[index], rows[destino]] = [rows[destino], rows[index]];
    }
    const update = db.prepare('UPDATE categorias SET orden=? WHERE id=?');
    rows.forEach((c, i) => update.run(i + 1, c.id));
    return true;
  })();
  return result
    ? res.json({ success: true })
    : res.status(404).json({ error: 'Categoría no encontrada' });
});

router.get('/', (_req, res) => {
  const categorias = db.prepare('SELECT * FROM categorias ORDER BY orden ASC, nombre ASC').all();
  res.json(categorias.map(normalizeCategoria));
});

router.get('/:id', (_req, res) => {
  const categoria = db.prepare('SELECT * FROM categorias WHERE id = ?').get(_req.params.id);
  if (!categoria) return res.status(404).json({ error: 'Categoria no encontrada' });
  res.json(normalizeCategoria(categoria));
});

router.post(
  '/',
  auth,
  requirePermission('productos.edit'),
  upload.single('imagen'),
  validarCategoria,
  (req, res) => {
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
  }
);

router.put(
  '/:id',
  auth,
  requirePermission('productos.edit'),
  upload.single('imagen'),
  validarCategoria,
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
    if ((req.file || wantsRemoveImage) && existing.imagen) {
      const oldFile = imagePathToFile(existing.imagen);
      if (oldFile && fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
    }
    res.json(normalizeCategoria(updated));
  }
);

router.delete('/:id', auth, requirePermission('productos.edit'), (req, res) => {
  const categoria = db.prepare('SELECT imagen FROM categorias WHERE id = ?').get(req.params.id);
  if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada' });
  db.transaction(() => {
    db.prepare("UPDATE productos SET subcategoria='' WHERE categoria_id=?").run(req.params.id);
    db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
  })();
  if (categoria?.imagen) {
    const file = imagePathToFile(categoria.imagen);
    if (file && fs.existsSync(file)) fs.unlinkSync(file);
  }

  res.json({ success: true });
});

module.exports = router;
