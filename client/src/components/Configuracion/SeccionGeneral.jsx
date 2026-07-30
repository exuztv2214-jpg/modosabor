import React from 'react';
import { Building2, Clock, ImagePlus, Palette, Plus, Store, Trash2 } from 'lucide-react';

import { SectionCard, InputField } from './ConfigComponents.jsx';

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
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-8">
      <div className="sticky top-[84px] z-10 mb-8 flex items-center justify-between rounded-[28px] border border-gray-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50">
            <Building2 className="text-primary-500" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Información del negocio</h2>
            <p className="text-sm text-gray-500">
              Datos generales, branding y turnos operativos reales.
            </p>
          </div>
        </div>
      </div>

      <SectionCard
        icon={Store}
        tone="indigo"
        title="Datos del negocio"
        subtitle="Información visible para clientes y equipo"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <InputField
            label="Nombre del negocio"
            {...f('negocio_nombre')}
            placeholder="Modo Sabor"
          />
          <InputField
            label="Descripción corta"
            {...f('negocio_descripcion')}
            placeholder="Pizzas, empanadas y milanesas"
          />
          <InputField label="Teléfono" {...f('negocio_telefono')} placeholder="+54..." />
          <InputField label="Email" {...f('negocio_email')} placeholder="hola@modosabor.com" />
          <div className="md:col-span-2">
            <InputField
              label="Dirección"
              {...f('negocio_direccion')}
              placeholder="Av. principal 123"
            />
          </div>
          <InputField label="Localidad" {...f('negocio_localidad')} placeholder="Monteros" />
          <InputField label="Provincia" {...f('negocio_provincia')} placeholder="Tucuman" />
          <InputField
            label="URL pública app"
            {...f('public_app_url')}
            placeholder="https://tuweb.com"
          />
          <InputField
            label="URL pública API"
            {...f('public_api_url')}
            placeholder="https://tuapi.com"
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Palette}
        tone="indigo"
        title="Identidad visual"
        subtitle="Logo y color principal del sistema"
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

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <InputField
            label="Logo"
            {...f('negocio_logo')}
            placeholder="/uploads/logo.png o https://..."
          />
          <InputField
            label="Favicon"
            {...f('negocio_favicon')}
            placeholder="/uploads/favicon.ico o https://..."
          />
          <InputField label="Color principal" {...f('color_primario')} placeholder="#f97316" />
          <InputField
            label="Mensaje de confirmacion"
            {...f('mensaje_confirmacion')}
            placeholder="Gracias por tu pedido"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">Logo del negocio</p>
                <p className="mt-1 text-xs text-gray-500">
                  Puedes seguir usando un enlace o subir el archivo directamente desde aquí.
                </p>
              </div>
              <button
                type="button"
                onClick={() => logoInputRef?.current?.click()}
                disabled={assetUploading?.logo}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4A74EF] disabled:opacity-50"
              >
                <ImagePlus size={16} />
                {assetUploading?.logo ? 'Subiendo...' : 'Subir logo'}
              </button>
            </div>
            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-white p-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
                {config.negocio_logo ? (
                  <img
                    src={config.negocio_logo}
                    alt="Logo actual"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Palette className="text-gray-400" size={24} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-700">Vista actual</p>
                <p className="truncate text-xs text-gray-500">
                  {config.negocio_logo || 'Todavía no hay logo cargado'}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">Favicon del sitio</p>
                <p className="mt-1 text-xs text-gray-500">
                  Ideal para la pestaña del navegador y accesos directos del sitio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => faviconInputRef?.current?.click()}
                disabled={assetUploading?.favicon}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4A74EF] disabled:opacity-50"
              >
                <ImagePlus size={16} />
                {assetUploading?.favicon ? 'Subiendo...' : 'Subir favicon'}
              </button>
            </div>
            <div className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-white p-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
                {config.negocio_favicon ? (
                  <img
                    src={config.negocio_favicon}
                    alt="Favicon actual"
                    className="h-10 w-10 object-contain"
                  />
                ) : (
                  <Palette className="text-gray-400" size={24} />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-700">Vista actual</p>
                <p className="truncate text-xs text-gray-500">
                  {config.negocio_favicon || 'Todavía no hay favicon cargado'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={Clock}
        tone="indigo"
        title="Turnos operativos"
        subtitle="Estos turnos son los que usa la lógica del sistema para aceptar pedidos"
      >
        <div className="space-y-4">
          {turnos.map((turno, index) => (
            <div
              key={turno.id || index}
              className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4"
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.3fr,0.8fr,0.8fr,auto]">
                <InputField
                  label="Nombre del turno"
                  value={turno.nombre || ''}
                  onChange={(event) => updateTurno(index, 'nombre', event.target.value)}
                  placeholder="Turno noche"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                  <input
                    type="time"
                    value={turno.desde || '19:00'}
                    onChange={(event) => updateTurno(index, 'desde', event.target.value)}
                    className="w-full h-12 rounded-xl border border-gray-300 px-4 text-base transition-all focus:outline-none focus:ring-2 focus:ring-[#5D87FF]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                  <input
                    type="time"
                    value={turno.hasta || '23:30'}
                    onChange={(event) => updateTurno(index, 'hasta', event.target.value)}
                    className="w-full h-12 rounded-xl border border-gray-300 px-4 text-base transition-all focus:outline-none focus:ring-2 focus:ring-[#5D87FF]"
                  />
                </div>
                <div className="flex flex-col justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => updateTurno(index, 'activo', turno.activo === false)}
                    className={`h-12 rounded-xl px-4 text-sm font-bold transition-all ${
                      turno.activo === false
                        ? 'bg-gray-200 text-gray-700'
                        : 'bg-success-500 text-white'
                    }`}
                  >
                    {turno.activo === false ? 'Inactivo' : 'Activo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTurno(index)}
                    disabled={turnos.length <= 1}
                    className="h-10 rounded-xl border border-rose-200 bg-white px-4 text-sm font-semibold text-danger-600 transition hover:bg-danger-50 disabled:opacity-40"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Trash2 size={14} />
                      Quitar
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addTurno}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4A74EF]"
        >
          <Plus size={16} />
          Agregar turno
        </button>
      </SectionCard>
    </div>
  );
}
