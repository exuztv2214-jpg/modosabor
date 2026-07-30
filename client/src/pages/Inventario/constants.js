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
  'h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 outline-none transition focus:border-primary-200 focus:bg-white focus:ring-4 focus:ring-blue-100';
