import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  addMinutes,
  differenceInMinutes,
  format,
  formatDistanceToNowStrict,
  parseISO,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Bike,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Clock3,
  CookingPot,
  ExternalLink,
  MapPin,
  PackageCheck,
  Phone,
  RefreshCw,
  Share2,
  Store,
  XCircle,
} from 'lucide-react';

import api from '../lib/api.js';
import { socketManager } from '../lib/socket.js';
import { paymentStatusLabel } from '../lib/paymentStatus.js';
import { normalizePedidoItems } from '../lib/pedidoItems.js';
import LiveTrackingMap from '../components/LiveTrackingMap.jsx';

const ESTADOS = [
  { key: 'nuevo', label: 'Recibido', hint: 'Lo acabamos de tomar', icon: CircleDashed },
  {
    key: 'confirmado',
    label: 'Confirmado',
    hint: 'Tu pedido ya entro en cola',
    icon: CheckCircle2,
  },
  { key: 'preparando', label: 'Preparando', hint: 'Lo estamos cocinando ahora', icon: CookingPot },
  { key: 'listo', label: 'Listo', hint: 'Ya esta preparado', icon: PackageCheck },
  { key: 'en_camino', label: 'En camino', hint: 'Va rumbo a tu direccion', icon: Bike },
  { key: 'entregado', label: 'Entregado', hint: 'Pedido finalizado', icon: CheckCircle2 },
];

const cardClass = 'rounded-2xl border border-gray-200 bg-white shadow-lg';

function money(value) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

function tipoEntregaLabel(tipo) {
  if (tipo === 'delivery') return 'Delivery';
  if (tipo === 'retiro') return 'Retiro en local';
  if (tipo === 'mesa') return 'Mesa';
  return 'Pedido';
}

function estimateLabel(pedido) {
  if (!pedido?.creado_en) return 'Sin estimacion';

  const created = parseISO(pedido.creado_en);
  const nowLabel = formatDistanceToNowStrict(created, { addSuffix: true, locale: es });

  if (pedido.estado === 'cancelado') return 'Pedido cancelado';
  if (pedido.estado === 'entregado') return 'Pedido entregado';
  if (pedido.estado === 'en_camino') return 'Tu pedido ya esta saliendo';
  if (pedido.estado === 'listo') return 'Ya esta listo para entregar';

  return `Pedido creado ${nowLabel}`;
}

function baseMinutes(pedido, config) {
  if (pedido?.tipo_entrega === 'delivery')
    return Number(pedido.tiempo_estimado_min || config.tiempo_delivery || 30);
  if (pedido?.tipo_entrega === 'retiro') return Number(config.tiempo_retiro || 20);
  return Number(config.tiempo_delivery || 30);
}

function estimateMinutesRemaining(pedido, config) {
  if (pedido?.eta_min_dinamico !== undefined && pedido?.eta_min_dinamico !== null) {
    return Number(pedido.eta_min_dinamico || 0);
  }
  if (!pedido?.creado_en) return null;
  if (pedido.estado === 'cancelado' || pedido.estado === 'entregado') return 0;

  const created = parseISO(pedido.creado_en);
  const elapsed = Math.max(0, differenceInMinutes(new Date(), created));
  const base = baseMinutes(pedido, config);

  if (pedido.estado === 'nuevo') return Math.max(base, 10);
  if (pedido.estado === 'confirmado') return Math.max(base - 2, 8);
  if (pedido.estado === 'preparando') return Math.max(base - elapsed, 6);
  if (pedido.estado === 'listo') return pedido.tipo_entrega === 'delivery' ? 10 : 5;
  if (pedido.estado === 'en_camino') return pedido.tipo_entrega === 'delivery' ? 8 : 2;

  return Math.max(base - elapsed, 5);
}

function riderLocationAgeMinutes(repartidor) {
  if (!repartidor?.ultima_ubicacion_en) return null;
  const diff = differenceInMinutes(new Date(), parseISO(repartidor.ultima_ubicacion_en));
  return Number.isFinite(diff) ? Math.max(0, diff) : null;
}

function isRiderLocationStale(repartidor) {
  const age = riderLocationAgeMinutes(repartidor);
  if (age === null) return true;
  return age > 10;
}

// ── Web Notifications helpers ──
function requestNotificationPermission() {
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  if (Notification.permission === 'denied') return Promise.resolve('denied');
  return Notification.requestPermission();
}

