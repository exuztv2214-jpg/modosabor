import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  WalletCards,
  ClipboardList,
  Armchair,
  Package,
  Boxes,
  Tag,
  Users,
  Bike,
  BarChart3,
  Settings,
  UtensilsCrossed,
  ExternalLink,
  ChefHat,
  ShieldCheck,
  UserCircle,
  UserSquare2,
  X,
  TicketPercent,
  Megaphone,
  MessageCircle,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';

const links = [
  { type: 'header', label: 'Inicio' },
  {
    to: '/admin/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    permission: 'dashboard.view',
  },
  { to: '/', icon: ExternalLink, label: 'Ver Menú Online' },
  { type: 'header', label: 'Operaciones' },
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
    label: 'Mesas / Salon',
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
  { to: '/admin/categorias', icon: Tag, label: 'Categorias', permission: 'productos.edit' },
  { type: 'header', label: 'Gestión' },
  {
    to: '/admin/clientes',
    icon: Users,
    label: 'Clientes',
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
    label: 'Configuracion',
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
];

export default function Sidebar({ onCloseMobile }) {
  const { user, hasPermission } = useAuth();
  const { config: branding, isModuleEnabled } = useAppConfig();

  const filteredLinks = links.filter((link) => {
    if (link.type === 'header') return true;
    return (
      (!link.permission || hasPermission(link.permission)) &&
      (!link.moduleKey || isModuleEnabled(link.moduleKey))
    );
  });

  // Clean up headers that don't have items below them
  const finalLinks = [];
  for (let i = 0; i < filteredLinks.length; i++) {
    const current = filteredLinks[i];
    if (current.type === 'header') {
      const nextItem = filteredLinks[i + 1];
      if (nextItem && nextItem.type !== 'header') {
        finalLinks.push(current);
      }
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
        <h1 className="text-lg font-black text-gray-900 leading-tight truncate tracking-tight">
          {branding.negocio_nombre || 'Modo Sabor'}
        </h1>
        <p className="text-[10px] font-black text-primary-500 uppercase tracking-widest truncate">
          {branding.negocio_localidad || 'Administración'}
        </p>
      </div>

      {onCloseMobile && (
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-2 hover:bg-gray-100 rounded-lg text-gray-400"
        >
          <X size={18} />
        </button>
      )}
    </div>
  );

  const NavItem = ({ to, icon: Icon, label }) => (
    <NavLink
      key={to}
      to={to}
      onClick={onCloseMobile}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 group relative mb-1 ${
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
      <span className="truncate">{label}</span>
    </NavLink>
  );

  return (
    <div className="flex flex-col h-full bg-white">
      <LogoSection />

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-4 no-scrollbar">
        {finalLinks.map((link, idx) => {
          if (link.type === 'header') {
            return (
              <p
                key={`header-${idx}`}
                className="px-4 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mt-6 mb-3 first:mt-2"
              >
                {link.label}
              </p>
            );
          }
          return <NavItem key={link.to} {...link} />;
        })}

        <div className="mt-8 mb-6 px-4">
          <div className="rounded-[24px] bg-primary-50 p-5 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-primary-500/10 rounded-full transition-transform group-hover:scale-150 duration-700"></div>
            <p className="text-xs font-black text-gray-900 mb-1 relative z-10">¿Necesitas ayuda?</p>
            <p className="text-[10px] text-gray-500 font-bold mb-4 relative z-10 uppercase tracking-tighter">
              Soporte 24/7 activo
            </p>
            <a
              href="https://wa.me/tu-numero"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block w-full py-2 rounded-xl bg-primary-500 text-white text-[10px] font-black uppercase tracking-widest text-center shadow-lg shadow-primary-100 relative z-10 transition-transform hover:scale-105"
            >
              Contactar
            </a>
          </div>
        </div>
      </nav>

      <div className="p-4 border-t border-gray-50">
        <div className="flex items-center gap-3 px-4 py-3 rounded-[20px] bg-gray-50/80 border border-gray-100/50">
          <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-primary-500 to-info-500 flex items-center justify-center text-white font-black text-sm shadow-sm">
            {user?.nombre?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-black text-gray-900 tracking-tight">
              {user?.nombre || 'Administrador'}
            </p>
            <p className="truncate text-[10px] font-bold text-primary-500 uppercase tracking-tighter">
              {user?.rol || 'Admin'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
