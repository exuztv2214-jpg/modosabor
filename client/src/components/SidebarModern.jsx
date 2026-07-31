import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  UserCircle,
  UserSquare2,
  Users,
  UtensilsCrossed,
  WalletCards,
  X,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import { socketManager } from '../lib/socket.js';

const links = [
  { type: 'header', label: 'Inicio' },
  {
    to: '/admin/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    permission: 'dashboard.view',
  },
  { to: '/', icon: ExternalLink, label: 'Ver Menu Online' },
  { type: 'header', label: 'Operaciones' },
  {
    to: '/admin/operacion',
    icon: ClipboardCheck,
    label: 'Control diario',
    permission: 'dashboard.view',
  },
  {
    to: '/admin/tpv',
    icon: ShoppingCart,
    label: 'TPV / Caja',
    permission: 'tpv.use',
    moduleKey: 'tpv',
  },
  {
    to: '/admin/caja',
    icon: WalletCards,
    label: 'Cierre de Caja',
    permission: 'caja.view',
    moduleKey: 'caja',
  },
  { to: '/admin/pedidos', icon: ClipboardList, label: 'Pedidos', permission: 'pedidos.view' },
  {
    to: '/admin/whatsapp-copiloto',
    icon: MessageCircle,
    label: 'WhatsApp Copiloto',
    permission: 'pedidos.view',
  },
  {
    to: '/admin/kds',
    icon: ChefHat,
    label: 'Cocina / KDS',
    permission: 'kds.view',
    moduleKey: 'kds',
  },
  {
    to: '/admin/mesas',
    icon: Armchair,
    label: 'Mesas / Salón',
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
  { type: 'header', label: 'Catálogo' },
  { to: '/admin/productos', icon: Package, label: 'Productos', permission: 'productos.edit' },
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
  { to: '/admin/categorias', icon: Tag, label: 'Categorías', permission: 'productos.edit' },
  { type: 'header', label: 'Gestión' },
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
    to: '/admin/marketing',
    icon: Megaphone,
    label: 'Marketing Digital',
    permission: 'reportes.view',
    moduleKey: 'marketing',
  },
  {
    to: '/admin/reportes',
    icon: BarChart3,
    label: 'Reportes',
    permission: 'reportes.view',
    moduleKey: 'reportes',
  },
  { type: 'header', label: 'Configuración' },
  { to: '/admin/cuenta', icon: UserCircle, label: 'Mi cuenta' },
  {
    to: '/admin/configuracion',
    icon: Settings,
    label: 'Configuración',
    permission: 'config.manage',
  },
  {
    to: '/admin/personal',
    icon: UserSquare2,
    label: 'Personal',
    permission: 'config.manage',
    moduleKey: 'personal',
  },
  { to: '/admin/usuarios', icon: ShieldCheck, label: 'Usuarios', permission: 'config.manage' },
  {
    to: '/admin/cupones',
    icon: TicketPercent,
    label: 'Cupones',
    permission: 'config.manage',
    moduleKey: 'cupones',
  },
  { to: '/admin/auditoria', icon: ShieldAlert, label: 'Auditoría', permission: 'config.manage' },
];

