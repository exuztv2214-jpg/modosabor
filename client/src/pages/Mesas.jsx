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
  Wallet,
} from 'lucide-react';

import api from '../lib/api.js';
import { socketManager } from '../lib/socket.js';
import { useAuth } from '../context/AuthContext.jsx';
import ActionDialog from '../components/ActionDialog.jsx';
import tableImg from '../image/table/table.jpg';
import { BRAND, STROKE, Z, estadoTono } from '../lib/theme.js';
import { minutosDesde as minutosDesdeServidor, parseFechaServidor } from '../lib/fechas.js';
import { isPagoPagado } from '../lib/paymentStatus.js';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

const METODO_LABELS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  modo: 'MODO',
  uala: 'Ualá',
  tarjeta: 'Tarjeta',
  mercadopago: 'Mercado Pago',
};

const metodoLabel = (valor) => METODO_LABELS[String(valor || '').toLowerCase()] || 'Efectivo';

/**
 * Medios de cobro que se le ofrecen al mozo.
 *
 * Salen de la configuración del negocio, igual que en el TPV y en la app del
 * repartidor, para que las tres pantallas ofrezcan lo mismo. Mercado Pago se
 * saca: ese cobro lo confirma el proveedor y no se puede marcar a mano.
 */
function metodosDeCobro(config) {
  let habilitados = [];
  try {
    habilitados = JSON.parse(config?.metodos_pago || '[]');
  } catch {
    habilitados = [];
  }
  if (!Array.isArray(habilitados) || habilitados.length === 0) {
    habilitados = ['efectivo', 'transferencia', 'modo', 'uala'];
  }
  return habilitados.filter((m) => m !== 'mercadopago');
}

// La base guarda `creado_en` en UTC pero sin marcarlo. Normalizar sólo el
// espacio no alcanzaba: el navegador lo leía como hora local y en Tucumán la
// fecha quedaba 3 horas adelantada, así que el tiempo en mesa daba negativo y
// se mostraba siempre "0m". Ver lib/fechas.js.
function minutesElapsed(dateStr) {
  return minutosDesdeServidor(dateStr);
}

