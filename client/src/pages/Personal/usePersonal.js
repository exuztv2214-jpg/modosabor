import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../lib/api.js';
import { formatAmountForInput, parseLocalizedAmount } from '../../lib/amountInput.js';
import { buildPublicAppUrl, getPublicAppUrlDiagnostics } from '../../lib/publicUrls.js';
import { useAppConfig } from '../../context/AppConfigContext.jsx';
import {
  EMPTY_FORM,
  EMPTY_MOVEMENT,
  EMPTY_SETTLEMENT,
  EMPTY_ATTENDANCE,
  EMPTY_GOAL,
  EMPTY_PRODUCT_CONSUMPTION,
  EMPTY_WEEKLY_EDITOR,
  hoyIso,
  isoAInputLocal,
  inputLocalAIso,
  fmt,
} from './constants.js';

export function usePersonal() {
  const { config: appConfig } = useAppConfig();
  const publicAppDiagnostics = useMemo(() => getPublicAppUrlDiagnostics(appConfig), [appConfig]);

  const [personal, setPersonal] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [attendanceAnalytics, setAttendanceAnalytics] = useState({
    ranking: [],
    desde: hoyIso(),
    hasta: hoyIso(),
  });
  const [weeklyBoard, setWeeklyBoard] = useState({
    dias: [],
    items: [],
    desde: hoyIso(),
    hasta: hoyIso(),
  });
  const [productCatalog, setProductCatalog] = useState([]);
  const [activeTab, setActiveTab] = useState('resumen');
  const [turnoActual, setTurnoActual] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [movementModal, setMovementModal] = useState(false);
  const [settlementModal, setSettlementModal] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [movementForm, setMovementForm] = useState(EMPTY_MOVEMENT);
  const [settlementForm, setSettlementForm] = useState(EMPTY_SETTLEMENT);
  const [attendanceForm, setAttendanceForm] = useState(EMPTY_ATTENDANCE);
  const [goalForm, setGoalForm] = useState(EMPTY_GOAL);
  const [productConsumptionForm, setProductConsumptionForm] = useState(EMPTY_PRODUCT_CONSUMPTION);
  const [attendanceRange, setAttendanceRange] = useState({ desde: hoyIso(), hasta: hoyIso() });
  const [weeklyEditor, setWeeklyEditor] = useState(EMPTY_WEEKLY_EDITOR);
  const [saving, setSaving] = useState(false);
  const [premiosModal, setPremiosModal] = useState(false);
  const [reconocimientoModal, setReconocimientoModal] = useState(false);
  const [reconocimientoForm, setReconocimientoForm] = useState({
    motivo: '',
    puntos: '10',
    descripcion: '',
  });
  const [reconocimientoSaving, setReconocimientoSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [reconocimientosConfig, setReconocimientosConfig] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activos');
  const fileInputRef = useRef(null);

  const cargar = async (preferredSelectedId = null) => {
    try {
      const data = await api.get('/personal');
      const items = data.items || [];
      setPersonal(items);
      setCategorias(data.categorias || []);
      setTurnoActual(data.turno_actual || '');
      setAttendanceSummary(data.asistencia_hoy || null);
      setProductCatalog(data.productos_catalogo || []);
      const nextSelectedId = preferredSelectedId || selectedId;
      if (nextSelectedId && items.some((item) => String(item.id) === String(nextSelectedId))) {
        setSelectedId(String(nextSelectedId));
      } else if (items[0]) {
        setSelectedId(String(items[0].id));
      }
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar el personal');
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  /**
   * Config de reconocimientos.
   *
   * El endpoint `/personal/reconocimientos/config` ya existía con los puntos
   * por puntualidad, feedback y venta destacada, más el umbral de canje y la
   * recompensa en pesos. El cliente nunca lo llamaba: la modal de premios
   * mostraba una tabla escrita a mano (+5/+10/+15/+20) que no tenía relación
   * con lo configurado y no mencionaba el canje.
   */
  const cargarConfigReconocimientos = async () => {
    try {
      const data = await api.get('/personal/reconocimientos/config');
      setReconocimientosConfig(data || null);
    } catch {
      // No es crítico: la modal cae a un mensaje genérico si esto falla.
      setReconocimientosConfig(null);
    }
  };

  useEffect(() => {
    cargarConfigReconocimientos();
  }, []);

  const cargarAnaliticaAsistencia = async (
    desde = attendanceRange.desde,
    hasta = attendanceRange.hasta
  ) => {
    try {
      const data = await api.get(`/personal/asistencia/analitica?desde=${desde}&hasta=${hasta}`);
      setAttendanceAnalytics(data || { ranking: [], desde, hasta });
    } catch {
      toast.error('No se pudo cargar el ranking de asistencia');
    }
  };

  useEffect(() => {
    cargarAnaliticaAsistencia();
  }, []);

  const cargarPlanillaSemanal = async (desde = hoyIso()) => {
    try {
      const data = await api.get(`/personal/asistencia/planilla-semanal?desde=${desde}`);
      setWeeklyBoard(data || { dias: [], items: [], desde, hasta: desde });
    } catch {
      toast.error('No se pudo cargar la planilla semanal');
    }
  };

  useEffect(() => {
    cargarPlanillaSemanal(hoyIso());
  }, []);

  const cargarDetalle = async (id) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const data = await api.get(`/personal/${id}/detalle`);
      setDetail(data);
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar el detalle');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    cargarDetalle(selectedId);
  }, [selectedId]);

  const selectedPerson = useMemo(
    () => personal.find((item) => String(item.id) === String(selectedId)) || null,
    [personal, selectedId]
  );

  /**
   * Filtro de la lista lateral.
   *
   * No había ninguno: la lista mostraba a todo el mundo, activos e inactivos
   * mezclados, y para encontrar a alguien había que scrollear. Los que ya no
   * trabajan no se pueden ocultar del todo (hay que poder abrir su ficha para
   * ver movimientos viejos), así que por defecto se muestran sólo los activos
   * y hay un filtro para verlos.
   *
   * El `.toLowerCase()` va sobre `String(...)`: un empleado sin rol cargado
   * hacía explotar el filtro y la lista quedaba en blanco.
   */
  const personalFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return personal
      .filter((item) => {
        if (filtroEstado === 'activos' && !item.activo) return false;
        if (filtroEstado === 'inactivos' && item.activo) return false;
        if (!q) return true;
        return [item.nombre, item.rol_operativo, item.telefono].some((campo) =>
          String(campo || '')
            .toLowerCase()
            .includes(q)
        );
      })
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
  }, [personal, busqueda, filtroEstado]);
  // `sueldoPreview` y `movimientoPreview` se calculaban acá y se exportaban,
  // pero ningún componente los leía: los dos formularios formatean el monto
  // en el `onBlur` del propio input.
  const liquidacionPreview = useMemo(() => {
    const unidades = Math.max(0, parseLocalizedAmount(settlementForm.unidades || 1, 1));
    const bruto = Number(selectedPerson?.monto_base || 0) * unidades;
    const pendiente = Number(selectedPerson?.pendiente_total || 0);
    const neto = bruto - pendiente;
    return { neto, label: fmt(neto) };
  }, [selectedPerson?.monto_base, selectedPerson?.pendiente_total, settlementForm.unidades]);

  const stats = useMemo(
    () => ({
      total: personal.length,
      activos: personal.filter((item) => item.activo).length,
      // `manana` contaba los del turno mañana y no se mostraba en ningún lado.
      // En su lugar: a cuánta gente le debés plata, que sí es accionable.
      conPendiente: personal.filter((item) => Number(item.pendiente_total || 0) > 0).length,
      pendiente: personal.reduce((acc, item) => acc + Number(item.pendiente_total || 0), 0),
    }),
    [personal]
  );
  const currentAttendance = useMemo(
    () =>
      (detail?.asistencia || []).find(
        (item) =>
          String(item.fecha_operativa || '') === String(attendanceSummary?.fecha_operativa || '')
      ) || null,
    [detail?.asistencia, attendanceSummary?.fecha_operativa]
  );
  const currentShiftTeam = useMemo(
    () => attendanceSummary?.items || [],
    [attendanceSummary?.items]
  );
  const weeklyRow = useMemo(
    () => weeklyBoard?.items?.find((item) => String(item.id) === String(selectedId)) || null,
    [weeklyBoard?.items, selectedId]
  );
  const weeklyEditorDay = useMemo(
    () =>
      weeklyRow?.days?.find((day) => String(day.fecha) === String(weeklyEditor.fecha_operativa)) ||
      null,
    [weeklyRow, weeklyEditor.fecha_operativa]
  );
  const weeklySummary = useMemo(() => {
    const items = weeklyBoard?.items || [];
    const rows = items.map((item) => {
      const presentDays = item.days.filter((day) =>
        ['presente', 'tarde'].includes(String(day.estado || '').toLowerCase())
      ).length;
      const lateDays = item.days.filter(
        (day) => String(day.estado || '').toLowerCase() === 'tarde'
      ).length;
      const absentDays = item.days.filter(
        (day) => String(day.estado || '').toLowerCase() === 'ausente'
      ).length;
      const workedMinutes = item.days.reduce(
        (acc, day) => acc + Number(day.minutos_trabajados || 0),
        0
      );
      return {
        ...item,
        presentDays,
        lateDays,
        absentDays,
        workedMinutes,
      };
    });

    const topAttendance =
      [...rows].sort(
        (a, b) =>
          b.presentDays - a.presentDays ||
          a.absentDays - b.absentDays ||
          a.nombre.localeCompare(b.nombre)
      )[0] || null;
    const topPunctual =
      [...rows].sort(
        (a, b) =>
          a.lateDays - b.lateDays ||
          b.presentDays - a.presentDays ||
          a.nombre.localeCompare(b.nombre)
      )[0] || null;
    const totalLate = rows.reduce((acc, row) => acc + row.lateDays, 0);
    const totalAbsent = rows.reduce((acc, row) => acc + row.absentDays, 0);

    return {
      rows,
      topAttendance,
      topPunctual,
      totalLate,
      totalAbsent,
    };
  }, [weeklyBoard?.items]);
  const shiftMetrics = useMemo(() => {
    const roster = currentShiftTeam || [];
    const presentes = roster.filter((item) =>
      ['presente', 'tarde'].includes(String(item.estado || '').toLowerCase())
    ).length;
    const tardes = roster.filter(
      (item) => String(item.estado || '').toLowerCase() === 'tarde'
    ).length;
    const ausentes = roster.filter(
      (item) => String(item.estado || '').toLowerCase() === 'ausente'
    ).length;
    const punctualTop =
      [...(attendanceAnalytics.ranking || [])].sort(
        (a, b) =>
          Number(b.puntualidadPct || 0) - Number(a.puntualidadPct || 0) ||
          Number(b.asistenciaPct || 0) - Number(a.asistenciaPct || 0)
      )[0] || null;

    return {
      presentes,
      tardes,
      ausentes,
      total: roster.length,
      puntualTop: punctualTop,
    };
  }, [currentShiftTeam, attendanceAnalytics.ranking]);

  useEffect(() => {
    if (!weeklyRow?.days?.length) {
      setWeeklyEditor(EMPTY_WEEKLY_EDITOR);
      return;
    }
    const preferredDay = weeklyRow.days.find((day) => day.estado) || weeklyRow.days[0];
    setWeeklyEditor({
      fecha_operativa: preferredDay?.fecha || '',
      estado: preferredDay?.estado || 'presente',
      ingreso_en: isoAInputLocal(preferredDay?.ingreso_en),
      salida_en: isoAInputLocal(preferredDay?.salida_en),
      notas: '',
      turno_id: preferredDay?.turno_id || weeklyRow.turno_preferido || '',
    });
  }, [weeklyRow]);

  const copyText = async (value, success = 'Copiado') => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(success);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const getClockUrl = (item) =>
    item?.clock_token
      ? buildPublicAppUrl(`/personal/reloj/${item.clock_token}`, appConfig)
      : buildPublicAppUrl('/personal/reloj', appConfig);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('imagen', file);
    try {
      const res = await api.post('/personal/upload-avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Era `setForm({ ...form, ... })`, que captura el `form` del render en
      // que se montó el handler: si editabas un campo y subías la foto sin
      // soltar el foco, se perdía ese cambio.
      setForm((prev) => ({ ...prev, avatar_url: res.url }));
      setAvatarPickerOpen(false);
      toast.success('Imagen cargada');
    } catch (error) {
      toast.error(error?.error || 'No se pudo subir la imagen');
    }
  };

  const submitReconocimiento = async () => {
    if (!detail?.item?.id) return;
    if (!reconocimientoForm.motivo.trim()) return toast.error('Ingresá un motivo');
    const puntos = Number(reconocimientoForm.puntos) || 0;
    setReconocimientoSaving(true);
    try {
      // El formulario mandaba `{ motivo, puntos, descripcion }`, pero
      // `agregarReconocimiento` sólo lee `tipo`, `puntos` y `descripcion`:
      // el motivo —que el formulario exige como obligatorio— se descartaba
      // en silencio y `tipo` se guardaba en NULL. Por eso el historial
      // mostraba filas sin título.
      //
      // `motivo` es exactamente el rótulo corto que espera `tipo`, así que
      // se manda ahí y no hace falta tocar el esquema de la base.
      await api.post(`/personal/${detail.item.id}/reconocimientos`, {
        tipo: reconocimientoForm.motivo.trim(),
        puntos,
        descripcion: reconocimientoForm.descripcion.trim(),
      });
      toast.success('Reconocimiento otorgado');
      setReconocimientoModal(false);
      setReconocimientoForm({ motivo: '', puntos: '10', descripcion: '' });
      await cargarDetalle(detail.item.id);
    } catch {
      toast.error('No se pudo guardar el reconocimiento');
    } finally {
      setReconocimientoSaving(false);
    }
  };

  const registrarAsistencia = async (estado, salida = false) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.post(`/personal/${selectedId}/asistencia`, {
        estado,
        notas: attendanceForm.notas,
        ...(salida
          ? { salida_en: new Date().toISOString() }
          : { ingreso_en: new Date().toISOString() }),
      });
      toast.success('Asistencia actualizada');
      setAttendanceForm(EMPTY_ATTENDANCE);
      await cargar(selectedId);
      await cargarDetalle(selectedId);
      await cargarAnaliticaAsistencia();
      await cargarPlanillaSemanal(weeklyBoard?.desde || hoyIso());
    } catch (error) {
      toast.error(error?.error || 'No se pudo registrar la asistencia');
    } finally {
      setSaving(false);
    }
  };

  const seleccionarDiaPlanilla = (day) => {
    if (!day) return;
    setWeeklyEditor({
      fecha_operativa: day.fecha || '',
      estado: day.estado || 'presente',
      ingreso_en: isoAInputLocal(day.ingreso_en),
      salida_en: isoAInputLocal(day.salida_en),
      notas: '',
      turno_id: day.turno_id || weeklyRow?.turno_preferido || '',
    });
  };

  const guardarAsistenciaManual = async () => {
    if (!selectedId || !weeklyEditor.fecha_operativa)
      return toast.error('Elegí un día de la planilla');
    setSaving(true);
    try {
      // El editor trabaja en hora local; el servidor guarda ISO en UTC.
      await api.put(`/personal/${selectedId}/asistencia/manual`, {
        ...weeklyEditor,
        ingreso_en: inputLocalAIso(weeklyEditor.ingreso_en),
        salida_en: inputLocalAIso(weeklyEditor.salida_en),
      });
      toast.success('Asistencia semanal actualizada');
      await cargar(selectedId);
      await cargarDetalle(selectedId);
      await cargarAnaliticaAsistencia(attendanceRange.desde, attendanceRange.hasta);
      await cargarPlanillaSemanal(weeklyBoard?.desde || hoyIso());
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar la asistencia semanal');
    } finally {
      setSaving(false);
    }
  };

  const guardarObjetivo = async () => {
    if (!selectedId) return;
    if (!goalForm.objetivo) return toast.error('Ingresá una meta');
    setSaving(true);
    try {
      await api.post(`/personal/${selectedId}/objetivos`, goalForm);
      toast.success('Meta guardada');
      setGoalForm(EMPTY_GOAL);
      await cargarDetalle(selectedId);
      await cargar(selectedId);
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar la meta');
    } finally {
      setSaving(false);
    }
  };

  const registrarConsumoProducto = async () => {
    if (!selectedId) return;
    if (!productConsumptionForm.producto_id) return toast.error('Elegí un producto');
    setSaving(true);
    try {
      await api.post(`/personal/${selectedId}/consumo-producto`, productConsumptionForm);
      toast.success('Consumo cargado');
      setProductConsumptionForm((prev) => ({
        ...EMPTY_PRODUCT_CONSUMPTION,
        descuento_empleado_pct: prev.descuento_empleado_pct || '20',
      }));
      await cargar(selectedId);
      await cargarDetalle(selectedId);
    } catch (error) {
      toast.error(error?.error || 'No se pudo registrar el consumo');
    } finally {
      setSaving(false);
    }
  };

  const marcarObjetivoCumplido = async (objetivoId, progresoObjetivo) => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await api.put(`/personal/${selectedId}/objetivos/${objetivoId}`, {
        cumplido: 1,
        progreso: progresoObjetivo,
      });
      toast.success('Meta marcada como cumplida');
      await cargar(selectedId);
      await cargarDetalle(selectedId);
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar la meta');
    } finally {
      setSaving(false);
    }
  };

  const abrirNuevo = () => {
    // `EMPTY_FORM.fecha_ingreso` se calcula una sola vez al importar el módulo.
    // Si la pestaña queda abierta de un día para el otro, todos los ingresos
    // nuevos se cargaban con la fecha del día en que se abrió la app.
    setForm({ ...EMPTY_FORM, fecha_ingreso: hoyIso() });
    setModal('nuevo');
  };
  const abrirEditar = (item) => {
    setForm({
      ...EMPTY_FORM,
      ...item,
      monto_base: item?.monto_base ? formatAmountForInput(item.monto_base) : '',
      activo: item.activo ? 1 : 0,
    });
    setModal(item);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error('El nombre es obligatorio');
    setSaving(true);
    try {
      if (modal === 'nuevo') {
        const created = await api.post('/personal', form);
        toast.success('Personal agregado');
        await cargar(created.id);
      } else {
        await api.put(`/personal/${modal.id}`, form);
        toast.success('Personal actualizado');
        await cargar(modal.id);
      }
      setModal(null);
    } catch (error) {
      // Se descartaba el error y se mostraba siempre "No se pudo guardar".
      // El servidor valida nombre duplicado y PIN de fichada repetido, y esos
      // mensajes nunca llegaban: la modal se quedaba trabada sin explicar por qué.
      toast.error(error?.error || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const registrarMovimiento = async () => {
    if (!movementForm.monto && movementForm.tipo !== 'consumo')
      return toast.error('Ingresa un monto');
    setSaving(true);
    try {
      await api.post(`/personal/${selectedId}/movimientos`, movementForm);
      toast.success('Movimiento registrado');
      setMovementModal(false);
      setMovementForm(EMPTY_MOVEMENT);
      await cargarDetalle(selectedId);
      await cargar(selectedId);
    } catch (error) {
      toast.error(error?.error || 'No se pudo completar la operación');
    } finally {
      setSaving(false);
    }
  };

  const confirmarLiquidacion = async () => {
    setSaving(true);
    try {
      await api.post(`/personal/${selectedId}/liquidaciones`, settlementForm);
      toast.success('Liquidación exitosa');
      setSettlementModal(false);
      await cargarDetalle(selectedId);
      await cargar(selectedId);
    } catch (error) {
      toast.error(error?.error || 'No se pudo completar la operación');
    } finally {
      setSaving(false);
    }
  };

  const liquidarAutomatico = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const result = await api.post(`/personal/${selectedId}/liquidaciones/auto`, {
        metodo_pago:
          settlementForm.metodo_pago || selectedPerson?.medio_pago_preferido || 'efectivo',
        notas: settlementForm.notas || 'Liquidación automática por asistencia',
        impacta_caja: settlementForm.impacta_caja,
      });
      toast.success(
        `Liquidación automática registrada por ${result.sugerencia?.unidades_sugeridas || 0} jornadas`
      );
      setSettlementModal(false);
      await cargarDetalle(selectedId);
      await cargar(selectedId);
      await cargarPlanillaSemanal(weeklyBoard?.desde || hoyIso());
    } catch (error) {
      toast.error(error?.error || 'No se pudo liquidar automáticamente');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (item) => {
    setDeleteDialog(item);
  };

  const confirmarEliminar = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/personal/${deleteDialog.id}`);
      toast.success('Eliminado');
      setDeleteDialog(null);
      await cargar();
    } catch (error) {
      // Decía sólo "Error". El backend rechaza borrar a alguien con saldo
      // pendiente o con liquidaciones asociadas; sin el mensaje real parecía
      // que el sistema estaba roto.
      toast.error(error?.error || 'No se pudo eliminar');
    }
  };

  return {
    appConfig,
    publicAppDiagnostics,
    personal,
    categorias,
    attendanceSummary,
    attendanceAnalytics,
    weeklyBoard,
    productCatalog,
    activeTab,
    setActiveTab,
    turnoActual,
    selectedId,
    setSelectedId,
    detail,
    detailLoading,
    modal,
    setModal,
    movementModal,
    setMovementModal,
    settlementModal,
    setSettlementModal,
    avatarPickerOpen,
    setAvatarPickerOpen,
    form,
    setForm,
    movementForm,
    setMovementForm,
    settlementForm,
    setSettlementForm,
    attendanceForm,
    setAttendanceForm,
    goalForm,
    setGoalForm,
    productConsumptionForm,
    setProductConsumptionForm,
    attendanceRange,
    setAttendanceRange,
    weeklyEditor,
    setWeeklyEditor,
    saving,
    premiosModal,
    setPremiosModal,
    reconocimientoModal,
    setReconocimientoModal,
    reconocimientoForm,
    setReconocimientoForm,
    reconocimientoSaving,
    setReconocimientoSaving,
    deleteDialog,
    setDeleteDialog,
    reconocimientosConfig,
    busqueda,
    setBusqueda,
    filtroEstado,
    setFiltroEstado,
    personalFiltrado,
    fileInputRef,
    selectedPerson,
    liquidacionPreview,
    stats,
    currentAttendance,
    currentShiftTeam,
    weeklyRow,
    weeklyEditorDay,
    weeklySummary,
    shiftMetrics,
    copyText,
    getClockUrl,
    handleFileUpload,
    submitReconocimiento,
    registrarAsistencia,
    seleccionarDiaPlanilla,
    guardarAsistenciaManual,
    guardarObjetivo,
    registrarConsumoProducto,
    marcarObjetivoCumplido,
    abrirNuevo,
    abrirEditar,
    guardar,
    registrarMovimiento,
    confirmarLiquidacion,
    liquidarAutomatico,
    eliminar,
    confirmarEliminar,
    cargar,
    cargarAnaliticaAsistencia,
    cargarPlanillaSemanal,
  };
}
