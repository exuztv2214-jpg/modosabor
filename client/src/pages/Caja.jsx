import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardList,
  Download,
  Lock,
  Plus,
  Printer,
  RefreshCw,
  WalletCards,
  X,
} from 'lucide-react';

import api from '../lib/api.js';
import { fmtMoney } from '../lib/formatters.js';
import { paymentMethodLabel } from '../lib/paymentStatus.js';
import { useAuthenticatedSocket } from '../hooks/useAuthenticatedSocket.js';
import ActionDialog from '../components/ActionDialog.jsx';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';

import { parseFechaServidor } from '../lib/fechas.js';
const fmt = fmtMoney;
const CONTROL =
  'w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';
const OPENING_PRESETS = [0, 10000, 20000, 50000];
const MOVEMENT_PRESETS = [1000, 2000, 5000, 10000];
const MOVEMENT_REASONS = {
  entrada: ['Carga de fondo', 'Ingreso manual', 'Vuelto recuperado', 'Otro'],
  salida: ['Compra urgente', 'Pago repartidor', 'Gasto operativo', 'Retiro de efectivo', 'Otro'],
};

const TIPO_ENTREGA_LABEL = {
  mostrador: 'Mostrador',
  delivery: 'Delivery',
  mesa: 'Mesa',
  retiro: 'Retiro en local',
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
  if (!value) return '—';
  // La fecha viene en UTC sin marcar: leerla como local mostraba los cierres
  // y movimientos de caja 3 horas adelantados. Ver lib/fechas.js.
  const parsed = parseFechaServidor(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtHour(value) {
  if (!value) return '—';
  const parsed = parseFechaServidor(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Celda de CSV.
 *
 * El motivo del movimiento se metía entre comillas sin escapar las que
 * pudiera traer adentro, así que un motivo como `Compra "urgente"` partía la
 * fila en dos y corría todas las columnas del archivo.
 */
function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
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

function Card({ title, helper, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3> : null}
            {helper ? <p className="mt-0.5 text-[12px] text-gray-500">{helper}</p> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Stat({ label, value, helper, alerta = false }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: alerta ? BRAND : '#E5E7EB' }}
      />
      <div className="pl-2">
        <p className="text-[12px] text-gray-500">{label}</p>
        <p
          className="mt-1 text-[24px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: alerta ? BRAND : '#111827' }}
        >
          {value}
        </p>
        {helper ? <p className="mt-1.5 text-[11px] leading-4 text-gray-400">{helper}</p> : null}
      </div>
    </div>
  );
}

function Empty({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-[13px] text-gray-400">
      {children}
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

  const cargar = useCallback(async ({ silent = false } = {}) => {
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
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * Refresco al vender.
   *
   * Esta pantalla no escuchaba nada: abrías la caja a la mañana y los totales
   * se quedaban congelados hasta que apretabas actualizar a mano. O sea que
   * podías estar contando la plata contra un "efectivo esperado" de hace
   * cuarenta minutos. Ahora se actualiza sola cuando entra o cambia un
   * pedido, con un freno de un segundo para no recargar en ráfaga.
   */
  const recargaPendiente = useRef(null);
  const recargarConFreno = useCallback(() => {
    if (recargaPendiente.current) return;
    recargaPendiente.current = window.setTimeout(() => {
      recargaPendiente.current = null;
      cargar({ silent: true });
    }, 1000);
  }, [cargar]);

  useEffect(
    () => () => {
      if (recargaPendiente.current) window.clearTimeout(recargaPendiente.current);
    },
    []
  );

  useAuthenticatedSocket({
    nuevo_pedido: recargarConFreno,
    pedido_actualizado_admin: recargarConFreno,
  });

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
  const pendienteCobro = Number(resumen?.totalPendienteCobro || 0);

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
      toast.error('Cargá un motivo para el movimiento');
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

  const exportarMovimientosCSV = () => {
    if (!movimientos.length) return toast.error('No hay movimientos para exportar');
    const headers = ['Hora', 'Tipo', 'Motivo', 'Monto'];
    const rows = movimientos.map((m) => [
      csvCell(fmtHour(m.creado_en)),
      csvCell(m.tipo === 'entrada' ? 'Ingreso' : 'Egreso'),
      csvCell(m.motivo || 'Sin detalle'),
      Number(m.tipo === 'salida' ? -m.monto : m.monto).toFixed(2),
    ]);
    const csv = [headers.map(csvCell), ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos_caja_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Movimientos exportados');
  };

  if (loading && !data?.activa && historial.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: APP_BG }}>
        <div
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-gray-200"
          style={{ borderTopColor: BRAND }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-7xl space-y-4 pb-10">
        {/* ── Encabezado ── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Caja</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-gray-500">
              <span>
                {data?.turno_operativo?.abiertoAhora
                  ? `Turno ${data?.turno_operativo?.shiftName}`
                  : 'Fuera de turno'}
              </span>
              <span>·</span>
              <span>Fecha operativa {data?.turno_operativo?.fechaOperativa || '—'}</span>
              {data?.activa?.auto_abierta ? (
                <>
                  <span>·</span>
                  <span className="text-amber-600">Abierta automáticamente</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {data?.activa && (
              <button
                type="button"
                onClick={() => setShowMovimientoModal(true)}
                style={{ background: BRAND }}
                className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
              >
                <Plus size={16} strokeWidth={STROKE} />
                Movimiento
              </button>
            )}
            <button
              type="button"
              onClick={() => cargar()}
              className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {data?.activa ? (
          <>
            {/* ── Métricas del turno ── */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Stat
                label="Fondo inicial"
                value={fmt(data.activa.monto_inicial)}
                helper={`Abrió ${data.activa.abierta_por_nombre || 'el sistema'}`}
              />
              <Stat
                label="Efectivo cobrado"
                value={fmt(resumen?.efectivoVentas)}
                // Decía "órdenes activas en el turno" pero el número era el
                // total de pedidos no cancelados, no los que siguen abiertos.
                helper={`${resumen?.pedidos || 0} ${Number(resumen?.pedidos) === 1 ? 'pedido' : 'pedidos'} en el turno`}
              />
              <Stat
                label="Egresos manuales"
                value={fmt(resumen?.totalEgresosManuales)}
                helper={`Ingresos manuales ${fmt(resumen?.totalIngresosManuales)}`}
              />
              <Stat
                label="Efectivo esperado"
                value={fmt(efectivoEsperado)}
                helper="Fondo + cobros en efectivo − egresos"
              />
              <Stat
                label="Pagos digitales"
                value={fmt(resumen?.digitales)}
                helper={
                  pendienteCobro > 0 ? `${fmt(pendienteCobro)} todavía sin cobrar` : 'Todo cobrado'
                }
                alerta={pendienteCobro > 0}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
              <div className="space-y-4">
                {/* ── Desglose ── */}
                <Card title="Desglose de ventas del turno">
                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[12px] text-gray-500">Por método de pago</p>
                      {porMetodo.length ? (
                        <div className="space-y-1.5">
                          {porMetodo.map((m) => (
                            <div
                              key={m.metodo_pago}
                              className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-gray-900">
                                  {paymentMethodLabel(m.metodo_pago)}
                                </p>
                                <p className="text-[11px] text-gray-400">
                                  {m.cantidad} {Number(m.cantidad) === 1 ? 'pedido' : 'pedidos'}
                                </p>
                              </div>
                              <p className="shrink-0 text-[14px] font-bold tabular-nums text-gray-900">
                                {fmt(m.total)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty>Todavía no hay cobros en este turno.</Empty>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-[12px] text-gray-500">Por tipo de entrega</p>
                      {porTipo.length ? (
                        <div className="space-y-1.5">
                          {porTipo.map((t) => (
                            <div
                              key={t.tipo_entrega}
                              className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-gray-900">
                                  {TIPO_ENTREGA_LABEL[t.tipo_entrega] ||
                                    t.tipo_entrega ||
                                    'Sin definir'}
                                </p>
                                <p className="text-[11px] text-gray-400">
                                  {t.cantidad} {Number(t.cantidad) === 1 ? 'pedido' : 'pedidos'}
                                </p>
                              </div>
                              <p className="shrink-0 text-[14px] font-bold tabular-nums text-gray-900">
                                {fmt(t.total)}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty>Todavía no hay ventas clasificadas.</Empty>
                      )}
                    </div>
                  </div>

                  {porTurno.length > 1 ? (
                    <div className="mt-5 border-t border-gray-100 pt-4">
                      <p className="mb-2 text-[12px] text-gray-500">Por turno operativo</p>
                      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                        {porTurno.map((turno) => (
                          <div
                            key={turno.turno}
                            className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2"
                          >
                            <span className="truncate text-[13px] text-gray-700">
                              {turno.turno || 'Sin turno'}
                            </span>
                            <span className="shrink-0 text-[13px] font-bold tabular-nums text-gray-900">
                              {fmt(turno.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Card>

                {/* ── Movimientos manuales ── */}
                <Card
                  title="Movimientos manuales"
                  helper={`+${fmt(resumen?.totalIngresosManuales)} de ingresos · −${fmt(resumen?.totalEgresosManuales)} de egresos`}
                  action={
                    <button
                      type="button"
                      onClick={exportarMovimientosCSV}
                      disabled={!movimientos.length}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
                    >
                      <Download size={14} strokeWidth={STROKE} />
                      CSV
                    </button>
                  }
                >
                  {movimientos.length ? (
                    <div className="overflow-hidden rounded-xl border border-gray-100">
                      <table className="w-full text-left text-[13px]">
                        <thead className="bg-gray-50 text-[11px] text-gray-500">
                          <tr>
                            <th className="px-4 py-2.5 font-medium">Hora</th>
                            <th className="px-4 py-2.5 font-medium">Motivo</th>
                            <th className="px-4 py-2.5 text-right font-medium">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {movimientos.map((m) => (
                            <tr key={m.id} className="transition-colors hover:bg-gray-50">
                              <td className="px-4 py-3 tabular-nums text-gray-500">
                                {fmtHour(m.creado_en)}
                              </td>
                              <td className="px-4 py-3 text-gray-700">
                                {m.motivo || 'Sin detalle'}
                              </td>
                              <td
                                className="px-4 py-3 text-right font-bold tabular-nums"
                                style={{ color: m.tipo === 'entrada' ? '#047857' : BRAND }}
                              >
                                {m.tipo === 'entrada' ? '+' : '−'}
                                {fmt(m.monto)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty>No hubo movimientos manuales en este turno.</Empty>
                  )}
                </Card>
              </div>

              {/* ── Arqueo y cierre ── */}
              <div className="space-y-4">
                <div className="sticky top-4 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                  <div className="mb-4 flex items-center gap-2">
                    <Lock size={16} strokeWidth={STROKE} className="text-gray-400" />
                    <h3 className="text-[15px] font-semibold text-gray-900">Cerrar turno</h3>
                  </div>

                  <label className="text-[12px] font-medium text-gray-600">
                    Efectivo contado en caja
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={closing.monto_final_declarado}
                    onChange={(e) =>
                      setClosing((p) => ({ ...p, monto_final_declarado: e.target.value }))
                    }
                    className={CONTROL + ' mt-1 h-12 text-[18px] font-semibold tabular-nums'}
                    placeholder="0,00"
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setClosing((p) => ({
                          ...p,
                          monto_final_declarado: String(efectivoEsperado),
                        }))
                      }
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      Copiar esperado
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setClosing((p) => ({ ...p, monto_final_declarado: '', notas: '' }))
                      }
                      className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-gray-500 transition hover:text-gray-800"
                    >
                      Limpiar
                    </button>
                  </div>

                  <div className="mt-4 rounded-xl bg-gray-50 p-3">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-gray-500">Esperado</span>
                      <span className="font-bold tabular-nums text-gray-900">
                        {fmt(efectivoEsperado)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 text-[15px]">
                      <span className="font-semibold text-gray-900">Diferencia</span>
                      <span
                        className="font-bold tabular-nums"
                        style={{
                          color: diferencia === 0 ? '#047857' : diferencia > 0 ? '#B45309' : BRAND,
                        }}
                      >
                        {diferencia > 0 ? '+' : ''}
                        {fmt(diferencia)}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-4 text-gray-500">
                      {String(closing.monto_final_declarado).trim() === ''
                        ? 'Contá el efectivo y cargá el total para ver la diferencia.'
                        : diferencia === 0
                          ? 'El arqueo coincide con lo esperado.'
                          : diferencia > 0
                            ? 'Sobra efectivo. Conviene dejar una nota explicando de dónde salió.'
                            : 'Falta efectivo. Revisá ventas y movimientos antes de cerrar.'}
                    </p>
                  </div>

                  {pendienteCobro > 0 ? (
                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3">
                      <AlertTriangle
                        size={15}
                        strokeWidth={STROKE}
                        className="mt-0.5 shrink-0 text-amber-600"
                      />
                      <p className="text-[12px] leading-4 text-amber-900">
                        Hay {fmt(pendienteCobro)} en pedidos sin cobrar. No entran en el efectivo
                        esperado.
                      </p>
                    </div>
                  ) : null}

                  <label className="mt-4 block text-[12px] font-medium text-gray-600">
                    Notas de cierre
                  </label>
                  <textarea
                    value={closing.notas}
                    onChange={(e) => setClosing((p) => ({ ...p, notas: e.target.value }))}
                    placeholder="Diferencias, retiros, observaciones…"
                    className={CONTROL + ' mt-1 h-20 resize-none py-2.5'}
                  />

                  <button
                    type="button"
                    onClick={solicitarCierreCaja}
                    disabled={saving || String(closing.monto_final_declarado).trim() === ''}
                    style={{ background: BRAND }}
                    className="mt-4 h-12 w-full rounded-xl text-[14px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    {saving ? 'Cerrando…' : 'Finalizar turno'}
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── Caja cerrada ── */
          <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
            <Card>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                  <WalletCards size={20} strokeWidth={STROKE} />
                </div>
                <div>
                  <h2 className="text-[17px] font-semibold text-gray-900">Abrir turno</h2>
                  <p className="text-[12px] text-gray-500">
                    Cargá el fondo con el que arranca la caja
                  </p>
                </div>
              </div>

              <label className="mt-5 block text-[12px] font-medium text-gray-600">
                Fondo de apertura
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={opening.monto_inicial}
                onChange={(e) => setOpening((p) => ({ ...p, monto_inicial: e.target.value }))}
                className={CONTROL + ' mt-1 h-12 text-[18px] font-semibold tabular-nums'}
                placeholder="0,00"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {OPENING_PRESETS.map((monto) => (
                  <button
                    key={monto}
                    type="button"
                    onClick={() => setOpening((p) => ({ ...p, monto_inicial: String(monto) }))}
                    className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                  >
                    {monto === 0 ? 'Sin fondo' : fmt(monto)}
                  </button>
                ))}
              </div>

              <textarea
                value={opening.notas}
                onChange={(e) => setOpening((p) => ({ ...p, notas: e.target.value }))}
                placeholder="Notas de apertura (opcional)…"
                className={CONTROL + ' mt-3 h-20 resize-none py-2.5'}
              />

              <button
                type="button"
                onClick={abrirCaja}
                disabled={saving}
                style={{ background: BRAND }}
                className="mt-4 h-12 w-full rounded-xl text-[14px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {saving ? 'Abriendo…' : 'Abrir caja'}
              </button>

              {!data?.turno_operativo?.abiertoAhora ? (
                <p className="mt-3 text-[12px] leading-4 text-amber-700">
                  Estás fuera del horario de turno configurado. El sistema puede rechazar la
                  apertura hasta que empiece un turno.
                </p>
              ) : null}
            </Card>

            {ultimoCierre ? (
              <Card
                title="Último cierre"
                helper={fmtDateTime(ultimoCierre.cerrada_en || ultimoCierre.abierta_en)}
                action={
                  <button
                    type="button"
                    onClick={() => imprimirTicketCierre(ultimoCierre.id)}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                  >
                    <Printer size={14} strokeWidth={STROKE} />
                    Reimprimir
                  </button>
                }
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[12px] text-gray-500">Fondo inicial</p>
                    <p className="mt-1 text-[18px] font-bold tabular-nums text-gray-900">
                      {fmt(ultimoCierre.monto_inicial)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[12px] text-gray-500">Contado</p>
                    <p className="mt-1 text-[18px] font-bold tabular-nums text-gray-900">
                      {fmt(ultimoCierre.monto_final_declarado)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[12px] text-gray-500">Diferencia</p>
                    <p
                      className="mt-1 text-[18px] font-bold tabular-nums"
                      style={{
                        color: Number(ultimoCierre.diferencia) === 0 ? '#047857' : BRAND,
                      }}
                    >
                      {Number(ultimoCierre.diferencia) > 0 ? '+' : ''}
                      {fmt(ultimoCierre.diferencia)}
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <Empty>Todavía no hay cierres registrados.</Empty>
              </Card>
            )}
          </div>
        )}

        {/* ── Historial ── */}
        <Card title="Historial de turnos" helper="Últimos 20 cierres">
          {historial.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-gray-50 text-[11px] text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Apertura</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 text-right font-medium">Fondo</th>
                    <th className="px-4 py-2.5 text-right font-medium">Contado</th>
                    <th className="px-4 py-2.5 text-right font-medium">Diferencia</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historial.map((item) => {
                    const dif = Number(item.diferencia || 0);
                    return (
                      <tr key={item.id} className="transition-colors hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-700">{fmtDateTime(item.abierta_en)}</td>
                        <td className="px-4 py-3">
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={
                              item.estado === 'abierta'
                                ? { background: '#ECFDF5', color: '#065F46' }
                                : { background: '#F1F5F9', color: '#475569' }
                            }
                          >
                            {item.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                          {fmt(item.monto_inicial)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">
                          {item.estado === 'abierta' ? '—' : fmt(item.monto_final_declarado)}
                        </td>
                        <td
                          className="px-4 py-3 text-right font-bold tabular-nums"
                          style={{
                            color:
                              item.estado === 'abierta' ? '#9CA3AF' : dif === 0 ? '#047857' : BRAND,
                          }}
                        >
                          {item.estado === 'abierta' ? '—' : `${dif > 0 ? '+' : ''}${fmt(dif)}`}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.estado === 'cerrada' && (
                            <button
                              type="button"
                              onClick={() => imprimirTicketCierre(item.id)}
                              title="Reimprimir cierre"
                              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                            >
                              <Printer size={15} strokeWidth={STROKE} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Todavía no hay cierres registrados.</Empty>
          )}
        </Card>

        {/* ── Auditoría ── */}
        <Card
          title="Auditoría reciente"
          helper="Aperturas, cierres y movimientos registrados por el sistema"
          action={<ClipboardList size={16} strokeWidth={STROKE} className="mt-1 text-gray-300" />}
        >
          {auditoria.length ? (
            <div className="grid gap-2 lg:grid-cols-2">
              {auditoria.slice(0, 12).map((item) => (
                <div key={item.id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-gray-900">
                        {String(item.accion || '').replace(/_/g, ' ')}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {item.modulo} · {item.actor_nombre || 'Sistema'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                      {fmtHour(item.creado_en)}
                    </span>
                  </div>
                  {item.detalle && Object.keys(item.detalle).length > 0 && (
                    <dl className="mt-2 space-y-0.5 border-t border-gray-100 pt-2">
                      {Object.entries(item.detalle)
                        .slice(0, 3)
                        .map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-3 text-[11px]">
                            <dt className="text-gray-400">{key.replace(/_/g, ' ')}</dt>
                            <dd className="truncate text-right text-gray-600">{String(value)}</dd>
                          </div>
                        ))}
                    </dl>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty>Todavía no hay eventos de auditoría.</Empty>
          )}
        </Card>
      </div>

      {/* ── Modal de movimiento ── */}
      {showMovimientoModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          onClick={() => setShowMovimientoModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-[17px] font-semibold text-gray-900">
                {movimiento.tipo === 'salida' ? 'Registrar egreso' : 'Registrar ingreso'}
              </h3>
              <button
                type="button"
                onClick={() => setShowMovimientoModal(false)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} strokeWidth={STROKE} />
              </button>
            </div>

            <form onSubmit={registrarMovimiento} className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMovimiento((p) => ({ ...p, tipo: 'salida' }))}
                  style={movimiento.tipo === 'salida' ? { borderColor: BRAND, color: BRAND } : {}}
                  className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition ${
                    movimiento.tipo === 'salida'
                      ? 'bg-red-50'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <ArrowDownCircle size={16} strokeWidth={STROKE} />
                  Sale plata
                </button>
                <button
                  type="button"
                  onClick={() => setMovimiento((p) => ({ ...p, tipo: 'entrada' }))}
                  className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition ${
                    movimiento.tipo === 'entrada'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <ArrowUpCircle size={16} strokeWidth={STROKE} />
                  Entra plata
                </button>
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-600">Monto</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={movimiento.monto}
                  onChange={(e) => setMovimiento((p) => ({ ...p, monto: e.target.value }))}
                  className={CONTROL + ' mt-1 h-12 text-[18px] font-semibold tabular-nums'}
                  placeholder="0,00"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {MOVEMENT_PRESETS.map((monto) => (
                    <button
                      key={monto}
                      type="button"
                      onClick={() => setMovimiento((p) => ({ ...p, monto: String(monto) }))}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      {fmt(monto)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-600">Motivo</label>
                <input
                  type="text"
                  required
                  value={movimiento.motivo}
                  onChange={(e) => setMovimiento((p) => ({ ...p, motivo: e.target.value }))}
                  className={CONTROL + ' mt-1 h-11'}
                  placeholder="Ej: compra de hielo"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {(MOVEMENT_REASONS[movimiento.tipo] || []).map((motivo) => (
                    <button
                      key={motivo}
                      type="button"
                      onClick={() =>
                        setMovimiento((p) => ({ ...p, motivo: motivo === 'Otro' ? '' : motivo }))
                      }
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      {motivo === 'Otro' ? 'Otro (escribir)' : motivo}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowMovimientoModal(false)}
                  className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ background: movimiento.tipo === 'salida' ? BRAND : '#047857' }}
                  className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/*
        El diálogo decía siempre lo mismo. Ahora el monto contado y la
        diferencia van en el texto: cerrar con $40.000 de faltante era un clic
        idéntico a cerrar cuadrado.
      */}
      <ActionDialog
        open={closeDialog}
        title="Finalizar turno"
        description={
          diferencia === 0
            ? `Vas a cerrar con ${fmt(parseMoneyInput(closing.monto_final_declarado))} contados, que coincide con lo esperado. Se genera el ticket de cierre y no se puede deshacer.`
            : `Vas a cerrar con ${fmt(parseMoneyInput(closing.monto_final_declarado))} contados contra ${fmt(efectivoEsperado)} esperados: ${diferencia > 0 ? 'sobran' : 'faltan'} ${fmt(Math.abs(diferencia))}. Se genera el ticket de cierre y no se puede deshacer.`
        }
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
