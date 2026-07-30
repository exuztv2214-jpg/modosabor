const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/authConfig');
const db = require('../db');

const JWT_SECRET = getJwtSecret();

module.exports = (req, res, next) => {
  const token = req.cookies?.auth_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const current = db
      .prepare('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?')
      .get(decoded.id);
    if (!current || Number(current.activo) !== 1) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    req.user = {
      ...decoded,
      id: current.id,
      nombre: current.nombre,
      email: current.email,
      rol: current.rol,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
};
