// Pequeño helper para generar variantes de un color de marca (hex) sin
// depender de una librería externa. Se usa para degradés/gradientes que
// antes tenían colores anaranjados hardcodeados sin relación con el color
// primario configurado en Configuración > Marca.

export function shadeColor(hex, percent) {
  const clean = String(hex || '')
    .trim()
    .replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;

  const num = parseInt(clean, 16);
  const amount = Math.round(2.55 * percent);

  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;

  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
