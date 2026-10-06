import axios from 'axios';

import { API_BASE_URL } from './runtime.js';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Son las únicas lecturas que el service worker puede resolver desde una
// copia segura del catálogo. No se habilitan pedidos, caja, clientes ni
// productos completos: esas acciones siguen fallando sin red hasta que exista
// una cola idempotente en la siguiente etapa.
function esLecturaCatalogoOffline(config) {
  if (String(config?.method || 'get').toLowerCase() !== 'get') return false;
  const path = String(config?.url || '')
    .split('?')[0]
    .replace(/\/$/, '');
  return path === '/categorias' || path === '/productos/catalogo-tpv';
}

// Offline check antes de cada request
api.interceptors.request.use(
  (config) => {
    if (
      typeof navigator !== 'undefined' &&
      !navigator.onLine &&
      !esLecturaCatalogoOffline(config)
    ) {
      return Promise.reject({ error: 'Sin conexión a internet', offline: true });
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status;
    const pathname = window.location.pathname || '/';
    // Sólo las rutas del panel protegido (/admin/algo) deben forzar el
    // redirect al login cuando la sesión no es válida. La web pública
    // ("/"), el club de fidelidad, el seguimiento de pedido, el reloj de
    // personal y el panel de riders son rutas anónimas por diseño: un 401
    // ahí (por ejemplo, un visitante sin sesión de admin) no debe mandar
    // a nadie a /admin.
    const isProtectedAdminRoute = pathname.startsWith('/admin/');
    const isMasivosRoute = pathname === '/masivos' || pathname.startsWith('/masivos/');
    const isSocialRoute = pathname === '/social' || pathname.startsWith('/social/');
    const isMarketingLogin = /^\/(?:masivos|social)\/admin\/?$/.test(pathname);

    if (
      status === 401 &&
      !isMarketingLogin &&
      (isProtectedAdminRoute || isMasivosRoute || isSocialRoute)
    ) {
      // Los paneles de Marketing son autónomos y tienen su propio login. Sin
      // este corte explícito una sesión vencida dejaba Social cargando para
      // siempre porque sus siete consultas iniciales recibían 401.
      window.location.href = isMasivosRoute
        ? '/masivos/admin'
        : isSocialRoute
          ? '/social/admin'
          : '/admin';
    }

    // Preserve status on the rejection so callers can inspect it
    const rejection = err.response?.data || err;
    if (rejection && typeof rejection === 'object' && status) {
      rejection._httpStatus = status;
    }
    return Promise.reject(rejection);
  }
);

export default api;
