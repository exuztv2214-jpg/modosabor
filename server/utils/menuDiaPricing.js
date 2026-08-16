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

module.exports = { applyMenuDiaPricing, applyMenuDiaPricingList };
