import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const BRAND = '#DC1F2D';
export const SUCCESS = '#13DEB9';
export const WARNING = '#FFAE1F';
export const INFO = '#49BEFF';
export const DANGER = '#FA896B';
export const GRAY = '#94A3B8';

export const PIE_COLORS = [BRAND, SUCCESS, INFO, WARNING, DANGER, '#7C3AED', '#F472B6'];

export const fmtNum = (value) => new Intl.NumberFormat('es-AR').format(Number(value || 0));
export const fmtDate = (value) =>
  value ? format(new Date(value), 'dd/MM/yy HH:mm', { locale: es }) : '-';
export const fmtDateShort = (value) =>
  value ? format(new Date(value), 'dd/MM', { locale: es }) : '-';
export const fmtWeekday = (value) =>
  format(new Date(`${value}T12:00:00`), 'EEE', { locale: es }).slice(0, 3);
export const classNames = (...classes) => classes.filter(Boolean).join(' ');
