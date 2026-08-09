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
  readFailedActions,
  clearFailedActions,
  clearRiderQueue,
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
  Eye,
  EyeOff,
  ShieldCheck,
  Wifi,
  Navigation2,
  LockKeyhole,
} from 'lucide-react';
import { format } from 'date-fns';
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
  isRiderBiometricAvailable,
  announceRiderOrder,
  clearNativeRiderAuth,
  getRiderLocationPermission,
  loadNativeRiderAuth,
  unlockRiderWithBiometrics,
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
  wipeRiderDevice,
} from '../lib/nativeRiderGps.js';
import api from '../lib/api.js';
import { BRAND } from '../lib/theme.js';
import { parseFechaServidor } from '../lib/fechas.js';
import { checkForUpdate, dismissUpdate, downloadAndInstall } from '../lib/riderUpdater.js';
import { registerRiderPushToken, subscribeRiderPush } from '../lib/riderPush.js';
import { socketManager } from '../lib/socket.js';
import { runDeliveredAlert, runOrderAlert, useOrderAlertPlayback } from '../lib/orderAlerts.js';
import RiderRouteMap from '../components/RiderRouteMap.jsx';
import { DEFAULT_BRAND_LOGO } from '../lib/webPublicaHelpers.js';
import { configurarVibracion, haptic } from '../lib/riderHaptics.js';
import {
  PREFERENCIAS_POR_DEFECTO,
  guardarPreferencias,
  leerPreferencias,
  preferenciasParaAlerta,
} from '../lib/riderPreferencias.js';
import {
  saludoPorHora,
  nivelUrgencia,
  ordenarPorCercania,
  fmtDistancia,
  KEY_TURNO_INICIO,
  riderRecordKey,
} from '../lib/riderUx.js';
import PedidoTimeline from '../components/rider/PedidoTimeline.jsx';
import ToggleTurno from '../components/rider/ToggleTurno.jsx';
import RiderSkeleton from '../components/rider/RiderSkeleton.jsx';
import CierreTurnoModal from '../components/rider/CierreTurnoModal.jsx';
import DeshacerEntrega from '../components/rider/DeshacerEntrega.jsx';
import HeroPedido from '../components/rider/HeroPedido.jsx';
import WidgetGanancias from '../components/rider/WidgetGanancias.jsx';
import ModoEnRuta from '../components/rider/ModoEnRuta.jsx';
import NotificacionInApp from '../components/rider/NotificacionInApp.jsx';
import PullToRefresh from '../components/rider/PullToRefresh.jsx';
import PerfilRider from '../components/rider/PerfilRider.jsx';
import BottomTabBar from '../components/rider/BottomTabBar.jsx';
import '../styles/riderDark.css';

// ── Helpers ────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
/*
  Normalizar el espacio no alcanzaba. Las fechas que vienen del servidor
  —`entregado_en`, `creado_en`— están en UTC pero sin declararlo, así que el
  celular las leía como hora local: en Tucumán la app le mostraba al rider las
  entregas 3 horas más tarde de lo que habían pasado.

  `parseFechaServidor` respeta el sufijo cuando ya viene (es el caso de
  `lastPositionAt`, que lo genera el propio celular) y lo agrega cuando falta.
  Ver lib/fechas.js.
*/
const parseDate = (str) => parseFechaServidor(str);

/**
 * ¿Todavía se puede corregir el medio de pago de un pedido entregado?
 *
 * El cliente suele avisar que paga por transferencia cuando el rider ya marcó
 * la entrega. Se le da la misma ventana de gracia que para deshacerla. Es sólo
 * para mostrar u ocultar el control: quien decide de verdad es el servidor,
 * que vuelve a validar el plazo.
 */
const VENTANA_CORREGIR_PAGO_MIN = 5;

