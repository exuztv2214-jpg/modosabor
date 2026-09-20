export function categoriaVisible(categoria, config) {
  const turno = config?.turno_actual?.id;
  return (
    Number(categoria.activo) === 1 &&
    (!turno || !categoria.turno_id || categoria.turno_id === turno)
  );
}
export function filtrarCatalogo(productos, categorias, config) {
  const ids = new Set(
    categorias.filter((c) => categoriaVisible(c, config)).map((c) => Number(c.id))
  );
  return productos.filter(
    (p) => Number(p.activo) === 1 && (!p.categoria_id || ids.has(Number(p.categoria_id)))
  );
}
export function claveSubcategoria(producto) {
  return producto.subcategoria
    ? JSON.stringify([Number(producto.categoria_id), producto.subcategoria])
    : '';
}
