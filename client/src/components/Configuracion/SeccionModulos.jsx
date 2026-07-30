import React from 'react';
import {
  Armchair,
  Bike,
  Boxes,
  ChefHat,
  LayoutGrid,
  Receipt,
  ShoppingCart,
  Store,
  TicketPercent,
  Users,
  UserSquare2,
  WalletCards,
  Wand2,
  Megaphone,
} from 'lucide-react';

import { SectionCard, ToggleSwitch } from './ConfigComponents.jsx';

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
    label: 'TPV / Punto de venta',
    description: 'Mantiene habilitada la pantalla de venta y cobro.',
    icon: ShoppingCart,
  },
  {
    key: 'modulo_caja_activo',
    label: 'Caja',
    description: 'Muestra aperturas, cierres y movimientos de caja.',
    icon: WalletCards,
  },
  {
    key: 'modulo_kds_activo',
    label: 'Cocina / KDS',
    description: 'Oculta la pantalla de cocina si trabajas con comandas impresas.',
    icon: ChefHat,
  },
  {
    key: 'modulo_mesas_activo',
    label: 'Mesas / salon',
    description: 'Activa la gestion de mesas y reservas del local.',
    icon: Armchair,
  },
  {
    key: 'modulo_delivery_activo',
    label: 'Delivery',
    description: 'Mantiene visible la operacion de riders y despachos.',
    icon: Bike,
  },
  {
    key: 'modulo_inventario_activo',
    label: 'Inventario',
    description: 'Muestra stock, recetas, compras y movimientos.',
    icon: Boxes,
  },
];

const GESTION = [
  {
    key: 'modulo_clientes_activo',
    label: 'Clientes',
    description: 'Habilita la ficha de clientes y su historial.',
    icon: Users,
  },
  {
    key: 'modulo_reportes_activo',
    label: 'Reportes',
    description: 'Activa metricas, resumenes y analitica.',
    icon: Receipt,
  },
  {
    key: 'modulo_personal_activo',
    label: 'Personal',
    description: 'Activa la gestion del equipo operativo.',
    icon: UserSquare2,
  },
  {
    key: 'modulo_cupones_activo',
    label: 'Cupones',
    description: 'Muestra descuentos y promociones reutilizables.',
    icon: TicketPercent,
  },
  {
    key: 'modulo_marketing_activo',
    label: 'Marketing Digital',
    description: 'Activa campañas, promos, contenido y captacion.',
    icon: Megaphone,
  },
];

const PRESETS = [
  {
    id: 'mostrador',
    label: 'Solo Mostrador',
    description: 'Ideal para venta en local con ticket y comandas impresas, sin delivery ni KDS.',
    icon: Store,
    accent: 'amber',
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
    label: 'Delivery + TPV',
    description:
      'Pensado para mostrador, pedidos delivery y comandas impresas, sin pantalla de cocina.',
    icon: Bike,
    accent: 'sky',
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
    label: 'Operacion Completa',
    description:
      'Deja visibles todos los modulos para una operacion integral con salon, KDS y delivery.',
    icon: Wand2,
    accent: 'emerald',
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

const PRESET_ACCENTS = {
  amber: {
    shell: 'border-amber-200 bg-warning-50/70',
    icon: 'bg-warning-100 text-warning-700',
    button: 'bg-warning-500 hover:bg-amber-600 text-white',
  },
  sky: {
    shell: 'border-sky-200 bg-sky-50/70',
    icon: 'bg-sky-100 text-sky-700',
    button: 'bg-sky-600 hover:bg-sky-700 text-white',
  },
  emerald: {
    shell: 'border-emerald-200 bg-success-50/70',
    icon: 'bg-success-100 text-success-700',
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

function ModuleGrid({ items, config, setToggle }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((item) => {
        const Icon = item.icon;
        const enabled = String(config[item.key] ?? '1') !== '0';
        return (
          <div key={item.key} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <Icon size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
            </div>
            <ToggleSwitch
              checked={enabled}
              onChange={(value) => setToggle(item.key, value)}
              label={enabled ? 'Modulo visible' : 'Modulo oculto'}
              description="Al desactivarlo se esconde del menu y se bloquea su ruta administrativa."
              color="blue"
            />
          </div>
        );
      })}
    </div>
  );
}

export default function SeccionModulos({ config, setToggle, setConfig }) {
  const activos = MODULE_KEYS.filter((key) => String(config[key] ?? '1') !== '0').length;

  const applyPreset = (preset) => {
    setConfig((prev) => ({ ...prev, ...preset.modules }));
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-8">
      <div className="sticky top-[84px] z-10 mb-8 flex items-center justify-between rounded-[28px] border border-gray-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-sky-100 flex items-center justify-center">
            <LayoutGrid className="text-sky-600" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Modulos del sistema</h2>
            <p className="text-sm text-gray-500">
              Activa solo las pantallas que necesitas para esta etapa del negocio.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-100 px-4 py-2 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            Activos
          </p>
          <p className="text-lg font-black text-slate-900">
            {activos}/{MODULE_KEYS.length}
          </p>
        </div>
      </div>

      <SectionCard
        icon={Wand2}
        tone="blue"
        title="Modos rapidos de operacion"
        subtitle="Aplica una base recomendada y luego ajusta solo lo fino si hace falta"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PRESETS.map((preset) => {
            const Icon = preset.icon;
            const accent = PRESET_ACCENTS[preset.accent] || PRESET_ACCENTS.sky;
            return (
              <div key={preset.id} className={`rounded-3xl border p-5 ${accent.shell}`}>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent.icon}`}
                  >
                    <Icon size={22} />
                  </div>
                  <button
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${accent.button}`}
                  >
                    Aplicar
                  </button>
                </div>
                <h4 className="text-base font-black text-gray-900">{preset.label}</h4>
                <p className="mt-2 text-sm leading-6 text-gray-600">{preset.description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {Object.entries(preset.modules)
                    .filter(([key]) => key.startsWith('modulo_'))
                    .map(([key, value]) => (
                      <span
                        key={key}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                          value === '1'
                            ? 'bg-white text-gray-700'
                            : 'bg-gray-900/5 text-gray-400 line-through'
                        }`}
                      >
                        {key.replace('modulo_', '').replace('_activo', '').replaceAll('_', ' ')}
                      </span>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={LayoutGrid}
        tone="blue"
        title="Operacion diaria"
        subtitle="Pantallas que afectan el trabajo del local"
      >
        <ModuleGrid items={OPERATIVOS} config={config} setToggle={setToggle} />
      </SectionCard>

      <SectionCard
        icon={Users}
        tone="blue"
        title="Gestion y soporte"
        subtitle="Herramientas administrativas complementarias"
      >
        <ModuleGrid items={GESTION} config={config} setToggle={setToggle} />
      </SectionCard>
    </div>
  );
}
