import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  ImageOff,
  ImagePlus,
  LayoutGrid,
  List,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import api from '../lib/api.js';
import ActionDialog from '../components/ActionDialog.jsx';
import { resolveAssetUrl } from '../lib/assets.js';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';
import { Stat } from './Clientes/clientesUi.jsx';

const ICONOS = [
  '🍕',
  '🥟',
  '🥩',
  '🍔',
  '🌮',
  '🍣',
  '🍝',
  '🥗',
  '🍰',
  '🥤',
  '🍺',
  '☕',
  '🍦',
  '🥪',
  '🍟',
];

const COLORES = [
  '#DC1F2D',
  '#E0A924',
  '#C98A3E',
  '#047857',
  '#0F766E',
  '#1F5FA0',
  '#6D28D9',
  '#BE185D',
];

const EMPTY_FORM = {
  nombre: '',
  icono: '🍕',
  color: '#DC1F2D',
  orden: 0,
  activo: 1,
  imagen: '',
  subcategorias: [],
  turno_id: '',
};

const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

function rgba(hex, alpha) {
  const clean = String(hex || '#DC1F2D').replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return `rgba(220,31,45,${alpha})`;
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function parseTurnos(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const texto = (valor) => String(valor ?? '').toLowerCase();

function Miniatura({ categoria, size = 'h-12 w-12', emoji = 'text-[24px]' }) {
  // La imagen se pasaba cruda en los tres lugares donde se dibuja una
  // categoría, así que la foto subida nunca aparecía.
  const src = resolveAssetUrl(categoria.imagen);
  const color = categoria.color || '#6B7280';

  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-xl`}
      style={{ background: rgba(color, 0.14) }}
    >
      {src ? (
        <img src={src} alt={categoria.nombre} className="h-full w-full object-cover" />
      ) : categoria.icono ? (
        <span className={emoji}>{categoria.icono}</span>
      ) : (
        <ImageOff size={18} strokeWidth={STROKE} style={{ color }} />
      )}
    </div>
  );
}

/**
 * Aviso de categoría activa y vacía.
 *
 * Una categoría publicada sin productos aparece en la web y en el TPV como
 * una pestaña que al abrirla no tiene nada. Es el error más común al armar
 * la carta y no se avisaba en ningún lado.
 */
function avisoVacia(categoria) {
  return Number(categoria.activo) === 1 && categoria.productos === 0;
}

export default function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reordenando, setReordenando] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todas');
  const [sortBy, setSortBy] = useState('orden');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [cats, prods, config] = await Promise.all([
        api.get('/categorias'),
        api.get('/productos'),
        api.get('/configuracion/panel'),
      ]);
      setCategorias(cats || []);
      setProductos(prods || []);
      setTurnos(parseTurnos(config?.turnos_negocio).filter((turno) => turno?.activo !== false));
    } catch (error) {
      toast.error(error?.error || 'Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const turnoLabel = (turnoId) => {
    if (!turnoId) return 'Siempre visible';
    return turnos.find((t) => t.id === turnoId)?.nombre || turnoId;
  };

  const conteos = useMemo(() => {
    // Se contaban todos los productos, activos e inactivos. Una categoría con
    // ocho productos apagados figuraba con ocho, aunque en la carta esté vacía.
    return productos.reduce((acc, producto) => {
      const key = producto.categoria_id ?? producto.categoriaId;
      if (!key) return acc;
      if (!acc[key]) acc[key] = { total: 0, activos: 0 };
      acc[key].total += 1;
      if (Number(producto.activo) === 1) acc[key].activos += 1;
      return acc;
    }, {});
  }, [productos]);

  const categoriasUi = useMemo(
    () =>
      categorias.map((categoria) => ({
        ...categoria,
        productos: conteos[categoria.id]?.activos || 0,
        productosTotal: conteos[categoria.id]?.total || 0,
      })),
    [categorias, conteos]
  );

  const filtered = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const items = categoriasUi.filter((categoria) => {
      // Buscaba también dentro del color en hexadecimal: escribir "22"
      // devolvía categorías por su código de color. Y sin guardas, una
      // categoría con nombre o color nulo tiraba abajo la pantalla.
      const matchSearch = !term || texto(categoria.nombre).includes(term);

      const active = Number(categoria.activo) === 1;
      const matchState =
        estadoFiltro === 'todas' ||
        (estadoFiltro === 'activas' && active) ||
        (estadoFiltro === 'inactivas' && !active) ||
        (estadoFiltro === 'vacias' && avisoVacia(categoria));

      return matchSearch && matchState;
    });

    const porNombre = (a, b) => texto(a.nombre).localeCompare(texto(b.nombre), 'es');
    const list = [...items];

    if (sortBy === 'nombre') return list.sort(porNombre);
    if (sortBy === 'productos')
      return list.sort((a, b) => b.productos - a.productos || porNombre(a, b));
    if (sortBy === 'estado')
      return list.sort((a, b) => Number(b.activo) - Number(a.activo) || porNombre(a, b));
    return list.sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0) || porNombre(a, b));
  }, [busqueda, categoriasUi, estadoFiltro, sortBy]);

  const stats = useMemo(() => {
    const activas = categoriasUi.filter((c) => Number(c.activo) === 1).length;
    const vacias = categoriasUi.filter(avisoVacia).length;
    return {
      total: categoriasUi.length,
      activas,
      inactivas: categoriasUi.length - activas,
      vacias,
      productos: categoriasUi.reduce((acc, c) => acc + c.productos, 0),
    };
  }, [categoriasUi]);

  const hayFiltros = Boolean(busqueda.trim()) || estadoFiltro !== 'todas';
  // Reordenar sólo tiene sentido viendo la lista completa en su orden real.
  const puedeReordenar = sortBy === 'orden' && !hayFiltros;

  /**
   * Subir y bajar en el orden.
   *
   * El campo `orden` sólo se podía cambiar escribiendo un número a mano
   * dentro del formulario, de a una categoría por vez, adivinando qué número
   * tenían las demás. Para ordenar la carta —que es todo el propósito de
   * esta pantalla— era el camino más largo posible.
   */
  const mover = async (categoria, direccion) => {
    if (reordenando) return;
    const indice = filtered.findIndex((item) => item.id === categoria.id);
    const vecino = filtered[indice + direccion];
    if (!vecino) return;

    setReordenando(true);
    try {
      await Promise.all([
        api.put(`/categorias/${categoria.id}`, { orden: Number(vecino.orden || 0) }),
        api.put(`/categorias/${vecino.id}`, { orden: Number(categoria.orden || 0) }),
      ]);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo reordenar');
    } finally {
      setReordenando(false);
    }
  };

  const abrir = (categoria = null) => {
    if (!categoria) {
      const maxOrden = categorias.reduce((acc, c) => Math.max(acc, Number(c.orden || 0)), 0);
      setForm({ ...EMPTY_FORM, orden: maxOrden + 1 });
      setImageFile(null);
      setPreviewFromFile(null);
      setRemoveImage(false);
      setModal('nuevo');
      return;
    }

    setForm({
      nombre: categoria.nombre || '',
      icono: categoria.icono || '🍕',
      color: categoria.color || '#DC1F2D',
      orden: Number(categoria.orden) || 0,
      activo: Number(categoria.activo) === 1 ? 1 : 0,
      imagen: categoria.imagen || '',
      subcategorias: categoria.subcategorias || [],
      turno_id: categoria.turno_id || '',
    });
    setImageFile(null);
    setImagePreview(resolveAssetUrl(categoria.imagen));
    setRemoveImage(false);
    setModal(categoria);
  };

  const cerrarModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setPreviewFromFile(null);
    setRemoveImage(false);
  };

  /**
   * Cada `URL.createObjectURL` reserva memoria hasta liberarla a mano, y acá
   * no se liberaba nunca: probar varias fotos dejaba todas colgadas hasta
   * recargar la página.
   */
  const objectUrlRef = useRef('');
  const setPreviewFromFile = (file) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = file ? URL.createObjectURL(file) : '';
    setImagePreview(objectUrlRef.current);
  };

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  const handleImageChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Elegí un archivo de imagen');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen supera los 5 MB');
      return;
    }
    setImageFile(file);
    setPreviewFromFile(file);
    setRemoveImage(false);
  };

  const clearImage = () => {
    setImageFile(null);
    setPreviewFromFile(null);
    setRemoveImage(true);
    setForm((prev) => ({ ...prev, imagen: '' }));
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('nombre', form.nombre.trim());
      payload.append('icono', form.icono);
      payload.append('color', form.color);
      payload.append('orden', String(form.orden ?? 0));
      payload.append('activo', String(form.activo ?? 1));
      payload.append('turno_id', String(form.turno_id || ''));
      payload.append(
        'subcategorias',
        JSON.stringify((form.subcategorias || []).filter((sub) => sub?.nombre?.trim()))
      );
      if (imageFile) payload.append('imagen', imageFile);
      if (removeImage) payload.append('remove_imagen', '1');

      if (modal === 'nuevo') {
        await api.post('/categorias', payload);
        toast.success('Categoría creada');
      } else {
        await api.put(`/categorias/${modal.id}`, payload);
        toast.success('Categoría actualizada');
      }
      cerrarModal();
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const confirmarEliminar = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/categorias/${deleteDialog.id}`);
      toast.success('Categoría eliminada');
      setDeleteDialog(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error al eliminar');
    }
  };

  const toggleActivo = async (categoria) => {
    try {
      await api.put(`/categorias/${categoria.id}`, {
        activo: Number(categoria.activo) === 1 ? 0 : 1,
      });
      toast.success(Number(categoria.activo) === 1 ? 'Categoría oculta' : 'Categoría publicada');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error al cambiar estado');
    }
  };

  const setSub = (index, value) =>
    setForm((prev) => ({
      ...prev,
      subcategorias: prev.subcategorias.map((sub, i) =>
        i === index ? { ...sub, nombre: value } : sub
      ),
    }));

  const addSub = () =>
    setForm((prev) => ({
      ...prev,
      subcategorias: [...(prev.subcategorias || []), { nombre: '' }],
    }));

  const removeSub = (index) =>
    setForm((prev) => ({
      ...prev,
      subcategorias: prev.subcategorias.filter((_, i) => i !== index),
    }));

  const limpiarFiltros = () => {
    setBusqueda('');
    setEstadoFiltro('todas');
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-7xl space-y-4 pb-10">
        {/* ── Encabezado ── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Categorías</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {stats.total === 0
                ? 'Todavía no hay categorías'
                : `${stats.total} en la carta · ${stats.activas} publicadas`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => abrir()}
              style={{ background: BRAND }}
              className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              <Plus size={16} strokeWidth={STROKE} />
              Nueva categoría
            </button>

            <div className="flex rounded-xl bg-gray-200/70 p-1">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Ver como tarjetas"
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                <LayoutGrid size={16} strokeWidth={STROKE} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Ver como lista"
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                  viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                <List size={16} strokeWidth={STROKE} />
              </button>
            </div>

            <button
              type="button"
              onClick={cargar}
              title="Actualizar"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/*
          Eran cuatro contadores: total, activas, inactivas y productos. Los
          dos primeros ya están en el subtítulo. "Categorías vacías" es el que
          realmente pide hacer algo: una categoría publicada sin productos
          aparece en la carta como una pestaña que no tiene nada adentro.
        */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Publicadas"
            value={stats.activas}
            helper="Se ven en el TPV y en la web"
            tono="verde"
          />
          <Stat
            label="Publicadas sin productos"
            value={stats.vacias}
            helper={stats.vacias > 0 ? 'Se ven vacías en la carta' : 'Ninguna vacía'}
            alerta={stats.vacias > 0}
          />
          <Stat label="Ocultas" value={stats.inactivas} helper="No se muestran" tono="ambar" />
          <Stat
            label="Productos publicados"
            value={stats.productos}
            helper="Repartidos en las categorías"
            tono="azul"
          />
        </div>

        {/* ── Filtros ── */}
        <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))]">
            <div className="relative">
              <Search
                size={16}
                strokeWidth={STROKE}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar categoría"
                className={CONTROL + ' pl-9'}
              />
            </div>

            <select
              value={estadoFiltro}
              onChange={(event) => setEstadoFiltro(event.target.value)}
              className={CONTROL + ' font-medium'}
            >
              <option value="todas">Todas</option>
              <option value="activas">Solo publicadas</option>
              <option value="inactivas">Solo ocultas</option>
              <option value="vacias">Publicadas sin productos</option>
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className={CONTROL + ' font-medium'}
            >
              <option value="orden">Orden de la carta</option>
              <option value="nombre">Por nombre</option>
              <option value="productos">Por productos</option>
              <option value="estado">Por estado</option>
            </select>
          </div>

          {hayFiltros ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
              <p className="text-[12px] text-gray-500">
                Mostrando <span className="font-semibold text-gray-900">{filtered.length}</span> de{' '}
                {stats.total}
              </p>
              <button
                type="button"
                onClick={limpiarFiltros}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
              >
                <X size={13} strokeWidth={STROKE} />
                Limpiar filtros
              </button>
            </div>
          ) : (
            <p className="mt-3 border-t border-gray-100 pt-3 text-[12px] text-gray-400">
              El orden de esta lista es el orden en que el cliente ve la carta.
              {!puedeReordenar ? ' Ordená por “Orden de la carta” para poder moverlas.' : ''}
            </p>
          )}
        </div>

        {/* ── Listado ── */}
        {loading ? (
          <div
            className={`grid gap-3 ${viewMode === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : ''}`}
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-40 animate-pulse rounded-2xl bg-gray-200/70" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-14 text-center">
            <p className="text-[14px] font-medium text-gray-600">
              {hayFiltros ? 'Ninguna categoría coincide' : 'Todavía no hay categorías'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-4 text-gray-400">
              {hayFiltros
                ? 'Probá con otra búsqueda o sacá los filtros.'
                : 'Las categorías agrupan los productos en el TPV y en la web.'}
            </p>
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={hayFiltros ? limpiarFiltros : () => abrir()}
                style={hayFiltros ? undefined : { background: BRAND }}
                className={`h-10 rounded-xl px-4 text-[13px] font-semibold transition ${
                  hayFiltros
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'text-white hover:brightness-110'
                }`}
              >
                {hayFiltros ? 'Limpiar filtros' : 'Crear la primera'}
              </button>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((categoria, index) => {
              const active = Number(categoria.activo) === 1;
              const color = categoria.color || '#6B7280';
              const vacia = avisoVacia(categoria);

              return (
                <article
                  key={categoria.id}
                  className={`group overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)] ${
                    active ? '' : 'opacity-70'
                  }`}
                >
                  <div
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ background: rgba(color, 0.13) }}
                  >
                    <Miniatura categoria={categoria} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-gray-900">
                        {categoria.nombre}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color }}>
                        <Clock size={11} strokeWidth={STROKE} />
                        {turnoLabel(categoria.turno_id)}
                      </p>
                    </div>

                    {puedeReordenar ? (
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          onClick={() => mover(categoria, -1)}
                          disabled={index === 0 || reordenando}
                          title="Subir en la carta"
                          className="rounded p-0.5 text-gray-500 transition hover:bg-white disabled:opacity-25"
                        >
                          <ArrowUp size={14} strokeWidth={STROKE} />
                        </button>
                        <button
                          type="button"
                          onClick={() => mover(categoria, 1)}
                          disabled={index === filtered.length - 1 || reordenando}
                          title="Bajar en la carta"
                          className="rounded p-0.5 text-gray-500 transition hover:bg-white disabled:opacity-25"
                        >
                          <ArrowDown size={14} strokeWidth={STROKE} />
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={
                          active
                            ? { background: '#E7F5EF', color: '#0F6E56' }
                            : { background: '#E5E7EB', color: '#4B5563' }
                        }
                      >
                        {active ? 'Publicada' : 'Oculta'}
                      </span>
                      {vacia ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ background: '#FEF2F2', color: '#9E141E' }}
                        >
                          Sin productos
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                      <Package size={15} strokeWidth={STROKE} className="text-gray-400" />
                      <p className="text-[13px] text-gray-700">
                        <span className="font-bold tabular-nums text-gray-900">
                          {categoria.productos}
                        </span>{' '}
                        {categoria.productos === 1 ? 'producto' : 'productos'}
                        {categoria.productosTotal > categoria.productos ? (
                          <span className="text-gray-400">
                            {' '}
                            · {categoria.productosTotal - categoria.productos} sin publicar
                          </span>
                        ) : null}
                      </p>
                    </div>

                    {categoria.subcategorias?.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {categoria.subcategorias.slice(0, 4).map((sub, i) => (
                          <span
                            key={`${sub.nombre}-${i}`}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                          >
                            {sub.nombre}
                          </span>
                        ))}
                        {categoria.subcategorias.length > 4 ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                            +{categoria.subcategorias.length - 4}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                      <button
                        type="button"
                        onClick={() => toggleActivo(categoria)}
                        className={`h-9 rounded-xl text-[12px] font-semibold transition ${
                          active
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {active ? 'Ocultar' : 'Publicar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => abrir(categoria)}
                        title="Editar"
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200"
                      >
                        <Pencil size={14} strokeWidth={STROKE} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteDialog(categoria)}
                        title="Eliminar"
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={14} strokeWidth={STROKE} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-gray-50 text-[11px] text-gray-500">
                  <tr>
                    {puedeReordenar ? <th className="px-3 py-2.5" /> : null}
                    <th className="px-3 py-2.5 font-medium">Categoría</th>
                    <th className="px-3 py-2.5 font-medium">Se ve en</th>
                    <th className="px-3 py-2.5 text-right font-medium">Productos</th>
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((categoria, index) => {
                    const active = Number(categoria.activo) === 1;
                    const vacia = avisoVacia(categoria);

                    return (
                      <tr key={categoria.id} className="transition hover:bg-gray-50">
                        {puedeReordenar ? (
                          <td className="px-3 py-3">
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => mover(categoria, -1)}
                                disabled={index === 0 || reordenando}
                                title="Subir"
                                className="rounded p-0.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700 disabled:opacity-25"
                              >
                                <ArrowUp size={13} strokeWidth={STROKE} />
                              </button>
                              <button
                                type="button"
                                onClick={() => mover(categoria, 1)}
                                disabled={index === filtered.length - 1 || reordenando}
                                title="Bajar"
                                className="rounded p-0.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700 disabled:opacity-25"
                              >
                                <ArrowDown size={13} strokeWidth={STROKE} />
                              </button>
                            </div>
                          </td>
                        ) : null}

                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <Miniatura categoria={categoria} size="h-10 w-10" emoji="text-[19px]" />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-gray-900">
                                {categoria.nombre}
                              </p>
                              {categoria.subcategorias?.length > 0 ? (
                                <p className="truncate text-[11px] text-gray-400">
                                  {categoria.subcategorias.length} subcategorías
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <span className="text-[12px] text-gray-600">
                            {turnoLabel(categoria.turno_id)}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-right">
                          <span
                            className="text-[13px] font-medium tabular-nums"
                            style={{ color: vacia ? BRAND : '#374151' }}
                          >
                            {categoria.productos}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={
                                active
                                  ? { background: '#E7F5EF', color: '#0F6E56' }
                                  : { background: '#E5E7EB', color: '#4B5563' }
                              }
                            >
                              {active ? 'Publicada' : 'Oculta'}
                            </span>
                            {vacia ? (
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{ background: '#FEF2F2', color: '#9E141E' }}
                              >
                                Vacía
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              type="button"
                              onClick={() => abrir(categoria)}
                              title="Editar"
                              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                            >
                              <Pencil size={15} strokeWidth={STROKE} />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActivo(categoria)}
                              className={`ml-1 h-8 rounded-lg px-2.5 text-[12px] font-semibold transition ${
                                active
                                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              {active ? 'Ocultar' : 'Publicar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteDialog(categoria)}
                              title="Eliminar"
                              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 size={15} strokeWidth={STROKE} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {modal && (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
          }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          onClick={cerrarModal}
        >
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
            }}
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-[17px] font-semibold text-gray-900">
                  {modal === 'nuevo' ? 'Nueva categoría' : `Editar ${form.nombre || 'categoría'}`}
                </h2>
                <p className="mt-0.5 text-[12px] text-gray-500">
                  Agrupa productos en el TPV y en la web pública
                </p>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                aria-label="Cerrar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} strokeWidth={STROKE} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="field-Categorias-jsx-931-0"
                    className="block text-[12px] font-medium text-gray-600"
                  >
                    Nombre
                  </label>
                  <input
                    id="field-Categorias-jsx-931-0"
                    value={form.nombre}
                    onChange={(event) => setForm({ ...form, nombre: event.target.value })}
                    placeholder="Ej: Pizzas"
                    className={CONTROL + ' mt-1'}
                  />
                </div>

                <div>
                  <label
                    htmlFor="field-Categorias-jsx-941-1"
                    className="block text-[12px] font-medium text-gray-600"
                  >
                    Se ve en
                  </label>
                  <select
                    id="field-Categorias-jsx-941-1"
                    value={form.turno_id || ''}
                    onChange={(event) => setForm({ ...form, turno_id: event.target.value })}
                    className={CONTROL + ' mt-1 font-medium'}
                  >
                    <option value="">Siempre visible</option>
                    {turnos.map((turno) => (
                      <option key={turno.id} value={turno.id}>
                        Solo en {turno.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] leading-4 text-gray-400">
                    Atada a un turno, sólo aparece en ese horario.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="field-Categorias-jsx-960-2"
                    className="block text-[12px] font-medium text-gray-600"
                  >
                    Orden en la carta
                  </label>
                  <input
                    id="field-Categorias-jsx-960-2"
                    type="number"
                    min="0"
                    value={form.orden}
                    onChange={(event) => setForm({ ...form, orden: Number(event.target.value) })}
                    className={CONTROL + ' mt-1 tabular-nums'}
                  />
                  <p className="mt-1 text-[11px] leading-4 text-gray-400">
                    También se cambia con las flechas de la lista.
                  </p>
                </div>
              </div>

              <div>
                <p className="block text-[12px] font-medium text-gray-600">Ícono</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ICONOS.map((icono) => (
                    <button
                      key={icono}
                      type="button"
                      onClick={() => setForm({ ...form, icono })}
                      style={form.icono === icono ? { borderColor: form.color } : undefined}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 text-[20px] transition ${
                        form.icono === icono
                          ? 'bg-gray-50'
                          : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      {icono}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="field-Categorias-jsx-998-3"
                  className="block text-[12px] font-medium text-gray-600"
                >
                  Color
                </label>
                <p className="mt-0.5 text-[11px] leading-4 text-gray-400">
                  Es el color con el que se agrupan sus productos en el listado.
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {COLORES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setForm({ ...form, color })}
                      title={color}
                      className={`h-9 w-9 rounded-xl transition ${
                        form.color === color ? 'ring-2 ring-gray-900 ring-offset-2' : ''
                      }`}
                      style={{ background: color }}
                    />
                  ))}
                  <input
                    id="field-Categorias-jsx-998-3"
                    type="color"
                    value={form.color}
                    onChange={(event) => setForm({ ...form, color: event.target.value })}
                    title="Otro color"
                    className="h-9 w-9 cursor-pointer rounded-xl border border-gray-200 bg-white p-1"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="field-Categorias-jsx-1026-4"
                  className="block text-[12px] font-medium text-gray-600"
                >
                  Foto
                </label>
                <div className="mt-1.5 flex items-start gap-3">
                  <label className="flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 transition hover:border-gray-400">
                    {imagePreview ? (
                      <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImagePlus size={20} strokeWidth={STROKE} className="text-gray-400" />
                    )}
                    <input
                      id="field-Categorias-jsx-1026-4"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => handleImageChange(event.target.files?.[0])}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-4 text-gray-500">
                      Opcional. Si no cargás una foto se usa el ícono. Se ve en el TPV y en la web.
                    </p>
                    {imagePreview ? (
                      <button
                        type="button"
                        onClick={clearImage}
                        className="mt-2 h-9 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-rose-50 hover:text-rose-700"
                      >
                        Quitar foto
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="field-Categorias-jsx-1060-5"
                    className="block text-[12px] font-medium text-gray-600"
                  >
                    Subcategorías
                  </label>
                  <button
                    type="button"
                    onClick={addSub}
                    className="inline-flex h-9 items-center gap-1 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                  >
                    <Plus size={13} strokeWidth={STROKE} />
                    Agregar
                  </button>
                </div>

                {(form.subcategorias || []).length === 0 ? (
                  <p className="mt-1.5 rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-[13px] text-gray-400">
                    Sin subcategorías. Opcional, sirve para dividir categorías grandes.
                  </p>
                ) : (
                  <div className="mt-1.5 space-y-2">
                    {form.subcategorias.map((sub, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          id="field-Categorias-jsx-1060-5"
                          value={sub.nombre}
                          onChange={(event) => setSub(index, event.target.value)}
                          placeholder={`Subcategoría ${index + 1}`}
                          className={CONTROL}
                        />
                        <button
                          type="button"
                          onClick={() => removeSub(index)}
                          title="Quitar"
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={15} strokeWidth={STROKE} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-gray-50 p-3">
                <input
                  type="checkbox"
                  checked={form.activo === 1}
                  onChange={(event) => setForm({ ...form, activo: event.target.checked ? 1 : 0 })}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                  style={{ accentColor: BRAND }}
                />
                <span>
                  <span className="block text-[13px] font-medium text-gray-900">Publicada</span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-gray-500">
                    Si la ocultás, sus productos dejan de verse en el TPV y en la web.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={cerrarModal}
                className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={saving || !form.nombre.trim()}
                style={{ background: BRAND }}
                className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {saving ? 'Guardando…' : modal === 'nuevo' ? 'Crear categoría' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ActionDialog
        open={Boolean(deleteDialog)}
        title={deleteDialog ? `Eliminar ${deleteDialog.nombre}` : ''}
        description={
          deleteDialog?.productosTotal > 0
            ? `Esta categoría tiene ${deleteDialog.productosTotal} producto${
                deleteDialog.productosTotal === 1 ? '' : 's'
              }. Si la borrás, esos productos quedan sin categoría. Conviene ocultarla en vez de borrarla.`
            : 'Se elimina la categoría del sistema. No se puede deshacer.'
        }
        confirmLabel="Eliminar categoría"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={confirmarEliminar}
        onClose={() => setDeleteDialog(null)}
      />
    </div>
  );
}
