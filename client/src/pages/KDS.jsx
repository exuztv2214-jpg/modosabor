import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  ChefHat,
  Clock3,
  Maximize,
  Minimize,
  PackageCheck,
  RefreshCw,
  UtensilsCrossed,
  Volume2,
  VolumeX,
  AlertCircle,
  Timer,
  ChevronRight,
  Flame,
  CalendarClock,
} from 'lucide-react';

import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import { socketManager } from '../lib/socket.js';
import { normalizePedidoItems } from '../lib/pedidoItems.js';
import { claimAlertKey, runOrderAlert, useOrderAlertPlayback } from '../lib/orderAlerts.js';
import { BRAND, STROKE, Z } from '../lib/theme.js';
import { minutosDesde as minutosDesdeServidor, parseFechaServidor } from '../lib/fechas.js';
import ActionDialog from '../components/ActionDialog.jsx';

const ESTADOS_COCINA = ['confirmado', 'preparando', 'listo'];

const COLUMNAS = [
  { estado: 'confirmado', label: 'Por preparar', icon: Clock3 },
  { estado: 'preparando', label: 'En cocina', icon: ChefHat },
  { estado: 'listo', label: 'Despachado', icon: PackageCheck },
];

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'retiro', label: 'Retiro' },
  { id: 'mesa', label: 'Mesa' },
];

const ENTREGA_LABEL = { delivery: 'Delivery', retiro: 'Retiro', mesa: 'Mesa' };

/**
 * Minutos desde que entró el pedido.
 *
 * `parseISO` solo entiende el formato con T. La base devuelve varias fechas
 * como 'YYYY-MM-DD HH:MM:SS' con espacio, y ahí `parseISO` da Invalid Date:
 * el `Math.max(0, NaN)` de antes devolvía NaN y la tarjeta mostraba "NaNm"
 * en el cronómetro. El resto del sistema ya normalizaba el espacio; acá no.
 */
function minutosDesde(fecha) {
  /*
    Normalizar el espacio no alcanzaba. La base guarda `creado_en` en UTC pero
    sin marcarlo (SQLite `CURRENT_TIMESTAMP` devuelve "2026-08-06 14:30:00"),
    así que el navegador lo leía como hora local: en Tucumán la fecha quedaba
    3 horas en el futuro, la resta contra `Date.now()` daba negativa y el
    `Math.max(0, ...)` la aplastaba a cero.

    Resultado: **todos los pedidos del KDS mostraban "0m" de espera todo el
    tiempo**. La pantalla que existe justamente para que la cocina vea qué se
    está demorando no marcaba una sola demora. Ver lib/fechas.js.
  */
  return minutosDesdeServidor(fecha) ?? 0;
}

/**
 * Un pedido con hora de entrega pactada no corre hasta que se acerca esa hora.
 *
 * Antes la urgencia se calculaba siempre sobre `creado_en`: un pedido cargado
 * a las 11 para entregar a las 21 aparecía en rojo a las 11:35, y la cocina
 * veía una alarma por algo que no tenía que hacer todavía. Con el tablero
 * lleno de rojo falso, el rojo deja de significar algo.
 */
function urgencia(pedido) {
  if (pedido.estado === 'listo') return 'ok';
  if (pedido.hora_entrega) return 'programado';
  const mins = minutosDesde(pedido.creado_en);
  if (mins >= 35) return 'urgente';
  if (mins >= 20) return 'demorado';
  return 'ok';
}

const TONOS_URGENCIA = {
  ok: { fondo: '#FFFFFF', borde: 'transparent', texto: '#9CA3AF' },
  demorado: { fondo: '#FDF3D3', borde: '#E0A924', texto: '#95661A' },
  urgente: { fondo: '#FEF2F2', borde: BRAND, texto: '#9E141E' },
  programado: { fondo: '#FFFFFF', borde: 'transparent', texto: '#6B7280' },
};

