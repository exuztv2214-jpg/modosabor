import { X, Camera, Check } from 'lucide-react';
import { AVATARS } from '../constants.js';

export function AvatarPickerModal({
  open,
  onClose,
  form,
  onSelectAvatar,
  fileInputRef,
  handleFileUpload,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#2A3547]/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="mb-8 flex items-center justify-between shrink-0">
          <h3 className="text-xl font-bold text-gray-900">Seleccionar Avatar</h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100 transition-all text-gray-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <button
              onClick={() => fileInputRef.current.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 hover:border-primary-500 hover:bg-primary-50 transition-all group"
            >
              <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:text-primary-500 transition-all">
                <Camera size={20} />
              </div>
              <span className="text-[10px] font-bold uppercase text-gray-400 group-hover:text-primary-500">
                Subir Propia
              </span>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
              />
            </button>

            {AVATARS.map((av, idx) => (
              <button
                key={idx}
                onClick={() => onSelectAvatar(av)}
                className={`relative aspect-square rounded-xl overflow-hidden border-4 bg-slate-100 transition-all hover:scale-[1.02] ${form.avatar_url === av ? 'border-primary-500' : 'border-transparent'}`}
              >
                <img
                  src={av}
                  className="h-full w-full object-cover object-center"
                  alt={`avatar-${idx}`}
                />
                {form.avatar_url === av && (
                  <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center">
                    <div className="bg-white rounded-full p-1 text-primary-500 shadow-sm">
                      <Check size={16} strokeWidth={4} />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-end shrink-0 pt-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="h-11 px-6 rounded-xl bg-gray-50 text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
