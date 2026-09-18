const { normalizarTelefono } = require('../services/whatsappMasivo/telefono');

function phoneKey(value) {
  return normalizarTelefono(value) || String(value || '').replace(/\D/g, '');
}
function emailKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}
function findClienteDuplicate(db, payload, excludeId = null) {
  const phone = phoneKey(payload.telefono);
  const email = emailKey(payload.email);
  if (!phone && !email) return null;
  const rows = db.prepare('SELECT id, nombre, telefono, email FROM clientes ORDER BY id').all();
  for (const row of rows) {
    if (Number(row.id) === Number(excludeId)) continue;
    if (phone && phoneKey(row.telefono) === phone) {
      return { id: row.id, nombre: row.nombre, campo: 'teléfono' };
    }
    if (email && emailKey(row.email) === email) {
      return { id: row.id, nombre: row.nombre, campo: 'correo' };
    }
  }
  return null;
}
module.exports = { findClienteDuplicate, phoneKey, emailKey };
