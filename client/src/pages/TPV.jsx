import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import api from '../lib/api.js';
import { resolveAssetUrl } from '../lib/assets.js';
import { DEFAULT_BRAND_LOGO } from '../lib/webPublicaHelpers.js';
import { parseGpsInput } from '../lib/parseGpsInput.js';
import {
  buildPedidoPayload,
  calculatePedidoSummary,
  createDeliveryQuoteState,
  createEmptyCustomer,
  getDefaultVariantSelection,
  getTpvSubmitError,
  normalizeText,
  safeParseArray,
} from '../lib/pedidoForm.js';
import TpvCatalog from '../components/TPV/TpvCatalog.jsx';
import TpvClientPickerModal from '../components/TPV/TpvClientPickerModal.jsx';
import TpvHeader from '../components/TPV/TpvHeader.jsx';
import TpvSidebar from '../components/TPV/TpvSidebar.jsx';
import TpvPaymentModal from '../components/TPV/TpvPaymentModal.jsx';
import { fmt, TPV_BG } from '../components/TPV/tpvUi.jsx';
import TpvVariantModal from '../components/TPV/TpvVariantModal.jsx';
import {
  grupoEsObligatorio,
  variantesCompletas as esCompleto,
} from '../lib/variantesObligatorias.js';
import {
  encolarPedidoOffline,
  leerPedidosOffline,
  sincronizarPedidosOffline,
} from '../lib/tpvOfflineQueue.js';

const PAGOS = ['efectivo', 'mercadopago', 'transferencia', 'modo', 'uala'];
const TPV_PAYMENT_OPTIONS = [...PAGOS, 'mixto'];
const TPV_PARKED_KEY = 'modosabor_tpv_parked_v1';

function safeParseJson(value, fallback) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

/**
 * ⚠️ TEMPORAL — SACAR ANTES DE DEPLOY ⚠️
 *
 * Puentea el bloqueo de "caja cerrada" para poder mirar el TPV sin abrir
 * turno. NO habilita vender de verdad: el backend sigue rechazando el
 * pedido si la caja está cerrada, así que el botón de cobrar va a tirar
 * error. Es sólo para ver el diseño.
 *
 * Para volver a la normalidad: poner esto en `false`.
 */
const BYPASS_CAJA_CERRADA = false;

function readParkedOrders() {
  if (typeof window === 'undefined') return [];
  const parsed = safeParseJson(window.localStorage.getItem(TPV_PARKED_KEY), []);
  return Array.isArray(parsed) ? parsed : [];
}

function formatEntregaLabel(tipoEntrega) {
  if (tipoEntrega === 'delivery') return 'Delivery';
  if (tipoEntrega === 'mesa') return 'Mesa';
  return 'Retiro';
}

function getLocalDateInputValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatTimeValue(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(
    2,
    '0'
  )}`;
}

function buildSuggestedHoraEntrega(tipoEntrega, config = {}) {
  const now = new Date();
  const extraMinutes =
    tipoEntrega === 'delivery'
      ? Number(config?.tiempo_delivery || 30)
      : tipoEntrega === 'retiro'
        ? Number(config?.tiempo_retiro || 20)
        : 0;
  now.setMinutes(now.getMinutes() + Math.max(0, extraMinutes));
  return formatTimeValue(now);
}

function normalizeVariantSelection(variantes) {
  return Object.entries(variantes || {})
    .map(([groupName, option]) => ({
      groupName,
      optionName: option?.nombre || option || '',
      precio_extra: Number(option?.precio_extra || 0),
    }))
    .filter((entry) => entry.groupName && entry.optionName)
    .sort((a, b) => normalizeText(a.groupName).localeCompare(normalizeText(b.groupName)));
}

function normalizeExtraSelection(extras) {
  return [...(extras || [])]
    .map((extra) => ({
      nombre: extra?.nombre || '',
      precio: Number(extra?.precio || 0),
    }))
    .filter((extra) => extra.nombre)
    .sort((a, b) => normalizeText(a.nombre).localeCompare(normalizeText(b.nombre)));
}

function precioParaCanalEnCarrito(item, producto) {
  if (item?.precio_fijo) return Number(item.precio_unitario || 0);
  const extrasVariantes = Object.values(item?.variantes || {}).reduce(
    (sum, opcion) => sum + Number(opcion?.precio_extra || 0),
    0
  );
  const extras = (item?.extras || []).reduce((sum, extra) => sum + Number(extra?.precio || 0), 0);
  return Number(producto?.precio || 0) + extrasVariantes + extras;
}

function buildCartKey(variantes, extras) {
  return JSON.stringify({
    variants: normalizeVariantSelection(variantes),
    extras: normalizeExtraSelection(extras),
  });
}

function buildVariantDescription(variantes, variantGroups = []) {
  const orderedEntries =
    variantGroups.length > 0
      ? variantGroups
          .map((group) => [group.nombre, variantes?.[group.nombre]])
          .filter(([, value]) => Boolean(value))
      : normalizeVariantSelection(variantes).map((entry) => [
          entry.groupName,
          { nombre: entry.optionName },
        ]);

  return orderedEntries
    .map(([groupName, value]) => `${groupName}: ${value?.nombre || value}`)
    .join(', ');
}

function formatTurnoLabel(shiftName) {
  const name = String(shiftName || '').trim();
  if (!name) return 'Sin turno';
  // El nombre del turno ya suele incluir la palabra "Turno" (ej: "Turno
  // Noche"), asi que anteponerla de nuevo mostraba "Turno Turno Noche".
  return /^turno\b/i.test(name) ? name : `Turno ${name}`;
}

function isEditableTarget(target) {
  const tag = target?.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
}

export default function TPV() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchInputRef = useRef(null);
  const cartItemsRef = useRef(null);
  const customerLocationRequestRef = useRef(0);
  const customerLocationBusyRef = useRef(false);

  const [config, setConfig] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  // Se usa para mostrar el skeleton del catálogo en vez de una grilla vacía.
  const [cargandoCatalogo, setCargandoCatalogo] = useState(true);
  // El cobro vive en un modal aparte: la columna del pedido queda angosta
  // y el momento de cobrar se lleva la pantalla entera.
  const [cobroAbierto, setCobroAbierto] = useState(false);
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [cajaEstado, setCajaEstado] = useState(null);
  const [catActiva, setCatActiva] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState([]);
  const [tipoEntrega, setTipoEntrega] = useState('retiro');
  const [mesa, setMesa] = useState('');
  const [horaEntrega, setHoraEntrega] = useState('');
  const [programarHora, setProgramarHora] = useState(false);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [descuentoTipo, setDescuentoTipo] = useState('monto');
  const [cliente, setCliente] = useState(createEmptyCustomer);
  /*
    Puntos de fidelidad del cliente elegido.

    `canje` guarda lo que contestó el servidor —saldo, mínimo y cuánto vale
    cada punto— y `puntosACanjear` cuántos se van a usar en este pedido. El
    valor en plata lo vuelve a calcular el servidor al crear el pedido: acá
    sólo se muestra.
  */
  const [canje, setCanje] = useState(null);
  const [puntosACanjear, setPuntosACanjear] = useState(0);
  const [clientePickerOpen, setClientePickerOpen] = useState(false);
  const [clientePickerSearch, setClientePickerSearch] = useState('');
  const [clientesCatalogo, setClientesCatalogo] = useState([]);
  const [loadingClientesCatalogo, setLoadingClientesCatalogo] = useState(false);
  const [repartidores, setRepartidores] = useState([]);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [descuento, setDescuento] = useState(0);
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [splitPayments, setSplitPayments] = useState({
    efectivo: '',
    mercadopago: '',
    transferencia: '',
    modo: '',
    uala: '',
  });
  const [notas, setNotas] = useState('');
  const [parkedLabel, setParkedLabel] = useState('');
  const [variantModal, setVariantModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printingMesa, setPrintingMesa] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(
    Boolean(document.fullscreenElement)
  );
  const [lastAddedId, setLastAddedId] = useState(null);
  const [cartMobileOpen, setCartMobileOpen] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState(() =>
    createDeliveryQuoteState({ tipoEntrega: 'retiro' })
  );
  const [redeemingReward, setRedeemingReward] = useState(false);
  const [loyaltyConfig, setLoyaltyConfig] = useState(null);
  const [parkedOrders, setParkedOrders] = useState(() => readParkedOrders());
  const [lastSale, setLastSale] = useState(null);
  const [clienteResumen, setClienteResumen] = useState(null);
  const [clientesDelDia, setClientesDelDia] = useState([]);
  const [barriosConocidos, setBarriosConocidos] = useState([]);
  const [sinConexion, setSinConexion] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false
  );
  const [pedidosOfflinePendientes, setPedidosOfflinePendientes] = useState(
    () => leerPedidosOffline().length
  );
  const [sincronizandoOffline, setSincronizandoOffline] = useState(false);
  const sincronizacionOfflineEnCurso = useRef(false);

  const refreshCajaState = useCallback(async ({ silent = true } = {}) => {
    try {
      const caja = await api.get('/caja/estado');
      setCajaEstado(caja || null);
      const abierta = BYPASS_CAJA_CERRADA || Boolean(caja?.activa);
      setCajaAbierta(abierta);
      return abierta;
    } catch (error) {
      if (!silent) {
        toast.error(error?.error || 'No se pudo verificar la caja');
      }
      return null;
    }
  }, []);

  const sincronizarColaOffline = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (sincronizacionOfflineEnCurso.current) return;

    sincronizacionOfflineEnCurso.current = true;
    setSincronizandoOffline(true);
    try {
      const resultado = await sincronizarPedidosOffline(api);
      setPedidosOfflinePendientes(resultado.pendientes);
      if (resultado.enviados > 0) {
        toast.success(
          `${resultado.enviados} pedido${resultado.enviados === 1 ? '' : 's'} pendiente${
            resultado.enviados === 1 ? '' : 's'
          } sincronizado${resultado.enviados === 1 ? '' : 's'}`
        );
      }
    } finally {
      sincronizacionOfflineEnCurso.current = false;
      setSincronizandoOffline(false);
    }
  }, []);

  useEffect(() => {
    const alPerderConexion = () => {
      setSinConexion(true);
      setPedidosOfflinePendientes(leerPedidosOffline().length);
    };
    const alRecuperarConexion = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        alPerderConexion();
        return;
      }
      setSinConexion(false);
      sincronizarColaOffline().catch(() => {});
    };
    window.addEventListener('online', alRecuperarConexion);
    window.addEventListener('offline', alPerderConexion);
    alRecuperarConexion();
    return () => {
      window.removeEventListener('online', alRecuperarConexion);
      window.removeEventListener('offline', alPerderConexion);
    };
  }, [sincronizarColaOffline]);

  const playBeep = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn('No se pudo reproducir el sonido:', e);
    }
  };

  const keyboardActionsRef = useRef({});

  useEffect(() => {
    if (cartItemsRef.current && items.length > 0) {
      cartItemsRef.current.scrollTo({
        top: cartItemsRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [items.length]);

  useEffect(() => {
    setCargandoCatalogo(true);
    Promise.all([
      api.get('/categorias'),
      api.get('/productos/catalogo-tpv?canal=mostrador'),
      // La configuración no se cachea: puede incluir datos operativos que no
      // corresponden a una copia offline. Sin red el TPV abre con sus valores
      // seguros por defecto y la carta ya cacheada.
      api.get('/configuracion/panel').catch(() => ({})),
      api.get('/repartidores?turno_actual=1').catch(() => []),
      api.get('/caja/estado').catch(() => null),
      api.get('/fidelizacion/config').catch(() => null),
      api.get('/direcciones/barrios').catch(() => ({ barrios: [] })),
    ])
      .then(([cats, prods, conf, reps, caja, fidelizacion, direcciones]) => {
        setConfig(conf);
        setCategorias(cats.filter((item) => item.activo));
        setProductos(prods);
        setRepartidores(reps.filter((item) => item.activo));
        setCajaEstado(caja || null);
        setCajaAbierta(BYPASS_CAJA_CERRADA || Boolean(caja?.activa));
        setLoyaltyConfig(fidelizacion || null);
        setBarriosConocidos(Array.isArray(direcciones?.barrios) ? direcciones.barrios : []);
      })
      .catch((error) => toast.error(error?.error || 'No se pudo cargar el TPV'))
      .finally(() => setCargandoCatalogo(false));
  }, []);

  useEffect(() => {
    const canal = tipoEntrega === 'delivery' ? 'delivery' : 'mostrador';
    api
      .get(`/productos/catalogo-tpv?canal=${canal}`)
      .then((prods) => {
        const productosPorId = new Map(
          (prods || []).map((producto) => [Number(producto.id), producto])
        );
        setProductos(prods);
        setItems((previous) =>
          previous.map((item) => {
            const producto = productosPorId.get(Number(item.producto_id));
            if (!producto || item.precio_fijo) return item;
            return { ...item, precio_unitario: precioParaCanalEnCarrito(item, producto) };
          })
        );
      })
      .catch((error) => toast.error(error?.error || 'No se pudo actualizar el precio del canal'));
  }, [tipoEntrega]);

  useEffect(() => {
    // El TPV puede quedar abierto desde la mañana hasta la noche. La lista
    // inicial ya no alcanza: al cambiar el turno seguía mostrando los riders
    // del horario anterior hasta recargar toda la aplicación.
    const actualizarRidersDelTurno = () => {
      api
        .get('/repartidores?turno_actual=1')
        .then((data) =>
          setRepartidores(Array.isArray(data) ? data.filter((item) => item.activo) : [])
        )
        .catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') actualizarRidersDelTurno();
    };
    const intervalId = window.setInterval(actualizarRidersDelTurno, 30000);
    window.addEventListener('focus', actualizarRidersDelTurno);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', actualizarRidersDelTurno);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const cargarClientesDelDia = useCallback(async () => {
    try {
      const hoy = getLocalDateInputValue();
      const pedidos = await api.get(`/pedidos?fecha_desde=${hoy}&fecha_hasta=${hoy}&limit=80`);
      const seen = new Set();
      const frecuentes = [];

      for (const pedido of pedidos || []) {
        const rawId = pedido?.cliente_id || `phone:${pedido?.cliente_telefono || ''}`;
        const uniqueId = String(rawId || '').trim();
        if (!uniqueId || seen.has(uniqueId)) continue;
        if (!pedido?.cliente_nombre && !pedido?.cliente_telefono) continue;

        seen.add(uniqueId);
        frecuentes.push({
          id: pedido?.cliente_id || null,
          nombre: pedido?.cliente_nombre || 'Cliente ocasional',
          telefono: pedido?.cliente_telefono || '',
          direccion: pedido?.cliente_direccion || '',
          codigo_tarjeta: pedido?.cliente_codigo_tarjeta || '',
          total_pedidos: Number(pedido?.cliente_total_pedidos || 0),
        });

        if (frecuentes.length >= 6) break;
      }

      setClientesDelDia(frecuentes);
    } catch {
      setClientesDelDia([]);
    }
  }, []);

  useEffect(() => {
    cargarClientesDelDia();
  }, [cargarClientesDelDia]);

  useEffect(() => {
    const syncCaja = () => {
      refreshCajaState({ silent: true });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncCaja();
      }
    };

    const intervalId = window.setInterval(syncCaja, 30000);
    window.addEventListener('focus', syncCaja);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncCaja);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshCajaState]);

  useEffect(() => {
    const onFullscreenChange = () => setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (items.length === 0 && pedidosOfflinePendientes === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [items.length, pedidosOfflinePendientes]);

  // Los pedidos en espera se sincronizan por operacion individual (guardar
  // uno, borrar uno) en vez de mandar la lista completa en cada cambio.
  // Antes, dos terminales de TPV podian pisarse: si la Terminal A borraba
  // un pedido y la Terminal B todavia tenia en memoria una lista un poco
  // vieja, el proximo cambio de B (por ejemplo guardar uno nuevo) mandaba
  // su lista completa -que todavia incluia el que A acababa de borrar- y
  // lo resucitaba. Con operaciones por item eso ya no puede pasar.
  const fetchParkedOrders = useCallback(async () => {
    try {
      const serverOrders = await api.get('/tpv/espera');
      if (!Array.isArray(serverOrders)) return;
      setParkedOrders(serverOrders);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TPV_PARKED_KEY, JSON.stringify(serverOrders.slice(0, 12)));
      }
    } catch {
      // Sin conexion: seguimos mostrando lo que haya en este dispositivo
    }
  }, []);

  useEffect(() => {
    fetchParkedOrders();
    const intervalId = window.setInterval(fetchParkedOrders, 20000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchParkedOrders();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchParkedOrders]);

  useEffect(() => {
    const tipo = searchParams.get('tipo');
    const mesaParam = searchParams.get('mesa');
    if (tipo && ['delivery', 'retiro', 'mesa'].includes(tipo)) setTipoEntrega(tipo);
    if (mesaParam) {
      setTipoEntrega('mesa');
      setMesa(mesaParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (tipoEntrega !== 'delivery') {
      setSelectedRiderId('');
    }
  }, [tipoEntrega]);

  useEffect(() => {
    // La hora de entrega ya no se autocompleta para todos los pedidos: solo
    // aplica cuando el cliente pide explicitamente un horario puntual (ver
    // toggleProgramarHora). La mayoria de los pedidos salen apenas estan
    // listos, sin un horario cargado.
    if (tipoEntrega === 'mesa') {
      setProgramarHora(false);
      setHoraEntrega('');
    }
  }, [tipoEntrega]);

  const repartidoresActivos = useMemo(
    () => repartidores.filter((item) => item.activo),
    [repartidores]
  );
  const repartidoresDisponibles = useMemo(
    () => repartidoresActivos.filter((item) => item.disponible),
    [repartidoresActivos]
  );
  const selectedRider = useMemo(
    () => repartidoresActivos.find((item) => Number(item.id) === Number(selectedRiderId)) || null,
    [repartidoresActivos, selectedRiderId]
  );

  useEffect(() => {
    if (tipoEntrega !== 'delivery') return;
    if (
      selectedRiderId &&
      repartidoresActivos.some((item) => Number(item.id) === Number(selectedRiderId))
    )
      return;

    const riderPreferido = repartidoresDisponibles[0] || repartidoresActivos[0];
    if (riderPreferido?.id) {
      setSelectedRiderId(String(riderPreferido.id));
    }
  }, [tipoEntrega, repartidoresActivos, repartidoresDisponibles, selectedRiderId]);

  useEffect(() => {
    if (tipoEntrega !== 'delivery') {
      setDeliveryQuote(createDeliveryQuoteState({ tipoEntrega, config }));
      return undefined;
    }

    const direccion = String(cliente.direccion || '').trim();
    if (!direccion) {
      setDeliveryQuote(createDeliveryQuoteState({ tipoEntrega: 'delivery', config }));
      return undefined;
    }

    setDeliveryQuote((previous) => ({
      ...previous,
      pending: true,
      message: 'Calculando envio...',
    }));

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const quote = await Promise.race([
          api.post('/configuracion/delivery/cotizar', { direccion }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        if (cancelled) return;
        setDeliveryQuote({
          ...createDeliveryQuoteState({ tipoEntrega: 'delivery', config }),
          ...quote,
          pending: false,
        });
      } catch {
        if (cancelled) return;
        setDeliveryQuote(
          createDeliveryQuoteState({
            tipoEntrega: 'delivery',
            config,
            overrides: {
              costo_envio: Number(config.costo_envio_base || 0),
              available: true,
              message: 'No se pudo calcular la zona ahora',
            },
          })
        );
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tipoEntrega, cliente.direccion, config]);

  useEffect(() => {
    if (tipoEntrega === 'mesa' && clientePickerOpen) {
      setClientePickerOpen(false);
    }
  }, [clientePickerOpen, tipoEntrega]);

  useEffect(() => {
    if (!clientePickerOpen || tipoEntrega === 'mesa') return undefined;

    const timer = setTimeout(async () => {
      setLoadingClientesCatalogo(true);
      try {
        const query = String(clientePickerSearch || '').trim();
        const response = await api.get(
          `/clientes${query ? `?search=${encodeURIComponent(query)}` : ''}`
        );
        setClientesCatalogo((response || []).slice(0, 24));
      } catch (error) {
        toast.error(error?.error || 'No se pudieron cargar los clientes');
        setClientesCatalogo([]);
      } finally {
        setLoadingClientesCatalogo(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [clientePickerOpen, clientePickerSearch, tipoEntrega]);

  useEffect(() => {
    if (!cliente?.id) {
      setClienteResumen(null);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const detail = await api.get(`/clientes/${cliente.id}`);
        if (!cancelled) {
          setClienteResumen(detail || null);
        }
      } catch {
        if (!cancelled) setClienteResumen(null);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cliente?.id]);

  const productosFiltrados = useMemo(
    () =>
      productos.filter((producto) => {
        const matchCat = !catActiva || producto.categoria_id === catActiva;
        const matchSearch =
          !busqueda || normalizeText(producto.nombre).includes(normalizeText(busqueda));
        return matchCat && matchSearch;
      }),
    [productos, catActiva, busqueda]
  );
  const cartQtyByProductId = useMemo(
    () =>
      items.reduce((acc, item) => {
        acc[item.producto_id] = Number(acc[item.producto_id] || 0) + Number(item.cantidad || 0);
        return acc;
      }, {}),
    [items]
  );
  /**
   * Cuántas líneas distintas del carrito corresponden a cada producto.
   *
   * Un mismo producto puede estar varias veces con variantes o extras
   * diferentes (una pizza entera y otra media, por ejemplo). En ese caso
   * el stepper de la tarjeta del catálogo sería ambiguo — no sabríamos a
   * cuál de las dos líneas restarle — así que sólo lo mostramos cuando hay
   * una sola línea. Con más de una, el operador ajusta desde el carrito.
   */
  const cartLinesByProductId = useMemo(
    () =>
      items.reduce((acc, item) => {
        acc[item.producto_id] = Number(acc[item.producto_id] || 0) + 1;
        return acc;
      }, {}),
    [items]
  );

  /** Cantidad de productos activos por categoría, para el contador del chip. */
  const conteoPorCategoria = useMemo(
    () =>
      productos.reduce((acc, producto) => {
        if (!producto?.categoria_id) return acc;
        acc[producto.categoria_id] = Number(acc[producto.categoria_id] || 0) + 1;
        return acc;
      }, {}),
    [productos]
  );

  const splitPaymentEntries = useMemo(
    () =>
      PAGOS.map((method) => ({
        method,
        amount: Number(splitPayments[method] || 0),
      })).filter((item) => item.amount > 0),
    [splitPayments]
  );
  const splitAssignedTotal = useMemo(
    () => splitPaymentEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [splitPaymentEntries]
  );
  const splitCashTarget = Number(splitPayments.efectivo || 0);

  /*
    Al cambiar de cliente se pregunta por sus puntos y se limpia lo que hubiera
    quedado del anterior. Sin ese reinicio, el descuento del cliente de antes
    se aplicaría al pedido del siguiente.
  */
  useEffect(() => {
    setPuntosACanjear(0);
    setCanje(null);
    if (!cliente?.id) return undefined;

    let vigente = true;
    api
      .get(`/fidelizacion/canje/${cliente.id}`)
      .then((datos) => vigente && setCanje(datos?.disponible ? datos : null))
      // Si falla, simplemente no se ofrece el canje. Cobrar es más importante.
      .catch(() => vigente && setCanje(null));
    return () => {
      vigente = false;
    };
  }, [cliente?.id]);

  const descuentoPorPuntos = useMemo(() => {
    if (!canje || puntosACanjear <= 0) return 0;
    return Math.round(puntosACanjear * Number(canje.valor_punto || 0));
  }, [canje, puntosACanjear]);

  const summary = useMemo(
    () =>
      calculatePedidoSummary({
        items,
        tipoEntrega,
        deliveryQuote,
        descuento,
        descuentoTipo,
        /*
          Va aparte del descuento manual: si se sumaran, un descuento por
          porcentaje se aplicaría también sobre el valor de los puntos.

          Este número es sólo para mostrar en pantalla. El servidor lo vuelve a
          calcular al crear el pedido con el valor del punto configurado, así
          que aunque acá hubiera un error, se cobra lo correcto.
        */
        descuentoPuntos: descuentoPorPuntos,
        metodoPago,
        efectivoRecibido,
        cashTarget: metodoPago === 'mixto' ? splitCashTarget : null,
      }),
    [
      items,
      tipoEntrega,
      deliveryQuote,
      descuento,
      descuentoTipo,
      descuentoPorPuntos,
      metodoPago,
      efectivoRecibido,
      splitCashTarget,
    ]
  );
  const {
    subtotal,
    envio,
    descuentoAplicado,
    descuentoDePuntos,
    total,
    totalItems,
    efectivoRecibidoNumero,
    vuelto,
  } = summary;
  const splitRemaining = Number((total - splitAssignedTotal).toFixed(2));
  const primaryMixedMethod = useMemo(() => {
    if (metodoPago !== 'mixto') return metodoPago;
    const ordered = [...splitPaymentEntries].sort(
      (a, b) =>
        Number(b.amount || 0) - Number(a.amount || 0) ||
        Number(a.method === 'efectivo') - Number(b.method === 'efectivo')
    );
    return ordered[0]?.method || 'efectivo';
  }, [metodoPago, splitPaymentEntries]);
  const variantesCompletas = !variantModal || esCompleto(variantModal.variantes, variantModal.sel);
  const selectedVariantTotal = !variantModal
    ? 0
    : (variantModal.rewardOptions?.priceOverride !== undefined
        ? Number(variantModal.rewardOptions.priceOverride || 0)
        : Number(variantModal.producto.precio || 0)) +
      Object.values(variantModal.sel).reduce(
        (sum, option) => sum + Number(option?.precio_extra || 0),
        0
      ) +
      variantModal.extrasSel.reduce((sum, extra) => sum + Number(extra.precio || 0), 0);
  const preflightChecklist = useMemo(() => {
    const currentItemsInStock = items.every((item) => {
      const product = productos.find((entry) => Number(entry.id) === Number(item.producto_id));
      return product ? product.disponible_para_venta !== false : true;
    });
    const checks = [
      {
        key: 'caja',
        label: 'Caja',
        status: cajaAbierta ? 'ok' : 'block',
        detail: cajaAbierta ? 'Abierta y lista' : 'Debes abrir turno',
      },
      {
        key: 'pedido',
        label: 'Pedido',
        status: items.length > 0 ? 'ok' : 'block',
        detail: items.length > 0 ? `${totalItems} item${totalItems === 1 ? '' : 's'}` : 'Sin items',
      },
      {
        key: 'stock',
        label: 'Stock',
        status: currentItemsInStock ? 'ok' : 'warn',
        detail: currentItemsInStock ? 'Productos disponibles' : 'Revisar disponibilidad',
      },
    ];

    if (tipoEntrega === 'delivery') {
      checks.push(
        {
          key: 'cliente',
          label: 'Cliente',
          status: cliente?.nombre ? 'ok' : 'block',
          detail: cliente?.nombre ? cliente.nombre : 'Falta nombre',
        },
        {
          key: 'direccion',
          label: 'Direccion',
          status: cliente?.direccion ? 'ok' : 'block',
          detail: cliente?.direccion || 'Falta direccion',
        },
        {
          key: 'rider',
          label: 'Rider',
          status: selectedRider || repartidoresActivos.length > 0 ? 'ok' : 'warn',
          detail: selectedRider?.nombre || repartidoresActivos[0]?.nombre || 'Sin asignar',
        },
        {
          key: 'gps',
          label: 'GPS',
          status: cliente?.latitud ? 'ok' : 'warn',
          detail: cliente?.latitud ? 'Ubicacion guardada' : 'Conviene guardar ubicacion',
        }
      );
    }

    if (tipoEntrega === 'mesa') {
      checks.push({
        key: 'mesa',
        label: 'Mesa',
        status: String(mesa || '').trim() ? 'ok' : 'block',
        detail: String(mesa || '').trim() ? `Mesa ${mesa}` : 'Falta mesa',
      });
    }

    // El horario solo se pide (y solo se chequea) cuando el pedido en si
    // necesita salir a una hora puntual. La mayoria de los pedidos no la
    // usan: salen apenas estan listos.
    if (tipoEntrega !== 'mesa' && programarHora) {
      checks.push({
        key: 'hora',
        label: 'Horario',
        status: horaEntrega ? 'ok' : 'warn',
        detail: horaEntrega || 'Sin horario cargado',
      });
    }

    if (metodoPago === 'mixto') {
      checks.push({
        key: 'pago',
        label: 'Pago',
        status: splitPaymentEntries.length > 0 && Math.abs(splitRemaining) <= 0.5 ? 'ok' : 'block',
        detail:
          splitPaymentEntries.length > 0 && Math.abs(splitRemaining) <= 0.5
            ? 'Cobro mixto completo'
            : `Faltan ${Math.abs(splitRemaining).toLocaleString('es-AR', {
                style: 'currency',
                currency: 'ARS',
                maximumFractionDigits: 0,
              })}`,
      });
    } else if (metodoPago === 'efectivo') {
      const efectivoCargado =
        String(efectivoRecibido || '').trim() !== '' && efectivoRecibidoNumero >= total;
      checks.push({
        key: 'pago',
        label: 'Pago',
        status: efectivoCargado ? 'ok' : 'block',
        detail: efectivoCargado ? 'Efectivo cargado' : 'Falta cargar el efectivo recibido',
      });
    } else {
      checks.push({
        key: 'pago',
        label: 'Pago',
        status: 'ok',
        detail: metodoPago,
      });
    }

    return checks;
  }, [
    cajaAbierta,
    items,
    productos,
    totalItems,
    tipoEntrega,
    cliente,
    horaEntrega,
    programarHora,
    selectedRider,
    repartidoresActivos,
    mesa,
    metodoPago,
    splitPaymentEntries,
    splitRemaining,
    efectivoRecibido,
    efectivoRecibidoNumero,
    total,
  ]);
  const preflightBlockingCount = preflightChecklist.filter(
    (item) => item.status === 'block'
  ).length;

  /**
   * Al sacar el bloque de pre-chequeo de la pantalla, este texto pasa a ser
   * la única forma de saber por qué el botón de cobrar está deshabilitado.
   * Se muestra en el tooltip del botón, así que no es opcional: sin esto el
   * operador se queda mirando un botón gris sin saber qué le falta.
   */
  const blockedReason = useMemo(() => {
    const bloqueos = preflightChecklist.filter((item) => item.status === 'block');
    if (bloqueos.length > 0) {
      return bloqueos.map((item) => `${item.label}: ${item.detail}`).join(' · ');
    }
    if (tipoEntrega === 'delivery') {
      if (deliveryQuote.pending) return 'Estamos calculando el costo de envío.';
      if (!deliveryQuote.available) {
        return deliveryQuote.message || 'No hay envío disponible para esa dirección.';
      }
    }
    if (!cajaAbierta) return 'La caja está cerrada. Abrí el turno para vender.';
    return null;
  }, [preflightChecklist, tipoEntrega, deliveryQuote, cajaAbierta]);
  const confirmDisabled =
    !cajaAbierta ||
    loading ||
    items.length === 0 ||
    (tipoEntrega === 'delivery' && (deliveryQuote.pending || !deliveryQuote.available)) ||
    preflightBlockingCount > 0;

  /**
   * Resta una unidad desde la tarjeta del catálogo.
   *
   * Sólo actúa si el producto tiene exactamente una línea en el carrito;
   * el catálogo ya se encarga de no mostrar el control en el otro caso,
   * pero lo validamos igual acá para que no dependa de la UI.
   */
  const restarDesdeCatalogo = (producto) => {
    const lineas = items.filter((item) => Number(item.producto_id) === Number(producto?.id));
    if (lineas.length !== 1) return;
    cambiarCantidad(lineas[0].id, -1);
  };

  const limpiar = () => {
    setItems([]);
    setCliente(createEmptyCustomer());
    setClientePickerOpen(false);
    setClientePickerSearch('');
    setClientesCatalogo([]);
    setDescuento(0);
    /*
      Explícito aunque el efecto que escucha el cambio de cliente también los
      limpie: si mañana ese efecto cambia, el pedido siguiente no puede
      arrastrar los puntos del cliente anterior.
    */
    setPuntosACanjear(0);
    setCanje(null);
    setEfectivoRecibido('');
    setSplitPayments({
      efectivo: '',
      mercadopago: '',
      transferencia: '',
      modo: '',
      uala: '',
    });
    setNotas('');
    setParkedLabel('');
    setMesa('');
    setProgramarHora(false);
    setHoraEntrega('');
    setSelectedRiderId('');
    setDeliveryQuote(createDeliveryQuoteState({ tipoEntrega, config }));
  };

  const toggleProgramarHora = () => {
    setProgramarHora((previous) => {
      const next = !previous;
      if (next) {
        setHoraEntrega(
          (currentHora) => currentHora || buildSuggestedHoraEntrega(tipoEntrega, config)
        );
      } else {
        setHoraEntrega('');
      }
      return next;
    });
  };

  const saveCurrentAsParked = () => {
    if (!items.length) {
      toast.error('No hay un pedido para dejar en espera');
      return;
    }
    const now = new Date();
    const customLabel = String(parkedLabel || '').trim();
    const labelBase =
      customLabel ||
      (tipoEntrega === 'mesa'
        ? `Mesa ${mesa || 'sin numero'}`
        : cliente.nombre || cliente.telefono || formatEntregaLabel(tipoEntrega));
    const record = {
      id: `hold-${now.getTime()}`,
      createdAt: now.toISOString(),
      label: labelBase,
      total,
      totalItems,
      snapshot: {
        items,
        tipoEntrega,
        mesa,
        horaEntrega,
        programarHora,
        metodoPago,
        cliente,
        selectedRiderId,
        descuento,
        descuentoTipo,
        efectivoRecibido,
        splitPayments,
        notas,
      },
    };
    setParkedOrders((previous) => [record, ...previous].slice(0, 12));
    toast.success('Pedido guardado en espera');
    limpiar();
    setCartMobileOpen(false);
    api.post('/tpv/espera', record).catch(() => {
      toast.error('Se guardo en este dispositivo pero no se pudo sincronizar con las demas cajas');
    });
  };

  const restoreParkedOrder = (parkedId) => {
    const target = parkedOrders.find((item) => item.id === parkedId);
    if (!target?.snapshot) return;
    const snapshot = target.snapshot;
    setItems(snapshot.items || []);
    setTipoEntrega(snapshot.tipoEntrega || 'retiro');
    setMesa(snapshot.mesa || '');
    setProgramarHora(Boolean(snapshot.programarHora ?? snapshot.horaEntrega));
    setHoraEntrega(snapshot.horaEntrega || '');
    setMetodoPago(snapshot.metodoPago || 'efectivo');
    setCliente(snapshot.cliente || createEmptyCustomer());
    setSelectedRiderId(String(snapshot.selectedRiderId || ''));
    setDescuento(snapshot.descuento || 0);
    setDescuentoTipo(snapshot.descuentoTipo || 'monto');
    setEfectivoRecibido(snapshot.efectivoRecibido || '');
    setSplitPayments(
      snapshot.splitPayments || {
        efectivo: '',
        mercadopago: '',
        transferencia: '',
        modo: '',
        uala: '',
      }
    );
    setNotas(snapshot.notas || '');
    setCartMobileOpen(false);
    // Al abrir un pedido en espera lo sacamos de la lista: queda "en curso"
    // en el carrito. Antes se quedaba tambien en la lista de espera, lo que
    // permitia volver a abrirlo (o que otra caja lo abriera) y vender el
    // mismo pedido dos veces.
    setParkedOrders((previous) => previous.filter((item) => item.id !== parkedId));
    api.delete(`/tpv/espera/${encodeURIComponent(parkedId)}`).catch(() => {});
    toast.success('Pedido recuperado desde espera');
  };

  const deleteParkedOrder = (parkedId) => {
    setParkedOrders((previous) => previous.filter((item) => item.id !== parkedId));
    toast.success('Pedido en espera eliminado');
    api.delete(`/tpv/espera/${encodeURIComponent(parkedId)}`).catch(() => {
      toast.error('No se pudo borrar en el servidor, puede reaparecer en otra caja');
    });
  };

  const duplicateParkedOrder = (parkedId) => {
    const target = parkedOrders.find((item) => item.id === parkedId);
    if (!target?.snapshot) return;
    const copy = {
      ...target,
      id: `hold-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      label: `${target.label} copia`,
    };
    setParkedOrders((previous) => [copy, ...previous].slice(0, 12));
    toast.success('Pedido en espera duplicado');
    api.post('/tpv/espera', copy).catch(() => {
      toast.error('La copia se guardo en este dispositivo pero no se sincronizo');
    });
  };

  const aplicarCliente = (match) => {
    setCliente((previous) => ({
      ...previous,
      id: match.id || null,
      nombre: match.nombre || previous.nombre,
      telefono: match.telefono || previous.telefono,
      direccion: match.direccion || previous.direccion,
      codigo_tarjeta: match.codigo_tarjeta || '',
      puntos: Number(match.puntos || 0),
      recompensas_pendientes: Number(match.recompensas_pendientes || 0),
      sellos_actuales: Number(match.sellos_actuales || match.sellos || 0),
      nivel: match.nivel || 'Bronce',
      latitud: null,
      longitud: null,
    }));
    setClientePickerOpen(false);
  };

  /**
   * Alta de cliente desde el mostrador.
   *
   * Antes esto no existía: el buscador sólo buscaba, así que dar de alta a
   * alguien que estaba esperando obligaba a salir del TPV, ir a Clientes,
   * cargarlo y volver a armar el pedido. En la práctica no se cargaba a nadie.
   *
   * Queda seleccionado en el acto, con su tarjeta ya generada por el servidor,
   * para poder cantarle el código en el momento.
   */
  const crearClienteDesdeElTpv = async (datos) => {
    try {
      const creado = await api.post('/clientes', {
        nombre: datos.nombre,
        telefono: datos.telefono || '',
        direccion: datos.direccion || '',
      });
      aplicarCliente(creado);
      toast.success(
        creado?.codigo_tarjeta
          ? `${creado.nombre} — tarjeta ${creado.codigo_tarjeta}`
          : `${creado.nombre} quedó cargado`
      );
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar el cliente');
      /*
        Se vuelve a lanzar para que el modal sepa que falló y deje el formulario
        como estaba. Si se lo tragara acá, el modal daría por bueno el guardado,
        cerraría el alta y borraría lo tipeado — con el cliente esperando del
        otro lado del mostrador.
      */
      throw error;
    }
  };

  const abrirSelectorClientes = () => {
    const initialSearch = String(
      cliente.codigo_tarjeta || cliente.telefono || cliente.nombre || ''
    ).trim();
    setClientePickerSearch(initialSearch);
    setClientePickerOpen(true);
  };

  const canjearRecompensaCliente = async () => {
    if (!cliente?.id) {
      toast.error('Selecciona primero un cliente con tarjeta');
      return;
    }
    if (redeemingReward) return;

    setRedeemingReward(true);
    try {
      const updated = await api.post(`/clientes/${cliente.id}/canjear-regalo`, {});
      setCliente((previous) => ({
        ...previous,
        id: updated.id,
        codigo_tarjeta: updated.codigo_tarjeta || previous.codigo_tarjeta,
        puntos: Number(updated.puntos || 0),
        recompensas_pendientes: Number(updated.recompensas_pendientes || 0),
        sellos_actuales: Number(updated.sellos_actuales || updated.sellos || 0),
        nivel: updated.nivel || previous.nivel,
      }));
      setClientesCatalogo((previous) =>
        previous.map((item) =>
          Number(item.id) === Number(updated.id)
            ? {
                ...item,
                puntos: updated.puntos,
                recompensas_pendientes: updated.recompensas_pendientes,
                sellos_actuales: updated.sellos_actuales,
                codigo_tarjeta: updated.codigo_tarjeta,
                nivel: updated.nivel,
              }
            : item
        )
      );

      const rewardProductId = Number(loyaltyConfig?.premio_producto_id || 0);
      const rewardTag = loyaltyConfig?.premio_descripcion || 'Premio fidelidad';
      const rewardOptions = {
        priceOverride: 0,
        rewardTag,
        cartKeySuffix: `reward-${updated.id}-${Date.now()}`,
      };
      const rewardProduct = rewardProductId
        ? productos.find((item) => Number(item.id) === rewardProductId)
        : null;

      if (!rewardProduct) {
        toast.success('Premio canjeado. Falta definir el producto premio en fidelización.');
        return;
      }

      const variantes = safeParseArray(rewardProduct.variantes);
      const extras = safeParseArray(rewardProduct.extras);
      if (variantes.length > 0 || extras.length > 0) {
        setVariantModal({
          producto: rewardProduct,
          variantes,
          extras,
          sel: {},
          extrasSel: [],
          rewardOptions,
        });
        toast.success('Premio canjeado. Elige la variante del premio.');
        return;
      }

      addToCart(rewardProduct, {}, [], [], rewardOptions);
      toast.success('Premio canjeado y agregado al pedido.');
    } catch (error) {
      toast.error(error?.error || 'No se pudo canjear el premio');
    } finally {
      setRedeemingReward(false);
    }
  };

  const toggleBrowserFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast.error('El navegador no permitio cambiar la pantalla completa');
    }
  };

  const volverAlPanel = async () => {
    if (
      items.length > 0 &&
      !window.confirm(
        `Tenes un pedido cargado (${totalItems} item${
          totalItems === 1 ? '' : 's'
        }) sin guardar. Si volves al panel se pierde. ¿Volver igual?`
      )
    ) {
      return;
    }
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {}
    }
    navigate('/admin/dashboard');
  };

  const addToCart = (producto, variantes, extras, variantGroups = [], options = {}) => {
    playBeep();
    const notas = String(options.notas || '').trim();
    const noteKey = notas ? `nota:${notas.toLowerCase()}` : 'sin-nota';
    const cartKey = `${buildCartKey(variantes, extras)}::${noteKey}::${
      options.cartKeySuffix || 'normal'
    }`;
    const precioExtra =
      Object.values(variantes).reduce((sum, option) => sum + Number(option?.precio_extra || 0), 0) +
      extras.reduce((sum, extra) => sum + Number(extra.precio || 0), 0);
    const precioUnitario =
      options.priceOverride !== undefined
        ? Number(options.priceOverride || 0)
        : Number(producto.precio) + precioExtra;
    const existingIndex = items.findIndex(
      (item) => item.producto_id === producto.id && item.cartKey === cartKey
    );

    if (existingIndex !== -1) {
      const updatedItems = [...items];
      const targetId = updatedItems[existingIndex].id;
      updatedItems[existingIndex] = {
        ...updatedItems[existingIndex],
        cantidad: updatedItems[existingIndex].cantidad + 1,
      };
      setItems(updatedItems);
      setLastAddedId(targetId);
    } else {
      const descripcionVariantes = buildVariantDescription(variantes, variantGroups);
      const descripcionExtras = extras.map((extra) => extra.nombre).join(', ');
      const descripcionReward = options.rewardTag ? `Premio: ${options.rewardTag}` : '';
      const descripcionNotas = notas ? `Nota: ${notas}` : '';
      const newId = `${producto.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setItems((previous) => [
        ...previous,
        {
          id: newId,
          producto_id: producto.id,
          nombre: producto.nombre,
          // La miniatura viaja con el item para que la lista del pedido
          // pueda mostrarla sin volver a buscar el producto en el catálogo.
          imagen: producto.imagen || null,
          categoria_icono: producto.categoria_icono || null,
          precio_unitario: precioUnitario,
          precio_fijo: options.priceOverride !== undefined,
          cantidad: 1,
          variantes,
          extras,
          notas,
          cartKey,
          descripcion: [
            descripcionReward,
            descripcionVariantes,
            descripcionExtras,
            descripcionNotas,
          ]
            .filter(Boolean)
            .join(' | '),
        },
      ]);
      setLastAddedId(newId);
    }

    toast.success(`Agregado: ${producto.nombre}`, {
      duration: 800,
      position: 'bottom-center',
      style: { borderRadius: '16px', fontWeight: 'bold', fontSize: '13px' },
    });
    setVariantModal(null);
    setTimeout(() => setLastAddedId(null), 800);
  };

  const loadPedidoIntoCart = (pedido, { keepCustomer = true } = {}) => {
    if (!pedido || !Array.isArray(pedido.items) || pedido.items.length === 0) {
      toast.error('Ese pedido no tiene items para repetir');
      return;
    }

    const nextItems = pedido.items.map((item) => ({
      id: `${item.producto_id || item.id || 'pedido'}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 6)}`,
      producto_id: item.producto_id || item.id || null,
      nombre: item.nombre || 'Producto',
      precio_unitario: Number(item.precio_unitario || item.precio || 0),
      cantidad: Number(item.cantidad || 1),
      variantes: item.variantes || {},
      extras: Array.isArray(item.extras) ? item.extras : [],
      cartKey: `${buildCartKey(
        item.variantes || {},
        Array.isArray(item.extras) ? item.extras : []
      )}::repeat-${pedido.id}-${Math.random().toString(16).slice(2, 5)}`,
      descripcion: item.descripcion || '',
    }));

    setItems(nextItems);
    setTipoEntrega(pedido.tipo_entrega || 'retiro');
    setMesa(pedido.mesa || '');
    setProgramarHora(Boolean(pedido.hora_entrega));
    setHoraEntrega(pedido.hora_entrega || '');
    setMetodoPago(pedido.metodo_pago || 'efectivo');
    setDescuento(0);
    setDescuentoTipo('monto');
    setEfectivoRecibido('');
    setSplitPayments({
      efectivo: '',
      mercadopago: '',
      transferencia: '',
      modo: '',
      uala: '',
    });
    setNotas(pedido.notas || '');
    if (keepCustomer) {
      setCliente((previous) => ({
        ...previous,
        id: pedido.cliente_id || previous.id || null,
        nombre: pedido.cliente_nombre || previous.nombre || '',
        telefono: pedido.cliente_telefono || previous.telefono || '',
        direccion: pedido.cliente_direccion || previous.direccion || '',
      }));
    }
    toast.success(`Pedido #${pedido.numero} cargado en el TPV`);
  };

  const agregarItem = (producto, { forceOptions = false } = {}) => {
    if (producto.disponible_para_venta === false) {
      toast.error('Ese producto no tiene stock disponible');
      return;
    }

    const variantes = safeParseArray(producto.variantes);
    const extras = safeParseArray(producto.extras);
    // Solo se abre el modal si el producto tiene variantes reales para elegir
    // (talle, presentacion, etc). Si únicamente tiene extras opcionales -como la
    // promo de jugo + postre del menú del día- se agrega directo para no
    // frenar la venta rápida; el extra (o una nota tipo "sin aceituna") se puede
    // sumar aparte tocando "+ opciones", que ahora siempre está disponible.
    if (variantes.length > 0 || extras.length > 0 || forceOptions) {
      setVariantModal({
        producto,
        variantes,
        extras,
        sel: getDefaultVariantSelection(producto),
        extrasSel: [],
        notas: '',
      });
      return;
    }

    addToCart(producto, {}, []);
  };

  const actualizarNotasVariante = (value) => {
    setVariantModal((previous) => (previous ? { ...previous, notas: value } : previous));
  };

  const seleccionarVariante = (groupName, option) => {
    setVariantModal((previous) => {
      const elegida = typeof option === 'string' ? { nombre: option } : option;
      const grupo = previous.variantes.find((g) => g.nombre === groupName);
      /*
        En un grupo opcional, volver a tocar la opción elegida la saca.

        Sin esto no habría forma de arrepentirse: el cliente pide ñoquis con
        salsa, cambia de idea, y el cajero no puede dejar el grupo vacío. Con
        los obligatorios no aplica, porque ahí siempre tiene que quedar una.
      */
      const yaEstaba = previous.sel?.[groupName]?.nombre === elegida?.nombre;
      if (yaEstaba && !grupoEsObligatorio(grupo)) {
        const resto = { ...previous.sel };
        delete resto[groupName];
        return { ...previous, sel: resto };
      }
      return { ...previous, sel: { ...previous.sel, [groupName]: elegida } };
    });
  };

  const toggleExtraVariante = (extra) => {
    setVariantModal((previous) => {
      const selected = previous.extrasSel.some((item) => item.nombre === extra.nombre);
      return {
        ...previous,
        extrasSel: selected
          ? previous.extrasSel.filter((item) => item.nombre !== extra.nombre)
          : [...previous.extrasSel, extra],
      };
    });
  };

  const cambiarCantidad = (id, delta) => {
    setItems((previous) =>
      previous
        .map((item) => (item.id === id ? { ...item, cantidad: item.cantidad + delta } : item))
        .filter((item) => item.cantidad > 0)
    );
  };

  const quitarItem = (id) => setItems((previous) => previous.filter((item) => item.id !== id));

  /*
    ── Descontar una línea ────────────────────────────────────────────────────

    El plato que salió mal y se cobra a mitad, el postre de cortesía, el 2x1 de
    una sola línea. Antes sólo se podía descontar del total del pedido, que no
    deja rastro de a qué se le hizo el descuento ni por qué.

    Se pide en plata y no en porcentaje: un 15% sobre un precio que después
    cambia da un número distinto cada vez, y los centavos que se descontaron ese
    día son un hecho.

    El motivo es obligatorio. Un descuento sin motivo es un agujero en la caja
    que nadie puede explicar tres días después.
  */
  const descontarItem = (item) => {
    const bruto = Number(item.precio_unitario || 0) * Number(item.cantidad || 0);
    const actual = Number(item.descuento_item || 0);

    const ingresado = window.prompt(
      `Descuento sobre "${item.nombre}"\nLa línea vale ${fmt(bruto)}.\n\n` +
        `Poné cuántos pesos descontar, o 0 para sacar el descuento:`,
      actual > 0 ? String(actual) : ''
    );
    if (ingresado === null) return;

    const monto = Math.max(0, Math.round(Number(String(ingresado).replace(/[^\d]/g, '') || 0)));
    if (monto > bruto) {
      toast.error(`El descuento no puede superar los ${fmt(bruto)} de la línea`);
      return;
    }

    let motivo = '';
    if (monto > 0) {
      motivo = String(
        window.prompt(
          '¿Por qué? (salió frío, cortesía, promoción…)',
          item.descuento_motivo || ''
        ) || ''
      ).trim();
      if (!motivo) {
        toast.error('Poné un motivo: después nadie se acuerda por qué se descontó');
        return;
      }
    }

    setItems((previous) =>
      previous.map((linea) =>
        linea.id === item.id
          ? { ...linea, descuento_item: monto, descuento_motivo: monto > 0 ? motivo : '' }
          : linea
      )
    );
    toast.success(monto > 0 ? `Descontados ${fmt(monto)}` : 'Descuento sacado');
  };

  const imprimirEnIframe = (html) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1200);
    }, 250);
  };

  const abrirImpresion = async (pedidoId, popup) => {
    try {
      const response = await api.post(`/pedidos/${pedidoId}/imprimir`, { tipo: 'tpv_pack' });
      if (popup) {
        popup.document.open();
        popup.document.write(response.html);
        popup.document.close();
      } else {
        imprimirEnIframe(response.html);
      }
      toast.success(
        tipoEntrega === 'delivery'
          ? 'Comanda, ticket y hoja de reparto listos'
          : 'Comanda y ticket listos para imprimir'
      );
    } catch (error) {
      if (popup) popup.close();
      toast.error(error?.error || 'No se pudieron generar los documentos');
    }
  };

  const reimprimirUltimaVenta = async () => {
    if (!lastSale?.id) {
      toast.error('Todavía no hay una venta reciente para reimprimir');
      return;
    }
    await abrirImpresion(lastSale.id);
  };

  const repetirUltimaVenta = () => {
    if (!lastSale?.pedido) {
      toast.error('Todavía no hay una venta reciente para repetir');
      return;
    }
    loadPedidoIntoCart(lastSale.pedido);
  };

  const repetirUltimoPedidoCliente = () => {
    const pedido = clienteResumen?.pedidos?.[0];
    if (!pedido) {
      toast.error('Este cliente no tiene pedidos para repetir');
      return;
    }
    loadPedidoIntoCart(pedido);
  };

  const repetirPedidoHistoricoCliente = (pedido) => {
    if (!pedido) {
      toast.error('No se encontró el pedido para repetir');
      return;
    }
    loadPedidoIntoCart(pedido);
  };

  const imprimirPrecuentaMesa = async () => {
    if (!String(mesa || '').trim()) {
      toast.error('Indica una mesa para imprimir la precuenta');
      return;
    }

    setPrintingMesa(true);
    try {
      const response = await api.post(
        `/pedidos/mesa/${encodeURIComponent(String(mesa).trim())}/precuenta`,
        {}
      );
      imprimirEnIframe(response.html);
      toast.success(`Precuenta lista para mesa ${mesa}`);
    } catch (error) {
      toast.error(error?.error || 'No se pudo generar la precuenta');
    } finally {
      setPrintingMesa(false);
    }
  };

  const confirmar = async (imprimir = false) => {
    if (loading) return;
    setLoading(true);

    const ventaSinConexion = typeof navigator !== 'undefined' && navigator.onLine === false;
    const cajaActual = ventaSinConexion ? cajaAbierta : await refreshCajaState({ silent: true });
    if (!cajaActual) {
      setLoading(false);
      toast.error('Debes abrir la caja antes de registrar ventas');
      navigate('/admin/caja');
      return;
    }

    const submitError = getTpvSubmitError({
      items,
      tipoEntrega,
      cliente,
      deliveryQuote,
      mesa,
      metodoPago: metodoPago === 'mixto' ? primaryMixedMethod : metodoPago,
      efectivoRecibido,
      efectivoRecibidoNumero,
      total,
      cashTarget: metodoPago === 'mixto' ? splitCashTarget : null,
      splitPayments: metodoPago === 'mixto' ? splitPaymentEntries : [],
    });
    if (submitError) {
      setLoading(false);
      return toast.error(submitError);
    }

    const metodoEnUso = metodoPago === 'mixto' ? primaryMixedMethod : metodoPago;
    if (ventaSinConexion && !['efectivo', 'transferencia'].includes(metodoEnUso)) {
      setLoading(false);
      return toast.error('Sin internet no se puede cobrar con tarjeta ni billetera digital');
    }

    const shouldAutoPrint = !ventaSinConexion && (imprimir || config.impresion_auto_tpv === '1');
    let popup = null;

    if (imprimir && !ventaSinConexion) {
      popup = window.open('', '_blank', 'width=900,height=700');
      if (!popup) {
        setLoading(false);
        return toast.error('Permiti las ventanas emergentes para imprimir');
      }
      popup.document.write(
        '<p style="font-family: Arial, sans-serif; padding: 24px;">Preparando impresion...</p>'
      );
      popup.document.close();
    }

    try {
      const payload = buildPedidoPayload({
        customer: cliente,
        items,
        summary,
        tipoEntrega,
        mesa,
        horaEntrega,
        metodoPago: metodoPago === 'mixto' ? primaryMixedMethod : metodoPago,
        notas,
        origen: 'tpv',
        repartidorId:
          tipoEntrega === 'delivery' && selectedRiderId ? Number(selectedRiderId) : undefined,
        /*
            Se manda cuántos puntos usar, nunca cuánta plata valen. El importe
            lo calcula el servidor con el valor configurado: si viniera de acá,
            alcanzaría con editarlo para llevarse el pedido gratis.
          */
        extra: {
          ...(puntosACanjear > 0 ? { puntos_a_canjear: puntosACanjear } : {}),
          ...(metodoPago === 'mixto'
            ? {
                pago_detalle: JSON.stringify({
                  tipo: 'mixto',
                  split_payments: splitPaymentEntries.map((item) => ({
                    metodo: item.method,
                    monto: Number(item.amount || 0),
                  })),
                  principal: primaryMixedMethod,
                }),
              }
            : {}),
        },
      });

      if (ventaSinConexion) {
        encolarPedidoOffline(payload);
        setPedidosOfflinePendientes(leerPedidosOffline().length);
        toast.success('Pedido guardado sin conexión. Se enviará al recuperar internet.', {
          duration: 5000,
        });
        limpiar();
        setCobroAbierto(false);
        return;
      }

      const pedido = await api.post('/pedidos/interno', payload);

      setLastSale({
        id: pedido.id,
        numero: pedido.numero,
        total: Number(pedido.total || total),
        tipoEntrega,
        cliente: cliente.nombre || cliente.telefono || '',
        metodoPago: metodoPago === 'mixto' ? 'mixto' : primaryMixedMethod,
        printed: shouldAutoPrint,
        pedido,
      });
      if (shouldAutoPrint) await abrirImpresion(pedido.id, popup);
      // Confirmación con el número y el total: son los dos datos que el
      // operador necesita si el cliente pregunta o si hay que reimprimir.
      // La tarjeta verde de "última venta" ya no ocupa lugar en la columna,
      // así que este toast es el que cierra el ciclo de la venta.
      toast.success(
        `Pedido #${pedido.numero} · ${Number(pedido.total || total).toLocaleString('es-AR', {
          style: 'currency',
          currency: 'ARS',
          maximumFractionDigits: 0,
        })}${shouldAutoPrint ? ' · impreso' : ''}`,
        { duration: 4000 }
      );
      cargarClientesDelDia();
      limpiar();
      setCobroAbierto(false);
    } catch (error) {
      if (popup) popup.close();
      if (
        String(error?.error || '')
          .toLowerCase()
          .includes('caja')
      ) {
        setCajaAbierta(false);
      }
      toast.error(error?.error || 'Error al crear pedido');
    } finally {
      setLoading(false);
    }
  };

  const pegarUbicacionCliente = async () => {
    let text = '';
    try {
      if (navigator.clipboard?.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch {
      // El navegador puede bloquear la lectura del portapapeles si el TPV
      // no esta enfocado. Caemos al prompt manual.
    }
    if (!text) {
      text = window.prompt(
        'Pegá el link de Google Maps que te mandó el cliente\n(o las coordenadas: -27.18, -65.48)',
        ''
      );
    }
    if (!text) return;

    const result = parseGpsInput(text);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setCliente((previous) => ({
      ...previous,
      latitud: result.lat,
      longitud: result.lng,
    }));
    if (result.warning) {
      toast(result.warning, { icon: '⚠', duration: 4000 });
    } else {
      toast.success('Ubicación del cliente cargada', { id: 'tpv-customer-location' });
    }
  };

  const compartirUbicacionCliente = () => {
    if (!navigator.geolocation) {
      toast.error('Este dispositivo no permite geolocalizacion');
      return;
    }

    if (customerLocationBusyRef.current) {
      return;
    }

    customerLocationBusyRef.current = true;
    const requestId = customerLocationRequestRef.current + 1;
    customerLocationRequestRef.current = requestId;
    setSharingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (customerLocationRequestRef.current !== requestId) return;
        setCliente((previous) => ({
          ...previous,
          latitud: position.coords.latitude,
          longitud: position.coords.longitude,
        }));
        customerLocationBusyRef.current = false;
        setSharingLocation(false);
        toast.success('Ubicacion guardada', { id: 'tpv-customer-location' });
      },
      (error) => {
        if (customerLocationRequestRef.current !== requestId) return;
        customerLocationBusyRef.current = false;
        setSharingLocation(false);
        const denied = error?.code === 1;
        toast.error(
          denied ? 'El navegador bloqueo la ubicacion' : 'No se pudo obtener la ubicacion',
          { id: 'tpv-customer-location' }
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  keyboardActionsRef.current = {
    confirmar,
    volverAlPanel,
    saveCurrentAsParked,
    restoreParkedOrder,
    repetirUltimoPedidoCliente,
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();

      if (event.key === 'Escape') {
        if (variantModal) {
          event.preventDefault();
          setVariantModal(null);
          return;
        }
        if (clientePickerOpen) {
          event.preventDefault();
          setClientePickerOpen(false);
          return;
        }
        if (document.fullscreenElement) {
          event.preventDefault();
          document.exitFullscreen().catch(() => {});
        }
        return;
      }

      if (isEditableTarget(event.target)) return;

      if (event.key === '/') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === 'F9') {
        event.preventDefault();
        toggleBrowserFullscreen();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        keyboardActionsRef.current.confirmar(Boolean(event.shiftKey));
        return;
      }

      if (event.altKey && key === 'p') {
        event.preventDefault();
        keyboardActionsRef.current.volverAlPanel();
        return;
      }

      if (event.altKey && ['1', '2', '3'].includes(event.key)) {
        event.preventDefault();
        setTipoEntrega(event.key === '1' ? 'retiro' : event.key === '2' ? 'delivery' : 'mesa');
        return;
      }

      if (event.altKey && key === 'g') {
        event.preventDefault();
        keyboardActionsRef.current.saveCurrentAsParked();
        return;
      }

      if (event.altKey && key === 'r') {
        event.preventDefault();
        if (parkedOrders[0]?.id) {
          keyboardActionsRef.current.restoreParkedOrder(parkedOrders[0].id);
        } else toast.error('No hay pedidos en espera para recuperar');
        return;
      }

      if (event.altKey && key === 'h') {
        event.preventDefault();
        keyboardActionsRef.current.repetirUltimoPedidoCliente();
        return;
      }

      if (event.altKey) {
        const paymentMap = {
          e: 'efectivo',
          m: 'mercadopago',
          t: 'transferencia',
          o: 'modo',
          u: 'uala',
          x: 'mixto',
        };
        if (paymentMap[key]) {
          event.preventDefault();
          setMetodoPago(paymentMap[key]);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    variantModal,
    clientePickerOpen,
    cliente,
    config,
    deliveryQuote,
    efectivoRecibidoNumero,
    items,
    mesa,
    metodoPago,
    parkedOrders,
    total,
    clienteResumen,
  ]);

  return (
    <div className="flex h-[100dvh] min-h-0 font-sans text-gray-900" style={{ background: TPV_BG }}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TpvHeader
          cajaAbierta={cajaAbierta}
          isBrowserFullscreen={isBrowserFullscreen}
          negocioLogo={resolveAssetUrl(config?.negocio_logo || DEFAULT_BRAND_LOGO)}
          negocioNombre={config?.negocio_nombre || 'Modo Sabor'}
          onBack={volverAlPanel}
          onGoCaja={() => navigate('/admin/caja')}
          onToggleFullscreen={toggleBrowserFullscreen}
          turnoLabel={formatTurnoLabel(cajaEstado?.turno_operativo?.shiftName)}
        />

        {sinConexion || pedidosOfflinePendientes > 0 ? (
          <div
            role="status"
            className={`mx-5 mb-1 flex shrink-0 items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-[13px] ${
              sinConexion ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'
            }`}
          >
            <p className="font-medium">
              {sinConexion
                ? `Sin conexión. ${pedidosOfflinePendientes} pedido${
                    pedidosOfflinePendientes === 1 ? '' : 's'
                  } esperando para enviar.`
                : `${pedidosOfflinePendientes} pedido${
                    pedidosOfflinePendientes === 1 ? '' : 's'
                  } esperando para enviar.`}
            </p>
            {!sinConexion ? (
              <button
                type="button"
                onClick={() => sincronizarColaOffline().catch(() => {})}
                disabled={sincronizandoOffline}
                className="shrink-0 rounded-lg bg-sky-700 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-sky-800 disabled:cursor-wait disabled:opacity-60"
              >
                {sincronizandoOffline ? 'Enviando...' : 'Reintentar ahora'}
              </button>
            ) : null}
          </div>
        ) : null}

        {/*
          Acá vivía una barra de chips que repetía tipo de entrega, items,
          total, turno, bloqueos, rider y horario. Todo eso ya está en el
          header o en la columna de venta, así que la barra sólo gastaba
          alto de pantalla y obligaba a leer el mismo dato dos veces.
        */}

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <TpvCatalog
            busqueda={busqueda}
            cajaAbierta={cajaAbierta}
            cartQtyByProductId={cartQtyByProductId}
            cartLinesByProductId={cartLinesByProductId}
            catActiva={catActiva}
            categorias={categorias}
            conteoPorCategoria={conteoPorCategoria}
            totalProductos={productos.length}
            cargando={cargandoCatalogo}
            onAddItem={agregarItem}
            onAddItemWithOptions={(producto) => agregarItem(producto, { forceOptions: true })}
            onRestarItem={restarDesdeCatalogo}
            onBusquedaChange={setBusqueda}
            onCatActivaChange={setCatActiva}
            onGoCaja={() => navigate('/admin/caja')}
            onOpenCart={() => setCartMobileOpen(true)}
            productosFiltrados={productosFiltrados}
            searchInputRef={searchInputRef}
            total={total}
            totalItems={totalItems}
          />
          <TpvSidebar
            cartItemsRef={cartItemsRef}
            cartMobileOpen={cartMobileOpen}
            cajaAbierta={cajaAbierta}
            cliente={cliente}
            confirmDisabled={!cajaAbierta || items.length === 0}
            blockedReason={
              !cajaAbierta
                ? 'La caja está cerrada. Abrí el turno para vender.'
                : items.length === 0
                  ? 'Cargá al menos un producto.'
                  : null
            }
            deliveryQuote={deliveryQuote}
            barriosConocidos={barriosConocidos}
            descuento={descuento}
            descuentoAplicado={descuentoAplicado}
            descuentoTipo={descuentoTipo}
            envio={envio}
            horaEntrega={horaEntrega}
            items={items}
            lastAddedId={lastAddedId}
            mesa={mesa}
            notas={notas}
            onAbrirSelectorClientes={abrirSelectorClientes}
            onCambiarCantidad={cambiarCantidad}
            onCanjearRecompensa={canjearRecompensaCliente}
            onCerrarCartMobile={() => setCartMobileOpen(false)}
            onClearCliente={() => setCliente(createEmptyCustomer())}
            onClearOrder={() => {
              if (
                items.length > 0 &&
                !window.confirm(
                  `¿Vaciar el pedido? Se van a perder los ${totalItems} item${
                    totalItems === 1 ? '' : 's'
                  } cargados.`
                )
              ) {
                return;
              }
              limpiar();
              setCartMobileOpen(false);
            }}
            onAbrirCobro={() => setCobroAbierto(true)}
            onDescuentoChange={setDescuento}
            onDescuentoTipoChange={setDescuentoTipo}
            onHoraEntregaChange={setHoraEntrega}
            programarHora={programarHora}
            onToggleProgramarHora={toggleProgramarHora}
            onImprimirMesa={imprimirPrecuentaMesa}
            onNotasChange={setNotas}
            onParkCurrent={saveCurrentAsParked}
            onParkedLabelChange={setParkedLabel}
            onRestoreParked={restoreParkedOrder}
            parkedLabel={parkedLabel}
            onDuplicateParked={duplicateParkedOrder}
            onQuitarItem={quitarItem}
            onDescontarItem={descontarItem}
            onReprintLastSale={reimprimirUltimaVenta}
            onRepeatClientePedido={repetirUltimoPedidoCliente}
            onSeleccionarRider={setSelectedRiderId}
            onSetCliente={setCliente}
            onSetMesa={setMesa}
            onTipoEntregaChange={setTipoEntrega}
            onUbicacionCliente={compartirUbicacionCliente}
            onPegarUbicacionCliente={pegarUbicacionCliente}
            parkedOrders={parkedOrders}
            printingMesa={printingMesa}
            repartidoresActivos={repartidoresActivos}
            repartidoresDisponibles={repartidoresDisponibles}
            selectedRiderId={selectedRiderId}
            sharingLocation={sharingLocation}
            subtotal={subtotal}
            tipoEntrega={tipoEntrega}
            total={total}
            totalItems={totalItems}
            lastSale={lastSale}
            onDeleteParked={deleteParkedOrder}
            clienteResumen={clienteResumen}
            clientesDelDia={clientesDelDia}
            onRepeatPedidoHistorico={repetirPedidoHistoricoCliente}
            onRepeatLastSale={repetirUltimaVenta}
            onOpenPedidos={() => navigate('/admin/pedidos')}
            onQuickPickCliente={aplicarCliente}
          />
        </div>
      </div>
      <TpvPaymentModal
        open={cobroAbierto}
        onClose={() => setCobroAbierto(false)}
        total={total}
        subtotal={subtotal}
        envio={envio}
        descuentoAplicado={descuentoAplicado}
        descuentoDePuntos={descuentoDePuntos}
        canje={canje}
        puntosACanjear={puntosACanjear}
        onPuntosChange={setPuntosACanjear}
        deliveryQuote={deliveryQuote}
        pagos={TPV_PAYMENT_OPTIONS}
        metodoPago={metodoPago}
        onMetodoPagoChange={setMetodoPago}
        efectivoRecibido={efectivoRecibido}
        onEfectivoRecibidoChange={setEfectivoRecibido}
        vuelto={vuelto}
        splitPayments={splitPayments}
        splitRemaining={splitRemaining}
        splitCashTarget={splitCashTarget}
        onSplitPaymentChange={(method, value) =>
          setSplitPayments((previous) => ({ ...previous, [method]: value }))
        }
        confirmDisabled={confirmDisabled}
        blockedReason={blockedReason}
        loading={loading}
        onConfirm={(imprimir) => confirmar(Boolean(imprimir))}
      />

      {clientePickerOpen ? (
        <TpvClientPickerModal
          clientesCatalogo={clientesCatalogo}
          loadingClientesCatalogo={loadingClientesCatalogo}
          onApplyCliente={aplicarCliente}
          onCrearCliente={crearClienteDesdeElTpv}
          onClose={() => setClientePickerOpen(false)}
          onSearchChange={setClientePickerSearch}
          search={clientePickerSearch}
        />
      ) : null}

      {/* ── Modal de variantes / extras ── */}
      {variantModal ? (
        <TpvVariantModal
          onAddToCart={() =>
            addToCart(
              variantModal.producto,
              variantModal.sel,
              variantModal.extrasSel,
              variantModal.variantes,
              { ...(variantModal.rewardOptions || {}), notas: variantModal.notas }
            )
          }
          onClose={() => setVariantModal(null)}
          onSelectVariant={seleccionarVariante}
          onToggleExtra={toggleExtraVariante}
          notas={variantModal.notas}
          onNotasChange={actualizarNotasVariante}
          selectedVariantTotal={selectedVariantTotal}
          variantesCompletas={variantesCompletas}
          variantModal={variantModal}
        />
      ) : null}
    </div>
  );
}
