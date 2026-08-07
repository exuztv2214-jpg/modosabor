import { motion } from 'framer-motion';
import { Home, History, User } from 'lucide-react';

import { BRAND } from '../../lib/theme.js';
import { haptic } from '../../lib/riderHaptics.js';

const TABS = [
  { key: 'pedidos', label: 'Inicio', icon: Home },
  { key: 'historial', label: 'Historial', icon: History },
  { key: 'perfil', label: 'Perfil', icon: User },
];

/**
 * Barra de navegación inferior.
 *
 * Va abajo y no arriba por ergonomía: el rider usa el celular con una
 * mano, muchas veces con guantes, y el pulgar no llega cómodo a la
 * parte superior de una pantalla de 6".
 *
 * El indicador del tab activo es un `layoutId` de framer-motion, así
 * la píldora se desliza entre tabs en vez de aparecer y desaparecer.
 *
 * Props:
 *   activo         key del tab actual
 *   onChange       fn(key)
 *   badgeHistorial número a mostrar sobre Historial (entregas del día)
 */
export default function BottomTabBar({ activo, onChange, badgeHistorial = 0 }) {
  return (
    <nav className="sticky bottom-0 z-30 border-t border-gray-100 bg-white/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-2xl items-stretch">
        {TABS.map(({ key, label, icon: Icon }) => {
          const esActivo = activo === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (esActivo) return;
                haptic('tap');
                onChange?.(key);
              }}
              aria-current={esActivo ? 'page' : undefined}
              className="relative flex flex-1 flex-col items-center gap-1 py-2.5"
            >
              <span className="relative flex h-9 w-16 items-center justify-center">
                {/* La app del rider tenía la llama roja de Modo Sabor arriba y
                    la navegación azul abajo, porque `primary-*` era el azul de
                    la plantilla comprada. Va en BRAND como todo el resto. */}
                {esActivo && (
                  <motion.span
                    layoutId="tab-pill"
                    transition={{ type: 'spring', damping: 26, stiffness: 380 }}
                    className="absolute inset-0 rounded-2xl"
                    style={{ background: '#FEF2F2' }}
                  />
                )}
                <span className="relative">
                  <Icon
                    size={20}
                    strokeWidth={esActivo ? 2.8 : 2.2}
                    className={esActivo ? '' : 'text-gray-400'}
                    style={esActivo ? { color: BRAND } : undefined}
                  />
                  {key === 'historial' && badgeHistorial > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[12px] font-semibold tabular-nums text-white">
                      {badgeHistorial > 99 ? '99+' : badgeHistorial}
                    </span>
                  )}
                </span>
              </span>
              <span
                className={`text-[13px] font-medium transition-colors ${
                  esActivo ? '' : 'text-gray-400'
                }`}
                style={esActivo ? { color: BRAND } : undefined}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
