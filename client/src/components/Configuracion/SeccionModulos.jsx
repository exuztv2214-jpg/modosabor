import {
  Armchair,
  Bike,
  Boxes,
  Check,
  ChefHat,
  LayoutGrid,
  Megaphone,
  Receipt,
  ShoppingCart,
  Store,
  TicketPercent,
  Users,
  UserSquare2,
  WalletCards,
  Wand2,
} from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { SectionCard } from './ConfigComponents.jsx';

const MODULE_KEYS = [
  'modulo_tpv_activo',
  'modulo_caja_activo',
  'modulo_kds_activo',
  'modulo_mesas_activo',
  'modulo_delivery_activo',
  'modulo_inventario_activo',
  'modulo_clientes_activo',
  'modulo_reportes_activo',
  'modulo_personal_activo',
  'modulo_cupones_activo',
  'modulo_marketing_activo',
];

const OPERATIVOS = [
  {
    key: 'modulo_tpv_activo',
    label: 'Punto de venta',
    description: 'La pantalla de venta y cobro del mostrador',
    icon: ShoppingCart,
  },
  {
    key: 'modulo_caja_activo',
    label: 'Caja',
    description: 'Apertura, cierre y movimientos del turno',
    icon: WalletCards,
  },
  {
    key: 'modulo_kds_activo',
    label: 'Pantalla de cocina',
    description: 'Apagalo si trabajás con comandas impresas',
    icon: ChefHat,
  },
  {
    key: 'modulo_mesas_activo',
    label: 'Mesas y salón',
    description: 'Gestión de mesas y reservas',
    icon: Armchair,
  },
  {
    key: 'modulo_delivery_activo',
    label: 'Delivery',
    description: 'Riders, despachos y seguimiento',
    icon: Bike,
  },
  {
    key: 'modulo_inventario_activo',
    label: 'Inventario',
    description: 'Stock, recetas, compras y movimientos',
    icon: Boxes,
  },
];

const GESTION = [
  {
    key: 'modulo_clientes_activo',
    label: 'Clientes',
    description: 'Ficha, historial y fidelización',
    icon: Users,
  },
  {
    key: 'modulo_reportes_activo',
    label: 'Reportes',
    description: 'Métricas, resúmenes y análisis',
    icon: Receipt,
  },
  {
    key: 'modulo_personal_activo',
    label: 'Personal',
    description: 'Equipo, turnos y liquidaciones',
    icon: UserSquare2,
  },
  {
    key: 'modulo_cupones_activo',
    label: 'Cupones',
    description: 'Descuentos y promociones reutilizables',
    icon: TicketPercent,
  },
  {
    key: 'modulo_marketing_activo',
    label: 'Marketing',
    description: 'Campañas, promos y contenido',
    icon: Megaphone,
  },
];

const PRESETS = [
  {
    id: 'mostrador',
    label: 'Solo mostrador',
    description: 'Venta en local con comandas impresas. Sin delivery ni pantalla de cocina.',
    icon: Store,
    modules: {
      modulo_tpv_activo: '1',
      modulo_caja_activo: '1',
      modulo_kds_activo: '0',
      modulo_mesas_activo: '0',
      modulo_delivery_activo: '0',
      modulo_inventario_activo: '1',
      modulo_clientes_activo: '1',
      modulo_reportes_activo: '1',
      modulo_personal_activo: '1',
      modulo_cupones_activo: '1',
      modulo_marketing_activo: '0',
      delivery_autoasignar_activo: '0',
    },
  },
  {
    id: 'delivery_tpv',
    label: 'Mostrador + delivery',
    description: 'Mostrador y reparto con comandas impresas. Sin pantalla de cocina ni salón.',
    icon: Bike,
    modules: {
      modulo_tpv_activo: '1',
      modulo_caja_activo: '1',
      modulo_kds_activo: '0',
      modulo_mesas_activo: '0',
      modulo_delivery_activo: '1',
      modulo_inventario_activo: '1',
      modulo_clientes_activo: '1',
      modulo_reportes_activo: '1',
      modulo_personal_activo: '1',
      modulo_cupones_activo: '1',
      modulo_marketing_activo: '1',
      delivery_autoasignar_activo: '1',
    },
  },
  {
    id: 'full',
    label: 'Operación completa',
    description: 'Todo activo: salón, pantalla de cocina, delivery y gestión.',
    icon: Wand2,
    modules: {
      modulo_tpv_activo: '1',
      modulo_caja_activo: '1',
      modulo_kds_activo: '1',
      modulo_mesas_activo: '1',
      modulo_delivery_activo: '1',
      modulo_inventario_activo: '1',
      modulo_clientes_activo: '1',
      modulo_reportes_activo: '1',
      modulo_personal_activo: '1',
      modulo_cupones_activo: '1',
      modulo_marketing_activo: '1',
      delivery_autoasignar_activo: '1',
    },
  },
];

const estaActivo = (config, key) => String(config[key] ?? '1') !== '0';

