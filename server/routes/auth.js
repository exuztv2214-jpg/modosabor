const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');
const { getPermissionsForRole, requirePermission } = require('../utils/permissions');
const { getJwtSecret } = require('../utils/authConfig');
const { createRateLimiter } = require('../utils/rateLimit');

const { validateBody } = require('../middleware/validate');
const { loginSchema, createUserSchema } = require('../schemas');

const JWT_SECRET = getJwtSecret();
const loginRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiados intentos de login. Proba de nuevo en 15 minutos.',
});

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
};

router.post('/login', loginRateLimit, validateBody(loginSchema), (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' });
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  const token = jwt.sign(
    { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('auth_token', token, COOKIE_OPTIONS);
  res.json({
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      avatar: user.avatar,
      permissions: getPermissionsForRole(user.rol),
    },
  });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.json({ success: true });
});

router.get('/me', auth, (req, res) => {
  const user = db
    .prepare(
      'SELECT id, nombre, email, rol, activo, avatar, creado_en FROM usuarios WHERE id = ? AND activo = 1'
    )
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({
    ...user,
    permissions: getPermissionsForRole(user.rol),
  });
});

router.put('/me', auth, (req, res) => {
  const existing = db
    .prepare(
      'SELECT id, nombre, email, rol, activo, avatar, creado_en FROM usuarios WHERE id = ? AND activo = 1'
    )
    .get(req.user.id);
  if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

  const nombre = String(req.body?.nombre || '').trim();
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();

  if (!nombre || !email) {
    return res.status(400).json({ error: 'Nombre y email son obligatorios' });
  }

  const duplicated = db
    .prepare('SELECT id FROM usuarios WHERE lower(email) = ? AND id != ?')
    .get(email, req.user.id);
  if (duplicated) {
    return res.status(400).json({ error: 'Ya existe un usuario con ese email' });
  }

  db.prepare('UPDATE usuarios SET nombre = ?, email = ? WHERE id = ?').run(
    nombre,
    email,
    req.user.id
  );

  const user = db
    .prepare(
      'SELECT id, nombre, email, rol, activo, avatar, creado_en FROM usuarios WHERE id = ? AND activo = 1'
    )
    .get(req.user.id);
  res.json({
    ...user,
    permissions: getPermissionsForRole(user.rol),
  });
});

router.get('/me/activity', auth, (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT id, modulo, accion, entidad, entidad_id, detalle, creado_en
    FROM auditoria_eventos
    WHERE actor_id = ?
    ORDER BY datetime(creado_en) DESC, id DESC
    LIMIT 20
  `
    )
    .all(req.user.id);

  res.json(rows);
});

router.get('/usuarios', auth, requirePermission('config.manage'), (_req, res) => {
  const rows = db
    .prepare('SELECT id, nombre, email, rol, activo, creado_en FROM usuarios ORDER BY nombre ASC')
    .all();
  res.json(rows);
});

router.post(
  '/usuarios',
  auth,
  requirePermission('config.manage'),
  validateBody(createUserSchema),
  (req, res) => {
    const { nombre, email, password, rol = 'caja' } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: 'Nombre, email y contrasena son requeridos' });
    }

    const validRoles = ['admin', 'caja', 'cocina', 'delivery'];
    if (!validRoles.includes(rol)) return res.status(400).json({ error: 'Rol invalido' });

    const exists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
    if (exists) return res.status(400).json({ error: 'Ya existe un usuario con ese email' });

    const result = db
      .prepare(
        'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)'
      )
      .run(nombre, email, bcrypt.hashSync(password, 10), rol);

    const user = db
      .prepare('SELECT id, nombre, email, rol, activo, creado_en FROM usuarios WHERE id = ?')
      .get(result.lastInsertRowid);
    res.json(user);
  }
);

router.put('/usuarios/:id', auth, requirePermission('config.manage'), (req, res) => {
  const existing = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Usuario no encontrado' });

  const validRoles = ['admin', 'caja', 'cocina', 'delivery'];
  const nombre = req.body.nombre ?? existing.nombre;
  const email = req.body.email ?? existing.email;
  const rol = req.body.rol ?? existing.rol;
  const activo = req.body.activo ?? existing.activo;

  if (!validRoles.includes(rol)) return res.status(400).json({ error: 'Rol invalido' });

  db.prepare('UPDATE usuarios SET nombre = ?, email = ?, rol = ?, activo = ? WHERE id = ?').run(
    nombre,
    email,
    rol,
    activo ? 1 : 0,
    req.params.id
  );

  if (req.body.password) {
    db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(
      bcrypt.hashSync(req.body.password, 10),
      req.params.id
    );
  }

  const user = db
    .prepare('SELECT id, nombre, email, rol, activo, creado_en FROM usuarios WHERE id = ?')
    .get(req.params.id);
  res.json(user);
});

router.put('/password', auth, (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  if (!password_nuevo || password_nuevo.length < 6) {
    return res.status(400).json({ error: 'La nueva contrasena debe tener al menos 6 caracteres' });
  }
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(password_actual, user.password_hash)) {
    return res.status(400).json({ error: 'Contrasena actual incorrecta' });
  }
  db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(
    bcrypt.hashSync(password_nuevo, 10),
    req.user.id
  );
  res.json({ success: true });
});

router.put('/me/avatar', auth, (req, res) => {
  const { avatar } = req.body;
  db.prepare('UPDATE usuarios SET avatar = ? WHERE id = ?').run(avatar || '', req.user.id);
  res.json({ success: true });
});

module.exports = router;