function puedeCorregirPago(pedido) {
  if (!pedido || pedido.estado !== 'entregado') return false;
  const marcado = parseFechaServidor(pedido.entregado_en || pedido.actualizado_en).getTime();
  if (!Number.isFinite(marcado)) return false;
  return (Date.now() - marcado) / 60000 <= VENTANA_CORREGIR_PAGO_MIN;
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const riderHistoryKey = (riderId) => `ms_rider_history_${riderId}_${todayStr()}`;
const RIDER_APP_NAME = 'Modo Sabor Riders';
const RIDER_HEADER_NAME = 'Modo Sabor Delivery';
const RIDER_FLAME_ASSET = '/rider-flame-red.png';

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

// NOTA: `haversine` y `sortByDistance` se movieron a lib/riderUx.js como
// `distanciaMetros` y `ordenarPorCercania`. El nuevo ordenamiento usa
// vecino mas proximo en vez de simple distancia al rider, y ademas NO
// descarta los pedidos sin coordenadas — el filtro del anterior los hacia
// desaparecer de la lista, que era un bug real.

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
              fontSize: '13px',
              fontWeight: 600,
              color: '#6B7280',
              marginBottom: '8px',
            }}
          >
            PIN de entrega · Pedido #{pedidoNumero}
          </p>
          <div
            style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '18px' }}
          >
            {/* Los puntos y el botón usaban #5D87FF, el azul de la plantilla
                vieja. Es la única pantalla del rider que se ve azul. */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: '13px',
                  height: '13px',
                  borderRadius: '50%',
                  background: i < value.length ? BRAND : '#E5E7EB',
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
            background: value ? BRAND : '#E5E7EB',
            color: value ? 'white' : '#9CA3AF',
            fontSize: '15px',
            fontWeight: 700,
            cursor: value ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s',
          }}
        >
          {loading ? 'Verificando…' : 'Confirmar entrega'}
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
              fontSize: '14px',
              fontWeight: 600,
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
  const [savedRiderAuth, setSavedRiderAuth] = useState(null);
  const [unlockingRider, setUnlockingRider] = useState(false);
  const [loginForm, setLoginForm] = useState({ id: '', code: '' });
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [showRiderSplash, setShowRiderSplash] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [incidenciaOpen, setIncidenciaOpen] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isConnected, setIsConnected] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );

  // ── Auto-update de la app rider: al abrir (post-login) consultamos
  // el manifest del server. Si hay version nueva, mostramos modal.
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateDownloading, setUpdateDownloading] = useState(false);

  // ── Stats del rider (ganancias, racha, historico). Vienen del backend
  // para que sobrevivan a cambios de celular o borrado de la app.
  const [riderStats, setRiderStats] = useState(null);

  // ── Modo en ruta: pantalla completa mientras maneja. Se activa al
  // comenzar el reparto y mantiene la pantalla encendida (wake lock).
  const [modoRutaPedidoId, setModoRutaPedidoId] = useState(null);

  // ── Notificacion in-app de pedido nuevo (reemplaza al toast generico
  // cuando entra un pedido con la app abierta).
  const [notifPedido, setNotifPedido] = useState(null);

  // ── Deshacer entrega: guardamos el ultimo pedido entregado para
  // ofrecer la reversion durante unos minutos. Solo aplica a entregas
  // hechas con conexion (las offline todavia no llegaron al server).
  const [entregaReciente, setEntregaReciente] = useState(null);

  // ── Cierre de turno: snapshot congelado del resumen del dia que se
  // muestra al pasar a "no disponible". null = modal cerrado.
  const [cierreTurno, setCierreTurno] = useState(null);
  // Momento en que el rider se puso disponible. Se persiste en Preferences
  // porque si cierra y reabre la app a mitad de turno (o Android la mata
  // por RAM) el contador tiene que seguir corriendo desde el inicio real,
  // no desde que volvio a abrir.
  const inicioTurnoRef = useRef(null);

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
  // Preferencias del propio rider: sonido, voz, vibración y letra grande.
  const [preferencias, setPreferencias] = useState(PREFERENCIAS_POR_DEFECTO);
  /*
    El aviso de pedido nuevo se dispara desde un callback de socket que se
    registra una sola vez. Con el estado directo leería siempre el valor del
    primer render; con el ref lee el actual.
  */
  const preferenciasRef = useRef(PREFERENCIAS_POR_DEFECTO);
  // Con cuánto paga el cliente, para calcular el vuelto en la puerta.
  const [pagaCon, setPagaCon] = useState('');
  // Datos del legajo del rider: nombre (sólo lectura), teléfono y vehículo.
  const [perfilRider, setPerfilRider] = useState(null);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);

  /*
    El monto se borra al cambiar de pedido. Sin esto, el rider abre el
    siguiente y se encuentra el importe del anterior ya cargado: el vuelto que
    ve es de otra entrega, y eso es peor que no tener la calculadora.
  */
  useEffect(() => {
    setPagaCon('');
  }, [selectedPedido?.id]);
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
        // Cargar auth + toggle online + ultimo uso + inicio de turno
        const [saved, onlineStored, lastSeen, turnoInicio] = await Promise.all([
          loadNativeRiderAuth(),
          riderStorageGet('ms_rider_online'),
          riderStorageGet('ms_rider_last_seen'),
          riderStorageGet(KEY_TURNO_INICIO),
        ]);

        // Recuperar el inicio del turno si quedo uno abierto (la app se
        // cerro o Android la mato a mitad de jornada). Si la marca es de
        // hace mas de 18h la descartamos: es de un turno viejo que nunca
        // se cerro bien.
        const inicioMs = Number(turnoInicio || 0);
        if (inicioMs && Date.now() - inicioMs < 18 * 60 * 60 * 1000) {
          inicioTurnoRef.current = inicioMs;
        } else if (inicioMs) {
          riderStorageRemove(KEY_TURNO_INICIO).catch(() => {});
        }
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
          const quedaOnline = onlineStored !== 'false';
          if (!quedaOnline) setIsOnline(false);
          // Si arranca disponible y no habia marca de turno (primera vez,
          // o venia de una version anterior sin este campo), la creamos
          // ahora para que el resumen de cierre tenga de donde contar.
          if (quedaOnline && !inicioTurnoRef.current) {
            const ahora = Date.now();
            inicioTurnoRef.current = ahora;
            riderStorageSet(KEY_TURNO_INICIO, String(ahora)).catch(() => {});
          }
        }
        if (!cancelled && saved) {
          setLoginForm(saved);
          // La sesión sigue guardada; al abrir se pide huella/PIN del propio
          // teléfono, sin volver a pedir el ID y código del local.
          if (await isRiderBiometricAvailable()) {
            setSavedRiderAuth(saved);
          } else {
            setRiderAuth(saved);
          }
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
        // Ocultar el splash nativo con fadeout suave apenas terminamos el
        // bootstrap. Si no esta el plugin (web o build sin cap sync), el
        // import dinamico falla silencioso y no rompe nada.
        try {
          const cap = await import('@capacitor/core');
          if (cap.Capacitor?.isNativePlatform?.()) {
            const { SplashScreen } = await import('@capacitor/splash-screen');
            SplashScreen.hide({ fadeOutDuration: 400 }).catch(() => {});
          }
        } catch {
          // sin plugin: continuar
        }
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
    document.title = RIDER_APP_NAME;
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
  // Splash visual de marca: el splash nativo es estatico, esta capa agrega
  // movimiento apenas React toma control de la pantalla.
  useEffect(() => {
    const timer = window.setTimeout(() => setShowRiderSplash(false), 1450);
    return () => window.clearTimeout(timer);
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

  // Preferencias guardadas en este celular.
  useEffect(() => {
    leerPreferencias().then((guardadas) => {
      setPreferencias(guardadas);
      preferenciasRef.current = guardadas;
      configurarVibracion(guardadas.vibracion);
    });
  }, []);

  // Datos del legajo, para la pestaña de perfil.
  useEffect(() => {
    if (!riderAuth?.id) return;
    api
      .get(`/repartidores/${riderAuth.id}/rider/${riderAuth.code}/perfil`)
      .then(setPerfilRider)
      .catch(() => {
        // Sin estos datos el perfil igual muestra las estadísticas: no vale la
        // pena molestar al rider con un error por algo secundario.
      });
  }, [riderAuth?.id, riderAuth?.code]);

  const guardarPerfilRider = async (datos) => {
    if (!riderAuth || guardandoPerfil) return;
    setGuardandoPerfil(true);
    try {
      const actualizado = await api.put(
        `/repartidores/${riderAuth.id}/rider/${riderAuth.code}/perfil`,
        datos
      );
      setPerfilRider(actualizado);
      toast.success('Datos actualizados');
    } catch (error) {
      toast.error(error?.error || 'No se pudieron guardar tus datos');
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const cambiarPreferencia = (clave, valor) => {
    const siguiente = { ...preferencias, [clave]: valor };
    setPreferencias(siguiente);
    preferenciasRef.current = siguiente;
    configurarVibracion(siguiente.vibracion);
    guardarPreferencias(siguiente);
    // Un toque de confirmación: si acaba de prender la vibración, la siente.
    if (clave === 'vibracion' && valor) haptic('tap');
  };

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

      // Notificacion in-app con marca y accion directa. Solo tiene
      // sentido si el rider esta mirando la app; si esta en background
      // ya se encarga la LocalNotification nativa de abajo.
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setNotifPedido(pedido);
      }

      try {
        await notifyRiderNewOrder(pedido);
      } catch {}

      // Anuncio por voz para "ojos en el camino". En Android se usa TTS
      // nativo: el WebView puede tener su motor de voz suspendido.
      const vozActiva = preferenciasRef.current?.voz !== false;
      const cliente = String(pedido?.cliente_nombre || 'sin nombre').split(' ')[0];
      const direccion = String(pedido?.cliente_direccion || '').split(',')[0];
      const total = Number(pedido?.total || 0);
      const textoVoz = `Nuevo pedido para ${cliente}${direccion ? ` en ${direccion}` : ''}. Monto ${Math.round(total)} pesos.`;
      if (vozActiva) {
        try {
          if (isNativeRiderApp()) await announceRiderOrder(textoVoz);
          else speakRider(textoVoz);
        } catch {}
      }

      try {
        await runOrderAlert({
          pedido,
          config: {
            ...(configRef.current || {}),
            // Antes estaban clavadas acá: sonido siempre, voz nunca. Ahora
            // manda lo que el rider eligió en su perfil.
            ...preferenciasParaAlerta({
              ...preferenciasRef.current,
              // La voz ya salió por TTS nativo arriba: no repetirla por el
              // motor del WebView.
              voz: isNativeRiderApp() ? false : preferenciasRef.current?.voz,
            }),
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

    // Registrar el device en FCM (si Firebase esta configurado). Si no
    // esta @capacitor/push-notifications instalado o falta google-services.json
    // esto es no-op silencioso: la app sigue igual.
    (async () => {
      try {
        await registerRiderPushToken(riderAuth.id, riderAuth.code);
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [riderAuth]);

  // ── Stats personales (ganancias, racha, historico) ──────────────
  // Se refrescan al loguearse y cada vez que cambia el contador de
  // entregas del dia, no en cada poll: es informacion que se mueve
  // lento y no vale la pena pedirla cada 15s.
  const fetchStats = useCallback(async () => {
    if (!riderAuth) return;
    try {
      const res = await api.get(`/repartidores/${riderAuth.id}/rider/${riderAuth.code}/stats`);
      setRiderStats(res);
    } catch {
      // Silencioso: el widget simplemente no se muestra.
    }
  }, [riderAuth]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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

    // FCM cubre el caso donde Android cerró el socket. En foreground el
    // listener vuelve a consultar el pedido para aplicar la misma alerta,
    // estado y cola offline que una asignación por Socket.IO.
    let disposedPush = false;
    let unsubscribePush = () => {};
    subscribeRiderPush((notification) => {
      if (String(notification?.data?.type || '') === 'pedido_asignado') {
        fetchData({ silent: true });
      }
    }).then((unsubscribe) => {
      if (disposedPush) {
        unsubscribe();
      } else {
        unsubscribePush = unsubscribe;
      }
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
      disposedPush = true;
      unsubscribePush();
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
    const next = { id: loginForm.id, code: loginForm.code };
    saveNativeRiderAuth(next)
      .then((saved) => {
        setRiderAuth(next);
        if (saved?.secure === false) {
          toast('Sesión guardada. Activá PIN o huella para protegerla con cifrado del teléfono.');
        }
      })
      .catch(() => toast.error('No pudimos guardar la sesión en este teléfono.'));
  };

  const handleBiometricUnlock = async () => {
    if (!savedRiderAuth || unlockingRider) return;
    setUnlockingRider(true);
    try {
      const authenticated = await unlockRiderWithBiometrics();
      if (authenticated) {
        setRiderAuth(savedRiderAuth);
        setSavedRiderAuth(null);
      } else {
        toast.error('No se pudo validar la huella o el PIN del teléfono.');
      }
    } finally {
      setUnlockingRider(false);
    }
  };

  const resetLocalState = () => {
    setRiderAuth(null);
    setData(null);
    setSelectedPedido(null);
    setHistorialSesion([]);
    setEntregaReciente(null);
    setCierreTurno(null);
    setOfflineCount(0);
    inicioTurnoRef.current = null;
    deliveredSeenRef.current = new Set();
  };

  const handleLogout = () => {
    stopTracking();
    riderStorageRemove('ms_rider_id').catch(() => {});
    riderStorageRemove('ms_rider_code').catch(() => {});
    riderStorageRemove(KEY_TURNO_INICIO).catch(() => {});
    clearNativeRiderAuth().catch(() => {});
    resetLocalState();
    setSavedRiderAuth(null);
  };

  /**
   * Cierre de sesion COMPLETO: borra todo el rastro del rider en el
   * dispositivo (historial, record personal, cola offline, pedidos
   * notificados, preferencias).
   *
   * Es para cuando el celular pasa a otra persona. Se separa del logout
   * normal a proposito: el logout comun tiene que ser barato de revertir
   * (volves a entrar con tu codigo y seguis donde estabas), este no.
   */
  const handleLogoutCompleto = async () => {
    const pendientes = offlineCount > 0;
    const aviso = pendientes
      ? `Tenés ${offlineCount} acción(es) sin sincronizar que se van a PERDER.\n\n¿Borrar igual todos los datos de este celular?`
      : '¿Borrar todos los datos del rider en este celular?\n\nSe pierde el historial del día y el récord personal. Usalo solo si el celular pasa a otra persona.';

    if (!window.confirm(aviso)) return;

    stopTracking();
    try {
      await wipeRiderDevice();
      await clearRiderQueue();
    } catch {}
    resetLocalState();
    toast.success('Dispositivo limpio. Puede usarlo otro rider.', { duration: 4000 });
  };

  // ── Toggle online/offline ──────────────────────────────────────
  // Al pasar a "no disponible" con entregas hechas, mostramos el modal
  // de cierre de turno con el resumen (incluye el efectivo a rendir en
  // el local, que es el dato que mas le importa al rider al terminar).
  const toggleOnline = async (forced) => {
    const next = typeof forced === 'boolean' ? forced : !isOnline;
    setIsOnline(next);
    riderStorageSet('ms_rider_online', String(next)).catch(() => {});
    haptic(next ? 'success' : 'warning');

    // ── Se pone DISPONIBLE: arranca el reloj del turno ──
    if (next) {
      const ahora = Date.now();
      inicioTurnoRef.current = ahora;
      riderStorageSet(KEY_TURNO_INICIO, String(ahora)).catch(() => {});
      toast('✅ Disponible', { duration: 1500 });
      return;
    }

    // ── Se pone NO DISPONIBLE ──
    if (historialSesion.length === 0) {
      riderStorageRemove(KEY_TURNO_INICIO).catch(() => {});
      inicioTurnoRef.current = null;
      toast('⛔ No disponible', { duration: 1500 });
      return;
    }

    const entregados = historialSesion.length;
    const efectivo = historialSesion
      .filter((p) =>
        String(p.metodo_pago || '')
          .toLowerCase()
          .includes('efectivo')
      )
      .reduce((acc, p) => acc + Number(p.total || 0), 0);
    const total = historialSesion.reduce((acc, p) => acc + Number(p.total || 0), 0);
    const meta = Math.max(1, Number(data?.settings?.rider_meta_diaria || 10));

    // Duracion real del turno. Si por algun motivo no tenemos marca de
    // inicio (primera vez tras actualizar la app, storage limpio), no
    // inventamos un numero: mandamos 0 y el modal no muestra tiempo.
    const inicio = inicioTurnoRef.current;
    const minutos = inicio ? Math.max(0, Math.round((Date.now() - inicio) / 60000)) : 0;

    // Record HISTORICO de entregas en un dia, distinto de la meta diaria.
    // Se guarda por rider en Preferences.
    let recordAnterior = 0;
    let esRecord = false;
    try {
      const guardado = await riderStorageGet(riderRecordKey(riderAuth?.id));
      recordAnterior = Number(guardado) || 0;
      esRecord = entregados > recordAnterior;
      if (esRecord) {
        await riderStorageSet(riderRecordKey(riderAuth?.id), String(entregados));
      }
    } catch {
      // Sin storage no podemos afirmar que sea record; no lo celebramos.
      esRecord = false;
    }

    // Snapshot congelado: si el rider vuelve a ponerse online mientras
    // el modal esta abierto, los numeros no se mueven.
    setCierreTurno({
      entregas: entregados,
      totalCobrado: total,
      efectivo,
      minutos,
      metaCumplida: entregados >= meta,
      record: esRecord,
      recordAnterior,
    });

    riderStorageRemove(KEY_TURNO_INICIO).catch(() => {});
    inicioTurnoRef.current = null;
  };

  // ── Estado de pedido ───────────────────────────────────────────
  // Si el rider esta sin señal, encolamos la accion y aceptamos el
  // cambio en el UI local para no bloquearlo. La cola offline la
  // sincroniza al reconectar.
  const updateEstado = async (pedidoId, nuevoEstado, extra = {}) => {
    const url = `/repartidores/${riderAuth.id}/rider/${riderAuth.code}/pedido/${pedidoId}/estado`;
    const body = { estado: nuevoEstado, ...extra };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await enqueueRiderAction({
        kind: nuevoEstado === 'incidencia' ? 'report_issue' : 'change_state',
        url,
        method: 'PUT',
        body,
      });
      toast('📡 Sin señal — se guardó y se sincroniza al reconectar.', {
        duration: 2500,
      });
      // Actualizacion optimista local del estado.
      setData((current) => ({
        ...current,
        pedidos: (current?.pedidos || []).map((p) =>
          p.id === pedidoId ? { ...p, estado: nuevoEstado } : p
        ),
      }));
      return;
    }

    try {
      await api.put(url, body);
      toast.success(`Pedido ${nuevoEstado.replace('_', ' ')}`);
      fetchData();
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar el estado');
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

      /*
        El historial de la sesión es de donde sale el efectivo a rendir en el
        cierre de turno. Si el rider corrige el medio de un pedido ya
        entregado y no lo actualizamos acá, el cierre le sigue pidiendo el
        efectivo de un pedido que en realidad se pagó por transferencia: un
        faltante inventado, que es justo lo que este cambio viene a evitar.
      */
      setHistorialSesion((current) =>
        (current || []).map((pedido) =>
          pedido.id === updated.id ? { ...pedido, metodo_pago: updated.metodo_pago } : pedido
        )
      );

      toast.success(`Cobro cambiado a ${paymentMethodLabel(metodoPago)}`);
    } catch (error) {
      toast.error(error?.error || 'No se pudo cambiar el medio de pago');
    } finally {
      setChangingPayment(false);
    }
  };

  // ── NEW: Swipe complete → check PIN o finalizar directo ────────
  const handleSwipeComplete = async (pedidoActual) => {
    const validacionActiva = String(data?.settings?.delivery_validacion_activa || '0') === '1';
    const requiereFoto = String(data?.settings?.delivery_requiere_foto_entrega || '0') === '1';

    // Si el negocio activo la foto obligatoria, pedirla antes de cerrar
    // el pedido. Si el rider cancela la camara, no cierra la entrega.
    let fotoDataUrl = null;
    if (requiereFoto) {
      try {
        const { captureDeliveryPhoto } = await import('../lib/riderCamera.js');
        fotoDataUrl = await captureDeliveryPhoto();
      } catch {
        fotoDataUrl = null;
      }
      if (!fotoDataUrl) {
        toast.error('Necesitamos una foto de la entrega para cerrar el pedido.');
        return;
      }
    }

    if (validacionActiva && pedidoActual?.entrega_pin) {
      setPinModal({ open: true, pedidoId: pedidoActual.id, foto: fotoDataUrl });
    } else {
      finalizarEntrega(pedidoActual.id, null, fotoDataUrl);
    }
  };

  // ── Finalizar entrega ──────────────────────────────────────────
  const finalizarEntrega = async (pedidoId, pin, fotoDataUrl = null) => {
    const pedidoActual = data?.pedidos?.find((p) => p.id === pedidoId) || selectedPedido;
    const payload = {};
    if (pin) payload.pin = pin;
    if (fotoDataUrl) payload.entrega_foto = fotoDataUrl;

    const endpoint = `/repartidores/${riderAuth.id}/rider/${riderAuth.code}/entregar/${pedidoId}`;

    // Si no hay red, encolar la accion y cerrar localmente para que el
    // rider pueda seguir trabajando. La cola se procesa al reconectar.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await enqueueRiderAction({
        kind: 'mark_delivered',
        url: endpoint,
        method: 'POST',
        body: payload,
        meta: { pedidoId, numero: pedidoActual?.numero },
      });
      deliveredSeenRef.current.add(pedidoId);
      if (pedidoActual) {
        setHistorialSesion((prev) => [
          { ...pedidoActual, entregado_en: new Date().toISOString(), _offline: true },
          ...prev,
        ]);
      }
      setPinModal({ open: false, pedidoId: null });
      setSelectedPedido(null);
      toast.success('Entrega guardada offline — se envía al recuperar señal.');
      return;
    }

    try {
      await api.post(endpoint, payload);
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
      // Habilitar la ventana para deshacer si fue por error.
      if (pedidoActual) setEntregaReciente(pedidoActual);
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

  // ── Computed: orden sugerido de la ruta ──
  // Usamos vecino mas proximo (no simple orden por distancia al rider):
  // con 6-8 pedidos, ordenar solo por "que tan lejos esta de mi ahora"
  // hace que el rider cruce el pueblo de ida y vuelta. El heuristico
  // arma una secuencia encadenada mucho mas razonable.
  //
  // Ademas ordenarPorCercania NO descarta los pedidos sin GPS (los manda
  // al final): el sortByDistance anterior los filtraba y desaparecian
  // de la lista, que era un bug real.
  const activePedidos = data?.pedidos || [];
  const hasMultipleDeliveries = activePedidos.length >= 2;
  const sortedPedidos = hasMultipleDeliveries
    ? ordenarPorCercania(activePedidos, riderLocation.lat, riderLocation.lng)
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

      /*
        Acciones que se dieron por perdidas.

        Antes se borraban en silencio: el rider marcaba una entrega, nunca
        llegaba al servidor, y nadie se enteraba hasta que faltaba plata en la
        caja. Ahora se avisa acá mismo para que pueda decirlo en el local.

        El aviso no se cierra solo. Es lo único de la app que interrumpe: una
        entrega perdida es plata.
      */
      const perdidas = await readFailedActions();
      if (perdidas.length) {
        const entregas = perdidas.filter((accion) => accion.kind === 'mark_delivered');
        toast.error(
          entregas.length
            ? `No se pudo registrar ${entregas.length === 1 ? 'una entrega' : `${entregas.length} entregas`}. Avisá en el local antes de cerrar el turno.`
            : `Quedaron ${perdidas.length} acciones sin enviar. Avisá en el local.`,
          { duration: Infinity, id: 'acciones-perdidas' }
        );
        await clearFailedActions();
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

  // La app Rider queda siempre en modo claro para mantener consistencia visual.
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  // ── Auto-update: chequea si hay APK más nuevo en el server ────────
  // Corre tanto pre como post-login: si hay forceUpdate, el rider no debería
  // poder loguearse hasta actualizar. Solo activo en Capacitor Android
  // (checkForUpdate retorna null en web/PWA).
  useEffect(() => {
    if (bootstrapping) return undefined;
    let cancelled = false;

    const runCheck = async ({ force = false } = {}) => {
      try {
        const info = await checkForUpdate(api, { force });
        if (!cancelled && info) {
          setUpdateInfo(info);
        }
      } catch {
        // silent — sin update no molestamos al rider
      }
    };

    // Chequeo inicial demorado 4s para no competir con el bootstrap
    const initialTimer = window.setTimeout(() => runCheck(), 4000);

    // Cada vez que la app vuelve al foreground, rechequeamos (con throttle).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') runCheck();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [bootstrapping]);

  // ── Handler: acepta el update, abre browser para descargar APK ─────
  const handleAcceptUpdate = useCallback(async () => {
    if (!updateInfo?.downloadUrl) return;
    setUpdateDownloading(true);
    try {
      await downloadAndInstall(updateInfo.downloadUrl);
      // No cerramos el modal: el rider vuelve a la app después de instalar
      // y ya está en la nueva versión. Si cancela la instalación, ve el
      // modal de vuelta al reabrir.
      toast.success('Se abrió el descargador. Tocá "Instalar" cuando termine.', {
        duration: 6000,
      });
    } finally {
      setUpdateDownloading(false);
    }
  }, [updateInfo?.downloadUrl]);

  const handleDismissUpdate = useCallback(() => {
    if (!updateInfo || updateInfo.isForced) return;
    dismissUpdate(updateInfo.versionCode);
    setUpdateInfo(null);
  }, [updateInfo]);

  // ── Deshacer una entrega marcada por error ─────────────────────
  // El backend valida la ventana de tiempo; aca solo mostramos el
  // resultado. Si expiro, el rider tiene que pedirle al local que lo
  // corrija (es a proposito: no queremos que se edite la historia
  // horas despues).
  const handleDeshacerEntrega = useCallback(
    async (pedido, motivo) => {
      if (!riderAuth || !pedido?.id) return false;
      try {
        await api.post(
          `/repartidores/${riderAuth.id}/rider/${riderAuth.code}/deshacer-entrega/${pedido.id}`,
          { motivo }
        );
        // Sacarlo del historial de sesion y del set de "ya avisados".
        setHistorialSesion((prev) => prev.filter((p) => p.id !== pedido.id));
        deliveredSeenRef.current.delete(pedido.id);
        setEntregaReciente(null);
        toast.success('Listo, el pedido volvió a "en camino".');
        fetchData({ silent: true });
        return true;
      } catch (error) {
        const msg = error?.error || error?.message || 'No se pudo deshacer';
        toast.error(msg, { duration: 5000 });
        if (error?.expirado) setEntregaReciente(null);
        return false;
      }
    },
    [riderAuth, fetchData]
  );

  // ── Modal reutilizable: se muestra tanto en login como en app principal ─
  const renderUpdateModal = () => (
    <AnimatePresence>
      {updateInfo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={updateInfo.isForced ? undefined : handleDismissUpdate}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden"
          >
            {/* Header con gradient rojo Modo Sabor */}
            <div
              className="px-6 py-5 text-white"
              style={{ background: 'linear-gradient(135deg,#dc1f2d,#b91c1c)' }}
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Zap size={24} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold opacity-90">
                    {updateInfo.isForced ? 'Actualización obligatoria' : 'Nueva versión'}
                  </p>
                  <h2 className="text-xl font-semibold leading-tight">
                    Modo Sabor Rider {updateInfo.versionName}
                  </h2>
                </div>
              </div>
              {updateInfo.installedVersionName && (
                <p className="mt-3 text-[13px] font-semibold text-white/80">
                  Tenés instalada la <b>v{updateInfo.installedVersionName}</b>
                  {typeof updateInfo.sizeMB === 'number' && <> · Descarga {updateInfo.sizeMB} MB</>}
                </p>
              )}
            </div>

            {/* Body: changelog */}
            <div className="px-6 py-5 max-h-[40vh] overflow-y-auto">
              {updateInfo.changelog ? (
                <>
                  <p className="text-[13px] font-semibold text-gray-500 mb-2">Qué hay de nuevo</p>
                  <div className="text-sm font-semibold text-gray-800 whitespace-pre-line leading-relaxed">
                    {updateInfo.changelog}
                  </div>
                </>
              ) : (
                <p className="text-sm font-semibold text-gray-600">
                  Actualizá la app para acceder a las últimas mejoras.
                </p>
              )}
              {updateInfo.isForced && (
                <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                  <p className="text-xs font-semibold text-red-700">
                    Esta actualización es obligatoria
                  </p>
                  <p className="mt-1 text-xs font-semibold text-red-600">
                    Necesitás instalarla para seguir usando la app.
                  </p>
                </div>
              )}
            </div>

            {/* Footer: acciones */}
            <div className="px-6 pb-6 space-y-2">
              <button
                type="button"
                onClick={handleAcceptUpdate}
                disabled={updateDownloading}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#dc1f2d] to-[#b91c1c] text-sm font-semibold text-white shadow-lg shadow-red-200 transition-all active:scale-[0.98] hover:brightness-110 disabled:opacity-60"
              >
                {updateDownloading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Descargando...
                  </>
                ) : (
                  <>
                    <Zap size={16} strokeWidth={3} />
                    Actualizar ahora
                  </>
                )}
              </button>
              {!updateInfo.isForced && (
                <button
                  type="button"
                  onClick={handleDismissUpdate}
                  className="h-11 w-full rounded-2xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
                >
                  Más tarde
                </button>
              )}
              <p className="mt-2 text-center text-[13px] font-bold text-gray-400 leading-relaxed">
                Se abrirá el descargador de Android. Tocá "Instalar" cuando termine.
                <br />
                La primera vez podés necesitar permitir "instalar apps de esta fuente".
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

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
          fontWeight: 600,
        },
      });
      fireRiderConfetti(36);
      speakRider(`Entrega ${current} confirmada. ¡Buen trabajo!`, { rate: 1.1 });
      // Refrescar ganancias/racha: es el momento en que realmente cambian.
      fetchStats();
    }
  }, [resumenDia.entregados, fetchStats]);

  // ─────────────────────────────────────────────────────────────────
  // RENDER: spinner de bootstrap (mientras carga Preferences en Android)
  // ─────────────────────────────────────────────────────────────────
  if (bootstrapping || showRiderSplash) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#d51f2b] text-white flex flex-col items-center justify-center p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.18),transparent_26%),radial-gradient(circle_at_50%_58%,rgba(127,29,29,0.45),transparent_42%)]" />
        <motion.div
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: [0.92, 1.04, 1] }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex flex-col items-center"
        >
          <motion.div
            animate={{
              scale: [1, 1.06, 1],
              filter: [
                'drop-shadow(0 0 18px rgba(255,255,255,0.15))',
                'drop-shadow(0 0 34px rgba(255,255,255,0.34))',
                'drop-shadow(0 0 18px rgba(255,255,255,0.15))',
              ],
            }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            className="h-36 w-36 overflow-hidden rounded-[34px] bg-black/25 shadow-2xl shadow-black/25 ring-1 ring-white/20"
          >
            <img src={RIDER_FLAME_ASSET} alt="Modo Sabor" className="h-full w-full object-cover" />
          </motion.div>
          <p className="mt-8 text-[13px] font-semibold text-white/70">Modo Sabor</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Riders</h1>
          <p className="mt-3 text-sm font-bold text-white/70">Preparando tu turno...</p>
        </motion.div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RENDER: pantalla de login
  // ─────────────────────────────────────────────────────────────────
  if (!riderAuth && savedRiderAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#dc1f2d] px-6 text-white">
        <div className="w-full max-w-sm rounded-[30px] border border-white/20 bg-white/10 p-7 text-center shadow-2xl backdrop-blur">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15">
            <LockKeyhole size={31} />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Hola, repartidor</h1>
          <p className="mt-2 text-sm text-white/80">
            Tu sesión está guardada. Desbloqueá con la huella o PIN de este teléfono.
          </p>
          <button
            type="button"
            onClick={handleBiometricUnlock}
            disabled={unlockingRider}
            className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-bold text-[#bd1a27] shadow-lg transition active:scale-[0.98] disabled:opacity-60"
          >
            <ShieldCheck size={19} />
            {unlockingRider ? 'Validando...' : 'Entrar con huella o PIN'}
          </button>
          <button
            type="button"
            onClick={() => {
              setLoginForm({ id: savedRiderAuth.id, code: '' });
              setSavedRiderAuth(null);
            }}
            className="mt-4 text-sm font-semibold text-white/85 underline underline-offset-4"
          >
            Usar código del rider
          </button>
        </div>
      </div>
    );
  }

  if (!riderAuth) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#dc1f2d] text-white font-sans">
        {/* Fondo con shapes organicos: 3 blobs blur para dar profundidad
            + gradient sutil arriba. Sin dependencias, todo CSS puro. */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute -top-32 -left-16 h-80 w-80 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle,#fca5a5,transparent 70%)' }}
          />
          <div
            className="absolute -bottom-40 -right-20 h-96 w-96 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle,#7f1d1d,transparent 70%)' }}
          />
          <div
            className="absolute top-1/2 left-1/3 h-64 w-64 -translate-y-1/2 rounded-full opacity-20 blur-3xl"
            style={{ background: 'radial-gradient(circle,#fef3c7,transparent 70%)' }}
          />
        </div>

        {/* Container principal - centrado, scrollable si no entra */}
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md"
          >
            {/* Logo Modo Sabor grande (llamita SVG inline, siempre disponible
                sin depender del backend). Con animacion float sutil. */}
            <div className="flex flex-col items-center">
              <motion.div
                animate={{ y: [0, -8, 0], scale: [1, 1.03, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="relative"
              >
                <div className="absolute inset-0 rounded-[34px] bg-white/25 blur-2xl scale-125" />
                <div className="relative h-28 w-28 overflow-hidden rounded-[32px] bg-black/20 shadow-2xl shadow-black/25 ring-1 ring-white/20">
                  <img
                    src={RIDER_FLAME_ASSET}
                    alt="Modo Sabor Riders"
                    className="h-full w-full object-cover"
                    draggable="false"
                  />
                </div>
              </motion.div>

              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] text-white/80 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_#86efac]" />
                APP PARA RIDERS
              </div>
              <p
                className="mt-4 text-[13px] font-semibold text-white/70"
                style={{ fontFamily: '"Poppins","Inter",sans-serif' }}
              >
                Modo Sabor
              </p>
              <h1
                className="mt-1 text-4xl font-semibold leading-none tracking-tight text-white"
                style={{ fontFamily: '"Poppins","Inter",sans-serif' }}
              >
                Riders
              </h1>
              <p className="mt-3 text-center text-sm font-semibold text-white/80 max-w-xs">
                Tu ruta, pedidos y ganancias. Todo listo para empezar el turno.
              </p>
              <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2 text-center text-[10px] font-bold text-white/85">
                <span className="rounded-2xl border border-white/15 bg-black/10 px-2 py-2.5">
                  <Wifi size={15} className="mx-auto mb-1" />
                  Pedidos al instante
                </span>
                <span className="rounded-2xl border border-white/15 bg-black/10 px-2 py-2.5">
                  <Navigation2 size={15} className="mx-auto mb-1" />
                  Ruta en vivo
                </span>
                <span className="rounded-2xl border border-white/15 bg-black/10 px-2 py-2.5">
                  <ShieldCheck size={15} className="mx-auto mb-1" />
                  Datos protegidos
                </span>
              </div>
            </div>

            {/* Card blanca con inputs */}
            <motion.form
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              onSubmit={handleLogin}
              className="mt-8 rounded-[30px] border border-white/70 bg-white p-6 shadow-2xl shadow-black/25"
            >
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-base font-black tracking-tight text-slate-900">
                    Abrí tu turno
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-slate-400">
                    Usá las credenciales del local
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-50 text-[#dc1f2d]">
                  <LockKeyhole size={18} />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-gray-500">
                    <User size={12} />
                    ID de repartidor
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={loginForm.id}
                    onChange={(e) => setLoginForm({ ...loginForm, id: e.target.value })}
                    className="h-14 w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-5 text-xl font-semibold text-gray-900 tabular-nums outline-none transition focus:border-[#dc1f2d] focus:bg-white"
                    placeholder="Ej: 1"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-gray-500">
                    <LocateFixed size={12} />
                    Código de acceso
                  </label>
                  <div className="relative">
                    <input
                      type={showAccessCode ? 'text' : 'password'}
                      value={loginForm.code}
                      onChange={(e) => setLoginForm({ ...loginForm, code: e.target.value })}
                      className="h-14 w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-5 pr-14 text-xl font-semibold text-gray-900 tracking-widest outline-none transition focus:border-[#dc1f2d] focus:bg-white"
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccessCode((value) => !value)}
                      className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-gray-400 transition hover:bg-white hover:text-[#dc1f2d] active:scale-95"
                      aria-label={showAccessCode ? 'Ocultar código' : 'Mostrar código'}
                    >
                      {showAccessCode ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#dc1f2d] to-[#b91c1c] text-sm font-semibold text-white shadow-lg shadow-red-200 transition-all active:scale-[0.98] hover:brightness-110"
              >
                Abrir mi turno
                <Zap size={16} strokeWidth={3} />
              </button>

              <p className="mt-4 text-center text-[12px] font-semibold leading-relaxed text-gray-400">
                Tus datos quedan protegidos en este celular.
                <br />
                ¿No tenés tu código? Pedíselo al encargado.
              </p>
            </motion.form>

            {(installReady || iosInstall) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35, duration: 0.4 }}
                className="mt-5 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md text-left"
              >
                <p className="text-[13px] font-semibold text-white/90">Instalar como app</p>
                <p className="mt-1 text-xs font-medium text-white/80 leading-relaxed">
                  {installReady
                    ? 'Instalá la app en el celular para tenerla siempre a mano.'
                    : 'En iPhone: tocá Compartir → "Agregar a pantalla de inicio".'}
                </p>
                {installReady && (
                  <button
                    type="button"
                    onClick={installRiderApp}
                    className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-[#dc1f2d] shadow-md"
                  >
                    <Smartphone size={14} /> Instalar
                  </button>
                )}
              </motion.div>
            )}

            <p className="mt-8 text-center text-[13px] font-semibold text-white/60">
              Hecho con <span className="text-red-300">❤</span> en Monteros
            </p>
          </motion.div>
        </div>
        {renderUpdateModal()}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // RENDER: app principal
  // ─────────────────────────────────────────────────────────────────
  /*
    Los fallbacks eran #5D87FF y #49BEFF, los azules de la plantilla original.
    Si `rider_app_color_primario` no está configurado —que es el caso por
    defecto— la app del rider arrancaba en azul, sin nada que ver con la marca.
    Ahora cae al rojo Modo Sabor y al bordó del degradé.
  */
  const primaryColor = data?.settings?.rider_app_color_primario || BRAND;
  const secondaryColor = data?.settings?.rider_app_color_secundario || '#B91C1C';
  const appName = data?.settings?.rider_app_nombre || RIDER_HEADER_NAME;
  const telefonoLocal = data?.settings?.negocio_telefono || '';
  const showRiderLogo = String(data?.settings?.rider_app_mostrar_logo ?? '1') === '1';
  const riderLogoUrl = resolveAssetUrl(
    data?.settings?.rider_app_logo || data?.settings?.negocio_logo || DEFAULT_BRAND_LOGO
  );
  const inTransitOrder = data?.pedidos?.find((p) => p.estado === 'en_camino');

  return (
    <div
      className={`rider-shell min-h-screen bg-gray-50 flex flex-col font-sans overflow-x-hidden ${
        preferencias.letraGrande ? 'rider-letra-grande' : ''
      }`}
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
              className="h-12 w-12 object-contain drop-shadow-sm"
              onError={(e) => {
                if (!String(e.currentTarget.src || '').includes('rider-flame-red')) {
                  e.currentTarget.src = RIDER_FLAME_ASSET;
                  e.currentTarget.className =
                    'h-12 w-12 overflow-hidden rounded-2xl object-cover shadow-md shadow-red-100';
                  return;
                }
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <img
              src={RIDER_FLAME_ASSET}
              alt={appName}
              className="h-12 w-12 overflow-hidden rounded-2xl object-cover shadow-md shadow-red-100"
              draggable="false"
            />
          )}
          {/* Saludo dinamico segun la hora: sirve de contexto de turno
              y hace que la app se sienta menos generica. */}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-gray-900 leading-none">
              {saludoPorHora().saludo},{' '}
              {String(data?.repartidor?.nombre || 'Repartidor').split(' ')[0]}
            </h2>
            <p className="text-[13px] font-bold text-gray-400 mt-1">{saludoPorHora().turno}</p>
          </div>
        </div>

        {/* ── NEW: controles del header ── */}
        <div className="flex items-center gap-2">
          {/* Chip compacto de estado. El control principal para cambiar
              disponibilidad es el boton grande del cuerpo (ToggleTurno);
              este chip queda como indicador rapido + atajo. */}
          <button
            onClick={() => toggleOnline()}
            aria-label={isOnline ? 'Pasar a no disponible' : 'Pasar a disponible'}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-xl text-[13px] font-semibold transition-all ${
              isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {isOnline ? <Zap size={13} strokeWidth={3} /> : <ZapOff size={13} strokeWidth={3} />}
            {isOnline ? 'Online' : 'Offline'}
          </button>

          {/* Llamar al local */}
          {telefonoLocal && (
            <a
              href={`tel:${telefonoLocal}`}
              className="h-9 w-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600"
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

      {/* ── Main ──────────────────────────────────────────────────
          Envuelto en pull-to-refresh: gesto natural para actualizar sin
          tener que buscar el boton de refresh. Se desactiva cuando hay
          un pedido abierto para no interferir con el scroll del detalle. */}
      <PullToRefresh onRefresh={() => fetchData()} disabled={Boolean(selectedPedido)}>
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col space-y-5 p-4 md:p-6">
          {/* Carga inicial: skeletons con la silueta real de lo que viene,
            en vez de un spinner generico. La espera se percibe mas corta
            y el layout no salta cuando llegan los datos. */}
          {loading && !data && <RiderSkeleton cards={3} />}

          {!selectedPedido ? (
            <>
              {/* ── Hero: a donde vas AHORA ──
                Con varias entregas asignadas, la lista plana hace que
                todas compitan por atencion. Esta card responde la unica
                pregunta que importa mientras manejas. */}
              {sortedPedidos.length > 0 && (
                <HeroPedido
                  pedido={
                    // Si hay uno en camino, ese manda. Si no, el primero
                    // de la ruta sugerida.
                    sortedPedidos.find((p) => p.estado === 'en_camino') || sortedPedidos[0]
                  }
                  riderLat={riderLocation.lat}
                  riderLng={riderLocation.lng}
                  onAbrir={setSelectedPedido}
                  // "Ver ruta en el mapa" entra directo al modo fullscreen
                  // con el mapa y la ruta trazada, sin pasar por el detalle.
                  onNavegar={(p) => setModoRutaPedidoId(p.id)}
                />
              )}

              {/* ── Ganancias del dia + racha ── */}
              <WidgetGanancias stats={riderStats} loading={loading && !riderStats} />

              {/* ── Resumen del turno (siempre visible) ──
                Tarjeta hero con brillo animado + 3 stats con iconos y
                tipografia armonica. Antes solo aparecia cuando ya habia
                entregas y los numeros tenian tamaños distintos (2xl vs lg)
                lo que se veia desfasado. Ahora todos son text-2xl con
                tabular-nums, y cada stat tiene su chip de icono. */}
              <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-600 via-brand-600 to-brand-500 p-5 shadow-xl shadow-brand-200">
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-8 -left-6 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[13px] font-semibold text-brand-200">Tu turno de hoy</p>
                      <p className="text-lg font-semibold text-white leading-tight mt-0.5">
                        {nowTime} · {format(new Date(), "EEE dd 'de' MMM", { locale: es })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 backdrop-blur-sm">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[13px] font-semibold text-white">Online</span>
                    </div>
                  </div>
                  {(() => {
                    // Meta diaria: usa lo que el negocio configure, sino 10.
                    const meta = Math.max(1, Number(data?.settings?.rider_meta_diaria || 10));
                    const pctMeta = Math.min(100, (resumenDia.entregados / meta) * 100);
                    return (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-semibold text-brand-200">
                            Meta diaria
                          </span>
                          <span className="text-[13px] font-semibold tabular-nums text-white">
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
                        <Package size={14} className="text-brand-200" />
                      </div>
                      <AnimatedNumber
                        value={resumenDia.entregados}
                        className="text-2xl font-semibold text-white tabular-nums leading-none block"
                      />
                      <p className="text-[12px] font-semibold text-brand-200 mt-1.5">Entregas</p>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.12 }}
                      className="rounded-2xl bg-white/15 backdrop-blur-sm px-3 py-3 text-center"
                    >
                      <div className="flex items-center justify-center h-6 mb-1.5">
                        <DollarSign size={14} className="text-brand-200" />
                      </div>
                      <AnimatedNumber
                        value={resumenDia.efectivo}
                        format={(n) => fmt(n)}
                        className="text-lg font-semibold text-white tabular-nums leading-none block"
                      />
                      <p className="text-[12px] font-semibold text-brand-200 mt-1.5">Efectivo</p>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="rounded-2xl bg-white/15 backdrop-blur-sm px-3 py-3 text-center"
                    >
                      <div className="flex items-center justify-center h-6 mb-1.5">
                        <TrendingUp size={14} className="text-brand-200" />
                      </div>
                      <AnimatedNumber
                        value={resumenDia.total}
                        format={(n) => fmt(n)}
                        className="text-lg font-semibold text-white tabular-nums leading-none block"
                      />
                      <p className="text-[12px] font-semibold text-brand-200 mt-1.5">Total</p>
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
                    <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                      <PhoneCall size={16} />
                    </div>
                    <span className="text-[13px] font-semibold text-gray-600">Llamar local</span>
                  </a>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  onClick={() => fetchData()}
                  className="flex flex-col items-center gap-1.5 rounded-2xl bg-white border border-gray-100 p-3 shadow-sm hover:shadow-md active:scale-95 transition-all"
                >
                  <div className="h-9 w-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  </div>
                  <span className="text-[13px] font-semibold text-gray-600">Actualizar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('historial')}
                  className="flex flex-col items-center gap-1.5 rounded-2xl bg-white border border-gray-100 p-3 shadow-sm hover:shadow-md active:scale-95 transition-all"
                >
                  <div className="h-9 w-9 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
                    <History size={16} />
                  </div>
                  <span className="text-[13px] font-semibold text-gray-600">Historial</span>
                </button>
              </motion.div>

              {/* ── Multi-delivery route optimization ── */}
              {hasMultipleDeliveries && (
                <div className="rounded-[24px] bg-violet-50 border border-violet-200 px-5 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Route size={16} className="text-violet-600" />
                    <p className="text-[13px] font-semibold text-violet-600">
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
                            className={`h-8 w-8 rounded-full ${stopColors[idx % stopColors.length]} flex items-center justify-center text-white text-xs font-semibold shrink-0`}
                          >
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {pedido.cliente_nombre}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {pedido.cliente_direccion}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            {/* Distancia desde la parada anterior (no desde el
                              local), que es lo que realmente le importa al
                              rider para saber cuanto le falta al siguiente. */}
                            {Number.isFinite(pedido._distanciaDesdeAnterior) && (
                              <p className="text-xs font-semibold text-violet-600">
                                {fmtDistancia(pedido._distanciaDesdeAnterior)}
                              </p>
                            )}
                            <p className="text-[13px] font-bold text-gray-400">
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
                      className="mt-3 w-full h-11 rounded-2xl bg-violet-600 text-white flex items-center justify-center gap-2 text-xs font-semibold shadow-lg shadow-violet-200"
                    >
                      <Navigation size={14} /> Navegar a Parada 1
                    </button>
                  )}
                </div>
              )}

              {/* ── Timer en reparto activo ── */}
              {inTransitOrder && (
                <div className="rounded-[24px] bg-emerald-50 border border-emerald-200 px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                      <Truck size={18} color="white" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-emerald-600">En reparto</p>
                      <p className="text-sm font-semibold text-emerald-800">
                        #{inTransitOrder.numero} · {inTransitOrder.cliente_nombre || 'S/N'}
                      </p>
                      {inTransitOrder.hora_entrega ? (
                        <p className="mt-1 text-[13px] font-semibold text-emerald-600">
                          Entrega {inTransitOrder.hora_entrega}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-emerald-700 tabular-nums">
                      {fmtTimer(deliveryElapsed)}
                    </p>
                    <p className="text-[12px] text-emerald-600 font-medium">Tiempo en ruta</p>
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
                    className={`h-2.5 w-2.5 rounded-full ${trackingActive ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`}
                  />
                  <span className="text-[12px] font-medium text-gray-400">
                    {trackingActive ? 'GPS activo' : 'Sin reparto activo'}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                      locationPermission === 'granted'
                        ? 'bg-emerald-50 text-emerald-600'
                        : locationPermission === 'denied'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-amber-50 text-amber-600'
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
                      className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                        lastGpsAgeSeconds <= 90
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {lastGpsAgeSeconds <= 90
                        ? 'GPS reciente'
                        : `GPS atrasado ${lastGpsAgeSeconds}s`}
                    </span>
                  )}
                </div>
                {lastPositionAt && (
                  <p className="mt-3 text-[13px] font-bold text-gray-400">
                    Último GPS: {format(parseDate(lastPositionAt), 'HH:mm', { locale: es })}
                  </p>
                )}
                {locationError && (
                  <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {locationError}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {locationPermission !== 'granted' && (
                    <button
                      type="button"
                      onClick={requestLocationAccess}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl bg-brand-600 px-5 text-xs font-semibold text-white shadow-lg shadow-brand-100"
                    >
                      <LocateFixed size={15} /> Activar GPS
                    </button>
                  )}
                  {data?.pedidos?.length > 0 &&
                    !(trackingActive && locationPermission === 'granted') && (
                      <button
                        type="button"
                        onClick={requestLocationAccess}
                        className="inline-flex h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-xs font-semibold text-gray-700 shadow-sm"
                      >
                        <RefreshCw size={14} /> Revalidar GPS
                      </button>
                    )}
                  {!isStandaloneApp && (installReady || iosInstall) && (
                    <button
                      type="button"
                      onClick={installRiderApp}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 px-4 text-xs font-semibold text-brand-700"
                    >
                      <Smartphone size={14} /> Instalar app
                    </button>
                  )}
                </div>
                {!isStandaloneApp && (
                  <p className="mt-4 text-[13px] font-semibold leading-relaxed text-gray-500">
                    Instalá esta pantalla en el celular del rider para abrirla como app.{' '}
                    {iosInstall
                      ? 'En iPhone: Compartir -> Agregar a pantalla de inicio.'
                      : 'En Android o Chrome: usá el botón Instalar app cuando aparezca.'}
                  </p>
                )}
              </div>

              {/* Los tabs ahora viven en la BottomTabBar (mas ergonomico:
                el pulgar llega comodo abajo, no arriba de una pantalla
                de 6"). Aca solo queda el contenido de cada uno. */}

              {/* ── Tab: Pedidos activos ── */}
              {activeTab === 'pedidos' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-[13px] font-semibold text-gray-500">
                      Asignados ({data?.pedidos?.length || 0})
                    </h3>
                    <button onClick={fetchData} className="text-brand-600">
                      <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                  </div>

                  {!data?.pedidos?.length ? (
                    isOnline ? (
                      <div className="rounded-[32px] bg-gradient-to-br from-brand-50 via-white to-brand-50 border border-brand-100 py-12 text-center flex flex-col items-center relative overflow-hidden">
                        {/* Ondas de radar animadas: 3 círculos concéntricos que
                          se expanden con desfase, dan sensación de "escaneando"
                          el mapa a la espera de pedidos. */}
                        <div className="relative h-28 w-28 mb-5">
                          <div className="absolute inset-0 rounded-full bg-brand-500/20 animate-ping" />
                          <div
                            className="absolute inset-3 rounded-full bg-brand-500/25 animate-ping"
                            style={{ animationDelay: '0.4s' }}
                          />
                          <div
                            className="absolute inset-6 rounded-full bg-brand-500/30 animate-ping"
                            style={{ animationDelay: '0.8s' }}
                          />
                          <div className="absolute inset-8 rounded-full bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-200">
                            <Package size={26} className="text-white" strokeWidth={2.2} />
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-brand-600">Esperando pedidos</p>
                        <p className="mt-2 text-xs font-semibold text-gray-500 max-w-xs px-4">
                          Cuando entre uno nuevo te va a sonar y vibrar acá. Dejá la app abierta
                          aunque bloquees el celular.
                        </p>
                        <div className="mt-4 flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 shadow-sm border border-gray-100">
                          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[13px] font-semibold text-gray-500">
                            Modo activo
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* Offline y sin pedidos: el boton grande de turno es lo
                       unico que importa en pantalla. Patron Uber Driver. */
                      <div className="rounded-[32px] border border-gray-100 bg-white py-10 shadow-sm">
                        <ToggleTurno online={isOnline} onToggle={(next) => toggleOnline(next)} />
                        <p className="mx-auto mt-2 max-w-xs px-6 text-center text-xs font-semibold leading-relaxed text-gray-400">
                          Mientras estés no disponible no te vamos a asignar pedidos nuevos.
                        </p>
                      </div>
                    )
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
                        // Urgencia por antiguedad del pedido: la barra lateral
                        // de color deja ver de un vistazo cual esta demorado
                        // sin tener que leer horarios.
                        const urgencia = nivelUrgencia(pedido.creado_en);
                        return (
                          <motion.button
                            key={pedido.id}
                            layout
                            initial={{ opacity: 0, y: 40, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 260 }}
                            onClick={() => {
                              haptic('tap');
                              setSelectedPedido(pedido);
                            }}
                            style={{ borderLeft: `5px solid ${urgencia.color}` }}
                            className="w-full text-left rounded-[28px] bg-white border border-gray-100 p-5 shadow-sm hover:shadow-lg transition-shadow flex items-center justify-between group"
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={`h-12 w-12 rounded-[18px] flex items-center justify-center transition-colors ${
                                  pedido.estado === 'en_camino'
                                    ? 'bg-emerald-50'
                                    : 'bg-gray-50 group-hover:bg-brand-50'
                                }`}
                              >
                                {hasMultipleDeliveries && stopNumber ? (
                                  <span
                                    className={`h-7 w-7 rounded-full ${stopColors[(stopNumber - 1) % stopColors.length]} flex items-center justify-center text-white text-[13px] font-semibold`}
                                  >
                                    {stopNumber}
                                  </span>
                                ) : (
                                  <ShoppingBag
                                    size={22}
                                    className={
                                      pedido.estado === 'en_camino'
                                        ? 'text-emerald-600'
                                        : 'text-gray-400 group-hover:text-brand-600'
                                    }
                                  />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  #{pedido.numero} · {pedido.cliente_nombre}
                                </p>
                                <p className="text-xs font-bold text-gray-400 truncate max-w-[200px]">
                                  {pedido.cliente_direccion}
                                </p>
                                {urgencia.minutos !== null && urgencia.nivel !== 'ok' ? (
                                  <span
                                    className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                                      urgencia.nivel === 'urgente'
                                        ? 'bg-rose-50 text-rose-700'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    <Clock size={10} strokeWidth={3} />
                                    {urgencia.minutos} min esperando
                                  </span>
                                ) : null}
                                {pedido.hora_entrega ? (
                                  <p className="text-[13px] font-semibold text-violet-600 mt-0.5">
                                    Entrega {pedido.hora_entrega}
                                  </p>
                                ) : null}
                                {hasMultipleDeliveries && pedido.distance !== undefined && (
                                  <p className="text-[13px] font-semibold text-violet-500 mt-0.5">
                                    {Math.round(pedido.distance)}m de distancia
                                  </p>
                                )}
                                <p className="text-xs font-semibold text-gray-700 mt-0.5">
                                  {fmt(pedido.total)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <span
                                className={`text-[13px] font-medium px-2 py-1 rounded-lg ${
                                  pedido.estado === 'en_camino'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-brand-50 text-brand-600'
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
                      <p className="text-sm font-bold">Aún no entregaste nada</p>
                    </div>
                  ) : (
                    historialSesion.map((p, i) => (
                      <div
                        key={p.id + '-' + i}
                        className="rounded-[24px] bg-white border border-gray-100 p-4 flex items-center justify-between shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                            <CheckCircle2 size={18} className="text-emerald-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              #{p.numero} · {p.cliente_nombre || 'S/N'}
                            </p>
                            <p className="text-xs text-gray-400">{p.cliente_direccion}</p>
                            {p.hora_entrega ? (
                              <p className="text-[13px] font-semibold text-violet-600 mt-0.5">
                                Entrega {p.hora_entrega}
                              </p>
                            ) : null}
                            <p className="text-[13px] text-emerald-600 font-bold mt-0.5">
                              {p.entregado_en ? format(parseDate(p.entregado_en), 'HH:mm') : ''} ·{' '}
                              {paymentMethodLabel(p.metodo_pago)}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-semibold text-gray-900">{fmt(p.total)}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Tab: Perfil ── */}
              {activeTab === 'perfil' && (
                <PerfilRider
                  preferencias={preferencias}
                  onCambiarPreferencia={cambiarPreferencia}
                  perfil={perfilRider}
                  onGuardarPerfil={guardarPerfilRider}
                  guardandoPerfil={guardandoPerfil}
                  repartidor={data?.repartidor}
                  stats={riderStats}
                  onLogout={handleLogout}
                  onCambiarRider={handleLogoutCompleto}
                />
              )}
            </>
          ) : (
            /* ── Detalle de pedido ──────────────────────────────── */
            <div className="flex flex-1 flex-col animate-in slide-in-from-right duration-300">
              <button
                onClick={() => setSelectedPedido(null)}
                className="mb-3 flex w-fit items-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold text-gray-500 transition hover:bg-white hover:text-gray-900"
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
                        className="rounded-full px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm"
                        style={{ backgroundColor: primaryColor }}
                      >
                        #{selectedPedido.numero}
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedPedido.estado === 'en_camino' && (
                          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 shadow-sm">
                            <Clock size={12} className="text-white" />
                            <span className="text-xs font-semibold tabular-nums text-white">
                              {fmtTimer(deliveryElapsed)}
                            </span>
                          </div>
                        )}
                        <span className="rounded-full bg-white/70 px-2.5 py-1 text-[13px] font-semibold text-gray-500 backdrop-blur-sm">
                          {format(parseDate(selectedPedido.creado_en), 'HH:mm')} HS
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Avatar con inicial del cliente */}
                      <div
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-semibold text-white shadow-md"
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
                        <p className="text-[13px] font-semibold text-gray-400">Cliente</p>
                        <h3 className="mt-0.5 break-words text-xl font-semibold leading-tight text-gray-900 sm:text-2xl">
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
                            <p className="text-[13px] font-semibold text-violet-500">
                              Hora de entrega
                            </p>
                            <p className="text-sm font-semibold text-violet-900 leading-tight">
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
                          <p className="text-[13px] font-semibold text-gray-400">Dirección</p>
                          <p className="break-words text-sm font-semibold leading-snug text-gray-900">
                            {selectedPedido.cliente_direccion}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                        <div className="h-9 w-9 rounded-xl bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                          <Phone size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-emerald-600">Teléfono</p>
                          <p className="text-sm font-semibold text-emerald-900">
                            {selectedPedido.cliente_telefono || 'No disponible'}
                          </p>
                        </div>
                        {selectedPedido.cliente_telefono && (
                          <a
                            href={`tel:${selectedPedido.cliente_telefono}`}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-200 transition-all active:scale-90 hover:bg-emerald-600"
                          >
                            <Phone size={18} fill="currentColor" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timeline de estados: le da al rider contexto de en que
                  punto del flujo esta sin tener que interpretar el estado
                  crudo del pedido. */}
                <div className="border-b border-gray-100 bg-white px-6 py-4 sm:px-7">
                  <PedidoTimeline estado={selectedPedido.estado} />
                </div>

                {/* Mapa interactivo — grande, protagonista de la vista de reparto.
                  Como el usuario no quiere depender de Google Maps para ver por
                  dónde va, el mapa embebido con ruta OSRM real ocupa casi toda la
                  pantalla; el botón de "Abrir en Maps" queda como fallback opcional. */}
                <div className="px-5 py-5 sm:px-6">
                  <div className="overflow-hidden rounded-[22px] border border-gray-200 bg-white shadow-sm">
                    <div className="h-[55vh] min-h-[380px] max-h-[640px] bg-gray-50">
                      {selectedPedido.cliente_direccion ? (
                        <RiderRouteMap
                          riderLat={selectedPedido.repartidor?.latitud}
                          riderLng={selectedPedido.repartidor?.longitud}
                          clientLat={selectedPedido.cliente_latitud}
                          clientLng={selectedPedido.cliente_longitud}
                          clientLocationExact={Boolean(selectedPedido.cliente_ubicacion_exacta)}
                          clientGeocoded={Boolean(selectedPedido.cliente_geocodificado)}
                          geocodingPrecision={selectedPedido.cliente_geocoding_precision}
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
                        <p className="text-[12px] font-medium text-gray-400 mb-2">
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
                                    className={`h-5 w-5 rounded-full ${stopColors[globalIdx % stopColors.length]} flex items-center justify-center text-white text-[12px] font-semibold`}
                                  >
                                    {globalIdx + 1}
                                  </span>
                                  <span className="truncate max-w-[120px]">{p.cliente_nombre}</span>
                                  {p.distance !== undefined && (
                                    <span className="text-[13px] text-violet-500 font-semibold">
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
                        className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[13px] font-semibold text-white shadow-md transition-all active:scale-95"
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
                        className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 text-[13px] font-semibold text-white shadow-md shadow-sky-200 transition-all active:scale-95"
                      >
                        <Route size={18} /> Waze
                      </a>
                      {selectedPedido.cliente_telefono ? (
                        <a
                          href={`https://wa.me/${String(selectedPedido.cliente_telefono).replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-[13px] font-semibold text-white shadow-md shadow-emerald-200 transition-all active:scale-95"
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
                        className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-gray-200 bg-white text-[13px] font-semibold text-gray-700 shadow-sm transition-all active:scale-95"
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
                  const estadoPago = String(
                    selectedPedido.pago_estado || 'pendiente'
                  ).toLowerCase();
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
                          <span className="text-[13px] font-semibold text-gray-400">
                            Resumen del pedido
                          </span>
                          <span
                            className={`rounded-lg px-2.5 py-1 text-[13px] font-semibold ${paymentStatusTone(selectedPedido.pago_estado)}`}
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
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-50 text-brand-600 text-[13px] font-semibold shrink-0">
                                  {it.cantidad}x
                                </span>
                                <p className="min-w-0 break-words font-bold text-gray-700">
                                  {it.nombre}
                                </p>
                              </div>
                              <p className="shrink-0 font-semibold text-gray-900">
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
                            <p className="text-[13px] font-semibold text-white/80">
                              {yaCobrado ? '✓ Ya cobrado' : 'Total a cobrar'}
                            </p>
                            <p className="mt-1 text-[13px] font-bold text-white/70">
                              {paymentMethodLabel(selectedPedido.metodo_pago)}
                            </p>
                          </div>
                          <p className="text-3xl font-semibold text-white tabular-nums leading-none">
                            {fmt(selectedPedido.total)}
                          </p>
                        </div>
                      </div>

                      {/*
                        ── Vuelto ──────────────────────────────────────────────

                        Calcular el vuelto de cabeza, en la puerta, con el
                        cliente esperando y a veces de noche, es donde más se
                        equivoca cualquiera. Y el error siempre aparece después,
                        al cerrar el turno, cuando ya no se sabe de qué pedido
                        salió la diferencia.

                        Sólo aparece si el pago es en efectivo y todavía no se
                        cobró: en transferencia no hay vuelto que dar.
                      */}
                      {metodoPago.includes('efectivo') && !yaCobrado ? (
                        <div className="mx-5 mb-5 rounded-[22px] bg-gray-50 p-5 sm:mx-6">
                          <label
                            htmlFor="paga-con"
                            className="mb-2 block text-[13px] font-semibold text-gray-500"
                          >
                            ¿Con cuánto te paga?
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              id="paga-con"
                              type="number"
                              inputMode="numeric"
                              value={pagaCon}
                              onChange={(e) => setPagaCon(e.target.value)}
                              placeholder="0"
                              className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-4 text-[22px] font-bold tabular-nums text-gray-900 outline-none transition focus:border-[#dc1f2d]"
                            />
                            {pagaCon ? (
                              <button
                                type="button"
                                onClick={() => setPagaCon('')}
                                className="h-14 shrink-0 rounded-2xl px-4 text-[14px] font-medium text-gray-500"
                              >
                                Borrar
                              </button>
                            ) : null}
                          </div>

                          {/* Montos habituales, para no tipear. */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {[2000, 5000, 10000, 20000].map((monto) => (
                              <button
                                key={monto}
                                type="button"
                                onClick={() => setPagaCon(String(monto))}
                                className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-[14px] font-medium text-gray-700"
                              >
                                {fmt(monto)}
                              </button>
                            ))}
                          </div>

                          {(() => {
                            const entregado = Number(pagaCon);
                            if (!pagaCon || !Number.isFinite(entregado)) return null;
                            const vuelto = entregado - Number(selectedPedido.total || 0);

                            // Si no alcanza, decirlo claro en vez de mostrar un
                            // vuelto negativo que se lee mal de un vistazo.
                            if (vuelto < 0) {
                              return (
                                <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-[15px] font-medium text-amber-800">
                                  Falta {fmt(Math.abs(vuelto))}
                                </p>
                              );
                            }
                            return (
                              <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3">
                                <p className="text-[13px] font-medium text-emerald-800">
                                  Tenés que dar de vuelto
                                </p>
                                <p className="mt-0.5 text-[30px] font-bold leading-none tabular-nums text-emerald-900">
                                  {fmt(vuelto)}
                                </p>
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                    </>
                  );
                })()}

                {/*
                  ── Corregir el medio de pago ───────────────────────────────

                  Antes esto sólo aparecía con el cobro pendiente, así que
                  desaparecía apenas el rider marcaba entregado. En la calle el
                  orden real es al revés: el cliente avisa que paga por
                  transferencia cuando ya tiene la bolsa en la mano, y para
                  entonces el botón ya no estaba. El pedido quedaba como
                  efectivo y la caja cerraba con un faltante inventado.

                  Ahora sigue disponible unos minutos después de entregar —la
                  misma ventana que para deshacer una entrega—. El servidor
                  vuelve a validar el plazo, así que esto es sólo la puerta.
                */}
                {(paymentStatusLabel(selectedPedido.pago_estado) === 'Pendiente' ||
                  puedeCorregirPago(selectedPedido)) && (
                  <div className="mx-5 mb-5 rounded-[22px] bg-gray-50 p-5 sm:mx-6">
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <CreditCard size={15} className="text-gray-500" />
                        <p className="text-[13px] font-semibold text-gray-500">
                          {selectedPedido.estado === 'entregado'
                            ? 'Corregir cómo pagó'
                            : 'Medio que usará el cliente'}
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
                                className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                                  selectedPedido.metodo_pago === method
                                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                                    : 'border-gray-200 bg-white text-gray-700'
                                } disabled:opacity-60`}
                              >
                                {paymentMethodLabel(method)}
                              </button>
                            ));
                        })()}
                      </div>
                      <p className="mt-3 text-[13px] font-semibold leading-relaxed text-gray-500">
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
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 transition-all active:scale-95"
                    >
                      <PhoneCall size={14} /> Escribir al local por WhatsApp
                    </a>
                  ) : null}
                  {/* Comenzar reparto → entra al modo en ruta fullscreen */}
                  {['confirmado', 'listo', 'preparando'].includes(selectedPedido.estado) && (
                    <button
                      onClick={async () => {
                        await updateEstado(selectedPedido.id, 'en_camino');
                        setModoRutaPedidoId(selectedPedido.id);
                      }}
                      className="rider-primary-button flex h-14 w-full items-center justify-center gap-3 rounded-2xl text-sm font-semibold text-white shadow-lg transition-all active:scale-[0.98]"
                    >
                      <Truck size={22} /> Comenzar reparto
                    </button>
                  )}

                  {/* Si ya esta en camino, poder volver al modo ruta */}
                  {selectedPedido.estado === 'en_camino' && (
                    <button
                      onClick={() => setModoRutaPedidoId(selectedPedido.id)}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-gray-900 bg-gray-900 text-xs font-semibold text-white transition active:scale-[0.98]"
                    >
                      <Navigation size={15} /> Modo ruta
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
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 text-[13px] font-semibold text-amber-700 active:scale-95 transition-transform"
                    >
                      <AlertCircle size={15} /> Reportar problema
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('¿Cancelar este pedido? No se puede deshacer.')) {
                          updateEstado(selectedPedido.id, 'cancelado');
                        }
                      }}
                      className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 text-[13px] font-semibold text-rose-700 active:scale-95 transition-transform"
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
                        className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                      >
                        <p className="mb-3 text-[13px] font-semibold text-amber-700">
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
                              className="rounded-xl bg-white border border-amber-100 px-3 py-3 text-[13px] font-semibold text-gray-700 active:scale-95 transition-transform hover:border-amber-300"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setIncidenciaOpen(false)}
                          className="mt-3 w-full h-10 rounded-xl bg-white border border-gray-200 text-[13px] font-semibold text-gray-500"
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
      </PullToRefresh>

      {/* ── Navegación inferior ──────────────────────────────────
          Solo en la vista de lista: cuando hay un pedido abierto el
          foco tiene que estar en ese pedido, no en navegar. */}
      {!selectedPedido && (
        <BottomTabBar
          activo={activeTab}
          onChange={setActiveTab}
          badgeHistorial={historialSesion.length}
        />
      )}

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="px-6 py-3 bg-white border-t border-gray-100 flex items-center justify-between text-[13px] font-semibold">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              !isConnected
                ? 'bg-rose-500 animate-pulse'
                : isOnline
                  ? 'bg-emerald-500 animate-pulse'
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
        <div className="flex items-center gap-3">
          {/* Entrega del celular a otro rider. Deliberadamente discreto
              y separado del logout normal: esta accion NO es barata de
              revertir (borra historial, record y cola pendiente). */}
          <button
            type="button"
            onClick={handleLogoutCompleto}
            className="text-[12px] font-semibold text-gray-300 underline decoration-dotted underline-offset-2 hover:text-rose-500"
            title="Borra todos los datos del rider en este celular"
          >
            Cambiar de rider
          </button>
          <p className="text-gray-400">{appName}</p>
        </div>
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

      {/* ── Auto-update modal ────────────────────────────────────── */}
      {renderUpdateModal()}

      {/* ── Notificacion in-app de pedido nuevo ──────────────────── */}
      <NotificacionInApp
        pedido={notifPedido}
        onVer={(p) => {
          setNotifPedido(null);
          setSelectedPedido(p);
        }}
        onCerrar={() => setNotifPedido(null)}
      />

      {/* ── Modo en ruta: fullscreen mientras maneja ─────────────── */}
      <ModoEnRuta
        abierto={Boolean(modoRutaPedidoId)}
        pedido={
          (data?.pedidos || []).find((p) => p.id === modoRutaPedidoId) ||
          (selectedPedido?.id === modoRutaPedidoId ? selectedPedido : null)
        }
        riderLat={riderLocation.lat}
        riderLng={riderLocation.lng}
        mapConfig={mapConfig}
        onCerrar={() => setModoRutaPedidoId(null)}
        onEntregar={(p) => {
          setModoRutaPedidoId(null);
          setSelectedPedido(p);
          handleSwipeComplete(p);
        }}
        onNavegarExterno={openNav}
        onIncidencia={(p) => {
          setModoRutaPedidoId(null);
          setSelectedPedido(p);
          setIncidenciaOpen(true);
        }}
      />

      {/* ── Deshacer entrega marcada por error ───────────────────── */}
      <DeshacerEntrega
        pedido={entregaReciente}
        ventanaMin={Number(data?.settings?.delivery_ventana_deshacer_min) || 5}
        onDeshacer={handleDeshacerEntrega}
        onExpirar={() => setEntregaReciente(null)}
      />

      {/* ── Cierre de turno ──────────────────────────────────────── */}
      <CierreTurnoModal
        open={Boolean(cierreTurno)}
        entregas={cierreTurno?.entregas || 0}
        totalCobrado={cierreTurno?.totalCobrado || 0}
        efectivo={cierreTurno?.efectivo || 0}
        minutos={cierreTurno?.minutos || 0}
        metaCumplida={Boolean(cierreTurno?.metaCumplida)}
        record={Boolean(cierreTurno?.record)}
        recordAnterior={cierreTurno?.recordAnterior || 0}
        onClose={() => setCierreTurno(null)}
      />
    </div>
  );
}
