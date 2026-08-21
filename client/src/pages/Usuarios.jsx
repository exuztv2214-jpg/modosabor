import { Fragment, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, ShieldCheck, Plus, Pencil, Save, UserCog, X } from 'lucide-react';

import api from '../lib/api.js';
import { ROLE_PERMISSIONS } from '../lib/permissions.js';
import { Z } from '../lib/theme.js';

const EMPTY_FORM = {
  nombre: '',
  email: '',
  password: '',
  rol: 'caja',
  activo: true,
};

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'caja', label: 'Caja' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'mozo', label: 'Mozo (app de comandas)' },
];

const PERMISSION_GROUPS = [
  {
    grupo: 'Dashboard',
    permisos: [{ key: 'dashboard.view', label: 'Ver dashboard' }],
  },
  {
    grupo: 'Pedidos',
    permisos: [
      { key: 'pedidos.view', label: 'Ver pedidos' },
      { key: 'pedidos.edit', label: 'Editar pedidos' },
      { key: 'pedidos.kitchen', label: 'Gestión cocina (KDS)' },
      { key: 'pedidos.print', label: 'Imprimir pedidos' },
    ],
  },
  {
    grupo: 'TPV / Caja',
    permisos: [
      { key: 'tpv.use', label: 'Usar TPV' },
      { key: 'caja.view', label: 'Ver caja' },
      { key: 'caja.manage', label: 'Gestionar caja' },
    ],
  },
  {
    grupo: 'Mesas',
    permisos: [{ key: 'mesas.view', label: 'Ver mesas' }],
  },
  {
    grupo: 'Mozo',
    permisos: [{ key: 'mozo.use', label: 'Usar app de comandas' }],
  },
  {
    grupo: 'Clientes',
    permisos: [
      { key: 'clientes.view', label: 'Ver clientes' },
      { key: 'clientes.edit', label: 'Editar clientes' },
    ],
  },
  {
    grupo: 'Delivery',
    permisos: [
      { key: 'delivery.view', label: 'Ver delivery' },
      { key: 'delivery.manage', label: 'Gestionar delivery' },
    ],
  },
  {
    grupo: 'KDS',
    permisos: [{ key: 'kds.view', label: 'Ver KDS' }],
  },
  {
    grupo: 'Reportes',
    permisos: [{ key: 'reportes.view', label: 'Ver reportes' }],
  },
  {
    grupo: 'Marketing',
    permisos: [
      { key: 'marketing.view', label: 'Ver Marketing' },
      { key: 'marketing.edit', label: 'Gestionar Marketing y WhatsApp' },
    ],
  },
  {
    grupo: 'Configuración',
    permisos: [
      { key: 'configuracion.view', label: 'Ver configuración' },
      { key: 'config.manage', label: 'Gestionar sistema (admin)' },
    ],
  },
];

function hasRolePerm(rol, permKey) {
  const perms = ROLE_PERMISSIONS[rol];
  if (Array.isArray(perms) && perms.includes('*')) return true;
  return Array.isArray(perms) && perms.includes(permKey);
}

