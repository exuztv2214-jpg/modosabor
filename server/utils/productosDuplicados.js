function normalizarNombreProducto(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function buscarProductoActivoDuplicado(db, { nombre, categoriaId, excluirId = null } = {}) {
  const normalizado = normalizarNombreProducto(nombre);
  if (!normalizado || !Number(categoriaId)) return null;

  const candidatos = db
    .prepare(
      `SELECT id, nombre, categoria_id
         FROM productos
        WHERE activo = 1
          AND categoria_id = ?
          AND (? IS NULL OR id <> ?)`
    )
    .all(Number(categoriaId), excluirId, excluirId);

  return (
    candidatos.find((producto) => normalizarNombreProducto(producto.nombre) === normalizado) || null
  );
}

function asegurarNombreProductoUnico(db, options = {}) {
  const duplicado = buscarProductoActivoDuplicado(db, options);
  if (!duplicado) return;
  const error = new Error(
    `Ya existe un producto activo llamado "${duplicado.nombre}" en esta categoría`
  );
  error.code = 'PRODUCTO_DUPLICADO';
  error.productoId = duplicado.id;
  throw error;
}

module.exports = {
  normalizarNombreProducto,
  buscarProductoActivoDuplicado,
  asegurarNombreProductoUnico,
};
