import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  Download,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp,
  Truck,
  User,
  Wallet,
  X,
} from 'lucide-react';

import api from '../lib/api.js';

const METODOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'cuenta_corriente', 'otro'];

const fmtMoney = (v) => `$${Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;
const fmtDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};
const normalizeText = (v) =>
  String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

function Stat({ label, value, icon: Icon, tint = 'blue' }) {
  const tints = {
    blue: 'bg-primary-50 text-primary-500',
    emerald: 'bg-success-50 text-success-600',
    amber: 'bg-warning-50 text-warning-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between">
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            {label}
          </p>
          <p className="text-xl font-black text-gray-900 tracking-tight">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${tints[tint]}`}
        >
          <Icon size={18} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

function ModalDetalle({ compra, onClose }) {
  if (!compra) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-[28px] bg-white shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-black text-gray-900">Compra #{compra.id}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{fmtDate(compra.creado_en)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Info cabecera */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Proveedor', value: compra.proveedor || 'Sin especificar' },
              { label: 'Método de pago', value: compra.metodo_pago || '-' },
              { label: 'Total', value: fmtMoney(compra.total) },
              { label: 'Registró', value: compra.actor_nombre || '-' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {item.label}
                </p>
                <p className="mt-1 text-sm font-bold text-gray-800 truncate">{item.value}</p>
              </div>
            ))}
          </div>

          {compra.referencia_pago && (
            <div className="rounded-2xl bg-primary-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                Referencia de pago
              </p>
              <p className="mt-1 text-sm font-bold text-blue-800">{compra.referencia_pago}</p>
            </div>
          )}

          {compra.notas && (
            <div className="rounded-2xl bg-warning-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                Notas
              </p>
              <p className="mt-1 text-sm text-amber-800">{compra.notas}</p>
            </div>
          )}

          {/* Items */}
          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Insumos ({(compra.items || []).length})
            </p>
            <div className="space-y-2">
              {(compra.items || []).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-800 truncate">{item.insumo_nombre}</p>
                    <p className="text-xs text-gray-500">
                      {Number(item.cantidad || 0).toLocaleString('es-AR')} {item.unidad} ×{' '}
                      {fmtMoney(item.costo_unitario)}
                    </p>
                  </div>
                  <p className="ml-4 text-sm font-black text-gray-900">{fmtMoney(item.subtotal)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center">
          <p className="text-sm text-gray-500">{(compra.items || []).length} ítems</p>
          <p className="text-lg font-black text-gray-900">Total: {fmtMoney(compra.total)}</p>
        </div>
      </div>
    </div>
  );
}

