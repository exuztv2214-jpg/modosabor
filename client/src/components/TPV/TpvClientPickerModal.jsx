import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, UserPlus, X } from 'lucide-react';

/**
 * Buscador de clientes del TPV.
 *
 * ── Lo que faltaba ─────────────────────────────────────────────────────────
 *
 * Sólo buscaba. Cuando no encontraba nada decía "No encontramos clientes para
 * esa búsqueda" y ahí terminaba: no había forma de dar de alta al que estaba
 * parado en el mostrador. El cajero tenía que salir del TPV, ir a Clientes,
 * cargarlo, y volver a armar el pedido.
 *
 * Ahora el alta está acá, y arranca con lo que ya se escribió en el buscador.
 * Si lo escrito son todos números se toma como teléfono; si no, como nombre.
 * Es la diferencia entre cargar un cliente en diez segundos o no cargarlo.
 */

const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-800 outline-none transition focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-500/10';

/** Lo escrito en el buscador, repartido en los campos del alta. */
function repartirBusqueda(texto) {
  const limpio = String(texto || '').trim();
  if (!limpio) return { nombre: '', telefono: '' };
  // Un teléfono puede venir con espacios, guiones o paréntesis. Si sacando eso
  // quedan sólo dígitos, es un teléfono.
  const soloDigitos = limpio.replace(/[\s()+-]/g, '');
  if (/^\d{6,}$/.test(soloDigitos)) return { nombre: '', telefono: limpio };
  return { nombre: limpio, telefono: '' };
}

