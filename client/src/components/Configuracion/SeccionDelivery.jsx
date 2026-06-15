import React from 'react';
import { Clock, MapPin, Truck } from 'lucide-react';
import { SectionCard, InputField, ToggleSwitch } from './ConfigComponents.jsx';

export default function SeccionDelivery({
  config,
  f,
  setToggle,
  deliveryZones,
  addZone,
  removeZone,
  updateZone,
  applyMonterosPreset,
}) {
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-8">
      <div className="sticky top-[84px] z-10 mb-8 flex items-center justify-between rounded-[28px] border border-gray-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-orange-100 flex items-center justify-center">
            <Truck className="text-orange-600" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Delivery y tiempos</h2>
            <p className="text-sm text-gray-500">Configuracion de zonas, tiempos y reparto automatico.</p>
          </div>
        </div>
      </div>

      <SectionCard icon={Clock} tone="orange" title="Operacion general" subtitle="Ajustes de despacho para web, TPV y panel de delivery">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <InputField label="Costo envio base ($)" type="number" {...f('costo_envio_base')} />
          <InputField label="Tiempo delivery (min)" type="number" {...f('tiempo_delivery')} />
          <InputField label="Tiempo retiro (min)" type="number" {...f('tiempo_retiro')} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <ToggleSwitch
            checked={config.delivery_activo !== '0'}
            onChange={(value) => setToggle('delivery_activo', value)}
            label="Delivery habilitado"
            description="Mostrar la opcion de delivery en la carta web publica."
            color="orange"
          />
          <ToggleSwitch
            checked={config.retiro_activo !== '0'}
            onChange={(value) => setToggle('retiro_activo', value)}
            label="Retiro en local habilitado"
            description="Mostrar la opcion de retiro en la carta web publica."
            color="orange"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <ToggleSwitch
            checked={config.delivery_validacion_activa === '1'}
            onChange={(value) => setToggle('delivery_validacion_activa', value)}
            label="Validar direccion por zona"
            description="Solo acepta direcciones dentro de zonas activas."
            color="orange"
          />
          <ToggleSwitch
            checked={config.delivery_requiere_foto_entrega === '1'}
            onChange={(value) => setToggle('delivery_requiere_foto_entrega', value)}
            label="Exigir foto al entregar"
            description="El rider debe adjuntar una foto para cerrar la entrega."
            color="orange"
          />
        </div>

        <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800">
          <p className="font-semibold">Asignacion de riders</p>
          <p className="mt-1">
            En ventas delivery el sistema intenta asignar automaticamente el rider activo mas conveniente. Si trabajas con un solo rider por turno,
            quedara asignado aunque ya este llevando otros pedidos.
          </p>
        </div>
      </SectionCard>

      <SectionCard icon={MapPin} tone="orange" title="Zonas de delivery" subtitle="Define costos y palabras clave por zona">
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={applyMonterosPreset}
            className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100"
          >
            Preset Monteros
          </button>
          <button
            onClick={addZone}
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700"
          >
            Agregar zona
          </button>
        </div>

        <div className="space-y-4">
          {deliveryZones.map((zone, index) => (
            <div key={zone.id || index} className="rounded-2xl border border-gray-200 p-6 bg-gray-50/30 transition-all hover:border-orange-200">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-gray-900">Zona {index + 1}: {zone.nombre || 'Sin nombre'}</p>
                <button
                  onClick={() => removeZone(index)}
                  className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                >
                  Eliminar
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InputField
                  label="Nombre"
                  value={zone.nombre || ''}
                  onChange={(event) => updateZone(index, 'nombre', event.target.value)}
                  placeholder="Ej: Centro"
                />
                <div className="flex items-center pt-6">
                  <ToggleSwitch
                    checked={zone.activa !== false}
                    onChange={(value) => updateZone(index, 'activa', value)}
                    label="Zona activa"
                    color="orange"
                  />
                </div>
                <InputField
                  label="Costo envio ($)"
                  type="number"
                  value={zone.costo_envio ?? 0}
                  onChange={(event) => updateZone(index, 'costo_envio', Number(event.target.value || 0))}
                />
                <InputField
                  label="Tiempo estimado (min)"
                  type="number"
                  value={zone.tiempo_estimado_min ?? 0}
                  onChange={(event) => updateZone(index, 'tiempo_estimado_min', Number(event.target.value || 0))}
                />
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Palabras clave</label>
                  <textarea
                    value={Array.isArray(zone.keywords) ? zone.keywords.join(', ') : ''}
                    onChange={(event) => updateZone(index, 'keywords', event.target.value.split(',').map((item) => item.trim()).filter(Boolean))}
                    rows={2}
                    className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="centro, plaza, barrio norte..."
                  />
                  <p className="mt-2 text-xs text-gray-500">Se usan para reconocer la zona desde la direccion del cliente.</p>
                </div>
              </div>
            </div>
          ))}

          {deliveryZones.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-sm text-gray-500 text-center">
              No hay zonas configuradas.
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