function ModalNuevaCompra({ insumos, proveedores = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    proveedor: '',
    metodo_pago: 'efectivo',
    referencia_pago: '',
    notas: '',
  });
  const [items, setItems] = useState([{ insumo_id: '', cantidad: '', costo_unitario: '' }]);
  const [saving, setSaving] = useState(false);

  const total = useMemo(
    () =>
      items.reduce((acc, i) => acc + Number(i.cantidad || 0) * Number(i.costo_unitario || 0), 0),
    [items]
  );

  const updateItem = (idx, key, val) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      if (key === 'insumo_id') {
        const insumo = insumos.find((i) => String(i.id) === String(val));
        if (insumo) next[idx].costo_unitario = String(insumo.costo_unitario || '');
      }
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { insumo_id: '', cantidad: '', costo_unitario: '' }]);
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    const validItems = items.filter((i) => i.insumo_id && Number(i.cantidad) > 0);
    if (validItems.length === 0) {
      toast.error('Agrega al menos un insumo con cantidad');
      return;
    }
    setSaving(true);
    try {
      await api.post('/compras', {
        ...form,
        total,
        items: validItems.map((i) => ({
          insumo_id: Number(i.insumo_id),
          cantidad: Number(i.cantidad),
          costo_unitario: Number(i.costo_unitario || 0),
        })),
      });
      toast.success('Compra registrada y stock actualizado');
      onSaved();
    } catch (err) {
      toast.error(err?.error || 'Error al registrar compra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-[28px] bg-white shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-black text-gray-900">Nueva compra</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {/* Datos generales */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block mb-1.5 text-xs font-black uppercase tracking-widest text-gray-500">
                Proveedor
              </label>
              <input
                list="proveedores-list"
                value={form.proveedor}
                onChange={(e) => setForm((p) => ({ ...p, proveedor: e.target.value }))}
                placeholder="Nombre del proveedor"
                className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
              <datalist id="proveedores-list">
                {proveedores.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-black uppercase tracking-widest text-gray-500">
                Método de pago
              </label>
              <select
                value={form.metodo_pago}
                onChange={(e) => setForm((p) => ({ ...p, metodo_pago: e.target.value }))}
                className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {m.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-black uppercase tracking-widest text-gray-500">
                Referencia de pago
              </label>
              <input
                type="text"
                value={form.referencia_pago}
                onChange={(e) => setForm((p) => ({ ...p, referencia_pago: e.target.value }))}
                placeholder="N° transferencia, factura, etc."
                className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block mb-1.5 text-xs font-black uppercase tracking-widest text-gray-500">
                Notas
              </label>
              <input
                type="text"
                value={form.notas}
                onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                placeholder="Observaciones opcionales"
                className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Insumos
              </p>
              <button
                onClick={addItem}
                className="flex items-center gap-1.5 rounded-xl bg-primary-50 px-3 py-1.5 text-xs font-bold text-primary-500 hover:bg-primary-100 transition-colors"
              >
                <Plus size={14} />
                Agregar
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex gap-2 items-start rounded-2xl border border-gray-100 bg-gray-50/50 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <select
                      value={item.insumo_id}
                      onChange={(e) => updateItem(idx, 'insumo_id', e.target.value)}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 mb-2"
                    >
                      <option value="">Seleccionar insumo...</option>
                      {insumos.map((ins) => (
                        <option key={ins.id} value={ins.id}>
                          {ins.nombre} ({ins.unidad})
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block mb-1 text-[10px] font-bold text-gray-400 uppercase">
                          Cantidad
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.cantidad}
                          onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                          placeholder="0"
                          className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-[10px] font-bold text-gray-400 uppercase">
                          Costo unit. ($)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.costo_unitario}
                          onChange={(e) => updateItem(idx, 'costo_unitario', e.target.value)}
                          placeholder="0"
                          className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 pt-1 shrink-0">
                    <p className="text-xs font-black text-gray-700">
                      {fmtMoney(Number(item.cantidad || 0) * Number(item.costo_unitario || 0))}
                    </p>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(idx)}
                        className="rounded-lg p-1 text-rose-400 hover:bg-danger-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-base font-black text-gray-900">Total: {fmtMoney(total)}</p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-2xl border border-gray-200 px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-2xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-200 hover:bg-blue-600 transition-all disabled:opacity-50"
            >
              {saving ? 'Registrando...' : 'Registrar compra'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Compras() {
  const [compras, setCompras] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [detalleId, setDetalleId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [modalNueva, setModalNueva] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [comprasData, insumosData] = await Promise.all([
        api.get('/compras'),
        api.get('/inventario/insumos'),
      ]);
      setCompras(Array.isArray(comprasData) ? comprasData : []);
      setInsumos(Array.isArray(insumosData) ? insumosData : []);
    } catch {
      toast.error('Error al cargar compras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const verDetalle = async (id) => {
    setDetalleId(id);
    setDetalle(null);
    setLoadingDetalle(true);
    try {
      const data = await api.get(`/compras/${id}`);
      setDetalle(data);
    } catch {
      toast.error('No se pudo cargar el detalle');
      setDetalleId(null);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const closeDetalle = () => {
    setDetalleId(null);
    setDetalle(null);
  };

  const comprasFiltradas = useMemo(() => {
    let result = compras;
    if (busqueda.trim()) {
      const term = normalizeText(busqueda);
      result = result.filter(
        (c) =>
          normalizeText(c.proveedor).includes(term) ||
          normalizeText(c.metodo_pago).includes(term) ||
          normalizeText(c.actor_nombre).includes(term) ||
          String(c.id).includes(term)
      );
    }
    if (fechaDesde) {
      const desde = new Date(fechaDesde + 'T00:00:00');
      result = result.filter((c) => new Date(c.creado_en) >= desde);
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta + 'T23:59:59');
      result = result.filter((c) => new Date(c.creado_en) <= hasta);
    }
    return result;
  }, [compras, busqueda, fechaDesde, fechaHasta]);

  const proveedoresList = useMemo(
    () => [...new Set(compras.map((c) => c.proveedor).filter(Boolean))].sort(),
    [compras]
  );

  const stats = useMemo(() => {
    const totalGastado = compras.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const comprasHoy = compras.filter((c) => new Date(c.creado_en) >= hoy);
    const gastadoHoy = comprasHoy.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const proveedoresUnicos = proveedoresList.length;

    return { totalGastado, comprasHoy: comprasHoy.length, gastadoHoy, proveedoresUnicos };
  }, [compras, proveedoresList]);

  const exportarComprasCSV = () => {
    if (!comprasFiltradas.length) return toast.error('No hay compras para exportar');
    const headers = ['ID', 'Fecha', 'Proveedor', 'Método de pago', 'Total', 'Registró'];
    const rows = comprasFiltradas.map((c) => [
      c.id,
      fmtDate(c.creado_en),
      `"${c.proveedor || 'Sin especificar'}"`,
      c.metodo_pago || '',
      Number(c.total || 0).toFixed(2),
      `"${c.actor_nombre || ''}"`,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compras_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${comprasFiltradas.length} compras exportadas`);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="sticky top-[65px] z-20 mb-6 flex items-center justify-between rounded-[28px] border border-gray-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur-sm mt-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary-100 flex items-center justify-center">
            <Truck className="text-primary-500" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900">Compras de insumos</h2>
            <p className="text-sm text-gray-500">
              Historial de ingresos y stock actualizado automáticamente.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportarComprasCSV}
            disabled={!comprasFiltradas.length}
            title="Exportar CSV"
            className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 hover:text-primary-500 transition-all shadow-sm disabled:opacity-40"
          >
            <Download size={16} strokeWidth={2.5} />
            CSV
          </button>
          <button
            onClick={() => setModalNueva(true)}
            className="flex items-center gap-2 rounded-2xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-200 hover:bg-blue-600 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={18} />
            Nueva compra
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total compras" value={compras.length} icon={ShoppingCart} tint="blue" />
          <Stat
            label="Gastado total"
            value={fmtMoney(stats.totalGastado)}
            icon={TrendingUp}
            tint="emerald"
          />
          <Stat label="Compras hoy" value={stats.comprasHoy} icon={Calendar} tint="amber" />
          <Stat label="Proveedores" value={stats.proveedoresUnicos} icon={User} tint="violet" />
        </div>

        {/* Buscador y filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por proveedor, método de pago, usuario..."
              className="h-11 w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-4 text-sm font-medium text-gray-700 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100 shadow-sm"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white px-3 shadow-sm">
              <Calendar size={14} className="text-gray-400 shrink-0" />
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="h-11 bg-transparent text-sm font-medium text-gray-700 outline-none"
              />
            </div>
            <span className="text-xs font-bold text-gray-400">—</span>
            <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white px-3 shadow-sm">
              <Calendar size={14} className="text-gray-400 shrink-0" />
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="h-11 bg-transparent text-sm font-medium text-gray-700 outline-none"
              />
            </div>
            {(fechaDesde || fechaHasta) && (
              <button
                onClick={() => {
                  setFechaDesde('');
                  setFechaHasta('');
                }}
                className="rounded-xl p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Limpiar fechas"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="rounded-[24px] border border-gray-100 bg-white shadow-sm overflow-hidden">
          {comprasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <Package size={28} className="text-gray-400" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-gray-400">
                {busqueda ? 'Sin resultados' : 'Sin compras registradas'}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {busqueda
                  ? `No hay compras que coincidan con "${busqueda}"`
                  : 'Registrá la primera compra para actualizar el stock.'}
              </p>
              {!busqueda && (
                <button
                  onClick={() => setModalNueva(true)}
                  className="mt-4 flex items-center gap-2 rounded-2xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-200 hover:bg-blue-600 transition-all"
                >
                  <Plus size={16} />
                  Registrar primera compra
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {/* Header tabla */}
              <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 bg-gray-50/80">
                {['Proveedor', 'Método', 'Total', 'Registró', 'Fecha', ''].map((h) => (
                  <p
                    key={h}
                    className="text-[10px] font-black uppercase tracking-widest text-gray-400"
                  >
                    {h}
                  </p>
                ))}
              </div>

              {comprasFiltradas.map((compra) => (
                <button
                  key={compra.id}
                  onClick={() => verDetalle(compra.id)}
                  className="w-full text-left px-6 py-4 hover:bg-primary-50/30 transition-colors group"
                >
                  {/* Mobile */}
                  <div className="md:hidden flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                        <Truck size={18} className="text-primary-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {compra.proveedor || 'Sin proveedor'}{' '}
                          <span className="text-gray-400 font-medium">#{compra.id}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {compra.metodo_pago} · {fmtDate(compra.creado_en)}
                        </p>
                        <p className="text-xs text-gray-400">{compra.actor_nombre}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-sm font-black text-gray-900">{fmtMoney(compra.total)}</p>
                      <ChevronRight
                        size={16}
                        className="text-gray-400 group-hover:text-primary-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Desktop */}
                  <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                        <Truck size={16} className="text-primary-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {compra.proveedor || 'Sin proveedor'}
                        </p>
                        <p className="text-xs text-gray-400">#{compra.id}</p>
                      </div>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 capitalize">
                        <Wallet size={12} />
                        {compra.metodo_pago?.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-black text-gray-900">{fmtMoney(compra.total)}</p>
                    <p className="text-sm text-gray-600 truncate">{compra.actor_nombre || '-'}</p>
                    <p className="text-xs text-gray-500">{fmtDate(compra.creado_en)}</p>
                    <ChevronRight
                      size={16}
                      className="text-gray-300 group-hover:text-primary-500 transition-colors"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {comprasFiltradas.length > 0 && (
          <p className="text-center text-xs text-gray-400">
            Mostrando {comprasFiltradas.length} de {compras.length} compras (últimas 100)
          </p>
        )}
      </div>

      {/* Modal detalle */}
      {detalleId &&
        (loadingDetalle ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
          </div>
        ) : (
          <ModalDetalle compra={detalle} onClose={closeDetalle} />
        ))}

      {/* Modal nueva compra */}
      {modalNueva && (
        <ModalNuevaCompra
          insumos={insumos}
          proveedores={proveedoresList}
          onClose={() => setModalNueva(false)}
          onSaved={() => {
            setModalNueva(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}
