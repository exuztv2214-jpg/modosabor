import axios from 'axios';

import { API_BASE_URL } from './runtime.js';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Offline check antes de cada request
api.interceptors.request.use(
  (config) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
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

    if (status === 401 && isProtectedAdminRoute) {
      window.location.href = '/admin';
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
