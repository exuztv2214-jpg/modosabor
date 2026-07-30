import { useEffect, useState, useCallback, useRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import toast from 'react-hot-toast';
import {
  Gift,
  Star,
  RefreshCw,
  Save,
  Copy,
  Download,
  ExternalLink,
  Users,
  Award,
  ToggleLeft,
  ToggleRight,
  Stamp,
  TrendingUp,
  Crown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Pencil,
  X,
  ImagePlus,
  Trash2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import api from '../lib/api.js';
import ActionDialog from '../components/ActionDialog.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import { buildPublicAppUrl, getPublicAppUrlDiagnostics } from '../lib/publicUrls.js';
import { resolveAssetUrl } from '../lib/assets.js';
import { DEFAULT_BRAND_LOGO } from '../lib/webPublicaHelpers.js';

const fmtMoney = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;
const fmtNumber = (value) => Number(value || 0).toLocaleString('es-AR');
const LEVEL_COLORS = {
  Bronce: { bg: 'bg-warning-100', text: 'text-amber-800', dot: 'bg-warning-500' },
  Plata: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
  Oro: { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-500' },
  Platino: { bg: 'bg-primary-100', text: 'text-primary-500', dot: 'bg-primary-500' },
};

function getLevelColor(nivel) {
  if (!nivel) return { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  for (const [key, val] of Object.entries(LEVEL_COLORS)) {
    if (nivel.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-400' };
}

function Stat({ label, value, icon: Icon, tint = 'blue' }) {
  const tints = {
    blue: 'bg-primary-50 text-primary-500',
    emerald: 'bg-success-50 text-success-600',
    amber: 'bg-warning-50 text-warning-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all">
      <div className="flex items-center justify-between">
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            {label}
          </p>
          <p className="text-xl font-black text-gray-900 tracking-tight">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${tints[tint]}`}
        >
          <Icon size={18} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, action }) {
  return (
    <div className="rounded-[24px] border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-50 text-primary-500">
            <Icon size={16} strokeWidth={2.5} />
          </div>
          <h2 className="text-sm font-black uppercase tracking-wider text-gray-700">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function InputField({ label, id, hint, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-700">
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-[#5D87FF]/20"
        {...props}
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export default function Fidelizacion() {
  const { config: appConfig, refreshConfig } = useAppConfig();
  const publicAppDiagnostics = getPublicAppUrlDiagnostics(appConfig);
  const getClubBaseUrl = useCallback(() => buildPublicAppUrl('/club', appConfig), [appConfig]);
  const negocio = appConfig?.negocio_nombre || 'Modo Sabor';
  const brandingLogoUrl = resolveAssetUrl(appConfig?.negocio_logo || DEFAULT_BRAND_LOGO);
  const tarjetaFondoUrl = appConfig?.tarjeta_fidelidad_fondo
    ? resolveAssetUrl(appConfig.tarjeta_fidelidad_fondo)
    : '';
  const tarjetaFondoInputRef = useRef(null);
  const [uploadingTarjetaFondo, setUploadingTarjetaFondo] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [config, setConfig] = useState(null);
  const [niveles, setNiveles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateDialog, setRecalculateDialog] = useState(false);
  const [ajusteModal, setAjusteModal] = useState(null); // { cliente }
  const [ajusteForm, setAjusteForm] = useState({ delta_puntos: '', delta_sellos: '', motivo: '' });
  const [savingAjuste, setSavingAjuste] = useState(false);
  const [form, setForm] = useState({
    activo: false,
    pesos_por_punto: '',
    valor_punto_real: '',
    minimo_canje: '',
    dias_expiracion: '',
    sellos_para_premio: '',
    premio_descripcion: '',
    premio_producto_id: '',
    monto_minimo_sello: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgData, nivelesData, clientesData, productosData] = await Promise.allSettled([
        api.get('/fidelizacion/config'),
        api.get('/fidelizacion/niveles'),
        api.get('/clientes'),
        api.get('/productos?activo=1'),
      ]);

      if (cfgData.status === 'fulfilled') {
        const c = cfgData.value;
        setConfig(c);
        setForm({
          activo: !!c.activo,
          pesos_por_punto: c.pesos_por_punto ?? '',
          valor_punto_real: c.valor_punto_real ?? '',
          minimo_canje: c.minimo_canje ?? '',
          dias_expiracion: c.dias_expiracion ?? '',
          sellos_para_premio: c.sellos_para_premio ?? '',
          premio_descripcion: c.premio_descripcion ?? '',
          premio_producto_id: c.premio_producto_id ?? '',
          monto_minimo_sello: c.monto_minimo_sello ?? '',
        });
      }

      if (nivelesData.status === 'fulfilled') {
        setNiveles(Array.isArray(nivelesData.value) ? nivelesData.value : []);
      }

      if (clientesData.status === 'fulfilled') {
        setClientes(Array.isArray(clientesData.value) ? clientesData.value : []);
      }

      if (productosData.status === 'fulfilled') {
        setProductos(Array.isArray(productosData.value) ? productosData.value : []);
      }
    } catch {
      toast.error('Error al cargar datos de fidelización');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const stats = (() => {
    const conPuntos = clientes.filter((c) => (c.puntos || 0) > 0).length;
    const conSellos = clientes.filter((c) => (c.sellos_actuales || 0) > 0).length;
    const pendientes = clientes.reduce((acc, c) => acc + (c.recompensas_pendientes || 0), 0);
    const totalPuntos = clientes.reduce((acc, c) => acc + (c.puntos || 0), 0);
    return { conPuntos, conSellos, pendientes, totalPuntos };
  })();

  const topClientes = [...clientes].sort((a, b) => (b.puntos || 0) - (a.puntos || 0)).slice(0, 20);

  async function copyClubLink(url, label = 'Enlace copiado') {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(label);
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  }

  function printClubPoster() {
    if (typeof window === 'undefined') return;
    const clubUrl = getClubBaseUrl();
    const qrSvg = renderToStaticMarkup(
      <QRCodeSVG value={clubUrl} size={220} bgColor="#ffffff" fgColor="#111827" includeMargin />
    );
    const popup = window.open('', '_blank', 'width=900,height=1200');
    if (!popup) {
      toast.error('No se pudo abrir la vista de impresión');
      return;
    }

    popup.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>QR Club Fidelidad - ${negocio}</title>
          <style>
            * { box-sizing: border-box; }
            @page { size: A4 portrait; margin: 12mm; }
            html, body {
              margin: 0;
              padding: 0;
              background: #f7f1ec;
              font-family: Inter, Arial, Helvetica, sans-serif;
              color: #111827;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 16px;
            }
            .sheet {
              width: 100%;
              max-width: 780px;
              background:
                radial-gradient(circle at top right, rgba(200,29,37,0.20), transparent 26%),
                radial-gradient(circle at bottom left, rgba(245,158,11,0.12), transparent 20%),
                linear-gradient(180deg, #fffdfa 0%, #fff4ef 100%);
              border: 1px solid #f0ddd6;
              border-radius: 28px;
              padding: 28px;
              box-shadow: 0 18px 50px rgba(32, 15, 12, 0.12);
            }
            .hero {
              display: grid;
              grid-template-columns: 1.1fr 0.9fr;
              gap: 24px;
              align-items: center;
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 16px;
            }
            .logo {
              width: 82px;
              height: 82px;
              border-radius: 24px;
              background: #fff;
              border: 1px solid #f1dfd7;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              box-shadow: 0 10px 24px rgba(200,29,37,0.12);
            }
            .logo img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              padding: 8px;
            }
            .eyebrow {
              font-size: 12px;
              font-weight: 900;
              letter-spacing: .28em;
              text-transform: uppercase;
              color: #c81d25;
            }
            h1 {
              margin: 10px 0 0;
              font-size: 46px;
              line-height: .95;
              font-weight: 900;
              letter-spacing: -.03em;
            }
            .lead {
              margin-top: 18px;
              font-size: 18px;
              line-height: 1.6;
              color: #5f636d;
              font-weight: 600;
            }
            .qr-card {
              background: white;
              border: 1px solid #f1dfd7;
              border-radius: 28px;
              padding: 20px;
              text-align: center;
              box-shadow: 0 12px 24px rgba(200,29,37,0.10);
            }
            .qr-wrap {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              padding: 12px;
              border-radius: 22px;
              background: #fff8f4;
              border: 1px solid #f4e2db;
            }
            .pill {
              display: inline-block;
              margin-top: 14px;
              padding: 8px 14px;
              border-radius: 999px;
              background: #fff1f2;
              border: 1px solid #f4c7cb;
              color: #8f1018;
              font-size: 11px;
              font-weight: 900;
              letter-spacing: .18em;
              text-transform: uppercase;
            }
            .url {
              margin-top: 14px;
              font-size: 12px;
              line-height: 1.5;
              font-weight: 700;
              color: #64748b;
              word-break: break-word;
            }
            .steps {
              margin-top: 24px;
              display: grid;
              grid-template-columns: repeat(3, minmax(0,1fr));
              gap: 16px;
            }
            .step {
              background: rgba(255,255,255,0.92);
              border: 1px solid #f1dfd7;
              border-radius: 22px;
              padding: 16px;
              min-height: 118px;
            }
            .step-k {
              font-size: 11px;
              font-weight: 900;
              letter-spacing: .2em;
              text-transform: uppercase;
              color: #c81d25;
            }
            .step-v {
              margin-top: 10px;
              font-size: 17px;
              line-height: 1.35;
              font-weight: 800;
              color: #111827;
            }
            .footer {
              margin-top: 20px;
              padding-top: 18px;
              border-top: 1px solid #f1dfd7;
              display: flex;
              justify-content: space-between;
              gap: 14px;
              font-size: 12px;
              font-weight: 800;
              color: #7c6f69;
            }
            @media print {
              body { background: #fff; padding: 0; }
              .sheet { box-shadow: none; max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="hero">
              <div>
                <div class="brand">
                  <div class="logo">
                    <img src="${brandingLogoUrl}" alt="${negocio}" />
                  </div>
                  <div>
                    <div class="eyebrow">Club fidelidad</div>
                    <h1>${negocio}</h1>
                  </div>
                </div>
                <div class="lead">
                  Escaneá este código para completar tu ficha, activar tu tarjeta virtual
                  y empezar a sumar puntos, sellos y premios en el club de ${negocio}.
                </div>
              </div>
              <div class="qr-card">
                <div class="qr-wrap">${qrSvg}</div>
                <div class="pill">Escaneá y completá tu ficha</div>
                <div class="url">${clubUrl}</div>
              </div>
            </div>
            <div class="steps">
              <div class="step">
                <div class="step-k">Paso 1</div>
                <div class="step-v">Escaneás el QR desde tu celular.</div>
              </div>
              <div class="step">
                <div class="step-k">Paso 2</div>
                <div class="step-v">Ingresás tu teléfono y completás tus datos.</div>
              </div>
              <div class="step">
                <div class="step-k">Paso 3</div>
                <div class="step-v">Recibís tu tarjeta virtual y seguís sumando beneficios.</div>
              </div>
            </div>
            <div class="footer">
              <span>Ideal para mostrador, caja y WhatsApp</span>
              <span>${negocio}</span>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.onafterprint = () => setTimeout(() => window.close(), 400);
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    popup.document.close();
  }

  async function handleSaveConfig(e) {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await api.put('/fidelizacion/config', {
        activo: form.activo ? 1 : 0,
        pesos_por_punto: Number(form.pesos_por_punto) || 0,
        valor_punto_real: Number(form.valor_punto_real) || 0,
        minimo_canje: Number(form.minimo_canje) || 0,
        dias_expiracion: Number(form.dias_expiracion) || 0,
        sellos_para_premio: Number(form.sellos_para_premio) || 0,
        premio_descripcion: form.premio_descripcion,
        premio_producto_id: form.premio_producto_id ? Number(form.premio_producto_id) : null,
        monto_minimo_sello: Number(form.monto_minimo_sello) || 0,
      });
      toast.success('Configuración guardada');
      loadAll();
    } catch (err) {
      toast.error(err?.message || 'Error al guardar configuración');
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleTarjetaFondoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingTarjetaFondo(true);
    const formData = new FormData();
    formData.append('tarjeta_fidelidad_fondo', file);
    try {
      const updated = await api.put('/configuracion', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshConfig(updated);
      toast.success('Imagen de la tarjeta actualizada');
    } catch (error) {
      toast.error(error?.error || 'No se pudo subir la imagen');
    } finally {
      setUploadingTarjetaFondo(false);
      event.target.value = '';
    }
  }

  async function handleTarjetaFondoRemove() {
    setUploadingTarjetaFondo(true);
    try {
      const updated = await api.post('/configuracion/bulk', {
        config: { tarjeta_fidelidad_fondo: '' },
      });
      await refreshConfig(updated);
      toast.success('Se quitó la imagen personalizada');
    } catch (error) {
      toast.error(error?.error || 'No se pudo quitar la imagen');
    } finally {
      setUploadingTarjetaFondo(false);
    }
  }

  async function handleRecalcular() {
    setRecalculateDialog(true);
  }

  async function confirmarRecalcular() {
    setRecalculating(true);
    try {
      await api.post('/fidelizacion/niveles/recalcular');
      toast.success('Niveles recalculados correctamente');
      setRecalculateDialog(false);
      loadAll();
    } catch (err) {
      toast.error(err?.message || 'Error al recalcular niveles');
    } finally {
      setRecalculating(false);
    }
  }

  async function handleAjuste(e) {
    e.preventDefault();
    if (!ajusteModal) return;
    setSavingAjuste(true);
    try {
      await api.post('/fidelizacion/puntos/ajuste-manual', {
        cliente_id: ajusteModal.cliente.id,
        delta_puntos: Number(ajusteForm.delta_puntos) || 0,
        delta_sellos: Number(ajusteForm.delta_sellos) || 0,
        motivo: ajusteForm.motivo || 'Ajuste manual',
      });
      toast.success('Ajuste aplicado correctamente');
      setAjusteModal(null);
      setAjusteForm({ delta_puntos: '', delta_sellos: '', motivo: '' });
      loadAll();
    } catch (err) {
      toast.error(err?.message || 'Error al aplicar ajuste');
    } finally {
      setSavingAjuste(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Programa de Fidelización
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestiona sellos, puntos y niveles de recompensa para tus clientes
          </p>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Clientes con puntos"
          value={fmtNumber(stats.conPuntos)}
          icon={Users}
          tint="blue"
        />
        <Stat
          label="Clientes con sellos"
          value={fmtNumber(stats.conSellos)}
          icon={Stamp}
          tint="amber"
        />
        <Stat
          label="Premios pendientes"
          value={fmtNumber(stats.pendientes)}
          icon={Gift}
          tint="emerald"
        />
        <Stat
          label="Total puntos activos"
          value={fmtNumber(stats.totalPuntos)}
          icon={TrendingUp}
          tint="violet"
        />
      </div>

      {/* Config + Niveles grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Config panel */}
        <SectionCard title="Configuración del programa" icon={Star}>
          <form onSubmit={handleSaveConfig} className="space-y-4">
            {/* Toggle activo */}
            <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-700">Programa activo</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {form.activo
                    ? 'Los clientes acumulan puntos y sellos'
                    : 'El programa está pausado'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, activo: !f.activo }))}
                className="transition-colors"
                aria-pressed={form.activo}
              >
                {form.activo ? (
                  <ToggleRight size={36} className="text-primary-500" strokeWidth={1.5} />
                ) : (
                  <ToggleLeft size={36} className="text-gray-300" strokeWidth={1.5} />
                )}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Pesos por punto"
                id="pesos_por_punto"
                type="number"
                min="1"
                value={form.pesos_por_punto}
                onChange={(e) => setForm((f) => ({ ...f, pesos_por_punto: e.target.value }))}
                placeholder="Ej: 100"
                hint="Cuánto debe gastar el cliente para sumar 1 punto"
              />
              <InputField
                label="Valor real por punto ($)"
                id="valor_punto_real"
                type="number"
                min="0"
                step="0.01"
                value={form.valor_punto_real}
                onChange={(e) => setForm((f) => ({ ...f, valor_punto_real: e.target.value }))}
                placeholder="Ej: 10"
                hint="Valor interno estimado para reportes y canjes"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Minimo de canje (pts)"
                id="minimo_canje"
                type="number"
                min="1"
                value={form.minimo_canje}
                onChange={(e) => setForm((f) => ({ ...f, minimo_canje: e.target.value }))}
                placeholder="Ej: 50"
                hint="Puntos mínimos para poder canjear"
              />
              <InputField
                label="Expiracion de puntos (dias)"
                id="dias_expiracion"
                type="number"
                min="1"
                value={form.dias_expiracion}
                onChange={(e) => setForm((f) => ({ ...f, dias_expiracion: e.target.value }))}
                placeholder="Ej: 180"
                hint="Días antes de que venzan los puntos"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                label="Sellos para premio"
                id="sellos_para_premio"
                type="number"
                min="1"
                value={form.sellos_para_premio}
                onChange={(e) => setForm((f) => ({ ...f, sellos_para_premio: e.target.value }))}
                placeholder="Ej: 10"
                hint="Cantidad de sellos para canjear un premio"
              />
              <InputField
                label="Monto mínimo por sello ($)"
                id="monto_minimo_sello"
                type="number"
                min="0"
                step="0.01"
                value={form.monto_minimo_sello}
                onChange={(e) => setForm((f) => ({ ...f, monto_minimo_sello: e.target.value }))}
                placeholder="Ej: 1000"
                hint="Compra mínima para otorgar un sello"
              />
            </div>

            <InputField
              label="Premio (descripción)"
              id="premio_descripcion"
              type="text"
              value={form.premio_descripcion}
              onChange={(e) => setForm((f) => ({ ...f, premio_descripcion: e.target.value }))}
              placeholder="Ej: Bebida gratis, 10% de descuento..."
              hint="Descripción del premio que recibirán los clientes"
            />

            <div>
              <label
                htmlFor="premio_producto_id"
                className="mb-1.5 block text-sm font-semibold text-gray-700"
              >
                Producto premio real
              </label>
              <select
                id="premio_producto_id"
                value={form.premio_producto_id}
                onChange={(e) => setForm((f) => ({ ...f, premio_producto_id: e.target.value }))}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-[#5D87FF]/20"
              >
                <option value="">Sin producto vinculado</option>
                {productos.map((producto) => (
                  <option key={producto.id} value={producto.id}>
                    {producto.nombre}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                Si lo eliges, al canjear el premio desde TPV se podrá cargar el producto gratis en
                la venta.
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
              <input
                ref={tarjetaFondoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleTarjetaFondoUpload}
              />
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">Imagen de la tarjeta (frente)</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Subí tu propio diseño (igual que una tarjeta de presentación) y lo usamos como
                    frente de la tarjeta virtual en la página del club. El dorso muestra los sellos
                    y el QR automáticamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => tarjetaFondoInputRef?.current?.click()}
                  disabled={uploadingTarjetaFondo}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4A74EF] disabled:opacity-50"
                >
                  <ImagePlus size={16} />
                  {uploadingTarjetaFondo
                    ? 'Subiendo...'
                    : tarjetaFondoUrl
                      ? 'Reemplazar'
                      : 'Subir imagen'}
                </button>
              </div>
              <div className="mt-4 flex items-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-white p-4">
                <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
                  {tarjetaFondoUrl ? (
                    <img
                      src={tarjetaFondoUrl}
                      alt="Frente de la tarjeta"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImagePlus className="text-gray-400" size={20} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-700">Vista actual</p>
                  <p className="truncate text-xs text-gray-500">
                    {tarjetaFondoUrl
                      ? 'Diseño personalizado activo'
                      : 'Sin imagen propia: se usa el diseño por defecto'}
                  </p>
                </div>
                {tarjetaFondoUrl && (
                  <button
                    type="button"
                    onClick={handleTarjetaFondoRemove}
                    disabled={uploadingTarjetaFondo}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-danger-600 transition hover:bg-danger-50 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                    Quitar
                  </button>
                )}
              </div>
            </div>

            {config && (
              <div className="rounded-2xl bg-primary-50 px-4 py-3 text-xs text-primary-500 space-y-1">
                {config.pesos_por_punto != null && (
                  <p>
                    <span className="font-bold">Pesos por punto:</span>{' '}
                    {fmtNumber(config.pesos_por_punto)}
                  </p>
                )}
                {config.valor_punto_real != null && (
                  <p>
                    <span className="font-bold">Valor de 1 punto:</span>{' '}
                    {fmtMoney(config.valor_punto_real)}
                  </p>
                )}
                {config.minimo_canje != null && (
                  <p>
                    <span className="font-bold">Mínimo de canje:</span>{' '}
                    {fmtNumber(config.minimo_canje)} puntos
                  </p>
                )}
                {config.premio_producto_id ? (
                  <p>
                    <span className="font-bold">Producto premio:</span>{' '}
                    {productos.find((item) => Number(item.id) === Number(config.premio_producto_id))
                      ?.nombre || `#${config.premio_producto_id}`}
                  </p>
                ) : null}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingConfig}
                className="flex items-center gap-2 rounded-2xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#4a6ee0] disabled:opacity-60"
              >
                {savingConfig ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {savingConfig ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </SectionCard>

        {/* Niveles */}
        <SectionCard
          title="Niveles de clientes"
          icon={Crown}
          action={
            <button
              onClick={handleRecalcular}
              disabled={recalculating}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw size={13} className={recalculating ? 'animate-spin' : ''} />
              {recalculating ? 'Recalculando...' : 'Recalcular'}
            </button>
          }
        >
          {niveles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Award size={36} className="mb-2 opacity-40" />
              <p className="text-sm font-medium">No hay niveles configurados</p>
              <p className="text-xs text-gray-400 mt-1">Configura niveles en el backend</p>
            </div>
          ) : (
            <div className="space-y-3">
              {niveles.map((nivel, idx) => {
                const colors = getLevelColor(nivel.nombre);
                return (
                  <div
                    key={nivel.id ?? idx}
                    className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3"
                  >
                    <span className={`flex h-2.5 w-2.5 flex-shrink-0 rounded-full ${colors.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black ${colors.text}`}>{nivel.nombre}</p>
                      {(nivel.puntos_minimos != null || nivel.puntos_maximos != null) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {nivel.puntos_minimos != null ? fmtNumber(nivel.puntos_minimos) : '0'}
                          {nivel.puntos_maximos != null
                            ? ` – ${fmtNumber(nivel.puntos_maximos)}`
                            : '+'}{' '}
                          pts
                        </p>
                      )}
                      {nivel.descripcion && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{nivel.descripcion}</p>
                      )}
                    </div>
                    {nivel.beneficio && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors.bg} ${colors.text}`}
                      >
                        {nivel.beneficio}
                      </span>
                    )}
                    <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-gray-400">
            Recalcula para asignar el nivel correcto a todos los clientes según sus puntos
            acumulados.
          </p>
        </SectionCard>
      </div>

      <SectionCard
        title="Tarjeta y QR para clientes"
        icon={Star}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => copyClubLink(getClubBaseUrl(), 'Enlace general copiado')}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-gray-500 hover:border-primary-500/30 hover:bg-primary-50 hover:text-primary-500"
            >
              <Copy size={13} />
              Copiar enlace
            </button>
            <button
              type="button"
              onClick={printClubPoster}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-gray-500 hover:border-primary-500/30 hover:bg-primary-50 hover:text-primary-500"
            >
              <Download size={13} />
              Imprimir QR
            </button>
          </div>
        }
      >
        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-[32px] border border-primary-100 bg-[linear-gradient(135deg,#fff8f5_0%,#fff2ec_100%)] shadow-sm">
            <div className="border-b border-primary-100 px-6 py-5">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary-500">
                Para mostrador, caja y WhatsApp
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-gray-900">
                Alta rápida al club con un solo QR
              </h3>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-gray-600">
                El cliente escanea, completa su ficha y el sistema intenta vincularlo con su
                historial por teléfono. Si ya existe, sigue con la misma tarjeta. Si no existe, lo
                crea sin duplicados.
              </p>
            </div>

            <div className="grid gap-5 p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-sm">
                <div className="flex justify-center rounded-[24px] border border-primary-100 bg-[#fff8f4] p-4">
                  <QRCodeSVG
                    value={getClubBaseUrl()}
                    size={180}
                    bgColor="#ffffff"
                    fgColor="#111827"
                    includeMargin
                  />
                </div>
                <div className="mt-4 rounded-full bg-primary-50 px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.22em] text-primary-500">
                  Escaneá y completá tu ficha
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/80 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                    Enlace general del club
                  </p>
                  <p className="mt-2 break-all text-sm font-bold leading-6 text-gray-800">
                    {getClubBaseUrl()}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-white/80 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-500">
                      Paso 1
                    </p>
                    <p className="mt-2 text-sm font-black leading-6 text-gray-900">
                      El cliente escanea el QR desde cualquier celular.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-500">
                      Paso 2
                    </p>
                    <p className="mt-2 text-sm font-black leading-6 text-gray-900">
                      Ingresa su teléfono, nombre y completa datos faltantes.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-white/80 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-500">
                      Paso 3
                    </p>
                    <p className="mt-2 text-sm font-black leading-6 text-gray-900">
                      Ya queda con tarjeta virtual lista para puntos, sellos y premios.
                    </p>
                  </div>
                </div>

                {publicAppDiagnostics.warning ? (
                  <div className="rounded-[24px] border border-amber-100 bg-warning-50 px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-warning-600">
                      Revisar URL pública
                    </p>
                    <p className="mt-2 text-xs font-bold leading-5 text-amber-800">
                      {publicAppDiagnostics.warning}
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => copyClubLink(getClubBaseUrl(), 'Enlace general copiado')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-primary-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-sm hover:brightness-105"
                  >
                    <Copy size={14} />
                    Copiar enlace
                  </button>
                  <button
                    type="button"
                    onClick={printClubPoster}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50"
                  >
                    <Download size={14} />
                    Imprimir QR
                  </button>
                  <a
                    href={getClubBaseUrl()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50"
                  >
                    <ExternalLink size={14} />
                    Abrir club
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                Qué resuelve
              </p>
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold leading-6 text-gray-700">
                  Evita cargar clientes a mano una y otra vez.
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold leading-6 text-gray-700">
                  Permite recuperar fichas desde WhatsApp usando el teléfono.
                </div>
                <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold leading-6 text-gray-700">
                  Deja lista la tarjeta virtual para compartir, guardar o imprimir.
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-primary-100 bg-primary-50/60 p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-500">
                Recomendación
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-gray-800">
                Conviene imprimir este QR en caja o dentro de una tarjeta física de fidelidad para
                que el cliente complete solo su ficha y vos ya lo recibas ordenado en Clientes.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Top clientes */}
      <SectionCard title="Top clientes por puntos" icon={TrendingUp}>
        <div className="overflow-x-auto -mx-6 -mb-6">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  #
                </th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Cliente
                </th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Teléfono
                </th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Nivel
                </th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400 text-right">
                  Puntos
                </th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400 text-right">
                  Sellos
                </th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400 text-right">
                  Premios
                </th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {topClientes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Users className="mx-auto mb-2 text-gray-200" size={32} />
                    <p className="text-sm text-gray-400">No hay clientes registrados</p>
                  </td>
                </tr>
              ) : (
                topClientes.map((c, idx) => {
                  const colors = getLevelColor(c.nivel);
                  const hasPremio = (c.recompensas_pendientes || 0) > 0;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">
                        <span
                          className={`text-sm font-black ${idx < 3 ? 'text-primary-500' : 'text-gray-300'}`}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 leading-tight">{c.nombre}</p>
                        {c.email && <p className="text-xs text-gray-400 mt-0.5">{c.email}</p>}
                        {c.codigo_tarjeta ? (
                          <p className="mt-1 text-[11px] font-black uppercase tracking-wider text-primary-500">
                            {c.codigo_tarjeta}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{c.telefono || '—'}</td>
                      <td className="px-4 py-3">
                        {c.nivel ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${colors.bg} ${colors.text}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
                            {c.nivel}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">Sin nivel</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-black text-gray-900">{fmtNumber(c.puntos || 0)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-gray-700">
                          {c.sellos_actuales || 0}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasPremio ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-bold text-success-700">
                            <CheckCircle size={11} />
                            {c.recompensas_pendientes}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {c.codigo_tarjeta ? (
                            <button
                              type="button"
                              onClick={() =>
                                copyClubLink(
                                  `${getClubBaseUrl()}/${encodeURIComponent(c.codigo_tarjeta)}`,
                                  'Enlace individual copiado'
                                )
                              }
                              className="rounded-xl bg-gray-100 p-1.5 text-gray-400 hover:bg-success-50 hover:text-success-600 transition-colors"
                              title="Copiar enlace individual"
                            >
                              <Copy size={13} />
                            </button>
                          ) : null}
                          <button
                            onClick={() => {
                              setAjusteModal({ cliente: c });
                              setAjusteForm({ delta_puntos: '', delta_sellos: '', motivo: '' });
                            }}
                            className="rounded-xl bg-gray-100 p-1.5 text-gray-400 hover:bg-primary-50 hover:text-primary-500 transition-colors"
                            title="Ajustar puntos/sellos"
                          >
                            <Pencil size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Modal ajuste manual */}
      {ajusteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-base font-black text-gray-900">Ajuste manual</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {ajusteModal.cliente.nombre} — Puntos actuales:{' '}
                  <strong>{fmtNumber(ajusteModal.cliente.puntos || 0)}</strong> · Sellos:{' '}
                  <strong>{ajusteModal.cliente.sellos_actuales || 0}</strong>
                </p>
              </div>
              <button
                onClick={() => setAjusteModal(null)}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAjuste} className="space-y-4 px-6 py-5">
              <p className="text-xs text-gray-400 rounded-xl bg-warning-50 border border-amber-100 px-3 py-2 text-warning-700 font-medium">
                Usá valores positivos para sumar y negativos para restar (ej: -5 quita 5 sellos).
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Δ Puntos
                  </label>
                  <input
                    type="number"
                    value={ajusteForm.delta_puntos}
                    onChange={(e) => setAjusteForm((f) => ({ ...f, delta_puntos: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-[#5D87FF]/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Δ Sellos
                  </label>
                  <input
                    type="number"
                    value={ajusteForm.delta_sellos}
                    onChange={(e) => setAjusteForm((f) => ({ ...f, delta_sellos: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-[#5D87FF]/20"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                  Motivo (para el historial)
                </label>
                <input
                  type="text"
                  required
                  value={ajusteForm.motivo}
                  onChange={(e) => setAjusteForm((f) => ({ ...f, motivo: e.target.value }))}
                  placeholder="Ej: Compensación por error, Promoción especial..."
                  className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-[#5D87FF]/20"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAjusteModal(null)}
                  className="flex-1 h-12 rounded-2xl border border-gray-200 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAjuste || (!ajusteForm.delta_puntos && !ajusteForm.delta_sellos)}
                  className="flex-[2] h-12 rounded-2xl bg-primary-500 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 hover:bg-blue-600 disabled:opacity-50 transition-all"
                >
                  {savingAjuste ? 'Guardando...' : 'Aplicar ajuste'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ActionDialog
        open={recalculateDialog}
        title="Recalcular niveles"
        description="Se volverán a calcular los niveles de fidelización para todos los clientes. Puede tardar unos segundos."
        confirmLabel="Recalcular"
        cancelLabel="Cancelar"
        tone="warning"
        loading={recalculating}
        onConfirm={confirmarRecalcular}
        onClose={() => setRecalculateDialog(false)}
      />
    </div>
  );
}
