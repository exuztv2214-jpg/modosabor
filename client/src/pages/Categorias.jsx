import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  LayoutGrid,
  List,
  RefreshCw,
  Eye,
  Power,
  Layers3,
  Package,
  CheckCircle2,
  CircleOff,
  Palette,
  ImagePlus,
} from 'lucide-react';

import api from '../lib/api.js';
import ActionDialog from '../components/ActionDialog.jsx';
import { PageHeader } from '../design-system';

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
  '#f97316',
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];
const EMPTY_FORM = {
  nombre: '',
  icono: '🍕',
  color: '#f97316',
  orden: 0,
  activo: 1,
  imagen: '',
  subcategorias: [],
  turno_id: '',
};

const CONTROL =
  'h-11 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-medium text-gray-700 outline-none transition focus:border-primary-200 focus:bg-white focus:ring-4 focus:ring-blue-100';

function rgba(hex, alpha) {
  const clean = (hex || '#f97316').replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  const value = Number.parseInt(full, 16);

  if (Number.isNaN(value)) return `rgba(249,115,22,${alpha})`;

  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function codeFor(id, index) {
  return `CAT-${String(id ?? index + 1).padStart(3, '0')}`;
}

function stateText(activo) {
  return Number(activo) === 1 ? 'Activa' : 'Inactiva';
}

function sortItems(items, sortBy) {
  const list = [...items];
  if (sortBy === 'nombre') return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (sortBy === 'productos')
    return list.sort((a, b) => b.productos - a.productos || a.orden - b.orden);
  if (sortBy === 'estado')
    return list.sort(
      (a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre)
    );
  return list.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-100 hover:shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-gray-900">{value}</p>
        </div>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: rgba(tone, 0.14), color: tone }}
        >
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ categoria, onView, onEdit, onToggle, onDelete, turnoLabel }) {
  const active = Number(categoria.activo) === 1;

  return (
    <article className="group flex h-full flex-col rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-indigo-100 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white text-[30px] shadow-sm"
            style={{ backgroundColor: rgba(categoria.color, 0.14) }}
          >
            {categoria.imagen ? (
              <img
                src={categoria.imagen}
                alt={categoria.nombre}
                className="h-full w-full object-cover"
              />
            ) : (
              categoria.icono || '🍽️'
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
              {categoria.codigo}
            </p>
            <h3 className="truncate text-lg font-black tracking-tight text-gray-900">
              {categoria.nombre}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
              <span
                className={`rounded-full px-2.5 py-1 font-bold ${active ? 'bg-success-100 text-success-700' : 'bg-gray-200 text-gray-600'}`}
              >
                {stateText(categoria.activo)}
              </span>
              <span>Orden {categoria.orden}</span>
            </div>
            <div className="mt-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${categoria.turno_id ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}
              >
                {turnoLabel ? turnoLabel(categoria.turno_id) : 'Siempre visible'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-1 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onView(categoria)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(categoria)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Pencil size={15} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
            Productos
          </p>
          <p className="mt-1 text-xl font-black tracking-tight text-primary-500">
            {categoria.productos}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Color</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full border border-white"
              style={{ backgroundColor: categoria.color }}
            />
            <span className="text-sm font-semibold text-gray-700">{categoria.color}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-gray-500">
        Vista compacta, clara y reutilizable para el resto del admin.
      </div>

      {categoria.subcategorias?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {categoria.subcategorias.slice(0, 3).map((sub, index) => (
            <span
              key={`${sub.nombre}-${index}`}
              className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600"
            >
              {sub.nombre}
            </span>
          ))}
          {categoria.subcategorias.length > 3 && (
            <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-500">
              +{categoria.subcategorias.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onToggle(categoria)}
          className={`h-10 rounded-2xl text-sm font-bold transition ${active ? 'bg-warning-50 text-warning-700 hover:bg-warning-100' : 'bg-success-50 text-success-700 hover:bg-success-100'}`}
        >
          {active ? 'Desactivar' : 'Activar'}
        </button>
        <button
          type="button"
          onClick={() => onDelete(categoria)}
          className="h-10 rounded-2xl border border-rose-200 text-sm font-bold text-danger-600 transition hover:bg-danger-50"
        >
          Eliminar
        </button>
      </div>
    </article>
  );
}

function CategoryRow({ categoria, onView, onEdit, onToggle, onDelete }) {
  const active = Number(categoria.activo) === 1;

  return (
    <tr className="border-b border-slate-100 transition hover:bg-slate-50">
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white text-2xl"
            style={{ backgroundColor: rgba(categoria.color, 0.14) }}
          >
            {categoria.imagen ? (
              <img
                src={categoria.imagen}
                alt={categoria.nombre}
                className="h-full w-full object-cover"
              />
            ) : (
              categoria.icono
            )}
          </div>
          <div>
            <p className="font-bold text-gray-900">{categoria.nombre}</p>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
              {categoria.codigo}
            </p>
          </div>
        </div>
      </td>
      <td className="px-5 py-4 text-sm text-gray-600">{categoria.orden}</td>
      <td className="px-5 py-4 text-sm font-semibold text-gray-900">{categoria.productos}</td>
      <td className="px-5 py-4">
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'bg-success-100 text-success-700' : 'bg-gray-200 text-gray-600'}`}
        >
          {stateText(categoria.activo)}
        </span>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <span
            className="h-4 w-4 rounded-full border border-white"
            style={{ backgroundColor: categoria.color }}
          />
          <span className="text-sm text-gray-500">{categoria.color}</span>
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onView(categoria)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(categoria)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => onToggle(categoria)}
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${active ? 'border-amber-200 bg-warning-50 text-warning-700 hover:bg-warning-100' : 'border-emerald-200 bg-success-50 text-success-700 hover:bg-success-100'}`}
          >
            <Power size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(categoria)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-danger-50 text-danger-600 transition hover:bg-danger-100"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function parseTurnos(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState('grid');
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todas');
  const [sortBy, setSortBy] = useState('orden');
  const [modal, setModal] = useState(null);
  const [detalle, setDetalle] = useState(null);
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
        api.get('/configuracion'),
      ]);
      setCategorias(cats);
      setProductos(prods);
      setTurnos(parseTurnos(config?.turnos_negocio).filter((turno) => turno?.activo !== false));
    } catch (error) {
      toast.error(error?.error || 'Error al cargar categorias');
    } finally {
      setLoading(false);
    }
  };

  const turnoLabel = (turnoId) => {
    if (!turnoId) return 'Siempre visible';
    const turno = turnos.find((t) => t.id === turnoId);
    return turno?.nombre || turnoId;
  };

  useEffect(() => {
    cargar();
  }, []);

  const countByCategory = useMemo(() => {
    return productos.reduce((acc, producto) => {
      const key = producto.categoria_id ?? producto.categoriaId;
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [productos]);

  const categoriasUi = useMemo(() => {
    return categorias.map((categoria, index) => ({
      ...categoria,
      codigo: codeFor(categoria.id, index),
      productos: countByCategory[categoria.id] || 0,
    }));
  }, [categorias, countByCategory]);

  const filtered = useMemo(() => {
    const items = categoriasUi.filter((categoria) => {
      const term = busqueda.trim().toLowerCase();
      const matchSearch =
        !term ||
        categoria.nombre.toLowerCase().includes(term) ||
        categoria.codigo.toLowerCase().includes(term) ||
        categoria.color.toLowerCase().includes(term);

      const active = Number(categoria.activo) === 1;
      const matchState =
        estadoFiltro === 'todas' ||
        (estadoFiltro === 'activas' && active) ||
        (estadoFiltro === 'inactivas' && !active);

      return matchSearch && matchState;
    });

    return sortItems(items, sortBy);
  }, [busqueda, categoriasUi, estadoFiltro, sortBy]);

  const stats = useMemo(() => {
    const activas = categoriasUi.filter((categoria) => Number(categoria.activo) === 1).length;
    return {
      total: categoriasUi.length,
      activas,
      inactivas: categoriasUi.length - activas,
      productos: categoriasUi.reduce((acc, categoria) => acc + categoria.productos, 0),
    };
  }, [categoriasUi]);

  const abrir = (categoria = null) => {
    if (!categoria) {
      setForm({ ...EMPTY_FORM, orden: categorias.length + 1 });
      setImageFile(null);
      setImagePreview('');
      setRemoveImage(false);
      setModal('nuevo');
      return;
    }

    setForm({
      nombre: categoria.nombre,
      icono: categoria.icono || '🍕',
      color: categoria.color || '#f97316',
      orden: Number(categoria.orden) || 0,
      activo: Number(categoria.activo) === 1 ? 1 : 0,
      imagen: categoria.imagen || '',
      subcategorias: categoria.subcategorias || [],
      turno_id: categoria.turno_id || '',
    });
    setImageFile(null);
    setImagePreview(categoria.imagen || '');
    setRemoveImage(false);
    setModal(categoria);
  };

  const cerrarModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(false);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.error('Nombre requerido');
      return;
    }

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('nombre', form.nombre);
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
        toast.success('Categoria creada');
      } else {
        await api.put(`/categorias/${modal.id}`, payload);
        toast.success('Categoria actualizada');
      }
      cerrarModal();
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (categoria) => {
    setDeleteDialog(categoria);
  };

  const confirmarEliminar = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/categorias/${deleteDialog.id}`);
      toast.success('Categoria eliminada');
      setDeleteDialog(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error al eliminar');
    }
  };

  const toggleActivo = async (categoria) => {
    try {
      await api.put(`/categorias/${categoria.id}`, {
        nombre: categoria.nombre,
        icono: categoria.icono,
        color: categoria.color,
        orden: categoria.orden,
        activo: Number(categoria.activo) === 1 ? 0 : 1,
      });
      toast.success(
        Number(categoria.activo) === 1 ? 'Categoria desactivada' : 'Categoria activada'
      );
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error al cambiar estado');
    }
  };

  const productosDetalle = useMemo(() => {
    if (!detalle) return [];
    return productos
      .filter((producto) => (producto.categoria_id ?? producto.categoriaId) === detalle.id)
      .slice(0, 5);
  }, [detalle, productos]);

  const handleImageChange = (file) => {
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(true);
    setForm((prev) => ({ ...prev, imagen: '' }));
  };

  const updateSubcategoria = (index, value) => {
    setForm((prev) => ({
      ...prev,
      subcategorias: prev.subcategorias.map((sub, currentIndex) =>
        currentIndex === index ? { ...sub, nombre: value } : sub
      ),
    }));
  };

  const addSubcategoria = () => {
    setForm((prev) => ({
      ...prev,
      subcategorias: [...(prev.subcategorias || []), { nombre: '' }],
    }));
  };

  const removeSubcategoria = (index) => {
    setForm((prev) => ({
      ...prev,
      subcategorias: prev.subcategorias.filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  return (
    <div className="mx-auto max-w-7xl animate-fade-in space-y-6 px-4 pb-8 pt-6 sm:px-6 lg:px-8">
      <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
        <PageHeader
          title="Categorías"
          description="Organizá la carta manteniendo el foco en orden, estado y relación con productos."
          breadcrumbs={[{ label: 'Catálogo' }, { label: 'Categorías' }]}
          actions={
            <>
              <button
                type="button"
                onClick={cargar}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                Recargar
              </button>

              <div className="inline-flex rounded-2xl border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`inline-flex h-9 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold transition ${viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
                >
                  <LayoutGrid size={14} />
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`inline-flex h-9 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold transition ${viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-700'}`}
                >
                  <List size={14} />
                  Lista
                </button>
              </div>

              <button
                type="button"
                onClick={() => abrir()}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary-500 px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(93,135,255,0.26)] transition hover:-translate-y-0.5 hover:bg-[#4a74ef]"
              >
                <Plus size={15} />
                Nueva categoria
              </button>
            </>
          }
        />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total" value={stats.total} icon={Layers3} tone="#5D87FF" />
        <StatCard label="Activas" value={stats.activas} icon={CheckCircle2} tone="#13DEB9" />
        <StatCard label="Inactivas" value={stats.inactivas} icon={CircleOff} tone="#7C8FAC" />
        <StatCard label="Productos" value={stats.productos} icon={Package} tone="#49BEFF" />
      </section>

      <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              placeholder="Buscar categoria..."
              className={`${CONTROL} w-full pl-11`}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={estadoFiltro}
              onChange={(event) => setEstadoFiltro(event.target.value)}
              className={`${CONTROL} min-w-[150px]`}
            >
              <option value="todas">Todas</option>
              <option value="activas">Activas</option>
              <option value="inactivas">Inactivas</option>
            </select>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className={`${CONTROL} min-w-[160px]`}
            >
              <option value="orden">Orden</option>
              <option value="nombre">Nombre</option>
              <option value="productos">Productos</option>
              <option value="estado">Estado</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-600">
            {filtered.length} visibles
          </span>
          <span className="rounded-full bg-primary-50 px-3 py-1.5 font-semibold text-primary-500">
            {viewMode === 'grid' ? 'Vista tarjetas' : 'Vista tabla'}
          </span>
        </div>

        <div className="mt-5">
          {loading ? (
            <div
              className={`grid gap-4 ${viewMode === 'grid' ? 'md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}
            >
              {Array.from({ length: viewMode === 'grid' ? 6 : 3 }).map((_, index) => (
                <div key={index} className="h-48 animate-pulse rounded-[24px] bg-slate-100" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-gray-200 bg-slate-50 px-6 py-16 text-center">
              <h3 className="text-lg font-black tracking-tight text-gray-900">No hay resultados</h3>
              <p className="mt-2 text-sm text-gray-500">
                Proba otro filtro o crea una categoria nueva.
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((categoria) => (
                <CategoryCard
                  key={categoria.id}
                  categoria={categoria}
                  onView={setDetalle}
                  onEdit={abrir}
                  onToggle={toggleActivo}
                  onDelete={eliminar}
                  turnoLabel={turnoLabel}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[24px] border border-gray-100 shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead className="bg-slate-50">
                    <tr className="text-left">
                      <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Categoría
                      </th>
                      <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Orden
                      </th>
                      <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Productos
                      </th>
                      <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Estado
                      </th>
                      <th className="px-5 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Color
                      </th>
                      <th className="px-5 py-4 text-right text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((categoria) => (
                      <CategoryRow
                        key={categoria.id}
                        categoria={categoria}
                        onView={setDetalle}
                        onEdit={abrir}
                        onToggle={toggleActivo}
                        onDelete={eliminar}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          onClick={cerrarModal}
        >
          <div
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.26)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
                  {modal === 'nuevo' ? 'Nueva categoría' : 'Editar categoría'}
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-gray-950">
                  {modal === 'nuevo' ? 'Crear categoría' : 'Ajustar categoría'}
                </h2>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 text-gray-500 transition hover:bg-gray-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid gap-0 lg:grid-cols-[1fr_0.9fr]">
                <div className="space-y-4 p-5">
                  <input
                    value={form.nombre}
                    onChange={(event) => setForm({ ...form, nombre: event.target.value })}
                    placeholder="Nombre de la categoría"
                    className={`${CONTROL} w-full`}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="number"
                      value={form.orden}
                      onChange={(event) => setForm({ ...form, orden: Number(event.target.value) })}
                      placeholder="Orden"
                      className={`${CONTROL} w-full`}
                    />
                    <select
                      value={String(form.activo)}
                      onChange={(event) => setForm({ ...form, activo: Number(event.target.value) })}
                      className={`${CONTROL} w-full`}
                    >
                      <option value="1">Activa</option>
                      <option value="0">Inactiva</option>
                    </select>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                      Visible en la web pública
                    </p>
                    <select
                      value={form.turno_id || ''}
                      onChange={(event) => setForm({ ...form, turno_id: event.target.value })}
                      className={`${CONTROL} w-full`}
                    >
                      <option value="">Siempre (mañana y noche)</option>
                      {turnos.map((turno) => (
                        <option key={turno.id} value={turno.id}>
                          Solo en {turno.nombre || turno.id}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-gray-400">
                      Si elegís un turno, esta categoría se muestra sola y automáticamente durante
                      ese horario y se oculta en el resto (según los turnos de Configuración).
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                      Icono
                    </p>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
                      {ICONOS.map((icono) => (
                        <button
                          key={icono}
                          type="button"
                          onClick={() => setForm({ ...form, icono })}
                          className={`flex h-12 items-center justify-center rounded-2xl border text-2xl transition ${
                            form.icono === icono
                              ? 'border-indigo-200 bg-primary-50'
                              : 'border-gray-200 bg-gray-50 hover:bg-white'
                          }`}
                        >
                          {icono}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                      Color
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {COLORES.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setForm({ ...form, color })}
                          className={`h-10 w-10 rounded-2xl border-2 transition ${form.color === color ? 'scale-110 border-gray-950' : 'border-white'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <section className="rounded-[24px] border border-gray-200 bg-gray-50/70 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                          Imagen
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Usala para que la categoría tenga una identidad real dentro del panel.
                        </p>
                      </div>
                      {imagePreview && (
                        <button
                          type="button"
                          onClick={clearImage}
                          className="inline-flex h-9 items-center justify-center rounded-2xl border border-rose-200 px-3 text-xs font-bold text-danger-600 transition hover:bg-danger-50"
                        >
                          Quitar
                        </button>
                      )}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-[132px_1fr]">
                      <div className="flex h-32 items-center justify-center overflow-hidden rounded-[22px] border border-white bg-white shadow-sm">
                        {imagePreview ? (
                          <img
                            src={imagePreview}
                            alt="preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="text-center">
                            <div
                              className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
                              style={{ backgroundColor: rgba(form.color, 0.14), color: form.color }}
                            >
                              <ImagePlus size={20} />
                            </div>
                            <p className="mt-2 text-xs font-semibold text-gray-500">Sin imagen</p>
                          </div>
                        )}
                      </div>

                      <label className="flex min-h-[128px] cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-gray-300 bg-white px-5 text-center transition hover:border-indigo-200 hover:bg-indigo-50/60">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
                          <ImagePlus size={20} />
                        </div>
                        <span className="mt-3 text-sm font-bold text-gray-800">
                          {imagePreview ? 'Reemplazar imagen' : 'Subir imagen real'}
                        </span>
                        <span className="mt-1 max-w-[240px] text-xs leading-5 text-gray-500">
                          JPG o PNG. Se mostrará en tarjetas, detalle y vistas futuras del admin.
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => handleImageChange(event.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[24px] border border-gray-200 bg-gray-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                          Subcategorías
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Una capa extra de orden para cuando armemos mejor la carta y los filtros.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addSubcategoria}
                        className="inline-flex h-10 items-center rounded-2xl bg-primary-500 px-4 text-xs font-bold text-white transition hover:bg-primary-600"
                      >
                        <Plus size={14} className="mr-1.5" />
                        Agregar
                      </button>
                    </div>

                    <div className="mt-4 space-y-2.5">
                      {(form.subcategorias || []).length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-gray-200 bg-white px-4 py-5 text-sm text-gray-400">
                          Todavía no agregaste subcategorías.
                        </div>
                      ) : (
                        form.subcategorias.map((sub, index) => (
                          <div
                            key={`sub-${index}`}
                            className="flex items-center gap-2 rounded-[20px] border border-white bg-white p-2 shadow-sm"
                          >
                            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gray-100 text-xs font-black text-gray-500">
                              {index + 1}
                            </div>
                            <input
                              value={sub.nombre}
                              onChange={(event) => updateSubcategoria(index, event.target.value)}
                              placeholder={`Subcategoría ${index + 1}`}
                              className={`${CONTROL} h-10 w-full border-0 bg-gray-50 px-3 focus:bg-white`}
                            />
                            <button
                              type="button"
                              onClick={() => removeSubcategoria(index)}
                              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 text-danger-600 transition hover:bg-danger-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {(form.subcategorias || []).some((sub) => sub?.nombre?.trim()) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {form.subcategorias
                          .filter((sub) => sub?.nombre?.trim())
                          .map((sub, index) => (
                            <span
                              key={`chip-${index}`}
                              className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-500"
                            >
                              {sub.nombre}
                            </span>
                          ))}
                      </div>
                    )}
                  </section>
                </div>

                <div className="border-t border-gray-100 bg-gray-50/80 p-5 lg:border-l lg:border-t-0">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Preview
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Asi se va a ver la categoria en el panel.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-gray-500 shadow-sm">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: form.color }}
                      />
                      {stateText(form.activo)}
                    </div>
                  </div>

                  <div className="mt-3 rounded-[24px] border border-white bg-white shadow-sm">
                    <div
                      className="h-28 rounded-t-[24px] px-4 py-4"
                      style={{
                        background: `linear-gradient(135deg, ${rgba(form.color, 0.28)}, ${rgba(form.color, 0.06)})`,
                      }}
                    >
                      <div className="inline-flex rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500 backdrop-blur">
                        {codeFor(modal?.id, categorias.length)}
                      </div>
                    </div>
                    <div className="-mt-8 px-4 pb-4">
                      <div
                        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] border border-white text-3xl shadow-sm"
                        style={{ backgroundColor: rgba(form.color, 0.14) }}
                      >
                        {imagePreview ? (
                          <img
                            src={imagePreview}
                            alt="preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          form.icono
                        )}
                      </div>
                      <h3 className="mt-1 text-lg font-black tracking-tight text-gray-950">
                        {form.nombre || 'Nombre de categoria'}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {imagePreview
                          ? 'Con imagen personalizada cargada.'
                          : 'Con icono visual como respaldo.'}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                            Estado
                          </p>
                          <p className="mt-1 font-semibold text-gray-900">
                            {stateText(form.activo)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                            Orden
                          </p>
                          <p className="mt-1 font-semibold text-gray-900">{form.orden || 0}</p>
                        </div>
                      </div>

                      {(form.subcategorias || []).filter((sub) => sub?.nombre?.trim()).length >
                        0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {form.subcategorias
                            .filter((sub) => sub?.nombre?.trim())
                            .slice(0, 4)
                            .map((sub, index) => (
                              <span
                                key={`preview-sub-${index}`}
                                className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600"
                              >
                                {sub.nombre}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-gray-100 bg-white px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cerrarModal}
                className="h-11 rounded-2xl border border-gray-200 px-5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={saving}
                className="h-11 rounded-2xl bg-primary-500 px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(93,135,255,0.26)] transition hover:-translate-y-0.5 hover:bg-[#4a74ef] disabled:opacity-60"
              >
                {saving
                  ? 'Guardando...'
                  : modal === 'nuevo'
                    ? 'Crear categoria'
                    : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detalle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          onClick={() => setDetalle(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.26)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="h-28"
              style={{
                background: `linear-gradient(135deg, ${rgba(detalle.color, 0.28)}, ${rgba(detalle.color, 0.06)})`,
              }}
            />
            <div className="-mt-8 px-5 pb-5">
              <div className="flex items-start justify-between gap-3">
                <div
                  className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] border border-white text-3xl shadow-sm"
                  style={{ backgroundColor: rgba(detalle.color, 0.14) }}
                >
                  {detalle.imagen ? (
                    <img
                      src={detalle.imagen}
                      alt={detalle.nombre}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    detalle.icono
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setDetalle(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50"
                >
                  <X size={16} />
                </button>
              </div>

              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
                {detalle.codigo}
              </p>
              <h3 className="mt-1 text-2xl font-black tracking-tight text-gray-950">
                {detalle.nombre}
              </h3>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                    Estado
                  </p>
                  <p className="mt-1 font-semibold text-gray-900">{stateText(detalle.activo)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                    Productos
                  </p>
                  <p className="mt-1 font-semibold text-primary-500">{detalle.productos}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                    Color
                  </p>
                  <div className="mt-1 flex items-center gap-2 font-semibold text-gray-900">
                    <span
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: detalle.color }}
                    />
                    {detalle.color}
                  </div>
                </div>
              </div>

              {detalle.subcategorias?.length > 0 && (
                <div className="mt-4 rounded-[24px] border border-gray-200 bg-gray-50/80 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                    Subcategorias
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detalle.subcategorias.map((sub, index) => (
                      <span
                        key={`detalle-sub-${index}`}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm"
                      >
                        {sub.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 rounded-[24px] border border-gray-200 bg-gray-50/80 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                  Productos vinculados
                </p>
                <div className="mt-3 space-y-2">
                  {productosDetalle.length > 0 ? (
                    productosDetalle.map((producto) => (
                      <div
                        key={producto.id}
                        className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm"
                      >
                        <div>
                          <p className="font-semibold text-gray-900">{producto.nombre}</p>
                          <p className="text-xs text-gray-400 capitalize">
                            {producto.estado || 'activo'}
                          </p>
                        </div>
                        <p className="font-bold text-gray-900">
                          ${Number(producto.precio || 0).toLocaleString('es-AR')}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
                      Esta categoria todavia no tiene productos.
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDetalle(null)}
                  className="h-11 rounded-2xl border border-gray-200 px-5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const current = detalle;
                    setDetalle(null);
                    abrir(current);
                  }}
                  className="h-11 rounded-2xl bg-primary-500 px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(93,135,255,0.26)] transition hover:-translate-y-0.5 hover:bg-[#4a74ef]"
                >
                  Editar categoria
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ActionDialog
        open={Boolean(deleteDialog)}
        title={deleteDialog ? `Eliminar ${deleteDialog.nombre}` : ''}
        description="La categoría se eliminará y sus productos quedarán sin categoría asignada."
        confirmLabel="Eliminar categoría"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={confirmarEliminar}
        onClose={() => setDeleteDialog(null)}
      />
    </div>
  );
}
