import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Building2,
  CreditCard,
  Truck,
  Printer,
  Settings,
  Save,
  LayoutGrid,
  Smartphone,
  MonitorSmartphone,
  BellRing,
} from 'lucide-react';

import api from '../lib/api.js';
import { applyBranding } from '../lib/branding.js';
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
import ActionDialog from '../components/ActionDialog.jsx';
import { safeParseArray } from '../lib/pedidoForm.js';

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
  const [activeTab, setActiveTab] = useState('general');
  const [auditLogs, setAuditLogs] = useState([]);
  const [deliveryZones, setDeliveryZones] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [dialogInput, setDialogInput] = useState('');
  const logoInputRef = useRef(null);
  const faviconInputRef = useRef(null);

  const hydrateState = (data) => {
    setConfig(data);
    setDeliveryZones(safeParseArray(data.delivery_zonas));
    const parsedTurnos = safeParseArray(data.turnos_negocio || data.negocio_horarios);
    setTurnos(
      parsedTurnos.length > 0 ? parsedTurnos : [buildDefaultTurno(0), buildDefaultTurno(1)]
    );
  };

  const fetchConfig = async () => {
    try {
      const data = await api.get('/configuracion/map');
      hydrateState(data);
    } catch {
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const logs = await api.get('/configuracion/audit?limit=10');
      setAuditLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      console.warn('No se pudo cargar el historial de cambios:', err?.message || err);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchAuditLogs();
  }, []);

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
      toast.success('Configuración guardada correctamente');
    } catch {
      toast.error('Error al guardar cambios');
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
    setConfig((prev) => ({ ...prev, [key]: value ? '1' : '0' }));
  };

  const f = (key) => ({
    value: config[key] || '',
    onChange: (event) => setConfig((prev) => ({ ...prev, [key]: event.target.value })),
  });

  const addZone = () => {
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
    setDeliveryZones((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateZone = (index, key, value) => {
    setDeliveryZones((prev) =>
      prev.map((zone, currentIndex) => (currentIndex === index ? { ...zone, [key]: value } : zone))
    );
  };

  const applyMonterosPreset = () => {
    setDeliveryZones([
      {
        id: 'monteros',
        nombre: 'Monteros',
        costo_envio: 0,
        tiempo_estimado_min: 25,
        keywords: ['monteros', 'centro', 'plaza'],
        activa: true,
      },
      {
        id: 'cercana',
        nombre: 'Barrios cercanos',
        costo_envio: 1200,
        tiempo_estimado_min: 35,
        keywords: ['villa quinteros', 'santa lucia'],
        activa: true,
      },
    ]);
  };

  const addTurno = () => {
    setTurnos((prev) => [...prev, buildDefaultTurno(prev.length)]);
  };

  const updateTurno = (index, key, value) => {
    setTurnos((prev) =>
      prev.map((turno, currentIndex) =>
        currentIndex === index ? { ...turno, [key]: value } : turno
      )
    );
  };

  const removeTurno = (index) => {
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
    } catch {
      toast.error('Error al exportar backup');
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
      toast.error('Escribe RESTAURAR para confirmar');
      return;
    }

    try {
      if (dialog.type === 'import-backup') {
        const formData = new FormData();
        formData.append('backup', dialog.file);
        await api.post('/configuracion/backup/import', formData);
        toast.success('Backup restaurado correctamente. Recargando...');
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
    } catch {
      toast.error(
        dialog.type === 'import-backup' ? 'Error al importar backup' : 'Error al reiniciar'
      );
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
      </div>
    );
  }

  const tabs = [
    {
      id: 'general',
      label: 'General',
      icon: Building2,
      color: 'text-primary-500',
      bg: 'bg-primary-50',
    },
    {
      id: 'web',
      label: 'Web pública',
      icon: MonitorSmartphone,
      color: 'text-danger-600',
      bg: 'bg-danger-50',
    },
    { id: 'modulos', label: 'Módulos', icon: LayoutGrid, color: 'text-sky-600', bg: 'bg-sky-50' },
    {
      id: 'pagos',
      label: 'Pagos',
      icon: CreditCard,
      color: 'text-warning-600',
      bg: 'bg-warning-50',
    },
    {
      id: 'delivery',
      label: 'Delivery',
      icon: Truck,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      id: 'rider',
      label: 'Rider App',
      icon: Smartphone,
      color: 'text-primary-600',
      bg: 'bg-primary-50',
    },
    {
      id: 'alertas',
      label: 'Alertas y voz',
      icon: BellRing,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      id: 'impresion',
      label: 'Impresión',
      icon: Printer,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    { id: 'avanzado', label: 'Avanzado', icon: Settings, color: 'text-gray-600', bg: 'bg-gray-50' },
  ];

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20 px-4 md:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                      isActive
                        ? `${tab.bg} ${tab.color} ring-1 ring-inset ring-current/20`
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <Icon size={18} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex items-center justify-center gap-2 self-start rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary-200 transition-all hover:bg-[#4A74EF] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 xl:self-auto"
          >
            <Save size={18} />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <div className="mt-4">
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
          <SeccionModulos config={config} setToggle={setToggle} setConfig={setConfig} />
        )}
        {activeTab === 'web' && <SeccionWebPublica config={config} setConfig={setConfig} />}
        {activeTab === 'pagos' && (
          <SeccionPagos config={config} setConfig={setConfig} f={f} setToggle={setToggle} />
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
        {activeTab === 'rider' && <SeccionRider config={config} f={f} setConfig={setConfig} />}
        {activeTab === 'alertas' && <SeccionAlertas config={config} f={f} setConfig={setConfig} />}
        {activeTab === 'impresion' && (
          <SeccionImpresion config={config} f={f} setToggle={setToggle} setConfig={setConfig} />
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
        inputPlaceholder="Escribe RESTAURAR"
        inputValue={dialogInput}
        onInputChange={setDialogInput}
        onConfirm={confirmDialog}
        onClose={closeDialog}
      />
    </div>
  );
}
