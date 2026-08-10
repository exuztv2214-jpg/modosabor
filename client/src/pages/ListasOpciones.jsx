import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  ChefHat,
  ListPlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';

import api from '../lib/api.js';
import ActionDialog from '../components/ActionDialog.jsx';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';
import { formatAmountForInput, parseLocalizedAmount } from '../lib/amountInput.js';

/**
 * Listas de opciones compartidas.
 *
 * Guarniciones, salsas, agregados y postres cargados una sola vez, y asignados
 * a los platos que los llevan.
 *
 * Antes de esto cada plato guardaba su propia copia adentro de un JSON, y en la
 * carta de Modo Sabor eso ya se había despegado: los cuatro agregados de
 * hamburguesa —queso extra, medallón, papas, huevo— estaban repetidos en
 * dieciséis platos. Subirle $200 al queso eran dieciséis ediciones, y con
 * saltearse una alcanzaba para vender el mismo agregado a dos precios.
 *
 * Por eso el botón que más importa de esta pantalla no es el de crear una
 * lista: es **"Asignar a varios platos"**. Sin él, pasar esos dieciséis a una
 * lista compartida sería exactamente el mismo trabajo a mano que se está
 * tratando de sacar del medio.
 */

const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

const LISTA_VACIA = {
  nombre: '',
  tipo: 'variante',
  obligatorio: 0,
  activo: 1,
  opciones: [{ nombre: '', precio: '' }],
};

function fmt(valor) {
  return `$${formatAmountForInput(valor || 0)}`;
}

