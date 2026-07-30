import { X, Camera } from 'lucide-react';
import { AvatarDisplay } from '../components.jsx';
import { CONTROL, ROLES, TURNOS, FREQUENCY_OPTIONS } from '../constants.js';
import { formatAmountForInput } from '../../../lib/amountInput.js';

export function FormModal({
  modal,
  onClose,
  form,
  onFormChange,
  onGuardar,
  saving,
  categorias,
  avatarPickerOpen,
  onAvatarPickerOpen,
  onSelectAvatar,
  fileInputRef,
  handleFileUpload,
}) {
  if (!modal) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#2A3547]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-900">
            {modal === 'nuevo' ? 'Agregar Nuevo Miembro' : 'Editar Datos del Personal'}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100 text-gray-400 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          <div className="flex flex-col items-center">
            <div className="relative group cursor-pointer">
              <div className="h-28 w-28 rounded-full overflow-hidden border-4 border-primary-50 shadow-md group-hover:border-primary-500 transition-all">
                <AvatarDisplay url={form.avatar_url} nombre={form.nombre} size="w-full h-full" />
              </div>
              <button
                onClick={onAvatarPickerOpen}
                className="absolute bottom-0 right-0 h-9 w-9 bg-primary-500 text-white rounded-full border-4 border-white shadow-lg flex items-center justify-center hover:bg-primary-600 transition-all"
              >
                <Camera size={16} />
              </button>
            </div>
            <p className="mt-3 text-xs font-bold text-primary-500 uppercase tracking-wider">
              Foto de Perfil
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-gray-700 mb-1 block">Nombre Completo</label>
              <input
                value={form.nombre}
                onChange={(e) => onFormChange({ ...form, nombre: e.target.value })}
                className={CONTROL}
                placeholder="Ej: Roberto Gomez"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Rol Operativo</label>
              <select
                value={form.rol_operativo}
                onChange={(e) => onFormChange({ ...form, rol_operativo: e.target.value })}
                className={CONTROL}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              {form.rol_operativo === 'delivery' ? (
                <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-success-600">
                  Se crea o actualiza también en Delivery automáticamente
                </p>
              ) : null}
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">
                Categoría Laboral
              </label>
              <select
                value={form.categoria_id}
                onChange={(e) => onFormChange({ ...form, categoria_id: Number(e.target.value) })}
                className={CONTROL}
              >
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icono} {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Turno</label>
              <select
                value={form.turno_preferido}
                onChange={(e) => onFormChange({ ...form, turno_preferido: e.target.value })}
                className={CONTROL}
              >
                {TURNOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">
                Frecuencia de Pago
              </label>
              <select
                value={form.frecuencia_pago}
                onChange={(e) => onFormChange({ ...form, frecuencia_pago: e.target.value })}
                className={CONTROL}
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Sueldo Base ($)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.monto_base}
                onChange={(e) => onFormChange({ ...form, monto_base: e.target.value })}
                onBlur={() =>
                  onFormChange((prev) => ({
                    ...prev,
                    monto_base: prev.monto_base === '' ? '' : formatAmountForInput(prev.monto_base),
                  }))
                }
                className={CONTROL + ' font-mono'}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">
                Teléfono / WhatsApp
              </label>
              <input
                value={form.telefono}
                onChange={(e) => onFormChange({ ...form, telefono: e.target.value })}
                className={CONTROL}
                placeholder="Ej: 3811234567"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">PIN de fichada</label>
              <input
                value={form.clock_pin}
                onChange={(e) =>
                  onFormChange({
                    ...form,
                    clock_pin: e.target.value.replace(/\D/g, '').slice(0, 6),
                  })
                }
                className={CONTROL}
                placeholder="Ej: 2214"
              />
              <p className="mt-1 text-[11px] font-semibold text-gray-400">
                Lo usa para marcar ingreso y salida desde el celular del local.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-gray-700 mb-1 block">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                className={CONTROL}
                placeholder="usuario@modosabor.com"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">
                Fecha de Nacimiento
              </label>
              <input
                type="date"
                value={form.fecha_nacimiento}
                onChange={(e) => onFormChange({ ...form, fecha_nacimiento: e.target.value })}
                className={CONTROL}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Fecha de Ingreso</label>
              <input
                type="date"
                value={form.fecha_ingreso}
                onChange={(e) => onFormChange({ ...form, fecha_ingreso: e.target.value })}
                className={CONTROL}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-gray-700 mb-1 block">
                Dirección Principal
              </label>
              <input
                value={form.direccion}
                onChange={(e) => onFormChange({ ...form, direccion: e.target.value })}
                className={CONTROL}
                placeholder="Ej: Av. Siempre Viva 123"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold text-gray-700 mb-1 block">Notas Internas</label>
              <textarea
                value={form.notas}
                onChange={(e) => onFormChange({ ...form, notas: e.target.value })}
                className={CONTROL + ' h-20 py-3 resize-none'}
                placeholder="Anotaciones importantes..."
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex gap-3 bg-gray-50/50">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onGuardar}
            disabled={saving}
            className="flex-1 h-11 rounded-xl bg-primary-500 text-white text-sm font-bold shadow-lg shadow-[#5D87FF]/20 hover:bg-primary-600 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
