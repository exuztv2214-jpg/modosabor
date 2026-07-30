import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Armchair,
  ArrowRightLeft,
  Check,
  CookingPot,
  DoorOpen,
  Printer,
  Receipt,
  RefreshCw,
  X,
  Users,
  CalendarDays,
  Utensils,
} from 'lucide-react';

import api from '../lib/api.js';
import { socketManager } from '../lib/socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import ActionDialog from '../components/ActionDialog.jsx';
import tableImg from '../image/table/table.jpg';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

function minutesElapsed(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

function fmtElapsed(min) {
  if (min === null) return null;
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function elapsedTint(min) {
  if (min === null) return 'bg-white/20 text-white/80';
  if (min < 45) return 'bg-emerald-400/30 text-emerald-100';
  if (min < 90) return 'bg-amber-400/30 text-amber-100';
  return 'bg-rose-400/40 text-rose-100';
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const STATE_META = {
  nuevo: {
    label: 'NUEVO',
    classes: 'bg-primary-50 text-primary-500',
    next: 'confirmado',
    nextLabel: 'CONFIRMAR',
  },
  confirmado: {
    label: 'CONFIRMADO',
    classes: 'bg-success-50 text-success-500',
    next: 'preparando',
    nextLabel: 'PREPARAR',
  },
  preparando: {
    label: 'COCINA',
    classes: 'bg-warning-50 text-warning-500',
    next: 'listo',
    nextLabel: 'LISTO',
  },
  listo: {
    label: 'LISTO',
    classes: 'bg-success-50 text-success-500',
    next: 'entregado',
    nextLabel: 'CERRAR',
  },
};

function parseMesaNames(config) {
  const cantidad = Math.max(1, Number(config.mesas_cantidad) || 12);
  const custom = String(config.mesas_nombres || '')
    .split(/[\n,]+/)
    .map((i) => i.trim())
    .filter(Boolean);
  return custom.length > 0 ? custom : Array.from({ length: cantidad }, (_, i) => String(i + 1));
}

function StatCard({ icon: Icon, label, value, tint = 'blue' }) {
  const tints = {
    blue: 'bg-primary-50 text-primary-500',
    emerald: 'bg-success-50 text-success-500',
    amber: 'bg-warning-50 text-warning-500',
    rose: 'bg-danger-50 text-danger-500',
    slate: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className="group rounded-[32px] border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">
            {label}
          </p>
          <p className="text-xl font-black text-gray-900 tracking-tight">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:rotate-6 ${tints[tint]}`}
        >
          <Icon size={20} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

export default function Mesas() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState({});
  const [pedidos, setPedidos] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState('');
  const [printingMesa, setPrintingMesa] = useState('');

  // Estados para modales y flujos
  const [moveState, setMoveState] = useState(null); // mesa de origen del pedido a mover
  const [moveDestination, setMoveDestination] = useState('');
  const [movingLoading, setMovingLoading] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const emptyReservationForm = {
    mesa: '',
    cliente_nombre: '',
    cliente_telefono: '',
    cantidad_personas: 2,
    horario_reserva: '',
    notas: '',
  };
  const [reservationForm, setReservationForm] = useState(emptyReservationForm);
  const [reservaAccion, setReservaAccion] = useState('');
  const [cancelReservaTarget, setCancelReservaTarget] = useState(null);

  const canUseTpv = hasPermission('tpv.use');
  const canEdit = hasPermission('pedidos.edit');

  const cargar = async () => {
    setLoading(true);
    try {
      const [configData, pedidosData, reservasData] = await Promise.all([
        api.get('/configuracion'),
        api.get('/pedidos/activos'),
        api.get('/pedidos/mesas/reservas'),
      ]);
      setConfig(configData);
      setPedidos(pedidosData);
      setReservas(reservasData);
    } catch {
      toast.error('Error al cargar salón');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    socketManager.connect();
    const s1 = socketManager.on('nuevo_pedido', () => cargar());
    const s2 = socketManager.on('pedido_actualizado', () => cargar());
    return () => {
      s1();
      s2();
      socketManager.disconnect();
    };
  }, []);

  const mesas = useMemo(() => {
    const configuradas = parseMesaNames(config);
    const activas = pedidos
      .filter((p) => p.tipo_entrega === 'mesa' && p.mesa)
      .map((p) => String(p.mesa));
    const reservadas = reservas
      .filter((r) => ['reservada', 'confirmada'].includes(r.estado))
      .map((r) => String(r.mesa));
    return [...new Set([...configuradas, ...activas, ...reservadas])];
  }, [config, pedidos, reservas]);

  const ocupacion = useMemo(() => {
    const map = new Map();
    mesas.forEach((m) => {
      const abiertos = pedidos.filter(
        (p) => p.tipo_entrega === 'mesa' && String(p.mesa) === m && p.estado !== 'entregado'
      );
      const reserva = reservas.find(
        (r) => String(r.mesa) === m && ['reservada', 'confirmada'].includes(r.estado)
      );
      map.set(m, {
        abiertos,
        reserva,
        total: abiertos.reduce((acc, p) => acc + Number(p.total), 0),
      });
    });
    return map;
  }, [mesas, pedidos, reservas]);

  const stats = useMemo(() => {
    const ocu = Array.from(ocupacion.values()).filter((v) => v.abiertos.length > 0).length;
    return {
      total: mesas.length,
      libres: mesas.length - ocu,
      ocupadas: ocu,
      reservas: reservas.filter(
        (r) => ['reservada', 'confirmada'].includes(r.estado) && isToday(r.horario_reserva)
      ).length,
      totalDinero: pedidos
        .filter((p) => p.tipo_entrega === 'mesa' && p.estado !== 'entregado')
        .reduce((acc, p) => acc + Number(p.total), 0),
    };
  }, [mesas, ocupacion, pedidos, reservas]);

  const abrirMesa = (mesa) => navigate(`/admin/tpv?tipo=mesa&mesa=${encodeURIComponent(mesa)}`);

  const handleEstado = async (pedido, estado) => {
    setUpdatingKey(`${pedido.id}:${estado}`);
    try {
      await api.put(`/pedidos/${pedido.id}/estado`, { estado });
      toast.success(estado === 'entregado' ? 'Mesa cerrada' : 'Actualizado');
      await cargar();
    } catch {
      toast.error('Error');
    } finally {
      setUpdatingKey('');
    }
  };

  const handleImprimir = async (mesa) => {
    setPrintingMesa(mesa);
    try {
      const res = await api.post(`/pedidos/mesa/${encodeURIComponent(mesa)}/precuenta`);
      const win = window.open('', '_blank');
      win.document.write(res.html);
      win.document.close();
      toast.success('Precuenta enviada a ticketera');
    } catch {
      toast.error('Error al imprimir');
    } finally {
      setPrintingMesa('');
    }
  };

  const handleMoverPedido = async () => {
    if (!moveState || !moveDestination) return;
    setMovingLoading(true);
    try {
      await api.put(`/pedidos/mesa/${encodeURIComponent(moveState)}/mover`, {
        mesa_destino: moveDestination,
      });
      toast.success(`Pedido movido de mesa ${moveState} a mesa ${moveDestination}`);
      setMoveState(null);
      setMoveDestination('');
      await cargar();
    } catch (err) {
      toast.error(err?.error || 'Error al mover el pedido');
    } finally {
      setMovingLoading(false);
    }
  };

  const handleReservaEstado = async (reserva, estado) => {
    if (!reserva) return;
    setReservaAccion(`${reserva.id}:${estado}`);
    try {
      await api.put(`/pedidos/mesas/reservas/${reserva.id}`, { estado });
      toast.success(estado === 'atendida' ? 'Reserva marcada como atendida' : 'Reserva cancelada');
      setCancelReservaTarget(null);
      await cargar();
    } catch (err) {
      toast.error(err?.error || 'Error al actualizar la reserva');
    } finally {
      setReservaAccion('');
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header Modernize */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-1 bg-primary-500 rounded-full"></div>
              <p className="text-sm font-black text-primary-500 uppercase tracking-[0.3em]">
                Operación de Salón
              </p>
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Mesas y Comandas</h1>
            <p className="mt-1 text-gray-500 font-medium">
              Gestiona la ocupación y flujo de clientes en tiempo real.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setReservationOpen(true)}
              className="flex h-12 items-center gap-2 rounded-2xl bg-white border border-gray-100 px-6 text-sm font-black text-gray-700 shadow-sm hover:bg-gray-50 active:scale-95 transition-all"
            >
              <CalendarDays size={18} className="text-primary-500" strokeWidth={3} />
              NUEVA RESERVA
            </button>
            <button
              onClick={cargar}
              className="flex h-12 items-center justify-center rounded-2xl bg-primary-500 px-5 text-white shadow-lg shadow-primary-100 transition-all active:scale-95 hover:bg-primary-600"
            >
              <RefreshCw size={18} strokeWidth={3} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Metricas de Salón */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
          <StatCard icon={Armchair} label="Mesas Totales" value={stats.total} tint="slate" />
          <StatCard icon={DoorOpen} label="Mesas Libres" value={stats.libres} tint="emerald" />
          <StatCard icon={CookingPot} label="En Servicio" value={stats.ocupadas} tint="blue" />
          <StatCard icon={Users} label="Reservas Hoy" value={stats.reservas} tint="amber" />
          <StatCard
            icon={Receipt}
            label="Total en Mesas"
            value={fmt(stats.totalDinero)}
            tint="blue"
          />
        </div>

        {/* Grid de Mesas Estilo Modernize */}
        <div className="rounded-[40px] bg-white p-8 shadow-sm border border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-8">
            {mesas.map((mesa) => {
              const info = ocupacion.get(mesa);
              const libre = info.abiertos.length === 0;
              const reservada = libre && info.reserva;

              // Tiempo en mesa: pedido activo más antiguo
              const oldestCreatedAt =
                !libre && info.abiertos.length > 0
                  ? info.abiertos.reduce((oldest, p) => {
                      const t = new Date(p.creado_en).getTime();
                      return t < oldest ? t : oldest;
                    }, Infinity)
                  : null;
              const mesaMin = oldestCreatedAt
                ? minutesElapsed(new Date(oldestCreatedAt).toISOString())
                : null;

              return (
                <div key={mesa} className="flex flex-col items-center group">
                  <button
                    onClick={() => (libre ? abrirMesa(mesa) : null)}
                    className={`relative h-32 w-32 rounded-[40px] flex flex-col items-center justify-center transition-all duration-300 border-4 overflow-hidden group/btn ${
                      reservada
                        ? 'bg-warning-50 border-amber-100 text-warning-600 shadow-lg shadow-amber-50'
                        : libre
                          ? 'bg-white border-gray-100 text-gray-300 hover:border-primary-500 hover:text-primary-500 hover:shadow-xl hover:-translate-y-1'
                          : 'bg-primary-500 border-primary-500 text-white shadow-xl shadow-primary-100 scale-105'
                    }`}
                  >
                    {/* Imagen de fondo con overlay */}
                    <img
                      src={tableImg}
                      className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover/btn:scale-110 ${
                        libre && !reservada ? 'opacity-10 grayscale' : 'opacity-30'
                      }`}
                      alt=""
                    />

                    <div className="relative z-10 flex flex-col items-center justify-center">
                      {!libre && (
                        <div className="absolute -top-10 -right-10 h-8 w-8 rounded-full bg-danger-500 text-white flex items-center justify-center font-black text-xs shadow-md border-2 border-white">
                          {info.abiertos.length}
                        </div>
                      )}
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest mb-1 ${libre && !reservada ? 'text-gray-400' : 'text-current opacity-80'}`}
                      >
                        Mesa
                      </span>
                      <span className="text-3xl font-black">{mesa}</span>
                      {reservada && <CalendarDays size={16} className="mt-2 animate-bounce" />}
                      {!libre && (
                        <p className="mt-1 text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-lg backdrop-blur-sm">
                          {fmt(info.total)}
                        </p>
                      )}
                      {mesaMin !== null && (
                        <p
                          className={`mt-1 text-[9px] font-black px-2 py-0.5 rounded-lg ${elapsedTint(mesaMin)}`}
                        >
                          ⏱ {fmtElapsed(mesaMin)}
                        </p>
                      )}
                    </div>
                  </button>

                  <div className="mt-4 w-full space-y-3">
                    {/* Detalle de Pedidos si está ocupada */}
                    {info.abiertos.map((p) => {
                      const meta = STATE_META[p.estado] || STATE_META.nuevo;
                      const ordenMin = minutesElapsed(p.creado_en);
                      return (
                        <div
                          key={p.id}
                          className="rounded-2xl bg-gray-50 border border-gray-100 p-3 text-center"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-black text-gray-400">
                              ORDEN #{p.numero}
                            </p>
                            {ordenMin !== null && (
                              <span
                                className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                                  ordenMin < 45
                                    ? 'bg-success-100 text-success-600'
                                    : ordenMin < 90
                                      ? 'bg-warning-100 text-warning-600'
                                      : 'bg-danger-100 text-danger-600'
                                }`}
                              >
                                ⏱ {fmtElapsed(ordenMin)}
                              </span>
                            )}
                          </div>
                          <div
                            className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase mb-3 ${meta.classes}`}
                          >
                            {meta.label}
                          </div>
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => handleEstado(p, meta.next)}
                              className="h-8 px-3 rounded-xl bg-white border border-gray-200 text-[9px] font-black hover:bg-primary-500 hover:text-white transition-all"
                            >
                              {meta.nextLabel}
                            </button>
                            <button
                              onClick={() => handleImprimir(mesa)}
                              className="h-8 w-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:text-primary-500"
                            >
                              <Printer size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {info.abiertos.length > 0 && (
                      <button
                        onClick={() => {
                          setMoveState(mesa);
                          setMoveDestination('');
                        }}
                        className="w-full h-9 flex items-center justify-center gap-1.5 rounded-xl bg-white border border-gray-200 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:border-primary-500 hover:text-primary-500 transition-all"
                      >
                        <ArrowRightLeft size={12} />
                        Mover pedido
                      </button>
                    )}

                    {/* Botones para Reservas */}
                    {reservada && (
                      <div className="text-center">
                        <p className="text-[10px] font-black text-warning-600 uppercase mb-2 truncate px-2">
                          {info.reserva.cliente_nombre}
                        </p>
                        <button
                          onClick={() => abrirMesa(mesa)}
                          className="w-full py-2 rounded-xl bg-warning-500 text-white text-[10px] font-black shadow-lg shadow-warning-100 uppercase tracking-widest"
                        >
                          OCUPAR
                        </button>
                        <div className="mt-2 flex gap-1.5">
                          <button
                            onClick={() => handleReservaEstado(info.reserva, 'atendida')}
                            disabled={reservaAccion === `${info.reserva.id}:atendida`}
                            className="flex-1 h-8 flex items-center justify-center gap-1 rounded-xl bg-success-50 text-success-600 text-[9px] font-black uppercase tracking-widest hover:bg-success-100 transition-all disabled:opacity-60"
                          >
                            <Check size={12} />
                            Atendida
                          </button>
                          <button
                            onClick={() => setCancelReservaTarget(info.reserva)}
                            className="flex-1 h-8 flex items-center justify-center gap-1 rounded-xl bg-danger-50 text-danger-600 text-[9px] font-black uppercase tracking-widest hover:bg-danger-100 transition-all"
                          >
                            <X size={12} />
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {libre && !reservada && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-center">
                        <span className="text-[10px] font-black text-primary-500 uppercase tracking-widest">
                          Libre
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal Reserva (Modern) */}
      {reservationOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setReservationOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-[40px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-8 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-1 bg-primary-500 rounded-full"></div>
                  <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em]">
                    Agenda de Salón
                  </p>
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
                  Nueva Reserva
                </h3>
              </div>
              <button
                onClick={() => setReservationOpen(false)}
                className="rounded-full p-2 hover:bg-gray-100"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Mesa
                </label>
                <select
                  value={reservationForm.mesa}
                  onChange={(e) => setReservationForm({ ...reservationForm, mesa: e.target.value })}
                  className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold mt-1 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
                >
                  <option value="">Elegir mesa...</option>
                  {mesas.map((m) => (
                    <option key={m} value={m}>
                      Mesa {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Horario
                </label>
                <input
                  type="datetime-local"
                  value={reservationForm.horario_reserva}
                  onChange={(e) =>
                    setReservationForm({ ...reservationForm, horario_reserva: e.target.value })
                  }
                  className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold mt-1 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
                />
              </div>
              <input
                placeholder="Nombre del cliente"
                value={reservationForm.cliente_nombre}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, cliente_nombre: e.target.value })
                }
                className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold col-span-2 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
              />
              <input
                placeholder="Teléfono"
                value={reservationForm.cliente_telefono}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, cliente_telefono: e.target.value })
                }
                className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold col-span-2 sm:col-span-1 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
              />

              <input
                type="number"
                placeholder="Personas"
                value={reservationForm.cantidad_personas}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, cantidad_personas: e.target.value })
                }
                className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold col-span-2 sm:col-span-1 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
              />
              <textarea
                placeholder="Notas especiales..."
                value={reservationForm.notas}
                onChange={(e) => setReservationForm({ ...reservationForm, notas: e.target.value })}
                className="h-24 w-full rounded-2xl bg-gray-50 border-none px-4 py-3 text-sm font-bold col-span-2 resize-none outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
              />
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setReservationOpen(false)}
                className="flex-1 h-14 rounded-2xl border border-gray-200 text-xs font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50 transition-all"
              >
                CANCELAR
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.post('/pedidos/mesas/reservas', reservationForm);
                    toast.success('Reserva creada');
                    setReservationOpen(false);
                    setReservationForm(emptyReservationForm);
                    cargar();
                  } catch {
                    toast.error('Error');
                  }
                }}
                className="flex-[2] h-14 rounded-2xl bg-primary-500 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all active:scale-95 hover:bg-primary-600"
              >
                CONFIRMAR RESERVA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Mover Pedido */}
      {moveState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setMoveState(null)}
        >
          <div
            className="w-full max-w-md rounded-[40px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-1 bg-primary-500 rounded-full"></div>
                  <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em]">
                    Operación de Salón
                  </p>
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
                  Mover Pedido
                </h3>
                <p className="mt-1 text-sm text-gray-500 font-medium">
                  Mesa {moveState} pasará a otra mesa
                </p>
              </div>
              <button
                onClick={() => setMoveState(null)}
                className="rounded-full p-2 hover:bg-gray-100"
              >
                <X size={24} />
              </button>
            </div>

            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              Mesa destino
            </label>
            <select
              value={moveDestination}
              onChange={(e) => setMoveDestination(e.target.value)}
              className="h-12 w-full rounded-2xl bg-gray-50 border-none px-4 text-sm font-bold mt-1 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
            >
              <option value="">Elegir mesa destino...</option>
              {mesas
                .filter((m) => m !== moveState)
                .map((m) => {
                  const ocupada = (ocupacion.get(m)?.abiertos?.length || 0) > 0;
                  return (
                    <option key={m} value={m}>
                      Mesa {m}
                      {ocupada ? ' (ocupada)' : ''}
                    </option>
                  );
                })}
            </select>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setMoveState(null)}
                className="flex-1 h-14 rounded-2xl border border-gray-200 text-xs font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50 transition-all"
              >
                CANCELAR
              </button>
              <button
                onClick={handleMoverPedido}
                disabled={!moveDestination || movingLoading}
                className="flex-[2] h-14 rounded-2xl bg-primary-500 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all active:scale-95 hover:bg-primary-600 disabled:opacity-60"
              >
                {movingLoading ? 'MOVIENDO...' : 'CONFIRMAR MOVIMIENTO'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ActionDialog
        open={Boolean(cancelReservaTarget)}
        title={
          cancelReservaTarget ? `Cancelar reserva de ${cancelReservaTarget.cliente_nombre}` : ''
        }
        description={
          cancelReservaTarget
            ? `Se cancelará la reserva de la mesa ${cancelReservaTarget.mesa}. Esta acción no se puede deshacer.`
            : ''
        }
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        tone="danger"
        loading={reservaAccion === `${cancelReservaTarget?.id}:cancelada`}
        onConfirm={() => handleReservaEstado(cancelReservaTarget, 'cancelada')}
        onClose={() => setCancelReservaTarget(null)}
      />
    </div>
  );
}
