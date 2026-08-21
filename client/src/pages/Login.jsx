import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import api from '../lib/api.js';

export default function Login({ redirectTo = '/admin/dashboard', panelTitle, panelSubtitle }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, isAuth } = useAuth();
  const { config } = useAppConfig();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuth) {
      navigate(redirectTo, { replace: true });
    }
  }, [isAuth, navigate, redirectTo]);

  if (isAuth) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', form);
      login(res.user);
      navigate(redirectTo);
    } catch (err) {
      console.error('Login error:', err);
      const msg =
        err?.error ||
        (err?.code === 'ERR_NETWORK' || !err?.response
          ? 'Error de conexión con el servidor'
          : 'Credenciales incorrectas');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decoracion de fondo estilo Modernize */}
      <div className="absolute top-[-10%] right-[-10%] w-[400px] h-[400px] bg-brand-100 rounded-full blur-3xl opacity-50"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-orange-100 rounded-full blur-3xl opacity-50"></div>

      <div className="w-full max-w-[450px] z-10">
        {/* Card Principal */}
        <div className="bg-white rounded-[32px] p-8 md:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-gray-100">
          {/* Header con Logo */}
          <div className="text-center mb-10">
            {config?.negocio_logo ? (
              <img
                src={config.negocio_logo}
                alt="Logo"
                className="h-16 mx-auto mb-4 object-contain"
              />
            ) : (
              <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-50 rounded-2xl mb-4">
                <span className="text-brand-600 font-semibold text-2xl">M</span>
              </div>
            )}
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              {panelTitle || config?.negocio_nombre || 'Modo Sabor'}
            </h1>
            <p className="text-gray-400 text-sm mt-1 font-medium italic">
              {panelSubtitle || 'Panel de administración'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Input Email */}
            <div className="space-y-2">
              <label
                htmlFor="field-Login-jsx-77-0"
                className="text-xs font-bold text-gray-700 ml-1"
              >
                Email
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <Mail size={18} />
                </div>
                <input
                  id="field-Login-jsx-77-0"
                  type="email"
                  autoComplete="username"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="admin@modosabor.com"
                  className="w-full bg-gray-50 border-none rounded-2xl px-12 py-4 text-sm font-medium focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all outline-none"
                  required
                />
              </div>
            </div>

            {/* Input Password */}
            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label htmlFor="field-Login-jsx-97-1" className="text-xs font-bold text-gray-700">
                  Contraseña
                </label>
              </div>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <Lock size={18} />
                </div>
                <input
                  id="field-Login-jsx-97-1"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-gray-50 border-none rounded-2xl px-12 py-4 text-sm font-medium focus:ring-2 focus:ring-brand-500/20 focus:bg-white transition-all outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-brand-600 transition-colors"
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Boton Ingresar */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-50 text-sm shadow-[0_8px_20px_rgba(220,31,45,0.25)] hover:shadow-[0_8px_25px_rgba(220,31,45,0.35)] active:scale-[0.98]"
            >
              {loading ? 'Validando...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Seccion Informativa */}
          <div className="mt-10 pt-8 border-t border-gray-50">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="h-[1px] w-8 bg-gray-100"></div>
              <span className="text-[10px] font-bold text-gray-300 px-2">Acceso</span>
              <div className="h-[1px] w-8 bg-gray-100"></div>
            </div>
            <div className="bg-brand-50/50 rounded-2xl p-4 text-center border border-brand-100/50">
              <p className="text-[11px] text-brand-600 font-bold leading-relaxed">
                Ingresá con un usuario activo del sistema.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-[11px] font-bold text-gray-400">
            © 2026 {config?.negocio_nombre || 'Modo Sabor'} · Gestión Inteligente
          </p>
        </div>
      </div>
    </div>
  );
}
