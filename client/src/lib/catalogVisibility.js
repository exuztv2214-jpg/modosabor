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

// El mostrador necesita poder vender durante la mañana productos que también
// se preparan de noche (empanadas, pizzas, lomitos, etc.). De noche sí se
// oculta el menú del día, porque ya no corresponde ofrecerlo.
export function categoriaVisibleEnTpv(categoria, config) {
  if (Number(categoria.activo) !== 1) return false;
  const turno = String(config?.turno_actual?.id || '').toLowerCase();
  if (turno !== 'noche') return true;
  return String(categoria.turno_id || '').toLowerCase() !== 'manana';
}

export function filtrarCatalogoTpv(productos, categorias, config) {
  const ids = new Set(
    categorias
      .filter((categoria) => categoriaVisibleEnTpv(categoria, config))
      .map((categoria) => Number(categoria.id))
  );
  return productos.filter(
    (producto) =>
      Number(producto.activo) === 1 &&
      Number(producto.disponible_para_venta ?? 1) === 1 &&
      (!producto.categoria_id || ids.has(Number(producto.categoria_id)))
  );
}
export function claveSubcategoria(producto) {
  return producto.subcategoria
    ? JSON.stringify([Number(producto.categoria_id), producto.subcategoria])
    : '';
}
