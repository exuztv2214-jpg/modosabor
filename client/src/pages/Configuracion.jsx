import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BellRing,
  Bot,
  Building2,
  Check,
  CreditCard,
  LayoutGrid,
  MonitorSmartphone,
  Printer,
  Save,
  Settings,
  Smartphone,
  MessageCircle,
  Truck,
} from 'lucide-react';

import api from '../lib/api.js';
import { applyBranding } from '../lib/branding.js';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import SeccionGeneral from '../components/Configuracion/SeccionGeneral.jsx';
import SeccionModulos from '../components/Configuracion/SeccionModulos.jsx';
import SeccionPagos from '../components/Configuracion/SeccionPagos.jsx';
import SeccionDelivery from '../components/Configuracion/SeccionDelivery.jsx';
import SeccionRider from '../components/Configuracion/SeccionRider.jsx';
import SeccionImpresion from '../components/Configuracion/SeccionImpresion.jsx';
import SeccionAvanzado from '../components/Configuracion/SeccionAvanzado.jsx';
import SeccionWebPublica from '../components/Configuracion/SeccionWebPublica.jsx';
import SeccionAlertas from '../components/Configuracion/SeccionAlertas.jsx';
import SeccionAsistente from '../components/Configuracion/SeccionAsistente.jsx';
import SeccionWhatsapp from '../components/Configuracion/SeccionWhatsapp.jsx';
import ActionDialog from '../components/ActionDialog.jsx';
import { safeParseArray } from '../lib/pedidoForm.js';

const TABS = [
  { id: 'general', label: 'General', icon: Building2, hint: 'Datos del local, marca y turnos' },
  { id: 'web', label: 'Web pública', icon: MonitorSmartphone, hint: 'Cómo se ve la carta online' },
  { id: 'modulos', label: 'Módulos', icon: LayoutGrid, hint: 'Qué partes del sistema se usan' },
  { id: 'pagos', label: 'Pagos', icon: CreditCard, hint: 'Métodos de cobro y Mercado Pago' },
  { id: 'delivery', label: 'Delivery', icon: Truck, hint: 'Zonas, costos y tiempos de envío' },
  {
    id: 'rider',
    label: 'App rider',
    icon: Smartphone,
    hint: 'Comportamiento de la app de reparto',
  },
  { id: 'alertas', label: 'Alertas', icon: BellRing, hint: 'Sonidos y avisos de pedidos' },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: MessageCircle,
    hint: 'Conexión única, atención IA y campañas',
  },
  { id: 'asistente', label: 'Asistente', icon: Bot, hint: 'El chat que consulta el negocio' },
  { id: 'impresion', label: 'Impresión', icon: Printer, hint: 'Comandas, tickets y formato' },
  { id: 'avanzado', label: 'Avanzado', icon: Settings, hint: 'Backups, auditoría y reinicio' },
];

function buildDefaultTurno(index) {
  return {
    id: `turno_${index + 1}`,
    nombre: `Turno ${index + 1}`,
    desde: index === 0 ? '11:00' : '19:00',
    hasta: index === 0 ? '14:00' : '23:30',
    activo: true,
  };
}