export default function SidebarModern({ onCloseMobile }) {
  const { user, hasPermission } = useAuth();
  const { config: branding, isModuleEnabled } = useAppConfig();
  const location = useLocation();
  const [pedidosBadge, setPedidosBadge] = useState(0);

  // Reset badge when navigating to pedidos
  useEffect(() => {
    if (location.pathname === '/admin/pedidos') {
      setPedidosBadge(0);
    }
  }, [location.pathname]);

  // Subscribe to new orders via socket
  useEffect(() => {
    if (!user) return;
    const unsub = socketManager.on('nuevo_pedido', () => {
      if (location.pathname !== '/admin/pedidos') {
        setPedidosBadge((n) => n + 1);
      }
    });
    return unsub;
  }, [user, location.pathname]);

  const filteredLinks = links.filter((link) => {
    if (link.type === 'header') return true;
    return (
      (!link.permission || hasPermission(link.permission)) &&
      (!link.moduleKey || isModuleEnabled(link.moduleKey))
    );
  });

  const finalLinks = [];
  for (let i = 0; i < filteredLinks.length; i += 1) {
    const current = filteredLinks[i];
    if (current.type === 'header') {
      const nextItem = filteredLinks[i + 1];
      if (nextItem && nextItem.type !== 'header') finalLinks.push(current);
    } else {
      finalLinks.push(current);
    }
  }

  const LogoSection = () => (
    <div className="mb-4 flex min-h-[88px] items-center gap-3 border-b border-gray-50/50 px-5 py-4">
      {branding.negocio_logo ? (
        <img
          src={branding.negocio_logo}
          alt={branding.negocio_nombre || 'Logo del negocio'}
          className="h-14 w-16 shrink-0 object-contain object-left"
        />
      ) : (
        <div className="flex h-14 w-16 shrink-0 items-center justify-center text-primary-500">
          <UtensilsCrossed size={30} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-black leading-tight tracking-tight text-gray-900">
          {branding.negocio_nombre || 'Modo Sabor'}
        </h1>
        <p className="truncate text-[10px] font-black uppercase tracking-widest text-primary-500">
          {branding.negocio_localidad || 'Administración'}
        </p>
      </div>

      {onCloseMobile && (
        <button
          onClick={onCloseMobile}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 lg:hidden"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );

  const NavItem = ({ to, icon: Icon, label, badge }) => (
    <NavLink
      key={to}
      to={to}
      onClick={onCloseMobile}
      className={({ isActive }) =>
        `group relative mb-1 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 ${
          isActive
            ? 'bg-primary-500 text-white shadow-lg shadow-primary-200'
            : 'text-gray-500 hover:bg-primary-50 hover:text-primary-500'
        }`
      }
    >
      <Icon
        size={19}
        className="shrink-0 transition-transform duration-200 group-hover:scale-110"
      />
      <span className="truncate flex-1">{label}</span>
      {badge > 0 && (
        <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger-500 px-1.5 text-[10px] font-black text-white shadow-sm animate-pulse">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="flex h-full flex-col bg-white">
      <LogoSection />

      <nav className="no-scrollbar flex-1 overflow-x-hidden overflow-y-auto px-4 py-2">
        {finalLinks.map((link, idx) => {
          if (link.type === 'header') {
            return (
              <p
                key={`header-${idx}`}
                className="mb-3 mt-6 px-4 text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 first:mt-2"
              >
                {link.label}
              </p>
            );
          }
          const badge = link.to === '/admin/pedidos' ? pedidosBadge : 0;
          return <NavItem key={link.to} {...link} badge={badge} />;
        })}

        {branding.negocio_telefono && (
          <div className="mb-6 mt-8 px-4">
            <div className="group relative overflow-hidden rounded-[24px] bg-primary-50 p-5">
              <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-primary-500/10 transition-transform duration-700 group-hover:scale-150" />
              <p className="relative z-10 mb-1 text-xs font-black text-gray-900">
                ¿Necesitas ayuda?
              </p>
              <p className="relative z-10 mb-4 text-[10px] font-bold uppercase tracking-tighter text-gray-500">
                Soporte disponible
              </p>
              <a
                href={`https://wa.me/${String(branding.negocio_telefono).replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative z-10 inline-block w-full rounded-xl bg-primary-500 py-2 text-center text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-transform hover:scale-105"
              >
                Contactar
              </a>
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-gray-50 p-4 space-y-2">
        <div className="flex items-center gap-3 rounded-[20px] border border-gray-100/50 bg-gray-50/80 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-info-500 text-sm font-black text-white shadow-sm">
            {user?.nombre?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black tracking-tight text-gray-900">
              {user?.nombre || 'Administrador'}
            </p>
            <p className="truncate text-[10px] font-bold uppercase tracking-tighter text-primary-500">
              {user?.rol || 'Admin'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
