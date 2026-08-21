const express = require('express');
const multer = require('multer');

const db = require('../db');
const auth = require('../middleware/auth');
const { requirePermission } = require('../utils/permissions');
const { createDatabaseBackup } = require('../utils/backupManager');
const { logAudit, actorFromRequest } = require('../utils/audit');
const { parseCsv, toCsv } = require('../utils/csv');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.use(auth, requirePermission('config.manage'));

function sendCsv(res, filename, headers, rows) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(headers, rows));
}

function parseFlag(value, fallback = 1) {
  if (value === '' || value === undefined) return fallback;
  return ['1', 'si', 'sí', 'true', 'activo'].includes(String(value).trim().toLowerCase()) ? 1 : 0;
}

function parsePesos(value) {
  let raw = String(value ?? '').replace(/[$\s]/g, '');
  if (!raw) return null;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    raw = raw.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
  } else if (comma >= 0) {
    const decimals = raw.length - comma - 1;
    raw = decimals === 3 ? raw.replace(/,/g, '') : raw.replace(',', '.');
  } else if (dot >= 0) {
    const decimals = raw.length - dot - 1;
    if (decimals === 3) raw = raw.replace(/\./g, '');
  }
  const number = Number(raw);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

function normalizedPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

const EXPORTS = {
  categorias: {
    headers: ['nombre', 'icono', 'color', 'orden', 'activo', 'turno_id'],
    rows: () =>
      db
        .prepare(
          'SELECT nombre, icono, color, orden, activo, turno_id FROM categorias ORDER BY orden, nombre'
        )
        .all(),
  },
  productos: {
    headers: [
      'nombre',
      'categoria',
      'descripcion',
      'precio',
      'costo',
      'activo',
      'destacado',
      'tiempo_preparacion',
    ],
    rows: () =>
      db
        .prepare(
          `SELECT p.nombre, COALESCE(c.nombre, '') categoria, p.descripcion,
                  ROUND(p.precio / 100.0, 2) precio, ROUND(p.costo / 100.0, 2) costo,
                  p.activo, p.destacado, p.tiempo_preparacion
           FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
           ORDER BY c.orden, c.nombre, p.nombre`
        )
        .all(),
  },
  clientes: {
    headers: [
      'nombre',
      'telefono',
      'email',
      'direccion',
      'barrio',
      'fecha_nacimiento',
      'notas',
      'activo_fidelizacion',
    ],
    rows: () =>
      db
        .prepare(
          `SELECT nombre, telefono, email, direccion, barrio, fecha_nacimiento, notas,
                  fidelizacion_activa activo_fidelizacion
           FROM clientes ORDER BY nombre`
        )
        .all(),
  },
};

router.get('/exportar/:tipo', (req, res) => {
  const definition = EXPORTS[req.params.tipo];
  if (!definition) return res.status(404).json({ error: 'Tipo de exportación inválido' });
  return sendCsv(
    res,
    `modo-sabor-${req.params.tipo}-${new Date().toISOString().slice(0, 10)}.csv`,
    definition.headers,
    definition.rows()
  );
});

function analyzeCategories(rows, overwrite) {
  const existing = new Map(
    db
      .prepare('SELECT id, nombre FROM categorias')
      .all()
      .map((row) => [row.nombre.trim().toLowerCase(), row])
  );
  return rows.map((row, index) => {
    const nombre = String(row.nombre || '').trim();
    if (!nombre) return { index, row, error: 'Falta nombre' };
    const found = existing.get(nombre.toLowerCase());
    return {
      index,
      row,
      nombre,
      found,
      action: found ? (overwrite ? 'actualizar' : 'omitir') : 'crear',
    };
  });
}

function analyzeProducts(rows, overwrite) {
  const categories = new Map(
    db
      .prepare('SELECT id, nombre FROM categorias')
      .all()
      .map((row) => [row.nombre.trim().toLowerCase(), row])
  );
  const existing = new Map(
    db
      .prepare(
        `SELECT p.id, p.nombre, COALESCE(c.nombre, '') categoria FROM productos p LEFT JOIN categorias c ON c.id=p.categoria_id`
      )
      .all()
      .map((row) => [
        `${row.nombre.trim().toLowerCase()}|${row.categoria.trim().toLowerCase()}`,
        row,
      ])
  );
  return rows.map((row, index) => {
    const nombre = String(row.nombre || '').trim();
    const categoria = String(row.categoria || '').trim();
    const precio = parsePesos(row.precio);
    const costo = parsePesos(row.costo || 0);
    if (!nombre) return { index, row, error: 'Falta nombre' };
    if (!categoria || !categories.has(categoria.toLowerCase())) {
      return { index, row, error: `Categoría inexistente: ${categoria || '(vacía)'}` };
    }
    if (precio === null || precio <= 0) {
      return { index, row, error: `Precio inválido: ${row.precio || '(vacío)'}` };
    }
    if (costo === null) return { index, row, error: `Costo inválido: ${row.costo}` };
    const found = existing.get(`${nombre.toLowerCase()}|${categoria.toLowerCase()}`);
    return {
      index,
      row,
      nombre,
      categoriaId: categories.get(categoria.toLowerCase()).id,
      precio,
      costo,
      found,
      action: found ? (overwrite ? 'actualizar' : 'omitir') : 'crear',
    };
  });
}

