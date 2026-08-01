import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

import AnimatedNumber from '../components/AnimatedNumber.jsx';
import { fireRiderConfetti, speakRider } from '../lib/riderCelebration.js';
import {
  enqueueRiderAction,
  processRiderQueue,
  readQueue as readRiderQueue,
} from '../lib/riderOfflineQueue.js';
import {
  Truck,
  MapPin,
  Phone,
  Navigation,
  CheckCircle2,
  AlertCircle,
  LogOut,
  RefreshCw,
  Package,
  ChevronRight,
  User,
  ShoppingBag,
  Smartphone,
  X,
  LocateFixed,
  Copy,
  Clock,
  CreditCard,
  Zap,
  ZapOff,
  History,
  PhoneCall,
  Star,
  List,
  Route,
  Flag,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { paymentMethodLabel, paymentStatusLabel, paymentStatusTone } from '../lib/paymentStatus.js';
import { normalizePedidoItems } from '../lib/pedidoItems.js';
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsEmbedUrl,
  buildWazeUrl,
} from '../lib/maps.js';
import { filterRiderGpsPosition } from '../lib/riderGps.js';
import { resolveAssetUrl } from '../lib/assets.js';
import {
  isNativeRiderApp,
  clearNativeRiderAuth,
  getRiderLocationPermission,
  loadNativeRiderAuth,
  notifyRiderNewOrder,
  openNativeLocationSettings,
  prepareRiderNotifications,
  requestRiderLocationAccess,
  saveNativeRiderAuth,
  sendRiderLocationUpdate,
  startRiderLocationWatcher,
  riderStorageGet,
  riderStorageSet,
  riderStorageRemove,
} from '../lib/nativeRiderGps.js';
import api from '../lib/api.js';
import { socketManager } from '../lib/socket.js';
import { runDeliveredAlert, runOrderAlert, useOrderAlertPlayback } from '../lib/orderAlerts.js';
import RiderRouteMap from '../components/RiderRouteMap.jsx';

// ── Helpers ────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const parseDate = (str) => parseISO(String(str || '').replace(' ', 'T'));
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const riderHistoryKey = (riderId) => `ms_rider_history_${riderId}_${todayStr()}`;

function fmtTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function destinationUrl(pedido, config = {}) {
  return buildGoogleMapsDirectionsUrl(
    {
      latitud: pedido?.cliente_latitud,
      longitud: pedido?.cliente_longitud,
      direccion: pedido?.cliente_direccion,
      ubicacionExacta: Boolean(pedido?.cliente_ubicacion_exacta),
    },
    config
  );
}

function destinationEmbedUrl(pedido, config = {}) {
  return buildGoogleMapsEmbedUrl(
    {
      latitud: pedido?.cliente_latitud,
      longitud: pedido?.cliente_longitud,
      direccion: pedido?.cliente_direccion,
      ubicacionExacta: Boolean(pedido?.cliente_ubicacion_exacta),
    },
    config,
    { zoom: 16 }
  );
}

// ── Haversine distance ──
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Sort pedidos by distance from rider ──
function sortByDistance(pedidos, riderLat, riderLng) {
  return pedidos
    .filter((p) => p.cliente_latitud && p.cliente_longitud)
    .map((p) => ({
      ...p,
      distance: haversine(riderLat, riderLng, p.cliente_latitud, p.cliente_longitud),
    }))
    .sort((a, b) => a.distance - b.distance);
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return (
    Boolean(window.navigator?.standalone) ||
    Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches)
  );
}

function swapManifest(nextHref) {
  if (typeof document === 'undefined') return () => {};
  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (!manifestLink) return () => {};
  const previousHref = manifestLink.getAttribute('href');
  manifestLink.setAttribute('href', nextHref);
  return () => {
    if (previousHref) {
      manifestLink.setAttribute('href', previousHref);
    }
  };
}

