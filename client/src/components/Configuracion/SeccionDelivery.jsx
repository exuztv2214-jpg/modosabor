import { Clock, MapPin, Plus, Trash2 } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { SectionCard, InputField, ToggleSwitch } from './ConfigComponents.jsx';

const fmt = (valor) => `$${Number(valor || 0).toLocaleString('es-AR')}`;

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
  const validacionActiva = config.delivery_validacion_activa === '1';
  const zonasActivas = deliveryZones.filter((zona) => zona.activa !== false).length;
  const sinPalabras = deliveryZones.filter(
    (zona) => zona.activa !== false && (!Array.isArray(zona.keywords) || zona.keywords.length === 0)
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      {/* El título de la sección lo muestra el módulo arriba de las pestañas. */}

      <SectionCard
        icon={Clock}
        title="Cómo se despacha"
        subtitle="Qué opciones ve el cliente y cuánto se le promete"
      >
        <div className="space-y-1">
          <ToggleSwitch
            checked={config.delivery_activo !== '0'}
            onChange={(value) => setToggle('delivery_activo', value)}
            label="Aceptar pedidos con envío"
            description="Si lo apagás, la web deja de ofrecer delivery."
          />
          <ToggleSwitch
            checked={config.retiro_activo !== '0'}
            onChange={(value) => setToggle('retiro_activo', value)}
            label="Aceptar retiro en el local"
            description="Si lo apagás, la web deja de ofrecer retiro por mostrador."
          />
          <ToggleSwitch
            checked={config.delivery_requiere_foto_entrega === '1'}
            onChange={(value) => setToggle('delivery_requiere_foto_entrega', value)}
            label="Pedir foto al entregar"
            description="El rider no puede cerrar la entrega sin adjuntar una foto."
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <InputField
            label="Costo de envío base"
            type="number"
            {...f('costo_envio_base')}
            hint="Se usa cuando la dirección no cae en ninguna zona."
          />
          <InputField
            label="Demora de envío"
            type="number"
            {...f('tiempo_delivery')}
            hint="En minutos. Es lo que se le promete al cliente."
          />
          <InputField
            label="Demora de retiro"
            type="number"
            {...f('tiempo_retiro')}
            hint="En minutos, desde que confirma hasta que puede pasar."
          />
        </div>

        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-[12px] leading-relaxed text-gray-500">
          Al vender un delivery el sistema asigna solo el rider libre más conveniente. Si trabajás
          con uno solo por turno, queda asignado aunque ya esté llevando otros pedidos.
        </p>
      </SectionCard>

      <SectionCard
        icon={MapPin}
        title="Zonas de reparto"
        subtitle={
          deliveryZones.length > 0
            ? `${zonasActivas} de ${deliveryZones.length} activas`
            : 'Todavía no cargaste ninguna zona'
        }
        action={
          <div className="flex flex-wrap gap-2">
            {deliveryZones.length === 0 ? (
              <button
                type="button"
                onClick={applyMonterosPreset}
                className="h-10 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-600 transition hover:bg-gray-200"
              >
                Usar zonas de Monteros
              </button>
            ) : null}
            <button
              type="button"
              onClick={addZone}
              style={{ background: BRAND }}
              className="flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              <Plus size={15} strokeWidth={STROKE} />
              Agregar zona
            </button>
          </div>
        }
      >
        {/*
          Este interruptor vivía suelto entre otros cuatro, arriba de todo.
          Pero sólo tiene sentido en el contexto de las zonas: activa la
          restricción de que una dirección tiene que caer en alguna. Puesto
          acá, al lado de la lista que gobierna, se entiende sin explicación.
        */}
        <div className="mb-3">
          <ToggleSwitch
            checked={validacionActiva}
            onChange={(value) => setToggle('delivery_validacion_activa', value)}
            label="Sólo aceptar direcciones dentro de estas zonas"
            description={
              validacionActiva
                ? 'La web rechaza direcciones que no reconoce.'
                : 'Se acepta cualquier dirección y se cobra el envío base.'
            }
            tone={validacionActiva ? BRAND : undefined}
          />
        </div>

        {validacionActiva && sinPalabras > 0 ? (
          <p
            className="mb-3 rounded-xl px-4 py-3 text-[12px] font-medium leading-relaxed"
            style={{ background: '#FEF2F2', color: '#7A0F17' }}
          >
            {sinPalabras} zona{sinPalabras === 1 ? '' : 's'} activa
            {sinPalabras === 1 ? '' : 's'} sin palabras clave. Con la validación encendida, el
            sistema no puede reconocer esas direcciones y va a rechazar los pedidos.
          </p>
        ) : null}

        {deliveryZones.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-10 text-center">
            <MapPin size={24} strokeWidth={1.4} className="mx-auto mb-2 text-gray-300" />
            <p className="text-[13px] font-medium text-gray-500">Sin zonas configuradas</p>
            <p className="mt-1 text-[12px] text-gray-400">
              Sin zonas, todos los envíos cobran el costo base.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {deliveryZones.map((zona, index) => {
              const activa = zona.activa !== false;
              const palabras = Array.isArray(zona.keywords) ? zona.keywords : [];
              return (
                <div
                  key={zona.id || index}
                  className={`rounded-xl p-4 transition ${activa ? 'bg-gray-50' : 'bg-gray-50/60'}`}
                >
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className={`text-[14px] font-semibold ${activa ? 'text-gray-900' : 'text-gray-400'}`}
                    >
                      {zona.nombre || `Zona ${index + 1}`}
                    </span>
                    <span className="text-[12px] tabular-nums text-gray-400">
                      {fmt(zona.costo_envio)} · {zona.tiempo_estimado_min || 0} min
                    </span>
                    <button
                      type="button"
                      onClick={() => updateZone(index, 'activa', !activa)}
                      className={`ml-auto shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${activa ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'}`}
                    >
                      {activa ? 'Activa' : 'Pausada'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la zona "${zona.nombre || index + 1}"?`)) {
                          removeZone(index);
                        }
                      }}
                      aria-label="Eliminar zona"
                      className="shrink-0 rounded-lg p-1.5 text-gray-300 transition hover:bg-white hover:text-gray-700"
                    >
                      <Trash2 size={15} strokeWidth={STROKE} />
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <InputField
                      label="Nombre"
                      value={zona.nombre || ''}
                      onChange={(event) => updateZone(index, 'nombre', event.target.value)}
                      placeholder="Centro"
                    />
                    <InputField
                      label="Costo de envío"
                      type="number"
                      value={zona.costo_envio ?? 0}
                      onChange={(event) =>
                        updateZone(index, 'costo_envio', Number(event.target.value || 0))
                      }
                    />
                    <InputField
                      label="Demora estimada"
                      type="number"
                      value={zona.tiempo_estimado_min ?? 0}
                      onChange={(event) =>
                        updateZone(index, 'tiempo_estimado_min', Number(event.target.value || 0))
                      }
                    />
                  </div>

                  <div className="mt-3">
                    <label className="block">
                      <span className="mb-1 block text-[13px] font-medium text-gray-700">
                        Palabras que identifican la zona
                      </span>
                      <input
                        value={palabras.join(', ')}
                        onChange={(event) =>
                          updateZone(
                            index,
                            'keywords',
                            event.target.value
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean)
                          )
                        }
                        placeholder="centro, plaza, barrio norte"
                        className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-[14px] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400"
                      />
                    </label>
                    {palabras.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {palabras.map((palabra) => (
                          <span
                            key={palabra}
                            className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-600"
                          >
                            {palabra}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-gray-400">
                        Separalas con comas. El sistema las busca dentro de la dirección que escribe
                        el cliente.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
