import { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';

// Barra prominente arriba de la pagina del club: si ya sos socio,
// pones tu telefono y ves tus sellos directo. Sin scrollear ni completar
// nada. Separa visualmente el flujo "vuelvo" del "me anoto por primera vez".
export default function BarraSocio({ onBuscar, colorPrimario, buscando }) {
  const [telefono, setTelefono] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!telefono.trim()) return;
    onBuscar(telefono);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-8 rounded-[24px] border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${colorPrimario}15`, color: colorPrimario }}
          >
            <Search size={20} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">
              ¿Ya sos socio?
            </p>
            <p className="mt-0.5 text-sm font-bold text-gray-900">
              Poné tu teléfono y ves tus sellos al toque.
            </p>
          </div>
        </div>
        <div className="flex flex-1 items-center gap-2 sm:max-w-md">
          <input
            type="tel"
            value={telefono}
            onChange={(event) => setTelefono(event.target.value)}
            placeholder="Ej: 381 598 8735"
            inputMode="tel"
            autoComplete="tel"
            className="h-12 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-bold text-gray-900 outline-none transition focus:border-gray-300 focus:bg-white"
          />
          <button
            type="submit"
            disabled={buscando || !telefono.trim()}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-5 text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: colorPrimario }}
          >
            {buscando ? (
              'Buscando...'
            ) : (
              <>
                Ver mis sellos
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
