function parseArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Convierte los dos precios diarios en una variante normal del producto.
 * Web, TPV y validador de pedidos reciben exactamente la misma definición.
 */
function applyMenuDiaPricing(product = {}) {
  const economico = Math.max(0, Number(product.menu_dia_precio_economico || 0));
  const ejecutivo = Math.max(0, Number(product.menu_dia_precio_ejecutivo || 0));
  if (!economico && !ejecutivo) return product;

  const precios = [economico, ejecutivo].filter((value) => value > 0);
  const precioBase = Math.min(...precios);
  const variantes = parseArray(product.variantes).filter(
    (grupo) => !['tamano', 'porcion'].includes(normalize(grupo?.nombre))
  );

  if (economico && ejecutivo) {
    variantes.unshift({
      nombre: 'Tamaño',
      obligatorio: true,
      opciones: [
        { nombre: 'Económico', precio_extra: economico - precioBase },
        { nombre: 'Ejecutivo', precio_extra: ejecutivo - precioBase },
      ],
    });
  }

  return {
    ...product,
    precio: precioBase,
    menu_dia_tipo: economico ? 'economico' : 'ejecutivo',
    variantes: JSON.stringify(variantes),
  };
}

function applyMenuDiaPricingList(products = []) {
  return products.map(applyMenuDiaPricing);
}

/**
 * La disponibilidad del menú es una foto fechada, no una propiedad permanente
 * del producto. `menu_dia_disponible_hoy` se conserva en la tabla por
 * compatibilidad con pantallas viejas, pero puede quedar con el valor de ayer.
 *
 * Las consultas de catálogo traen la disponibilidad de la fecha actual bajo
 * `menu_dia_disponible_fecha`. Acá se transforma en el campo estable que ya
 * consumen Web y TPV, y se elimina el alias interno antes de responder.
 */
function applyMenuDiaSnapshotAvailability(product = {}) {
  const { menu_dia_disponible_fecha: disponibilidadDeLaFecha, ...cleanProduct } = product;
  const esMenuDelDia =
    normalize(product.categoria_nombre) === 'menu del dia' ||
    Number(product.menu_dia_base || 0) === 1 ||
    disponibilidadDeLaFecha !== undefined;

  if (!esMenuDelDia) return cleanProduct;

  return {
    ...cleanProduct,
    menu_dia_disponible_hoy: Number(disponibilidadDeLaFecha || 0) === 1 ? 1 : 0,
  };
}

function applyMenuDiaSnapshotAvailabilityList(products = []) {
  return products.map(applyMenuDiaSnapshotAvailability);
}

module.exports = {
  applyMenuDiaPricing,
  applyMenuDiaPricingList,
  applyMenuDiaSnapshotAvailability,
  applyMenuDiaSnapshotAvailabilityList,
};
