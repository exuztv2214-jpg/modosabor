import { Clock, ImagePlus, Palette, Plus, Store, Trash2 } from 'lucide-react';

import { resolveAssetUrl } from '../../lib/assets.js';
import { BRAND } from '../../lib/theme.js';
import { SectionCard, InputField, ToggleSwitch } from './ConfigComponents.jsx';

/**
 * Devuelve una advertencia si el turno está mal armado.
 *
 * Un turno que termina antes de empezar es válido cuando cruza la medianoche
 * —de 20:00 a 01:00, que es lo normal en un local de comidas— pero no cuando
 * las dos horas son iguales. Ese caso deja el turno en cero minutos y el
 * sistema deja de aceptar pedidos sin que nadie entienda por qué.
 */
function avisoTurno(turno) {
  const desde = String(turno.desde || '');
  const hasta = String(turno.hasta || '');
  if (!desde || !hasta) return 'Faltan horarios';
  if (desde === hasta) return 'El turno dura cero minutos';
  if (hasta < desde) return 'Cruza la medianoche';
  return null;
}

/** Vista previa de un archivo de marca, con fallback si la ruta está rota. */
function PreviewMarca({ src, alto = 'h-14' }) {
  const url = src ? resolveAssetUrl(src) : null;
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
      {url ? (
        <img src={url} alt="" className={`${alto} w-auto max-w-full object-contain`} />
      ) : (
        <Palette size={22} strokeWidth={1.6} className="text-gray-300" />
      )}
    </div>
  );
}