export default function TpvClientPickerModal({
  clientesCatalogo,
  loadingClientesCatalogo,
  onApplyCliente,
  onClose,
  onCrearCliente,
  onSearchChange,
  search,
}) {
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ nombre: '', telefono: '', direccion: '' });

  const sugerido = useMemo(() => repartirBusqueda(search), [search]);

  // Al abrir el alta se prellenan los campos con lo que se venía buscando.
  useEffect(() => {
    if (creando) setForm((prev) => ({ ...prev, ...sugerido }));
  }, [creando, sugerido]);

  useEffect(() => {
    const alPresionar = (evento) => {
      if (evento.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [onClose]);

  const guardar = async () => {
    const nombre = String(form.nombre || '').trim();
    const telefono = String(form.telefono || '').trim();
    // El servidor exige nombre. Cuando sólo se tiene el teléfono se guarda con
    // ese número como nombre provisorio, que es mejor que perder el cliente: al
    // menos queda la ficha, suma puntos y se le puede poner el nombre después.
    if (!nombre && !telefono) return;

    setGuardando(true);
    try {
      await onCrearCliente({
        nombre: nombre || telefono,
        telefono,
        direccion: String(form.direccion || '').trim(),
      });
      setCreando(false);
      setForm({ nombre: '', telefono: '', direccion: '' });
    } catch {
      // El aviso ya lo dio quien guarda. Acá sólo importa no limpiar el
      // formulario: lo que se escribió tiene que seguir estando para poder
      // reintentar sin volver a tipearlo.
    } finally {
      setGuardando(false);
    }
  };

  const sinResultados = !loadingClientesCatalogo && clientesCatalogo.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white"
        role="dialog"
        aria-modal="true"
        aria-label="Seleccionar cliente"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-lg font-semibold tracking-tight text-gray-900">
              {creando ? 'Cliente nuevo' : 'Seleccionar cliente'}
            </p>
            <p className="text-[13px] text-gray-500">
              {creando
                ? 'Con el nombre o el teléfono alcanza. La tarjeta se genera sola.'
                : 'Buscá por nombre, teléfono, dirección o código de tarjeta.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-xl p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {creando ? (
          /* ── Alta ── */
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div>
                <label
                  htmlFor="cliente-nuevo-nombre"
                  className="mb-1.5 block text-[12px] font-medium text-gray-500"
                >
                  Nombre
                </label>
                <input
                  id="cliente-nuevo-nombre"
                  value={form.nombre}
                  onChange={(evento) => setForm({ ...form, nombre: evento.target.value })}
                  placeholder="Juan Pérez"
                  className={CONTROL}
                />
              </div>
              <div>
                <label
                  htmlFor="cliente-nuevo-telefono"
                  className="mb-1.5 block text-[12px] font-medium text-gray-500"
                >
                  Teléfono
                </label>
                <input
                  id="cliente-nuevo-telefono"
                  value={form.telefono}
                  onChange={(evento) => setForm({ ...form, telefono: evento.target.value })}
                  placeholder="3863 000000"
                  inputMode="tel"
                  className={CONTROL}
                />
              </div>
              <div>
                <label
                  htmlFor="cliente-nuevo-direccion"
                  className="mb-1.5 block text-[12px] font-medium text-gray-500"
                >
                  Dirección <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  id="cliente-nuevo-direccion"
                  value={form.direccion}
                  onChange={(evento) => setForm({ ...form, direccion: evento.target.value })}
                  placeholder="Para los delivery de la próxima"
                  className={CONTROL}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
              <button
                type="button"
                onClick={() => setCreando(false)}
                className="h-11 rounded-xl border border-gray-200 bg-white px-5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-100"
              >
                Volver al buscador
              </button>
              <button
                type="button"
                disabled={guardando || (!form.nombre.trim() && !form.telefono.trim())}
                onClick={guardar}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-5 text-[13px] font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                {guardando ? <Loader2 size={15} className="animate-spin" /> : null}
                Guardar y usar
              </button>
            </div>
          </>
        ) : (
          /* ── Búsqueda ── */
          <>
            <div className="border-b border-gray-200 px-5 py-4">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={search}
                  onChange={(evento) => onSearchChange(evento.target.value)}
                  placeholder="Buscar cliente o tarjeta..."
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-11 pr-4 text-sm font-medium focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/10"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {loadingClientesCatalogo ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center text-[13px] font-medium text-gray-400">
                  Cargando clientes...
                </div>
              ) : null}

              {sinResultados ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
                  <p className="text-[13px] font-medium text-gray-500">
                    {search.trim()
                      ? `No hay ningún cliente que coincida con "${search.trim()}".`
                      : 'Todavía no hay clientes cargados.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCreando(true)}
                    className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-5 text-[13px] font-semibold text-white transition hover:bg-brand-600"
                  >
                    <UserPlus size={16} />
                    {search.trim() ? `Crear "${search.trim()}"` : 'Crear cliente'}
                  </button>
                </div>
              ) : null}

              {!loadingClientesCatalogo && clientesCatalogo.length > 0 ? (
                <div className="space-y-3">
                  {clientesCatalogo.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onApplyCliente(item)}
                      className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">
                            {item.nombre || 'Sin nombre'}
                          </p>
                          <p className="mt-1 text-xs font-medium text-gray-500">
                            {item.telefono || 'Sin teléfono'}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {item.direccion || 'Sin dirección cargada'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {item.codigo_tarjeta ? (
                              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-600">
                                {item.codigo_tarjeta}
                              </span>
                            ) : null}
                            <span className="rounded-full bg-warning-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-warning-600">
                              {Number(item.puntos || 0)} pts
                            </span>
                            {Number(item.recompensas_pendientes || 0) > 0 ? (
                              <span className="rounded-full bg-success-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-success-600">
                                {Number(item.recompensas_pendientes || 0)} premio
                                {Number(item.recompensas_pendientes || 0) === 1 ? '' : 's'}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                          {Number(item.total_pedidos || 0)} pedidos
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/*
              El alta también está disponible cuando sí hay resultados: dos
              clientes pueden llamarse igual, y obligar a buscar algo que no
              exista para poder crear sería una trampa.
            */}
            {!sinResultados ? (
              <div className="border-t border-gray-200 bg-gray-50 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setCreando(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-brand-600 transition hover:bg-brand-50"
                >
                  <UserPlus size={15} />
                  Ninguno de estos — cargar uno nuevo
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
