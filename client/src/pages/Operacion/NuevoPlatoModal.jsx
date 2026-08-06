import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';

import api from '../../lib/api.js';
import { BRAND, STROKE } from '../../lib/theme.js';
import { fondoModal, useCerrarConEscape } from '../../hooks/useCerrarConEscape.js';
import { fmt, NumberField, Switch } from './ui.jsx';

/**
 * Alta de un plato eventual.
 *
 * Antes era un formulario de ocho campos incrustado al final de la lista,
 * que había que scrollear hasta el fondo para encontrar. Como modal se abre
 * desde cualquier punto de la pantalla y no compite con lo que se está
 * editando.
 *
 * El precio se autocompleta con el precio base del tipo elegido: es lo que
 * pasa el 95% de las veces, y si el plato es especial se sobrescribe.
 */
export default function NuevoPlatoModal({ menuDia, onClose, onCreado }) {
  useCerrarConEscape(true, onClose);
  const [form, setForm] = useState({
    nombre: '',
    descripcion: '',
    precio: menuDia.precioSugerido?.economico ?? 5000,
    stock_directo: 20,
    tiempo_preparacion: 15,
    tipo: 'economico',
    guarniciones: [],
    ofrece_postre: 0,
    ofrece_bebida_postre: 0,
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const cambiarTipo = (tipo) => {
    const sugerido = menuDia.precioSugerido?.[tipo];
    setForm((prev) => ({
      ...prev,
      tipo,
      precio: sugerido ?? prev.precio,
      // El combo bebida + postre sólo existe en los ejecutivos.
      ofrece_bebida_postre: tipo === 'ejecutivo' ? prev.ofrece_bebida_postre : 0,
    }));
  };

  const crear = async () => {
    if (!form.nombre.trim()) {
      toast.error('Poné un nombre al plato');
      return;
    }
    setGuardando(true);
    try {
      const response = await api.post('/operacion/menu-dia/nuevo', {
        ...form,
        descripcion: form.descripcion.trim() || 'Menú del día.',
      });
      toast.success('Plato agregado');
      await onCreado?.(response);
      onClose?.();
    } catch (error) {
      toast.error(error?.error || 'No se pudo crear el plato');
    } finally {
      setGuardando(false);
    }
  };

  const guarniciones = menuDia.guarnicionesLista || [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
      onClick={fondoModal(onClose)}
      role="presentation"
    >
      <div
        className="flex max-h-full w-full max-w-[540px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo plato del día"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pb-3 pt-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-gray-900">Nuevo plato</h2>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Queda en la biblioteca y sale hoy automáticamente.
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

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-gray-400">
              Nombre del plato
            </span>
            <input
              autoFocus
              value={form.nombre}
              onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
              placeholder="Ej: Guiso de lentejas"
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-medium text-gray-900 outline-none transition focus:border-gray-400"
            />
          </label>

          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            {[
              { value: 'economico', label: 'Económico' },
              { value: 'ejecutivo', label: 'Ejecutivo' },
            ].map((opcion) => (
              <button
                key={opcion.value}
                type="button"
                onClick={() => cambiarTipo(opcion.value)}
                className={`h-9 flex-1 rounded-lg text-[12px] transition ${form.tipo === opcion.value ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'font-medium text-gray-500'}`}
              >
                {opcion.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <NumberField
              label="Precio"
              step="100"
              value={form.precio}
              onChange={(valor) => setForm((prev) => ({ ...prev, precio: valor }))}
            />
            <NumberField
              label="Stock"
              value={form.stock_directo}
              onChange={(valor) => setForm((prev) => ({ ...prev, stock_directo: valor }))}
            />
            <NumberField
              label="Minutos"
              min="1"
              value={form.tiempo_preparacion}
              onChange={(valor) => setForm((prev) => ({ ...prev, tiempo_preparacion: valor }))}
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-gray-400">
              Descripción (opcional)
            </span>
            <textarea
              rows={2}
              value={form.descripcion}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, descripcion: event.target.value }))
              }
              placeholder="Cómo se describe en la web"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-800 outline-none transition focus:border-gray-400"
            />
          </label>

          {guarniciones.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-gray-400">Guarniciones a ofrecer</p>
              <div className="flex flex-wrap gap-1.5">
                {guarniciones.map((guarnicion) => {
                  const activa = form.guarniciones.includes(guarnicion);
                  return (
                    <button
                      key={guarnicion}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          guarniciones: activa
                            ? prev.guarniciones.filter((x) => x !== guarnicion)
                            : [...prev.guarniciones, guarnicion],
                        }))
                      }
                      style={activa ? { background: BRAND, color: '#FFFFFF' } : undefined}
                      className={`rounded-lg px-3 py-1.5 text-[12px] transition ${activa ? 'font-semibold' : 'bg-gray-100 font-medium text-gray-600 hover:bg-gray-200'}`}
                    >
                      {guarnicion}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-1 rounded-xl bg-gray-50">
            <Switch
              checked={Number(form.ofrece_postre) === 1}
              onChange={(valor) => setForm((prev) => ({ ...prev, ofrece_postre: valor ? 1 : 0 }))}
              label="Ofrecer postre"
              hint={`+ ${fmt(menuDia.extraPostrePrecio ?? 1000)}`}
            />
            {form.tipo === 'ejecutivo' ? (
              <Switch
                checked={Number(form.ofrece_bebida_postre) === 1}
                onChange={(valor) =>
                  setForm((prev) => ({ ...prev, ofrece_bebida_postre: valor ? 1 : 0 }))
                }
                label="Ofrecer bebida + postre"
                hint={`+ ${fmt(menuDia.extraBebidaPostrePrecio ?? 1000)}`}
              />
            ) : null}
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
            onClick={crear}
            disabled={guardando || !form.nombre.trim()}
            style={{ background: BRAND }}
            className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition disabled:opacity-40"
          >
            {guardando ? 'Creando…' : 'Crear y sacar hoy'}
          </button>
        </div>
      </div>
    </div>
  );
}