export default function SeccionGeneral({
  config,
  f,
  turnos,
  addTurno,
  updateTurno,
  removeTurno,
  logoInputRef,
  faviconInputRef,
  assetUploading,
  onLogoFileChange,
  onFaviconFileChange,
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      {/* El título de la sección lo muestra el módulo arriba de las pestañas. */}

      <SectionCard
        icon={Store}
        title="Datos del negocio"
        subtitle="Aparecen en la web, en los tickets y en los mensajes al cliente"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <InputField label="Nombre" {...f('negocio_nombre')} placeholder="Modo Sabor" />
          <InputField
            label="Descripción corta"
            {...f('negocio_descripcion')}
            placeholder="Pizzas, empanadas y milanesas"
            hint="Se muestra debajo del nombre en la web pública."
          />
          <InputField label="Teléfono" {...f('negocio_telefono')} placeholder="3863 40-1122" />
          <InputField label="Email" {...f('negocio_email')} placeholder="hola@modosabor.com.ar" />
          <InputField
            label="CUIT / identificación fiscal"
            {...f('negocio_cuit')}
            placeholder="Se imprime en cotizaciones"
          />
          <div className="md:col-span-2">
            <InputField
              label="Dirección"
              {...f('negocio_direccion')}
              placeholder="Av. principal 123"
            />
          </div>
          <InputField label="Localidad" {...f('negocio_localidad')} placeholder="Monteros" />
          <InputField label="Provincia" {...f('negocio_provincia')} placeholder="Tucumán" />
          <div className="md:col-span-2">
            <InputField
              label="Mensaje al confirmar un pedido"
              {...f('mensaje_confirmacion')}
              placeholder="¡Gracias por tu pedido! Ya lo estamos preparando."
              hint="Es lo que ve el cliente apenas termina de pedir en la web."
            />
          </div>
        </div>

        {/*
          Acá había dos campos más —URL pública de la app y de la API— que
          también existen en la pestaña Avanzado. Eran los mismos dos ajustes
          duplicados en dos lugares: si se editaban en uno y en el otro, ganaba
          el último que se tocara. Quedaron sólo en Avanzado, que es donde
          corresponde por ser configuración de instalación.
        */}
      </SectionCard>

      <SectionCard
        icon={Palette}
        title="Marca"
        subtitle="Logo, ícono del navegador y color del sistema"
      >
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onLogoFileChange}
        />
        <input
          ref={faviconInputRef}
          type="file"
          accept=".ico,image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onFaviconFileChange}
        />

        {/*
          Antes había un campo de texto para pegar la ruta del logo y, aparte y
          más abajo, un botón para subirlo. Dos formas de hacer lo mismo,
          desconectadas entre sí. Quedó sólo la subida: nadie escribe a mano
          la ruta de un archivo.
        */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4">
            <PreviewMarca src={config.negocio_logo} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-gray-900">Logo</p>
              <p className="mt-0.5 truncate text-[12px] text-gray-500">
                {config.negocio_logo || 'Sin logo cargado'}
              </p>
              <button
                type="button"
                onClick={() => logoInputRef?.current?.click()}
                disabled={assetUploading?.logo}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-[12px] font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                <ImagePlus size={14} strokeWidth={1.9} />
                {assetUploading?.logo ? 'Subiendo…' : config.negocio_logo ? 'Cambiar' : 'Subir'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-4">
            <PreviewMarca src={config.negocio_favicon} alto="h-8" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium text-gray-900">Ícono del navegador</p>
              <p className="mt-0.5 truncate text-[12px] text-gray-500">
                {config.negocio_favicon || 'Sin ícono cargado'}
              </p>
              <button
                type="button"
                onClick={() => faviconInputRef?.current?.click()}
                disabled={assetUploading?.favicon}
                className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-[12px] font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                <ImagePlus size={14} strokeWidth={1.9} />
                {assetUploading?.favicon
                  ? 'Subiendo…'
                  : config.negocio_favicon
                    ? 'Cambiar'
                    : 'Subir'}
              </button>
            </div>
          </div>
        </div>

        {/* Color: selector real en vez de un campo donde había que tipear el hex. */}
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-4">
          <input
            type="color"
            value={config.color_primario || BRAND}
            onChange={f('color_primario').onChange}
            aria-label="Color principal"
            className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-gray-900">Color principal</p>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Se usa en la web pública, en los botones y en la app del rider.
            </p>
          </div>
          <input
            {...f('color_primario')}
            placeholder={BRAND}
            className="h-11 w-32 rounded-xl border border-gray-200 bg-white px-3 font-mono text-[13px] uppercase text-gray-800 outline-none transition focus:border-gray-400"
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Clock}
        title="Turnos"
        subtitle="Definen cuándo el sistema acepta pedidos y qué carta muestra la web"
      >
        <div className="space-y-2">
          {turnos.map((turno, index) => {
            const aviso = avisoTurno(turno);
            const activo = turno.activo !== false;
            return (
              <div key={turno.id || index} className="rounded-xl bg-gray-50 p-4">
                <div className="grid gap-3 md:grid-cols-[1.4fr_auto_auto_auto]">
                  <InputField
                    label="Nombre"
                    value={turno.nombre || ''}
                    onChange={(event) => updateTurno(index, 'nombre', event.target.value)}
                    placeholder="Turno noche"
                  />
                  <label className="block">
                    <span className="mb-1 block text-[13px] font-medium text-gray-700">Desde</span>
                    <input
                      type="time"
                      value={turno.desde || '19:00'}
                      onChange={(event) => updateTurno(index, 'desde', event.target.value)}
                      className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-[14px] tabular-nums text-gray-900 outline-none transition focus:border-gray-400"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[13px] font-medium text-gray-700">Hasta</span>
                    <input
                      type="time"
                      value={turno.hasta || '23:30'}
                      onChange={(event) => updateTurno(index, 'hasta', event.target.value)}
                      className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-[14px] tabular-nums text-gray-900 outline-none transition focus:border-gray-400"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeTurno(index)}
                      disabled={turnos.length <= 1}
                      title={
                        turnos.length <= 1
                          ? 'Tiene que quedar al menos un turno'
                          : 'Quitar este turno'
                      }
                      aria-label="Quitar turno"
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition hover:bg-white hover:text-gray-700 disabled:opacity-30"
                    >
                      <Trash2 size={16} strokeWidth={1.9} />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <div className="min-w-[220px] flex-1">
                    <ToggleSwitch
                      checked={activo}
                      onChange={(valor) => updateTurno(index, 'activo', valor)}
                      label={activo ? 'Turno activo' : 'Turno pausado'}
                      description={
                        activo
                          ? 'El sistema acepta pedidos en este horario'
                          : 'No se toman pedidos en este horario'
                      }
                    />
                  </div>
                  {aviso ? (
                    <span
                      className="rounded-lg px-3 py-1.5 text-[11px] font-medium"
                      style={
                        aviso === 'Cruza la medianoche'
                          ? { background: '#F3F4F6', color: '#6B7280' }
                          : { background: '#FEF2F2', color: BRAND }
                      }
                    >
                      {aviso}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addTurno}
          className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-600 transition hover:bg-gray-200"
        >
          <Plus size={15} strokeWidth={1.9} />
          Agregar turno
        </button>
      </SectionCard>
    </div>
  );
}
