import { BRAND, STROKE } from '../../lib/theme.js';

/**
 * Primitivos compartidos por las nueve secciones de Configuración.
 *
 * Este archivo es el punto de apalancamiento del módulo: todas las secciones
 * lo usan, así que un cambio acá se ve en todas a la vez.
 *
 * Las reglas son las mismas que en el TPV y en el control diario: un solo
 * acento, el peso tipográfico se gana, dos radios y nada más.
 *
 * Sobre el color de los interruptores: van en gris oscuro y no en rojo. Una
 * pantalla de ajustes puede tener veinte encendidos a la vez, y veinte
 * manchas rojas convierten el acento en ruido. El rojo queda reservado para
 * guardar y para lo destructivo, que es donde tiene que llamar la atención.
 */

const TONO_ENCENDIDO = '#111827';

export function ToggleSwitch({ checked, onChange, label, description, tone }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      onClick={() => onChange(!checked)}
      className="flex h-full w-full items-start justify-between gap-4 rounded-xl bg-white px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:shadow-[0_3px_10px_rgba(15,23,42,0.08)]"
    >
      <span className="min-w-0">
        {label ? (
          <span className="block text-[14px] font-medium leading-tight text-gray-900">{label}</span>
        ) : null}
        {description ? (
          <span className="mt-1 block text-[12px] leading-snug text-gray-500">{description}</span>
        ) : null}
      </span>
      <span
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? '' : 'bg-gray-200'}`}
        style={checked ? { background: tone || TONO_ENCENDIDO } : undefined}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}

/**
 * Bloque de ajustes.
 *
 * El ícono va en gris salvo que la sección sea sensible (`tone="danger"`),
 * donde el rojo de marca avisa que lo que hay adentro se toca con cuidado.
 */
export function SectionCard({ icon: Icon, tone, title, subtitle, children, action }) {
  const peligro = tone === 'danger';

  return (
    <section className="rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={
                peligro
                  ? { background: '#FEF2F2', color: BRAND }
                  : { background: '#F3F4F6', color: '#6B7280' }
              }
            >
              <Icon size={17} strokeWidth={STROKE} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold tracking-tight text-gray-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-[13px] text-gray-500">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      <div className="border-t border-gray-100 px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

const campoBase =
  'w-full rounded-xl border border-gray-200 bg-white text-[14px] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400';

export function InputField({ label, description, hint, ...props }) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-[13px] font-medium text-gray-700">{label}</span>
      ) : null}
      {description ? (
        <span className="mb-2 block text-[12px] leading-snug text-gray-500">{description}</span>
      ) : null}
      <input {...props} className={`${campoBase} h-11 px-3.5`} />
      {hint ? <span className="mt-1.5 block text-[11px] text-gray-400">{hint}</span> : null}
    </label>
  );
}

export function TextareaField({ label, description, rows = 6, ...props }) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-[13px] font-medium text-gray-700">{label}</span>
      ) : null}
      {description ? (
        <span className="mb-2 block text-[12px] leading-snug text-gray-500">{description}</span>
      ) : null}
      <textarea {...props} rows={rows} className={`${campoBase} px-3.5 py-2.5 leading-relaxed`} />
    </label>
  );
}

export function SelectField({ label, description, options = [], ...props }) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-[13px] font-medium text-gray-700">{label}</span>
      ) : null}
      {description ? (
        <span className="mb-2 block text-[12px] leading-snug text-gray-500">{description}</span>
      ) : null}
      <select {...props} className={`${campoBase} h-11 px-3`}>
        {options.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.label}
          </option>
        ))}
      </select>
    </label>
  );
}
