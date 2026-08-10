import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { PageTransition } from '../design-system';
import {
  Menu,
  Bell,
  LogOut,
  User,
  Settings,
  AlertTriangle,
  Package,
  ShoppingBag,
  MessageSquareMore,
  Download,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import api from '../lib/api.js';
import { socketManager } from '../lib/socket.js';
import { runOrderAlert, useOrderAlertPlayback } from '../lib/orderAlerts.js';

import GlobalOrderAlerts from './GlobalOrderAlerts.jsx';
import AsistenteFlotante from './Asistente/AsistenteFlotante.jsx';
import Sidebar from './SidebarModern.jsx';

const SIDEBAR_WIDTH = 270;

export default function Layout() {
  const { user, logout } = useAuth();
  const { config } = useAppConfig();
  const location = useLocation();
  const navigate = useNavigate();

  // States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [installReady, setInstallReady] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const { audioContextRef, voiceRef, fallbackAudioRef } = useOrderAlertPlayback();
  const staticNotificationsRef = useRef([]);

  // Detect TPV route (no layout)
  const isTpvRoute = location.pathname === '/admin/tpv';

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setUserMenuOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  // Handle scroll for header effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)');
    const syncStandalone = () => {
      const standalone = Boolean(window.navigator?.standalone) || Boolean(standaloneMedia?.matches);
      setIsStandalone(standalone);
    };

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
      setInstallReady(true);
    };

    const handleInstalled = () => {
      setDeferredInstallPrompt(null);
      setInstallReady(false);
      setIsStandalone(true);
    };

    syncStandalone();
    standaloneMedia?.addEventListener?.('change', syncStandalone);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      standaloneMedia?.removeEventListener?.('change', syncStandalone);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  // Close user menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuOpen && !e.target.closest('.user-menu-container')) {
        setUserMenuOpen(false);
      }
      if (notificationsOpen && !e.target.closest('.notification-menu-container')) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen, notificationsOpen]);

  useEffect(() => {
    let alive = true;

    const loadNotifications = async () => {
      try {
        const [dashboard] = await Promise.allSettled([api.get('/reportes/dashboard')]);

        if (!alive) return;

        const dashboardData = dashboard.status === 'fulfilled' ? dashboard.value : null;
        const items = [];

        if (dashboardData && !dashboardData.cajaEstado?.abierta) {
          items.push({
            id: 'caja-cerrada',
            title: 'Caja cerrada',
            description: 'Es recomendable abrirla para seguir operando normal.',
            tone: 'rose',
            icon: AlertTriangle,
            action: () => navigate('/admin/caja'),
          });
        }

        if ((dashboardData?.stockCritico || []).length > 0) {
          items.push({
            id: 'stock-critico',
            title: `Stock critico: ${dashboardData.stockCritico.length}`,
            description: 'Hay insumos para revisar en inventario.',
            tone: 'amber',
            icon: Package,
            action: () => navigate('/admin/inventario'),
          });
        }

        if (Number(dashboardData?.pedidosActivos || 0) > 0) {
          items.push({
            id: 'pedidos-activos',
            title: `Pedidos activos: ${dashboardData.pedidosActivos}`,
            description: `${Number(dashboardData?.pedidosEnDelivery || 0)} en delivery ahora mismo.`,
            tone: 'blue',
            icon: ShoppingBag,
            action: () => navigate('/admin/pedidos'),
          });
        }

        staticNotificationsRef.current = items;
        setNotificationItems((prev) => {
          const dynamic = prev.filter((item) => item.kind === 'dynamic');
          return [...dynamic, ...items];
        });
      } catch (error) {
        if (alive) {
          staticNotificationsRef.current = [];
          setNotificationItems((prev) => prev.filter((item) => item.kind === 'dynamic'));
        }
      }
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 45000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [navigate]);

  useEffect(() => {
    if (!user) return undefined;

    const pushDynamicNotification = (item) => {
      setNotificationItems((prev) => {
        const existing = prev.filter((entry) => entry.id !== item.id);
        const dynamic = [item, ...existing.filter((entry) => entry.kind === 'dynamic')].slice(0, 8);
        return [...dynamic, ...staticNotificationsRef.current];
      });
    };

    const unsubscribeNuevo = socketManager.on('nuevo_pedido', (pedido) => {
      if (!pedido?.id) return;
      pushDynamicNotification({
        id: `nuevo-pedido-${pedido.id}`,
        kind: 'dynamic',
        title: `Nuevo pedido #${pedido.numero || pedido.id}`,
        description: pedido?.cliente_nombre || 'Pedido recien ingresado',
        tone: 'blue',
        icon: ShoppingBag,
        action: () => navigate('/admin/pedidos'),
      });
    });

    const unsubscribeAdmin = socketManager.on('pedido_actualizado_admin', (pedido) => {
      const estado = String(pedido?.estado || '').toLowerCase();
      if (!pedido?.id || estado !== 'entregado') return;
      pushDynamicNotification({
        id: `pedido-entregado-${pedido.id}`,
        kind: 'dynamic',
        title: `Pedido entregado #${pedido.numero || pedido.id}`,
        description: pedido?.cliente_nombre || 'Entrega confirmada',
        tone: 'emerald',
        icon: MessageSquareMore,
        action: () => navigate('/admin/pedidos'),
      });
    });

    return () => {
      unsubscribeNuevo();
      unsubscribeAdmin();
    };
  }, [navigate, user]);

  const handleLogout = () => {
    logout();
    navigate('/admin');
  };

  const notificationCount = notificationItems.length;
  const toneClasses = {
    blue: { bg: '#E9F1FA', fg: '#1F5FA0' },
    rose: { bg: '#FEF2F2', fg: '#9E141E' },
    amber: { bg: '#FDF3D3', fg: '#95661A' },
    emerald: { bg: '#E7F5EF', fg: '#0F6E56' },
  };

  const handleTestAlarm = async () => {
    try {
      await runOrderAlert({
        pedido: { id: 'test', numero: 'TEST', cliente_nombre: 'Prueba alarma' },
        config: {
          ...config,
          alertas_pedido_sonido: '1',
          alertas_pedido_voz: '1',
        },
        audioContextRef,
        voiceRef,
        fallbackAudioRef,
        delayMs: 180,
      });
    } catch {}
  };

  const handleInstallPwa = async () => {
    if (!deferredInstallPrompt) return;
    try {
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch {}
    setDeferredInstallPrompt(null);
    setInstallReady(false);
  };

  const getPageTitle = () => {
    const titles = {
      '/admin/dashboard': 'Dashboard',
      '/admin/operacion': 'Control Diario',
      '/admin/tpv': 'TPV / Punto de Venta',
      '/admin/pedidos': 'Pedidos',
      '/admin/whatsapp-copiloto': 'WhatsApp Copiloto',
      '/admin/caja': 'Cierre de Caja',
      '/admin/kds': 'Cocina / KDS',
      '/admin/mesas': 'Mesas / Salón',
      '/admin/delivery': 'Delivery',
      '/admin/direcciones': 'Barrios y direcciones',
      '/admin/productos': 'Productos',
      '/admin/inventario': 'Inventario',
      '/admin/compras': 'Compras',
      '/admin/categorias': 'Categorías',
      '/admin/listas-opciones': 'Listas de opciones',
      '/admin/clientes': 'Clientes',
      '/admin/marketing': 'Marketing Digital',
      '/admin/reportes': 'Reportes',
      '/admin/reportes-delivery': 'Reportes de delivery',
      '/admin/configuracion': 'Configuración',
      '/admin/personal': 'Personal',
      '/admin/usuarios': 'Usuarios',
      '/admin/cuenta': 'Mi Cuenta',
      '/admin/cupones': 'Cupones',
      '/admin/fidelizacion': 'Fidelización',
      '/admin/auditoria': 'Auditoría del sistema',
    };
    return titles[location.pathname] || 'Panel de Control';
  };

  useEffect(() => {
    const pageTitle = getPageTitle();
    document.title = `${pageTitle} · Modo Sabor`;
  }, [location.pathname]);

  if (isTpvRoute) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-gray-50">
        <GlobalOrderAlerts />
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex font-sans text-gray-900">
      <GlobalOrderAlerts />

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          SIDEBAR (Modernize Style)
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] lg:hidden transition-all duration-300"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-[70]
          bg-white border-r border-gray-100/80
          transition-all duration-300 ease-in-out
          flex flex-col
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        style={{ width: SIDEBAR_WIDTH }}
      >
        <Sidebar onCloseMobile={() => setMobileMenuOpen(false)} />
      </aside>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          MAIN CONTENT AREA
          â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 lg:ml-[270px]">
        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            TOPBAR / HEADER (Modernize Style)
            â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {/* Cambiaba de 80px a 65px al hacer scroll y el contenido saltaba. */}
        <header
          className={`sticky top-0 z-50 flex h-[60px] items-center justify-between px-4 transition-colors duration-200 sm:px-6 ${
            isScrolled ? 'border-b border-gray-200 bg-white/90 backdrop-blur-md' : 'bg-transparent'
          }`}
        >
          {/*
            Acá vivían dos controles que no correspondían: una lupa que no
            tenía `onClick` —un botón de búsqueda que no buscaba nada— y el
            interruptor de modo oscuro, que quedó dando vueltas aunque el
            sistema es claro. Los dos afuera.
          */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
              className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 lg:hidden"
            >
              <Menu size={20} />
            </button>

            <h2 className="hidden text-[15px] font-semibold text-gray-900 md:block">
              {getPageTitle()}
            </h2>
          </div>

          {/* Right Side: Icons + User */}
          <div className="flex items-center gap-2">
            {installReady && !isStandalone && (
              <button
                type="button"
                onClick={handleInstallPwa}
                className="hidden items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50 md:inline-flex"
              >
                <Download size={15} />
                Instalar
              </button>
            )}

            <div className="relative notification-menu-container">
              {/*
                Tenía dos indicadores encima del mismo campanita: un puntito
                rojo y, pisándolo, la burbuja azul con el número. Queda uno.
              */}
              <button
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                aria-label="Notificaciones"
                className="relative rounded-lg p-2 text-gray-600 transition hover:bg-gray-100"
              >
                <Bell size={20} />
                {notificationCount > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums text-white ring-2 ring-white"
                    style={{ background: '#DC1F2D' }}
                  >
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-full z-[100] mt-2 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                    <div>
                      <p className="text-[14px] font-semibold text-gray-900">Notificaciones</p>
                      <p className="text-[12px] text-gray-500">
                        {notificationCount > 0
                          ? `${notificationCount} para revisar`
                          : 'Todo en orden'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTestAlarm}
                      className="shrink-0 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200"
                    >
                      Probar alarma
                    </button>
                  </div>

                  <div className="max-h-[380px] space-y-1 overflow-y-auto p-2">
                    {notificationItems.length > 0 ? (
                      notificationItems.map((item) => {
                        const Icon = item.icon;
                        const tono = toneClasses[item.tone] || toneClasses.blue;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => {
                              setNotificationsOpen(false);
                              item.action?.();
                            }}
                            className="flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition hover:bg-gray-50"
                          >
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                              style={{ background: tono.bg, color: tono.fg }}
                            >
                              <Icon size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium text-gray-900">
                                {item.title}
                              </span>
                              <span className="mt-0.5 block text-[12px] leading-4 text-gray-500">
                                {item.description}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-8 text-center">
                        <Bell size={22} className="mx-auto mb-2 text-gray-300" />
                        <p className="text-[13px] font-medium text-gray-600">Sin alertas nuevas</p>
                        <p className="mt-0.5 text-[12px] text-gray-400">
                          La operación se ve estable.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/*
              La identidad del usuario aparecía dos veces: en el pie del
              sidebar (donde no hacía nada) y acá con una ficha grande. Ahora
              el sidebar es el lugar principal —tiene el nombre, el rol, el
              acceso a la cuenta y el botón de salir— y esto queda como
              atajo corto.
            */}
            <div className="user-menu-container relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-label="Menú de usuario"
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg text-[13px] font-semibold text-white transition hover:brightness-110"
                style={{ background: '#DC1F2D' }}
              >
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  user?.nombre?.[0]?.toUpperCase() || 'U'
                )}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full z-[100] mt-2 w-[240px] rounded-2xl border border-gray-100 bg-white p-2 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
                  <div className="px-2 pb-2 pt-1">
                    <p className="truncate text-[14px] font-semibold text-gray-900">
                      {user?.nombre || 'Administrador'}
                    </p>
                    <p className="truncate text-[12px] text-gray-500">
                      {user?.email || user?.rol || 'Admin'}
                    </p>
                  </div>

                  <div className="border-t border-gray-100 pt-1.5">
                    <button
                      type="button"
                      onClick={() => navigate('/admin/cuenta')}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-gray-700 transition hover:bg-gray-100"
                    >
                      <User size={16} className="text-gray-400" />
                      Mi cuenta
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/admin/configuracion')}
                      className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-gray-700 transition hover:bg-gray-100"
                    >
                      <Settings size={16} className="text-gray-400" />
                      Configuración
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-gray-700 transition hover:bg-rose-50 hover:text-rose-700"
                    >
                      <LogOut size={16} className="text-gray-400" />
                      Cerrar sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            CONTENT AREA
            â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <main className="flex-1 px-4 lg:px-8 pb-12">
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>

      {/*
        Fuera de <main> a propósito: el botón va fijo a la ventana, y adentro
        quedaría atrapado por el contenedor con scroll.

        No se pone en la ruta del TPV: esa pantalla se usa con el local lleno,
        de parado y contra reloj. Un botón flotante ahí es algo que se toca sin
        querer, no una ayuda.
      */}
      <AsistenteFlotante />
    </div>
  );
}