export default function Configuracion() {
  const { refreshConfig } = useAppConfig();
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assetUploading, setAssetUploading] = useState({ logo: false, favicon: false });
  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    return TABS.some((tab) => tab.id === requested) ? requested : 'general';
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [dialogInput, setDialogInput] = useState('');
  const logoInputRef = useRef(null);
  const faviconInputRef = useRef(null);

  /**
   * Nueve pestañas con un único botón de guardar es la receta perfecta para
   * perder trabajo: se editan cinco campos en Pagos, se salta a Delivery, se
   * cierra la pantalla y no quedó nada. Antes nada avisaba.
   */
  const [sucio, setSucio] = useState(false);

  const hydrateState = (data) => {
    setConfig(data);
    setDeliveryZones(safeParseArray(data.delivery_zonas));
    const parsedTurnos = safeParseArray(data.turnos_negocio || data.negocio_horarios);
    setTurnos(
      parsedTurnos.length > 0 ? parsedTurnos : [buildDefaultTurno(0), buildDefaultTurno(1)]
    );
    setSucio(false);
  };

  const fetchConfig = async () => {
    try {
      const data = await api.get('/configuracion/map');
      hydrateState(data);
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const logs = await api.get('/configuracion/audit?limit=10');
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      // El interceptor de axios rechaza con `.error`, no con `.message`.
      console.warn('No se pudo cargar el historial de cambios:', err?.error || err);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchAuditLogs();
  }, []);

  useEffect(() => {
    if (!sucio) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [sucio]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const finalConfig = {
        ...config,
        delivery_zonas: JSON.stringify(deliveryZones),
        turnos_negocio: JSON.stringify(turnos),
      };

      const updated = await api.post('/configuracion/bulk', { config: finalConfig });
      hydrateState(updated);
      applyBranding(updated);
      await refreshConfig(updated);
      await fetchAuditLogs();
      toast.success('Configuración guardada');
    } catch (error) {
      toast.error(error?.error || 'No se pudieron guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const uploadBrandAsset = async (field, file) => {
    if (!file) return;
    setAssetUploading((prev) => ({ ...prev, [field]: true }));
    const formData = new FormData();
    formData.append(field, file);

    try {
      const updated = await api.put('/configuracion', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      hydrateState(updated);
      applyBranding(updated);
      await refreshConfig(updated);
      await fetchAuditLogs();
      toast.success(field === 'logo' ? 'Logo actualizado' : 'Favicon actualizado');
    } catch (error) {
      toast.error(error?.error || 'No se pudo subir el archivo');
    } finally {
      setAssetUploading((prev) => ({ ...prev, [field]: false }));
    }
  };

  const handleBrandFileChange = (field) => async (event) => {
    const file = event.target.files?.[0];
    await uploadBrandAsset(field, file);
    event.target.value = '';
  };

  const setToggle = (key, value) => {
    setSucio(true);
    setConfig((prev) => ({ ...prev, [key]: value ? '1' : '0' }));
  };

  /**
   * Enlaza un campo del formulario con su clave de configuración.
   *
   * Usa `??` y no `||`: con `||`, un valor numérico cero se convertía en
   * cadena vacía y el campo aparecía en blanco. Pasaba, por ejemplo, con un
   * costo de envío en 0 para la zona propia.
   */
  const f = (key) => ({
    value: config[key] ?? '',
    onChange: (event) => {
      setSucio(true);
      setConfig((prev) => ({ ...prev, [key]: event.target.value }));
    },
  });

  /** Envuelve un setter para que cualquier cambio marque la pantalla como sucia. */
  const setConfigSucio = (updater) => {
    setSucio(true);
    setConfig(updater);
  };

  const addZone = () => {
    setSucio(true);
    setDeliveryZones((prev) => [
      ...prev,
      {
        id: `zona_${Date.now()}`,
        nombre: '',
        costo_envio: 0,
        tiempo_estimado_min: 30,
        keywords: [],
        activa: true,
      },
    ]);
  };

  const removeZone = (index) => {
    setSucio(true);
    setDeliveryZones((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateZone = (index, key, value) => {
    setSucio(true);
    setDeliveryZones((prev) =>
      prev.map((zone, currentIndex) => (currentIndex === index ? { ...zone, [key]: value } : zone))
    );
  };

  // El envío es gratis en todo Monteros. Las zonas sirven para estimar la
  // demora, no para tarifar; por eso las dos van en 0. El preset anterior
  // ponía $1.200 en "Barrios cercanos", que no es como trabaja el local.
  //
  // `catchAll` en Monteros hace que cualquier dirección que no matchee otra
  // zona caiga acá en vez de quedar sin zona.
  const applyMonterosPreset = () => {
    setSucio(true);
    setDeliveryZones([
      {
        id: 'monteros',
        nombre: 'Monteros',
        catchAll: true,
        costo_envio: 0,
        tiempo_estimado_min: 25,
        keywords: ['monteros', 'centro', 'plaza'],
        activa: true,
      },
      {
        id: 'cercana',
        nombre: 'Barrios cercanos',
        costo_envio: 0,
        tiempo_estimado_min: 35,
        keywords: ['villa quinteros', 'santa lucia'],
        activa: true,
      },
    ]);
  };

  const addTurno = () => {
    setSucio(true);
    setTurnos((prev) => [...prev, buildDefaultTurno(prev.length)]);
  };

  const updateTurno = (index, key, value) => {
    setSucio(true);
    setTurnos((prev) =>
      prev.map((turno, currentIndex) =>
        currentIndex === index ? { ...turno, [key]: value } : turno
      )
    );
  };

  const removeTurno = (index) => {
    setSucio(true);
    setTurnos((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const exportarBackup = async () => {
    try {
      const response = await fetch(`${api.defaults.baseURL}/configuracion/backup/export`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      const match = contentDisposition.match(/filename="?([^"]+)"?/i);
      const downloadName = match?.[1] || 'modosabor-backup.sqlite';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('Backup exportado');
    } catch (error) {
      toast.error(error?.error || 'No se pudo exportar el backup');
    }
  };

  const importarBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDialogInput('');
    setDialog({
      type: 'import-backup',
      title: 'Restaurar backup',
      description: `Vas a reemplazar todos los datos actuales con "${file.name}". Es una acción sensible y no se puede deshacer.`,
      file,
      onCloseReset: () => {
        event.target.value = '';
      },
    });
  };

  const resetOperativo = async () => {
    setDialogInput('');
    setDialog({
      type: 'reset-operativo',
      title: 'Reset operativo',
      description:
        'Se borrarán pedidos, caja, auditoría y mensajería operativa. El menú, usuarios, personal y configuración se conservan.',
    });
  };

  const closeDialog = () => {
    if (dialog?.onCloseReset) dialog.onCloseReset();
    setDialog(null);
    setDialogInput('');
  };

  const confirmDialog = async () => {
    if (!dialog) return;

    if (
      (dialog.type === 'import-backup' || dialog.type === 'reset-operativo') &&
      dialogInput.trim().toUpperCase() !== 'RESTAURAR'
    ) {
      toast.error('Escribí RESTAURAR para confirmar');
      return;
    }

    try {
      if (dialog.type === 'import-backup') {
        const formData = new FormData();
        formData.append('backup', dialog.file);
        await api.post('/configuracion/backup/import', formData);
        toast.success('Backup restaurado. Recargando…');
        closeDialog();
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      if (dialog.type === 'reset-operativo') {
        await api.post('/configuracion/reset-operativo');
        toast.success('Sistema reiniciado');
        closeDialog();
        await fetchAuditLogs();
      }
    } catch (error) {
      toast.error(
        error?.error ||
          (dialog.type === 'import-backup'
            ? 'No se pudo importar el backup'
            : 'No se pudo reiniciar')
      );
    }
  };

  const tabActual = useMemo(() => TABS.find((tab) => tab.id === activeTab), [activeTab]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center" style={{ background: APP_BG }}>
        <div
          className="h-9 w-9 animate-spin rounded-full border-[3px] border-gray-200"
          style={{ borderTopColor: BRAND }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16" style={{ background: APP_BG }}>
      {/*
        Encabezado y pestañas en renglones separados.

        El botón de guardar era hermano de la fila de pestañas, que scrollea
        en horizontal. En pantallas angostas le comía el espacio y quedaba
        montado sobre la última pestaña, Avanzado. Ahora cada cosa tiene su
        renglón y no se pisan nunca.

        Y está siempre visible, no sólo cuando hay cambios: si no aparece
        nada, el operador no sabe si existe ni dónde buscarlo.
      */}
      <div className="sticky top-0 z-20 border-b border-gray-100 bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 pb-2 pt-4 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-gray-900">
                {tabActual?.label}
              </h1>
              <p className="mt-0.5 text-[13px] text-gray-500">{tabActual?.hint}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {sucio ? (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Descartar los cambios y volver a lo último guardado?')) {
                      fetchConfig();
                    }
                  }}
                  className="h-11 rounded-xl px-4 text-[13px] font-semibold text-gray-500 transition hover:bg-gray-100"
                >
                  Descartar
                </button>
              ) : null}
              <button
                type="button"
                onClick={saveConfig}
                disabled={saving || !sucio}
                style={sucio ? { background: BRAND, color: '#FFFFFF' } : undefined}
                title={sucio ? 'Guardar los cambios' : 'No hay cambios pendientes'}
                className={`flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-semibold transition disabled:cursor-default ${sucio ? 'hover:brightness-110' : 'bg-gray-100 text-gray-400'}`}
              >
                {sucio ? (
                  <Save size={16} strokeWidth={STROKE} />
                ) : (
                  <Check size={16} strokeWidth={STROKE} />
                )}
                {saving ? 'Guardando…' : sucio ? 'Guardar cambios' : 'Todo guardado'}
              </button>
            </div>
          </div>

          <div className="no-scrollbar -mx-1 mt-3 overflow-x-auto px-1 pb-1">
            <div className="flex gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const activo = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.hint}
                    style={activo ? { background: BRAND, color: '#FFFFFF' } : undefined}
                    className={`flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-[13px] transition ${activo ? 'font-semibold' : 'font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
                  >
                    <Icon size={16} strokeWidth={STROKE} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2">
        {activeTab === 'general' && (
          <SeccionGeneral
            config={config}
            f={f}
            setToggle={setToggle}
            turnos={turnos}
            addTurno={addTurno}
            updateTurno={updateTurno}
            removeTurno={removeTurno}
            logoInputRef={logoInputRef}
            faviconInputRef={faviconInputRef}
            assetUploading={assetUploading}
            onLogoFileChange={handleBrandFileChange('logo')}
            onFaviconFileChange={handleBrandFileChange('favicon')}
          />
        )}
        {activeTab === 'modulos' && (
          <SeccionModulos config={config} setToggle={setToggle} setConfig={setConfigSucio} />
        )}
        {activeTab === 'web' && <SeccionWebPublica config={config} setConfig={setConfigSucio} />}
        {activeTab === 'pagos' && (
          <SeccionPagos config={config} setConfig={setConfigSucio} f={f} setToggle={setToggle} />
        )}
        {activeTab === 'delivery' && (
          <SeccionDelivery
            config={config}
            f={f}
            setToggle={setToggle}
            deliveryZones={deliveryZones}
            addZone={addZone}
            removeZone={removeZone}
            updateZone={updateZone}
            applyMonterosPreset={applyMonterosPreset}
          />
        )}
        {activeTab === 'rider' && <SeccionRider config={config} f={f} setConfig={setConfigSucio} />}
        {activeTab === 'alertas' && (
          <SeccionAlertas config={config} f={f} setConfig={setConfigSucio} />
        )}
        {activeTab === 'whatsapp' && <SeccionWhatsapp config={config} setConfig={setConfigSucio} />}
        {activeTab === 'asistente' && (
          <SeccionAsistente config={config} setConfig={setConfigSucio} />
        )}
        {activeTab === 'impresion' && (
          <SeccionImpresion
            config={config}
            f={f}
            setToggle={setToggle}
            setConfig={setConfigSucio}
          />
        )}
        {activeTab === 'avanzado' && (
          <SeccionAvanzado
            config={config}
            f={f}
            setToggle={setToggle}
            exportarBackup={exportarBackup}
            importarBackup={importarBackup}
            resetOperativo={resetOperativo}
            auditLogs={auditLogs}
          />
        )}
      </div>

      <ActionDialog
        open={Boolean(dialog)}
        title={dialog?.title || ''}
        description={dialog?.description || ''}
        confirmLabel={dialog?.type === 'import-backup' ? 'Restaurar backup' : 'Ejecutar reset'}
        cancelLabel="Cancelar"
        tone="danger"
        inputLabel="Confirmación"
        inputPlaceholder="Escribí RESTAURAR"
        inputValue={dialogInput}
        onInputChange={setDialogInput}
        onConfirm={confirmDialog}
        onClose={closeDialog}
      />
    </div>
  );
}
