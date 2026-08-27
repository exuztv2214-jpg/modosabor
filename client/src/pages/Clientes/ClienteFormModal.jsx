import { Camera, X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { AvatarDisplay, CONTROL, avatarToken } from './clientesUi.jsx';

export default function ClienteFormModal({
  modal,
  onClose,
  form,
  setForm,
  save,
  saving,
  handleFileChange,
  fileInputRef,
  localAvatars,
}) {
  if (!modal) return null;

  const set = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={modal === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-[17px] font-semibold text-gray-900">
              {modal === 'nuevo' ? 'Nuevo cliente' : 'Editar cliente'}
            </h3>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Solo el nombre es obligatorio, el resto se puede completar después
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-[140px_1fr]">
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <AvatarDisplay
                  url={form.avatar_url}
                  fallbackId={form.id}
                  nombre={form.nombre}
                  size="h-24 w-24 text-[28px]"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: BRAND }}
                  className="absolute -bottom-1.5 -right-1.5 flex h-9 w-9 items-center justify-center rounded-xl border-2 border-white text-white transition hover:brightness-110"
                >
                  <Camera size={15} strokeWidth={STROKE} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </div>
              {/*
                Se guarda el token `local:N`, no la ruta de la imagen: Vite le
                pone un hash al compilar y ese hash cambia en cada build, así
                que el avatar elegido quedaba roto después del deploy.
              */}
              <div className="flex flex-wrap justify-center gap-1.5">
                {localAvatars.map((av, idx) => {
                  const token = avatarToken(idx);
                  const elegido = form.avatar_url === token;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setForm({ ...form, avatar_url: token })}
                      style={elegido ? { borderColor: BRAND } : undefined}
                      className={`h-8 w-8 overflow-hidden rounded-lg border-2 transition ${
                        elegido ? 'scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={av}
                        className="h-full w-full object-cover"
                        alt={`avatar ${idx + 1}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="field-ClienteFormModal-jsx-107-0"
                  className="text-[12px] font-medium text-gray-600"
                >
                  Nombre completo
                </label>
                <input
                  id="field-ClienteFormModal-jsx-107-0"
                  value={form.nombre}
                  onChange={set('nombre')}
                  placeholder="Ej: Juan Pérez"
                  className={CONTROL + ' mt-1'}
                />
              </div>
              <div>
                <label
                  htmlFor="field-ClienteFormModal-jsx-116-1"
                  className="text-[12px] font-medium text-gray-600"
                >
                  Teléfono
                </label>
                <input
                  id="field-ClienteFormModal-jsx-116-1"
                  type="tel"
                  value={form.telefono}
                  onChange={set('telefono')}
                  placeholder="3811234567"
                  className={CONTROL + ' mt-1'}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Sin teléfono no se le puede escribir por WhatsApp
                </p>
              </div>
              <div>
                <label
                  htmlFor="field-ClienteFormModal-jsx-129-2"
                  className="text-[12px] font-medium text-gray-600"
                >
                  Cumpleaños
                </label>
                <input
                  id="field-ClienteFormModal-jsx-129-2"
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={set('fecha_nacimiento')}
                  className={CONTROL + ' mt-1'}
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="field-ClienteFormModal-jsx-138-3"
                  className="text-[12px] font-medium text-gray-600"
                >
                  Dirección
                </label>
                <input
                  id="field-ClienteFormModal-jsx-138-3"
                  value={form.direccion}
                  onChange={set('direccion')}
                  placeholder="Ej: San Martín 123"
                  className={CONTROL + ' mt-1'}
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="field-ClienteFormModal-jsx-147-4"
                  className="text-[12px] font-medium text-gray-600"
                >
                  Notas internas
                </label>
                <textarea
                  id="field-ClienteFormModal-jsx-147-4"
                  value={form.notas}
                  onChange={set('notas')}
                  placeholder="Gustos, referencias de la dirección, observaciones…"
                  className={CONTROL + ' mt-1 h-20 resize-none py-2.5'}
                />
              </div>
            </div>
          </div>

          {/*
            `fidelizacion_activa` viajaba en el formulario y hasta había un
            filtro de "Fidelización pausada" en la lista, pero no existía
            ningún control para pausarla. El estado sólo se podía cambiar
            desde la base.
          */}
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-gray-50 p-3">
            <input
              type="checkbox"
              checked={Boolean(form.fidelizacion_activa)}
              onChange={(e) => setForm({ ...form, fidelizacion_activa: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
              style={{ accentColor: BRAND }}
            />
            <span>
              <span className="block text-[13px] font-medium text-gray-900">
                Acumula sellos de fidelidad
              </span>
              <span className="mt-0.5 block text-[12px] leading-4 text-gray-500">
                Si lo desactivás, el cliente sigue en el sistema pero deja de sumar sellos y
                premios.
              </span>
            </span>
          </label>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !form.nombre.trim()}
            style={{ background: BRAND }}
            className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : modal === 'nuevo' ? 'Crear cliente' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
