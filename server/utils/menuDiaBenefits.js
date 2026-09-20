const INCLUDED = 'Incluye postre y bebida sin recargo.';
const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

// Amounts here are centavos, matching the database and operation routes.
function menuDiaBenefits(precio, extrasRaw, descripcion = '') {
  const amount = Number(precio);
  if (![500000, 700000, 900000].includes(amount)) return { extras: extrasRaw, descripcion };
  const extras = typeof extrasRaw === 'string' ? JSON.parse(extrasRaw || '[]') : extrasRaw || [];
  const retained = extras.filter(
    (e) =>
      !['postre', 'bebida + postre', 'postre + bebida', 'postre + bebidas'].includes(
        normalize(e.nombre)
      )
  );
  if (amount === 500000) retained.push({ nombre: 'Postre', precio: 100000 });
  if (amount === 700000) retained.push({ nombre: 'Bebida + Postre', precio: 100000 });
  // Remove the legacy inclusion claim when moving to a paid/optional offer.
  let text = String(descripcion || '')
    .replace(/Incluye postre y bebida(?: sin recargo)?\.?/gi, '')
    .replace(/con bebida y postre incluida\.?/gi, '')
    .trim();
  if (amount === 900000) text = [text, INCLUDED].filter(Boolean).join('\n');
  return { extras: JSON.stringify(retained), descripcion: text };
}

module.exports = { menuDiaBenefits, INCLUDED };
