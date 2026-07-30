import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '../../lib/api.js';
import {
  formatAmountForInput,
  formatAmountPreview,
  parseLocalizedAmount,
} from '../../lib/amountInput.js';
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
  todayIso,
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
    desde: todayIso,
    hasta: todayIso,
  });
  const [weeklyBoard, setWeeklyBoard] = useState({
    dias: [],
    items: [],
    desde: todayIso,
    hasta: todayIso,
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
  const [attendanceRange, setAttendanceRange] = useState({ desde: todayIso, hasta: todayIso });
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
    } catch {
      toast.error('No se pudo cargar el personal');
    }
  };

  useEffect(() => {
    cargar();
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

  const cargarPlanillaSemanal = async (desde = todayIso) => {
    try {
      const data = await api.get(`/personal/asistencia/planilla-semanal?desde=${desde}`);
      setWeeklyBoard(data || { dias: [], items: [], desde, hasta: desde });
    } catch {
      toast.error('No se pudo cargar la planilla semanal');
    }
  };

  useEffect(() => {
    cargarPlanillaSemanal(todayIso);
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
  const sueldoPreview = useMemo(() => formatAmountPreview(form.monto_base || 0), [form.monto_base]);
  const movimientoPreview = useMemo(
    () => formatAmountPreview(movementForm.monto || 0),
    [movementForm.monto]
  );
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
      manana: personal.filter((item) => item.activo && item.turno_preferido === 'manana').length,
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
      ingreso_en: preferredDay?.ingreso_en ? String(preferredDay.ingreso_en).slice(0, 16) : '',
      salida_en: preferredDay?.salida_en ? String(preferredDay.salida_en).slice(0, 16) : '',
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
      setForm({ ...form, avatar_url: res.url });
      toast.success('Imagen cargada');
    } catch {
      toast.error('Error al subir imagen');
    }
  };

  const submitReconocimiento = async () => {
    if (!detail?.item?.id) return;
    if (!reconocimientoForm.motivo.trim()) return toast.error('Ingresá un motivo');
    const puntos = Number(reconocimientoForm.puntos) || 0;
    setReconocimientoSaving(true);
    try {
      await api.post(`/personal/${detail.item.id}/reconocimientos`, {
        motivo: reconocimientoForm.motivo.trim(),
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
      await cargarPlanillaSemanal(weeklyBoard?.desde || todayIso);
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
      ingreso_en: day.ingreso_en ? String(day.ingreso_en).slice(0, 16) : '',
      salida_en: day.salida_en ? String(day.salida_en).slice(0, 16) : '',
      notas: '',
      turno_id: day.turno_id || weeklyRow?.turno_preferido || '',
    });
  };

  const guardarAsistenciaManual = async () => {
    if (!selectedId || !weeklyEditor.fecha_operativa)
      return toast.error('Elegí un día de la planilla');
    setSaving(true);
    try {
      await api.put(`/personal/${selectedId}/asistencia/manual`, {
        ...weeklyEditor,
        ingreso_en: weeklyEditor.ingreso_en || null,
        salida_en: weeklyEditor.salida_en || null,
      });
      toast.success('Asistencia semanal actualizada');
      await cargar(selectedId);
      await cargarDetalle(selectedId);
      await cargarAnaliticaAsistencia(attendanceRange.desde, attendanceRange.hasta);
      await cargarPlanillaSemanal(weeklyBoard?.desde || todayIso);
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
    setForm(EMPTY_FORM);
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
      toast.error('No se pudo guardar');
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
      toast.error(error?.error || 'Error');
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
      toast.error(error?.error || 'Error');
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
      await cargarPlanillaSemanal(weeklyBoard?.desde || todayIso);
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
    } catch {
      toast.error('Error');
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
    fileInputRef,
    selectedPerson,
    sueldoPreview,
    movimientoPreview,
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