// ── PIN Modal ──────────────────────────────────────────────────────
function PinModal({ pedidoNumero, onConfirm, onClose }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tap = (d) => {
    if (value.length >= 8) return;
    setValue((p) => p + d);
    if (navigator.vibrate) navigator.vibrate(25);
  };
  const back = () => setValue((p) => p.slice(0, -1));

  const submit = async () => {
    if (!value.trim()) {
      setError('Ingresá el PIN');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onConfirm(value.trim());
    } catch (err) {
      setError(err?.error || 'PIN incorrecto. Intentá de nuevo.');
      setValue('');
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } finally {
      setLoading(false);
    }
  };

  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', null, '0', '⌫'];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          background: 'white',
          borderRadius: '32px 32px 0 0',
          padding: '32px 20px 44px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.22em',
              color: '#9CA3AF',
              marginBottom: '8px',
            }}
          >
            PIN de entrega · Pedido #{pedidoNumero}
          </p>
          <div
            style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '18px' }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '13px',
                  height: '13px',
                  borderRadius: '50%',
                  background: i < value.length ? '#5D87FF' : '#E5E7EB',
                  transition: 'background 0.12s',
                }}
              />
            ))}
          </div>
          {error && (
            <p style={{ color: '#EF4444', fontSize: '13px', marginTop: '12px', fontWeight: 600 }}>
              {error}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          {DIGITS.map((d, i) => (
            <button
              key={i}
              onClick={() => (d === '⌫' ? back() : d !== null ? tap(d) : null)}
              style={{
                height: '68px',
                borderRadius: '18px',
                border: 'none',
                background: d === '⌫' ? '#FEF2F2' : d === null ? 'transparent' : '#F9FAFB',
                fontSize: d === '⌫' ? '22px' : '26px',
                fontWeight: 700,
                color: d === '⌫' ? '#EF4444' : '#111827',
                cursor: d !== null ? 'pointer' : 'default',
                boxShadow: d !== null && d !== '⌫' ? '0 1px 4px rgba(0,0,0,0.07)' : 'none',
              }}
            >
              {d}
            </button>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={loading || !value}
          style={{
            width: '100%',
            height: '62px',
            borderRadius: '18px',
            border: 'none',
            background: value ? '#5D87FF' : '#E5E7EB',
            color: value ? 'white' : '#9CA3AF',
            fontSize: '14px',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            cursor: value ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
        >
          {loading ? 'Verificando...' : 'Confirmar entrega'}
        </button>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            height: '44px',
            marginTop: '6px',
            background: 'transparent',
            border: 'none',
            fontSize: '13px',
            color: '#9CA3AF',
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Swipe to Deliver ───────────────────────────────────────────────
function SwipeButton({ onComplete, disabled }) {
  const containerRef = useRef(null);
  const startXRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const THUMB = 58;

  const getMax = () => (containerRef.current?.clientWidth || 300) - THUMB - 8;

  const onStart = (x) => {
    if (disabled || done) return;
    startXRef.current = x;
  };
  const onMove = (x) => {
    if (startXRef.current === null) return;
    const pct = Math.max(0, Math.min(1, (x - startXRef.current) / getMax()));
    setProgress(pct);
  };
  const onEnd = () => {
    if (startXRef.current === null) return;
    if (progress >= 0.82) {
      setDone(true);
      if (navigator.vibrate) navigator.vibrate([80, 40, 180]);
      onComplete();
    } else {
      setProgress(0);
    }
    startXRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={(e) => onStart(e.touches[0].clientX)}
      onTouchMove={(e) => {
        e.preventDefault();
        onMove(e.touches[0].clientX);
      }}
      onTouchEnd={onEnd}
      onMouseDown={(e) => onStart(e.clientX)}
      onMouseMove={(e) => startXRef.current !== null && onMove(e.clientX)}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
      style={{
        position: 'relative',
        height: '68px',
        borderRadius: '20px',
        background: done ? '#10B981' : '#ECFDF5',
        border: `2px solid ${done ? '#10B981' : '#6EE7B7'}`,
        overflow: 'hidden',
        userSelect: 'none',
        cursor: disabled ? 'not-allowed' : 'grab',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 0.3s, border-color 0.3s',
        touchAction: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {done ? (
          <CheckCircle2 size={30} color="white" strokeWidth={2.5} />
        ) : (
          <span
            style={{
              fontSize: '12px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              color: '#059669',
              opacity: Math.max(0, 1 - progress * 2),
            }}
          >
            Deslizá para entregar →
          </span>
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 4 + progress * getMax(),
          top: 4,
          width: THUMB,
          height: THUMB,
          borderRadius: '16px',
          background: '#10B981',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(16,185,129,0.45)',
          transition: startXRef.current ? 'none' : 'left 0.3s',
          pointerEvents: 'none',
        }}
      >
        <ChevronRight size={28} color="white" strokeWidth={3} />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────
export default function RiderPanel() {
  const params = useParams();

  // Auth. Arrancamos con null + bootstrapping=true para dar tiempo a
  // Preferences (async). En web/PWA es instantaneo, en app nativa Android
  // tarda ~50ms pero es la unica forma de sobrevivir cierres de la app.
  const [riderAuth, setRiderAuth] = useState(null);
  const [loginForm, setLoginForm] = useState({ id: '', code: '' });
  const [bootstrapping, setBootstrapping] = useState(true);
  const [incidenciaOpen, setIncidenciaOpen] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isConnected, setIsConnected] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );

  // Core data
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [selectedPedido, setSelectedPedido] = useState(null);

  // GPS / tracking
  const [trackingActive, setTrackingActive] = useState(false);
  const [locationPermission, setLocationPermission] = useState('prompt');
  const [locationError, setLocationError] = useState('');
  const [lastPositionAt, setLastPositionAt] = useState('');
  const locationWatcherRef = useRef(null);
  const trackedPedidoIdRef = useRef(null);

  // PWA install
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [installReady, setInstallReady] = useState(false);
  const [isStandaloneApp, setIsStandaloneApp] = useState(() => isStandaloneMode());

  // ── NEW: reloj en tiempo real
  const [nowTime, setNowTime] = useState(() => format(new Date(), 'HH:mm'));

  // ── NEW: online/offline toggle (local)
  // Toggle online/offline: default true; se hidrata desde storage en el
  // useEffect de bootstrap para que persista en app nativa Android.
  const [isOnline, setIsOnline] = useState(true);

  // ── NEW: timer de entrega
  const [deliveryElapsed, setDeliveryElapsed] = useState(0);
  const deliveryTimerRef = useRef(null);

  // ── NEW: tab (pedidos | historial)
  const [activeTab, setActiveTab] = useState('pedidos');

  // ── NEW: historial de sesión (entregas completadas hoy)
  const [historialSesion, setHistorialSesion] = useState([]);
  const [changingPayment, setChangingPayment] = useState(false);

  // ── NEW: PIN modal
  const [pinModal, setPinModal] = useState({ open: false, pedidoId: null });

  // ── NEW: multi-delivery route optimization ──
  const [riderLocation, setRiderLocation] = useState({ lat: null, lng: null });
  const lastAcceptedGpsRef = useRef(null);
  const rejectedGpsToastAtRef = useRef(0);

  // Alerts
  const deliveredSeenRef = useRef(new Set());
  const notifiedAssignedRef = useRef(new Set());
  const configRef = useRef({});
  const { audioContextRef, voiceRef, fallbackAudioRef } = useOrderAlertPlayback();

  const selectedItems = normalizePedidoItems(selectedPedido?.items);
  const iosInstall = isIosDevice();
  const lastGpsAgeSeconds = lastPositionAt
    ? Math.max(0, Math.floor((Date.now() - parseDate(lastPositionAt).getTime()) / 1000))
    : null;

  // ── URL params → auto-login ────────────────────────────────────
  useEffect(() => {
    const routeId = String(params?.id || '').trim();
    const routeCode = String(params?.codigo || '').trim();
    if (!routeId || !routeCode) return;
    const next = { id: routeId, code: routeCode };
    riderStorageSet('ms_rider_id', routeId).catch(() => {});
    riderStorageSet('ms_rider_code', routeCode).catch(() => {});
    saveNativeRiderAuth(next).catch(() => {});
    setLoginForm(next);
    setRiderAuth((prev) => (prev?.id === routeId && prev?.code === routeCode ? prev : next));
  }, [params?.codigo, params?.id]);

  // Bootstrap async al montar: intento cargar credenciales primero desde
  // Preferences (autoritativo en nativo), y si no hay caigo a localStorage
  // (web/PWA). Recien despues muestro login o panel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Cargar auth + toggle online + timestamp de ultimo uso en paralelo
        const [saved, onlineStored, lastSeen] = await Promise.all([
          loadNativeRiderAuth(),
          riderStorageGet('ms_rider_online'),
          riderStorageGet('ms_rider_last_seen'),
        ]);
        // Autologout tras 30 días sin uso. Si el celular se pierde o el
        // rider deja de trabajar, la sesion se cierra sola.
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const lastSeenMs = Number(lastSeen || 0);
        if (lastSeenMs && Date.now() - lastSeenMs > thirtyDaysMs) {
          await clearNativeRiderAuth().catch(() => {});
          await riderStorageRemove('ms_rider_id').catch(() => {});
          await riderStorageRemove('ms_rider_code').catch(() => {});
          if (!cancelled) {
            setBootstrapping(false);
            toast('Cerramos tu sesión por inactividad. Volvé a ingresar tu código.', {
              icon: '🔒',
              duration: 5000,
            });
          }
          return;
        }
        // Marcar "visto" ahora para prolongar la vida de la sesion.
        riderStorageSet('ms_rider_last_seen', String(Date.now())).catch(() => {});
        if (!cancelled) {
          if (onlineStored === 'false') setIsOnline(false);
        }
        if (!cancelled && saved) {
          setLoginForm(saved);
          setRiderAuth(saved);
          return;
        }
        // Fallback: helpers universales
        const [id, code] = await Promise.all([
          riderStorageGet('ms_rider_id'),
          riderStorageGet('ms_rider_code'),
        ]);
        if (!cancelled && id && code) {
          const next = { id, code };
          setLoginForm(next);
          setRiderAuth(next);
          // Backfill: guardar en formato canonico
          saveNativeRiderAuth(next).catch(() => {});
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── PWA install prompt ─────────────────────────────────────────
  useEffect(() => {
    const onBefore = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
      setInstallReady(true);
    };
    const onInstalled = () => {
      setDeferredInstallPrompt(null);
      setInstallReady(false);
      setIsStandaloneApp(true);
      toast.success('Rider App instalada');
    };
    const syncStandalone = () => setIsStandaloneApp(isStandaloneMode());
    const restoreManifest = swapManifest('/manifest-rider.json');
    document.title = 'Modo Sabor Rider';
    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change', syncStandalone);
    syncStandalone();
    return () => {
      restoreManifest();
      document.title = 'Modo Sabor';
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
      window
        .matchMedia?.('(display-mode: standalone)')
        ?.removeEventListener?.('change', syncStandalone);
    };
  }, []);

  // ── Permisos de geolocalización ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getRiderLocationPermission()
      .then((state) => {
        if (!cancelled) setLocationPermission(state);
      })
      .catch(() => {});

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (cancelled || isNativeRiderApp()) return;
          setLocationPermission(status.state);
          status.onchange = () => setLocationPermission(status.state);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  // Historial de pedidos entregados/cancelados de la sesion del rider.
  // Persistido en Preferences (nativo) o localStorage (web) por dia + rider.
  useEffect(() => {
    if (!riderAuth?.id) {
      setHistorialSesion([]);
      return undefined;
    }
    let cancelled = false;
    riderStorageGet(riderHistoryKey(riderAuth.id)).then((raw) => {
      if (cancelled) return;
      try {
        const stored = JSON.parse(raw || '[]');
        setHistorialSesion(Array.isArray(stored) ? stored : []);
      } catch {
        setHistorialSesion([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [riderAuth?.id]);

  useEffect(() => {
    if (!riderAuth?.id) return;
    riderStorageSet(
      riderHistoryKey(riderAuth.id),
      JSON.stringify(historialSesion.slice(0, 50))
    ).catch(() => {});
  }, [historialSesion, riderAuth?.id]);

  // ── Reloj en tiempo real ───────────────────────────────────────
  useEffect(() => {
    const tick = () => setNowTime(format(new Date(), 'HH:mm'));
    const t = window.setInterval(tick, 30000);
    return () => window.clearInterval(t);
  }, []);

  // ── Timer de entrega ───────────────────────────────────────────
  useEffect(() => {
    const inTransit = data?.pedidos?.find((p) => p.estado === 'en_camino');
    if (inTransit) {
      const startMs = Date.now();
      if (deliveryTimerRef.current) clearInterval(deliveryTimerRef.current);
      setDeliveryElapsed(0);
      deliveryTimerRef.current = window.setInterval(() => {
        setDeliveryElapsed(Math.floor((Date.now() - startMs) / 1000));
      }, 1000);
    } else {
      if (deliveryTimerRef.current) {
        clearInterval(deliveryTimerRef.current);
        deliveryTimerRef.current = null;
      }
      setDeliveryElapsed(0);
    }
    return () => {
      if (deliveryTimerRef.current) clearInterval(deliveryTimerRef.current);
    };
  }, [data?.pedidos]);

  // ── GPS auto-start/stop ────────────────────────────────────────
  useEffect(() => {
    const active = data?.pedidos?.find((p) => p.estado === 'en_camino');
    if (active && trackedPedidoIdRef.current !== active.id) {
      stopTracking();
      startTracking(active.id);
    } else if (!active && locationWatcherRef.current) {
      stopTracking();
    }
  }, [data]);

  const rememberAssignedNotification = useCallback(
    (pedidoId) => {
      const normalizedId = String(pedidoId || '').trim();
      if (!normalizedId || !riderAuth) return;
      notifiedAssignedRef.current.add(normalizedId);
      const recent = [...notifiedAssignedRef.current].slice(-100);
      notifiedAssignedRef.current = new Set(recent);
      riderStorageSet(`ms_rider_notified_${riderAuth.id}`, JSON.stringify(recent)).catch(() => {});
    },
    [riderAuth]
  );

  const alertAssignedOrder = useCallback(
    async (pedido) => {
      const pedidoId = String(pedido?.id || '').trim();
      if (
        !pedidoId ||
        ['entregado', 'cancelado'].includes(String(pedido?.estado || '').toLowerCase()) ||
        notifiedAssignedRef.current.has(pedidoId)
      ) {
        return false;
      }

      rememberAssignedNotification(pedidoId);
      if (navigator.vibrate) navigator.vibrate([300, 120, 300, 120, 500]);

      try {
        await notifyRiderNewOrder(pedido);
      } catch {}

      // Anuncio por voz (TTS) para "ojos en el camino": si el rider esta
      // manejando puede escuchar el pedido sin sacar el celular. Silent-fail
      // si el WebView no soporta Web Speech API.
      try {
        const cliente = String(pedido?.cliente_nombre || 'sin nombre').split(' ')[0];
        const direccion = String(pedido?.cliente_direccion || '').split(',')[0];
        const total = Number(pedido?.total || 0);
        speakRider(
          `Nuevo pedido para ${cliente}${direccion ? ` en ${direccion}` : ''}. Monto ${Math.round(total)} pesos.`
        );
      } catch {}

      try {
        await runOrderAlert({
          pedido,
          config: {
            ...(configRef.current || {}),
            alertas_pedido_sonido: '1',
            alertas_pedido_voz: '0',
          },
          audioContextRef,
          voiceRef,
          fallbackAudioRef,
          delayMs: 0,
        });
      } catch {}

      toast.success(`Nuevo pedido asignado #${pedido.numero || pedido.id}`, {
        duration: 7000,
      });
      return true;
    },
    [audioContextRef, fallbackAudioRef, rememberAssignedNotification, voiceRef]
  );

  useEffect(() => {
    if (!riderAuth) {
      notifiedAssignedRef.current = new Set();
      return undefined;
    }
    let cancelled = false;
    riderStorageGet(`ms_rider_notified_${riderAuth.id}`).then((raw) => {
      if (cancelled) return;
      try {
        const stored = JSON.parse(raw || '[]');
        notifiedAssignedRef.current = new Set((Array.isArray(stored) ? stored : []).map(String));
      } catch {
        notifiedAssignedRef.current = new Set();
      }
    });

    // Pedir permiso de notificaciones apenas hay sesion. En Android 13+
    // hace falta el prompt explicito o LocalNotifications no muestra nada.
    prepareRiderNotifications().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [riderAuth]);

  // ── Fetch ──────────────────────────────────────────────────────
  const fetchData = useCallback(
    async ({ silent = false } = {}) => {
      if (!riderAuth) return;
      if (!silent) setLoading(true);
      try {
        const res = await api.get(`/repartidores/${riderAuth.id}/rider/${riderAuth.code}`);
        setData(res);
        configRef.current = res?.settings || {};
        setHistorialSesion(Array.isArray(res?.historial) ? res.historial : []);
        setSelectedPedido((current) => {
          if (!current) return current;
          return res.pedidos.find((p) => p.id === current.id) || null;
        });
        (res?.pedidos || []).forEach((pedido) => {
          alertAssignedOrder(pedido);
        });
      } catch (err) {
        const status = err?._httpStatus || err?.status || err?.statusCode;
        if (status === 401 || status === 403) {
          toast.error(
            'No se pudo validar el acceso. Tus datos siguen guardados; probá nuevamente.'
          );
        } else if (status === 404) {
          toast.error('Rider no encontrado. Tus datos siguen guardados para volver a intentar.');
        } else if (!silent && err?.offline) {
          toast.error('Sin internet en el celular.');
        } else if (!silent && (err?.message === 'Network Error' || !status)) {
          toast.error('No se pudo conectar con la API. Cerrá la app y abrila de nuevo.');
        } else if (!silent) {
          toast.error(`Servidor respondió con error ${status}.`);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [alertAssignedOrder, riderAuth]
  );

  // ── Sockets ────────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    if (!riderAuth) return;

    socketManager.connect();
    socketManager.joinRider(riderAuth.id, riderAuth.code).catch(() => {});

    const unsub = socketManager.on('pedido_actualizado', async (pedido) => {
      if (pedido?.estado === 'entregado' && !deliveredSeenRef.current.has(pedido.id)) {
        deliveredSeenRef.current.add(pedido.id);
        toast.success(`Pedido #${pedido.numero || pedido.id} actualizado como entregado`);
      } else {
        await alertAssignedOrder(pedido);
      }
      fetchData({ silent: true });
    });

    const unsubAsignado = socketManager.on('pedido_asignado', async (pedido) => {
      await alertAssignedOrder(pedido);
      fetchData({ silent: true });
    });

    const syncSilently = () => {
      socketManager.connect();
      socketManager.joinRider(riderAuth.id, riderAuth.code).catch(() => {});
      fetchData({ silent: true });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') syncSilently();
    };
    const intervalId = window.setInterval(syncSilently, 10000);
    window.addEventListener('online', syncSilently);
    window.addEventListener('focus', syncSilently);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsub();
      unsubAsignado();
      window.clearInterval(intervalId);
      window.removeEventListener('online', syncSilently);
      window.removeEventListener('focus', syncSilently);
      document.removeEventListener('visibilitychange', onVisible);
      socketManager.disconnect();
    };
  }, [alertAssignedOrder, audioContextRef, fallbackAudioRef, fetchData, riderAuth, voiceRef]);

  // ── GPS tracking ───────────────────────────────────────────────
  const startTracking = async (pedidoId) => {
    if (!riderAuth) {
      setLocationError('Este celular no permite compartir ubicación.');
      return;
    }
    setTrackingActive(true);
    setLocationError('');
    trackedPedidoIdRef.current = pedidoId;
    lastAcceptedGpsRef.current = null;
    try {
      locationWatcherRef.current = await startRiderLocationWatcher({
        onPosition: (pos) => {
          const filtered = filterRiderGpsPosition(pos, lastAcceptedGpsRef.current);
          setLocationPermission('granted');

          if (!filtered.accepted) {
            const now = Date.now();
            if (now - rejectedGpsToastAtRef.current > 30000) {
              rejectedGpsToastAtRef.current = now;
              if (filtered.reason === 'precision_baja') {
                setLocationError(
                  `GPS impreciso (${Math.round(filtered.accuracy || 0)}m). Buscando mejor señal...`
                );
              } else {
                setLocationError('GPS inestable. Ignoramos una lectura rara y seguimos buscando.');
              }
            }
            return;
          }

          const { lat, lng, accuracy, speed, smoothed } = filtered.point;
          lastAcceptedGpsRef.current = filtered.point;
          setLocationError('');
          setLastPositionAt(new Date().toISOString());
          setRiderLocation({ lat, lng, accuracy, smoothed });
          sendRiderLocationUpdate({
            riderId: riderAuth.id,
            riderCode: riderAuth.code,
            webClient: api,
            payload: {
              latitud: lat,
              longitud: lng,
              precision: accuracy,
              velocidad: speed,
              pedidoId,
              fuente: 'watchPosition',
              suavizado: smoothed ? 1 : 0,
              gps_fuente: isNativeRiderApp() ? 'capacitor-background' : 'web-watch',
            },
          }).catch(() => {});
        },
        onError: async (err) => {
          setTrackingActive(false);
          if (err?.code === 1) {
            setLocationPermission('denied');
            setLocationError('Activá la ubicación para que el cliente pueda seguirte en vivo.');
          } else if (err?.code === 'NOT_AUTHORIZED') {
            setLocationPermission('denied');
            setLocationError('Activá ubicación siempre permitida para sostener el tracking.');
            await openNativeLocationSettings().catch(() => false);
          } else setLocationError('No pudimos actualizar tu ubicación en este momento.');
        },
      });
    } catch (err) {
      setTrackingActive(false);
      trackedPedidoIdRef.current = null;
      setLocationError('Este celular no permite compartir ubicación.');
    }
  };

  const stopTracking = () => {
    if (locationWatcherRef.current) {
      locationWatcherRef.current.stop?.();
      locationWatcherRef.current = null;
    }
    setTrackingActive(false);
    trackedPedidoIdRef.current = null;
    lastAcceptedGpsRef.current = null;
  };

  const requestLocationAccess = async () => {
    try {
      await requestRiderLocationAccess();
      setLocationPermission('granted');
      setLocationError('');
      const active = data?.pedidos?.find((p) => p.estado === 'en_camino');
      if (active && !locationWatcherRef.current) startTracking(active.id);
      toast.success('Ubicación activada');
    } catch (err) {
      if (!isNativeRiderApp()) {
        toast.error('Este equipo no soporta ubicación');
      }
      setLocationPermission('denied');
      setLocationError('Debés permitir ubicación para usar el tracking en vivo.');
    }
  };

  // ── PWA install ────────────────────────────────────────────────
  const installRiderApp = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') {
      setDeferredInstallPrompt(null);
      setInstallReady(false);
    }
  };

  // ── Auth ───────────────────────────────────────────────────────
  const handleLogin = (e) => {
    e.preventDefault();
    if (!loginForm.id || !loginForm.code) return toast.error('Completá los datos');
    riderStorageSet('ms_rider_id', loginForm.id).catch(() => {});
    riderStorageSet('ms_rider_code', loginForm.code).catch(() => {});
    saveNativeRiderAuth(loginForm).catch(() => {});
    setRiderAuth({ id: loginForm.id, code: loginForm.code });
  };

  const handleLogout = () => {
    stopTracking();
    riderStorageRemove('ms_rider_id').catch(() => {});
    riderStorageRemove('ms_rider_code').catch(() => {});
    clearNativeRiderAuth().catch(() => {});
    setRiderAuth(null);
    setData(null);
    setSelectedPedido(null);
  };

  // ── NEW: toggle online/offline ─────────────────────────────────
  const toggleOnline = () => {
    const next = !isOnline;
    setIsOnline(next);
    riderStorageSet('ms_rider_online', String(next)).catch(() => {});
    if (navigator.vibrate) navigator.vibrate(40);
    toast(next ? '✅ Disponible' : '⛔ No disponible', { duration: 1500 });
  };

  // ── Estado de pedido ───────────────────────────────────────────
  const updateEstado = async (pedidoId, nuevoEstado) => {
    try {
      await api.put(
        `/repartidores/${riderAuth.id}/rider/${riderAuth.code}/pedido/${pedidoId}/estado`,
        { estado: nuevoEstado }
      );
      toast.success(`Pedido ${nuevoEstado.replace('_', ' ')}`);
      fetchData();
    } catch {
      toast.error('No se pudo actualizar el estado');
    }
  };

  const changePaymentMethod = async (pedidoId, metodoPago) => {
    if (!riderAuth || changingPayment) return;
    setChangingPayment(true);
    try {
      const updated = await api.put(
        `/repartidores/${riderAuth.id}/rider/${riderAuth.code}/pedido/${pedidoId}/pago`,
        { metodo_pago: metodoPago }
      );
      setData((current) => ({
        ...current,
        pedidos: (current?.pedidos || []).map((pedido) =>
          pedido.id === updated.id ? updated : pedido
        ),
      }));
      setSelectedPedido(updated);
      toast.success(`Cobro cambiado a ${paymentMethodLabel(metodoPago)}`);
    } catch (error) {
      toast.error(error?.error || 'No se pudo cambiar el medio de pago');
    } finally {
      setChangingPayment(false);
    }
  };

  // ── NEW: Swipe complete → check PIN o finalizar directo ────────
  const handleSwipeComplete = (pedidoActual) => {
    const validacionActiva = String(data?.settings?.delivery_validacion_activa || '0') === '1';
    if (validacionActiva && pedidoActual?.entrega_pin) {
      setPinModal({ open: true, pedidoId: pedidoActual.id });
    } else {
      finalizarEntrega(pedidoActual.id, null);
    }
  };

  // ── Finalizar entrega ──────────────────────────────────────────
  const finalizarEntrega = async (pedidoId, pin) => {
    const pedidoActual = data?.pedidos?.find((p) => p.id === pedidoId) || selectedPedido;
    const payload = {};
    if (pin) payload.pin = pin;

    try {
      await api.post(
        `/repartidores/${riderAuth.id}/rider/${riderAuth.code}/entregar/${pedidoId}`,
        payload
      );
      deliveredSeenRef.current.add(pedidoId);
      try {
        await runDeliveredAlert({
          pedido: { ...pedidoActual, estado: 'entregado' },
          config: data?.settings || configRef.current || {},
          audioContextRef,
          voiceRef,
          fallbackAudioRef,
          scope: 'rider',
        });
      } catch {}
      // ── NEW: registrar en historial de sesión
      if (pedidoActual) {
        setHistorialSesion((prev) => [
          { ...pedidoActual, entregado_en: new Date().toISOString() },
          ...prev,
        ]);
      }
      setPinModal({ open: false, pedidoId: null });
      toast.success('¡Entregado! 🎉');
      setSelectedPedido(null);
      fetchData();
    } catch (err) {
      // Re-throw so PinModal can catch and show error
      throw err;
    }
  };

  // ── PIN confirm handler ────────────────────────────────────────
  const handlePinConfirm = async (pin) => {
    await finalizarEntrega(pinModal.pedidoId, pin);
  };

  const mapConfig = data?.settings || configRef.current || {};

  const openNav = (pedido) => {
    const url = destinationUrl(pedido, mapConfig);
    if (url) window.open(url, '_blank');
  };

  // ── Computed: pedidos ordenados por distancia ──
  const activePedidos = data?.pedidos || [];
  const hasMultipleDeliveries = activePedidos.length >= 2;
  const sortedPedidos =
    hasMultipleDeliveries && riderLocation.lat && riderLocation.lng
      ? sortByDistance(activePedidos, riderLocation.lat, riderLocation.lng)
      : activePedidos;

  // Cola offline: si el celular vuelve a tener red, reintentar acciones
  // pendientes (marcar entregado, ubicaciones, incidencias). Corre cada
  // 15s mientras hay conexion + inmediatamente cuando el navegador
  // dispara "online".
  useEffect(() => {
    if (!riderAuth) return undefined;
    let cancelled = false;
    const bumpBadge = async () => {
      const q = await readRiderQueue();
      if (!cancelled) setOfflineCount(q.length);
    };
    const flush = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setIsConnected(false);
        return;
      }
      setIsConnected(true);
      const { processed } = await processRiderQueue(api);
      if (processed > 0) {
        toast.success(`Recuperada la conexión — sincronizamos ${processed} acción(es).`);
      }
      await bumpBadge();
    };
    bumpBadge();
    const interval = window.setInterval(flush, 15000);
    const onOnline = () => {
      setIsConnected(true);
      flush();
    };
    const onOffline = () => {
      setIsConnected(false);
      toast('Sin conexión — las acciones se guardan y se envían al reconectar.', {
        icon: '📡',
        duration: 3500,
      });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [riderAuth]);

  // ── Computed: resumen del día ──────────────────────────────────
  const resumenDia = {
    entregados: historialSesion.length,
    efectivo: historialSesion
      .filter((p) =>
        String(p.metodo_pago || '')
          .toLowerCase()
          .includes('efectivo')
      )
      .reduce((acc, p) => acc + Number(p.total || 0), 0),
    total: historialSesion.reduce((acc, p) => acc + Number(p.total || 0), 0),
  };

  // Toast animado cuando sube el numero de entregas. Solo dispara si el
  // contador CRECE (no al arranque ni al descargar historial). Da la
  // sensacion de "logro" apos cada delivery.
  const previousEntregadosRef = useRef(null);
  useEffect(() => {
    const current = resumenDia.entregados;
    const previous = previousEntregadosRef.current;
    previousEntregadosRef.current = current;
    if (previous === null || previous === undefined) return;
    if (current > previous) {
      toast.success(`🎉 ¡${current}ª entrega del día!`, {
        duration: 2500,
        style: {
          borderRadius: '20px',
          background: '#111',
          color: '#fff',
          fontWeight: 900,
          letterSpacing: '0.02em',
        },
      });
      fireRiderConfetti(36);
      speakRider(`Entrega ${current} confirmada. ¡Buen trabajo!`, { rate: 1.1 });
    }
  }, [resumenDia.entregados]);

  // ─────────────────────────────────────────────────────────────────
  // RENDER: spinner de bootstrap (mientras carga Preferences en Android)
  // ─────────────────────────────────────────────────────────────────
  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="mt-4 text-sm font-bold text-gray-500">Cargando tu sesión...</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RENDER: pantalla de login
  // ─────────────────────────────────────────────────────────────────
  if (!riderAuth) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto h-20 w-20 rounded-3xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-primary-200">
            <Truck size={40} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">RIDER APP</h1>
            <p className="mt-2 text-gray-500 font-medium uppercase tracking-widest text-xs">
              Acceso exclusivo repartidores
            </p>
          </div>

          {(installReady || iosInstall) && (
            <div className="rounded-[28px] border border-primary-100 bg-white p-5 text-left shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-500">
                Instalar app
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
                {installReady
                  ? 'Este celular ya puede instalar la Rider App.'
                  : 'En iPhone: abrí Compartir → "Agregar a pantalla de inicio".'}
              </p>
              {installReady && (
                <button
                  type="button"
                  onClick={installRiderApp}
                  className="mt-4 inline-flex h-12 items-center gap-2 rounded-2xl bg-blue-600 px-5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100"
                >
                  <Smartphone size={16} /> Instalar Rider App
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-10 space-y-4">
            <div className="text-left space-y-1.5">
              <label className="ml-4 text-[10px] font-black uppercase text-gray-400">
                ID de Repartidor
              </label>
              <input
                type="text"
                value={loginForm.id}
                onChange={(e) => setLoginForm({ ...loginForm, id: e.target.value })}
                className="h-14 w-full rounded-2xl border-none bg-white px-6 text-lg font-bold shadow-sm focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: 1"
              />
            </div>
            <div className="text-left space-y-1.5">
              <label className="ml-4 text-[10px] font-black uppercase text-gray-400">
                Código de Acceso
              </label>
              <input
                type="text"
                value={loginForm.code}
                onChange={(e) => setLoginForm({ ...loginForm, code: e.target.value })}
                className="h-14 w-full rounded-2xl border-none bg-white px-6 text-lg font-bold shadow-sm focus:ring-2 focus:ring-blue-500"
                placeholder="Pin de 8 caracteres"
              />
            </div>
            <button className="h-16 w-full rounded-2xl bg-blue-600 text-white text-lg font-black uppercase tracking-widest shadow-xl shadow-primary-200 hover:bg-blue-700 active:scale-95 transition-all">
              INGRESAR
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RENDER: app principal
  // ─────────────────────────────────────────────────────────────────
  const primaryColor = data?.settings?.rider_app_color_primario || '#5D87FF';
  const secondaryColor = data?.settings?.rider_app_color_secundario || '#49BEFF';
  const appName = data?.settings?.rider_app_nombre || 'Modo Sabor Delivery';
  const telefonoLocal = data?.settings?.negocio_telefono || '';
  const showRiderLogo = String(data?.settings?.rider_app_mostrar_logo ?? '1') === '1';
  const riderLogoUrl = resolveAssetUrl(
    data?.settings?.rider_app_logo || data?.settings?.negocio_logo || ''
  );
  const inTransitOrder = data?.pedidos?.find((p) => p.estado === 'en_camino');

  return (
    <div
      className="rider-shell min-h-screen bg-gray-50 flex flex-col font-sans overflow-x-hidden"
      style={{ '--rider-primary': primaryColor, '--rider-secondary': secondaryColor }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 px-5 py-4 flex items-center justify-between border-b border-gray-100 bg-white shadow-sm"
        style={{ borderTop: `4px solid ${primaryColor}` }}
      >
        <div className="flex items-center gap-3">
          {showRiderLogo && riderLogoUrl ? (
            <img
              src={riderLogoUrl}
              alt={appName}
              className="h-10 w-10 rounded-xl bg-white object-contain p-0.5 border border-gray-100"
              onError={(e) => {
                // Si la URL del logo falla (imagen borrada, sin acceso, etc.)
                // el placeholder roto del navegador queda espantoso; reemplazo
                // por un ícono de camión con fondo de marca.
                e.currentTarget.style.display = 'none';
                e.currentTarget.insertAdjacentHTML(
                  'afterend',
                  `<div class="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 border border-primary-100">
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><path d="M15 18H9"/><circle cx="17" cy="18" r="2"/></svg>
                   </div>`
                );
              }}
            />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 border border-primary-100">
              <Truck size={20} />
            </div>
          )}
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight text-gray-900 leading-none">
              {appName}
            </h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
              {data?.repartidor?.nombre || 'Repartidor'}
            </p>
          </div>
        </div>

        {/* ── NEW: controles del header ── */}
        <div className="flex items-center gap-2">
          {/* Online/Offline toggle */}
          <button
            onClick={toggleOnline}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              isOnline ? 'bg-success-50 text-success-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {isOnline ? <Zap size={13} strokeWidth={3} /> : <ZapOff size={13} strokeWidth={3} />}
            {isOnline ? 'Online' : 'Offline'}
          </button>

          {/* Llamar al local */}
          {telefonoLocal && (
            <a
              href={`tel:${telefonoLocal}`}
              className="h-9 w-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600"
              title="Llamar al local"
            >
              <PhoneCall size={16} />
            </a>
          )}

          <button
            onClick={handleLogout}
            className="h-9 w-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-rose-500"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col space-y-5 p-4 md:p-6">
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-20 opacity-40 animate-pulse">
            <RefreshCw className="animate-spin mb-4" size={32} />
            <p className="text-sm font-black uppercase">Sincronizando...</p>
          </div>
        )}

        {!selectedPedido ? (
          <>
            {/* ── Resumen del turno (siempre visible) ──
                Tarjeta hero con brillo animado + 3 stats con iconos y
                tipografia armonica. Antes solo aparecia cuando ya habia
                entregas y los numeros tenian tamaños distintos (2xl vs lg)
                lo que se veia desfasado. Ahora todos son text-2xl con
                tabular-nums, y cada stat tiene su chip de icono. */}
            <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-blue-600 via-blue-600 to-blue-500 p-5 shadow-xl shadow-primary-200">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-8 -left-6 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200">
                      Tu turno de hoy
                    </p>
                    <p className="text-lg font-black text-white leading-tight mt-0.5">
                      {nowTime} · {format(new Date(), "EEE dd 'de' MMM", { locale: es })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">
                      Online
                    </span>
                  </div>
                </div>
                {(() => {
                  // Meta diaria: usa lo que el negocio configure, sino 10.
                  const meta = Math.max(1, Number(data?.settings?.rider_meta_diaria || 10));
                  const pctMeta = Math.min(100, (resumenDia.entregados / meta) * 100);
                  return (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-blue-200">
                          Meta diaria
                        </span>
                        <span className="text-[10px] font-black tabular-nums text-white">
                          {resumenDia.entregados}/{meta}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/15">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pctMeta}%` }}
                          transition={{ duration: 0.9, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{
                            background:
                              pctMeta >= 100
                                ? 'linear-gradient(90deg,#10b981,#34d399)'
                                : 'linear-gradient(90deg,#fbbf24,#f59e0b)',
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-3 gap-2.5">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className="rounded-2xl bg-white/15 backdrop-blur-sm px-3 py-3 text-center"
                  >
                    <div className="flex items-center justify-center h-6 mb-1.5">
                      <Package size={14} className="text-blue-200" />
                    </div>
                    <AnimatedNumber
                      value={resumenDia.entregados}
                      className="text-2xl font-black text-white tabular-nums leading-none block"
                    />
                    <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mt-1.5">
                      Entregas
                    </p>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    className="rounded-2xl bg-white/15 backdrop-blur-sm px-3 py-3 text-center"
                  >
                    <div className="flex items-center justify-center h-6 mb-1.5">
                      <DollarSign size={14} className="text-blue-200" />
                    </div>
                    <AnimatedNumber
                      value={resumenDia.efectivo}
                      format={(n) => fmt(n)}
                      className="text-lg font-black text-white tabular-nums leading-none block"
                    />
                    <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mt-1.5">
                      Efectivo
                    </p>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-2xl bg-white/15 backdrop-blur-sm px-3 py-3 text-center"
                  >
                    <div className="flex items-center justify-center h-6 mb-1.5">
                      <TrendingUp size={14} className="text-blue-200" />
                    </div>
                    <AnimatedNumber
                      value={resumenDia.total}
                      format={(n) => fmt(n)}
                      className="text-lg font-black text-white tabular-nums leading-none block"
                    />
                    <p className="text-[9px] font-black text-blue-200 uppercase tracking-widest mt-1.5">
                      Total
                    </p>
                  </motion.div>
                </div>
              </div>
            </div>

            {/* ── Barra de acciones rápidas ──
                3 botones grandes con label debajo. Están a mano sin
                tener que ir al ícono chico del header ni al menú.
                Se ven vivos: bordes suaves, hover sube, íconos claros. */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="grid grid-cols-3 gap-2.5"
            >
              {telefonoLocal ? (
                <a
                  href={`tel:${telefonoLocal}`}
                  className="flex flex-col items-center gap-1.5 rounded-2xl bg-white border border-gray-100 p-3 shadow-sm hover:shadow-md active:scale-95 transition-all"
                >
                  <div className="h-9 w-9 rounded-xl bg-success-50 flex items-center justify-center text-success-600">
                    <PhoneCall size={16} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">
                    Llamar local
                  </span>
                </a>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => fetchData()}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white border border-gray-100 p-3 shadow-sm hover:shadow-md active:scale-95 transition-all"
              >
                <div className="h-9 w-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600">
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">
                  Actualizar
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('historial')}
                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white border border-gray-100 p-3 shadow-sm hover:shadow-md active:scale-95 transition-all"
              >
                <div className="h-9 w-9 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                  <History size={16} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">
                  Historial
                </span>
              </button>
            </motion.div>

            {/* ── Multi-delivery route optimization ── */}
            {hasMultipleDeliveries && (
              <div className="rounded-[24px] bg-violet-50 border border-violet-200 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Route size={16} className="text-violet-600" />
                  <p className="text-[10px] font-black text-violet-600 uppercase tracking-widest">
                    Ruta optimizada · {sortedPedidos.length} entregas
                  </p>
                </div>
                <div className="space-y-2">
                  {sortedPedidos.map((pedido, idx) => {
                    const isNext = idx === 0;
                    const stopColors = [
                      'bg-emerald-500',
                      'bg-amber-500',
                      'bg-orange-500',
                      'bg-rose-500',
                      'bg-purple-500',
                    ];
                    return (
                      <button
                        key={pedido.id}
                        onClick={() => setSelectedPedido(pedido)}
                        className={`w-full text-left rounded-2xl px-4 py-3 flex items-center gap-3 transition-all ${
                          isNext
                            ? 'bg-white shadow-sm border border-violet-200'
                            : 'bg-violet-100/50'
                        }`}
                      >
                        <div
                          className={`h-8 w-8 rounded-full ${stopColors[idx % stopColors.length]} flex items-center justify-center text-white text-xs font-black shrink-0`}
                        >
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-gray-900 truncate">
                            {pedido.cliente_nombre}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {pedido.cliente_direccion}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {pedido.distance !== undefined && (
                            <p className="text-xs font-black text-violet-600">
                              {Math.round(pedido.distance)}m
                            </p>
                          )}
                          <p className="text-[10px] font-bold text-gray-400">
                            {pedido.estado.replace('_', ' ')}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {sortedPedidos[0]?.cliente_latitud && sortedPedidos[0]?.cliente_longitud && (
                  <button
                    onClick={() => openNav(sortedPedidos[0])}
                    className="mt-3 w-full h-11 rounded-2xl bg-violet-600 text-white flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest shadow-lg shadow-violet-200"
                  >
                    <Navigation size={14} /> Navegar a Parada 1
                  </button>
                )}
              </div>
            )}

            {/* ── Timer en reparto activo ── */}
            {inTransitOrder && (
              <div className="rounded-[24px] bg-success-50 border border-emerald-200 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-success-500 flex items-center justify-center">
                    <Truck size={18} color="white" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-success-600 uppercase tracking-widest">
                      En reparto
                    </p>
                    <p className="text-sm font-black text-emerald-800">
                      #{inTransitOrder.numero} · {inTransitOrder.cliente_nombre || 'S/N'}
                    </p>
                    {inTransitOrder.hora_entrega ? (
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
                        Entrega {inTransitOrder.hora_entrega}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-success-700 tabular-nums">
                    {fmtTimer(deliveryElapsed)}
                  </p>
                  <p className="text-[9px] text-emerald-500 uppercase font-black">Tiempo en ruta</p>
                </div>
              </div>
            )}

            {/* ── Status card + GPS ── */}
            <div className="rounded-[32px] bg-white p-6 shadow-sm border border-gray-100">
              <p className="text-sm font-bold text-gray-600 leading-relaxed">
                {data?.settings?.rider_app_bienvenida}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div
                  className={`h-2.5 w-2.5 rounded-full ${trackingActive ? 'bg-success-500 animate-pulse' : 'bg-gray-300'}`}
                />
                <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                  {trackingActive ? 'GPS activo' : 'Sin reparto activo'}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                    locationPermission === 'granted'
                      ? 'bg-success-50 text-success-600'
                      : locationPermission === 'denied'
                        ? 'bg-danger-50 text-danger-600'
                        : 'bg-warning-50 text-warning-600'
                  }`}
                >
                  GPS{' '}
                  {locationPermission === 'granted'
                    ? 'OK'
                    : locationPermission === 'denied'
                      ? 'bloqueado'
                      : 'pendiente'}
                </span>
                {trackingActive && lastGpsAgeSeconds !== null && (
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                      lastGpsAgeSeconds <= 90
                        ? 'bg-success-50 text-success-700'
                        : 'bg-warning-50 text-warning-700'
                    }`}
                  >
                    {lastGpsAgeSeconds <= 90
                      ? 'GPS reciente'
                      : `GPS atrasado ${lastGpsAgeSeconds}s`}
                  </span>
                )}
              </div>
              {lastPositionAt && (
                <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Último GPS: {format(parseDate(lastPositionAt), 'HH:mm', { locale: es })}
                </p>
              )}
              {locationError && (
                <div className="mt-4 rounded-2xl border border-rose-100 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700">
                  {locationError}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {locationPermission !== 'granted' && (
                  <button
                    type="button"
                    onClick={requestLocationAccess}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl bg-blue-600 px-5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100"
                  >
                    <LocateFixed size={15} /> Activar GPS
                  </button>
                )}
                {data?.pedidos?.length > 0 &&
                  !(trackingActive && locationPermission === 'granted') && (
                    <button
                      type="button"
                      onClick={requestLocationAccess}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-xs font-black uppercase tracking-widest text-gray-700 shadow-sm"
                    >
                      <RefreshCw size={14} /> Revalidar GPS
                    </button>
                  )}
                {!isStandaloneApp && (installReady || iosInstall) && (
                  <button
                    type="button"
                    onClick={installRiderApp}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl border border-primary-200 bg-primary-50 px-4 text-xs font-black uppercase tracking-widest text-blue-700"
                  >
                    <Smartphone size={14} /> Instalar app
                  </button>
                )}
              </div>
              {!isStandaloneApp && (
                <p className="mt-4 text-[11px] font-semibold leading-relaxed text-gray-500">
                  Instalá esta pantalla en el celular del rider para abrirla como app.{' '}
                  {iosInstall
                    ? 'En iPhone: Compartir -> Agregar a pantalla de inicio.'
                    : 'En Android o Chrome: usá el botón Instalar app cuando aparezca.'}
                </p>
              )}
            </div>

            {/* ── Tabs: Pedidos / Historial ── */}
            <div className="flex rounded-2xl bg-gray-100 p-1 gap-1">
              {[
                {
                  id: 'pedidos',
                  label: `Pedidos activos (${data?.pedidos?.length || 0})`,
                  icon: Package,
                },
                { id: 'historial', label: `Historial (${historialSesion.length})`, icon: History },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                    activeTab === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                  }`}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>

            {/* ── Tab: Pedidos activos ── */}
            {activeTab === 'pedidos' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-black uppercase text-gray-400 tracking-[0.2em]">
                    Asignados ({data?.pedidos?.length || 0})
                  </h3>
                  <button onClick={fetchData} className="text-primary-600">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>

                {!data?.pedidos?.length ? (
                  <div className="rounded-[32px] bg-gradient-to-br from-blue-50 via-white to-blue-50 border border-blue-100 py-12 text-center flex flex-col items-center relative overflow-hidden">
                    {/* Ondas de radar animadas: 3 círculos concéntricos que
                        se expanden con desfase, dan sensación de "escaneando"
                        el mapa a la espera de pedidos. */}
                    <div className="relative h-28 w-28 mb-5">
                      <div className="absolute inset-0 rounded-full bg-primary-500/20 animate-ping" />
                      <div
                        className="absolute inset-3 rounded-full bg-primary-500/25 animate-ping"
                        style={{ animationDelay: '0.4s' }}
                      />
                      <div
                        className="absolute inset-6 rounded-full bg-primary-500/30 animate-ping"
                        style={{ animationDelay: '0.8s' }}
                      />
                      <div className="absolute inset-8 rounded-full bg-primary-500 flex items-center justify-center shadow-lg shadow-primary-200">
                        <Package size={26} className="text-white" strokeWidth={2.2} />
                      </div>
                    </div>
                    <p className="text-sm font-black uppercase tracking-widest text-primary-600">
                      Esperando pedidos
                    </p>
                    <p className="mt-2 text-xs font-semibold text-gray-500 max-w-xs px-4">
                      Cuando entre uno nuevo te va a sonar y vibrar acá. Dejá la app abierta aunque
                      bloquees el celular.
                    </p>
                    <div className="mt-4 flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm border border-gray-100">
                      <div className="h-2 w-2 rounded-full bg-success-500 animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        Modo activo
                      </span>
                    </div>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {(hasMultipleDeliveries ? sortedPedidos : data.pedidos).map((pedido, idx) => {
                      const stopNumber = hasMultipleDeliveries ? idx + 1 : null;
                      const stopColors = [
                        'bg-emerald-500',
                        'bg-amber-500',
                        'bg-orange-500',
                        'bg-rose-500',
                        'bg-purple-500',
                      ];
                      return (
                        <motion.button
                          key={pedido.id}
                          layout
                          initial={{ opacity: 0, y: 40, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -20, scale: 0.95 }}
                          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                          onClick={() => setSelectedPedido(pedido)}
                          className="w-full text-left rounded-[28px] bg-white border border-gray-100 p-5 shadow-sm hover:shadow-lg transition-shadow flex items-center justify-between group"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`h-12 w-12 rounded-[18px] flex items-center justify-center transition-colors ${
                                pedido.estado === 'en_camino'
                                  ? 'bg-success-50'
                                  : 'bg-gray-50 group-hover:bg-primary-50'
                              }`}
                            >
                              {hasMultipleDeliveries && stopNumber ? (
                                <span
                                  className={`h-7 w-7 rounded-full ${stopColors[(stopNumber - 1) % stopColors.length]} flex items-center justify-center text-white text-[10px] font-black`}
                                >
                                  {stopNumber}
                                </span>
                              ) : (
                                <ShoppingBag
                                  size={22}
                                  className={
                                    pedido.estado === 'en_camino'
                                      ? 'text-success-600'
                                      : 'text-gray-400 group-hover:text-primary-600'
                                  }
                                />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-black text-gray-900 uppercase tracking-tight">
                                #{pedido.numero} · {pedido.cliente_nombre}
                              </p>
                              <p className="text-xs font-bold text-gray-400 truncate max-w-[200px]">
                                {pedido.cliente_direccion}
                              </p>
                              {pedido.hora_entrega ? (
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600 mt-0.5">
                                  Entrega {pedido.hora_entrega}
                                </p>
                              ) : null}
                              {hasMultipleDeliveries && pedido.distance !== undefined && (
                                <p className="text-[10px] font-black text-violet-500 mt-0.5">
                                  {Math.round(pedido.distance)}m de distancia
                                </p>
                              )}
                              <p className="text-xs font-black text-gray-700 mt-0.5">
                                {fmt(pedido.total)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span
                              className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${
                                pedido.estado === 'en_camino'
                                  ? 'bg-success-50 text-success-600'
                                  : 'bg-primary-50 text-primary-600'
                              }`}
                            >
                              {pedido.estado.replace('_', ' ')}
                            </span>
                            <ChevronRight size={18} className="text-gray-300" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            )}

            {/* ── Tab: Historial de sesión ── */}
            {activeTab === 'historial' && (
              <div className="space-y-3">
                {historialSesion.length === 0 ? (
                  <div className="py-16 text-center flex flex-col items-center opacity-30">
                    <Star size={48} strokeWidth={1} className="mb-4" />
                    <p className="text-sm font-bold uppercase tracking-widest">
                      Aún no entregaste nada
                    </p>
                  </div>
                ) : (
                  historialSesion.map((p, i) => (
                    <div
                      key={p.id + '-' + i}
                      className="rounded-[24px] bg-white border border-gray-100 p-4 flex items-center justify-between shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-success-50 flex items-center justify-center">
                          <CheckCircle2 size={18} className="text-success-600" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-gray-900">
                            #{p.numero} · {p.cliente_nombre || 'S/N'}
                          </p>
                          <p className="text-xs text-gray-400">{p.cliente_direccion}</p>
                          {p.hora_entrega ? (
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600 mt-0.5">
                              Entrega {p.hora_entrega}
                            </p>
                          ) : null}
                          <p className="text-[10px] text-success-600 font-bold mt-0.5">
                            {p.entregado_en ? format(parseDate(p.entregado_en), 'HH:mm') : ''} ·{' '}
                            {paymentMethodLabel(p.metodo_pago)}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-black text-gray-900">{fmt(p.total)}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        ) : (
          /* ── Detalle de pedido ──────────────────────────────── */
          <div className="flex flex-1 flex-col animate-in slide-in-from-right duration-300">
            <button
              onClick={() => setSelectedPedido(null)}
              className="mb-3 flex w-fit items-center gap-2 rounded-xl px-2 py-2 text-xs font-black uppercase tracking-wider text-gray-500 transition hover:bg-white hover:text-gray-900"
            >
              <X size={18} /> Volver
            </button>

            <div className="flex flex-1 flex-col overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-lg shadow-gray-200/60">
              {/* Hero card cliente: gradient sutil, avatar inicial, badge #pedido
                  arriba, timer/hora bien visible. Rediseño para dar vida y
                  jerarquia clara al detalle del pedido. */}
              <div
                className="relative overflow-hidden border-b border-gray-100 p-5 sm:p-6"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}0d 0%, #ffffff 60%)`,
                }}
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl"
                  style={{
                    background: `radial-gradient(circle, ${primaryColor}22, transparent 70%)`,
                  }}
                />
                <div className="relative">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div
                      className="rounded-full px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-white shadow-sm"
                      style={{ backgroundColor: primaryColor }}
                    >
                      #{selectedPedido.numero}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedPedido.estado === 'en_camino' && (
                        <div className="flex items-center gap-1.5 rounded-full bg-success-500 px-3 py-1.5 shadow-sm">
                          <Clock size={12} className="text-white" />
                          <span className="text-xs font-black tabular-nums text-white">
                            {fmtTimer(deliveryElapsed)}
                          </span>
                        </div>
                      )}
                      <span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-gray-500 backdrop-blur-sm">
                        {format(parseDate(selectedPedido.creado_en), 'HH:mm')} HS
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Avatar con inicial del cliente */}
                    <div
                      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-black text-white shadow-md"
                      style={{
                        background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
                      }}
                    >
                      {String(selectedPedido.cliente_nombre || '?')
                        .trim()
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                        Cliente
                      </p>
                      <h3 className="mt-0.5 break-words text-xl font-black leading-tight text-gray-900 sm:text-2xl">
                        {selectedPedido.cliente_nombre}
                      </h3>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {selectedPedido.hora_entrega ? (
                      <div className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-violet-50/70 p-3">
                        <div className="h-9 w-9 rounded-xl bg-violet-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                          <Clock size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest">
                            Hora de entrega
                          </p>
                          <p className="text-sm font-black text-violet-900 leading-tight">
                            {selectedPedido.hora_entrega}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                      <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <MapPin size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Dirección
                        </p>
                        <p className="break-words text-sm font-black leading-snug text-gray-900">
                          {selectedPedido.cliente_direccion}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-success-50/60 p-3">
                      <div className="h-9 w-9 rounded-xl bg-success-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                        <Phone size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black text-success-600 uppercase tracking-widest">
                          Teléfono
                        </p>
                        <p className="text-sm font-black text-emerald-900">
                          {selectedPedido.cliente_telefono || 'No disponible'}
                        </p>
                      </div>
                      {selectedPedido.cliente_telefono && (
                        <a
                          href={`tel:${selectedPedido.cliente_telefono}`}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-500 text-white shadow-md shadow-success-200 transition-all active:scale-90 hover:bg-emerald-600"
                        >
                          <Phone size={18} fill="currentColor" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mapa interactivo */}
              <div className="px-5 py-5 sm:px-6">
                <div className="overflow-hidden rounded-[22px] border border-gray-200 bg-white shadow-sm">
                  <div className="h-[230px] bg-gray-50 sm:h-[270px]">
                    {selectedPedido.cliente_direccion ? (
                      <RiderRouteMap
                        riderLat={selectedPedido.repartidor?.latitud}
                        riderLng={selectedPedido.repartidor?.longitud}
                        clientLat={selectedPedido.cliente_latitud}
                        clientLng={selectedPedido.cliente_longitud}
                        clientLocationExact={Boolean(selectedPedido.cliente_ubicacion_exacta)}
                        clientAddress={selectedPedido.cliente_direccion}
                        onNavigate={() => openNav(selectedPedido)}
                        mapConfig={mapConfig}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm font-bold text-gray-400">
                        Sin dirección cargada
                      </div>
                    )}
                  </div>

                  {/* ── Multi-delivery: otras paradas ── */}
                  {hasMultipleDeliveries && (
                    <div className="p-3 border-t border-gray-100 bg-gray-50/50">
                      <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">
                        Otras paradas en tu ruta
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {sortedPedidos
                          .filter((p) => p.id !== selectedPedido.id)
                          .map((p, idx) => {
                            const stopColors = [
                              'bg-emerald-500',
                              'bg-amber-500',
                              'bg-orange-500',
                              'bg-rose-500',
                              'bg-purple-500',
                            ];
                            const globalIdx = sortedPedidos.findIndex((sp) => sp.id === p.id);
                            return (
                              <button
                                key={p.id}
                                onClick={() => setSelectedPedido(p)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 shadow-sm hover:shadow-md transition-all"
                              >
                                <span
                                  className={`h-5 w-5 rounded-full ${stopColors[globalIdx % stopColors.length]} flex items-center justify-center text-white text-[9px] font-black`}
                                >
                                  {globalIdx + 1}
                                </span>
                                <span className="truncate max-w-[120px]">{p.cliente_nombre}</span>
                                {p.distance !== undefined && (
                                  <span className="text-[10px] text-violet-500 font-black">
                                    {Math.round(p.distance)}m
                                  </span>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* 4 botones de accion, iguales entre si (mismo alto y forma)
                      pero con colores distinguibles: MAPS marca, COPIAR neutro,
                      WHATSAPP verde, WAZE azul cielo. Aprieta subtly con
                      active:scale-95 para dar feedback tactil. */}
                  <div className="grid grid-cols-2 gap-2 border-t border-gray-100 bg-gray-50/60 p-3 sm:grid-cols-4">
                    <button
                      onClick={() => openNav(selectedPedido)}
                      className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-md transition-all active:scale-95"
                      style={{
                        background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
                        boxShadow: `0 4px 12px ${primaryColor}40`,
                      }}
                    >
                      <Navigation size={18} />
                      Maps
                    </button>
                    <a
                      href={buildWazeUrl(
                        {
                          latitud: selectedPedido.cliente_latitud,
                          longitud: selectedPedido.cliente_longitud,
                          direccion: selectedPedido.cliente_direccion,
                          ubicacionExacta: Boolean(selectedPedido.cliente_ubicacion_exacta),
                        },
                        mapConfig
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-sky-200 transition-all active:scale-95"
                    >
                      <Route size={18} /> Waze
                    </a>
                    {selectedPedido.cliente_telefono ? (
                      <a
                        href={`https://wa.me/${String(selectedPedido.cliente_telefono).replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-[10px] font-black uppercase tracking-widest text-white shadow-md shadow-emerald-200 transition-all active:scale-95"
                      >
                        <Phone size={18} /> WhatsApp
                      </a>
                    ) : (
                      <div className="hidden sm:block" />
                    )}
                    <button
                      onClick={() =>
                        navigator.clipboard
                          ?.writeText(selectedPedido.cliente_direccion || '')
                          .then(() => toast.success('Dirección copiada'))
                          .catch(() => toast.error('No se pudo copiar'))
                      }
                      className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-gray-200 bg-white text-[10px] font-black uppercase tracking-widest text-gray-700 shadow-sm transition-all active:scale-95"
                    >
                      <Copy size={16} /> Copiar
                    </button>
                  </div>
                </div>
              </div>

              {/* Resumen del pedido. Total a cobrar en banda de color:
                  verde si ya cobrado, ambar si pendiente en efectivo, azul
                  neutro para digitales. */}
              {(() => {
                const estadoPago = String(selectedPedido.pago_estado || 'pendiente').toLowerCase();
                const metodoPago = String(selectedPedido.metodo_pago || 'efectivo').toLowerCase();
                const yaCobrado = ['pagado', 'cobrado', 'aprobado'].includes(estadoPago);
                const totalBg = yaCobrado
                  ? 'linear-gradient(135deg, #059669, #10b981)'
                  : metodoPago === 'efectivo'
                    ? 'linear-gradient(135deg, #d97706, #f59e0b)'
                    : `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`;
                const totalShadow = yaCobrado
                  ? '0 12px 28px rgba(16,185,129,0.35)'
                  : metodoPago === 'efectivo'
                    ? '0 12px 28px rgba(245,158,11,0.35)'
                    : `0 12px 28px ${primaryColor}40`;
                return (
                  <>
                    <div className="mx-5 mb-4 flex-1 rounded-[22px] bg-gray-50 p-5 sm:mx-6">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          Resumen del pedido
                        </span>
                        <span
                          className={`rounded-lg px-2.5 py-1 text-[10px] font-black ${paymentStatusTone(selectedPedido.pago_estado)}`}
                        >
                          {paymentMethodLabel(selectedPedido.metodo_pago)} ·{' '}
                          {paymentStatusLabel(selectedPedido.pago_estado)}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {selectedItems.map((it, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between gap-4 text-sm bg-white rounded-xl p-3 border border-gray-100"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-50 text-primary-600 text-[10px] font-black shrink-0">
                                {it.cantidad}x
                              </span>
                              <p className="min-w-0 break-words font-bold text-gray-700">
                                {it.nombre}
                              </p>
                            </div>
                            <p className="shrink-0 font-black text-gray-900">
                              {fmt(it.precio_unitario * it.cantidad)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Total a cobrar: banda grande con color segun estado */}
                    <div
                      className="relative mx-5 mb-5 overflow-hidden rounded-[22px] p-5 shadow-lg sm:mx-6"
                      style={{ background: totalBg, boxShadow: totalShadow }}
                    >
                      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
                      <div className="relative flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/80">
                            {yaCobrado ? '✓ Ya cobrado' : 'Total a cobrar'}
                          </p>
                          <p className="mt-1 text-[10px] font-bold text-white/70">
                            {paymentMethodLabel(selectedPedido.metodo_pago)}
                          </p>
                        </div>
                        <p className="text-3xl font-black text-white tabular-nums leading-none">
                          {fmt(selectedPedido.total)}
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* Selector de metodo de pago (cuando esta pendiente) */}
              {paymentStatusLabel(selectedPedido.pago_estado) === 'Pendiente' && (
                <div className="mx-5 mb-5 rounded-[22px] bg-gray-50 p-5 sm:mx-6">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <CreditCard size={15} className="text-gray-500" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        Medio que usará el cliente
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(() => {
                        let enabled = [];
                        try {
                          enabled = JSON.parse(data?.settings?.metodos_pago || '[]');
                        } catch {
                          enabled = [];
                        }
                        if (!enabled.length) {
                          enabled = ['efectivo', 'transferencia', 'modo', 'uala'];
                        }
                        return enabled
                          .filter((method) => method !== 'mercadopago')
                          .map((method) => (
                            <button
                              key={method}
                              type="button"
                              disabled={changingPayment || selectedPedido.metodo_pago === method}
                              onClick={() => changePaymentMethod(selectedPedido.id, method)}
                              className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-black transition ${
                                selectedPedido.metodo_pago === method
                                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                                  : 'border-gray-200 bg-white text-gray-700'
                              } disabled:opacity-60`}
                            >
                              {paymentMethodLabel(method)}
                            </button>
                          ));
                      })()}
                    </div>
                    <p className="mt-3 text-[11px] font-semibold leading-relaxed text-gray-500">
                      Se puede cambiar mientras figure pendiente. Al confirmar la entrega quedará
                      registrado como cobrado.
                    </p>
                  </div>
                </div>
              )}

              {/* Acciones */}
              <div className="flex flex-col gap-3 border-t border-gray-100 bg-white p-5 sm:p-6">
                {/* Chat directo con el local por WhatsApp (motivo del pedido,
                    problema, etc.). Mucho más práctico que llamar y esperar. */}
                {telefonoLocal ? (
                  <a
                    href={`https://wa.me/${String(telefonoLocal).replace(/\D/g, '')}?text=${encodeURIComponent(
                      `Hola, sobre el pedido #${selectedPedido.numero} de ${selectedPedido.cliente_nombre || 'S/N'}: `
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-success-50 text-xs font-black uppercase tracking-widest text-success-700 transition-all active:scale-95"
                  >
                    <PhoneCall size={14} /> Escribir al local por WhatsApp
                  </a>
                ) : null}
                {/* Comenzar reparto */}
                {['confirmado', 'listo', 'preparando'].includes(selectedPedido.estado) && (
                  <button
                    onClick={() => updateEstado(selectedPedido.id, 'en_camino')}
                    className="rider-primary-button flex h-14 w-full items-center justify-center gap-3 rounded-2xl text-sm font-black uppercase tracking-wide text-white shadow-lg transition-all active:scale-[0.98]"
                  >
                    <Truck size={22} /> Comenzar reparto
                  </button>
                )}

                {/* ── NEW: Swipe para entregar ── */}
                {selectedPedido.estado === 'en_camino' && (
                  <SwipeButton
                    onComplete={() => handleSwipeComplete(selectedPedido)}
                    disabled={false}
                  />
                )}

                {/* Bloque incidencia + cancelar */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setIncidenciaOpen(true)}
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-warning-50 text-[11px] font-black uppercase tracking-wide text-warning-700 active:scale-95 transition-transform"
                  >
                    <AlertCircle size={15} /> Reportar problema
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm('¿Cancelar este pedido? No se puede deshacer.')) {
                        updateEstado(selectedPedido.id, 'cancelado');
                      }
                    }}
                    className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-danger-50 text-[11px] font-black uppercase tracking-wide text-danger-700 active:scale-95 transition-transform"
                  >
                    <X size={15} /> Cancelar
                  </button>
                </div>

                {/* Popover animado con motivos preseteados */}
                <AnimatePresence>
                  {incidenciaOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="rounded-2xl border border-amber-200 bg-warning-50 p-4"
                    >
                      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-warning-700">
                        ¿Qué pasó? Elegí el motivo:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: 'no_atiende', label: 'Cliente no atiende' },
                          { key: 'direccion_mal', label: 'Dirección mal' },
                          { key: 'cliente_rechazo', label: 'Cliente rechazó' },
                          { key: 'cerrado', label: 'Edificio cerrado' },
                        ].map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => {
                              updateEstado(selectedPedido.id, 'incidencia', { motivo: key });
                              setIncidenciaOpen(false);
                              // Avisar al local por WhatsApp automáticamente si hay
                              // número configurado.
                              if (telefonoLocal) {
                                window.open(
                                  `https://wa.me/${String(telefonoLocal).replace(/\D/g, '')}?text=${encodeURIComponent(
                                    `Pedido #${selectedPedido.numero} (${selectedPedido.cliente_nombre || 'S/N'}): ${label}`
                                  )}`,
                                  '_blank'
                                );
                              }
                            }}
                            className="rounded-xl bg-white border border-amber-100 px-3 py-3 text-[11px] font-black uppercase tracking-wide text-gray-700 active:scale-95 transition-transform hover:border-amber-300"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setIncidenciaOpen(false)}
                        className="mt-3 w-full h-10 rounded-xl bg-white border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500"
                      >
                        Cerrar
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="px-6 py-3 bg-white border-t border-gray-100 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              !isConnected
                ? 'bg-rose-500 animate-pulse'
                : isOnline
                  ? 'bg-success-500 animate-pulse'
                  : 'bg-gray-300'
            }`}
          />
          <span className={!isConnected ? 'text-rose-500' : 'text-gray-400'}>
            {!isConnected
              ? 'Sin señal · guardando local'
              : isOnline
                ? `Sincronizado ${nowTime}`
                : 'Modo offline'}
          </span>
          {offlineCount > 0 ? (
            <span
              className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 tabular-nums"
              title={`${offlineCount} accion(es) esperando reconexión`}
            >
              {offlineCount} pend.
            </span>
          ) : null}
        </div>
        <p className="text-gray-400">{appName}</p>
      </footer>

      {/* ── NEW: PIN Modal ──────────────────────────────────────── */}
      {pinModal.open && (
        <PinModal
          pedidoNumero={
            data?.pedidos?.find((p) => p.id === pinModal.pedidoId)?.numero || pinModal.pedidoId
          }
          onConfirm={handlePinConfirm}
          onClose={() => setPinModal({ open: false, pedidoId: null })}
        />
      )}
    </div>
  );
}
