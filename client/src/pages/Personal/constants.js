import user1 from '../../image/profile/user-1.jpg';
import user2 from '../../image/profile/user-2.jpg';
import user3 from '../../image/profile/user-3.jpg';
import user4 from '../../image/profile/user-4.jpg';
import user5 from '../../image/profile/user-5.jpg';
import user6 from '../../image/profile/user-6.jpg';
import user7 from '../../image/profile/user-7.jpg';
import user8 from '../../image/profile/user-8.jpg';
import user9 from '../../image/profile/user-9.jpg';
import user10 from '../../image/profile/user-10.jpg';
import user11 from '../../image/profile/user-11.jpg';
import user12 from '../../image/profile/user-12.jpg';

export const AVATARS = [
  user1,
  user2,
  user3,
  user4,
  user5,
  user6,
  user7,
  user8,
  user9,
  user10,
  user11,
  user12,
];

export const ROLES = [
  { value: 'cocina', label: 'Cocina' },
  { value: 'cajero', label: 'Cajero' },
  { value: 'mozo', label: 'Mozo' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'ayudante', label: 'Ayudante' },
  { value: 'encargado', label: 'Encargado' },
];

export const TURNOS = [
  { value: 'manana', label: 'Mañana' },
  { value: 'noche', label: 'Noche' },
  { value: 'doble', label: 'Doble turno' },
];

export const FREQUENCY_OPTIONS = [
  { value: 'diario', label: 'Diario' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
];

export const PAYMENT_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'mercadopago', label: 'Mercado Pago' },
  { value: 'modo', label: 'Modo' },
  { value: 'uala', label: 'Uala' },
];

export const EMPTY_FORM = {
  nombre: '',
  rol_operativo: 'cocina',
  telefono: '',
  email: '',
  turno_preferido: 'manana',
  frecuencia_pago: 'mensual',
  monto_base: '',
  medio_pago_preferido: 'efectivo',
  activo: 1,
  notas: '',
  avatar_url: '',
  fecha_nacimiento: '',
  fecha_ingreso: new Date().toISOString().split('T')[0],
  direccion: '',
  categoria_id: 1,
  clock_pin: '',
};

export const EMPTY_MOVEMENT = {
  tipo: 'adelanto',
  descripcion: '',
  monto: '',
  insumo_id: '',
  cantidad_insumo: '',
  impacta_caja: 1,
};

export const MOVEMENT_TYPES = ['adelanto', 'descuento', 'consumo'];

export const EMPTY_SETTLEMENT = {
  unidades: '1',
  metodo_pago: 'efectivo',
  periodo_desde: '',
  periodo_hasta: '',
  notas: '',
  impacta_caja: 1,
};

export const EMPTY_ATTENDANCE = {
  estado: 'presente',
  notas: '',
};

export const EMPTY_GOAL = {
  fecha_desde: new Date().toISOString().split('T')[0],
  fecha_hasta: new Date().toISOString().split('T')[0],
  tipo: 'general',
  objetivo: '',
  progreso: '',
  unidad: 'u',
  premio_puntos: '0',
  premio_monto: '',
  notas: '',
};

export const EMPTY_PRODUCT_CONSUMPTION = {
  producto_id: '',
  cantidad: '1',
  descuento_empleado_pct: '20',
  descripcion: '',
};

export const EMPTY_WEEKLY_EDITOR = {
  fecha_operativa: '',
  estado: 'presente',
  ingreso_en: '',
  salida_en: '',
  notas: '',
  turno_id: '',
};

export const todayIso = new Date().toISOString().split('T')[0];

export const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 outline-none transition-all focus:border-primary-500 focus:ring-4 focus:ring-[#5D87FF]/10 hover:border-gray-300';

export const fmt = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;
