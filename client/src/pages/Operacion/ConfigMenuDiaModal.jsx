import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';

import api from '../../lib/api.js';
import { BRAND, STROKE } from '../../lib/theme.js';
import { fondoModal, useCerrarConEscape } from '../../hooks/useCerrarConEscape.js';
import { NumberField } from './ui.jsx';

/**
 * Ajustes globales del menú del día.
 *
 * Era un acordeón dentro de la sección del menú, que empujaba todo hacia
 * abajo cuando se abría. Como se toca una vez cada varios meses —cuando
 * cambian los precios base o se suma una guarnición nueva— tiene más sentido
 * como modal: no ocupa lugar y cuando se usa se lleva toda la atención.
 */
export default function ConfigMenuDiaModal({ config, onClose, onSaved }) {
  useCerrarConEscape(true, onClose);
  const [form, setForm] = useState({
    precioEconomico: config.precioEconomico,
    precioEjecutivo: config.precioEjecutivo,
    extraPostrePrecio: config.extraPostrePrecio,
    extraBebidaPostrePrecio: config.extraBebidaPostrePrecio,
    guarnicionesLista: config.guarnicionesLista || [],
  });
  const [nueva, setNueva] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const agregar = () => {
    const nombre = nueva.trim();
    if (!nombre) return;
    if (form.guarnicionesLista.includes(nombre)) {
      setNueva('');
      return;
    }
    setForm((prev) => ({ ...prev, guarnicionesLista: [...prev.guarnicionesLista, nombre] }));
    setNueva('');
  };

  const quitar = (nombre) => {
    setForm((prev) => ({
      ...prev,
      guarnicionesLista: prev.guarnicionesLista.filter((x) => x !== nombre),
    }));
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await api.put('/operacion/menu-dia/config', form);
      toast.success('Ajustes actualizados');
      await onSaved?.();
      onClose?.();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
      onClick={fondoModal(onClose)}
      role="presentation"
    >
      <div
        className="flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes del menú del día"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-3 pt-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">
              Ajustes del menú del día
            </h2>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Precios base y guarniciones disponibles para todos los platos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <NumberField
              label="Precio del económico"
              step="100"
              value={form.precioEconomico}
              onChange={(valor) => setForm((prev) => ({ ...prev, precioEconomico: valor }))}
            />
            <NumberField
              label="Precio del ejecutivo"
              step="100"
              value={form.precioEjecutivo}
              onChange={(valor) => setForm((prev) => ({ ...prev, precioEjecutivo: valor }))}
            />
            <NumberField
              label="Postre extra"
              step="100"
              value={form.extraPostrePrecio}
              onChange={(valor) => setForm((prev) => ({ ...prev, extraPostrePrecio: valor }))}
            />
            <NumberField
              label="Bebida + postre"
              step="100"
              value={form.extraBebidaPostrePrecio}
              onChange={(valor) => setForm((prev) => ({ ...prev, extraBebidaPostrePrecio: valor }))}
            />
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-medium text-gray-400">Guarniciones disponibles</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              Cada plato elige de esta lista cuáles ofrecer.
            </p>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {form.guarnicionesLista.length === 0 ? (
                <p className="text-[12px] italic text-gray-400">
                  Sin guarniciones cargadas todavía.
                </p>
              ) : (
                form.guarnicionesLista.map((guarnicion) => (
                  <span
                    key={guarnicion}
                    className="flex items-center gap-1.5 rounded-lg bg-gray-100 py-1.5 pl-3 pr-1.5 text-[12px] font-medium text-gray-700"
                  >
                    {guarnicion}
                    <button
                      type="button"
                      onClick={() => quitar(guarnicion)}
                      aria-label={`Quitar ${guarnicion}`}
                      className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 transition hover:bg-white hover:text-gray-700"
                    >
                      <X size={12} strokeWidth={2.4} />
                    </button>
                  </span>
                ))
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={nueva}
                onChange={(event) => setNueva(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    agregar();
                  }
                }}
                placeholder="Ej: Arroz a la provenzal"
                className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-gray-800 outline-none transition focus:border-gray-400"
              />
              <button
                type="button"
                onClick={agregar}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3.5 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200"
              >
                <Plus size={14} strokeWidth={STROKE} />
                Agregar
              </button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl px-5 text-[13px] font-semibold text-gray-500 transition hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            style={{ background: BRAND }}
            className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar ajustes'}
          </button>
        </div>
      </div>
    </div>
  );
}