/**
 * Fila de un módulo.
 *
 * Antes cada módulo era una tarjeta con ícono, nombre, descripción y adentro
 * otro interruptor que traía su propia etiqueta y su propia descripción —la
 * misma frase repetida once veces, una por módulo. Ahora es una fila: ícono,
 * nombre, para qué sirve, y el interruptor. Once filas entran donde antes
 * entraban cuatro tarjetas.
 */
function ModuloRow({ item, activo, onToggle }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={() => onToggle(item.key, !activo)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-gray-50"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
        style={
          activo
            ? { background: '#FEF2F2', color: BRAND }
            : { background: '#F3F4F6', color: '#9CA3AF' }
        }
      >
        <Icon size={17} strokeWidth={STROKE} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[14px] font-medium leading-tight ${activo ? 'text-gray-900' : 'text-gray-400'}`}
        >
          {item.label}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">
          {item.description}
        </span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${activo ? '' : 'bg-gray-200'}`}
        style={activo ? { background: '#111827' } : undefined}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${activo ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}

export default function SeccionModulos({ config, setToggle, setConfig }) {
  const activos = MODULE_KEYS.filter((key) => estaActivo(config, key)).length;

  /**
   * Detecta si la configuración actual coincide exactamente con algún preset.
   * Sirve para marcar cuál está aplicado en vez de mostrar tres botones
   * idénticos sin decir en cuál estás parado.
   */
  const presetActual = PRESETS.find((preset) =>
    MODULE_KEYS.every((key) => String(config[key] ?? '1') === String(preset.modules[key] ?? '1'))
  );

  const aplicarPreset = (preset) => {
    // Cambia once ajustes de una. Sin confirmación, alguien que toca "Solo
    // mostrador" por curiosidad se apaga el delivery sin enterarse.
    const apagados = MODULE_KEYS.filter(
      (key) => estaActivo(config, key) && preset.modules[key] === '0'
    );
    const detalle =
      apagados.length > 0
        ? `\n\nSe van a ocultar ${apagados.length} módulo${apagados.length === 1 ? '' : 's'} que hoy están activos.`
        : '';
    if (!window.confirm(`¿Aplicar el modo "${preset.label}"?${detalle}`)) return;
    setConfig((prev) => ({ ...prev, ...preset.modules }));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      {/* El título de la sección lo muestra el módulo arriba de las pestañas. */}

      <SectionCard
        icon={Wand2}
        title="Modo de operación"
        subtitle="Una base recomendada según cómo trabaja el local. Después ajustás lo fino."
        action={
          <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-4 text-[13px] font-medium text-gray-600">
            Activos
            <strong className="font-semibold tabular-nums text-gray-900">
              {activos}/{MODULE_KEYS.length}
            </strong>
          </span>
        }
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            const aplicado = presetActual?.id === preset.id;
            return (
              <div
                key={preset.id}
                className="flex flex-col rounded-xl bg-gray-50 p-4"
                style={aplicado ? { boxShadow: `inset 0 0 0 2px ${BRAND}` } : undefined}
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-white"
                    style={{ color: aplicado ? BRAND : '#6B7280' }}
                  >
                    <Icon size={19} strokeWidth={STROKE} />
                  </span>
                  {aplicado ? (
                    <span
                      className="flex items-center gap-1 text-[11px] font-semibold"
                      style={{ color: BRAND }}
                    >
                      <Check size={13} strokeWidth={2.6} />
                      Aplicado
                    </span>
                  ) : null}
                </div>
                <h4 className="mt-3 text-[14px] font-semibold text-gray-900">{preset.label}</h4>
                <p className="mt-1 flex-1 text-[12px] leading-relaxed text-gray-500">
                  {preset.description}
                </p>
                <button
                  type="button"
                  onClick={() => aplicarPreset(preset)}
                  disabled={aplicado}
                  className="mt-4 h-10 rounded-xl bg-gray-900 text-[12px] font-semibold text-white transition hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  {aplicado ? 'En uso' : 'Aplicar'}
                </button>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={LayoutGrid}
        title="Operación diaria"
        subtitle="Pantallas que usa el equipo durante el turno"
      >
        <div className="space-y-0.5">
          {OPERATIVOS.map((item) => (
            <ModuloRow
              key={item.key}
              item={item}
              activo={estaActivo(config, item.key)}
              onToggle={setToggle}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={Users}
        title="Gestión"
        subtitle="Herramientas administrativas, fuera del trabajo del mostrador"
      >
        <div className="space-y-0.5">
          {GESTION.map((item) => (
            <ModuloRow
              key={item.key}
              item={item}
              activo={estaActivo(config, item.key)}
              onToggle={setToggle}
            />
          ))}
        </div>

        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-[12px] leading-relaxed text-gray-500">
          Ocultar un módulo no borra nada: los datos se conservan y vuelven a aparecer apenas lo
          reactivás. Sólo desaparece del menú y se bloquea su pantalla.
        </p>
      </SectionCard>
    </div>
  );
}
