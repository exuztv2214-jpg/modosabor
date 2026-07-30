import { X } from 'lucide-react';

export default function DeleteDialog({ open, title, message, onConfirm, onCancel, saving }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[40px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase">
            {title || 'Confirmar'}
          </h3>
          <button onClick={onCancel} className="rounded-full p-2 hover:bg-gray-100">
            <X size={24} className="text-gray-400" />
          </button>
        </div>
        <p className="text-sm font-medium text-gray-600 mb-8">{message || '¿Estás seguro?'}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-14 rounded-2xl border border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all"
          >
            CANCELAR
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="flex-[2] h-14 rounded-2xl bg-danger-500 text-sm font-black text-white uppercase tracking-widest shadow-lg shadow-danger-100 transition-all hover:bg-danger-600 disabled:opacity-50"
          >
            {saving ? 'ELIMINANDO...' : 'CONFIRMAR'}
          </button>
        </div>
      </div>
    </div>
  );
}
