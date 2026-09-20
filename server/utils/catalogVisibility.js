const { getCurrentShiftInfo } = require('./shifts');

function categoriasVisibles(db, date = new Date()) {
  const config = Object.fromEntries(
    db
      .prepare('SELECT clave, valor FROM configuracion')
      .all()
      .map((r) => [r.clave, r.valor])
  );
  const turno = getCurrentShiftInfo(config, date).turno_actual?.id;
  // Cerrado: conservar la consulta de la carta completa. La apertura se valida al pedir.
  return new Set(
    db
      .prepare('SELECT id, activo, turno_id FROM categorias')
      .all()
      .filter((c) => Number(c.activo) === 1 && (!turno || !c.turno_id || c.turno_id === turno))
      .map((c) => Number(c.id))
  );
}
function filtrarCatalogo(db, productos) {
  const ids = categoriasVisibles(db);
  return productos.filter(
    (p) => Number(p.activo) === 1 && (!p.categoria_id || ids.has(Number(p.categoria_id)))
  );
}
function validarCatalogoPedido(db, items) {
  const ids = categoriasVisibles(db);
  const buscar = db.prepare('SELECT nombre, activo, categoria_id FROM productos WHERE id=?');
  for (const item of items) {
    const id = Number(item.producto_id || item.id || 0);
    if (!id) continue; // El TPV admite ítems manuales; no se les inventa una categoría.
    const producto = buscar.get(id);
    if (
      producto &&
      (Number(producto.activo) !== 1 ||
        (producto.categoria_id && !ids.has(Number(producto.categoria_id))))
    ) {
      throw new Error(
        `"${producto.nombre}" no está disponible en esta categoría o turno. Actualizá el catálogo.`
      );
    }
  }
}
module.exports = { categoriasVisibles, filtrarCatalogo, validarCatalogoPedido };
