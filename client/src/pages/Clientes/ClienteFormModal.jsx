import { X, Camera, User } from 'lucide-react';

export default function ClienteFormModal({
  modal,
  onClose,
  form,
  setForm,
  save,
  saving,
  handleFileChange,
  fileInputRef,
  emptyForm,
  localAvatars,
  control,
  AvatarDisplay,
}) {
  if (!modal) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-[40px] bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header del Modal */}
        <div className="shrink-0 p-8 pb-4 flex items-center justify-between border-b border-gray-50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-1 bg-primary-500 rounded-full"></div>
              <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em]">
                {modal === 'nuevo' ? 'Nuevo Registro' : 'Editar Ficha'}
              </p>
            </div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
              Datos del Cliente
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100 transition-colors"
            aria-label="Cerrar modal"
          >
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        {/* Contenido Scrollable */}
        <div className="flex-1 overflow-y-auto p-8 pt-4 space-y-6 no-scrollbar">
          {/* Selector de Avatar */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <AvatarDisplay url={form.avatar_url} nombre={form.nombre} size="h-28 w-24" />
              <button
                onClick={() => fileInputRef.current.click()}
                className="absolute -bottom-2 -right-2 h-10 w-10 bg-primary-500 text-white rounded-xl border-4 border-white shadow-lg flex items-center justify-center hover:bg-primary-600 transition-all active:scale-90"
              >
                <Camera size={18} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>

            <div className="space-y-2 w-full text-center">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                O selecciona uno predeterminado
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {localAvatars.map((av, idx) => (
                  <button
                    key={idx}
                    onClick={() => setForm({ ...form, avatar_url: av })}
                    className={`h-10 w-10 rounded-xl overflow-hidden border-2 transition-all ${form.avatar_url === av ? 'border-primary-500 scale-110 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'}`}
                  >
                    <img src={av} className="h-full w-full object-cover" alt="avatar" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                Nombre Completo
              </label>
              <input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Juan Perez"
                className={control + ' mt-1'}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                  placeholder="Ej: 1122334455"
                  className={control + ' mt-1'}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Cumpleaños
                </label>
                <input
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })}
                  className={control + ' mt-1'}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                Dirección Principal
              </label>
              <input
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                placeholder="Ej: Calle Falsa 123"
                className={control + ' mt-1'}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                Notas Internas
              </label>
              <textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Gustos, preferencias, referencias..."
                className={control + ' mt-1 h-24 py-3 resize-none'}
              />
            </div>
          </div>
        </div>

        {/* Footer del Modal (Fijo) */}
        <div className="shrink-0 p-8 pt-4 border-t border-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-14 rounded-2xl border border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all"
          >
            CANCELAR
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-[2] h-14 rounded-2xl bg-primary-500 text-sm font-black text-white uppercase tracking-widest shadow-lg shadow-primary-100 hover:bg-primary-600 active:scale-95 transition-all disabled:opacity-50"
          >
            {saving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
          </button>
        </div>
      </div>
    </div>
  );
}
