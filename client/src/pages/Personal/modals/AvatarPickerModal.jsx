import { X, Camera, Check, Upload } from 'lucide-react';

import { BRAND, STROKE, Z } from '../../../lib/theme.js';
import { AVATARS, avatarToken } from '../constants.js';

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
    <div
      role="presentation"
      className="fixed inset-0 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
      style={{ zIndex: Z.modalSobreModal }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Elegir foto"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-[16px] font-semibold text-gray-900">Elegir foto</h3>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Usá una de las del sistema o subí una propia
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <button
              type="button"
              // `fileInputRef.current.click()` sin guarda: si el ref todavía no
              // está montado, tira TypeError y la modal queda muerta.
              onClick={() => fileInputRef?.current?.click()}
              className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 transition hover:border-gray-300 hover:bg-gray-50"
            >
              <Upload size={18} strokeWidth={STROKE} className="text-gray-400" />
              <span className="text-[11px] text-gray-500">Subir</span>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
              />
            </button>

            {AVATARS.map((av, idx) => {
              // Se compara contra el token guardado, no contra la URL con hash.
              const token = avatarToken(idx);
              const elegido = form.avatar_url === token;
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => onSelectAvatar(token)}
                  className="relative aspect-square overflow-hidden rounded-xl bg-gray-100 transition hover:opacity-90"
                  style={elegido ? { boxShadow: `0 0 0 3px ${BRAND}` } : undefined}
                >
                  <img
                    src={av}
                    className="h-full w-full object-cover object-center"
                    alt={`Avatar ${idx + 1}`}
                  />
                  {elegido ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-gray-900/25">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                        style={{ background: BRAND }}
                      >
                        <Check size={15} strokeWidth={3} />
                      </span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {form.avatar_url && !String(form.avatar_url).startsWith('local:') ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-gray-50 p-3">
              <Camera size={15} strokeWidth={STROKE} className="shrink-0 text-gray-400" />
              <p className="min-w-0 flex-1 truncate text-[12px] text-gray-600">
                Foto propia cargada
              </p>
              <button
                type="button"
                onClick={() => onSelectAvatar('')}
                className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[12px] font-semibold text-gray-600 transition hover:text-rose-600"
              >
                Quitar
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