function sendBrowserNotification(title, body, options = {}) {
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    new Notification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: options.tag || 'modosabor',
      requireInteraction: options.requireInteraction || false,
      ...options,
    });
    return true;
  } catch (e) {
    return false;
  }
}

export default function SeguimientoPedido() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [pedido, setPedido] = useState(null);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Refs para evitar notificaciones duplicadas
  const notifiedRef = useRef({
    cerca: false, // < 500m
    llegando: false, // < 150m
    entregado: false,
  });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        if (mounted) setLoading(true);

        const pedidoUrl = token
          ? `/pedidos/${id}?token=${encodeURIComponent(token)}`
          : `/pedidos/${id}`;

        const [pedidoData, configData] = await Promise.all([
          api.get(pedidoUrl),
          api.get('/configuracion'),
        ]);

        if (!mounted) return;
        setPedido(pedidoData);
        setConfig(configData);
        setError('');
      } catch (err) {
        if (!mounted) return;
        setError('No encontramos ese pedido. Verifica el link o escribinos por WhatsApp.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 15000);

    let cleanupSocket = null;

    if (token) {
      socketManager.connect();
      socketManager.joinTracking(id, token).catch(() => {});

      cleanupSocket = socketManager.on('pedido_actualizado', (updated) => {
        if (String(updated.id) === String(id)) {
          setPedido(updated);
        }
      });

      socketManager.on('repartidor_ubicacion', (repartidor) => {
        setPedido((prev) => {
          if (!prev?.repartidor_id || String(prev.repartidor_id) !== String(repartidor.id)) {
            return prev;
          }
          return { ...prev, repartidor };
        });
      });

      // ── Eventos de proximidad desde el backend ──
      socketManager.on('repartidor_cerca', (data) => {
        if (!notifiedRef.current.cerca) {
          notifiedRef.current.cerca = true;
          sendBrowserNotification(
            'Tu delivery está cerca',
            `El repartidor está a ${Math.round(data.distancia || 0)} metros de tu dirección.`,
            { tag: 'repartidor_cerca', requireInteraction: false }
          );
        }
      });

      socketManager.on('repartidor_llegando', (data) => {
        if (!notifiedRef.current.llegando) {
          notifiedRef.current.llegando = true;
          sendBrowserNotification(
            '¡Tu delivery está llegando!',
            `El repartidor está a ${Math.round(data.distancia || 0)} metros. Preparate para recibirlo.`,
            { tag: 'repartidor_llegando', requireInteraction: true }
          );
        }
      });
    }

    return () => {
      mounted = false;
      clearInterval(interval);
      if (cleanupSocket) cleanupSocket();
      socketManager.disconnect();
    };
  }, [id, token]);

  // ── Solicitar permiso de notificación cuando pasa a "en_camino" ──
  useEffect(() => {
    if (pedido?.estado === 'en_camino' && token) {
      requestNotificationPermission().then((permission) => {
        if (permission === 'granted') {
          // Opcional: notificación de confirmación de que el tracking está activo
          sendBrowserNotification(
            'Seguimiento activado',
            'Te avisaremos cuando tu delivery esté cerca.',
            { tag: 'tracking_activo', requireInteraction: false }
          );
        }
      });
    }
  }, [pedido?.estado, token]);

  // ── Notificación de pedido entregado ──
  useEffect(() => {
    if (pedido?.estado === 'entregado' && token && !notifiedRef.current.entregado) {
      notifiedRef.current.entregado = true;
      sendBrowserNotification(
        'Pedido entregado',
        '¡Gracias por elegirnos! Tu pedido fue entregado con éxito.',
        { tag: 'pedido_entregado', requireInteraction: false }
      );
    }
  }, [pedido?.estado, token]);

  const currentStep = useMemo(() => {
    if (!pedido) return -1;
    return ESTADOS.findIndex((estado) => estado.key === pedido.estado);
  }, [pedido]);

  const tiempoEstimado = useMemo(() => {
    if (!pedido) return '';
    if (pedido.estado === 'cancelado') return 'Este pedido fue cancelado';
    if (pedido.estado === 'entregado') return 'Tu pedido ya fue entregado';
    const minutes = estimateMinutesRemaining(pedido, config);
    if (minutes === null) return 'Sin estimacion';
    if (pedido.estado === 'en_camino') return `Llega aprox en ${minutes} min`;
    if (pedido.tipo_entrega === 'delivery') return `${minutes} min estimados`;
    if (pedido.tipo_entrega === 'retiro') return `${minutes} min estimados`;
    return 'Preparacion en curso';
  }, [pedido, config]);

  const llegadaEstimada = useMemo(() => {
    if (!pedido || pedido.estado === 'cancelado' || pedido.estado === 'entregado') return '';
    const minutes = estimateMinutesRemaining(pedido, config);
    if (minutes === null) return '';
    return format(addMinutes(new Date(), minutes), 'HH:mm');
  }, [pedido, config]);

  const progressPercent = useMemo(() => {
    if (!pedido || pedido.estado === 'cancelado' || currentStep < 0) return 0;
    return Math.round((currentStep / (ESTADOS.length - 1)) * 100);
  }, [pedido, currentStep]);

  const items = useMemo(() => normalizePedidoItems(pedido?.items), [pedido]);

  const riderGpsStale = useMemo(
    () => isRiderLocationStale(pedido?.repartidor),
    [pedido?.repartidor]
  );
  const riderGpsAgeMinutes = useMemo(
    () => riderLocationAgeMinutes(pedido?.repartidor),
    [pedido?.repartidor]
  );

  const trackingUrl = useMemo(() => {
    if (!pedido) return '';
    const base = window.location.origin;
    return token
      ? `${base}/seguimiento/${pedido.id}?token=${encodeURIComponent(token)}`
      : `${base}/seguimiento/${pedido.id}`;
  }, [pedido, token]);

  const handleShare = async () => {
    const text = `Segui tu pedido #${pedido?.numero} de Modo Sabor en tiempo real: ${trackingUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Pedido #${pedido?.numero} - Modo Sabor`,
          text,
          url: trackingUrl,
        });
        return;
      } catch (err) {
        // Fallback si el usuario cancela o falla
      }
    }
    // Fallback: copiar al portapapeles
    try {
      await navigator.clipboard.writeText(text);
      alert('Link de tracking copiado al portapapeles');
    } catch (e) {
      // Fallback final: seleccionar texto
      window.prompt('Copia este link:', text);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-600">
              Seguimiento en vivo
            </p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">Tu pedido</h1>
            <p className="mt-2 text-sm text-gray-500">
              Revisa el estado del pedido y el avance de la entrega.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCw size={15} />
              Actualizar
            </button>
            {pedido && (
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                <Share2 size={15} />
                Compartir
              </button>
            )}
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-600"
            >
              Volver al menu
            </Link>
          </div>
        </div>

        {loading ? (
          <div className={`${cardClass} p-10 text-center text-gray-400`}>
            Cargando seguimiento...
          </div>
        ) : error ? (
          <div className={`${cardClass} p-10 text-center`}>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger-50 text-danger-600">
              <XCircle size={28} />
            </div>
            <h2 className="mt-4 text-xl font-bold text-gray-900">No pudimos abrir el pedido</h2>
            <p className="mt-2 text-sm text-gray-500">{error}</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.45fr,0.95fr]">
            <section className={`${cardClass} overflow-hidden`}>
              <div className="border-b border-gray-200 bg-gradient-to-r from-orange-50 to-white px-6 py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
                      Pedido #{pedido.numero}
                    </p>
                    <h2 className="mt-2 text-2xl font-bold text-gray-900">
                      {tipoEntregaLabel(pedido.tipo_entrega)}
                    </h2>
                    <p className="mt-2 text-sm text-gray-500">{estimateLabel(pedido)}</p>
                  </div>
                  <div
                    className={`rounded-full px-4 py-2 text-sm font-bold ${
                      pedido.estado === 'cancelado'
                        ? 'bg-danger-100 text-danger-700'
                        : pedido.estado === 'entregado'
                          ? 'bg-success-100 text-success-700'
                          : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {pedido.estado.replace('_', ' ')}
                  </div>
                </div>
              </div>

              <div className="px-6 py-6">
                <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                    <Clock3 size={16} className="text-orange-500" />
                    Tiempo estimado
                  </div>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{tiempoEstimado}</p>
                  {pedido.tipo_entrega === 'delivery' && pedido.delivery_zona ? (
                    <p className="mt-2 text-sm text-gray-500">
                      Zona detectada: {pedido.delivery_zona}
                    </p>
                  ) : null}
                  {pedido.tipo_entrega === 'delivery' && pedido.distancia_repartidor_km ? (
                    <p className="mt-1 text-sm text-gray-500">
                      Repartidor a {pedido.distancia_repartidor_km} km aprox
                    </p>
                  ) : null}
                  {pedido.tipo_entrega === 'delivery' && pedido.ubicacion_repartidor_atrasada ? (
                    <p className="mt-1 text-xs font-semibold text-warning-700">
                      La ultima ubicacion del repartidor ya tiene varios minutos; el ETA puede
                      variar.
                    </p>
                  ) : null}
                  {llegadaEstimada ? (
                    <p className="mt-2 text-sm text-gray-500">
                      Llegada aproximada a las {llegadaEstimada}
                    </p>
                  ) : null}
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                      <span>Progreso</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-500 to-orange-400 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Mapa de tracking en tiempo real */}
                {pedido.repartidor?.latitud && pedido.repartidor?.longitud ? (
                  <div className="mb-6 overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-primary-100 bg-primary-50 px-5 py-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary-600">
                          Tracking live
                        </p>
                        <h3 className="mt-1 text-lg font-bold text-gray-900">
                          Tu delivery en vivo
                        </h3>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700">
                        {riderGpsStale ? 'Última señal' : 'En movimiento'}
                      </div>
                    </div>
                    <div style={{ height: '360px', width: '100%' }}>
                      <LiveTrackingMap
                        riderLat={pedido.repartidor.latitud}
                        riderLng={pedido.repartidor.longitud}
                        clientLat={pedido.cliente_latitud}
                        clientLng={pedido.cliente_longitud}
                        clientAddress={pedido.cliente_direccion}
                        riderName={pedido.repartidor.nombre}
                        riderPhone={pedido.repartidor.telefono}
                        etaMinutes={
                          pedido.estado === 'en_camino'
                            ? estimateMinutesRemaining(pedido, config)
                            : null
                        }
                        isStale={riderGpsStale}
                        mapConfig={config}
                      />
                    </div>
                    {riderGpsAgeMinutes !== null ? (
                      <div className="border-t border-primary-100 bg-white px-5 py-3 text-xs font-semibold text-gray-500">
                        {riderGpsStale
                          ? `La última ubicación del rider se actualizó hace ${riderGpsAgeMinutes} min.`
                          : 'Ubicación del rider actualizada recientemente.'}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-4">
                  {ESTADOS.map((estado, index) => {
                    const active = currentStep >= index && pedido.estado !== 'cancelado';
                    const current = pedido.estado === estado.key;
                    const Icon = estado.icon;

                    return (
                      <div key={estado.key} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${
                              active
                                ? 'border-orange-500 bg-orange-50 text-orange-600'
                                : 'border-gray-300 bg-white text-gray-400'
                            }`}
                          >
                            <Icon size={18} />
                          </div>
                          {index < ESTADOS.length - 1 ? (
                            <div
                              className={`mt-2 h-10 w-0.5 ${active && currentStep > index ? 'bg-orange-400' : 'bg-slate-200'}`}
                            />
                          ) : null}
                        </div>
                        <div
                          className={`flex-1 rounded-xl border px-4 py-3 ${
                            current
                              ? 'border-orange-200 bg-orange-50/70'
                              : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-gray-900">{estado.label}</p>
                              <p className="mt-1 text-sm text-gray-500">{estado.hint}</p>
                            </div>
                            {current ? (
                              <span className="rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
                                Actual
                              </span>
                            ) : active ? (
                              <span className="rounded-full bg-success-100 px-3 py-1 text-xs font-bold text-success-700">
                                Hecho
                              </span>
                            ) : (
                              <ChevronRight size={18} className="text-slate-300" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {pedido.estado === 'cancelado' ? (
                  <div className="mt-6 rounded-xl border border-rose-200 bg-danger-50 px-4 py-4 text-sm text-danger-700">
                    El pedido fue cancelado. Si necesitas ayuda, escribinos y lo revisamos juntos.
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="space-y-6">
              <section className={`${cardClass} p-6`}>
                <h3 className="text-lg font-bold text-gray-900">Resumen</h3>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                    <span className="text-sm text-gray-500">Total</span>
                    <span className="font-bold text-gray-900">{money(pedido.total)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                    <span className="text-sm text-gray-500">Pago</span>
                    <span className="font-semibold capitalize text-gray-800">
                      {pedido.metodo_pago === 'mercadopago' ? 'MercadoPago' : pedido.metodo_pago}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                    <span className="text-sm text-gray-500">Cobro</span>
                    <span className="font-semibold text-gray-800">
                      {paymentStatusLabel(pedido.pago_estado)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                    <span className="text-sm text-gray-500">Entrega</span>
                    <span className="font-semibold text-gray-800">
                      {tipoEntregaLabel(pedido.tipo_entrega)}
                    </span>
                  </div>
                  {pedido.hora_entrega ? (
                    <div className="flex items-center justify-between rounded-xl bg-violet-50 px-4 py-3">
                      <span className="text-sm text-violet-700">Hora estimada</span>
                      <span className="font-semibold text-violet-900">{pedido.hora_entrega}</span>
                    </div>
                  ) : null}
                  {pedido.turno_operativo ? (
                    <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <span className="text-sm text-gray-500">Turno</span>
                      <span className="font-semibold text-gray-800">{pedido.turno_operativo}</span>
                    </div>
                  ) : null}
                  {pedido.tipo_entrega === 'delivery' && pedido.entrega_pin ? (
                    <div className="rounded-xl border border-amber-200 bg-warning-50 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-warning-700">
                        Codigo de entrega
                      </p>
                      <p className="mt-1 text-2xl font-bold tracking-[0.2em] text-gray-900">
                        {pedido.entrega_pin}
                      </p>
                      <p className="mt-1 text-xs text-amber-800">
                        Compartilo solo al recibir el pedido para validar la entrega.
                      </p>
                    </div>
                  ) : null}
                  {pedido.estado === 'entregado' && pedido.entrega_foto ? (
                    <div className="rounded-xl border border-emerald-200 bg-success-50 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-success-700">
                        Entrega validada
                      </p>
                      <p className="mt-1 text-sm text-emerald-900">
                        La entrega quedo registrada con comprobante de rider.
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className={`${cardClass} p-6`}>
                <h3 className="text-lg font-bold text-gray-900">Detalle</h3>
                <div className="mt-4 space-y-3">
                  {items.map((item, index) => (
                    <div
                      key={`${item.nombre}-${index}`}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-gray-900">
                            {item.cantidad}x {item.nombre}
                          </p>
                          {item.descripcion ? (
                            <p className="mt-1 text-sm text-gray-500">{item.descripcion}</p>
                          ) : null}
                        </div>
                        <span className="font-bold text-gray-900">
                          {money(Number(item.precio_unitario || 0) * Number(item.cantidad || 0))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className={`${cardClass} p-6`}>
                <h3 className="text-lg font-bold text-gray-900">Contacto</h3>
                <div className="mt-4 space-y-3 text-sm text-gray-600">
                  {pedido.cliente_nombre ? (
                    <p>
                      <strong>Cliente:</strong> {pedido.cliente_nombre}
                    </p>
                  ) : null}
                  {pedido.cliente_telefono ? (
                    <p>
                      <strong>Telefono:</strong> {pedido.cliente_telefono}
                    </p>
                  ) : null}
                  {pedido.cliente_direccion ? (
                    <div className="flex items-start gap-2">
                      <MapPin size={15} className="mt-0.5 text-orange-500" />
                      <span>{pedido.cliente_direccion}</span>
                    </div>
                  ) : null}
                  {config.negocio_telefono ? (
                    <div className="flex items-start gap-2">
                      <Store size={15} className="mt-0.5 text-orange-500" />
                      <span>
                        {config.negocio_nombre || 'Modo Sabor'} - {config.negocio_telefono}
                      </span>
                    </div>
                  ) : null}
                </div>
                {pedido.repartidor ? (
                  <div className="mt-5 rounded-xl border border-primary-100 bg-primary-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
                      Delivery
                    </p>
                    <p className="mt-2 font-bold text-gray-900">{pedido.repartidor.nombre}</p>
                    {pedido.repartidor.telefono ? (
                      <p className="mt-1 text-sm text-gray-600">
                        Tel: {pedido.repartidor.telefono}
                      </p>
                    ) : null}
                    {pedido.repartidor.vehiculo ? (
                      <p className="mt-1 text-sm text-gray-600">
                        Vehiculo: {pedido.repartidor.vehiculo}
                      </p>
                    ) : null}
                    {pedido.entrega_pin ? (
                      <p className="mt-2 text-sm font-semibold text-blue-900">
                        PIN de validacion: {pedido.entrega_pin}
                      </p>
                    ) : null}
                    {pedido.repartidor.ultima_ubicacion_en ? (
                      <p className="mt-2 text-xs text-gray-500">
                        Ultima ubicacion:{' '}
                        {formatDistanceToNowStrict(
                          parseISO(pedido.repartidor.ultima_ubicacion_en),
                          { addSuffix: true, locale: es }
                        )}
                      </p>
                    ) : null}
                    {pedido.distancia_repartidor_km ? (
                      <p className="mt-1 text-xs text-gray-500">
                        Distancia estimada: {pedido.distancia_repartidor_km} km
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
