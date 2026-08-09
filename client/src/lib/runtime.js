import { Capacitor } from '@capacitor/core';

const RAW_API_URL = String(import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/$/, '');

// Dominio propio: el APK no queda atado al hostname interno del proveedor.
const NATIVE_DEFAULT_API_URL = 'https://modosabor.com.ar';
const IS_NATIVE_APP = Capacitor.isNativePlatform?.() === true;

// In local dev we prefer the Vite proxy to avoid hardcoding a backend port here.
export const API_ORIGIN = RAW_API_URL || (IS_NATIVE_APP ? NATIVE_DEFAULT_API_URL : '');

export const API_BASE_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';
export const SOCKET_URL = API_ORIGIN || undefined;
export const UPLOADS_BASE_URL = API_ORIGIN || '';