function PedidoKitchenCard({ pedido, onEstado, updatingId, canAct, onOpciones }) {
  const items = useMemo(() => normalizePedidoItems(pedido.items), [pedido.items]);
  const mins = minutosDesde(pedido.creado_en);
  const nivel = urgencia(pedido);
  const tono = TONOS_URGENCIA[nivel];
  const trabajando = updatingId === pedido.id;

  const siguiente =
    pedido.estado === 'confirmado'
      ? { estado: 'preparando', label: 'Comenzar', icon: Flame }
      : pedido.estado === 'preparando'
        ? { estado: 'listo', label: 'Marcar listo', icon: CheckCircle2 }
        : null;

  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      style={{ background: tono.fondo, boxShadow: `inset 0 0 0 1.5px ${tono.borde}` }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-bold text-white"
            style={{ background: nivel === 'urgente' ? BRAND : '#111827' }}
          >
            {pedido.numero}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold leading-tight text-gray-900">
              {ENTREGA_LABEL[pedido.tipo_entrega] || pedido.tipo_entrega}
              {pedido.mesa ? ` · Mesa ${pedido.mesa}` : ''}
            </p>
            <p className="truncate text-[12px] text-gray-500">
              {pedido.cliente_nombre || 'Mostrador'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span
            className="inline-flex items-center gap-1 text-[15px] font-bold tabular-nums"
            style={{ color: tono.texto }}
          >
            <Timer size={14} strokeWidth={STROKE} />
            {mins}m
          </span>
          {nivel === 'demorado' || nivel === 'urgente' ? (
            <span className="text-[11px] font-medium" style={{ color: tono.texto }}>
              {nivel === 'urgente' ? 'Muy demorado' : 'Demorado'}
            </span>
          ) : null}
        </div>
      </div>

      {/* La hora pactada va arriba y visible: es lo que define si esto corre. */}
      {pedido.hora_entrega ? (
        <div className="mb-3 inline-flex items-center gap-1.5 self-start rounded-lg bg-gray-100 px-2.5 py-1.5 text-[13px] font-semibold text-gray-700">
          <CalendarClock size={13} strokeWidth={STROKE} />
          Entregar {pedido.hora_entrega}
        </div>
      ) : null}

      {/* Las notas son alergias y "sin cebolla". Estaban en 11px, mayúsculas
          y en itálica: la combinación más difícil de leer a distancia. */}
      {pedido.notas ? (
        <div
          className="mb-3 flex items-start gap-2 rounded-xl px-3 py-2.5"
          style={{ background: '#FEF2F2' }}
        >
          <AlertCircle
            size={15}
            strokeWidth={STROKE}
            className="mt-0.5 shrink-0"
            style={{ color: BRAND }}
          />
          <p className="text-[14px] font-medium leading-snug" style={{ color: '#7A0F17' }}>
            {pedido.notas}
          </p>
        </div>
      ) : null}

      <div className="flex-1 space-y-1.5">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-3 rounded-xl bg-gray-50 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[16px] font-bold text-gray-900">
              {item.cantidad}
            </div>
            <div className="min-w-0 flex-1">
              {/* En mayúsculas se pierde la silueta de la palabra y se lee
                  más lento, justo al revés de lo que conviene en cocina. */}
              <p className="text-[15px] font-semibold leading-snug text-gray-900">{item.nombre}</p>
              {Object.keys(item.variantes || {}).length > 0 && (
                <p className="mt-0.5 text-[13px] text-gray-600">
                  {Object.entries(item.variantes)
                    .map(([, v]) => `${v?.nombre || v}`)
                    .join(' · ')}
                </p>
              )}
              {item.extras?.length > 0 && (
                <p className="mt-0.5 text-[13px] font-medium text-emerald-700">
                  + {item.extras.map((e) => e.nombre).join(', ')}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {canAct ? (
        <div className="mt-4 flex gap-2">
          {siguiente ? (
            <button
              type="button"
              onClick={() => onEstado(pedido.id, siguiente.estado)}
              disabled={trabajando}
              style={{ background: BRAND }}
              className="flex h-14 flex-[3] items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40"
            >
              <siguiente.icon size={19} strokeWidth={STROKE} />
              {trabajando ? 'Guardando…' : siguiente.label}
            </button>
          ) : null}

          {pedido.estado === 'listo' ? (
            <button
              type="button"
              onClick={() =>
                onEstado(pedido.id, pedido.tipo_entrega === 'delivery' ? 'en_camino' : 'entregado')
              }
              disabled={trabajando}
              className="flex h-14 flex-[3] items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[15px] font-semibold text-white transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-40"
            >
              <ChevronRight size={19} strokeWidth={STROKE} />
              {pedido.tipo_entrega === 'delivery' ? 'A reparto' : 'Entregar'}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => onOpciones?.(pedido)}
            title="Más opciones"
            className="flex h-14 flex-1 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition hover:bg-gray-200 active:scale-[0.98]"
          >
            <UtensilsCrossed size={19} strokeWidth={STROKE} />
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function KDS() {
  const { hasPermission } = useAuth();
  const { config } = useAppConfig();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [filtroEntrega, setFiltroEntrega] = useState('todos');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [, forceTick] = useState(0);
  const [opcionesModal, setOpcionesModal] = useState(null);
  const [cancelDialogId, setCancelDialogId] = useState(null);
  const { audioContextRef, voiceRef, fallbackAudioRef } = useOrderAlertPlayback();
  const canAct = hasPermission('pedidos.kitchen') || hasPermission('pedidos.edit');

  // El sonido y la config se leen desde refs adentro del handler del socket.
  // Antes estaban en el array de dependencias del efecto que monta el socket:
  // cada vez que el cocinero tocaba el botón de sonido se desconectaba y
  // reconectaba el socket entero, y en ese hueco se podían perder pedidos.
  const soundRef = useRef(soundEnabled);
  const configRef = useRef(config);
  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErrorCarga(false);
    try {
      const data = await api.get('/pedidos/activos');
      setPedidos((data || []).filter((pedido) => ESTADOS_COCINA.includes(pedido.estado)));
    } catch (error) {
      setErrorCarga(true);
      toast.error(error?.error || 'No se pudieron cargar los pedidos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);

    cargar();
    const timer = setInterval(() => forceTick((n) => n + 1), 15000);

    socketManager.connect();
    const unsubscribeNuevo = socketManager.on('nuevo_pedido', (pedido) => {
      if (!ESTADOS_COCINA.includes(pedido.estado)) return;
      setPedidos((prev) => [pedido, ...prev.filter((item) => item.id !== pedido.id)]);
      toast.success(`Pedido #${pedido.numero} en cocina`, { icon: '🍳' });
      if (soundRef.current && claimAlertKey(`nuevo:${pedido.id}`)) {
        runOrderAlert({
          pedido,
          config: configRef.current,
          audioContextRef,
          voiceRef,
          fallbackAudioRef,
        }).catch(() => {});
      }
    });
    const unsubscribeUpdate = socketManager.on('pedido_actualizado', (pedido) => {
      setPedidos((prev) => {
        const next = prev.filter((item) => item.id !== pedido.id);
        if (ESTADOS_COCINA.includes(pedido.estado)) {
          return [...next, pedido].sort(
            (a, b) => parseFechaServidor(a.creado_en) - parseFechaServidor(b.creado_en)
          );
        }
        return next;
      });
    });

    return () => {
      clearInterval(timer);
      unsubscribeNuevo();
      unsubscribeUpdate();
      socketManager.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [audioContextRef, cargar, fallbackAudioRef, voiceRef]);

  const cambiarEstado = async (id, estado) => {
    setUpdatingId(id);
    try {
      const updated = await api.put(`/pedidos/${id}/estado`, { estado });
      setPedidos((prev) => {
        const next = prev.filter((item) => item.id !== id);
        return ESTADOS_COCINA.includes(updated.estado) ? [...next, updated] : next;
      });
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar el pedido');
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmarAnularPedido = async () => {
    if (!cancelDialogId) return;
    setUpdatingId(cancelDialogId);
    try {
      await api.put(`/pedidos/${cancelDialogId}/estado`, { estado: 'cancelado' });
      setPedidos((prev) => prev.filter((p) => p.id !== cancelDialogId));
      toast.success('Pedido anulado');
    } catch (error) {
      toast.error(error?.error || 'No se pudo anular el pedido');
    } finally {
      setUpdatingId(null);
      setOpcionesModal(null);
      setCancelDialogId(null);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      toast.error('Este navegador no permitió pantalla completa');
    }
  };

  const pedidosVisibles = useMemo(
    () => pedidos.filter((p) => filtroEntrega === 'todos' || p.tipo_entrega === filtroEntrega),
    [pedidos, filtroEntrega]
  );

  return (
    <div className="py-6">
      {opcionesModal && (
        <div
          className="fixed inset-0 flex items-end justify-center bg-gray-900/40 p-4 backdrop-blur-sm sm:items-center"
          style={{ zIndex: Z.modal }}
          onClick={() => setOpcionesModal(null)}
        >
          <div
            className="w-full max-w-xs overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-[16px] font-semibold text-gray-900">
                Pedido #{opcionesModal.numero}
              </p>
              <p className="mt-0.5 text-[12px] text-gray-500">
                {opcionesModal.cliente_nombre || 'Mostrador'}
              </p>
            </div>
            <div className="space-y-0.5 p-2">
              {COLUMNAS.map(({ estado, label, icon: Icon }) => (
                <button
                  key={estado}
                  type="button"
                  onClick={() => {
                    cambiarEstado(opcionesModal.id, estado);
                    setOpcionesModal(null);
                  }}
                  disabled={opcionesModal.estado === estado}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[14px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
                >
                  <Icon size={17} strokeWidth={STROKE} className="text-gray-400" />
                  Mover a {label.toLowerCase()}
                </button>
              ))}
              <div className="my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => setCancelDialogId(opcionesModal.id)}
                disabled={updatingId === opcionesModal.id}
                className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-[14px] font-medium transition hover:bg-rose-50 disabled:opacity-40"
                style={{ color: BRAND }}
              >
                <AlertCircle size={17} strokeWidth={STROKE} />
                Anular pedido
              </button>
            </div>
            <div className="px-2 pb-2">
              <button
                type="button"
                onClick={() => setOpcionesModal(null)}
                className="h-11 w-full rounded-xl bg-gray-100 text-[14px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {errorCarga && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: '#FEF2F2' }}
        >
          <AlertCircle
            size={18}
            strokeWidth={STROKE}
            className="shrink-0"
            style={{ color: BRAND }}
          />
          <p className="flex-1 text-[13px] font-medium" style={{ color: '#7A0F17' }}>
            No se pudieron cargar los pedidos. Revisá la conexión.
          </p>
          <button
            type="button"
            onClick={cargar}
            style={{ background: BRAND }}
            className="h-9 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Cocina</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-gray-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            En vivo · {pedidosVisibles.length} pedidos en pantalla
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-gray-100 p-1">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltroEntrega(f.id)}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition ${
                  filtroEntrega === f.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSoundEnabled((s) => !s)}
            title={soundEnabled ? 'Silenciar avisos' : 'Activar avisos'}
            className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition ${
              soundEnabled ? 'text-emerald-600' : 'text-gray-400'
            }`}
          >
            {soundEnabled ? (
              <Volume2 size={19} strokeWidth={STROKE} />
            ) : (
              <VolumeX size={19} strokeWidth={STROKE} />
            )}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Pantalla completa"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:text-gray-800"
          >
            {isFullscreen ? (
              <Minimize size={19} strokeWidth={STROKE} />
            ) : (
              <Maximize size={19} strokeWidth={STROKE} />
            )}
          </button>
          <button
            type="button"
            onClick={cargar}
            disabled={loading}
            style={{ background: BRAND }}
            className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {COLUMNAS.map((col) => {
          const Icon = col.icon;
          const rows = pedidosVisibles
            .filter((p) => p.estado === col.estado)
            .sort((a, b) => parseFechaServidor(a.creado_en) - parseFechaServidor(b.creado_en));

          return (
            <section key={col.estado} className="flex min-h-[60vh] flex-col">
              <div className="mb-3 flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                <Icon size={18} strokeWidth={STROKE} className="text-gray-400" />
                <span className="text-[15px] font-semibold text-gray-900">{col.label}</span>
                <span className="ml-auto flex h-7 min-w-[28px] items-center justify-center rounded-lg bg-gray-100 px-2 text-[13px] font-semibold text-gray-700">
                  {rows.length}
                </span>
              </div>

              <div className="space-y-3">
                {/* Mientras cargaba, las tres columnas decían "sin tareas
                    pendientes": la cocina leía que no había pedidos cuando en
                    realidad todavía no habían llegado. */}
                {loading && pedidos.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
                    <RefreshCw
                      size={20}
                      className="mx-auto mb-2 animate-spin text-gray-300"
                      strokeWidth={2}
                    />
                    <p className="text-[13px] text-gray-400">Cargando pedidos…</p>
                  </div>
                ) : rows.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-gray-200 py-16 text-center">
                    <UtensilsCrossed
                      size={22}
                      strokeWidth={1.4}
                      className="mx-auto mb-2 text-gray-200"
                    />
                    <p className="text-[13px] text-gray-400">Nada acá</p>
                  </div>
                ) : (
                  rows.map((p) => (
                    <PedidoKitchenCard
                      key={p.id}
                      pedido={p}
                      onEstado={cambiarEstado}
                      updatingId={updatingId}
                      canAct={canAct}
                      onOpciones={setOpcionesModal}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      <ActionDialog
        open={Boolean(cancelDialogId)}
        title="¿Anular este pedido?"
        description="Sale del flujo de cocina y queda cancelado. Si ya se empezó a preparar, la mercadería no se recupera."
        confirmLabel="Anular pedido"
        cancelLabel="Volver"
        tone="danger"
        onConfirm={confirmarAnularPedido}
        onClose={() => setCancelDialogId(null)}
      />
    </div>
  );
}
