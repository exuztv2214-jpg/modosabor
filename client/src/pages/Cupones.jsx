import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Percent,
  DollarSign,
  Calendar,
  Users,
  Tag,
  CheckCircle,
  XCircle,
  Copy,
  RefreshCw,
} from 'lucide-react';

import api from '../lib/api.js';
import ActionDialog from '../components/ActionDialog.jsx';

const fmtMoney = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

const TIPOS_DESCUENTO = {
  porcentaje: { label: 'Porcentaje', icon: Percent },
  fijo: { label: 'Monto fijo', icon: DollarSign },
};

function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Badge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-success-100 text-success-700',
    danger: 'bg-danger-100 text-danger-700',
    warning: 'bg-warning-100 text-warning-700',
    primary: 'bg-primary-50 text-primary-500',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
}

function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full ${maxWidth} rounded-2xl bg-white p-6 shadow-2xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <XCircle size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Cupones() {
  const [cupones, setCupones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCupon, setEditingCupon] = useState(null);
  const [stats, setStats] = useState({ total: 0, activos: 0, usados: 0 });
  const [deleteDialog, setDeleteDialog] = useState(null);

  const [form, setForm] = useState({
    codigo: '',
    descripcion: '',
    tipo_descuento: 'porcentaje',
    valor_descuento: '',
    minimo_compra: '',
    descuento_maximo: '',
    fecha_inicio: '',
    fecha_fin: '',
    limite_usos: '',
    limite_por_cliente: '1',
    activo: true,
  });

  useEffect(() => {
    loadCupones();
  }, []);

  async function loadCupones() {
    try {
      setLoading(true);
      const data = await api.get('/cupones');
      setCupones(data);

      // Calcular stats
      const activos = data.filter((c) => c.activo).length;
      const usados = data.reduce((acc, c) => acc + (c.usos_actuales || 0), 0);
      setStats({ total: data.length, activos, usados });
    } catch (error) {
      toast.error('Error al cargar cupones');
    } finally {
      setLoading(false);
    }
  }

  const cuponesFiltrados = useMemo(() => {
    let filtered = cupones;

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (c) => c.codigo.toLowerCase().includes(q) || (c.descripcion || '').toLowerCase().includes(q)
      );
    }

    if (filtroActivo !== 'todos') {
      filtered = filtered.filter((c) => (filtroActivo === 'activos' ? c.activo : !c.activo));
    }

    return filtered;
  }, [cupones, search, filtroActivo]);

  function resetForm() {
    setForm({
      codigo: '',
      descripcion: '',
      tipo_descuento: 'porcentaje',
      valor_descuento: '',
      minimo_compra: '',
      descuento_maximo: '',
      fecha_inicio: '',
      fecha_fin: '',
      limite_usos: '',
      limite_por_cliente: '1',
      activo: true,
    });
    setEditingCupon(null);
  }

  function openModal(cupon = null) {
    if (cupon) {
      setEditingCupon(cupon);
      setForm({
        codigo: cupon.codigo,
        descripcion: cupon.descripcion || '',
        tipo_descuento: cupon.tipo_descuento,
        valor_descuento: cupon.valor_descuento,
        minimo_compra: cupon.minimo_compra || '',
        descuento_maximo: cupon.descuento_maximo || '',
        fecha_inicio: cupon.fecha_inicio ? cupon.fecha_inicio.slice(0, 16) : '',
        fecha_fin: cupon.fecha_fin ? cupon.fecha_fin.slice(0, 16) : '',
        limite_usos: cupon.limite_usos || '',
        limite_por_cliente: cupon.limite_por_cliente,
        activo: cupon.activo === 1,
      });
    } else {
      resetForm();
    }
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.codigo.trim()) {
      toast.error('El código es requerido');
      return;
    }
    if (!form.valor_descuento || parseFloat(form.valor_descuento) <= 0) {
      toast.error('El valor de descuento debe ser mayor a 0');
      return;
    }

    const payload = {
      ...form,
      valor_descuento: parseFloat(form.valor_descuento),
      minimo_compra: parseFloat(form.minimo_compra || 0),
      descuento_maximo: parseFloat(form.descuento_maximo || 0),
      limite_usos: parseInt(form.limite_usos || 0),
      limite_por_cliente: parseInt(form.limite_por_cliente || 1),
      activo: form.activo ? 1 : 0,
    };

    try {
      if (editingCupon) {
        await api.put(`/cupones/${editingCupon.id}`, payload);
        toast.success('Cupón actualizado');
      } else {
        await api.post('/cupones', payload);
        toast.success('Cupón creado');
      }
      setModalOpen(false);
      resetForm();
      loadCupones();
    } catch (error) {
      toast.error(error.message || 'Error al guardar cupón');
    }
  }

  async function handleDelete(cupon) {
    setDeleteDialog(cupon);
  }

  async function confirmarDelete() {
    if (!deleteDialog) return;
    try {
      await api.delete(`/cupones/${deleteDialog.id}`);
      toast.success('Cupón eliminado');
      setDeleteDialog(null);
      loadCupones();
    } catch (error) {
      toast.error('Error al eliminar cupón');
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    toast.success('Código copiado');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cupones de descuento</h1>
          <p className="text-gray-500">Gestiona códigos promocionales para tus clientes</p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
        >
          <Plus size={18} />
          Nuevo cupón
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
              <Tag size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-sm text-gray-500">Cupones creados</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-100 text-success-600">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.activos}</p>
              <p className="text-sm text-gray-500">Cupones activos</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-100 text-warning-600">
              <Users size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.usados}</p>
              <p className="text-sm text-gray-500">Total usos</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar cupón..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div className="flex gap-2">
          {['todos', 'activos', 'inactivos'].map((filtro) => (
            <button
              key={filtro}
              onClick={() => setFiltroActivo(filtro)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                filtroActivo === filtro
                  ? 'bg-primary-50 text-primary-500'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
              }`}
            >
              {filtro.charAt(0).toUpperCase() + filtro.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-semibold text-gray-700">Código</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Descuento</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Restricciones</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Vigencia</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Usos</th>
              <th className="px-4 py-3 font-semibold text-gray-700">Estado</th>
              <th className="px-4 py-3 font-semibold text-gray-700 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  <RefreshCw className="mx-auto mb-2 animate-spin" size={24} />
                  Cargando cupones...
                </td>
              </tr>
            ) : cuponesFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No hay cupones {search && 'que coincidan con la búsqueda'}
                </td>
              </tr>
            ) : (
              cuponesFiltrados.map((cupon) => {
                const Icon = TIPOS_DESCUENTO[cupon.tipo_descuento].icon;
                return (
                  <tr key={cupon.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="rounded-lg bg-gray-100 px-2 py-1 font-mono text-sm font-semibold text-gray-900">
                          {cupon.codigo}
                        </code>
                        <button
                          onClick={() => copyToClipboard(cupon.codigo)}
                          className="text-gray-400 hover:text-primary-500"
                          title="Copiar código"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      {cupon.descripcion && (
                        <p className="mt-1 text-xs text-gray-500">{cupon.descripcion}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-primary-500" />
                        <span className="font-medium text-gray-900">
                          {cupon.tipo_descuento === 'porcentaje'
                            ? `${cupon.valor_descuento}%`
                            : fmtMoney(cupon.valor_descuento)}
                        </span>
                      </div>
                      {cupon.descuento_maximo > 0 && cupon.tipo_descuento === 'porcentaje' && (
                        <p className="text-xs text-gray-500">
                          Máx: {fmtMoney(cupon.descuento_maximo)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-xs">
                        {cupon.minimo_compra > 0 && (
                          <p className="text-gray-600">Mín: {fmtMoney(cupon.minimo_compra)}</p>
                        )}
                        <p className="text-gray-500">{cupon.limite_por_cliente} uso por cliente</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Calendar size={12} />
                          <span>Desde: {formatDate(cupon.fecha_inicio)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-600">
                          <Calendar size={12} />
                          <span>Hasta: {formatDate(cupon.fecha_fin)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm">
                        <span className="font-semibold text-gray-900">
                          {cupon.usos_actuales || 0}
                        </span>
                        {cupon.limite_usos > 0 && (
                          <span className="text-gray-500"> / {cupon.limite_usos}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {cupon.activo ? (
                        <Badge variant="success">
                          <CheckCircle size={12} />
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="danger">
                          <XCircle size={12} />
                          Inactivo
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openModal(cupon)}
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-primary-50 hover:text-primary-500"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(cupon)}
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-danger-50 hover:text-danger-600"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
        title={editingCupon ? 'Editar cupón' : 'Nuevo cupón'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Código *</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono uppercase focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  placeholder="EJ: DESCUENTO20"
                  required
                />
                <button
                  type="button"
                  title="Generar código aleatorio"
                  onClick={() => {
                    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                    const part = Array.from(
                      { length: 6 },
                      () => chars[Math.floor(Math.random() * chars.length)]
                    ).join('');
                    setForm((f) => ({ ...f, codigo: `PROMO-${part}` }));
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-primary-50 hover:text-primary-500 hover:border-primary-200 transition-all whitespace-nowrap"
                >
                  🎲 Generar
                </button>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Ej: 20% de descuento en tu primera compra"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tipo de descuento *
              </label>
              <select
                value={form.tipo_descuento}
                onChange={(e) => setForm({ ...form, tipo_descuento: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="porcentaje">Porcentaje (%)</option>
                <option value="fijo">Monto fijo ($)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Valor *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.valor_descuento}
                onChange={(e) => setForm({ ...form, valor_descuento: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder={form.tipo_descuento === 'porcentaje' ? 'Ej: 20' : 'Ej: 5000'}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Mínimo de compra
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.minimo_compra}
                onChange={(e) => setForm({ ...form, minimo_compra: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="0"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Descuento máximo {form.tipo_descuento === 'fijo' && '(no aplica)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.descuento_maximo}
                onChange={(e) => setForm({ ...form, descuento_maximo: e.target.value })}
                disabled={form.tipo_descuento === 'fijo'}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
                placeholder="Sin límite"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fecha inicio</label>
              <input
                type="datetime-local"
                value={form.fecha_inicio}
                onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fecha fin</label>
              <input
                type="datetime-local"
                value={form.fecha_fin}
                onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Límite total de usos
              </label>
              <input
                type="number"
                min="0"
                value={form.limite_usos}
                onChange={(e) => setForm({ ...form, limite_usos: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Sin límite"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Límite por cliente
              </label>
              <input
                type="number"
                min="1"
                value={form.limite_por_cliente}
                onChange={(e) => setForm({ ...form, limite_por_cliente: e.target.value })}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="activo"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-blue-500"
            />
            <label htmlFor="activo" className="text-sm text-gray-700">
              Cupón activo
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
              className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rounded-xl bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              {editingCupon ? 'Guardar cambios' : 'Crear cupón'}
            </button>
          </div>
        </form>
      </Modal>
      <ActionDialog
        open={Boolean(deleteDialog)}
        title={deleteDialog ? `Eliminar cupón ${deleteDialog.codigo}` : ''}
        description="El cupón dejará de estar disponible para promociones y descuentos."
        confirmLabel="Eliminar cupón"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={confirmarDelete}
        onClose={() => setDeleteDialog(null)}
      />
    </div>
  );
}
