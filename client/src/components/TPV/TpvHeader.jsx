import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Keyboard,
  Maximize,
  Minimize2,
  ShoppingCart,
} from 'lucide-react';

import { Popover, SectionLabel, STROKE } from './tpvUi.jsx';

const ATAJOS = [
  { teclas: 'Enter', accion: 'Abrir cobro / confirmar' },
  { teclas: 'Ctrl + Enter', accion: 'Cobrar e imprimir comanda + ticket' },
  { teclas: 'Alt + G', accion: 'Guardar en espera' },
  { teclas: 'Alt + R', accion: 'Recuperar el último guardado' },
  { teclas: '/', accion: 'Ir al buscador de productos' },
];

/**
 * Header del TPV: una sola línea.
 *
 * Antes mostraba los cuatro atajos de teclado como chips permanentes.
 * Un atajo se aprende una vez y después es ruido: ahora viven detrás
 * del ícono de teclado, disponibles cuando alguien los necesita —
 * típicamente el empleado nuevo en su primera semana.
 */
export default function TpvHeader({
  cajaAbierta,
  isBrowserFullscreen,
  negocioLogo,
  negocioNombre,
  turnoLabel,
  onBack,
  onGoCaja,
  onToggleFullscreen,
}) {
  const [logoError, setLogoError] = useState(false);
  const [atajosAbiertos, setAtajosAbiertos] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [negocioLogo]);

  return (
    <>
      <header className="sticky top-0 z-30 shrink-0 bg-white px-5 py-2.5">
        <div className="flex items-center gap-3">
          {negocioLogo && !logoError ? (
            <img
              src={negocioLogo}
              alt={negocioNombre || 'Modo Sabor'}
              className="h-9 w-14 shrink-0 object-contain object-left"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white">
              <ShoppingCart size={18} strokeWidth={STROKE} />
            </div>
          )}

          <h1 className="shrink-0 text-[15px] font-semibold tracking-tight text-gray-900">
            Punto de venta
          </h1>

          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${cajaAbierta ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-600'}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${cajaAbierta ? 'bg-emerald-500' : 'bg-brand-500'}`}
            />
            {cajaAbierta ? 'Caja activa' : 'Caja cerrada'}
          </span>

          {cajaAbierta && turnoLabel ? (
            <span className="truncate text-[12px] text-gray-400">{turnoLabel}</span>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <div className="relative">
              <button
                type="button"
                onClick={() => setAtajosAbiertos((previo) => !previo)}
                title="Atajos de teclado"
                aria-label="Atajos de teclado"
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${atajosAbiertos ? 'bg-gray-900 text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
              >
                <Keyboard size={18} strokeWidth={STROKE} />
              </button>
              <Popover
                open={atajosAbiertos}
                onClose={() => setAtajosAbiertos(false)}
                align="right"
                className="w-[280px]"
              >
                <SectionLabel className="mb-3">Atajos de teclado</SectionLabel>
                <div className="space-y-2">
                  {ATAJOS.map((atajo) => (
                    <div key={atajo.teclas} className="flex items-center justify-between gap-3">
                      <span className="text-[12px] text-gray-500">{atajo.accion}</span>
                      <kbd className="shrink-0 rounded-md bg-gray-100 px-2 py-1 font-mono text-[10px] font-medium text-gray-600">
                        {atajo.teclas}
                      </kbd>
                    </div>
                  ))}
                </div>
              </Popover>
            </div>

            <button
              type="button"
              onClick={onToggleFullscreen}
              title={isBrowserFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              aria-label={isBrowserFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              {isBrowserFullscreen ? (
                <Minimize2 size={18} strokeWidth={STROKE} />
              ) : (
                <Maximize size={18} strokeWidth={STROKE} />
              )}
            </button>

            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <ArrowLeft size={15} strokeWidth={STROKE} />
              Panel
            </button>
          </div>
        </div>
      </header>

      {!cajaAbierta ? (
        <div className="mx-5 mb-1 flex shrink-0 items-center justify-between gap-4 rounded-xl bg-brand-50 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={17} strokeWidth={STROKE} className="shrink-0 text-brand-500" />
            <p className="text-[13px] font-medium text-brand-800">
              Necesitás abrir la caja para registrar ventas.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoCaja}
            className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-brand-600"
          >
            Ir a caja
          </button>
        </div>
      ) : null}
    </>
  );
}
