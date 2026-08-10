import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Armchair,
  BarChart3,
  Bike,
  Boxes,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  Gift,
  LayoutDashboard,
  ListPlus,
  LogOut,
  MapPinned,
  Megaphone,
  MessageCircle,
  Package,
  Receipt,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Tag,
  TicketPercent,
  UserSquare2,
  Users,
  UtensilsCrossed,
  WalletCards,
  X,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import { resolveAssetUrl } from '../lib/assets.js';
import { socketManager } from '../lib/socket.js';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';

/**
 * Navegación del panel.
 *
 * Reorganizada por cuándo se usa cada cosa, no por parentesco temático:
 *
 *  · "Hoy" es el turno completo de punta a punta —abrís, vendés, cocinás,
 *    repartís, cerrás—. Es el grupo más largo a propósito: es donde se vive.
 *  · "Catálogo" y "Clientes" son cosas que se tocan cada tanto.
 *  · "Reportes" y "Negocio" son de consulta y de setup.
 *
 * Tres cosas cambiaron de lugar porque estaban mal:
 *  · "Barrios y direcciones" vivía en Operaciones, pero no se toca en el
 *    servicio: es un dato maestro que se configura una vez.
 *  · "Cupones" estaba en Configuración, cuando es una herramienta de venta
 *    que va con Fidelización y Marketing.
 *  · "Mi cuenta" era un ítem más de Configuración, duplicando el "Mi perfil"
 *    del menú de usuario de arriba. Ahora está una sola vez, en el pie.
 */
const GRUPOS = [
  {
    label: 'Hoy',
    items: [
      {
        to: '/admin/dashboard',
        icon: LayoutDashboard,
        label: 'Dashboard',
        permission: 'dashboard.view',
      },
      {
        to: '/admin/operacion',
        icon: ClipboardCheck,
        label: 'Control diario',
        permission: 'dashboard.view',
      },
      // Decía "TPV / Caja" mientras existía otro ítem llamado "Cierre de
      // Caja". Dos cosas distintas con el mismo nombre.
      {
        to: '/admin/tpv',
        icon: ShoppingCart,
        label: 'TPV',
        permission: 'tpv.use',
        moduleKey: 'tpv',
      },
      { to: '/admin/pedidos', icon: ClipboardList, label: 'Pedidos', permission: 'pedidos.view' },
      {
        to: '/admin/whatsapp-copiloto',
        icon: MessageCircle,
        label: 'WhatsApp',
        permission: 'pedidos.view',
      },
      {
        to: '/admin/kds',
        icon: ChefHat,
        label: 'Cocina',
        permission: 'kds.view',
        moduleKey: 'kds',
      },
      {
        to: '/admin/mesas',
        icon: Armchair,
        label: 'Mesas',
        permission: 'mesas.view',
        moduleKey: 'mesas',
      },
      {
        to: '/admin/delivery',
        icon: Bike,
        label: 'Delivery',
        permission: 'delivery.view',
        moduleKey: 'delivery',
      },
      {
        to: '/admin/caja',
        icon: WalletCards,
        label: 'Caja',
        permission: 'caja.view',
        moduleKey: 'caja',
      },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { to: '/admin/productos', icon: Package, label: 'Productos', permission: 'productos.edit' },
      { to: '/admin/categorias', icon: Tag, label: 'Categorías', permission: 'productos.edit' },
      {
        to: '/admin/listas-opciones',
        icon: ListPlus,
        label: 'Listas de opciones',
        permission: 'productos.edit',
      },
      {
        to: '/admin/inventario',
        icon: Boxes,
        label: 'Inventario',
        permission: 'productos.edit',
        moduleKey: 'inventario',
      },
      {
        to: '/admin/compras',
        icon: Receipt,
        label: 'Compras',
        permission: 'productos.edit',
        moduleKey: 'inventario',
      },
    ],
  },
  {
    label: 'Clientes',
    items: [
      {
        to: '/admin/clientes',
        icon: Users,
        label: 'Clientes',
        permission: 'clientes.view',
        moduleKey: 'clientes',
      },
      {
        to: '/admin/fidelizacion',
        icon: Gift,
        label: 'Fidelización',
        permission: 'clientes.view',
        moduleKey: 'clientes',
      },
      {
        to: '/admin/cupones',
        icon: TicketPercent,
        label: 'Cupones',
        permission: 'config.manage',
        moduleKey: 'cupones',
      },
      // Mostraba un chincheta de mapa: una edición mal cerrada había dejado
      // `icon: MapPinned, Megaphone,` y el megáfono quedó como propiedad
      // suelta del objeto. Como es JS válido nunca dio error, sólo el ícono
      // repetido de "Barrios y direcciones".
      {
        to: '/admin/marketing',
        icon: Megaphone,
        label: 'Marketing',
        permission: 'reportes.view',
        moduleKey: 'marketing',
      },
    ],
  },
  {
    label: 'Reportes',
    items: [
      {
        to: '/admin/reportes',
        icon: BarChart3,
        label: 'Ventas',
        permission: 'reportes.view',
        moduleKey: 'reportes',
      },
      {
        to: '/admin/reportes-delivery',
        icon: Bike,
        label: 'Delivery',
        permission: 'reportes.view',
        moduleKey: 'reportes',
      },
    ],
  },
  {
    label: 'Negocio',
    items: [
      {
        to: '/admin/personal',
        icon: UserSquare2,
        label: 'Personal',
        permission: 'config.manage',
        moduleKey: 'personal',
      },
      {
        to: '/admin/direcciones',
        icon: MapPinned,
        label: 'Barrios y zonas',
        permission: 'pedidos.edit',
      },
      {
        to: '/admin/configuracion',
        icon: Settings,
        label: 'Configuración',
        permission: 'config.manage',
      },
      { to: '/admin/usuarios', icon: ShieldCheck, label: 'Usuarios', permission: 'config.manage' },
      {
        to: '/admin/auditoria',
        icon: ShieldAlert,
        label: 'Auditoría',
        permission: 'config.manage',
      },
    ],
  },
];

