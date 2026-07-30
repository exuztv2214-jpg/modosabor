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

function formatDateSafely(dateStr, formatStr) {
  if (!dateStr) return '-';
  const date = parseISO(dateStr);
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
      } catch {
        setAuditLogs([]);
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
    } catch {
      toast.error('Error al actualizar avatar');
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
    } catch {
      toast.error('Error al subir imagen');
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
        <div className="h-40 w-full bg-gradient-to-r from-primary-500 via-[#49BEFF] to-success-500" />

        <div className="px-8 pb-6">
          <div className="flex flex-col md:flex-row items-center justify-between -mt-12 gap-6">
            <div className="flex items-center gap-8 order-2 md:order-1">
              <div className="text-center">
                <Users className="mx-auto mb-1 text-gray-400" size={20} />
                <p className="text-lg font-black text-gray-900 leading-none">{permisos.length}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter mt-1">
                  Permisos
                </p>
              </div>
              <div className="text-center">
                <History className="mx-auto mb-1 text-gray-400" size={20} />
                <p className="text-lg font-black text-gray-900 leading-none">{auditLogs.length}</p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter mt-1">
                  Actividad
                </p>
              </div>
              <div className="text-center">
                <Calendar className="mx-auto mb-1 text-gray-400" size={20} />
                <p className="text-lg font-black text-gray-900 leading-none">
                  {formatDateSafely(user?.creado_en, 'MM/yy')}
                </p>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter mt-1">
                  Alta
                </p>
              </div>
            </div>

            <div className="relative order-1 md:order-2 flex flex-col items-center">
              <div className="h-28 w-28 rounded-full border-[6px] border-white shadow-xl bg-primary-500 overflow-hidden flex items-center justify-center font-black text-4xl text-white group">
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
                <h2 className="text-2xl font-black text-gray-900 leading-tight uppercase">
                  {user?.nombre}
                </h2>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                  {user?.rol || 'Administrador'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 order-3">
              <button
                onClick={() => setShowAvatarPicker(true)}
                className="h-10 px-6 rounded-2xl bg-primary-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-primary-100 hover:bg-primary-600 transition-all active:scale-95"
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
                className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-500'
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
            <h3 className="text-lg font-black text-gray-900 mb-6 uppercase tracking-tight">
              Resumen
            </h3>
            <p className="text-sm text-gray-500 leading-relaxed font-medium">
              Desde aquí puedes actualizar tus datos, cambiar la contraseña y revisar tu actividad
              reciente dentro del sistema.
            </p>
            <div className="mt-8 space-y-5">
              <div className="flex items-center gap-4 text-gray-600 font-bold">
                <div className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
                  <Briefcase size={18} />
                </div>
                <span className="text-sm uppercase tracking-tight">
                  {user?.rol || 'Administrador'}
                </span>
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
                <span className="text-sm uppercase tracking-tight">
                  Desde {formatDateSafely(user?.creado_en, 'MMMM yyyy')}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100">
            <h3 className="text-lg font-black text-gray-900 mb-6 uppercase tracking-tight">
              Cuenta actual
            </h3>
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-primary-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Nombre
                </p>
                <p className="mt-1 text-sm font-bold text-gray-900">{user?.nombre || '-'}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-primary-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Email
                </p>
                <p className="mt-1 text-sm font-bold text-gray-900 break-all">
                  {user?.email || '-'}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-primary-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Permisos
                </p>
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
                  <div className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
                    <Settings size={20} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                    Datos de mi cuenta
                  </h3>
                </div>

                <form onSubmit={guardarPerfil} className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Nombre
                    </label>
                    <input
                      value={profileForm.nombre}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, nombre: e.target.value }))
                      }
                      className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                      placeholder="Tu nombre"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                      className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                      placeholder="tuemail@modosabor.com"
                    />
                  </div>
                  <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-primary-50 px-4 py-4 border border-blue-50">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                        Rol actual
                      </p>
                      <p className="mt-1 text-sm font-bold text-gray-900">
                        {user?.rol || 'Administrador'}
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="h-12 px-8 rounded-2xl bg-primary-500 text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-primary-100 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : 'Guardar perfil'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-8">
                  <div className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
                    <FileText size={20} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                    Mis permisos
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {permisos.map((p) => (
                    <span
                      key={p}
                      className="px-4 py-2 rounded-xl bg-gray-50 border border-gray-100 text-primary-500 font-black text-[10px] uppercase tracking-widest"
                    >
                      {p.replace('.', ' / ')}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100">
                <div className="flex items-center gap-3 mb-8">
                  <div className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
                    <LayoutGrid size={20} />
                  </div>
                  <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                    Resumen de la cuenta
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-gray-100 bg-primary-50 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Rol
                    </p>
                    <p className="mt-2 text-lg font-black text-gray-900 uppercase">
                      {user?.rol || 'Admin'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-primary-50 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Permisos
                    </p>
                    <p className="mt-2 text-lg font-black text-gray-900">{permisos.length}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-primary-50 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Alta
                    </p>
                    <p className="mt-2 text-lg font-black text-gray-900">
                      {formatDateSafely(user?.creado_en, 'MMM yyyy')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'seguridad' && (
            <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-xl font-black text-gray-900 mb-8 uppercase tracking-tight">
                Seguridad de la cuenta
              </h3>
              <form onSubmit={guardarPassword} className="space-y-6 max-w-md">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Contraseña actual
                  </label>
                  <input
                    type="password"
                    value={passwordActual}
                    onChange={(e) => setPasswordActual(e.target.value)}
                    className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    value={passwordNuevo}
                    onChange={(e) => setPasswordNuevo(e.target.value)}
                    className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="Minimo 6 caracteres"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Confirmar nueva
                  </label>
                  <input
                    type="password"
                    value={passwordConfirmacion}
                    onChange={(e) => setPasswordConfirmacion(e.target.value)}
                    className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="••••••••"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-14 w-full rounded-2xl bg-primary-500 text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-primary-100 active:scale-95 transition-all disabled:opacity-50"
                >
                  {saving ? '...' : 'Actualizar credenciales'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'actividad' && (
            <div className="rounded-[24px] bg-white p-8 shadow-sm border border-gray-100 animate-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-xl font-black text-gray-900 mb-8 uppercase tracking-tight">
                Registro de actividad
              </h3>
              <div className="space-y-4">
                {auditLogs.length > 0 ? (
                  auditLogs.slice(0, 10).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 border border-gray-100"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-primary-500 shadow-sm">
                          <Clock size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-800 uppercase tracking-tight">
                            {log.accion}
                          </p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase">
                            {log.modulo} · {format(parseISO(log.creado_en), 'HH:mm')} hs
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black text-gray-300 uppercase">
                        {format(parseISO(log.creado_en), 'dd MMM')}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-gray-400 font-bold uppercase tracking-widest opacity-40">
                    Sin actividad reciente
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAvatarPicker && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[40px] bg-white p-10 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between mb-8 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-1 bg-primary-500 rounded-full"></div>
                  <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em]">
                    Identidad visual
                  </p>
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
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
                className="group aspect-square rounded-[32px] border-4 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 hover:border-primary-500 hover:bg-primary-50 transition-all"
              >
                <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-primary-500 group-hover:text-white transition-all">
                  <Camera size={24} />
                </div>
                <span className="text-[10px] font-black uppercase text-gray-400 group-hover:text-primary-500">
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
                  className={`relative aspect-square rounded-[32px] overflow-hidden border-4 transition-all hover:scale-105 ${user?.avatar === av ? 'border-primary-500 shadow-lg shadow-primary-100' : 'border-transparent opacity-70 hover:opacity-100'}`}
                >
                  <img src={av} className="w-full h-full object-cover" alt={`avatar-${idx}`} />
                  {user?.avatar === av && (
                    <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center">
                      <div className="bg-white rounded-full p-1 text-primary-500 shadow-md">
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
                className="h-14 px-10 rounded-2xl border border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 active:scale-95 transition-all"
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
