export const fmtStock = (value, unit = 'u') =>
  `${Number(value || 0).toLocaleString('es-AR')} ${unit}`;
export const fmtMoney = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;
export const normalizeText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