export default function SidebarModern({ onCloseMobile }) {
  const { user, hasPermission, logout } = useAuth();
  const { config: branding, isModuleEnabled } = useAppConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [pedidosBadge, setPedidosBadge] = useState(0);

  const logoUrl = resolveAssetUrl(branding.negocio_logo);

  useEffect(() => {
    if (location.pathname === '/admin/pedidos') setPedidosBadge(0);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return undefined;
    // Se suscribía al socket sin pedir la conexión: el contador de pedidos
    // nuevos sólo funcionaba si alguna otra pantalla ya la había abierto.
    socketManager.connect();
    const unsub = socketManager.on('nuevo_pedido', () => {
      if (location.pathname !== '/admin/pedidos') setPedidosBadge((n) => n + 1);
    });
    return unsub;
  }, [user, location.pathname]);

  const grupos = GRUPOS.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter(
      (item) =>
        (!item.permission || hasPermission(item.permission)) &&
        (!item.moduleKey || isModuleEnabled(item.moduleKey))
    ),
  })).filter((grupo) => grupo.items.length > 0);

  const cerrarSesion = () => {
    onCloseMobile?.();
    logout();
    navigate('/admin');
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* ── Identidad del negocio ── */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ background: logoUrl ? '#fff' : '#FEF2F2' }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={branding.negocio_nombre || 'Logo'}
              className="h-full w-full object-contain"
            />
          ) : (
            <UtensilsCrossed size={20} strokeWidth={STROKE} style={{ color: BRAND }} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-gray-900">
            {branding.negocio_nombre || 'Modo Sabor'}
          </p>
          <p className="truncate text-[12px] text-gray-500">
            {branding.negocio_localidad || 'Panel de administración'}
          </p>
        </div>

        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Cerrar menú"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 lg:hidden"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        )}
      </div>

      {/* ── Navegación ── */}
      <nav className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {grupos.map((grupo) => (
          <div key={grupo.label} className="mb-1 mt-4 first:mt-0">
            <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {grupo.label}
            </p>

            {grupo.items.map((item) => {
              const Icon = item.icon;
              const badge = item.to === '/admin/pedidos' ? pedidosBadge : 0;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `relative mb-0.5 flex items-center gap-2.5 rounded-xl py-2 pl-3 pr-2 text-[13px] transition ${
                      isActive ? 'font-semibold' : 'font-medium text-gray-600 hover:bg-gray-100'
                    }`
                  }
                  style={({ isActive }) =>
                    isActive ? { background: '#FEF2F2', color: BRAND } : undefined
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/*
                        El activo era una píldora azul llena con sombra de
                        color, que es lo que hace que un panel entero se lea
                        como plantilla comprada. Con la barra al costado se
                        ubica igual de rápido y no compite con el contenido.
                      */}
                      {isActive ? (
                        <span
                          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full"
                          style={{ background: BRAND }}
                          aria-hidden
                        />
                      ) : null}

                      <Icon
                        size={17}
                        strokeWidth={STROKE}
                        className={isActive ? '' : 'text-gray-400'}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>

                      {badge > 0 ? (
                        <span
                          className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums text-white"
                          style={{ background: BRAND }}
                        >
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Pie ── */}
      <div className="shrink-0 border-t border-gray-100 p-3">
        {/*
          "Ver menú online" estaba arriba de todo, mezclado con el Dashboard,
          como si fuera una sección del panel. Es un link que se abre afuera:
          va con las utilidades, no con la navegación.
        */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-gray-600 transition hover:bg-gray-100"
        >
          <ExternalLink size={16} strokeWidth={STROKE} className="text-gray-400" />
          Ver la web pública
        </a>

        {/*
          El bloque del usuario era decorativo: mostraba el nombre y no hacía
          nada. Ahora abre "Mi cuenta" —que antes era un ítem suelto perdido
          en Configuración— y tiene el botón de salir, que sólo existía
          escondido en el menú del avatar de arriba.
        */}
        <div className="flex items-center gap-2 rounded-xl p-1" style={{ background: APP_BG }}>
          <button
            type="button"
            onClick={() => {
              onCloseMobile?.();
              navigate('/admin/cuenta');
            }}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-white"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-semibold text-white"
              style={{ background: BRAND }}
            >
              {user?.nombre?.[0]?.toUpperCase() || 'A'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-gray-900">
                {user?.nombre || 'Administrador'}
              </span>
              <span className="block truncate text-[11px] text-gray-500">
                {user?.rol || 'Admin'}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={cerrarSesion}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white hover:text-rose-600"
          >
            <LogOut size={16} strokeWidth={STROKE} />
          </button>
        </div>
      </div>
    </div>
  );
}
