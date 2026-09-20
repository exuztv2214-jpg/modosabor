import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { resolveAssetUrl } from '../lib/assets.js';

export default function OptionPhotoPicker({ option, onChange }) {
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!option.photoFile) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(option.photoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [option.photoFile]);
  const src = preview || (option.imagen ? resolveAssetUrl(option.imagen) : '');
  return (
    <div className="flex items-center gap-3">
      {src ? (
        <img
          src={src}
          alt={`Foto de ${option.nombre || 'la opción'}`}
          className="h-14 w-14 rounded-lg object-cover"
        />
      ) : null}
      <label className="min-w-0 flex-1 text-xs text-gray-600">
        Foto de {option.nombre || 'la opción'} (máximo 5 MB)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="mt-1 block w-full text-xs"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (
              file.size > 5 * 1024 * 1024 ||
              !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
            ) {
              toast.error('Elegí JPG, PNG, WEBP o GIF de hasta 5 MB');
              return;
            }
            onChange({ ...option, photoFile: file });
          }}
        />
      </label>
      {src ? (
        <button
          type="button"
          className="text-xs text-red-600"
          onClick={() => onChange({ ...option, imagen: '', photoFile: null })}
        >
          Quitar foto
        </button>
      ) : null}
    </div>
  );
}
