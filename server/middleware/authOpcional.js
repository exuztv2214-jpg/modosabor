const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/authConfig');
const db = require('../db');

const JWT_SECRET = getJwtSecret();

/**
 * Reconoce al usuario si hay sesión, y deja pasar si no la hay.
 *
 * ── Para qué ───────────────────────────────────────────────────────────────
 *
 * Hay rutas que atienden a dos públicos con la misma URL. El catálogo de
 * productos es el caso: lo pide la web del cliente —sin login, y así tiene que
 * ser— y también el panel, que sí está adentro.
 *
 * El `auth` de siempre no sirve acá porque rechaza al que no tiene sesión, y no
 * poner nada tampoco, porque entonces la ruta no puede distinguir a uno de
 * otro y termina mandándole a cualquiera todo lo que sabe.
 *
 * Con esto, `req.user` queda cargado si la sesión es válida y en `null` si no.
 * La ruta decide qué mostrar a cada uno.
 *
 * ── Por qué nunca falla ────────────────────────────────────────────────────
 *
 * Un token vencido, roto o de un usuario dado de baja no es un error acá: es
 * simplemente alguien que mira desde afuera. Si esto respondiera 401, un token
 * viejo guardado en el navegador rompería la web pública para un cliente que
 * ni sabe que alguna vez tuvo sesión.
 */
module.exports = (req, _res, next) => {
  req.user = null;

  const token = req.cookies?.auth_token || req.headers.authorization?.split(' ')[1];
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const current = db
      .prepare('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?')
      .get(decoded.id);

    if (current && Number(current.activo) === 1) {
      req.user = {
        ...decoded,
        id: current.id,
        nombre: current.nombre,
        email: current.email,
        rol: current.rol,
      };
    }
  } catch {
    // Token inválido o vencido: se mira desde afuera, como cualquier cliente.
  }

  next();
};