export default function ListasOpciones() {
  const [listas, setListas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [modal, setModal] = useState(null);
  const [aBorrar, setABorrar] = useState(null);
  const [asignar, setAsignar] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [datos, cats, prods] = await Promise.all([
        api.get('/opcion-listas'),
        api.get('/categorias'),
        api.get('/productos'),
      ]);
      setListas(Array.isArray(datos) ? datos : []);
      setCategorias(Array.isArray(cats) ? cats.filter((c) => c.activo) : []);
      setProductos(Array.isArray(prods) ? prods.filter((p) => p.activo) : []);
    } catch (error) {
      toast.error(error?.error || 'No se pudieron cargar las listas');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirNueva = () => setModal({ ...LISTA_VACIA, opciones: [{ nombre: '', precio: '' }] });

  const abrirEditar = (lista) =>
    setModal({
      ...lista,
      opciones:
        lista.opciones?.length > 0
          ? lista.opciones.map((o) => ({ ...o, precio: o.precio || '' }))
          : [{ nombre: '', precio: '' }],
    });

  const cambiarOpcion = (indice, campo, valor) =>
    setModal((prev) => ({
      ...prev,
      opciones: prev.opciones.map((opcion, i) =>
        i === indice ? { ...opcion, [campo]: valor } : opcion
      ),
    }));

  const guardar = async () => {
    const nombre = String(modal.nombre || '').trim();
    if (!nombre) {
      toast.error('Ponele un nombre a la lista');
      return;
    }
    const opciones = modal.opciones
      .filter((opcion) => String(opcion.nombre || '').trim())
      .map((opcion) => ({
        nombre: String(opcion.nombre).trim(),
        // El campo es de texto para poder escribir "1.000" como se escribe.
        // Va a pesos: el servidor lo pasa a centavos.
        precio: parseLocalizedAmount(opcion.precio, 0),
      }));

    if (opciones.length === 0) {
      toast.error('Cargale al menos una opción, o el grupo no se puede completar al vender');
      return;
    }

    setGuardando(true);
    try {
      const cuerpo = {
        nombre,
        tipo: modal.tipo,
        obligatorio: modal.obligatorio ? 1 : 0,
        activo: modal.activo ? 1 : 0,
        opciones,
      };
      if (modal.id) await api.put(`/opcion-listas/${modal.id}`, cuerpo);
      else await api.post('/opcion-listas', cuerpo);
      toast.success(modal.id ? 'Lista actualizada' : 'Lista creada');
      setModal(null);
      cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const reactivar = async (lista) => {
    try {
      // Se manda sólo la cabecera, sin `opciones`: la ruta las deja como están
      // cuando no vienen en el cuerpo. Mandar una lista vacía las borraría.
      await api.put(`/opcion-listas/${lista.id}`, { activo: 1 });
      toast.success(`"${lista.nombre}" volvió a estar activa`);
      cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo reactivar');
    }
  };

  const confirmarBorrar = async () => {
    try {
      const resultado = await api.delete(`/opcion-listas/${aBorrar.id}`);
      toast.success(resultado?.mensaje || 'Lista eliminada');
      setABorrar(null);
      cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo eliminar');
    }
  };

  const productosDeCategoria = useMemo(() => {
    if (!asignar?.categoriaId) return [];
    return productos.filter((p) => Number(p.categoria_id) === Number(asignar.categoriaId));
  }, [asignar, productos]);

  const confirmarAsignar = async () => {
    if (!asignar?.categoriaId) {
      toast.error('Elegí una categoría');
      return;
    }
    setGuardando(true);
    try {
      const resultado = await api.post(`/opcion-listas/${asignar.lista.id}/asignar`, {
        categoria_id: Number(asignar.categoriaId),
      });
      toast.success(resultado?.mensaje || 'Listo');
      setAsignar(null);
      cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo asignar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8 pt-2" style={{ background: APP_BG }}>
      {/* ── Cabecera ── */}
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              Listas de opciones
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-gray-500">
              Cargá las guarniciones, las salsas, los agregados y los postres una sola vez, y
              asignáselos a los platos que los llevan. Cambiás un precio en un lugar y cambia en
              todos.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={cargar}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-gray-200 px-4 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50"
            >
              <RefreshCw size={15} strokeWidth={STROKE} />
              Recargar
            </button>
            <button
              type="button"
              onClick={abrirNueva}
              className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              <Plus size={16} strokeWidth={2.4} />
              Nueva lista
            </button>
          </div>
        </div>
      </div>

      {/* ── Listas ── */}
      {cargando ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl bg-white py-16 text-[13px] text-gray-500 shadow-sm">
          <Loader2 size={16} className="animate-spin" />
          Cargando…
        </div>
      ) : listas.length === 0 ? (
        <div className="rounded-3xl bg-white px-6 py-16 text-center shadow-sm">
          <ChefHat size={30} className="mx-auto text-gray-300" strokeWidth={1.6} />
          <p className="mt-3 text-[15px] font-semibold text-gray-900">Todavía no hay listas</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-gray-500">
            Empezá por las guarniciones: cargalas una vez y asignáselas a las milanesas, las
            supremas y los menús de una.
          </p>
          <button
            type="button"
            onClick={abrirNueva}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            <Plus size={16} strokeWidth={2.4} />
            Crear la primera
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {listas.map((lista) => (
            <div
              key={lista.id}
              className={`rounded-3xl bg-white p-5 shadow-sm transition ${lista.activo ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[15px] font-semibold text-gray-900">
                      {lista.nombre}
                    </h2>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        lista.tipo === 'extra'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {lista.tipo === 'extra' ? 'Se agregan' : 'Se elige una'}
                    </span>
                    {lista.obligatorio ? (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                        Obligatoria
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {lista.opciones.length} opcion{lista.opciones.length === 1 ? '' : 'es'} ·{' '}
                    {lista.productos.length === 0 ? (
                      <span className="font-semibold text-amber-600">sin platos asignados</span>
                    ) : (
                      `en ${lista.productos.length} plato${lista.productos.length === 1 ? '' : 's'}`
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {/*
                    Borrar una lista en uso la desactiva en vez de borrarla, así
                    los platos no se quedan sin sus opciones de golpe. Sin este
                    botón esa decisión era de ida: la lista quedaba gris para
                    siempre y había que rehacerla a mano.
                  */}
                  {lista.activo ? null : (
                    <button
                      type="button"
                      onClick={() => reactivar(lista)}
                      className="rounded-xl px-2.5 py-2 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-50"
                    >
                      Reactivar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAsignar({ lista, categoriaId: '' })}
                    title="Asignar a varios platos"
                    className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  >
                    <ListPlus size={16} strokeWidth={STROKE} />
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirEditar(lista)}
                    title="Editar"
                    className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  >
                    <Pencil size={16} strokeWidth={STROKE} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setABorrar(lista)}
                    title="Eliminar"
                    className="rounded-xl p-2 text-gray-400 transition hover:bg-danger-50 hover:text-danger-600"
                  >
                    <Trash2 size={16} strokeWidth={STROKE} />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {lista.opciones.map((opcion) => (
                  <span
                    key={opcion.id}
                    className="rounded-lg bg-gray-50 px-2.5 py-1 text-[12px] text-gray-700"
                  >
                    {opcion.nombre}
                    {Number(opcion.precio) > 0 ? (
                      <span className="ml-1 font-semibold tabular-nums">+{fmt(opcion.precio)}</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Alta y edición ── */}
      {modal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setModal(null);
          }}
          role="presentation"
        >
          <div
            className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={modal.id ? 'Editar lista' : 'Nueva lista'}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <h3 className="text-[17px] font-semibold text-gray-900">
                {modal.id ? 'Editar lista' : 'Nueva lista'}
              </h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                aria-label="Cerrar"
                className="rounded-xl p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={18} strokeWidth={STROKE} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div>
                <label
                  htmlFor="lista-nombre"
                  className="mb-1.5 block text-[12px] font-medium text-gray-500"
                >
                  Nombre
                </label>
                <input
                  id="lista-nombre"
                  value={modal.nombre}
                  onChange={(e) => setModal({ ...modal, nombre: e.target.value })}
                  placeholder="Guarniciones, Salsas, Agregados…"
                  className={CONTROL}
                />
              </div>

              <div>
                <span className="mb-1.5 block text-[12px] font-medium text-gray-500">
                  Cómo se elige
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      valor: 'variante',
                      titulo: 'Se elige una',
                      ayuda: 'Guarnición, salsa, tamaño',
                    },
                    {
                      valor: 'extra',
                      titulo: 'Se agregan varias',
                      ayuda: 'Agregados, postre',
                    },
                  ].map((opcion) => (
                    <button
                      key={opcion.valor}
                      type="button"
                      aria-pressed={modal.tipo === opcion.valor}
                      onClick={() => setModal({ ...modal, tipo: opcion.valor })}
                      className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                        modal.tipo === opcion.valor
                          ? 'border-transparent bg-brand-50 ring-2 ring-brand-500'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <span className="block text-[13px] font-medium text-gray-900">
                        {opcion.titulo}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-gray-500">{opcion.ayuda}</span>
                    </button>
                  ))}
                </div>
              </div>

              {modal.tipo === 'variante' ? (
                <button
                  type="button"
                  onClick={() => setModal({ ...modal, obligatorio: modal.obligatorio ? 0 : 1 })}
                  className="flex w-full items-center gap-3 rounded-2xl border border-gray-200 px-3 py-2.5 text-left transition hover:bg-gray-50"
                >
                  <span
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-md border ${modal.obligatorio ? 'border-transparent text-white' : 'border-gray-300 bg-white'}`}
                    style={modal.obligatorio ? { backgroundColor: BRAND } : undefined}
                  >
                    {modal.obligatorio ? <CheckCircle2 size={12} strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-gray-900">
                      Hay que elegir sí o sí
                    </span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">
                      No se puede cerrar el pedido sin elegir una opción
                    </span>
                  </span>
                </button>
              ) : null}

              <div>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[12px] font-medium text-gray-500">Opciones</span>
                  <span className="text-[11px] text-gray-400">
                    El precio es lo que se suma al plato. Dejalo en cero si va incluida.
                  </span>
                </div>
                <div className="space-y-2">
                  {modal.opciones.map((opcion, indice) => (
                    <div key={indice} className="flex gap-2">
                      <input
                        value={opcion.nombre}
                        onChange={(e) => cambiarOpcion(indice, 'nombre', e.target.value)}
                        placeholder="Papas fritas"
                        className={CONTROL}
                      />
                      <input
                        value={opcion.precio}
                        onChange={(e) => cambiarOpcion(indice, 'precio', e.target.value)}
                        placeholder="0"
                        inputMode="decimal"
                        className={`${CONTROL} w-32 shrink-0 text-right tabular-nums`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setModal({
                            ...modal,
                            opciones: modal.opciones.filter((_, i) => i !== indice),
                          })
                        }
                        aria-label={`Sacar la opción ${indice + 1}`}
                        className="shrink-0 rounded-xl px-2 text-gray-400 transition hover:bg-danger-50 hover:text-danger-600"
                      >
                        <Trash2 size={15} strokeWidth={STROKE} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setModal({
                      ...modal,
                      opciones: [...modal.opciones, { nombre: '', precio: '' }],
                    })
                  }
                  className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-[12px] font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  <Plus size={14} strokeWidth={2.4} />
                  Agregar opción
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-11 rounded-xl border border-gray-200 bg-white px-5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardando}
                onClick={guardar}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition disabled:opacity-60"
                style={{ backgroundColor: BRAND }}
              >
                {guardando ? <Loader2 size={15} className="animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Asignar a una categoría entera ── */}
      <ActionDialog
        open={Boolean(asignar)}
        tone="primary"
        title={`Asignar "${asignar?.lista?.nombre || ''}" a varios platos`}
        description="Elegí una categoría y la lista queda en todos sus platos activos. Los que ya la tenían no se duplican."
        confirmLabel={
          productosDeCategoria.length > 0
            ? `Asignar a ${productosDeCategoria.length} plato${productosDeCategoria.length === 1 ? '' : 's'}`
            : 'Asignar'
        }
        loading={guardando}
        onConfirm={confirmarAsignar}
        onClose={() => setAsignar(null)}
      >
        <div className="mt-4">
          <label
            htmlFor="asignar-categoria"
            className="mb-1.5 block text-[12px] font-medium text-gray-500"
          >
            Categoría
          </label>
          <select
            id="asignar-categoria"
            value={asignar?.categoriaId || ''}
            onChange={(e) => setAsignar({ ...asignar, categoriaId: e.target.value })}
            className={CONTROL}
          >
            <option value="">Elegí una…</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
          {productosDeCategoria.length > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-gray-500">
              <Utensils size={13} className="mt-0.5 shrink-0" strokeWidth={STROKE} />
              <span>{productosDeCategoria.map((p) => p.nombre).join(', ')}</span>
            </p>
          ) : null}
        </div>
      </ActionDialog>

      {/* ── Borrar ── */}
      <ActionDialog
        open={Boolean(aBorrar)}
        tone="danger"
        title={`Eliminar "${aBorrar?.nombre || ''}"`}
        description={
          aBorrar?.productos?.length > 0
            ? `La usan ${aBorrar.productos.length} plato${aBorrar.productos.length === 1 ? '' : 's'}. Se va a desactivar en lugar de borrarse, para no dejarlos sin sus opciones.`
            : 'No la usa ningún plato, así que se elimina del todo.'
        }
        confirmLabel={aBorrar?.productos?.length > 0 ? 'Desactivar' : 'Eliminar'}
        onConfirm={confirmarBorrar}
        onClose={() => setABorrar(null)}
      />
    </div>
  );
}