function fmtElapsed(min) {
  if (min === null) return null;
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function elapsedTono(min) {
  if (min === null) return { bg: '#F1F5F9', fg: '#64748B' };
  if (min < 45) return { bg: '#ECFDF5', fg: '#047857' };
  if (min < 90) return { bg: '#FEF6E7', fg: '#92400E' };
  return { bg: '#FEF2F2', fg: '#B91C1C' };
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
  nuevo: { next: 'confirmado', nextLabel: 'Confirmar' },
  confirmado: { next: 'preparando', nextLabel: 'Preparar' },
  preparando: { next: 'listo', nextLabel: 'Listo' },
  listo: { next: 'entregado', nextLabel: 'Cerrar' },
};

function parseMesaNames(config) {
  const cantidad = Math.max(1, Number(config.mesas_cantidad) || 12);
  const custom = String(config.mesas_nombres || '')
    .split(/[\n,]+/)
    .map((i) => i.trim())
    .filter(Boolean);
  return custom.length > 0 ? custom : Array.from({ length: cantidad }, (_, i) => String(i + 1));
}

const STAT_TONES = {
  brand: { bg: '#FEF2F2', fg: BRAND },
  emerald: { bg: '#ECFDF5', fg: '#047857' },
  amber: { bg: '#FEF6E7', fg: '#92400E' },
  slate: { bg: '#F1F5F9', fg: '#475569' },
};

function StatCard({ icon: Icon, label, value, tone = 'slate' }) {
  const t = STAT_TONES[tone] || STAT_TONES.slate;
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-[12px] font-medium text-gray-400">{label}</p>
          <p className="text-xl font-semibold text-gray-900">{value}</p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: t.bg, color: t.fg }}
        >
          <Icon size={20} strokeWidth={STROKE} />
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
  const [cobrandoId, setCobrandoId] = useState(null);
  // Pedido cuyo cobro se está por registrar. Abre el selector de método.
  const [cobroTarget, setCobroTarget] = useState(null);

  // Estados para modales y flujos
  const [moveState, setMoveState] = useState(null); // mesa de origen del pedido a mover
  const [moveDestination, setMoveDestination] = useState('');
  const [movingLoading, setMovingLoading] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [reservationLoading, setReservationLoading] = useState(false);
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
    } catch (error) {
      toast.error(error?.error || 'Error al cargar salón');
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

  /*
    Escape cierra el cobro. Se escucha en el documento y no en el contenedor
    del modal porque el foco está en los botones de medio de pago: un
    onKeyDown colgado del div nunca se dispararía.
  */
  useEffect(() => {
    if (!cobroTarget) return undefined;
    const alPresionar = (evento) => {
      if (evento.key === 'Escape') setCobroTarget(null);
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [cobroTarget]);

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
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar el pedido');
    } finally {
      setUpdatingKey('');
    }
  };

  const handleImprimir = async (mesa) => {
    setPrintingMesa(mesa);
    try {
      const res = await api.post(`/pedidos/mesa/${encodeURIComponent(mesa)}/precuenta`);
      const win = window.open('', '_blank');
      // `window.open` devuelve null si el navegador bloquea la ventana, cosa
      // que pasa seguido. Sin esta guarda, `win.document` tiraba TypeError,
      // lo agarraba el catch de abajo y el mozo veía "Error al imprimir" sin
      // saber que el problema era el bloqueador de pop-ups.
      if (!win) {
        toast.error('El navegador bloqueó la ventana de impresión. Permití los pop-ups del sitio.');
        return;
      }
      win.document.write(res.html);
      win.document.close();
      toast.success('Precuenta enviada a la ticketera');
    } catch (error) {
      toast.error(error?.error || 'No se pudo generar la precuenta');
    } finally {
      setPrintingMesa('');
    }
  };

  /*
    Cobrar la mesa.

    Un pedido de mesa nace pendiente de cobro, porque el cliente pide, come y
    paga al final —para eso está la precuenta de acá al lado—. Alguien tiene
    que decir "ya pagó", y ese alguien está parado en esta pantalla, no en
    Pedidos: obligar a ir hasta el listado para cerrar cada mesa era cambiar
    un número mal por un paso de más en el peor momento del servicio.
  */
  const handleCobrar = async (pedido, metodoPago) => {
    setCobrandoId(pedido.id);
    try {
      /*
        Se manda el método junto con el cobro. Sin esto la mesa quedaba cobrada
        con lo que se había elegido al cargar el pedido —una suposición hecha
        cuando el cliente todavía miraba la carta— y el cierre de caja repartía
        mal entre efectivo y digital.
      */
      await api.put(`/pedidos/${pedido.id}/pago`, {
        pago_estado: 'pagado',
        metodo_pago: metodoPago,
      });
      toast.success(`Cobrado ${fmt(pedido.total)} en ${metodoLabel(metodoPago)}`);
      setCobroTarget(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo registrar el cobro');
    } finally {
      setCobrandoId(null);
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

  const handleCrearReserva = async () => {
    if (!reservationForm.mesa || !reservationForm.horario_reserva) {
      toast.error('Elegí una mesa y un horario');
      return;
    }
    setReservationLoading(true);
    try {
      await api.post('/pedidos/mesas/reservas', reservationForm);
      toast.success('Reserva creada');
      setReservationOpen(false);
      setReservationForm(emptyReservationForm);
      cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo crear la reserva');
    } finally {
      setReservationLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[12px] font-medium text-gray-400">Operación de salón</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">Mesas y comandas</h1>
            <p className="mt-1 text-[13px] text-gray-500">
              Ocupación y flujo de clientes en tiempo real.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setReservationOpen(true)}
              className="flex h-11 items-center gap-2 rounded-xl bg-white border border-gray-200 px-5 text-[14px] font-medium text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <CalendarDays size={16} style={{ color: BRAND }} strokeWidth={STROKE} />
              Nueva reserva
            </button>
            <button
              onClick={cargar}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm transition-all active:scale-[0.98]"
              style={{ background: BRAND }}
              aria-label="Actualizar"
            >
              <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Métricas de salón */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
          <StatCard icon={Armchair} label="Mesas totales" value={stats.total} tone="slate" />
          <StatCard icon={DoorOpen} label="Mesas libres" value={stats.libres} tone="emerald" />
          <StatCard icon={CookingPot} label="En servicio" value={stats.ocupadas} tone="brand" />
          <StatCard icon={Users} label="Reservas hoy" value={stats.reservas} tone="amber" />
          <StatCard
            icon={Receipt}
            label="Total en mesas"
            value={fmt(stats.totalDinero)}
            tone="brand"
          />
        </div>

        {/* Grid de mesas */}
        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
            {mesas.map((mesa) => {
              const info = ocupacion.get(mesa);
              const libre = info.abiertos.length === 0;
              const reservada = libre && info.reserva;

              // Tiempo en mesa: pedido activo más antiguo
              const oldestCreatedAt =
                !libre && info.abiertos.length > 0
                  ? info.abiertos.reduce((oldest, p) => {
                      const t = parseFechaServidor(p.creado_en).getTime();
                      if (!Number.isFinite(t)) return oldest;
                      return t < oldest ? t : oldest;
                    }, Infinity)
                  : null;
              const mesaMin =
                oldestCreatedAt && Number.isFinite(oldestCreatedAt)
                  ? Math.max(0, Math.floor((Date.now() - oldestCreatedAt) / 60000))
                  : null;
              const mesaTono = elapsedTono(mesaMin);

              return (
                <div key={mesa} className="flex flex-col items-center group">
                  <button
                    onClick={() => (libre ? abrirMesa(mesa) : null)}
                    className="relative h-28 w-28 rounded-3xl flex flex-col items-center justify-center transition-all duration-200 overflow-hidden"
                    style={
                      reservada
                        ? { background: '#FEF6E7', color: '#92400E', border: '1px solid #FDE9C4' }
                        : libre
                          ? { background: '#fff', color: '#9CA3AF', border: '1px solid #E5E7EB' }
                          : { background: BRAND, color: '#fff', border: `1px solid ${BRAND}` }
                    }
                  >
                    {/* Imagen de fondo con overlay */}
                    <img
                      src={tableImg}
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ opacity: libre && !reservada ? 0.08 : 0.22 }}
                      alt=""
                    />

                    <div className="relative z-10 flex flex-col items-center justify-center">
                      {!libre && (
                        <div className="absolute -top-9 -right-9 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 text-[11px] font-semibold text-white">
                          {info.abiertos.length}
                        </div>
                      )}
                      <span className="text-[11px] font-medium opacity-75">Mesa</span>
                      <span className="text-2xl font-semibold">{mesa}</span>
                      {reservada && <CalendarDays size={14} className="mt-2" />}
                      {!libre && (
                        <p className="mt-1 rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">
                          {fmt(info.total)}
                        </p>
                      )}
                      {mesaMin !== null && (
                        <p
                          className="mt-1 rounded-md px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: mesaTono.bg, color: mesaTono.fg }}
                        >
                          ⏱ {fmtElapsed(mesaMin)}
                        </p>
                      )}
                    </div>
                  </button>

                  <div className="mt-3 w-full space-y-2.5">
                    {/* Detalle de pedidos si está ocupada */}
                    {info.abiertos.map((p) => {
                      const meta = STATE_META[p.estado] || STATE_META.nuevo;
                      const tono = estadoTono(p.estado);
                      const ordenMin = minutesElapsed(p.creado_en);
                      const ordenTono = elapsedTono(ordenMin);
                      return (
                        <div
                          key={p.id}
                          className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-center"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-[11px] font-medium text-gray-400">
                              Orden #{p.numero}
                            </p>
                            {ordenMin !== null && (
                              <span
                                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ background: ordenTono.bg, color: ordenTono.fg }}
                              >
                                ⏱ {fmtElapsed(ordenMin)}
                              </span>
                            )}
                          </div>
                          <div
                            className="mb-3 inline-block rounded-lg px-3 py-1 text-[11px] font-medium"
                            style={{ background: tono.bg, color: tono.fg }}
                          >
                            {tono.label}
                          </div>
                          <div className="flex justify-center gap-1.5">
                            {meta.next && (
                              <button
                                onClick={() => handleEstado(p, meta.next)}
                                disabled={updatingKey === `${p.id}:${meta.next}`}
                                className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-[11px] font-medium text-gray-700 transition-colors hover:text-white disabled:opacity-60"
                                style={{ '--hover-bg': BRAND }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = BRAND)}
                                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                              >
                                {meta.nextLabel}
                              </button>
                            )}
                            <button
                              onClick={() => handleImprimir(mesa)}
                              disabled={printingMesa === mesa}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-gray-700 disabled:opacity-60"
                            >
                              <Printer size={13} strokeWidth={STROKE} />
                            </button>
                          </div>

                          {/*
                            El cobro va acá abajo y ocupa todo el ancho a
                            propósito: es lo último que pasa en la mesa y lo
                            único que mueve plata. Si ya se cobró queda el
                            cartel en verde, sin botón, para que nadie lo
                            toque dos veces.
                          */}
                          {isPagoPagado(p.pago_estado) ? (
                            <div className="mt-2 rounded-lg bg-success-50 px-3 py-1.5 text-[11px] font-semibold text-success-700">
                              Cobrado · {fmt(p.total)}
                            </div>
                          ) : !canEdit ? (
                            /*
                              Sin permiso para tocar pedidos no se muestra el
                              botón: el servidor lo rechazaría igual y el mozo
                              se comería un error sin entender por qué. Se deja
                              el aviso para que sepa que falta cobrar y avise a
                              quien sí puede.
                            */
                            <div className="mt-2 rounded-lg bg-warning-50 px-3 py-1.5 text-[11px] font-semibold text-warning-700">
                              Sin cobrar · {fmt(p.total)}
                            </div>
                          ) : (
                            <button
                              onClick={() => setCobroTarget(p)}
                              disabled={cobrandoId === p.id}
                              className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-success-600 px-3 text-[11px] font-semibold text-white transition-colors hover:bg-success-700 disabled:opacity-60"
                            >
                              <Wallet size={13} strokeWidth={STROKE} />
                              {cobrandoId === p.id ? 'Cobrando…' : `Cobrar ${fmt(p.total)}`}
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {info.abiertos.length > 0 && (
                      <button
                        onClick={() => {
                          setMoveState(mesa);
                          setMoveDestination('');
                        }}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white text-[12px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <ArrowRightLeft size={13} strokeWidth={STROKE} />
                        Mover pedido
                      </button>
                    )}

                    {/* Botones para reservas */}
                    {reservada && (
                      <div className="text-center">
                        <p className="mb-2 truncate px-2 text-[12px] font-medium text-amber-700">
                          {info.reserva.cliente_nombre}
                        </p>
                        <button
                          onClick={() => abrirMesa(mesa)}
                          className="w-full rounded-lg bg-amber-500 py-2 text-[12px] font-medium text-white shadow-sm"
                        >
                          Ocupar
                        </button>
                        <div className="mt-2 flex gap-1.5">
                          <button
                            onClick={() => handleReservaEstado(info.reserva, 'atendida')}
                            disabled={reservaAccion === `${info.reserva.id}:atendida`}
                            className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-50 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-60"
                          >
                            <Check size={13} strokeWidth={STROKE} />
                            Atendida
                          </button>
                          <button
                            onClick={() => setCancelReservaTarget(info.reserva)}
                            className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-rose-50 text-[11px] font-medium text-rose-600 hover:bg-rose-100 transition-all"
                          >
                            <X size={13} strokeWidth={STROKE} />
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {libre && !reservada && (
                      <div className="flex justify-center opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="text-[12px] font-medium" style={{ color: BRAND }}>
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

      {/* Modal reserva */}
      {reservationOpen && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
          }}
          className="fixed inset-0 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          style={{ zIndex: Z.modal }}
          onClick={() => setReservationOpen(false)}
        >
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
            }}
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-gray-400">Agenda de salón</p>
                <h3 className="text-lg font-semibold text-gray-900">Nueva reserva</h3>
              </div>
              <button
                onClick={() => setReservationOpen(false)}
                className="rounded-full p-2 hover:bg-gray-100"
              >
                <X size={20} strokeWidth={STROKE} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label
                  htmlFor="field-Mesas-jsx-671-0"
                  className="ml-1 text-[12px] font-medium text-gray-400"
                >
                  Mesa
                </label>
                <select
                  id="field-Mesas-jsx-671-0"
                  value={reservationForm.mesa}
                  onChange={(e) => setReservationForm({ ...reservationForm, mesa: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border-none bg-gray-50 px-4 text-[14px] font-medium outline-none focus:ring-2"
                  style={{ '--tw-ring-color': `${BRAND}33` }}
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
                <label
                  htmlFor="field-Mesas-jsx-687-1"
                  className="ml-1 text-[12px] font-medium text-gray-400"
                >
                  Horario
                </label>
                <input
                  id="field-Mesas-jsx-687-1"
                  type="datetime-local"
                  value={reservationForm.horario_reserva}
                  onChange={(e) =>
                    setReservationForm({ ...reservationForm, horario_reserva: e.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-xl border-none bg-gray-50 px-4 text-[14px] font-medium outline-none"
                />
              </div>
              <input
                placeholder="Nombre del cliente"
                value={reservationForm.cliente_nombre}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, cliente_nombre: e.target.value })
                }
                className="col-span-2 h-11 w-full rounded-xl border-none bg-gray-50 px-4 text-[14px] font-medium outline-none"
              />
              <input
                placeholder="Teléfono"
                value={reservationForm.cliente_telefono}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, cliente_telefono: e.target.value })
                }
                className="col-span-2 h-11 w-full rounded-xl border-none bg-gray-50 px-4 text-[14px] font-medium outline-none sm:col-span-1"
              />

              <input
                type="number"
                placeholder="Personas"
                value={reservationForm.cantidad_personas}
                onChange={(e) =>
                  setReservationForm({ ...reservationForm, cantidad_personas: e.target.value })
                }
                className="col-span-2 h-11 w-full rounded-xl border-none bg-gray-50 px-4 text-[14px] font-medium outline-none sm:col-span-1"
              />
              <textarea
                placeholder="Notas especiales..."
                value={reservationForm.notas}
                onChange={(e) => setReservationForm({ ...reservationForm, notas: e.target.value })}
                className="col-span-2 h-20 w-full resize-none rounded-xl border-none bg-gray-50 px-4 py-3 text-[14px] font-medium outline-none"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setReservationOpen(false)}
                className="h-12 flex-1 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearReserva}
                disabled={reservationLoading}
                className="h-12 flex-[2] rounded-xl text-[13px] font-medium text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-60"
                style={{ background: BRAND }}
              >
                {reservationLoading ? 'Creando...' : 'Confirmar reserva'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal mover pedido */}
      {moveState && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
          }}
          className="fixed inset-0 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          style={{ zIndex: Z.modal }}
          onClick={() => setMoveState(null)}
        >
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
            }}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-gray-400">Operación de salón</p>
                <h3 className="text-lg font-semibold text-gray-900">Mover pedido</h3>
                <p className="mt-1 text-[13px] text-gray-500">
                  Mesa {moveState} pasará a otra mesa
                </p>
              </div>
              <button
                onClick={() => setMoveState(null)}
                className="rounded-full p-2 hover:bg-gray-100"
              >
                <X size={20} strokeWidth={STROKE} />
              </button>
            </div>

            <label
              htmlFor="field-Mesas-jsx-778-2"
              className="ml-1 text-[12px] font-medium text-gray-400"
            >
              Mesa destino
            </label>
            <select
              id="field-Mesas-jsx-778-2"
              value={moveDestination}
              onChange={(e) => setMoveDestination(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border-none bg-gray-50 px-4 text-[14px] font-medium outline-none"
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

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setMoveState(null)}
                className="h-12 flex-1 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-500 hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleMoverPedido}
                disabled={!moveDestination || movingLoading}
                className="h-12 flex-[2] rounded-xl text-[13px] font-medium text-white shadow-sm transition-all active:scale-[0.98] disabled:opacity-60"
                style={{ background: BRAND }}
              >
                {movingLoading ? 'Moviendo...' : 'Confirmar movimiento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        Cobro de la mesa.

        El método es la pregunta, no un detalle: por eso cada medio es un botón
        que cobra directo, sin un "confirmar" después. Un toque, una decisión.
        El total va grande arriba porque es lo que el mozo está por cantar.
      */}
      {cobroTarget && (
        <div
          className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          /*
            Sólo cierra si el clic cae en el fondo, no en la tarjeta. Se mira
            el destino del evento en vez de frenar la propagación adentro:
            así el contenedor del diálogo queda sin manejadores y no promete
            un comportamiento de teclado que no tiene.
          */
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setCobroTarget(null);
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-[32px] bg-white p-7 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Registrar el cobro de la mesa"
          >
            <p className="text-[13px] font-medium text-gray-400">
              Mesa {cobroTarget.mesa} · Orden #{cobroTarget.numero}
            </p>
            <p className="mb-1 mt-1 text-3xl font-semibold text-gray-900">
              {fmt(cobroTarget.total)}
            </p>
            <p className="mb-5 text-[13px] font-medium text-gray-500">¿Con qué pagó?</p>

            <div className="grid grid-cols-2 gap-2">
              {metodosDeCobro(config).map((metodo) => (
                <button
                  key={metodo}
                  type="button"
                  disabled={cobrandoId === cobroTarget.id}
                  onClick={() => handleCobrar(cobroTarget, metodo)}
                  className="min-h-12 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-semibold text-gray-700 transition-colors hover:border-success-600 hover:bg-success-50 hover:text-success-700 disabled:opacity-60"
                >
                  {metodoLabel(metodo)}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setCobroTarget(null)}
              className="mt-4 h-10 w-full rounded-xl text-[13px] font-semibold text-gray-400 hover:text-gray-700"
            >
              Volver
            </button>
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
