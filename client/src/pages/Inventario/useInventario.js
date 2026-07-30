import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';
import { EMPTY_INSUMO, EMPTY_ROW, MOVIMIENTOS_LIMIT } from './constants.js';
import { normalizeText } from './utils.js';

export default function useInventario() {
  const [insumos, setInsumos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [busqueda, setBusqueda] = useState('');

  // Modales
  const [insumoModal, setInsumoModal] = useState(null);
  const [insumoForm, setInsumoForm] = useState(EMPTY_INSUMO);
  const [movementModal, setMovementModal] = useState(null);
  const [movementForm, setMovementForm] = useState({ tipo: 'entrada', cantidad: '', motivo: '' });
  const [compraModal, setCompraModal] = useState(false);
  const [compraForm, setCompraForm] = useState({
    proveedor: '',
    metodo_pago: 'efectivo',
    items: [],
  });
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [movFechaDesde, setMovFechaDesde] = useState('');
  const [movFechaHasta, setMovFechaHasta] = useState('');

  // Recetas
  const [productConfig, setProductConfig] = useState({ stock_mode: 'direct', stock_directo: 0 });
  const [recipeRows, setRecipeRows] = useState([]);

  const cargar = async () => {
    setLoading(true);
    try {
      const [insumosData, productosData, movimientosData] = await Promise.all([
        api.get('/inventario/insumos'),
        api.get('/inventario/productos'),
        api.get(`/inventario/movimientos?limit=${MOVIMIENTOS_LIMIT}`),
      ]);
      setInsumos(insumosData);
      setProductos(productosData);
      setMovimientos(movimientosData);
      if (!selectedProductId && productosData[0]) setSelectedProductId(String(productosData[0].id));
    } catch (error) {
      toast.error('Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const selectedProduct = useMemo(
    () => productos.find((product) => String(product.id) === String(selectedProductId)) || null,
    [productos, selectedProductId]
  );

  useEffect(() => {
    if (!selectedProduct) return;
    setProductConfig({
      stock_mode: selectedProduct.stock_mode || 'direct',
      stock_directo: selectedProduct.stock_directo || 0,
    });
    setRecipeRows(
      (selectedProduct.receta_resumen || []).map((row) => ({
        insumo_id: row.insumo_id,
        cantidad: row.cantidad,
        condicion_tipo: row.condicion_tipo || 'siempre',
        condicion_grupo: row.condicion_grupo || '',
        condicion_valor: row.condicion_valor || '',
      }))
    );
  }, [selectedProduct]);

  const stats = useMemo(
    () => ({
      total: insumos.length,
      bajos: insumos.filter((item) => item.stock_bajo).length,
      receta: productos.filter((item) => item.stock_mode === 'recipe').length,
      frenados: productos.filter((item) => !item.disponible_para_venta).length,
    }),
    [insumos, productos]
  );

  const filteredInsumos = useMemo(() => {
    const term = normalizeText(busqueda);
    return insumos.filter(
      (item) =>
        normalizeText(item.nombre).includes(term) || normalizeText(item.rubro).includes(term)
    );
  }, [insumos, busqueda]);

  const movFiltrados = useMemo(() => {
    let result = movimientos;
    if (movFechaDesde) {
      const desde = new Date(movFechaDesde + 'T00:00:00');
      result = result.filter((m) => new Date(m.creado_en) >= desde);
    }
    if (movFechaHasta) {
      const hasta = new Date(movFechaHasta + 'T23:59:59');
      result = result.filter((m) => new Date(m.creado_en) <= hasta);
    }
    return result;
  }, [movimientos, movFechaDesde, movFechaHasta]);

  const faltantes = useMemo(
    () =>
      insumos
        .map((item) => ({
          ...item,
          faltante: Math.max(0, Number(item.stock_minimo || 0) - Number(item.stock_actual || 0)),
        }))
        .filter((item) => item.faltante > 0)
        .sort((a, b) => b.faltante - a.faltante),
    [insumos]
  );

  const sharedBases = useMemo(() => {
    const counters = new Map();
    productos.forEach((product) => {
      (product.receta_resumen || []).forEach((row) => {
        if (!row?.insumo_id) return;
        counters.set(row.insumo_id, (counters.get(row.insumo_id) || 0) + 1);
      });
    });
    return insumos
      .filter((item) => counters.has(item.id))
      .map((item) => ({
        ...item,
        dependencias: counters.get(item.id) || 0,
      }))
      .sort(
        (a, b) =>
          b.dependencias - a.dependencias || String(a.nombre).localeCompare(String(b.nombre), 'es')
      );
  }, [insumos, productos]);

  // Handlers para Insumos
  const openNewInsumo = () => {
    setInsumoModal('new');
    setInsumoForm(EMPTY_INSUMO);
  };
  const openEditInsumo = (insumo) => {
    setInsumoModal(insumo);
    setInsumoForm({ ...EMPTY_INSUMO, ...insumo });
  };
  const closeInsumoModal = () => {
    setInsumoModal(null);
    setInsumoForm(EMPTY_INSUMO);
  };

  const saveInsumo = async () => {
    setSaving(true);
    try {
      if (insumoModal === 'new') await api.post('/inventario/insumos', insumoForm);
      else await api.put(`/inventario/insumos/${insumoModal.id}`, insumoForm);
      toast.success('Insumo guardado');
      closeInsumoModal();
      await cargar();
    } catch (error) {
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteInsumo = (insumo) => {
    setDeleteDialog(insumo);
  };
  const closeDeleteDialog = () => {
    setDeleteDialog(null);
  };
  const confirmDeleteInsumo = async () => {
    if (!deleteDialog) return;
    setSaving(true);
    try {
      await api.delete(`/inventario/insumos/${deleteDialog.id}`);
      toast.success('Insumo eliminado');
      setDeleteDialog(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo eliminar el insumo');
    } finally {
      setSaving(false);
    }
  };

  // Handlers para Compras
  const openCompraModal = () => {
    setCompraForm({
      proveedor: '',
      metodo_pago: 'efectivo',
      items: [{ insumo_id: '', cantidad: '', costo_unitario: '' }],
    });
    setCompraModal(true);
  };

  const addCompraItem = () => {
    setCompraForm((p) => ({
      ...p,
      items: [...p.items, { insumo_id: '', cantidad: '', costo_unitario: '' }],
    }));
  };

  const updateCompraItem = (idx, key, val) => {
    const next = [...compraForm.items];
    next[idx][key] = val;
    if (key === 'insumo_id') {
      const insumo = insumos.find((i) => String(i.id) === String(val));
      if (insumo) next[idx].costo_unitario = insumo.costo_unitario || '';
    }
    setCompraForm((p) => ({ ...p, items: next }));
  };

  const registrarCompra = async () => {
    if (!compraForm.items.some((i) => i.insumo_id && i.cantidad))
      return toast.error('Completa los datos de la compra');
    setSaving(true);
    try {
      const total = compraForm.items.reduce(
        (acc, i) => acc + Number(i.cantidad || 0) * Number(i.costo_unitario || 0),
        0
      );
      await api.post('/compras', { ...compraForm, total });
      toast.success('Compra registrada y stock actualizado');
      setCompraModal(false);
      await cargar();
    } catch (error) {
      toast.error('Error al registrar compra');
    } finally {
      setSaving(false);
    }
  };

  // Handlers para Recetas
  const saveRecipe = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      await api.put(`/inventario/productos/${selectedProduct.id}/receta`, { recipes: recipeRows });
      toast.success('Receta guardada');
      await cargar();
    } catch (error) {
      toast.error('No se pudo guardar la receta');
    } finally {
      setSaving(false);
    }
  };

  const saveProductConfig = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      await api.put(`/inventario/productos/${selectedProduct.id}/config`, productConfig);
      toast.success('Modo de stock actualizado');
      await cargar();
    } catch (error) {
      toast.error('Error al guardar config');
    } finally {
      setSaving(false);
    }
  };

  const syncPizzasWithPrepizza = async () => {
    setSaving(true);
    try {
      const response = await api.post('/inventario/productos/sync/pizzas-prepizza');
      toast.success(`Pizzas sincronizadas con ${response?.insumo?.nombre || 'Prepizza'}`);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo sincronizar el stock de pizzas');
    } finally {
      setSaving(false);
    }
  };

  const syncEmpanadasWithStock = async () => {
    setSaving(true);
    try {
      await api.post('/inventario/productos/sync/empanadas-insumos');
      toast.success('Empanadas sincronizadas con sus insumos');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudieron sincronizar las empanadas');
    } finally {
      setSaving(false);
    }
  };

  const syncMilanesasWithStock = async () => {
    setSaving(true);
    try {
      await api.post('/inventario/productos/sync/milanesas-base');
      toast.success('Milanesas sincronizadas con carne y pollo');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudieron sincronizar las milanesas');
    } finally {
      setSaving(false);
    }
  };

  const syncHamburguesasWithStock = async () => {
    setSaving(true);
    try {
      await api.post('/inventario/productos/sync/hamburguesas-base');
      toast.success('Hamburguesas sincronizadas con pan y medallones');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudieron sincronizar las hamburguesas');
    } finally {
      setSaving(false);
    }
  };

  const syncPapasWithStock = async () => {
    setSaving(true);
    try {
      await api.post('/inventario/productos/sync/papas-full-cheddar');
      toast.success('Papas Full Cheddar sincronizadas con sus insumos');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudieron sincronizar las papas');
    } finally {
      setSaving(false);
    }
  };

  const copyShoppingList = async () => {
    const msg = faltantes.map((i) => `- ${i.nombre}: falta ${i.faltante} ${i.unidad}`).join('\n');
    if (!msg) return toast.error('No hay faltantes');
    navigator.clipboard
      .writeText(`Lista de Compras:\n${msg}`)
      .then(() => toast.success('Copiado al portapapeles'));
  };

  const exportarInsumosCSV = () => {
    if (!filteredInsumos.length) return toast.error('No hay insumos para exportar');
    const headers = [
      'ID',
      'Nombre',
      'Rubro',
      'Unidad',
      'Stock actual',
      'Stock mínimo',
      'Costo unitario',
      'Stock bajo',
      'Activo',
    ];
    const rows = filteredInsumos.map((i) => [
      i.id,
      `"${i.nombre}"`,
      i.rubro,
      i.unidad,
      i.stock_actual,
      i.stock_minimo,
      i.costo_unitario,
      i.stock_bajo ? 'Sí' : 'No',
      i.activo ? 'Sí' : 'No',
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventario_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  const exportarHistorialMovimientosCSV = () => {
    if (!movFiltrados.length) return toast.error('No hay movimientos para exportar');
    const headers = ['Fecha', 'Insumo/Producto', 'Tipo', 'Cantidad', 'Motivo'];
    const rows = movFiltrados.map((m) => [
      new Date(m.creado_en).toLocaleString('es-AR'),
      `"${m.insumo_nombre || m.producto_nombre || ''}"`,
      m.tipo || (Number(m.cantidad) > 0 ? 'entrada' : 'salida'),
      m.cantidad,
      `"${m.motivo || ''}"`,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movimientos_inventario_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  const printFaltantes = () => {
    if (!faltantes.length) {
      toast.error('No hay faltantes para imprimir');
      return;
    }
    const html = `
      <html>
        <head>
          <title>Faltantes de Inventario</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border-bottom: 1px solid #ddd; padding: 10px; text-align: left; }
            th { font-size: 12px; text-transform: uppercase; color: #666; }
          </style>
        </head>
        <body>
          <h1>Faltantes de inventario</h1>
          <p>Generado: ${new Date().toLocaleString('es-AR')}</p>
          <table>
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Faltante</th>
                <th>Stock actual</th>
                <th>Minimo</th>
              </tr>
            </thead>
            <tbody>
              ${faltantes
                .map(
                  (item) => `
                <tr>
                  <td>${item.nombre}</td>
                  <td>${item.faltante} ${item.unidad}</td>
                  <td>${item.stock_actual} ${item.unidad}</td>
                  <td>${item.stock_minimo} ${item.unidad}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      toast.error('El navegador bloqueo la impresion');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
  };

  const closeMovementModal = () => {
    setMovementModal(null);
    setMovementForm({ tipo: 'entrada', cantidad: '', motivo: '' });
  };

  const registrarMovimiento = async () => {
    if (!movementModal) return;
    if (!movementForm.cantidad) {
      toast.error('Ingresa una cantidad');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/inventario/insumos/${movementModal.id}/movimientos`, movementForm);
      toast.success('Movimiento registrado');
      closeMovementModal();
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo registrar el movimiento');
    } finally {
      setSaving(false);
    }
  };

  return {
    // Estado
    insumos,
    productos,
    movimientos,
    loading,
    saving,
    selectedProductId,
    busqueda,
    insumoModal,
    insumoForm,
    movementModal,
    movementForm,
    compraModal,
    compraForm,
    deleteDialog,
    movFechaDesde,
    movFechaHasta,
    productConfig,
    recipeRows,

    // Datos computados
    selectedProduct,
    stats,
    filteredInsumos,
    movFiltrados,
    faltantes,
    sharedBases,

    // Setters expuestos
    setBusqueda,
    setSelectedProductId,
    setMovFechaDesde,
    setMovFechaHasta,
    setProductConfig,
    setRecipeRows,
    setInsumoForm,
    setCompraForm,
    setCompraModal,
    setMovementForm,
    setMovementModal,

    // Handlers
    cargar,
    openNewInsumo,
    openEditInsumo,
    closeInsumoModal,
    saveInsumo,
    openDeleteInsumo,
    closeDeleteDialog,
    confirmDeleteInsumo,
    openCompraModal,
    addCompraItem,
    updateCompraItem,
    registrarCompra,
    saveRecipe,
    saveProductConfig,
    syncPizzasWithPrepizza,
    syncEmpanadasWithStock,
    syncMilanesasWithStock,
    syncHamburguesasWithStock,
    syncPapasWithStock,
    copyShoppingList,
    exportarInsumosCSV,
    exportarHistorialMovimientosCSV,
    printFaltantes,
    closeMovementModal,
    registrarMovimiento,
  };
}
