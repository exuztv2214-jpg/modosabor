import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import api from '../lib/api.js';
import {
  buildPedidoPayload,
  calculatePedidoSummary,
  createDeliveryQuoteState,
  createEmptyCustomer,
  getTpvSubmitError,
  normalizeText,
  safeParseArray,
} from '../lib/pedidoForm.js';
import TpvCatalog from '../components/TPV/TpvCatalog.jsx';
import TpvClientPickerModal from '../components/TPV/TpvClientPickerModal.jsx';
import TpvHeader from '../components/TPV/TpvHeader.jsx';
import TpvSidebar from '../components/TPV/TpvSidebar.jsx';
import TpvVariantModal from '../components/TPV/TpvVariantModal.jsx';

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
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
  const parkedHydratedRef = useRef(false);

  const [config, setConfig] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [cajaEstado, setCajaEstado] = useState(null);
  const [catActiva, setCatActiva] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState([]);
  const [tipoEntrega, setTipoEntrega] = useState('retiro');
  const [mesa, setMesa] = useState('');
  const [horaEntrega, setHoraEntrega] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [descuentoTipo, setDescuentoTipo] = useState('monto');
  const [cliente, setCliente] = useState(createEmptyCustomer);
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

  const refreshCajaState = useCallback(async ({ silent = true } = {}) => {
    try {
      const caja = await api.get('/caja/estado');
      setCajaEstado(caja || null);
      const abierta = Boolean(caja?.activa);
      setCajaAbierta(abierta);
      return abierta;
    } catch (error) {
      if (!silent) {
        toast.error(error?.error || 'No se pudo verificar la caja');
      }
      return null;
    }
  }, []);

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

  useEffect(() => {
    if (cartItemsRef.current && items.length > 0) {
      cartItemsRef.current.scrollTo({
        top: cartItemsRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [items.length]);

  useEffect(() => {
    Promise.all([
      api.get('/categorias'),
      api.get('/productos?activo=1'),
      api.get('/configuracion'),
      api.get('/repartidores').catch(() => []),
      api.get('/caja/estado').catch(() => null),
      api.get('/fidelizacion/config').catch(() => null),
    ])
      .then(([cats, prods, conf, reps, caja, fidelizacion]) => {
        setConfig(conf);
        setCategorias(cats.filter((item) => item.activo));
        setProductos(prods);
        setRepartidores(reps.filter((item) => item.activo));
        setCajaEstado(caja || null);
        setCajaAbierta(Boolean(caja?.activa));
        setLoyaltyConfig(fidelizacion || null);
      })
      .catch((error) => toast.error(error?.error || 'No se pudo cargar el TPV'));
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
    let cancelled = false;
    api
      .get('/tpv/espera')
      .then((serverOrders) => {
        if (cancelled) return;
        if (Array.isArray(serverOrders) && serverOrders.length > 0) {
          setParkedOrders(serverOrders);
        }
      })
      .catch(() => {
        // Sin conexion o sin permiso: seguimos con lo que haya en este dispositivo
      })
      .finally(() => {
        if (!cancelled) parkedHydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TPV_PARKED_KEY, JSON.stringify(parkedOrders.slice(0, 12)));
    if (!parkedHydratedRef.current) return;
    api.put('/tpv/espera', { orders: parkedOrders.slice(0, 12) }).catch(() => {
      // Si falla la sincronizacion, el pedido en espera igual queda guardado
      // en este dispositivo y se reintenta en el proximo cambio.
    });
  }, [parkedOrders]);

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
    if (tipoEntrega === 'mesa') {
      setHoraEntrega('');
      return;
    }
    setHoraEntrega((previous) => previous || buildSuggestedHoraEntrega(tipoEntrega, config));
  }, [tipoEntrega, config]);

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
  }, [
    tipoEntrega,
    cliente.direccion,
    config.costo_envio_base,
    config.tiempo_delivery,
    config.tiempo_retiro,
  ]);

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

  const summary = useMemo(
    () =>
      calculatePedidoSummary({
        items,
        tipoEntrega,
        deliveryQuote,
        descuento,
        descuentoTipo,
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
      metodoPago,
      efectivoRecibido,
      splitCashTarget,
    ]
  );
  const { subtotal, envio, descuentoAplicado, total, totalItems, efectivoRecibidoNumero, vuelto } =
    summary;
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
  const variantesCompletas =
    !variantModal ||
    variantModal.variantes.every((group) => Boolean(variantModal.sel[group.nombre]));
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
          key: 'hora',
          label: 'Horario',
          status: horaEntrega ? 'ok' : 'warn',
          detail: horaEntrega || 'Sin horario cargado',
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

    if (metodoPago === 'mixto') {
      checks.push({
        key: 'pago',
        label: 'Pago',
        status: splitPaymentEntries.length > 0 && Math.abs(splitRemaining) <= 0.5 ? 'ok' : 'block',
        detail:
          splitPaymentEntries.length > 0 && Math.abs(splitRemaining) <= 0.5
            ? 'Cobro mixto completo'
            : `Faltan ${Math.abs(splitRemaining).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })}`,
      });
    } else {
      checks.push({
        key: 'pago',
        label: 'Pago',
        status: 'ok',
        detail: metodoPago,
      });
    }

    if (tipoEntrega === 'retiro') {
      checks.push({
        key: 'hora',
        label: 'Horario',
        status: horaEntrega ? 'ok' : 'warn',
        detail: horaEntrega || 'Sin horario cargado',
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
    selectedRider,
    repartidoresActivos,
    mesa,
    metodoPago,
    splitPaymentEntries,
    splitRemaining,
  ]);
  const preflightBlockingCount = preflightChecklist.filter(
    (item) => item.status === 'block'
  ).length;
  const confirmDisabled =
    !cajaAbierta ||
    loading ||
    items.length === 0 ||
    (tipoEntrega === 'delivery' && (deliveryQuote.pending || !deliveryQuote.available)) ||
    preflightBlockingCount > 0;

  const limpiar = () => {
    setItems([]);
    setCliente(createEmptyCustomer());
    setClientePickerOpen(false);
    setClientePickerSearch('');
    setClientesCatalogo([]);
    setDescuento(0);
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
    setHoraEntrega(tipoEntrega === 'mesa' ? '' : buildSuggestedHoraEntrega(tipoEntrega, config));
    setSelectedRiderId('');
    setDeliveryQuote(createDeliveryQuoteState({ tipoEntrega, config }));
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
  };

  const restoreParkedOrder = (parkedId) => {
    const target = parkedOrders.find((item) => item.id === parkedId);
    if (!target?.snapshot) return;
    const snapshot = target.snapshot;
    setItems(snapshot.items || []);
    setTipoEntrega(snapshot.tipoEntrega || 'retiro');
    setMesa(snapshot.mesa || '');
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
    toast.success('Pedido recuperado desde espera');
  };

  const deleteParkedOrder = (parkedId) => {
    setParkedOrders((previous) => previous.filter((item) => item.id !== parkedId));
    toast.success('Pedido en espera eliminado');
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
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {}
    }
    navigate('/admin/dashboard');
  };

  const addToCart = (producto, variantes, extras, variantGroups = [], options = {}) => {
    playBeep();
    const cartKey = `${buildCartKey(variantes, extras)}::${options.cartKeySuffix || 'normal'}`;
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
      const newId = `${producto.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setItems((previous) => [
        ...previous,
        {
          id: newId,
          producto_id: producto.id,
          nombre: producto.nombre,
          precio_unitario: precioUnitario,
          cantidad: 1,
          variantes,
          extras,
          cartKey,
          descripcion: [descripcionReward, descripcionVariantes, descripcionExtras]
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
      id: `${item.producto_id || item.id || 'pedido'}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      producto_id: item.producto_id || item.id || null,
      nombre: item.nombre || 'Producto',
      precio_unitario: Number(item.precio_unitario || item.precio || 0),
      cantidad: Number(item.cantidad || 1),
      variantes: item.variantes || {},
      extras: Array.isArray(item.extras) ? item.extras : [],
      cartKey: `${buildCartKey(item.variantes || {}, Array.isArray(item.extras) ? item.extras : [])}::repeat-${pedido.id}-${Math.random().toString(16).slice(2, 5)}`,
      descripcion: item.descripcion || '',
    }));

    setItems(nextItems);
    setTipoEntrega(pedido.tipo_entrega || 'retiro');
    setMesa(pedido.mesa || '');
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
    // frenar la venta rápida; el extra se puede sumar aparte con "+ opciones".
    if (variantes.length > 0 || (forceOptions && extras.length > 0)) {
      setVariantModal({ producto, variantes, extras, sel: {}, extrasSel: [] });
      return;
    }

    addToCart(producto, {}, []);
  };

  const seleccionarVariante = (groupName, option) => {
    setVariantModal((previous) => ({
      ...previous,
      sel: {
        ...previous.sel,
        [groupName]: typeof option === 'string' ? { nombre: option } : option,
      },
    }));
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

    const cajaActual = await refreshCajaState({ silent: true });
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

    const shouldAutoPrint = imprimir || config.impresion_auto_tpv === '1';
    let popup = null;

    if (imprimir) {
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
      const pedido = await api.post(
        '/pedidos/interno',
        buildPedidoPayload({
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
          extra:
            metodoPago === 'mixto'
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
              : {},
        })
      );

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
      toast.success(shouldAutoPrint ? 'Pedido creado e impreso' : 'Pedido creado');
      cargarClientesDelDia();
      limpiar();
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
        confirmar(Boolean(event.shiftKey));
        return;
      }

      if (event.altKey && key === 'p') {
        event.preventDefault();
        volverAlPanel();
        return;
      }

      if (event.altKey && ['1', '2', '3'].includes(event.key)) {
        event.preventDefault();
        setTipoEntrega(event.key === '1' ? 'retiro' : event.key === '2' ? 'delivery' : 'mesa');
        return;
      }

      if (event.altKey && key === 'g') {
        event.preventDefault();
        saveCurrentAsParked();
        return;
      }

      if (event.altKey && key === 'r') {
        event.preventDefault();
        if (parkedOrders[0]?.id) restoreParkedOrder(parkedOrders[0].id);
        else toast.error('No hay pedidos en espera para recuperar');
        return;
      }

      if (event.altKey && key === 'h') {
        event.preventDefault();
        repetirUltimoPedidoCliente();
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
    <div className="flex h-[100dvh] min-h-0 bg-background text-gray-900 font-sans">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* ── Header Estilo Modernize ── */}
        <TpvHeader
          cajaAbierta={cajaAbierta}
          isBrowserFullscreen={isBrowserFullscreen}
          onBack={volverAlPanel}
          onGoCaja={() => navigate('/admin/caja')}
          onToggleFullscreen={toggleBrowserFullscreen}
        />

        <div className="border-b border-gray-100 bg-white px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
              {formatEntregaLabel(tipoEntrega)}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
              {totalItems} item{totalItems === 1 ? '' : 's'}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
              {Number(total || 0).toLocaleString('es-AR', {
                style: 'currency',
                currency: 'ARS',
                maximumFractionDigits: 0,
              })}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
              Turno {cajaEstado?.turno_operativo?.shiftName || 'sin turno'}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${preflightBlockingCount > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}
            >
              {preflightBlockingCount > 0
                ? `${preflightBlockingCount} bloqueo${preflightBlockingCount === 1 ? '' : 's'}`
                : 'Listo para vender'}
            </span>
            {tipoEntrega === 'delivery' ? (
              <span className="rounded-full bg-sky-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-sky-700">
                Rider {selectedRider?.nombre || repartidoresActivos[0]?.nombre || 'sin fijar'}
              </span>
            ) : null}
            {tipoEntrega !== 'mesa' && horaEntrega ? (
              <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">
                Entrega {horaEntrega}
              </span>
            ) : null}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <TpvCatalog
            busqueda={busqueda}
            cajaAbierta={cajaAbierta}
            cartQtyByProductId={cartQtyByProductId}
            catActiva={catActiva}
            categorias={categorias}
            onAddItem={agregarItem}
            onAddItemWithOptions={(producto) => agregarItem(producto, { forceOptions: true })}
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
            confirmDisabled={confirmDisabled}
            config={config}
            deliveryQuote={deliveryQuote}
            descuento={descuento}
            descuentoAplicado={descuentoAplicado}
            descuentoTipo={descuentoTipo}
            efectivoRecibido={efectivoRecibido}
            envio={envio}
            horaEntrega={horaEntrega}
            items={items}
            lastAddedId={lastAddedId}
            loading={loading}
            mesa={mesa}
            metodoPago={metodoPago}
            notas={notas}
            onAbrirSelectorClientes={abrirSelectorClientes}
            onCambiarCantidad={cambiarCantidad}
            onCanjearRecompensa={canjearRecompensaCliente}
            onCerrarCartMobile={() => setCartMobileOpen(false)}
            onClearCliente={() => setCliente(createEmptyCustomer())}
            onClearOrder={() => {
              limpiar();
              setCartMobileOpen(false);
            }}
            onConfirm={() => confirmar(false)}
            onConfirmPrint={() => confirmar(true)}
            onDescuentoChange={setDescuento}
            onDescuentoTipoChange={setDescuentoTipo}
            onEfectivoRecibidoChange={setEfectivoRecibido}
            onHoraEntregaChange={setHoraEntrega}
            onImprimirMesa={imprimirPrecuentaMesa}
            onMetodoPagoChange={setMetodoPago}
            onNotasChange={setNotas}
            onParkCurrent={saveCurrentAsParked}
            onParkedLabelChange={setParkedLabel}
            onRestoreParked={restoreParkedOrder}
            parkedLabel={parkedLabel}
            onDuplicateParked={duplicateParkedOrder}
            onQuitarItem={quitarItem}
            onReprintLastSale={reimprimirUltimaVenta}
            onRepeatClientePedido={repetirUltimoPedidoCliente}
            onSeleccionarRider={setSelectedRiderId}
            onSetCliente={setCliente}
            onSetMesa={setMesa}
            onSplitPaymentChange={(method, value) =>
              setSplitPayments((previous) => ({ ...previous, [method]: value }))
            }
            onTipoEntregaChange={setTipoEntrega}
            onUbicacionCliente={compartirUbicacionCliente}
            parkedOrders={parkedOrders}
            pagos={TPV_PAYMENT_OPTIONS}
            printingMesa={printingMesa}
            preflightChecklist={preflightChecklist}
            repartidoresActivos={repartidoresActivos}
            repartidoresDisponibles={repartidoresDisponibles}
            selectedRiderId={selectedRiderId}
            sharingLocation={sharingLocation}
            splitPayments={splitPayments}
            splitRemaining={splitRemaining}
            splitCashTarget={splitCashTarget}
            subtotal={subtotal}
            tipoEntrega={tipoEntrega}
            total={total}
            totalItems={totalItems}
            vuelto={vuelto}
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
      {clientePickerOpen ? (
        <TpvClientPickerModal
          clientesCatalogo={clientesCatalogo}
          loadingClientesCatalogo={loadingClientesCatalogo}
          onApplyCliente={aplicarCliente}
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
              variantModal.rewardOptions || {}
            )
          }
          onClose={() => setVariantModal(null)}
          onSelectVariant={seleccionarVariante}
          onToggleExtra={toggleExtraVariante}
          selectedVariantTotal={selectedVariantTotal}
          variantesCompletas={variantesCompletas}
          variantModal={variantModal}
        />
      ) : null}
    </div>
  );
}
