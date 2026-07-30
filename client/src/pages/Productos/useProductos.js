import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';
import {
  EMPTY_FORM,
  codeFor,
  parseJsonList,
  normalizeText,
  normalizeVariantGroups,
  normalizeExtras,
  ensureStructuredPricingGroups,
  normalizeStructuredPricingState,
  getPricingOptionTotals,
  getStructuredPricingConfig,
  updateStructuredPricing,
  getVariantTemplate,
} from './utils';

export default function useProductos() {
  const fileInputRef = useRef(null);
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [sortBy, setSortBy] = useState('nombre');
  const [viewMode, setViewMode] = useState('grid');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [variantesEditor, setVariantesEditor] = useState([]);
  const [extrasEditor, setExtrasEditor] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [categoryDialog, setCategoryDialog] = useState(null);

  const cargar = async () => {
    setLoading(true);
    try {
      const [prods, cats] = await Promise.all([api.get('/productos'), api.get('/categorias')]);
      setProductos(prods);
      setCategorias(cats);
    } catch (error) {
      toast.error(error?.error || 'Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const categoriasMap = useMemo(() => {
    return new Map(categorias.map((categoria) => [categoria.id, categoria]));
  }, [categorias]);

  const productosUi = useMemo(() => {
    return productos.map((producto, index) => {
      const categoriaInfo = categoriasMap.get(producto.categoria_id);
      return {
        ...producto,
        codigo: codeFor(producto.id, index),
        categoriaInfo,
        variantGroups: parseJsonList(producto.variantes),
        extrasList: parseJsonList(producto.extras),
      };
    });
  }, [productos, categoriasMap]);

  const filtered = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    const list = productosUi.filter((producto) => {
      const matchesSearch =
        !term ||
        producto.nombre.toLowerCase().includes(term) ||
        producto.codigo.toLowerCase().includes(term) ||
        String(producto.descripcion || '')
          .toLowerCase()
          .includes(term) ||
        String(producto.categoriaInfo?.nombre || '')
          .toLowerCase()
          .includes(term);

      const matchesCategory =
        filtroCategoria === 'todas' || String(producto.categoria_id || '') === filtroCategoria;
      const matchesState =
        filtroEstado === 'todos' ||
        (filtroEstado === 'activos' && Number(producto.activo) === 1) ||
        (filtroEstado === 'inactivos' && Number(producto.activo) !== 1);

      return matchesSearch && matchesCategory && matchesState;
    });

    if (sortBy === 'precio')
      return [...list].sort((a, b) => Number(b.precio || 0) - Number(a.precio || 0));
    if (sortBy === 'stock')
      return [...list].sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));
    if (sortBy === 'categoria')
      return [...list].sort((a, b) =>
        String(a.categoriaInfo?.nombre || '').localeCompare(String(b.categoriaInfo?.nombre || ''))
      );
    return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [busqueda, filtroCategoria, filtroEstado, sortBy, productosUi]);

  const stats = useMemo(() => {
    const activos = productosUi.filter((producto) => Number(producto.activo) === 1).length;
    const destacados = productosUi.filter((producto) => Number(producto.destacado) === 1).length;
    const stockBajo = productosUi.filter((producto) => Number(producto.stock || 0) < 10).length;
    const inventario = productosUi.reduce(
      (acc, producto) => acc + Number(producto.costo || 0) * Number(producto.stock || 0),
      0
    );

    return {
      total: productosUi.length,
      activos,
      destacados,
      stockBajo,
      inventario,
    };
  }, [productosUi]);

  const selectedCategoryInfo = useMemo(() => {
    return categoriasMap.get(Number(form.categoria_id)) || null;
  }, [categoriasMap, form.categoria_id]);

  const structuredPricingConfig = useMemo(
    () => getStructuredPricingConfig(selectedCategoryInfo?.nombre),
    [selectedCategoryInfo]
  );

  const formPriceOptions = useMemo(
    () => getPricingOptionTotals(selectedCategoryInfo?.nombre, form.precio, variantesEditor),
    [selectedCategoryInfo, form.precio, variantesEditor]
  );

  const editingProduct = modal && modal !== 'nuevo' ? modal : null;
  const recipeManagedStock = editingProduct?.stock_mode === 'recipe';

  const abrirNuevo = () => {
    const defaultCategory = categorias[0] || null;
    setForm({
      ...EMPTY_FORM,
      categoria_id: defaultCategory?.id || '',
    });
    setVariantesEditor(
      ensureStructuredPricingGroups(
        defaultCategory?.nombre,
        getVariantTemplate(defaultCategory?.nombre)
      )
    );
    setExtrasEditor([]);
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(false);
    setModal('nuevo');
  };

  const abrirEditar = (producto) => {
    const normalizedPricing = normalizeStructuredPricingState(
      categoriasMap.get(producto.categoria_id)?.nombre,
      producto.precio,
      parseJsonList(producto.variantes)
    );

    setForm({
      nombre: producto.nombre || '',
      descripcion: producto.descripcion || '',
      precio: normalizedPricing.basePrice || '',
      precio_anterior: producto.precio_anterior || '',
      costo: producto.costo || '',
      categoria_id: producto.categoria_id || '',
      tiempo_preparacion: producto.tiempo_preparacion || 15,
      activo: Number(producto.activo) === 1 ? 1 : 0,
      destacado: Number(producto.destacado) === 1 ? 1 : 0,
      imagen: producto.imagen || '',
      stock: producto.stock_directo ?? producto.stock ?? 0,
    });
    setVariantesEditor(normalizedPricing.groups);
    setExtrasEditor(parseJsonList(producto.extras));
    setImageFile(null);
    setImagePreview(producto.imagen || '');
    setRemoveImage(false);
    setModal(producto);
  };

  const duplicarProducto = (producto) => {
    const normalizedPricing = normalizeStructuredPricingState(
      categoriasMap.get(producto.categoria_id)?.nombre,
      producto.precio,
      parseJsonList(producto.variantes)
    );
    setForm({
      nombre: `${producto.nombre || ''} (copia)`,
      descripcion: producto.descripcion || '',
      precio: normalizedPricing.basePrice || '',
      precio_anterior: producto.precio_anterior || '',
      costo: producto.costo || '',
      categoria_id: producto.categoria_id || '',
      tiempo_preparacion: producto.tiempo_preparacion || 15,
      activo: Number(producto.activo) === 1 ? 1 : 0,
      destacado: 0,
      imagen: '',
      stock: 0,
    });
    setVariantesEditor(normalizedPricing.groups);
    setExtrasEditor(parseJsonList(producto.extras));
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(false);
    setModal('nuevo');
    toast('Revisá y guardá la copia', { icon: '📋' });
  };

  const cerrarModal = () => {
    setModal(null);
    setForm(EMPTY_FORM);
    setVariantesEditor([]);
    setExtrasEditor([]);
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(false);
  };

  const changeCategory = (nextId) => {
    const nextCategory = categoriasMap.get(Number(nextId));
    const hasCustomVariants = normalizeVariantGroups(variantesEditor).length > 0;

    if (hasCustomVariants) {
      setCategoryDialog({
        nextId,
        nextCategory,
      });
      return;
    }

    setForm((prev) => ({ ...prev, categoria_id: nextId }));
    setVariantesEditor(
      ensureStructuredPricingGroups(nextCategory?.nombre, getVariantTemplate(nextCategory?.nombre))
    );
  };

  const handleImageChange = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona una imagen valida');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen supera 5MB');
      return;
    }

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

  const applySuggestedTemplate = () => {
    if (!selectedCategoryInfo?.nombre) {
      toast.error('Selecciona una categoría antes de usar la plantilla');
      return;
    }

    setVariantesEditor(
      ensureStructuredPricingGroups(
        selectedCategoryInfo.nombre,
        getVariantTemplate(selectedCategoryInfo.nombre)
      )
    );

    const categoryName = normalizeText(selectedCategoryInfo.nombre);
    if (categoryName.includes('milanesa')) {
      toast.success('Plantilla aplicada: Tipo con Pollo y Ternera');
      return;
    }
    if (categoryName.includes('pizza')) {
      toast.success('Plantilla aplicada: Presentacion Mitad y Entera');
      return;
    }
    if (categoryName.includes('empanada')) {
      toast.success('Plantilla aplicada: Presentacion Media docena y Docena');
      return;
    }

    toast.success('Plantilla aplicada');
  };

  const addVariantGroup = () => {
    setVariantesEditor((prev) => [
      ...prev,
      { nombre: '', opciones: [{ nombre: '', precio_extra: 0 }] },
    ]);
  };

  const updateVariantGroup = (groupIndex, value) => {
    setVariantesEditor((prev) =>
      prev.map((group, index) => (index === groupIndex ? { ...group, nombre: value } : group))
    );
  };

  const removeVariantGroup = (groupIndex) => {
    setVariantesEditor((prev) => prev.filter((_, index) => index !== groupIndex));
  };

  const addVariantOption = (groupIndex) => {
    setVariantesEditor((prev) =>
      prev.map((group, index) =>
        index === groupIndex
          ? { ...group, opciones: [...(group.opciones || []), { nombre: '', precio_extra: 0 }] }
          : group
      )
    );
  };

  const updateVariantOption = (groupIndex, optionIndex, field, value) => {
    setVariantesEditor((prev) =>
      prev.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              opciones: group.opciones.map((option, currentOptionIndex) =>
                currentOptionIndex === optionIndex
                  ? { ...option, [field]: field === 'precio_extra' ? Number(value || 0) : value }
                  : option
              ),
            }
          : group
      )
    );
  };

  const removeVariantOption = (groupIndex, optionIndex) => {
    setVariantesEditor((prev) =>
      prev.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              opciones: group.opciones.filter(
                (_, currentOptionIndex) => currentOptionIndex !== optionIndex
              ),
            }
          : group
      )
    );
  };

  const addExtra = () => {
    setExtrasEditor((prev) => [...prev, { nombre: '', precio: 0 }]);
  };

  const updateExtra = (index, field, value) => {
    setExtrasEditor((prev) =>
      prev.map((extra, currentIndex) =>
        currentIndex === index
          ? { ...extra, [field]: field === 'precio' ? Number(value || 0) : value }
          : extra
      )
    );
  };

  const removeExtra = (index) => {
    setExtrasEditor((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const validateForm = () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return false;
    }

    if (!form.categoria_id) {
      toast.error('Selecciona una categoría');
      return false;
    }

    if (!form.precio || Number(form.precio) <= 0) {
      toast.error('El precio debe ser mayor a 0');
      return false;
    }

    if (Number(form.costo || 0) < 0 || Number(form.tiempo_preparacion || 0) < 0) {
      toast.error('Costo y tiempo deben ser validos');
      return false;
    }

    if (!recipeManagedStock && Number(form.stock || 0) < 0) {
      toast.error('El stock no puede ser negativo');
      return false;
    }

    const groups = normalizeVariantGroups(variantesEditor);
    const extras = normalizeExtras(extrasEditor);

    if ((variantesEditor || []).length > 0 && groups.length === 0) {
      toast.error('Completa al menos una variante valida o elimina los grupos vacios');
      return false;
    }

    if ((extrasEditor || []).length > 0 && extras.length === 0) {
      toast.error('Completa al menos un extra valido o elimina las filas vacias');
      return false;
    }

    if (extras.some((extra) => Number(extra.precio || 0) < 0)) {
      toast.error('Los extras no pueden tener precios negativos');
      return false;
    }

    return true;
  };

  const guardar = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('nombre', form.nombre);
      payload.append('descripcion', form.descripcion || '');
      payload.append('precio', String(form.precio));
      payload.append('costo', String(form.costo || 0));
      payload.append('precio_anterior', String(form.precio_anterior || ''));
      payload.append('categoria_id', String(form.categoria_id || ''));
      payload.append('tiempo_preparacion', String(form.tiempo_preparacion || 15));
      payload.append('activo', String(form.activo));
      payload.append('destacado', String(form.destacado));
      payload.append('variantes', JSON.stringify(normalizeVariantGroups(variantesEditor)));
      payload.append('extras', JSON.stringify(normalizeExtras(extrasEditor)));
      if (!recipeManagedStock) payload.append('stock', String(form.stock || 0));
      if (imageFile) payload.append('imagen', imageFile);
      if (removeImage) payload.append('remove_imagen', '1');

      if (modal === 'nuevo') {
        await api.post('/productos', payload);
        toast.success('Producto creado');
      } else {
        await api.put(`/productos/${modal.id}`, payload);
        toast.success('Producto actualizado');
      }

      cerrarModal();
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = (producto) => {
    setDeleteDialog(producto);
  };

  const confirmarCambioCategoria = () => {
    if (!categoryDialog) return;
    setForm((prev) => ({ ...prev, categoria_id: categoryDialog.nextId }));
    setVariantesEditor(
      ensureStructuredPricingGroups(
        categoryDialog.nextCategory?.nombre,
        getVariantTemplate(categoryDialog.nextCategory?.nombre)
      )
    );
    setCategoryDialog(null);
  };

  const confirmarEliminar = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/productos/${deleteDialog.id}`);
      toast.success('Producto eliminado');
      if (detalle?.id === deleteDialog.id) setDetalle(null);
      setDeleteDialog(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error al eliminar');
    }
  };

  const toggleActivo = async (producto) => {
    try {
      const payload = new FormData();
      payload.append('nombre', producto.nombre);
      payload.append('descripcion', producto.descripcion || '');
      payload.append('precio', String(producto.precio || 0));
      payload.append('costo', String(producto.costo || 0));
      payload.append('categoria_id', String(producto.categoria_id || ''));
      payload.append('tiempo_preparacion', String(producto.tiempo_preparacion || 15));
      payload.append('activo', String(Number(producto.activo) === 1 ? 0 : 1));
      payload.append('destacado', String(producto.destacado || 0));
      payload.append('variantes', producto.variantes || '[]');
      payload.append('extras', producto.extras || '[]');

      await api.put(`/productos/${producto.id}`, payload);
      toast.success(Number(producto.activo) === 1 ? 'Producto desactivado' : 'Producto activado');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error al cambiar estado');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const isAllSelected = filtered.length > 0 && filtered.every((p) => selectedIds.includes(p.id));
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filtered.some((p) => p.id === id)));
    } else {
      const toAdd = filtered.map((p) => p.id).filter((id) => !selectedIds.includes(id));
      setSelectedIds((prev) => [...prev, ...toAdd]);
    }
  };

  const bulkSetActivo = async (value) => {
    if (!selectedIds.length) return;
    const targets = productosUi.filter((p) => selectedIds.includes(p.id));
    try {
      await Promise.all(
        targets.map((producto) => {
          const payload = new FormData();
          payload.append('nombre', producto.nombre);
          payload.append('descripcion', producto.descripcion || '');
          payload.append('precio', String(producto.precio || 0));
          payload.append('costo', String(producto.costo || 0));
          payload.append('categoria_id', String(producto.categoria_id || ''));
          payload.append('tiempo_preparacion', String(producto.tiempo_preparacion || 15));
          payload.append('activo', String(value));
          payload.append('destacado', String(producto.destacado || 0));
          payload.append('variantes', producto.variantes || '[]');
          payload.append('extras', producto.extras || '[]');
          return api.put(`/productos/${producto.id}`, payload);
        })
      );
      toast.success(
        `${targets.length} producto${targets.length !== 1 ? 's' : ''} ${value === 1 ? 'activados' : 'desactivados'}`
      );
      setSelectedIds([]);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'Error en la operación masiva');
    }
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleFormActivo = () => {
    setForm((prev) => ({ ...prev, activo: prev.activo === 1 ? 0 : 1 }));
  };

  const toggleFormDestacado = () => {
    setForm((prev) => ({ ...prev, destacado: prev.destacado === 1 ? 0 : 1 }));
  };

  const handleStructuredPriceChange = (optionName, nextFinalPrice) => {
    const next = updateStructuredPricing(
      selectedCategoryInfo?.nombre,
      variantesEditor,
      form.precio,
      optionName,
      nextFinalPrice
    );
    setForm((prev) => ({ ...prev, precio: next.basePrice }));
    setVariantesEditor(next.groups);
  };

  return {
    // State
    productos,
    categorias,
    busqueda,
    filtroCategoria,
    filtroEstado,
    sortBy,
    viewMode,
    loading,
    saving,
    modal,
    detalle,
    form,
    imageFile,
    imagePreview,
    removeImage,
    variantesEditor,
    extrasEditor,
    selectedIds,
    deleteDialog,
    categoryDialog,
    // Computed
    categoriasMap,
    productosUi,
    filtered,
    stats,
    selectedCategoryInfo,
    structuredPricingConfig,
    formPriceOptions,
    editingProduct,
    recipeManagedStock,
    isAllSelected,
    // Refs
    fileInputRef,
    // Setters
    setBusqueda,
    setFiltroCategoria,
    setFiltroEstado,
    setSortBy,
    setViewMode,
    setDetalle,
    setSelectedIds,
    setDeleteDialog,
    setCategoryDialog,
    // Actions
    cargar,
    abrirNuevo,
    abrirEditar,
    duplicarProducto,
    cerrarModal,
    changeCategory,
    handleImageChange,
    clearImage,
    applySuggestedTemplate,
    addVariantGroup,
    updateVariantGroup,
    removeVariantGroup,
    addVariantOption,
    updateVariantOption,
    removeVariantOption,
    addExtra,
    updateExtra,
    removeExtra,
    guardar,
    eliminar,
    confirmarCambioCategoria,
    confirmarEliminar,
    toggleActivo,
    toggleSelect,
    toggleSelectAll,
    bulkSetActivo,
    handleFormChange,
    toggleFormActivo,
    toggleFormDestacado,
    handleStructuredPriceChange,
  };
}
