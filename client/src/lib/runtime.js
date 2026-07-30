const RAW_API_URL = String(import.meta.env.VITE_API_URL || '')
  .trim()
  .replace(/\/$/, '');

// In local dev we prefer the Vite proxy to avoid hardcoding a backend port here.
export const API_ORIGIN = RAW_API_URL || '';

export const API_BASE_URL = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';
export const SOCKET_URL = API_ORIGIN || undefined;
export const UPLOADS_BASE_URL = API_ORIGIN || '';
