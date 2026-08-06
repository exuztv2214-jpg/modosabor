import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Briefcase,
  Calendar,
  Camera,
  Check,
  Clock,
  FileText,
  History,
  LayoutGrid,
  Lock,
  Mail,
  Settings,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { format, isValid, parseISO } from 'date-fns';

import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api.js';
import { Z } from '../lib/theme.js';
import user1 from '../image/profile/user-1.jpg';
import user2 from '../image/profile/user-2.jpg';
import user3 from '../image/profile/user-3.jpg';
import user4 from '../image/profile/user-4.jpg';
import user5 from '../image/profile/user-5.jpg';
import user6 from '../image/profile/user-6.jpg';
import user7 from '../image/profile/user-7.jpg';
import user8 from '../image/profile/user-8.jpg';
import user9 from '../image/profile/user-9.jpg';
import user10 from '../image/profile/user-10.jpg';
import user11 from '../image/profile/user-11.jpg';
import user12 from '../image/profile/user-12.jpg';

const AVATARS = [
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

const TABS = [
  { id: 'perfil', label: 'Perfil', icon: UserRound },
  { id: 'seguridad', label: 'Seguridad', icon: Lock },
  { id: 'actividad', label: 'Actividad', icon: History },
];

// Las fechas que vienen de la base a veces llegan como "2026-08-06 14:30:00"
// (espacio en vez de "T"), formato que `parseISO` no reconoce como válido y
// devuelve Invalid Date. Antes esto no se validaba en el registro de
// actividad: `format(parseISO(...))` con una fecha inválida tira RangeError
// y rompe el render de toda la pestaña. Se centraliza acá con normalización
// y guarda de validez.
function formatDateSafely(dateStr, formatStr) {
  if (!dateStr) return '-';
  const date = parseISO(String(dateStr).replace(' ', 'T'));
  return isValid(date) ? format(date, formatStr) : '-';
}

export default function Cuenta() {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState('perfil');
  const [profileForm, setProfileForm] = useState({ nombre: '', email: '' });
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNuevo, setPasswordNuevo] = useState('');
  const [passwordConfirmacion, setPasswordConfirmacion] = useState('');
  const [saving, setSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const fileInputRef = useRef(null);

  const permisos = useMemo(() => user?.permissions || [], [user]);

  useEffect(() => {
    setProfileForm({
      nombre: user?.nombre || '',
      email: user?.email || '',
    });
  }, [user?.nombre, user?.email]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await api.get('/auth/me/activity');
        setAuditLogs(Array.isArray(response) ? response : []);
      } catch (error) {
        setAuditLogs([]);
        toast.error(error?.error || 'No se pudo cargar el registro de actividad');
      }
    };
    if (activeTab === 'actividad') fetchLogs();
  }, [activeTab]);

  const updateAvatar = async (url) => {
    setSaving(true);
    try {
      await api.put('/auth/me/avatar', { avatar: url });
      await refreshUser();
      toast.success('Avatar actualizado');
      setShowAvatarPicker(false);
    } catch (error) {
      toast.error(error?.error || 'Error al actualizar avatar');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('imagen', file);
    setSaving(true);
    try {
      const res = await api.post('/productos/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await updateAvatar(res.url);
    } catch (error) {
      toast.error(error?.error || 'Error al subir imagen');
    } finally {
      setSaving(false);
    }
  };

  const guardarPerfil = async (e) => {
    e.preventDefault();
    if (!profileForm.nombre.trim() || !profileForm.email.trim()) {
      toast.error('Nombre y email son obligatorios');
      return;
    }
    setSaving(true);
    try {
      await api.put('/auth/me', {
        nombre: profileForm.nombre.trim(),
        email: profileForm.email.trim(),
      });
      await refreshUser();
      toast.success('Perfil actualizado');
    } catch (err) {
      toast.error(err?.error || 'No se pudo actualizar el perfil');
    } finally {
      setSaving(false);
    }
  };

  const guardarPassword = async (e) => {
    e.preventDefault();
    if (passwordNuevo.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (passwordNuevo !== passwordConfirmacion) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setSaving(true);
    try {
      await api.put('/auth/password', {
        password_actual: passwordActual,
        password_nuevo: passwordNuevo,
      });
      setPasswordActual('');
      setPasswordNuevo('');
      setPasswordConfirmacion('');
      toast.success('Contraseña actualizada');
    } catch (err) {
      toast.error(err?.error || 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <div className="rounded-[24px] bg-white overflow-hidden shadow-sm border border-gray-100">
        <div className="h-40 w-full bg-gradient-to-r from-[#DC1F2D] to-[#B91C2A]" />

        <div className="px-8 pb-6">
          <div className="flex flex-col md:flex-row items-center justify-between -mt-12 gap-6">
            <div className="flex items-center gap-8 order-2 md:order-1">
              <div className="text-center">
                <Users className="mx-auto mb-1 text-gray-400" size={20} />
                <p className="text-lg font-semibold text-gray-900 leading-none">
                  {permisos.length}
                </p>
                <p className="text-xs font-bold text-gray-400 mt-1">Permisos</p>
              </div>
              <div className="text-center">
                <History className="mx-auto mb-1 text-gray-400" size={20} />
                <p className="text-lg font-semibold text-gray-900 leading-none">
                  {auditLogs.length}
                </p>
                <p className="text-xs font-bold text-gray-400 mt-1">Actividad</p>
              </div>
              <div className="text-center">
                <Calendar className="mx-auto mb-1 text-gray-400" size={20} />
                <p className="text-lg font-semibold text-gray-900 leading-none">
                  {formatDateSafely(user?.creado_en, 'MM/yy')}
                </p>
                <p className="text-xs font-bold text-gray-400 mt-1">Alta</p>
              </div>
            </div>

            <div className="relative order-1 md:order-2 flex flex-col items-center">
              <div className="h-28 w-28 rounded-full border-[6px] border-white shadow-xl bg-[#DC1F2D] overflow-hidden flex items-center justify-center font-semibold text-4xl text-white group">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt="Avatar de usuario"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  user?.nombre?.[0]
                )}

                <button
                  onClick={() => setShowAvatarPicker(true)}
                  className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera className="text-white" size={24} />
                </button>
              </div>
              <div className="mt-3 text-center">
                <h2 className="text-2xl font-semibold text-gray-900 leading-tight">
                  {user?.nombre}
                </h2>
                <p className="text-sm font-bold text-gray-400">{user?.rol || 'Administrador'}</p>
              </div>
            </div>

            <div className="flex gap-2 order-3">
              <button
                onClick={() => setShowAvatarPicker(true)}
                className="h-10 px-6 rounded-2xl bg-[#DC1F2D] text-white text-xs font-semibold shadow-sm hover:bg-[#B91C2A] transition-all active:scale-95"
              >
                Cambiar avatar
              </button>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-center md:justify-start gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-xs font-semibold rounded-xl transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#FEF2F2] text-[#DC1F2D]'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Resumen</h3>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              Desde aquí puedes actualizar tus datos, cambiar la contraseña y revisar tu actividad
              reciente dentro del sistema.
            </p>
            <div className="mt-8 space-y-5">
              <div className="flex items-center gap-4 text-gray-600 font-bold">
                <div className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
                  <Briefcase size={18} />
                </div>
                <span className="text-sm">{user?.rol || 'Administrador'}</span>
              </div>
              <div className="flex items-center gap-4 text-gray-600 font-bold">
                <div className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
                  <Mail size={18} />
                </div>
                <span className="text-sm lowercase break-all">{user?.email}</span>
              </div>
              <div className="flex items-center gap-4 text-gray-600 font-bold">
                <div className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
                  <Calendar size={18} />
                </div>
                <span className="text-sm">
                  Desde {formatDateSafely(user?.creado_en, 'MMMM yyyy')}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Cuenta actual</h3>
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-[#FEF2F2] p-4">
                <p className="text-[10px] font-semibold text-gray-400">Nombre</p>
                <p className="mt-1 text-sm font-bold text-gray-900">{user?.nombre || '-'}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-[#FEF2F2] p-4">
                <p className="text-[10px] font-semibold text-gray-400">Email</p>
                <p className="mt-1 text-sm font-bold text-gray-900 break-all">
                  {user?.email || '-'}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-[#FEF2F2] p-4">
                <p className="text-[10px] font-semibold text-gray-400">Permisos</p>
                <p className="mt-1 text-sm font-bold text-gray-900">{permisos.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          {activeTab === 'perfil' && (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-8">
                  <div className="h-10 w-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center text-[#DC1F2D]">
                    <Settings size={20} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Datos de mi cuenta</h3>
                </div>

                <form onSubmit={guardarPerfil} className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold text-gray-400 ml-1">Nombre</label>
                    <input
                      value={profileForm.nombre}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, nombre: e.target.value }))
                      }
                      className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-red-100 outline-none"
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold text-gray-400 ml-1">Email</label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-red-100 outline-none"
                      placeholder="tuemail@modosabor.com"
                    />
                  </div>
                  <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[#FEF2F2] px-4 py-4 border border-red-50">
                    <div>
                      <p className="text-xs font-semibold text-gray-500">Rol actual</p>
                      <p className="mt-1 text-sm font-bold text-gray-900">
                        {user?.rol || 'Administrador'}
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="h-12 px-8 rounded-2xl bg-[#DC1F2D] text-white text-sm font-semibold shadow-sm active:scale-95 transition-all disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : 'Guardar perfil'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-8">
                  <div className="h-10 w-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center text-[#DC1F2D]">
                    <FileText size={20} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Mis permisos</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {permisos.map((p) => (
                    <span
                      key={p}
                      className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-100 text-[#DC1F2D] font-semibold text-[10px]"
                    >
                      {p.replace('.', ' / ')}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-8">
                  <div className="h-10 w-10 rounded-xl bg-[#FEF2F2] flex items-center justify-center text-[#DC1F2D]">
                    <LayoutGrid size={20} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Resumen de la cuenta</h3>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-gray-100 bg-[#FEF2F2] p-5">
                    <p className="text-[10px] font-semibold text-gray-400">Rol</p>
                    <p className="mt-2 text-lg font-semibold text-gray-900">
                      {user?.rol || 'Admin'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-[#FEF2F2] p-5">
                    <p className="text-[10px] font-semibold text-gray-400">Permisos</p>
                    <p className="mt-2 text-lg font-semibold text-gray-900">{permisos.length}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-[#FEF2F2] p-5">
                    <p className="text-[10px] font-semibold text-gray-400">Alta</p>
                    <p className="mt-2 text-lg font-semibold text-gray-900">
                      {formatDateSafely(user?.creado_en, 'MMM yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'seguridad' && (
            <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-xl font-semibold text-gray-900 mb-8">Seguridad de la cuenta</h3>
              <form onSubmit={guardarPassword} className="space-y-6 max-w-md">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-gray-400 ml-1">
                    Contraseña actual
                  </label>
                  <input
                    type="password"
                    value={passwordActual}
                    onChange={(e) => setPasswordActual(e.target.value)}
                    className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-red-100 outline-none"
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-gray-400 ml-1">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    value={passwordNuevo}
                    onChange={(e) => setPasswordNuevo(e.target.value)}
                    className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-red-100 outline-none"
                    placeholder="Minimo 6 caracteres"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-gray-400 ml-1">
                    Confirmar nueva
                  </label>
                  <input
                    type="password"
                    value={passwordConfirmacion}
                    onChange={(e) => setPasswordConfirmacion(e.target.value)}
                    className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-red-100 outline-none"
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-14 w-full rounded-2xl bg-[#DC1F2D] text-white text-sm font-semibold shadow-sm active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving ? '...' : 'Actualizar credenciales'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'actividad' && (
            <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-xl font-semibold text-gray-900 mb-8">Registro de actividad</h3>
              <div className="space-y-4">
                {auditLogs.length > 0 ? (
                  auditLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-[#DC1F2D] shadow-sm">
                          <Clock size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{log.accion}</p>
                          <p className="text-[10px] font-bold text-gray-400">
                            {log.modulo} · {formatDateSafely(log.creado_en, 'HH:mm')} hs
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-gray-300">
                        {formatDateSafely(log.creado_en, 'dd MMM')}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-gray-400 font-bold opacity-40">
                    Sin actividad reciente
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAvatarPicker && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-md"
          style={{ zIndex: Z.modal }}
        >
          <div className="w-full max-w-2xl rounded-[40px] bg-white p-10 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between mb-8 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-1 bg-[#DC1F2D] rounded-full"></div>
                  <p className="text-xs font-semibold text-[#DC1F2D]">Identidad visual</p>
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 tracking-tight">
                  Elige tu avatar
                </h3>
              </div>
              <button
                onClick={() => setShowAvatarPicker(false)}
                className="rounded-full p-2 hover:bg-gray-100 transition-all text-gray-400"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 overflow-y-auto no-scrollbar pr-2 pb-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group aspect-square rounded-[32px] border-4 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 hover:border-[#DC1F2D] hover:bg-[#FEF2F2] transition-all"
              >
                <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-[#DC1F2D] group-hover:text-white transition-all">
                  <Camera size={24} />
                </div>
                <span className="text-[10px] font-semibold text-gray-400 group-hover:text-[#DC1F2D]">
                  Subir foto
                </span>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileUpload}
                />
              </button>

              {AVATARS.map((av, idx) => (
                <button
                  key={idx}
                  onClick={() => updateAvatar(av)}
                  className={`relative aspect-square rounded-[32px] overflow-hidden border-4 transition-all hover:scale-105 ${user?.avatar === av ? 'border-[#DC1F2D] shadow-sm' : 'border-transparent opacity-70 hover:opacity-100'}`}
                >
                  <img src={av} className="w-full h-full object-cover" alt={`avatar-${idx}`} />
                  {user?.avatar === av && (
                    <div className="absolute inset-0 bg-[#DC1F2D]/20 flex items-center justify-center">
                      <div className="bg-white rounded-full p-1 text-[#DC1F2D] shadow-md">
                        <Check size={16} strokeWidth={4} />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <div className="mt-8 flex justify-end shrink-0 pt-4 border-t border-gray-50">
              <button
                onClick={() => setShowAvatarPicker(false)}
                className="h-14 px-10 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-gray-50 active:scale-95 transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
