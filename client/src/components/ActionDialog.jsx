import { AlertTriangle, Loader2 } from 'lucide-react';

export default function ActionDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
  inputLabel = '',
  inputPlaceholder = '',
  inputValue = '',
  onInputChange,
}) {
  if (!open) return null;

  const tones = {
    danger: {
      icon: 'bg-danger-100 text-danger-600',
      button: 'bg-rose-600 hover:bg-rose-700 text-white',
    },
    warning: {
      icon: 'bg-warning-100 text-warning-600',
      button: 'bg-warning-500 hover:bg-amber-600 text-white',
    },
    primary: {
      icon: 'bg-primary-100 text-primary-500',
      button: 'bg-primary-500 hover:bg-primary-600 text-white',
    },
  };

  const currentTone = tones[tone] || tones.danger;

  return (
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[32px] bg-white p-7 shadow-2xl animate-in zoom-in-95"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div
            className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${currentTone.icon}`}
          >
            <AlertTriangle size={22} strokeWidth={2.6} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-black tracking-tight text-slate-900">{title}</h3>
            <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">{description}</p>
          </div>
        </div>

        {onInputChange ? (
          <div className="mt-6">
            {inputLabel ? (
              <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                {inputLabel}
              </label>
            ) : null}
            <input
              autoFocus
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder={inputPlaceholder}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        ) : null}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-2xl border border-slate-200 px-5 text-sm font-black uppercase tracking-widest text-slate-500 transition hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-black uppercase tracking-widest transition disabled:opacity-60 ${currentTone.button}`}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
