import { X, Camera, Bike } from 'lucide-react';

import { BRAND, STROKE, Z } from '../../../lib/theme.js';
import { formatAmountForInput } from '../../../lib/amountInput.js';
import { AvatarDisplay } from '../components.jsx';
import {
  CONTROL,
  LABEL,
  SELECT,
  ROLES,
  TURNOS,
  FREQUENCY_OPTIONS,
  PAYMENT_OPTIONS,
} from '../constants.js';
import { ToggleSwitch } from './ToggleSwitch.jsx';

function Campo({ label, hint, span = false, children }) {
  return (
    <div className={span ? 'md:col-span-2' : undefined}>
      <label className="block">
        <span className={LABEL}>{label}</span>
        {children}
      </label>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-gray-400">{hint}</p> : null}
    </div>
  );
}

export function FormModal({
  modal,
  onClose,
  form,
  onFormChange,
  onGuardar,
  saving,
  categorias,
  onAvatarPickerOpen,
}) {
  if (!modal) return null;

  const set = (campo) => (e) => onFormChange({ ...form, [campo]: e.target.value });
  const esNuevo = modal === 'nuevo';

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
      }}
      className="fixed inset-0 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
      style={{ zIndex: Z.modal }}
      onClick={onClose}
    >
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
        }}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-[16px] font-semibold text-gray-900">
            {esNuevo ? 'Nuevo miembro del equipo' : 'Editar ficha'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-col items-center">
            <button type="button" onClick={onAvatarPickerOpen} className="group relative">
              <div className="rounded-full border-4 border-gray-100 transition group-hover:border-gray-200">
                <AvatarDisplay url={form.avatar_url} nombre={form.nombre} size="h-24 w-24" />
              </div>
              <span
                className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-white text-white transition group-hover:brightness-110"
                style={{ background: BRAND }}
              >
                <Camera size={14} strokeWidth={STROKE} />
              </span>
            </button>
            <p className="mt-2 text-[12px] text-gray-500">Tocá la foto para cambiarla</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Campo label="Nombre completo" span>
              <input
                value={form.nombre}
                onChange={set('nombre')}
                className={CONTROL}
                placeholder="Ej: Roberto Gómez"
              />
            </Campo>

            <Campo
              label="Rol"
              hint={
                form.rol_operativo === 'delivery'
                  ? 'Se crea o actualiza también como rider en Delivery.'
                  : null
              }
            >
              <select value={form.rol_operativo} onChange={set('rol_operativo')} className={SELECT}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Categoría">
              <select
                value={form.categoria_id}
                onChange={(e) => onFormChange({ ...form, categoria_id: Number(e.target.value) })}
                className={SELECT}
              >
                {(categorias || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icono} {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Turno habitual">
              <select
                value={form.turno_preferido}
                onChange={set('turno_preferido')}
                className={SELECT}
              >
                {TURNOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Cada cuánto se le paga">
              <select
                value={form.frecuencia_pago}
                onChange={set('frecuencia_pago')}
                className={SELECT}
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Sueldo base">
              <input
                type="text"
                inputMode="decimal"
                value={form.monto_base}
                onChange={set('monto_base')}
                onBlur={() =>
                  onFormChange((prev) => ({
                    ...prev,
                    monto_base: prev.monto_base === '' ? '' : formatAmountForInput(prev.monto_base),
                  }))
                }
                className={`${CONTROL} font-mono`}
                placeholder="0,00"
              />
            </Campo>

            {/* El medio de pago preferido se guarda en la base y la liquidación
                lo usa como valor por defecto, pero no había forma de cargarlo
                desde ningún formulario. */}
            <Campo label="Cómo cobra">
              <select
                value={form.medio_pago_preferido}
                onChange={set('medio_pago_preferido')}
                className={SELECT}
              >
                {PAYMENT_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Teléfono / WhatsApp">
              <input
                value={form.telefono}
                onChange={set('telefono')}
                className={CONTROL}
                inputMode="tel"
                placeholder="3811234567"
              />
            </Campo>

            <Campo
              label="PIN de fichada"
              hint="Lo usa para marcar ingreso y salida desde el celular del local."
            >
              <input
                value={form.clock_pin}
                onChange={(e) =>
                  onFormChange({
                    ...form,
                    clock_pin: e.target.value.replace(/\D/g, '').slice(0, 6),
                  })
                }
                className={`${CONTROL} font-mono tracking-[0.2em]`}
                inputMode="numeric"
                placeholder="2214"
              />
            </Campo>

            <Campo label="Email" span>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                className={CONTROL}
                placeholder="nombre@ejemplo.com"
              />
            </Campo>

            <Campo label="Fecha de nacimiento" hint="Para avisarte del cumpleaños.">
              <input
                type="date"
                value={form.fecha_nacimiento}
                onChange={set('fecha_nacimiento')}
                className={CONTROL}
              />
            </Campo>

            <Campo label="Fecha de ingreso">
              <input
                type="date"
                value={form.fecha_ingreso}
                onChange={set('fecha_ingreso')}
                className={CONTROL}
              />
            </Campo>

            <Campo label="Dirección" span>
              <input
                value={form.direccion}
                onChange={set('direccion')}
                className={CONTROL}
                placeholder="Calle y número"
              />
            </Campo>

            <Campo label="Notas internas" span>
              <textarea
                value={form.notas}
                onChange={set('notas')}
                className={`${CONTROL} h-20 resize-none py-2.5`}
                placeholder="Lo que quieras recordar sobre esta persona"
              />
            </Campo>
          </div>

          {/* Faltaba por completo: `activo` existía en la base y en el
              formulario, pero no había ningún control para cambiarlo. La única
              forma de sacar a alguien del equipo era borrarlo, y eso se lleva
              puesto el historial de sueldos y asistencia. */}
          {!esNuevo ? (
            <div className="rounded-xl bg-gray-50 p-4">
              <ToggleSwitch
                checked={Number(form.activo) === 1}
                onChange={(v) => onFormChange({ ...form, activo: v ? 1 : 0 })}
                label="Sigue trabajando acá"
                description="Si lo apagás queda dado de baja: no aparece en los turnos ni en la lista de activos, pero se conserva todo su historial."
              />
            </div>
          ) : null}

          {form.rol_operativo === 'delivery' ? (
            <div
              className="flex items-start gap-2 rounded-xl px-4 py-3"
              style={{ background: '#E7F5EF' }}
            >
              <Bike
                size={14}
                strokeWidth={STROKE}
                className="mt-0.5 shrink-0"
                style={{ color: '#0F6E56' }}
              />
              <p className="text-[12px] leading-4" style={{ color: '#0F6E56' }}>
                Al guardar también se crea o actualiza su usuario de rider para la app de delivery.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onGuardar}
            disabled={saving || !form.nombre.trim()}
            style={{ background: BRAND }}
            className="h-11 flex-1 rounded-xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : esNuevo ? 'Agregar al equipo' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
