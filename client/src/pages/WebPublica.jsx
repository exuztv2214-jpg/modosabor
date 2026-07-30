import { useEffect, useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  ShoppingCart,
  Share2,
  ChefHat,
  Bike,
  TicketPercent,
  ShieldCheck,
  Clock,
  MessageCircle,
  Search,
  CheckCircle,
} from 'lucide-react';

import api from '../lib/api.js';
import { resolveAssetUrl } from '../lib/assets.js';
import { isPagoPagado } from '../lib/paymentStatus.js';
import { buildPublicAppUrl } from '../lib/publicUrls.js';
import {
  buildPedidoPayload,
  calculatePedidoSummary,
  createDeliveryQuoteState,
  normalizeText,
  safeParseArray,
} from '../lib/pedidoForm.js';
import {
  DEFAULT_BRAND_LOGO,
  fmt,
  isEnabled,
  isEnabledDefault,
  isActiveByDate,
  getProximaAperturaText,
  buildWhatsAppUrl,
  isMenuDelDiaProduct,
  isVisibleOnPublicMenu,
  useInitialFormState,
  getInitialCart,
  getPublicBrandTheme,
} from '../lib/webPublicaHelpers.js';
import HeroSection from '../components/WebPublica/HeroSection.jsx';
import HighlightsGrid from '../components/WebPublica/HighlightsGrid.jsx';
import PromoSection from '../components/WebPublica/PromoSection.jsx';
import TrustSection from '../components/WebPublica/TrustSection.jsx';
import MenuNav from '../components/WebPublica/MenuNav.jsx';
import MenuSection from '../components/WebPublica/MenuSection.jsx';
import Footer from '../components/WebPublica/Footer.jsx';
import FloatingCart from '../components/WebPublica/FloatingCart.jsx';
import WhatsAppFloat from '../components/WebPublica/WhatsAppFloat.jsx';
import ScrollTop from '../components/WebPublica/ScrollTop.jsx';
import PopupModal from '../components/WebPublica/PopupModal.jsx';
import CartDrawer from '../components/WebPublica/CartDrawer.jsx';
import VariantModal from '../components/WebPublica/VariantModal.jsx';
import ProductDetailModal from '../components/WebPublica/ProductDetailModal.jsx';
import OrderConfirmation from '../components/WebPublica/OrderConfirmation.jsx';
import LoadingState from '../components/WebPublica/LoadingState.jsx';
import ErrorState from '../components/WebPublica/ErrorState.jsx';