function RolePermissionsMatrix() {
  const [expanded, setExpanded] = useState(false);
  const roles = ['admin', 'caja', 'cocina', 'delivery', 'mozo'];
  const roleLabels = {
    admin: 'Admin',
    caja: 'Caja',
    cocina: 'Cocina',
    delivery: 'Delivery',
    mozo: 'Mozo',
  };

  return (
    <div className="rounded-xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between p-6 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div>
          <h3 className="text-lg font-bold text-gray-900">Matriz de Permisos por Rol</h3>
          <p className="text-sm font-medium text-gray-500">
            Visualizá qué acciones tiene habilitada cada perfil.
          </p>
        </div>
        {expanded ? (
          <ChevronUp size={20} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronDown size={20} className="text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-bold text-gray-500 min-w-[200px]">
                  Permiso
                </th>
                {roles.map((r) => (
                  <th key={r} className="px-4 py-3 text-center text-[11px] font-bold text-gray-500">
                    {roleLabels[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_GROUPS.map((group) => (
                // Antes era un fragmento `<>` sin key dentro de un .map(): React no
                // podía identificar cada grupo de forma estable al reconciliar, lo
                // que generaba el warning "each child in a list should have a
                // unique key" y arriesgaba mezclar filas entre re-renders.
                <Fragment key={group.grupo}>
                  <tr className="bg-gray-50/60">
                    <td colSpan={5} className="px-5 py-2 text-[10px] font-semibold text-gray-400">
                      {group.grupo}
                    </td>
                  </tr>
                  {group.permisos.map((perm) => (
                    <tr
                      key={perm.key}
                      className="border-b border-gray-50 hover:bg-gray-50/40 transition-colors"
                    >
                      <td className="px-5 py-3 text-sm font-medium text-gray-700">{perm.label}</td>
                      {roles.map((r) => {
                        const has = hasRolePerm(r, perm.key);
                        return (
                          <td key={r} className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold mx-auto ${
                                has
                                  ? 'bg-emerald-100 text-emerald-600'
                                  : 'bg-gray-100 text-gray-300'
                              }`}
                            >
                              {has ? '✓' : '—'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 outline-none transition-all focus:border-[#DC1F2D] focus:ring-4 focus:ring-[#DC1F2D]/10 hover:border-gray-300';

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const cargar = async () => {
    setLoading(true);
    try {
      const rows = await api.get('/auth/usuarios');
      setUsuarios(rows);
    } catch (error) {
      toast.error(error?.error || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const abrirNuevo = () => {
    setForm(EMPTY_FORM);
    setModal('nuevo');
  };

  const abrirEditar = (usuario) => {
    setForm({
      nombre: usuario.nombre || '',
      email: usuario.email || '',
      password: '',
      rol: usuario.rol || 'caja',
      activo: Boolean(usuario.activo),
    });
    setModal(usuario);
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !form.email.trim()) {
      toast.error('Nombre y email son obligatorios');
      return;
    }
    if (modal === 'nuevo' && !form.password.trim()) {
      toast.error('La contraseña inicial es obligatoria');
      return;
    }

    setSaving(true);
    try {
      if (modal === 'nuevo') {
        await api.post('/auth/usuarios', {
          nombre: form.nombre,
          email: form.email,
          password: form.password,
          rol: form.rol,
        });
        toast.success('Usuario creado');
      } else {
        await api.put(`/auth/usuarios/${modal.id}`, {
          nombre: form.nombre,
          email: form.email,
          password: form.password || undefined,
          rol: form.rol,
          activo: form.activo,
        });
        toast.success('Usuario actualizado');
      }
      setModal(null);
      setForm(EMPTY_FORM);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar el usuario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Usuarios y Accesos</h1>
          <p className="text-sm font-medium text-gray-500">
            Controla accesos por perfil para caja, cocina, mozos, delivery y administración.
          </p>
        </div>
        <button
          onClick={abrirNuevo}
          className="flex h-11 items-center gap-2 rounded-xl bg-[#DC1F2D] text-white px-5 text-sm font-bold shadow-lg shadow-[#DC1F2D]/20 hover:bg-[#B91C2A] transition-all"
        >
          <Plus size={18} strokeWidth={2.5} />
          Nuevo Usuario
        </button>
      </div>

      {/* Main Content */}
      <div className="rounded-xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 bg-gray-50/30">
          <h3 className="text-lg font-bold text-gray-900">Listado de Usuarios</h3>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-xl bg-gray-50 border border-gray-100"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {usuarios.map((usuario) => (
                <div
                  key={usuario.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white hover:border-[#DC1F2D]/30 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#DC1F2D]">
                      <UserCog size={22} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{usuario.nombre}</p>
                      <p className="text-xs font-semibold text-gray-400 truncate">
                        {usuario.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end gap-1">
                      <span className="px-2.5 py-0.5 rounded-lg bg-gray-100 text-[10px] font-bold text-gray-600">
                        {usuario.rol}
                      </span>
                      <span
                        className={`text-[10px] font-bold ${
                          usuario.activo ? 'text-emerald-500' : 'text-rose-500'
                        }`}
                      >
                        {usuario.activo ? '● ACTIVO' : '○ INACTIVO'}
                      </span>
                    </div>
                    <button
                      onClick={() => abrirEditar(usuario)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg bg-gray-50 text-gray-400 hover:bg-[#FEF2F2] hover:text-[#DC1F2D] transition-all"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {usuarios.length === 0 && (
                <div className="md:col-span-2 py-12 text-center text-gray-400 italic">
                  No se encontraron usuarios registrados.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Role Permissions Matrix */}
      <RolePermissionsMatrix />

      {/* Modal Form */}
      {modal && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
          }}
          className="fixed inset-0 flex items-center justify-center bg-[#2A3547]/40 p-4 backdrop-blur-sm"
          style={{ zIndex: Z.modal }}
          onClick={() => setModal(null)}
        >
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
            }}
            className="w-full max-w-xl rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-[#FEF2F2] flex items-center justify-center text-[#DC1F2D]">
                  <ShieldCheck size={20} />
                </div>
                <h2 className="text-xl font-bold text-gray-900">
                  {modal === 'nuevo' ? 'Crear Nuevo Usuario' : 'Editar Usuario'}
                </h2>
              </div>
              <button
                onClick={() => setModal(null)}
                className="rounded-full p-2 hover:bg-gray-100 text-gray-400 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-5 p-8 md:grid-cols-2">
              <div className="md:col-span-2">
                <label
                  htmlFor="field-Usuarios-jsx-403-0"
                  className="mb-1.5 block text-xs font-bold text-gray-700"
                >
                  Nombre de Usuario
                </label>
                <input
                  id="field-Usuarios-jsx-403-0"
                  value={form.nombre}
                  onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  className={CONTROL}
                  placeholder="Ej: Administrador"
                />
              </div>
              <div>
                <label
                  htmlFor="field-Usuarios-jsx-414-1"
                  className="mb-1.5 block text-xs font-bold text-gray-700"
                >
                  Correo Electrónico
                </label>
                <input
                  id="field-Usuarios-jsx-414-1"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className={CONTROL}
                  placeholder="usuario@modosabor.com"
                />
              </div>
              <div>
                <label
                  htmlFor="field-Usuarios-jsx-426-2"
                  className="mb-1.5 block text-xs font-bold text-gray-700"
                >
                  Rol de Acceso
                </label>
                <select
                  id="field-Usuarios-jsx-426-2"
                  value={form.rol}
                  onChange={(e) => setForm((prev) => ({ ...prev, rol: e.target.value }))}
                  className={CONTROL}
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold text-gray-700">
                  {modal === 'nuevo'
                    ? 'Contraseña Inicial'
                    : 'Cambiar Contraseña (dejar vacío para mantener)'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  className={CONTROL}
                  placeholder="••••••••"
                />
              </div>
              {modal !== 'nuevo' && (
                <div className="md:col-span-2 p-4 rounded-xl bg-gray-50 border border-gray-100">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <p className="text-sm font-bold text-gray-900">Estado de la cuenta</p>
                      <p className="text-[11px] font-semibold text-gray-400">
                        Permitir que este usuario inicie sesión.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={form.activo}
                      onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                      className="h-5 w-5 rounded border-gray-300 text-[#DC1F2D] focus:ring-[#DC1F2D] accent-[#DC1F2D]"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-gray-100 p-6 bg-gray-50/50">
              <button
                onClick={() => setModal(null)}
                className="h-11 px-6 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={guardar}
                disabled={saving}
                className="flex h-11 items-center gap-2 rounded-xl bg-[#DC1F2D] px-8 text-sm font-bold text-white shadow-lg shadow-[#DC1F2D]/20 hover:bg-[#B91C2A] transition-all disabled:opacity-50"
              >
                <Save size={18} />
                {saving ? 'Guardando...' : modal === 'nuevo' ? 'Crear Usuario' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
