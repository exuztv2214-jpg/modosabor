import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { PageTransition, Tooltip, DarkModeToggle } from '../design-system';
import {
  Menu,
  X,
  Bell,
  LogOut,
  User,
  Search,
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
    blue: 'bg-primary-50 text-primary-500',
    rose: 'bg-danger-50 text-danger-500',
    amber: 'bg-warning-50 text-warning-500',
    emerald: 'bg-success-50 text-success-500',
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
      '/admin/productos': 'Productos',
      '/admin/inventario': 'Inventario',
      '/admin/compras': 'Compras',
      '/admin/categorias': 'Categorías',
      '/admin/clientes': 'Clientes',
      '/admin/marketing': 'Marketing Digital',
      '/admin/reportes': 'Reportes',
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
        <header
          className={`
            sticky top-0 z-50 px-4 lg:px-8 flex items-center justify-between
            transition-all duration-300
            ${isScrolled ? 'bg-white/80 backdrop-blur-md shadow-sm h-[65px]' : 'bg-transparent h-[80px]'}
          `}
        >
          {/* Left Side: Toggle + Search */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-full hover:bg-primary-50 text-gray-600 transition-colors"
            >
              <Menu size={22} />
            </button>

            <Tooltip text="Buscar">
              <button className="hidden lg:flex p-2 rounded-full hover:bg-primary-50 text-gray-600 transition-colors">
                <Search size={20} />
              </button>
            </Tooltip>

            <DarkModeToggle className="hidden lg:flex" />

            <div className="hidden md:block">
              <h2 className="text-sm font-black uppercase tracking-widest text-primary-500/80">
                {getPageTitle()}
              </h2>
            </div>
          </div>

          {/* Right Side: Icons + User */}
          <div className="flex items-center gap-2 lg:gap-4">
            {installReady && !isStandalone && (
              <button
                onClick={handleInstallPwa}
                className="hidden md:inline-flex items-center gap-2 rounded-2xl border border-primary-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-primary-500 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary-50"
              >
                <Download size={14} />
                Instalar sistema
              </button>
            )}
            {/* Apps/Notifications icons - Modernize Style */}
            <div className="relative notification-menu-container">
              <button
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className="p-2 rounded-full hover:bg-primary-50 text-gray-600 transition-colors relative"
              >
                <Bell size={22} />
                {notificationCount > 0 && (
                  <>
                    <span className="absolute top-2 right-2 w-2 h-2 bg-danger-500 rounded-full border-2 border-white"></span>
                    <span className="absolute -right-1 -top-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                      {notificationCount}
                    </span>
                  </>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-3 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100/50 py-3 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-5 pb-3 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-gray-900 tracking-tight">
                          Notificaciones del sistema
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                          {notificationCount > 0
                            ? `${notificationCount} para revisar`
                            : 'Todo en orden'}
                        </p>
                      </div>
                      <button
                        onClick={() => navigate('/admin/dashboard')}
                        className="text-[10px] font-black uppercase tracking-widest text-primary-500 hover:underline"
                      >
                        Ver panel
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
                        Audio y alertas
                      </p>
                      <button
                        onClick={handleTestAlarm}
                        className="rounded-xl bg-primary-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary-500 transition-all hover:bg-primary-500 hover:text-white"
                      >
                        Probar alarma
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[420px] overflow-y-auto px-3 py-3 space-y-2">
                    {notificationItems.length > 0 ? (
                      notificationItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() => {
                              setNotificationsOpen(false);
                              item.action?.();
                            }}
                            className="w-full flex items-start gap-3 rounded-[20px] border border-gray-100 bg-primary-50 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                          >
                            <div
                              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] ${toneClasses[item.tone] || toneClasses.blue}`}
                            >
                              <Icon size={20} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-black uppercase tracking-wide text-gray-900">
                                {item.title}
                              </p>
                              <p className="mt-1 text-xs font-medium text-gray-500">
                                {item.description}
                              </p>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-[20px] border border-dashed border-gray-200 bg-primary-50 px-4 py-8 text-center">
                        <Bell size={24} className="mx-auto mb-3 text-gray-300" />
                        <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                          Sin alertas nuevas
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          La operacion se ve estable por ahora.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Dropdown */}
            <div className="relative user-menu-container ml-2">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 transition-all duration-200"
              >
                <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center overflow-hidden border border-primary-100 shadow-sm transition-transform hover:scale-105">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-primary-500 font-black text-xs uppercase">
                      {user?.nombre?.[0] || 'U'}
                    </span>
                  )}
                </div>
              </button>

              {/* User Menu Dropdown */}
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-3 w-[260px] bg-white rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-gray-100/50 py-3 z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-6 py-4 mb-2">
                    <p className="text-sm font-black text-gray-900 tracking-tight">
                      Perfil de Usuario
                    </p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-info-500 flex items-center justify-center text-white text-xl font-black">
                        {user?.nombre?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-800 truncate">{user?.nombre}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter truncate">
                          {user?.rol || 'Administrador'}
                        </p>
                        <p className="text-[10px] text-gray-400 truncate mt-0.5">{user?.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="px-2 space-y-1 border-t border-gray-50 pt-3">
                    <button
                      onClick={() => navigate('/admin/cuenta')}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-primary-50 hover:text-primary-500 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-white shadow-sm transition-colors text-gray-400 group-hover:text-primary-500">
                        <User size={18} />
                      </div>
                      Mi Perfil
                    </button>

                    <button
                      onClick={() => navigate('/admin/configuracion')}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 hover:bg-primary-50 hover:text-primary-500 transition-all group"
                    >
                      <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center group-hover:bg-white shadow-sm transition-colors text-gray-400 group-hover:text-primary-500">
                        <Settings size={18} />
                      </div>
                      Ajustes
                    </button>
                  </div>

                  <div className="px-4 mt-4 pt-2">
                    <button
                      onClick={handleLogout}
                      className="w-full py-3.5 rounded-2xl bg-white border border-primary-500 text-primary-500 text-sm font-black uppercase tracking-wider hover:bg-primary-500 hover:text-white transition-all shadow-sm"
                    >
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
    </div>
  );
}