export default function WebPublica() {
  const [config, setConfig] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [badgePop, setBadgePop] = useState(0);
  const [catActiva, setCatActiva] = useState(null);
  const [carrito, setCarrito] = useState(getInitialCart);
  const [carritoOpen, setCarritoOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [confirmado, setConfirmado] = useState(null);
  const [form, setForm] = useState(useInitialFormState);
  const [variantModal, setVariantModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState(() =>
    createDeliveryQuoteState({
      tipoEntrega: 'delivery',
      overrides: { available: true, message: '' },
    })
  );
  const [cupon, setCupon] = useState({ codigo: '', aplicado: null, loading: false, error: '' });
  const [popupVisible, setPopupVisible] = useState(false);
  const [customerGeo, setCustomerGeo] = useState({
    latitud: null,
    longitud: null,
    loading: false,
    ready: false,
  });
  const [busqueda, setBusqueda] = useState('');
  const [quickFilter, setQuickFilter] = useState('all');
  const [detalleModal, setDetalleModal] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    setCargando(true);
    setErrorCarga(false);
    Promise.all([
      api.get('/configuracion').catch(() => null),
      api.get('/categorias').catch(() => null),
      api.get('/productos').catch(() => null),
    ])
      .then(([conf, cats, prods]) => {
        if (conf === null && cats === null && prods === null) {
          setErrorCarga(true);
          return;
        }
        setConfig(conf || {});
        setCategorias(Array.isArray(cats) ? cats.filter((c) => c.activo) : []);
        setProductos(Array.isArray(prods) ? prods.filter((p) => p.activo) : []);
      })
      .catch(() => setErrorCarga(true))
      .finally(() => setCargando(false));
  }, [retryCount]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pedidoId = params.get('pedido_id');
    const mpStatus = params.get('mp');

    if (!pedidoId || !mpStatus) {
      try {
        const rawBackup = localStorage.getItem('ms_carrito_mp_backup');
        if (rawBackup) {
          const backup = JSON.parse(rawBackup);
          localStorage.removeItem('ms_carrito_mp_backup');
          if (Array.isArray(backup) && backup.length > 0) {
            setCarrito((prev) => (prev.length === 0 ? backup : prev));
            setTimeout(() => toast('Recuperamos tu carrito anterior', { icon: '🛒' }), 600);
          }
        }
      } catch {
        /* noop */
      }
      return;
    }

    api
      .get(`/pedidos/${pedidoId}/pago/mercadopago`)
      .then((pedido) => {
        setConfirmado({ ...pedido, _tiempoEstimado: 0 });
        if (isPagoPagado(pedido.pago_estado)) {
          toast.success('Pago confirmado');
          localStorage.removeItem('ms_carrito_mp_backup');
        }
      })
      .catch(() => toast.error('No se pudo verificar el pago'))
      .finally(() => {
        window.history.replaceState({}, '', '/');
      });
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('ms_carrito', JSON.stringify(carrito));
    } catch {
      /* noop */
    }
  }, [carrito]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'ms_form',
        JSON.stringify({
          nombre: form.nombre,
          telefono: form.telefono,
          direccion: form.direccion,
          tipo_entrega: form.tipo_entrega,
          metodo_pago: form.metodo_pago,
        })
      );
    } catch {
      /* noop */
    }
  }, [form.nombre, form.telefono, form.direccion, form.tipo_entrega, form.metodo_pago]);

  useEffect(() => {
    if (!config?.negocio_nombre) return;
    const nombre = config.negocio_nombre;
    const title = `${nombre} | Carta online`;
    const desc = config.negocio_descripcion
      ? String(config.negocio_descripcion).slice(0, 160)
      : `Pedí online en ${nombre}. Mirá nuestro menú completo, delivery y retiro.`;

    const setMeta = (prop, content, attr = 'name') => {
      let el = document.querySelector(`meta[${attr}="${prop}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, prop);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    document.title = title;
    setMeta('description', desc);
    setMeta('og:type', 'website', 'property');
    setMeta('og:title', title, 'property');
    setMeta('og:description', desc, 'property');
    setMeta('og:url', window.location.href, 'property');
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', desc);
    const socialImage = resolveAssetUrl(
      config.web_hero_imagen || config.negocio_logo || DEFAULT_BRAND_LOGO
    );
    if (socialImage) {
      setMeta('og:image', socialImage, 'property');
      setMeta('twitter:image', socialImage);
    }
  }, [
    config?.negocio_nombre,
    config?.negocio_descripcion,
    config?.negocio_logo,
    config?.web_hero_imagen,
  ]);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!document.getElementById('ms-badge-kf')) {
      const s = document.createElement('style');
      s.id = 'ms-badge-kf';
      s.textContent =
        '@keyframes ms-badge-pop{0%{transform:scale(1)}35%{transform:scale(1.65)}65%{transform:scale(0.88)}100%{transform:scale(1)}}';
      document.head.appendChild(s);
    }
  }, []);

  useEffect(() => {
    const deliveryOk = isEnabledDefault(config.delivery_activo, true);
    const retiroOk = isEnabledDefault(config.retiro_activo, true);
    if (!deliveryOk && form.tipo_entrega === 'delivery' && retiroOk) {
      setForm((prev) => ({ ...prev, tipo_entrega: 'retiro' }));
    } else if (!retiroOk && form.tipo_entrega === 'retiro' && deliveryOk) {
      setForm((prev) => ({ ...prev, tipo_entrega: 'delivery' }));
    }
  }, [config.delivery_activo, config.retiro_activo, form.tipo_entrega]);

  useEffect(() => {
    if (form.tipo_entrega !== 'delivery') {
      setDeliveryQuote(
        createDeliveryQuoteState({
          tipoEntrega: form.tipo_entrega,
          config,
          overrides: { available: true, message: '' },
        })
      );
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const quote = await api.post('/configuracion/delivery/cotizar', {
          direccion: form.direccion || '',
        });
        setDeliveryQuote({
          ...createDeliveryQuoteState({
            tipoEntrega: 'delivery',
            config,
            overrides: { available: true, message: '' },
          }),
          ...(quote || {}),
        });
      } catch {
        setDeliveryQuote(
          createDeliveryQuoteState({
            tipoEntrega: 'delivery',
            config,
            overrides: { available: true, message: '' },
          })
        );
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.direccion, form.tipo_entrega, config]);

  useEffect(() => {
    if (catActiva || busqueda) {
      setQuickFilter('all');
    }
  }, [catActiva, busqueda]);

  const productosFiltrados = useMemo(() => {
    if (!Array.isArray(productos)) return [];
    const needle = normalizeText(busqueda);
    return productos.filter((p) => {
      if (!isVisibleOnPublicMenu(p)) return false;
      if (catActiva && p.categoria_id !== catActiva) return false;
      if (quickFilter === 'destacados' && Number(p.destacado) !== 1) return false;
      if (quickFilter === 'menu-dia' && !isMenuDelDiaProduct(p)) return false;
      if (quickFilter === 'rapidos' && Number(p.tiempo_preparacion || 0) > 20) return false;
      if (quickFilter === 'sin-variantes') {
        const variantes = safeParseArray(p.variantes);
        const extras = safeParseArray(p.extras);
        if (variantes.length > 0 || extras.length > 0) return false;
      }
      if (needle) {
        const enNombre = normalizeText(p.nombre || '').includes(needle);
        const enDesc = normalizeText(p.descripcion || '').includes(needle);
        if (!enNombre && !enDesc) return false;
      }
      return true;
    });
  }, [productos, catActiva, busqueda, quickFilter]);

  const summary = useMemo(
    () =>
      calculatePedidoSummary({
        items: carrito,
        tipoEntrega: form.tipo_entrega,
        deliveryQuote,
        descuentoFijo: cupon.aplicado?.monto_descuento || 0,
      }),
    [carrito, form.tipo_entrega, deliveryQuote, cupon.aplicado?.monto_descuento]
  );
  const { totalItems, subtotal, total } = summary;
  const theme = useMemo(() => getPublicBrandTheme(config), [config]);
  const colorPrimario = theme.primary;
  const deliveryActivo = isEnabledDefault(config.delivery_activo, true);
  const retiroActivo = isEnabledDefault(config.retiro_activo, true);
  const tiposEntregaDisponibles = [
    ...(deliveryActivo ? ['delivery'] : []),
    ...(retiroActivo ? ['retiro'] : []),
  ];
  const pedidoMinimo = Number(config?.pedido_minimo || config?.minimo_pedido || 0);
  const faltaParaMinimo = pedidoMinimo > 0 ? Math.max(0, pedidoMinimo - subtotal) : 0;
  const tiempoEstimado =
    form.tipo_entrega === 'retiro'
      ? Number(config?.tiempo_retiro || 20)
      : Number(deliveryQuote?.tiempo_estimado_min || config?.tiempo_delivery || 30);
  const browseAll = !catActiva && !busqueda;

  const cantidadesEnCarrito = useMemo(() => {
    const map = {};
    carrito.forEach((item) => {
      if (!item.varKey || item.varKey === '{}') {
        map[item.producto_id] = (map[item.producto_id] || 0) + item.cantidad;
      }
    });
    return map;
  }, [carrito]);

  const incrementarSimple = (producto) => addToCart(producto, {}, []);
  const decrementarSimple = (producto) => {
    setCarrito((prev) => {
      const item = prev.find(
        (i) => i.producto_id === producto.id && (!i.varKey || i.varKey === '{}')
      );
      if (!item) return prev;
      return prev
        .map((i) => (i.id === item.id ? { ...i, cantidad: i.cantidad - 1 } : i))
        .filter((i) => i.cantidad > 0);
    });
  };

  const metodosDisponibles = useMemo(() => {
    const TODOS = [
      { key: 'efectivo', label: 'Efectivo' },
      { key: 'transferencia', label: 'Transfer.' },
      { key: 'mercadopago', label: 'Mercado Pago' },
    ];
    try {
      const habilitados = JSON.parse(config.metodos_pago || '[]');
      if (!Array.isArray(habilitados) || habilitados.length === 0) return TODOS;
      return TODOS.filter((m) => {
        if (m.key === 'mercadopago') {
          return habilitados.includes('mercadopago') && config.mercadopago_token_configured;
        }
        return habilitados.includes(m.key);
      });
    } catch {
      return TODOS;
    }
  }, [config.metodos_pago, config.mercadopago_token_configured]);
  const productosPorCategoria = useMemo(() => {
    const map = {};
    productos.filter(isVisibleOnPublicMenu).forEach((p) => {
      map[p.categoria_id] = (map[p.categoria_id] || 0) + 1;
    });
    return map;
  }, [productos]);
  // Categorías con turno asignado (ej. "Menú del Día" solo al mediodía) se
  // muestran solo durante ese turno; sin turno asignado, siempre visibles.
  // Si el local está cerrado (sin turno actual), no ocultamos nada.
  const categoriasSegunTurno = useMemo(() => {
    const turnoActualId = config?.turno_actual?.id || null;
    if (!turnoActualId) return categorias;
    return categorias.filter(
      (categoria) => !categoria.turno_id || categoria.turno_id === turnoActualId
    );
  }, [categorias, config?.turno_actual]);

  const categoriasVisibles = useMemo(
    () =>
      categoriasSegunTurno.filter((categoria) => (productosPorCategoria[categoria.id] || 0) > 0),
    [categoriasSegunTurno, productosPorCategoria]
  );

  const zonasCobertura = useMemo(() => {
    try {
      const zonas = JSON.parse(config.delivery_zonas || '[]');
      if (!Array.isArray(zonas) || zonas.length === 0) return [];
      return zonas
        .filter((z) => z.activa !== false && z.activa !== '0' && z.nombre)
        .map((z) => String(z.nombre).trim());
    } catch {
      return [];
    }
  }, [config.delivery_zonas]);

  const activePromos = useMemo(
    () => safeParseArray(config.web_promos_json).filter(isActiveByDate),
    [config.web_promos_json]
  );
  const promosBanner = useMemo(
    () => activePromos.filter((promo) => promo.mostrar_banner !== false),
    [activePromos]
  );
  const promoPrincipal = promosBanner[0] || null;
  const promoSecundarias = promosBanner.slice(1, 5);
  const destacados = useMemo(
    () =>
      productos
        .filter(
          (producto) =>
            isVisibleOnPublicMenu(producto) &&
            Number(producto.destacado) === 1 &&
            producto.disponible_para_venta !== false
        )
        .slice(0, 8),
    [productos]
  );
  const menuDelDiaCategoria = useMemo(
    () =>
      categoriasSegunTurno.find(
        (categoria) => normalizeText(categoria?.nombre) === 'menu del dia'
      ) || null,
    [categoriasSegunTurno]
  );
  const menuDelDiaItems = useMemo(
    () =>
      menuDelDiaCategoria
        ? productos.filter(
            (producto) =>
              producto.categoria_id === menuDelDiaCategoria.id && isVisibleOnPublicMenu(producto)
          )
        : [],
    [productos, menuDelDiaCategoria]
  );
  const quickFilterOptions = useMemo(() => {
    const options = [
      { id: 'all', label: 'Todo', count: productos.filter(isVisibleOnPublicMenu).length },
      { id: 'menu-dia', label: 'Menú del día', count: menuDelDiaItems.length },
      { id: 'destacados', label: 'Top pedidos', count: destacados.length },
      {
        id: 'rapidos',
        label: 'Sale rápido',
        count: productos.filter(
          (item) =>
            isVisibleOnPublicMenu(item) &&
            Number(item.tiempo_preparacion || 0) > 0 &&
            Number(item.tiempo_preparacion || 0) <= 20
        ).length,
      },
      {
        id: 'sin-variantes',
        label: 'Pedir en 1 toque',
        count: productos.filter((item) => {
          if (!isVisibleOnPublicMenu(item)) return false;
          return (
            safeParseArray(item.variantes).length === 0 && safeParseArray(item.extras).length === 0
          );
        }).length,
      },
    ];
    return options.filter((item) => item.id === 'all' || item.count > 0);
  }, [productos, menuDelDiaItems.length, destacados.length]);
  const activeQuickFilter = quickFilterOptions.find((item) => item.id === quickFilter) ||
    quickFilterOptions[0] || { id: 'all', label: 'Todo', count: productosFiltrados.length };
  const cartHighlightItems = useMemo(() => carrito.slice(0, 3), [carrito]);
  const seccionesCategorias = useMemo(
    () =>
      categoriasSegunTurno
        .map((categoria) => ({
          ...categoria,
          productos: productos.filter(
            (producto) => producto.categoria_id === categoria.id && isVisibleOnPublicMenu(producto)
          ),
        }))
        .filter((categoria) => categoria.productos.length > 0),
    [categoriasSegunTurno, productos]
  );
  const homeSections = useMemo(
    () =>
      seccionesCategorias.filter(
        (categoria) => !menuDelDiaCategoria || categoria.id !== menuDelDiaCategoria.id
      ),
    [seccionesCategorias, menuDelDiaCategoria]
  );
  const heroHighlights = useMemo(
    () => [
      {
        icon: ChefHat,
        title: menuDelDiaItems.length > 0 ? 'Menú del día activo' : 'Carta completa',
        detail:
          menuDelDiaItems.length > 0
            ? `${menuDelDiaItems.length} opciones listas desde ${fmt(menuDelDiaItems[0]?.precio || 0)}`
            : `${productos.length} productos para elegir`,
      },
      {
        icon: Bike,
        title:
          deliveryActivo && retiroActivo
            ? 'Delivery y retiro'
            : deliveryActivo
              ? 'Delivery activo'
              : 'Retiro en local',
        detail:
          deliveryActivo && retiroActivo
            ? `Entrega estimada ${Number(config?.tiempo_delivery || 25)} min`
            : retiroActivo
              ? `Retiro estimado ${Number(config?.tiempo_retiro || 20)} min`
              : 'Canal activo según configuración',
      },
      {
        icon: TicketPercent,
        title: activePromos.length > 0 ? 'Promos cargadas' : 'Pedido directo',
        detail:
          activePromos.length > 0
            ? `${activePromos.length} promo${activePromos.length === 1 ? '' : 's'} visible${activePromos.length === 1 ? '' : 's'} ahora`
            : 'Precios actualizados y compra sin intermediarios',
      },
      {
        icon: ShieldCheck,
        title: 'Seguimiento real',
        detail: 'Confirmación y estado del pedido en vivo',
      },
    ],
    [
      menuDelDiaItems,
      productos.length,
      deliveryActivo,
      retiroActivo,
      config?.tiempo_delivery,
      config?.tiempo_retiro,
      activePromos.length,
    ]
  );
  const trustBadges = useMemo(
    () => [
      {
        icon: ShieldCheck,
        title: 'Pedido directo',
        detail: 'Sin intermediarios y con precios actualizados por el local.',
      },
      {
        icon: Clock,
        title: 'Tiempos visibles',
        detail:
          form.tipo_entrega === 'retiro'
            ? `Retiro estimado en ${tiempoEstimado} min`
            : `Entrega estimada en ${tiempoEstimado} min`,
      },
      {
        icon: MessageCircle,
        title: 'Soporte por WhatsApp',
        detail: 'Si necesitás ayuda, abrís conversación en un toque.',
      },
    ],
    [form.tipo_entrega, tiempoEstimado]
  );
  const orderSteps = useMemo(
    () => [
      {
        icon: Search,
        title: 'Elegí',
        detail: 'Buscá tu categoría, promo o menú del día.',
      },
      {
        icon: ShoppingCart,
        title: 'Armá',
        detail: 'Sumá productos, variantes y extras sin vueltas.',
      },
      {
        icon: CheckCircle,
        title: 'Confirmá',
        detail: 'Recibís estado del pedido y seguimiento en vivo.',
      },
    ],
    []
  );
  const popupContent = useMemo(() => {
    const configPopup =
      isEnabled(config.web_popup_activo) &&
      isActiveByDate({
        activa: true,
        desde: config.web_popup_desde,
        hasta: config.web_popup_hasta,
      }) &&
      (config.web_popup_titulo || config.web_popup_imagen)
        ? {
            id: 'config-popup',
            titulo: config.web_popup_titulo,
            descripcion: config.web_popup_descripcion,
            imagen: config.web_popup_imagen,
            boton_texto: config.web_popup_boton_texto || 'Ver promo',
            accion_tipo: config.web_popup_accion_tipo || 'none',
            accion_valor: config.web_popup_accion_valor || '',
          }
        : null;
    return configPopup || activePromos.find((promo) => promo.mostrar_popup);
  }, [activePromos, config]);

  useEffect(() => {
    if (!popupContent?.id) return;
    const frequencyHours = Math.max(1, Number(config.web_popup_frecuencia_horas || 12));
    const storageKey = `ms_public_popup_${popupContent.id}`;
    const lastShown = Number(localStorage.getItem(storageKey) || 0);
    if (Date.now() - lastShown < frequencyHours * 60 * 60 * 1000) return;
    setPopupVisible(true);
    localStorage.setItem(storageKey, String(Date.now()));
  }, [popupContent?.id, config.web_popup_frecuencia_horas]);

  const agregarAlCarrito = (producto) => {
    const variantes = safeParseArray(producto.variantes);
    const extras = safeParseArray(producto.extras);
    if (variantes.length > 0 || extras.length > 0) {
      setVariantModal({ producto, variantes, extras, sel: {}, extrasSel: [] });
      return;
    }
    addToCart(producto, {}, []);
  };

  const addToCart = (producto, sel, extrasSel) => {
    const varKey = JSON.stringify(sel || {});
    const precioExtra =
      Object.values(sel || {}).reduce((acc, o) => acc + Number(o?.precio_extra || 0), 0) +
      (extrasSel || []).reduce((acc, e) => acc + Number(e.precio || 0), 0);

    const existing = carrito.find((i) => i.producto_id === producto.id && i.varKey === varKey);
    if (existing) {
      setCarrito((prev) =>
        prev.map((i) => (i.id === existing.id ? { ...i, cantidad: i.cantidad + 1 } : i))
      );
    } else {
      setCarrito((prev) => [
        ...prev,
        {
          id: Date.now(),
          producto_id: producto.id,
          nombre: producto.nombre,
          precio_unitario: Number(producto.precio) + precioExtra,
          cantidad: 1,
          varKey,
          variantes: sel || {},
          extras: extrasSel || [],
          descripcion: [
            ...Object.values(sel || {}).map((o) => o.nombre || o),
            ...(extrasSel || []).map((e) => e.nombre),
          ].join(', '),
        },
      ]);
    }
    setVariantModal(null);
    setBadgePop((n) => n + 1);
    toast.success('Producto agregado');
  };

  const handleAction = (tipo = 'none', valor = '', fallback = {}) => {
    const actionType = tipo || 'none';
    const actionValue = valor || '';

    if (actionType === 'cart') {
      setCarritoOpen(true);
      return;
    }

    if (actionType === 'whatsapp') {
      window.open(buildWhatsAppUrl(config, actionValue), '_blank');
      return;
    }

    if (actionType === 'url' && actionValue) {
      window.open(actionValue, '_blank');
      return;
    }

    if (actionType === 'producto' && actionValue) {
      const product = productos.find((item) => String(item.id) === String(actionValue));
      if (product) {
        setCatActiva(product.categoria_id || null);
        setTimeout(() => {
          document
            .getElementById(`producto-${product.id}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      }
      return;
    }

    if (actionType === 'categoria') {
      const categoryId = actionValue || fallback.categoria_id || categoriasVisibles[0]?.id || null;
      setCatActiva(categoryId ? Number(categoryId) : null);
      setTimeout(
        () =>
          document
            .getElementById('menu-publico')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        80
      );
      return;
    }

    document.getElementById('menu-publico')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const compartirCarta = async () => {
    const url = buildPublicAppUrl(window.location.pathname, config);
    const nombre = config.negocio_nombre || 'Modo Sabor';
    if (navigator.share) {
      try {
        await navigator.share({ title: nombre, text: `Mirá la carta de ${nombre}`, url });
      } catch {
        /* noop */
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Link copiado al portapapeles');
      } catch {
        toast.error('No se pudo copiar el link');
      }
    }
  };

  const hacerPedido = async () => {
    if (!form.nombre.trim()) return toast.error('Ingresá tu nombre');
    if (!form.telefono.trim()) return toast.error('Ingresá tu teléfono');
    const telefonoLimpio = form.telefono.replace(/[\s\-().+]/g, '');
    if (!/^\d{7,15}$/.test(telefonoLimpio))
      return toast.error('Teléfono inválido — solo números, mínimo 7 dígitos');
    if (form.tipo_entrega === 'delivery' && !form.direccion.trim())
      return toast.error('Ingresá tu dirección de entrega');
    if (form.tipo_entrega === 'delivery' && deliveryQuote.available === false) {
      return toast.error(deliveryQuote.message || 'Dirección fuera de zona de entrega');
    }
    setLoading(true);
    try {
      const payload = buildPedidoPayload({
        customer: {
          nombre: form.nombre,
          telefono: form.telefono,
          direccion: form.direccion,
          latitud: customerGeo.latitud,
          longitud: customerGeo.longitud,
        },
        items: carrito,
        summary,
        tipoEntrega: form.tipo_entrega,
        metodoPago: form.metodo_pago,
        notas: form.notas,
        origen: 'web',
        extra: {
          cupon_id: cupon.aplicado?.cupon?.id || null,
          cupon_codigo: cupon.aplicado?.cupon?.codigo || null,
        },
      });

      const snapItems = [...carrito];
      const snapTiempo = tiempoEstimado;

      if (form.metodo_pago === 'mercadopago') {
        const res = await api.post('/pedidos/checkout/mercadopago', payload);
        if (res.init_point) {
          try {
            localStorage.setItem('ms_carrito_mp_backup', JSON.stringify(snapItems));
          } catch {
            /* noop */
          }
          window.location.href = res.init_point;
          return;
        }
        setConfirmado({ ...(res.pedido || res), _items: snapItems, _tiempoEstimado: snapTiempo });
      } else {
        const res = await api.post('/pedidos', payload);
        setConfirmado({ ...res, _items: snapItems, _tiempoEstimado: snapTiempo });
      }

      setCarrito([]);
      setCheckout(false);
      setCupon({ codigo: '', aplicado: null, loading: false, error: '' });
    } catch (e) {
      toast.error(e?.error || 'Error al procesar el pedido');
    } finally {
      setLoading(false);
    }
  };

  const aplicarCupon = async () => {
    if (!cupon.codigo.trim()) return;
    setCupon((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const res = await api.post('/cupones/validar', {
        codigo: cupon.codigo.trim().toUpperCase(),
        subtotal,
        cliente_telefono: form.telefono || '',
      });
      setCupon((prev) => ({ ...prev, aplicado: res, loading: false, error: '' }));
      toast.success(`Cupón aplicado: -${fmt(res.monto_descuento)}`);
    } catch (e) {
      setCupon((prev) => ({
        ...prev,
        aplicado: null,
        loading: false,
        error: e?.error || 'Cupón no válido',
      }));
    }
  };

  const quitarCupon = () => {
    setCupon({ codigo: '', aplicado: null, loading: false, error: '' });
  };

  const captureCustomerLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Tu celular no permite compartir ubicación');
      return;
    }
    setCustomerGeo((prev) => ({ ...prev, loading: true }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCustomerGeo({
          latitud: position.coords.latitude,
          longitud: position.coords.longitude,
          loading: false,
          ready: true,
        });
        toast.success('Ubicación tomada');
      },
      () => {
        setCustomerGeo({ latitud: null, longitud: null, loading: false, ready: false });
        toast.error('No pudimos obtener tu ubicación');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  if (cargando) return <LoadingState />;
  if (errorCarga) return <ErrorState onRetry={() => setRetryCount((c) => c + 1)} />;
  if (confirmado) {
    return (
      <OrderConfirmation
        confirmado={confirmado}
        config={config}
        colorPrimario={colorPrimario}
        onReset={() => setConfirmado(null)}
      />
    );
  }

  const abiertoTexto = config?.abierto_ahora
    ? `Abierto${config?.turno_actual?.hasta ? ` hasta ${config.turno_actual.hasta}` : ''}`
    : getProximaAperturaText(config) || 'Cerrado ahora';
  const logoUrl = resolveAssetUrl(config?.negocio_logo || DEFAULT_BRAND_LOGO);

  return (
    <div className="min-h-screen bg-[#fffaf6] font-sans text-[#141414]">
      <header
        className="sticky top-0 z-[100] border-b border-white/60 px-4 py-4 backdrop-blur-xl md:px-8 shadow-[0_10px_30px_rgba(15,15,15,0.04)]"
        style={{ backgroundColor: 'rgba(255,250,246,0.92)' }}
      >
        <div className="mx-auto flex items-center justify-between max-w-[1400px]">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                className="h-12 w-12 object-contain rounded-xl bg-white p-1 shadow-lg ring-1 ring-black/5"
                alt="logo"
              />
            ) : (
              <div
                className="h-12 w-12 rounded-xl text-white flex items-center justify-center font-bold text-xl shadow-lg"
                style={{ backgroundColor: colorPrimario }}
              >
                MS
              </div>
            )}
            <div>
              <p
                className="text-[11px] font-black uppercase tracking-[0.24em]"
                style={{ color: colorPrimario }}
              >
                Carta online
              </p>
              <h1 className="text-lg font-black leading-tight">
                {config?.negocio_nombre || 'Modo Sabor'}
              </h1>
              <div
                className={`text-xs font-medium flex items-center gap-1.5 mt-0.5 ${config?.abierto_ahora ? 'text-green-600' : 'text-amber-600'}`}
              >
                <div
                  className={`h-2.5 w-2.5 rounded-full ${config?.abierto_ahora ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}
                ></div>
                {abiertoTexto}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={compartirCarta}
              aria-label="Compartir carta"
              className="hidden h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 transition-all sm:flex backdrop-blur-sm"
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={() => setCarritoOpen(true)}
              className="relative h-11 px-5 md:px-6 rounded-xl text-white flex items-center gap-2 shadow-lg active:scale-95 transition-all hover:brightness-110"
              style={{ backgroundColor: colorPrimario }}
            >
              <ShoppingCart size={18} />
              <span className="text-sm font-semibold">{fmt(total)}</span>
              {totalItems > 0 && (
                <div
                  key={badgePop}
                  className="absolute -top-2.5 -right-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white text-[11px] font-bold shadow-md"
                  style={{
                    color: colorPrimario,
                    animation:
                      badgePop > 0
                        ? 'ms-badge-pop 0.35s cubic-bezier(0.36,0.07,0.19,0.97)'
                        : 'none',
                  }}
                >
                  {totalItems}
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      <HeroSection
        config={config}
        theme={theme}
        colorPrimario={colorPrimario}
        heroHighlights={heroHighlights}
        categoriasVisibles={categoriasVisibles}
        onAction={handleAction}
      />

      <HighlightsGrid heroHighlights={heroHighlights} colorPrimario={colorPrimario} theme={theme} />

      <PromoSection
        promosBanner={promosBanner}
        promoPrincipal={promoPrincipal}
        promoSecundarias={promoSecundarias}
        colorPrimario={colorPrimario}
        theme={theme}
        onAction={handleAction}
      />

      <TrustSection
        trustBadges={trustBadges}
        orderSteps={orderSteps}
        totalItems={totalItems}
        colorPrimario={colorPrimario}
        theme={theme}
      />

      <MenuNav
        categoriasVisibles={categoriasVisibles}
        productosPorCategoria={productosPorCategoria}
        catActiva={catActiva}
        setCatActiva={setCatActiva}
        quickFilterOptions={quickFilterOptions}
        quickFilter={quickFilter}
        setQuickFilter={setQuickFilter}
        setBusqueda={setBusqueda}
        totalItems={totalItems}
        total={total}
        colorPrimario={colorPrimario}
        theme={theme}
        fmt={fmt}
        onOpenCart={() => setCarritoOpen(true)}
      />

      <MenuSection
        browseAll={browseAll}
        menuDelDiaItems={menuDelDiaItems}
        menuDelDiaCategoria={menuDelDiaCategoria}
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        setCatActiva={setCatActiva}
        catActiva={catActiva}
        categorias={categorias}
        productosFiltrados={productosFiltrados}
        destacados={destacados}
        homeSections={homeSections}
        productos={productos}
        isEnabled={isEnabled}
        config={config}
        colorPrimario={colorPrimario}
        theme={theme}
        cantidadesEnCarrito={cantidadesEnCarrito}
        onAgregar={agregarAlCarrito}
        onVerDetalle={setDetalleModal}
        onIncrementar={incrementarSimple}
        onDecrementar={decrementarSimple}
        pedidoMinimo={pedidoMinimo}
        tiempoEstimado={tiempoEstimado}
        tipoEntrega={form.tipo_entrega}
        faltaParaMinimo={faltaParaMinimo}
        activeQuickFilter={activeQuickFilter}
        quickFilter={quickFilter}
      />

      <Footer config={config} colorPrimario={colorPrimario} theme={theme} />

      <FloatingCart
        totalItems={totalItems}
        total={total}
        fmt={fmt}
        colorPrimario={colorPrimario}
        theme={theme}
        cartHighlightItems={cartHighlightItems}
        carrito={carrito}
        onOpenCart={() => setCarritoOpen(true)}
      />

      <WhatsAppFloat config={config} totalItems={totalItems} />

      <ScrollTop show={showScrollTop} config={config} totalItems={totalItems} />

      <PopupModal
        visible={popupVisible}
        content={popupContent}
        colorPrimario={colorPrimario}
        theme={theme}
        onClose={() => setPopupVisible(false)}
        onAction={handleAction}
      />

      <CartDrawer
        carrito={carrito}
        setCarrito={setCarrito}
        open={carritoOpen}
        setOpen={setCarritoOpen}
        checkout={checkout}
        setCheckout={setCheckout}
        form={form}
        setForm={setForm}
        cupon={cupon}
        setCupon={setCupon}
        deliveryQuote={deliveryQuote}
        summary={summary}
        envio={summary.envio}
        colorPrimario={colorPrimario}
        config={config}
        metodosDisponibles={metodosDisponibles}
        tiposEntregaDisponibles={tiposEntregaDisponibles}
        deliveryActivo={deliveryActivo}
        retiroActivo={retiroActivo}
        zonasCobertura={zonasCobertura}
        pedidoMinimo={pedidoMinimo}
        faltaParaMinimo={faltaParaMinimo}
        tiempoEstimado={tiempoEstimado}
        loading={loading}
        hacerPedido={hacerPedido}
        aplicarCupon={aplicarCupon}
        quitarCupon={quitarCupon}
        captureCustomerLocation={captureCustomerLocation}
        customerGeo={customerGeo}
        categoriasVisibles={categoriasVisibles}
        productosPorCategoria={productosPorCategoria}
        setCatActiva={setCatActiva}
        setBusqueda={setBusqueda}
      />

      <VariantModal
        modal={variantModal}
        setModal={setVariantModal}
        colorPrimario={colorPrimario}
        onClose={() => setVariantModal(null)}
        onAddToCart={addToCart}
      />

      <ProductDetailModal
        producto={detalleModal}
        colorPrimario={colorPrimario}
        theme={theme}
        config={config}
        onClose={() => setDetalleModal(null)}
        onAdd={agregarAlCarrito}
      />
    </div>
  );
}