function analyzeClients(rows, overwrite) {
  const existing = new Map(
    db
      .prepare("SELECT id, telefono FROM clientes WHERE COALESCE(telefono,'') != ''")
      .all()
      .map((row) => [normalizedPhone(row.telefono), row])
  );
  return rows.map((row, index) => {
    const nombre = String(row.nombre || '').trim();
    const telefono = normalizedPhone(row.telefono);
    if (!nombre) return { index, row, error: 'Falta nombre' };
    if (!telefono) return { index, row, error: 'Falta teléfono' };
    const found = existing.get(telefono);
    return {
      index,
      row,
      nombre,
      telefono,
      found,
      action: found ? (overwrite ? 'actualizar' : 'omitir') : 'crear',
    };
  });
}

function summarize(analysis) {
  return {
    filas: analysis.length,
    crear: analysis.filter((item) => item.action === 'crear').length,
    actualizar: analysis.filter((item) => item.action === 'actualizar').length,
    omitir: analysis.filter((item) => item.action === 'omitir').length,
    errores: analysis
      .filter((item) => item.error)
      .map((item) => ({ fila: item.index + 2, error: item.error }))
      .slice(0, 50),
  };
}

router.post('/importar/:tipo', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Adjuntá un archivo CSV' });
  const tipo = req.params.tipo;
  const overwrite = String(req.body.sobrescribir || '0') === '1';
  const aplicar = String(req.body.aplicar || '0') === '1';
  const rows = parseCsv(req.file.buffer.toString('utf8'));
  if (!rows.length) return res.status(400).json({ error: 'El CSV no contiene filas' });

  const analysis =
    tipo === 'categorias'
      ? analyzeCategories(rows, overwrite)
      : tipo === 'productos'
        ? analyzeProducts(rows, overwrite)
        : tipo === 'clientes'
          ? analyzeClients(rows, overwrite)
          : null;
  if (!analysis) return res.status(404).json({ error: 'Tipo de importación inválido' });
  const summary = summarize(analysis);
  if (!aplicar) return res.json({ preview: true, ...summary });
  if (summary.errores.length) {
    return res.status(400).json({ error: 'Corregí los errores antes de importar', ...summary });
  }

  const backup = createDatabaseBackup(db, { reason: `importacion-${tipo}` });
  const transaction = db.transaction(() => {
    for (const item of analysis) {
      if (item.action === 'omitir') continue;
      if (tipo === 'categorias') {
        const values = [
          item.nombre,
          item.row.icono || '🍽️',
          item.row.color || '#f97316',
          Number(item.row.orden || 0),
          parseFlag(item.row.activo),
          String(item.row.turno_id || ''),
        ];
        if (item.action === 'crear') {
          db.prepare(
            "INSERT INTO categorias (nombre,icono,color,orden,activo,imagen,subcategorias,turno_id) VALUES (?,?,?,?,?,'','[]',?)"
          ).run(...values);
        } else {
          db.prepare(
            'UPDATE categorias SET nombre=?,icono=?,color=?,orden=?,activo=?,turno_id=? WHERE id=?'
          ).run(...values, item.found.id);
        }
      } else if (tipo === 'productos') {
        const values = [
          item.nombre,
          String(item.row.descripcion || ''),
          item.categoriaId,
          item.precio,
          item.costo,
          parseFlag(item.row.activo),
          parseFlag(item.row.destacado, 0),
          Math.max(0, Number(item.row.tiempo_preparacion || 15)),
        ];
        if (item.action === 'crear') {
          db.prepare(
            "INSERT INTO productos (nombre,descripcion,categoria_id,precio,costo,activo,destacado,tiempo_preparacion,imagen,variantes,extras) VALUES (?,?,?,?,?,?,?,?,'','[]','[]')"
          ).run(...values);
        } else {
          db.prepare(
            'UPDATE productos SET nombre=?,descripcion=?,categoria_id=?,precio=?,costo=?,activo=?,destacado=?,tiempo_preparacion=? WHERE id=?'
          ).run(...values, item.found.id);
        }
      } else {
        const values = [
          item.nombre,
          item.telefono,
          String(item.row.email || ''),
          String(item.row.direccion || ''),
          String(item.row.barrio || ''),
          String(item.row.fecha_nacimiento || ''),
          String(item.row.notas || ''),
          parseFlag(item.row.activo_fidelizacion),
        ];
        if (item.action === 'crear') {
          db.prepare(
            "INSERT INTO clientes (nombre,telefono,email,direccion,barrio,fecha_nacimiento,notas,tags,fidelizacion_activa) VALUES (?,?,?,?,?,?,?,'[]',?)"
          ).run(...values);
        } else {
          db.prepare(
            'UPDATE clientes SET nombre=?,telefono=?,email=?,direccion=?,barrio=?,fecha_nacimiento=?,notas=?,fidelizacion_activa=? WHERE id=?'
          ).run(...values, item.found.id);
        }
      }
    }
  });
  transaction();

  logAudit(db, {
    modulo: 'datos',
    accion: 'importacion_csv',
    entidad: tipo,
    ...actorFromRequest(req, 'Panel'),
    detalle: { ...summary, sobrescribir: overwrite, backup: backup.file },
  });
  return res.json({ success: true, ...summary, backup: backup.file });
});

module.exports = router;
