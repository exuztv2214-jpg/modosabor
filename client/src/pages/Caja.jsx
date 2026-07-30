import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  BadgeDollarSign,
  CalendarClock,
  ClipboardList,
  Lock,
  Printer,
  RefreshCw,
  Shield,
  WalletCards,
  ArrowUpCircle,
  ArrowDownCircle,
  Plus,
  X,
  Wallet,
  TrendingUp,
  FileText,
  UserCheck,
  Download,
} from 'lucide-react';

import api from '../lib/api.js';
import { fmtMoney } from '../lib/formatters.js';
import ActionDialog from '../components/ActionDialog.jsx';

const fmt = fmtMoney;
const CONTROL =
  'w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-[#5D87FF]/10';
const OPENING_PRESETS = [0, 10000, 20000, 50000];
const MOVEMENT_PRESETS = [1000, 2000, 5000, 10000];
const MOVEMENT_REASONS = {
  entrada: ['Carga de fondo', 'Ingreso manual', 'Vuelto recuperado', 'Otro'],
  salida: ['Compra urgente', 'Pago repartidor', 'Gasto operativo', 'Retiro de efectivo', 'Otro'],
};

function parseMoneyInput(value) {
  if (typeof value === 'number') return value;
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\s/g, '').replace(/\$/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function fmtDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtHour(value) {
  if (!value) return '-';
  const parsed = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function openPrintWindow(html) {
  if (!html) {
    toast.error('No se pudo generar el comprobante');
    return;
  }
  // No usar noopener,noreferrer ya que necesitamos acceso al documento de la ventana
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('El navegador bloqueó la ventana emergente. Por favor, permítela para imprimir.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Un pequeño delay ayuda a que el contenido se renderice antes de enfocar/imprimir
  setTimeout(() => {
    win.focus();
  }, 200);
}

function StatCard({ icon: Icon, label, value, helper, tint = 'blue' }) {
  const tints = {
    blue: 'bg-primary-50 text-primary-500',
    emerald: 'bg-success-50 text-success-500',
    rose: 'bg-danger-50 text-danger-500',
    amber: 'bg-warning-50 text-warning-500',
    slate: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className="group rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">
            {label}
          </p>
          <h3 className="text-2xl font-black text-gray-900">{value}</h3>
          {helper && (
            <p className="mt-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {helper}
            </p>
          )}
        </div>
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:rotate-6 ${tints[tint]}`}
        >
          <Icon size={22} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

export default function Caja() {
  const [data, setData] = useState({
    activa: null,
    resumen: null,
    historial: [],
    auditoria: [],
    turno_operativo: null,
  });
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState({ monto_inicial: '', notas: '' });
  const [closing, setClosing] = useState({ monto_final_declarado: '', notas: '' });
  const [movimiento, setMovimiento] = useState({ tipo: 'salida', monto: '', motivo: '' });
  const [showMovimientoModal, setShowMovimientoModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);

  const cargar = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get('/caja/estado');
      setData({
        activa: response?.activa || null,
        resumen: response?.resumen || null,
        historial: Array.isArray(response?.historial) ? response.historial : [],
        auditoria: Array.isArray(response?.auditoria) ? response.auditoria : [],
        turno_operativo: response?.turno_operativo || null,
      });
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar la caja');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const resumen = data?.resumen;
  const historial = Array.isArray(data?.historial) ? data.historial : [];
  const auditoria = Array.isArray(data?.auditoria) ? data.auditoria : [];
  const movimientos = Array.isArray(resumen?.movimientos) ? resumen.movimientos : [];
  const porMetodo = Array.isArray(resumen?.porMetodo) ? resumen.porMetodo : [];
  const porTipo = Array.isArray(resumen?.porTipo) ? resumen.porTipo : [];
  const porTurno = Array.isArray(resumen?.porTurno) ? resumen.porTurno : [];
  const efectivoEsperado =
    Number(data?.activa?.monto_inicial || 0) + Number(resumen?.efectivoNeto || 0);
  const ultimoCierre = historial.find((item) => item.estado === 'cerrada') || null;
  const diferencia = useMemo(() => {
    if (!data?.activa) return 0;
    return parseMoneyInput(closing.monto_final_declarado) - efectivoEsperado;
  }, [closing.monto_final_declarado, data?.activa, efectivoEsperado]);

  const abrirCaja = async () => {
    const monto = parseMoneyInput(opening.monto_inicial);
    if (Number.isNaN(monto) || monto < 0) {
      toast.error('El fondo inicial debe ser 0 o mayor');
      return;
    }
    setSaving(true);
    try {
      await api.post('/caja/apertura', {
        monto_inicial: monto,
        notas: opening.notas || '',
      });
      toast.success('Caja abierta correctamente');
      setOpening({ monto_inicial: '', notas: '' });
      await cargar({ silent: true });
    } catch (error) {
      toast.error(error?.error || 'Fallo apertura');
    } finally {
      setSaving(false);
    }
  };

  const cerrarCaja = async () => {
    const monto = parseMoneyInput(closing.monto_final_declarado);
    if (Number.isNaN(monto) || monto < 0) {
      toast.error('El contado debe ser 0 o mayor');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post('/caja/cierre', {
        monto_final_declarado: monto,
        notas: closing.notas || '',
      });
      toast.success('Turno cerrado');
      setClosing({ monto_final_declarado: '', notas: '' });
      setCloseDialog(false);
      await cargar({ silent: true });
      openPrintWindow(response?.html);
    } catch (error) {
      toast.error(error?.error || 'Error al cerrar');
    } finally {
      setSaving(false);
    }
  };

  const solicitarCierreCaja = () => {
    const monto = parseMoneyInput(closing.monto_final_declarado);
    if (Number.isNaN(monto) || monto < 0) {
      toast.error('El contado debe ser 0 o mayor');
      return;
    }
    setCloseDialog(true);
  };

  const imprimirTicketCierre = async (id) => {
    try {
      const html = await api.get(`/caja/cierre/${id}/ticket`);
      openPrintWindow(html);
    } catch (error) {
      toast.error(error?.error || 'Error al generar ticket');
    }
  };

  const registrarMovimiento = async (e) => {
    e.preventDefault();
    const monto = parseMoneyInput(movimiento.monto);
    if (Number.isNaN(monto) || monto <= 0) {
      toast.error('El movimiento debe ser mayor a 0');
      return;
    }
    if (!String(movimiento.motivo || '').trim()) {
      toast.error('Carga un motivo para el movimiento');
      return;
    }
    setSaving(true);
    try {
      await api.post('/caja/movimiento', {
        ...movimiento,
        monto,
        motivo: movimiento.motivo.trim(),
      });
      toast.success('Movimiento guardado');
      setMovimiento({ tipo: 'salida', monto: '', motivo: '' });
      setShowMovimientoModal(false);
      await cargar({ silent: true });
    } catch (error) {
      toast.error(error?.error || 'Error al registrar');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data?.activa && historial.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full border-4 border-primary-500 border-t-transparent h-12 w-12" />
      </div>
    );
  }

  const exportarMovimientosCSV = () => {
    if (!movimientos.length) return toast.error('No hay movimientos para exportar');
    const headers = ['Hora', 'Tipo', 'Motivo', 'Monto'];
    const rows = movimientos.map((m) => [
      fmtHour(m.creado_en),
      m.tipo === 'entrada' ? 'Ingreso' : 'Egreso',
      `"${m.motivo || 'Sin detalle'}"`,
      Number(m.tipo === 'salida' ? -m.monto : m.monto).toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos_caja_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Movimientos exportados');
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header Seccion */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-1 bg-primary-500 rounded-full"></div>
              <p className="text-sm font-black text-primary-500 uppercase tracking-[0.3em]">
                Control de Efectivo
              </p>
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Caja y Auditoría</h1>
            <p className="mt-1 text-gray-500 font-medium">
              Gestiona aperturas, cierres y gastos operativos del turno.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase ${data?.turno_operativo?.abiertoAhora ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-700'}`}
              >
                {data?.turno_operativo?.abiertoAhora
                  ? `Turno ${data?.turno_operativo?.shiftName}`
                  : 'Fuera de turno'}
              </span>
              <span className="px-3 py-1 rounded-full bg-primary-50 text-primary-500 text-[11px] font-bold uppercase">
                Fecha operativa {data?.turno_operativo?.fechaOperativa || '-'}
              </span>
              {data?.activa?.auto_abierta ? (
                <span className="px-3 py-1 rounded-full bg-warning-100 text-warning-700 text-[11px] font-bold uppercase">
                  Caja autoabierta
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {data?.activa && (
              <button
                onClick={() => setShowMovimientoModal(true)}
                className="flex h-12 items-center gap-2 rounded-2xl bg-primary-500 text-white px-6 text-sm font-black shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 active:scale-95"
              >
                <Plus size={18} strokeWidth={3} />
                REGISTRAR MOVIMIENTO
              </button>
            )}
            <button
              onClick={cargar}
              className="h-12 px-5 flex items-center justify-center rounded-2xl bg-white border border-gray-100 text-primary-500 shadow-sm hover:bg-gray-50 transition-all"
            >
              <RefreshCw size={18} strokeWidth={3} />
            </button>
          </div>
        </div>

        {data?.activa ? (
          <>
            {/* Metricas Modernize */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
              <StatCard
                icon={Wallet}
                label="Fondo Inicial"
                value={fmt(data.activa.monto_inicial)}
                tint="blue"
                helper={`Por ${data.activa.abierta_por_nombre}`}
              />
              <StatCard
                icon={TrendingUp}
                label="Efectivo Cobrado"
                value={fmt(resumen?.efectivoVentas)}
                tint="emerald"
                helper={`${resumen?.pedidos} órdenes activas en el turno`}
              />
              <StatCard
                icon={ArrowDownCircle}
                label="Egresos / Gastos"
                value={fmt(resumen?.totalEgresosManuales)}
                tint="rose"
                helper="Salidas manuales"
              />
              <StatCard
                icon={BadgeDollarSign}
                label="Efectivo Esperado"
                value={fmt(efectivoEsperado)}
                tint="blue"
                helper="Balance en caja"
              />
              <StatCard
                icon={CalendarClock}
                label="Pagos Digitales"
                value={fmt(resumen?.digitales)}
                tint="amber"
                helper={`Pendiente de cobro ${fmt(resumen?.totalPendienteCobro)}`}
              />
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_400px]">
              <div className="space-y-8">
                {/* Resumen de Ventas */}
                <div className="rounded-[32px] bg-white p-8 shadow-sm border border-gray-100">
                  <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-8">
                    Desglose de Ventas
                  </h3>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Metodos de Pago
                      </p>
                      {porMetodo.map((m) => (
                        <div
                          key={m.metodo_pago}
                          className="flex items-center justify-between p-4 rounded-[20px] bg-gray-50 border border-gray-100"
                        >
                          <div>
                            <p className="text-sm font-black text-gray-800 uppercase tracking-tight">
                              {m.metodo_pago}
                            </p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">
                              {m.cantidad} pedidos
                            </p>
                          </div>
                          <p className="text-base font-black text-primary-500">{fmt(m.total)}</p>
                        </div>
                      ))}
                      {!porMetodo.length && (
                        <div className="rounded-[20px] border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-400">
                          Aun no hay ventas por metodo en este turno.
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Tipos de Entrega
                      </p>
                      {porTipo.map((t) => (
                        <div
                          key={t.tipo_entrega}
                          className="flex items-center justify-between p-4 rounded-[20px] bg-gray-50 border border-gray-100"
                        >
                          <div>
                            <p className="text-sm font-black text-gray-800 uppercase tracking-tight">
                              {t.tipo_entrega}
                            </p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">
                              {t.cantidad} pedidos
                            </p>
                          </div>
                          <p className="text-base font-black text-gray-900">{fmt(t.total)}</p>
                        </div>
                      ))}
                      {!porTipo.length && (
                        <div className="rounded-[20px] border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-semibold text-gray-400">
                          Aun no hay ventas clasificadas por entrega.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Movimientos Manuales */}
                <div className="rounded-[32px] bg-white p-8 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                      Movimientos Manuales
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                          Ingresos
                        </p>
                        <p className="text-sm font-black text-success-600">
                          +{fmt(resumen?.totalIngresosManuales)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">
                          Egresos
                        </p>
                        <p className="text-sm font-black text-danger-600">
                          -{fmt(resumen?.totalEgresosManuales)}
                        </p>
                      </div>
                      <button
                        onClick={exportarMovimientosCSV}
                        disabled={!movimientos.length}
                        title="Exportar CSV"
                        className="flex h-9 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-xs font-bold text-gray-600 hover:bg-gray-50 hover:text-primary-500 transition-all shadow-sm disabled:opacity-40"
                      >
                        <Download size={14} strokeWidth={2.5} />
                        CSV
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-[24px] border border-gray-100">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                        <tr>
                          <th className="px-6 py-4">Hora</th>
                          <th className="px-6 py-4">Concepto / Motivo</th>
                          <th className="px-6 py-4 text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-bold text-gray-700">
                        {movimientos.map((m) => (
                          <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4">{fmtHour(m.creado_en)}</td>
                            <td className="px-6 py-4 uppercase text-xs tracking-tight">
                              {m.motivo || 'Sin detalle'}
                            </td>
                            <td
                              className={`px-6 py-4 text-right ${m.tipo === 'entrada' ? 'text-success-600' : 'text-danger-600'}`}
                            >
                              {m.tipo === 'entrada' ? '+' : '-'}
                              {fmt(m.monto)}
                            </td>
                          </tr>
                        ))}
                        {!movimientos.length && (
                          <tr>
                            <td colSpan="3" className="px-6 py-12 text-center text-gray-400 italic">
                              No hubo movimientos manuales en este turno
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Sidebar de Cierre */}
              <div className="space-y-6">
                <div className="rounded-[32px] bg-primary-500 p-8 text-white shadow-xl shadow-primary-100 sticky top-24">
                  <div className="flex items-center gap-3 mb-6">
                    <Lock size={24} strokeWidth={3} />
                    <h3 className="text-xl font-black uppercase tracking-tight">Cerrar Turno</h3>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-80 ml-1">
                        Efectivo Contado en Caja
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={closing.monto_final_declarado}
                        onChange={(e) =>
                          setClosing((p) => ({ ...p, monto_final_declarado: e.target.value }))
                        }
                        className="h-14 w-full rounded-2xl bg-white/10 border-none px-4 text-xl font-black text-white focus:bg-white/20 outline-none transition-all placeholder:text-white/30 mt-1"
                        placeholder="0.00"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setClosing((p) => ({
                            ...p,
                            monto_final_declarado: String(efectivoEsperado),
                          }))
                        }
                        className="rounded-full bg-white/15 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white transition hover:bg-white/25"
                      >
                        Copiar esperado
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setClosing((p) => ({ ...p, monto_final_declarado: '', notas: '' }))
                        }
                        className="rounded-full bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/85 transition hover:bg-white/20"
                      >
                        Limpiar arqueo
                      </button>
                    </div>

                    <div className="p-5 rounded-[24px] bg-white/10 space-y-3">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-tight">
                        <span className="opacity-70">Esperado</span>
                        <span>{fmt(efectivoEsperado)}</span>
                      </div>
                      <div className="flex justify-between text-lg font-black uppercase tracking-tight border-t border-white/10 pt-3">
                        <span>Diferencia</span>
                        <span
                          className={
                            diferencia < 0
                              ? 'text-rose-200'
                              : diferencia > 0
                                ? 'text-emerald-200'
                                : ''
                          }
                        >
                          {diferencia > 0 ? '+' : ''}
                          {fmt(diferencia)}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-white/75">
                        {diferencia === 0
                          ? 'El arqueo coincide con lo esperado.'
                          : diferencia > 0
                            ? 'Sobra efectivo respecto al esperado. Conviene dejar una nota.'
                            : 'Falta efectivo respecto al esperado. Revisa ventas y movimientos antes de cerrar.'}
                      </p>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-80 ml-1">
                        Notas de Cierre
                      </label>
                      <textarea
                        value={closing.notas}
                        onChange={(e) => setClosing((p) => ({ ...p, notas: e.target.value }))}
                        placeholder="Observaciones del cierre, diferencia, retiros, etc."
                        className="mt-1 min-h-[96px] w-full resize-none rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white outline-none transition-all placeholder:text-white/35 focus:bg-white/15"
                      />
                    </div>

                    <button
                      onClick={solicitarCierreCaja}
                      disabled={saving || String(closing.monto_final_declarado).trim() === ''}
                      className="w-full h-14 rounded-2xl bg-white text-primary-500 text-sm font-black uppercase tracking-[0.2em] shadow-lg shadow-black/10 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {saving ? 'CERRANDO...' : 'FINALIZAR TURNO'}
                    </button>
                  </div>
                </div>

                <div className="rounded-[32px] bg-white p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-11 w-11 rounded-2xl bg-[#F2F6FA] text-primary-500 flex items-center justify-center">
                      <UserCheck size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">
                        Control Rapido
                      </h3>
                      <p className="text-xs font-semibold text-gray-500">
                        Chequeos utiles antes del cierre
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-[20px] bg-[#F2F6FA] p-4">
                      <div className="flex items-start gap-3">
                        <FileText size={16} className="mt-0.5 text-primary-500" />
                        <p className="text-sm font-semibold text-gray-600">
                          Si hay diferencia, deja nota antes de cerrar para que quede asentada en
                          auditoría.
                        </p>
                      </div>
                    </div>
                    {porTurno.length > 0 && (
                      <div className="rounded-[20px] border border-gray-100 p-4">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                          Turnos operativos
                        </p>
                        <div className="mt-3 space-y-2">
                          {porTurno.slice(0, 3).map((turno) => (
                            <div
                              key={turno.turno}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="font-semibold text-gray-500">
                                {turno.turno || 'Sin turno'}
                              </span>
                              <span className="font-black text-gray-900">{fmt(turno.total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Caja Cerrada - Estado Modernize */
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[450px_1fr]">
            <div className="rounded-[40px] bg-white p-10 shadow-sm border border-gray-100 flex flex-col items-center text-center">
              <div className="h-24 w-24 rounded-[32px] bg-primary-50 flex items-center justify-center text-primary-500 mb-8">
                <WalletCards size={48} strokeWidth={2.5} />
              </div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-4 uppercase">
                Turno Cerrado
              </h2>
              <p className="text-gray-500 font-medium mb-10 leading-relaxed">
                Inicia un nuevo turno con el fondo de caja inicial para comenzar a registrar ventas
                y gastos.
              </p>

              <div className="w-full space-y-4 mb-10 text-left">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Fondo de Apertura ($)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={opening.monto_inicial}
                    onChange={(e) => setOpening((p) => ({ ...p, monto_inicial: e.target.value }))}
                    className={CONTROL + ' mt-1 h-14 text-lg font-black'}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {OPENING_PRESETS.map((monto) => (
                    <button
                      key={monto}
                      type="button"
                      onClick={() => setOpening((p) => ({ ...p, monto_inicial: String(monto) }))}
                      className="rounded-full bg-primary-50 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary-500 transition hover:bg-primary-100"
                    >
                      {monto === 0 ? 'Sin fondo' : fmt(monto)}
                    </button>
                  ))}
                </div>
                <textarea
                  value={opening.notas}
                  onChange={(e) => setOpening((p) => ({ ...p, notas: e.target.value }))}
                  placeholder="Notas de apertura (opcional)..."
                  className={CONTROL + ' h-24 py-3 resize-none'}
                />
              </div>

              <button
                onClick={abrirCaja}
                disabled={saving}
                className="w-full h-16 rounded-[24px] bg-primary-500 text-white text-sm font-black uppercase tracking-[0.3em] shadow-xl shadow-primary-100 hover:bg-primary-600 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? 'ABRIENDO...' : 'ABRIR CAJA'}
              </button>
            </div>

            <div className="rounded-[40px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center p-10 text-center">
              <Shield size={64} className="text-gray-200 mb-6" />
              <h3 className="text-xl font-black text-gray-300 uppercase tracking-widest">
                Caja Lista Para Abrir
              </h3>
              <p className="text-sm text-gray-400 mt-2">
                Abre un nuevo turno para habilitar arqueo, movimientos manuales y control de
                efectivo.
              </p>
              {ultimoCierre ? (
                <div className="mt-6 w-full max-w-sm rounded-[28px] bg-white p-5 text-left shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                    Ultimo cierre
                  </p>
                  <div className="mt-4 space-y-2 text-sm font-semibold text-gray-500">
                    <div className="flex items-center justify-between">
                      <span>Fecha</span>
                      <span className="font-black text-gray-900">
                        {fmtDateTime(ultimoCierre.cerrada_en || ultimoCierre.abierta_en)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Fondo inicial</span>
                      <span className="font-black text-gray-900">
                        {fmt(ultimoCierre.monto_inicial)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Diferencia</span>
                      <span
                        className={`font-black ${Number(ultimoCierre.diferencia) === 0 ? 'text-success-600' : 'text-rose-500'}`}
                      >
                        {Number(ultimoCierre.diferencia) > 0 ? '+' : ''}
                        {fmt(ultimoCierre.diferencia)}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => imprimirTicketCierre(ultimoCierre.id)}
                    className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary-50 text-xs font-black uppercase tracking-[0.18em] text-primary-500 transition hover:bg-primary-100"
                  >
                    <Printer size={16} />
                    Reimprimir cierre
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Historial de Cierres Moderno */}
        <div className="rounded-[32px] bg-white p-8 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
              Historial de Turnos
            </h3>
            <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
              <RefreshCw size={20} />
            </div>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-[10px] font-black uppercase text-gray-400 tracking-widest">
                <tr>
                  <th className="px-6 py-4">Fecha / Turno</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Fondo Inicial</th>
                  <th className="px-6 py-4">Contado</th>
                  <th className="px-6 py-4">Diferencia</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {historial.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-bold text-gray-700">
                      {fmtDateTime(item.abierta_en)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${item.estado === 'abierta' ? 'bg-success-50 text-success-600' : 'bg-gray-100 text-gray-400'}`}
                      >
                        {item.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">{fmt(item.monto_inicial)}</td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {fmt(item.monto_final_declarado)}
                    </td>
                    <td
                      className={`px-6 py-4 font-black ${Number(item.diferencia) === 0 ? 'text-emerald-500' : 'text-rose-500'}`}
                    >
                      {Number(item.diferencia) > 0 ? '+' : ''}
                      {fmt(item.diferencia)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.estado === 'cerrada' && (
                        <button
                          onClick={() => imprimirTicketCierre(item.id)}
                          className="h-10 w-10 rounded-xl bg-primary-50 text-primary-500 flex items-center justify-center hover:bg-primary-500 hover:text-white transition-all shadow-sm"
                        >
                          <Printer size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!historial.length && (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-400 italic">
                      Todavía no hay cierres registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[32px] bg-white p-8 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
              Auditoría reciente
            </h3>
            <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
              <ClipboardList size={20} />
            </div>
          </div>

          {auditoria.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {auditoria.slice(0, 12).map((item) => (
                <div
                  key={item.id}
                  className="rounded-[24px] border border-gray-100 bg-[#F2F6FA] p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                        {item.modulo}
                      </p>
                      <p className="mt-1 text-sm font-black text-gray-900">{item.accion}</p>
                      <p className="mt-1 text-xs font-semibold text-gray-500">
                        {item.actor_nombre || 'Sistema'}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                      {fmtHour(item.creado_en)}
                    </span>
                  </div>
                  {item.detalle && Object.keys(item.detalle).length > 0 && (
                    <div className="mt-4 rounded-2xl bg-white px-4 py-3">
                      {Object.entries(item.detalle)
                        .slice(0, 3)
                        .map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-center justify-between gap-3 py-1 text-xs"
                          >
                            <span className="font-black uppercase tracking-[0.14em] text-gray-400">
                              {key}
                            </span>
                            <span className="truncate text-right font-semibold text-gray-700">
                              {String(value)}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm font-semibold text-gray-400">
              Todavía no hay eventos de auditoría para mostrar.
            </div>
          )}
        </div>
      </div>

      {/* Modal Registrar Gasto (Modern) */}
      {showMovimientoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[40px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-1 bg-danger-500 rounded-full"></div>
                  <p className="text-xs font-black text-danger-500 uppercase tracking-[0.2em]">
                    Movimiento Manual
                  </p>
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
                  {movimiento.tipo === 'salida' ? 'Registrar Salida' : 'Registrar Ingreso'}
                </h3>
              </div>
              <button
                onClick={() => setShowMovimientoModal(false)}
                className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={registrarMovimiento} className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMovimiento((p) => ({ ...p, tipo: 'salida' }))}
                  className={`flex h-14 items-center justify-center gap-2 rounded-2xl border-2 transition-all font-black text-xs uppercase tracking-widest ${movimiento.tipo === 'salida' ? 'border-danger-500 bg-danger-50 text-danger-500' : 'border-gray-100 text-gray-400'}`}
                >
                  <ArrowDownCircle size={18} /> Gasto
                </button>
                <button
                  type="button"
                  onClick={() => setMovimiento((p) => ({ ...p, tipo: 'entrada' }))}
                  className={`flex h-14 items-center justify-center gap-2 rounded-2xl border-2 transition-all font-black text-xs uppercase tracking-widest ${movimiento.tipo === 'entrada' ? 'border-success-500 bg-success-50 text-success-500' : 'border-gray-100 text-gray-400'}`}
                >
                  <ArrowUpCircle size={18} /> Ingreso
                </button>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Monto ($)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={movimiento.monto}
                  onChange={(e) => setMovimiento((p) => ({ ...p, monto: e.target.value }))}
                  className={CONTROL + ' h-14 text-xl font-black mt-1'}
                  placeholder="0.00"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {MOVEMENT_PRESETS.map((monto) => (
                  <button
                    key={monto}
                    type="button"
                    onClick={() => setMovimiento((p) => ({ ...p, monto: String(monto) }))}
                    className="rounded-full bg-gray-100 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-600 transition hover:bg-gray-200"
                  >
                    {fmt(monto)}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Concepto / Motivo
                </label>
                <input
                  type="text"
                  required
                  value={movimiento.motivo}
                  onChange={(e) => setMovimiento((p) => ({ ...p, motivo: e.target.value }))}
                  className={CONTROL + ' h-12 mt-1'}
                  placeholder="Ej: Compra de Hielo"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {(MOVEMENT_REASONS[movimiento.tipo] || []).map((motivo) => (
                  <button
                    key={motivo}
                    type="button"
                    onClick={() =>
                      setMovimiento((p) => ({ ...p, motivo: motivo === 'Otro' ? '' : motivo }))
                    }
                    className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition ${
                      motivo === 'Otro'
                        ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        : 'bg-primary-50 text-primary-500 hover:bg-primary-100'
                    }`}
                  >
                    {motivo === 'Otro' ? 'Otro (escribir)' : motivo}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMovimientoModal(false)}
                  className="flex-1 h-14 rounded-2xl border border-gray-200 text-xs font-black text-gray-400 uppercase tracking-widest"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`flex-[2] h-14 rounded-2xl text-white text-xs font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 ${movimiento.tipo === 'salida' ? 'bg-danger-500 shadow-danger-100 hover:bg-rose-600' : 'bg-success-500 shadow-success-100 hover:bg-emerald-600'}`}
                >
                  {saving ? '...' : 'CONFIRMAR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ActionDialog
        open={closeDialog}
        title="Finalizar turno"
        description="Se cerrará la caja del turno actual y se generará el ticket de cierre para imprimir. Esta acción no se puede deshacer."
        confirmLabel="Finalizar turno"
        cancelLabel="Cancelar"
        tone="danger"
        loading={saving}
        onConfirm={cerrarCaja}
        onClose={() => setCloseDialog(false)}
      />
    </div>
  );
}
