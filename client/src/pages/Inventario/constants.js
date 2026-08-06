export const EMPTY_INSUMO = {
  nombre: '',
  rubro: 'General',
  unidad: 'u',
  stock_actual: 0,
  stock_minimo: 0,
  costo_unitario: 0,
  activo: 1,
};

export const EMPTY_ROW = {
  insumo_id: '',
  cantidad: '',
  condicion_tipo: 'siempre',
  condicion_grupo: '',
  condicion_valor: '',
};

export const UNITS = ['u', 'kg', 'g', 'lts', 'ml', 'porcion', 'caja'];

export const RUBROS = [
  'General',
  'Verduleria',
  'Fiambreria',
  'Almacen',
  'Carniceria',
  'Envases',
  'Limpieza',
  'Bebidas',
  'Panaderia',
  'Lacteos',
  'Congelados',
  'Especias',
  'Descartables',
];

// Debe coincidir con el tope aplicado en server/routes/inventario.js (GET /movimientos)
export const MOVIMIENTOS_LIMIT = 300;

export const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';
