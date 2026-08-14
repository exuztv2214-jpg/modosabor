import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { AlertTriangle, Gift, MessageCircle, Phone, Star, UserRound } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

import api from '../../lib/api.js';
import { useAppConfig } from '../../context/AppConfigContext.jsx';
import { resolveAssetUrl } from '../../lib/assets.js';
import { buildPublicAppUrl, getPublicAppUrlDiagnostics } from '../../lib/publicUrls.js';
import { DEFAULT_BRAND_LOGO } from '../../lib/webPublicaHelpers.js';
import { fmtMoney } from '../../lib/formatters.js';
import {
  LOCAL_AVATARS,
  avatarTokenAleatorio,
  avatarTokenPorDefecto,
  normalizarSegmento,
  segmentoTono,
} from './clientesUi.jsx';

// Las doce fotos ahora viven en `clientesUi.jsx`, que es donde también está
// el fallback determinístico por id.

// `CONTROL` y `LEVEL_COLORS` vivían acá y además estaban duplicados en
// `ClientesHeader` con valores distintos. Ahora salen de `clientesUi.jsx`.

const DEFAULT_CAMPAIGN_DASHBOARD = {
  campanas: 0,
  clientes: 0,
  enviados_ok: 0,
  convertidos: 0,
  ingreso: 0,
  tasa_conversion: 0,
  tasa_envio: 0,
};

const CAMPAIGN_HISTORY_FILTERS = [
  { value: 'Todos', label: 'Todos' },
  { value: 'Convertidas', label: 'Convertidas' },
  { value: 'Sin convertir', label: 'Sin convertir' },
  { value: 'Con error', label: 'Con error' },
];

const SEGMENT_CAMPAIGN_COPY = {
  'premio-listo': {
    filter: 'premio-listo',
    title: 'Premio listo',
    message: (negocio) =>
      `Hola, tienes un premio listo para canjear en ${negocio}. Cuando quieras, te ayudamos a aprovecharlo.`,
  },
  vip: {
    filter: 'vip',
    title: 'VIP',
    message: (negocio) =>
      `Hola, queremos agradecerte por ser cliente VIP de ${negocio}. Tenemos un beneficio especial preparado para ti.`,
  },
  riesgo: {
    filter: 'riesgo',
    title: 'En riesgo',
    message: (negocio) =>
      `Hola, te extrañamos en ${negocio}. Queremos invitarte a volver con una propuesta especial.`,
  },
  nuevo: {
    filter: 'nuevo',
    title: 'Nuevos',
    message: (negocio) =>
      `Hola, gracias por sumarte a ${negocio}. Queremos darte la bienvenida con un beneficio especial.`,
  },
};

const summarizeCampaignMetrics = (results = [], totalClientes = 0) => {
  const safeResults = Array.isArray(results) ? results : [];
  const enviadosOk = safeResults.filter((item) => item?.ok).length;
  const enviadosError = safeResults.length - enviadosOk;
  const enviadosManual = safeResults.filter((item) => item?.mode === 'manual').length;
  const enviadosApi = safeResults.filter((item) => item?.mode === 'api').length;
  const enviadosLocal = safeResults.filter((item) => item?.mode === 'local').length;
  const total = Number(totalClientes || safeResults.length || 0);
  const cobertura = total > 0 ? Number(((safeResults.length / total) * 100).toFixed(1)) : 0;
  const tasaEnvio =
    safeResults.length > 0 ? Number(((enviadosOk / safeResults.length) * 100).toFixed(1)) : 0;

  return {
    total_clientes: total,
    procesados: safeResults.length,
    enviados_ok: enviadosOk,
    enviados_error: enviadosError,
    enviados_manual: enviadosManual,
    enviados_api: enviadosApi,
    enviados_local: enviadosLocal,
    cobertura,
    tasa_envio: tasaEnvio,
    clientes_convertidos: 0,
    pedidos_generados: 0,
    ingreso_generado: 0,
    tasa_conversion: 0,
    ventana_dias: 30,
  };
};

const aggregateCampaignDashboard = (history = [], fallback = DEFAULT_CAMPAIGN_DASHBOARD) => {
  if (!history.length) return fallback;

  const summary = history.reduce(
    (acc, item) => {
      acc.campanas += 1;
      acc.clientes += Number(item.metricas?.total_clientes || item.total_clientes || 0);
      acc.enviados_ok += Number(item.metricas?.enviados_ok || item.enviados_ok || 0);
      acc.convertidos += Number(item.metricas?.clientes_convertidos || 0);
      acc.ingreso += Number(item.metricas?.ingreso_generado || 0);
      return acc;
    },
    { ...DEFAULT_CAMPAIGN_DASHBOARD }
  );

  return {
    ...summary,
    tasa_conversion:
      summary.clientes > 0
        ? Number(((summary.convertidos / summary.clientes) * 100).toFixed(1))
        : 0,
    tasa_envio:
      summary.clientes > 0
        ? Number(((summary.enviados_ok / summary.clientes) * 100).toFixed(1))
        : 0,
  };
};

const matchesHistoryFilter = (item, filter) => {
  if (filter === 'Convertidas') return Number(item.metricas?.clientes_convertidos || 0) > 0;
  if (filter === 'Sin convertir') return Number(item.metricas?.clientes_convertidos || 0) === 0;
  if (filter === 'Con error')
    return Number(item.metricas?.enviados_error || item.enviados_error || 0) > 0;
  return true;
};

const EMPTY_FORM = {
  nombre: '',
  telefono: '',
  direccion: '',
  fecha_nacimiento: '',
  notas: '',
  avatar_url: '',
  fidelizacion_activa: true,
};

// El filtro de estado ahora guarda la clave del segmento, no su etiqueta:
// antes convivían 'En riesgo' (filtro) y 'riesgo' / 'en-riesgo' (estado) y
// había que traducir entre los tres en cada comparación.
const SEGMENTO_TO_FILTRO = {
  vip: 'vip',
  riesgo: 'riesgo',
  perdidos: 'perdido',
  inactivos: 'por-reactivar',
  recurrentes: 'recurrente',
  cumpleMes: 'Todos',
};

export function useClientes() {
  const { config: branding } = useAppConfig();
  const brandingLogoUrl = resolveAssetUrl(branding.negocio_logo || DEFAULT_BRAND_LOGO);
  const publicAppDiagnostics = useMemo(() => getPublicAppUrlDiagnostics(branding), [branding]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [clientes, setClientes] = useState([]);
  const [search, setSearch] = useState('');
  const [filtroNivel, setFiltroNivel] = useState('Todos');
  const [filtroEstado, setFiltroEstado] = useState(() => {
    const seg = searchParams.get('segmento');
    return seg && SEGMENTO_TO_FILTRO[seg] ? SEGMENTO_TO_FILTRO[seg] : 'Todos';
  });
  const [filtroBeneficio, setFiltroBeneficio] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [modal, setModal] = useState(null);
  const [configModal, setConfigModal] = useState(false);
  const [campaignModal, setCampaignModal] = useState(null);
  const [campaignMessage, setCampaignMessage] = useState('');
  const [campaignTemplates, setCampaignTemplates] = useState({});
  const [campaignHistory, setCampaignHistory] = useState([]);
  const [campaignDashboard, setCampaignDashboard] = useState(null);
  const [campaignSegmentStats, setCampaignSegmentStats] = useState([]);
  const [campaignTopCampaign, setCampaignTopCampaign] = useState(null);
  const [campaignHistoryFilter, setCampaignHistoryFilter] = useState('Todos');
  const [campaignVariables, setCampaignVariables] = useState([]);
  const [campaignSending, setCampaignSending] = useState(false);
  const [canManageFidelidadConfig, setCanManageFidelidadConfig] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [rewardDialog, setRewardDialog] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fidelidadConfig, setFidelidadConfig] = useState({
    monto_minimo_sello: 10000,
    sellos_para_premio: 7,
    premio_descripcion: '1 Pizza Muzzarella',
    activo: true,
  });
  const fileInputRef = useRef(null);
  const sellosParaPremio = Math.max(1, Number(fidelidadConfig.sellos_para_premio) || 1);

  const formatPedidoDate = (value) => {
    if (!value) return 'Fecha sin registrar';
    try {
      return format(parseISO(value), 'dd MMM yyyy');
    } catch {
      return 'Fecha inválida';
    }
  };

  const getDaysSince = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  };

  /**
   * Segmento del cliente, siempre normalizado.
   *
   * El backend manda `estado_segmento` y acá había un fallback que usaba otro
   * vocabulario: devolvía `en-riesgo` mientras el server decía `riesgo`. Cada
   * filtro y cada tarjeta tenían que acordarse de chequear las dos formas, y
   * más de una se olvidaba. Ahora sale una sola clave canónica.
   */
  const getClienteEstado = useCallback((cliente) => {
    if (cliente?.estado_segmento) return normalizarSegmento(cliente.estado_segmento);
    const dias = getDaysSince(cliente?.ultima_compra);
    if (dias == null) return 'nuevo';
    if (dias >= 30) return 'riesgo';
    if (dias >= 15) return 'por-reactivar';
    return 'activo';
  }, []);

  const getPrimaryPhoneLink = (telefono) => `tel:${String(telefono || '').replace(/\D/g, '')}`;
  const getWhatsAppLink = (telefono, mensaje = '') => {
    const number = String(telefono || '').replace(/\D/g, '');
    if (!number) return '#';
    const base = `https://wa.me/${number}`;
    return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base;
  };

  const buildActivityTimeline = (cliente) => {
    const items = [];

    if (cliente.recompensas_pendientes > 0) {
      items.push({
        id: 'reward-ready',
        title: 'Premio disponible',
        subtitle: `${cliente.recompensas_pendientes} recompensa${
          cliente.recompensas_pendientes > 1 ? 's' : ''
        } lista${cliente.recompensas_pendientes > 1 ? 's' : ''} para canjear`,
        tone: 'emerald',
      });
    }

    if (cliente.ultima_compra) {
      const dias = getDaysSince(cliente.ultima_compra);
      items.push({
        id: 'last-order',
        title: 'Última compra',
        subtitle: `${formatPedidoDate(cliente.ultima_compra)}${
          dias != null ? ` · hace ${dias} día${dias === 1 ? '' : 's'}` : ''
        }`,
        tone: 'blue',
      });
    }

    if (cliente.fecha_nacimiento) {
      const birthMonthDay = String(cliente.fecha_nacimiento).slice(5, 10);
      const todayMonthDay = new Date().toISOString().slice(5, 10);
      items.push({
        id: 'birthday',
        title: birthMonthDay === todayMonthDay ? 'Cumple hoy' : 'Cumple registrado',
        subtitle: cliente.fecha_nacimiento,
        tone: birthMonthDay === todayMonthDay ? 'amber' : 'sky',
      });
    }

    if (!cliente.fidelizacion_activa) {
      items.push({
        id: 'loyalty-off',
        title: 'Fidelización desactivada',
        subtitle: 'Este cliente no está acumulando beneficios en este momento',
        tone: 'rose',
      });
    }

    return items;
  };

  const getTimelineTone = (tone) => {
    if (tone === 'emerald') return 'bg-success-50 text-success-600 border-emerald-100';
    if (tone === 'amber') return 'bg-warning-50 text-amber-500 border-amber-100';
    if (tone === 'rose') return 'bg-danger-50 text-rose-500 border-rose-100';
    if (tone === 'sky') return 'bg-sky-50 text-sky-500 border-sky-100';
    return 'bg-info-50 text-info-600 border-info-100';
  };

  const getRecoveryMessage = (cliente) => {
    if (!cliente) return '';
    const estado = getClienteEstado(cliente);
    if (estado === 'en-riesgo') {
      return `Hola ${cliente.nombre || ''}, te extrañamos en ${
        branding.negocio_nombre || 'Modo Sabor'
      }. Queremos invitarte a volver con un beneficio especial.`;
    }
    if (estado === 'por-reactivar') {
      return `Hola ${cliente.nombre || ''}, hace unos días que no te vemos por ${
        branding.negocio_nombre || 'Modo Sabor'
      }. Si quieres, te reservamos tu promo favorita.`;
    }
    if (estado === 'premio-listo') {
      return `Hola ${cliente.nombre || ''}, ya tienes un premio listo para canjear en ${
        branding.negocio_nombre || 'Modo Sabor'
      }. Cuando quieras, te ayudamos a aprovecharlo.`;
    }
    if (estado === 'vip') {
      return `Hola ${cliente.nombre || ''}, gracias por ser parte de nuestros clientes VIP en ${
        branding.negocio_nombre || 'Modo Sabor'
      }. Tenemos un beneficio especial preparado para ti.`;
    }
    return `Hola ${cliente.nombre || ''}, gracias por seguir eligiendo ${
      branding.negocio_nombre || 'Modo Sabor'
    }. Tenemos novedades y beneficios para ti.`;
  };

  const getClienteCardCode = (cliente) => {
    if (!cliente) return '';
    return cliente.codigo_tarjeta || `MS-${String(cliente.id).padStart(6, '0')}`;
  };

  const getClienteClubUrl = (cliente) => {
    if (!cliente) return '';
    return buildPublicAppUrl(`/club/${encodeURIComponent(getClienteCardCode(cliente))}`, branding);
  };

  const isProfileIncomplete = (cliente) => {
    if (!cliente) return false;
    const hasDireccion = Boolean((cliente.direccion || '').trim());
    const hasCumple = Boolean(cliente.fecha_nacimiento);
    const hasEmail = Boolean((cliente.email || '').trim());
    return !hasDireccion || !hasCumple || !hasEmail;
  };

  const getVirtualCardMessage = (cliente) => {
    if (!cliente) return '';
    const negocio = branding.negocio_nombre || 'Modo Sabor';
    const clubUrl = getClienteClubUrl(cliente);
    return `Hola ${
      cliente.nombre || ''
    }, esta es tu tarjeta virtual de fidelidad de ${negocio}: ${clubUrl}`;
  };

  const openWhatsAppCardShare = (cliente) => {
    const link = getWhatsAppLink(cliente?.telefono, getVirtualCardMessage(cliente));
    if (!link || link === '#') {
      toast.error('El cliente no tiene teléfono cargado');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const printLoyaltyCard = (cliente) => {
    if (!cliente || typeof window === 'undefined') return;
    const escapeHtml = (value) =>
      String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const negocio = branding.negocio_nombre || 'Modo Sabor';
    const clubUrl = getClienteClubUrl(cliente);
    const cardCode = getClienteCardCode(cliente);
    const safeName = escapeHtml(cliente.nombre || 'Cliente Modo Sabor');
    const telefono = escapeHtml(cliente.telefono || 'Sin teléfono');
    const nivel = escapeHtml(cliente.nivel || 'Bronce');
    const puntos = Number(cliente.puntos || 0).toLocaleString('es-AR');
    const recompensas = Number(cliente.recompensas_pendientes || 0);
    const logoUrl = escapeHtml(resolveAssetUrl(branding.negocio_logo || DEFAULT_BRAND_LOGO));
    const qrSvg = renderToStaticMarkup(
      createElement(QRCodeSVG, {
        value: clubUrl,
        size: 176,
        bgColor: '#ffffff',
        fgColor: '#111827',
        includeMargin: true,
      })
    );
    const popup = window.open('', '_blank', 'width=760,height=980');
    if (!popup) {
      toast.error('No se pudo abrir la vista de impresión');
      return;
    }
    popup.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Tarjeta Fidelidad - ${safeName}</title>
          <style>
            * { box-sizing: border-box; }
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              min-height: 100%;
              background: #f6f1ed;
              color: #111827;
              font-family: Inter, Arial, Helvetica, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: calc(297mm - 20mm);
              padding: 0;
            }
            .sheet {
              width: 100%;
              min-height: calc(297mm - 20mm);
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0;
            }
            .card {
              position: relative;
              width: 86mm;
              height: 54mm;
              display: flex;
              flex-direction: column;
              background:
                radial-gradient(circle at top right, rgba(200, 29, 37, 0.28), transparent 34%),
                radial-gradient(circle at bottom left, rgba(245, 158, 11, 0.16), transparent 28%),
                linear-gradient(145deg, #fffdfb 0%, #fff4ef 100%);
              border: 0.45mm solid #f3d8d2;
              border-radius: 5.2mm;
              box-shadow: 0 4mm 10mm rgba(61, 19, 15, 0.12);
              overflow: hidden;
            }
            @media print {
              html, body {
                background: #ffffff;
              }
              .sheet {
                min-height: calc(297mm - 20mm);
              }
              .card {
                box-shadow: none;
              }
            }
            .card::before {
              content: "";
              position: absolute;
              inset: 0;
              background:
                linear-gradient(135deg, rgba(200, 29, 37, 0.08), transparent 34%),
                linear-gradient(320deg, rgba(143, 16, 24, 0.08), transparent 30%);
              pointer-events: none;
            }
            .header {
              position: relative;
              z-index: 1;
              padding: 4mm 4.2mm 2mm;
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 2.4mm;
            }
            .brand {
              display: flex;
              align-items: center;
              gap: 2.4mm;
              min-width: 0;
            }
            .brand-logo {
              width: 10mm;
              height: 10mm;
              border-radius: 2.8mm;
              background: #ffffff;
              border: 0.35mm solid #f1dfd7;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              box-shadow: 0 1.5mm 4mm rgba(200, 29, 37, 0.12);
              flex-shrink: 0;
            }
            .brand-logo img {
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
            .brand-mark {
              font-size: 4.4mm;
              font-weight: 900;
              color: #c81d25;
            }
            .eyebrow {
              font-size: 1.65mm;
              font-weight: 800;
              letter-spacing: 0.18em;
              text-transform: uppercase;
              color: #c81d25;
            }
            .title {
              margin-top: 0.5mm;
              font-size: 4mm;
              font-weight: 900;
              line-height: 1.02;
              color: #0f172a;
              max-width: 30mm;
              max-height: 8.2mm;
              overflow: hidden;
            }
            .brand-note {
              margin-top: 0.6mm;
              font-size: 1.72mm;
              font-weight: 700;
              color: #64748b;
            }
            .code-pill {
              border-radius: 999px;
              background: #fff1f2;
              border: 0.35mm solid #f4c7cb;
              padding: 1mm 2.1mm;
              font-size: 1.75mm;
              font-weight: 900;
              color: #8f1018;
              letter-spacing: 0.08em;
              white-space: nowrap;
            }
            .body {
              position: relative;
              z-index: 1;
              display: grid;
              grid-template-columns: minmax(0, 1fr) 23mm;
              gap: 2.2mm;
              padding: 0 4.2mm 4mm;
              align-items: stretch;
            }
            .left {
              display: flex;
              flex-direction: column;
              gap: 1.8mm;
            }
            .name-block {
              border-radius: 3.1mm;
              background: rgba(255,255,255,0.92);
              border: 0.35mm solid #f1dfd7;
              padding: 2mm 2.3mm;
            }
            .label {
              font-size: 1.5mm;
              font-weight: 800;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: #c81d25;
            }
            .name {
              margin-top: 0.45mm;
              font-size: 2.7mm;
              font-weight: 900;
              line-height: 1.05;
              color: #0f172a;
              word-break: break-word;
              max-height: 6.2mm;
              overflow: hidden;
            }
            .stats {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 1.5mm;
            }
            .stat {
              min-height: 8.8mm;
              padding: 1.6mm 2mm;
              border-radius: 2.8mm;
              background: rgba(255,255,255,0.92);
              border: 0.35mm solid #f1dfd7;
            }
            .stat-k {
              font-size: 1.42mm;
              font-weight: 800;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              color: #94a3b8;
            }
            .stat-v {
              margin-top: 0.4mm;
              font-size: 1.82mm;
              font-weight: 900;
              color: #0f172a;
              word-break: break-word;
              line-height: 1.15;
              max-height: 4.1mm;
              overflow: hidden;
            }
            .reward {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 2mm;
              padding: 1.8mm 2.3mm;
              border-radius: 2.8mm;
              background: linear-gradient(135deg, #8f1018 0%, #c81d25 62%, #ed6a4a 100%);
              color: white;
            }
            .reward-k {
              font-size: 1.45mm;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              color: rgba(255,255,255,0.74);
            }
            .reward-v {
              margin-top: 0.35mm;
              font-size: 1.75mm;
              font-weight: 900;
              line-height: 1.15;
            }
            .qr-col {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              gap: 1.1mm;
            }
            .qr-wrap {
              width: 22mm;
              height: 22mm;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 0.9mm;
              border-radius: 3.4mm;
              background: #ffffff;
              border: 0.35mm solid #f1dfd7;
              box-shadow: 0 1.4mm 3mm rgba(200, 29, 37, 0.12);
            }
            .scan {
              width: 100%;
              border-radius: 2.6mm;
              background: #fff5f3;
              border: 0.35mm solid #f1dfd7;
              padding: 1mm 1.4mm;
              font-size: 1.18mm;
              font-weight: 800;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: #8f1018;
              text-align: center;
            }
            .tiny {
              font-size: 1.06mm;
              font-weight: 700;
              color: #64748b;
              text-align: center;
              line-height: 1.28;
            }
            .footer {
              position: absolute;
              left: 4.2mm;
              right: 4.2mm;
              bottom: 1.6mm;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 2mm;
              font-size: 1.02mm;
              font-weight: 800;
              color: #7c6f69;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }
            .footer span:first-child {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="card">
              <div class="header">
                <div class="brand">
                  <div class="brand-logo">
                    ${
                      logoUrl
                        ? `<img src="${logoUrl}" alt="${escapeHtml(negocio)}" />`
                        : `<div class="brand-mark">MS</div>`
                    }
                  </div>
                  <div>
                    <div class="eyebrow">Club fidelidad</div>
                    <div class="title">${escapeHtml(negocio)}</div>
                    <div class="brand-note">Escaneá y guardá tu tarjeta digital</div>
                  </div>
                </div>
                <div class="code-pill">${cardCode}</div>
              </div>
              <div class="body">
                <div class="left">
                  <div class="name-block">
                    <div class="label">Cliente</div>
                    <div class="name">${safeName}</div>
                  </div>
                  <div class="stats">
                    <div class="stat">
                      <div class="stat-k">Teléfono</div>
                      <div class="stat-v">${telefono}</div>
                    </div>
                    <div class="stat">
                      <div class="stat-k">Nivel</div>
                      <div class="stat-v">${nivel}</div>
                    </div>
                    <div class="stat">
                      <div class="stat-k">Puntos</div>
                      <div class="stat-v">${puntos} pts</div>
                    </div>
                    <div class="stat">
                      <div class="stat-k">Premios</div>
                      <div class="stat-v">${recompensas}</div>
                    </div>
                  </div>
                  <div class="reward">
                    <div>
                      <div class="reward-k">Beneficio activo</div>
                      <div class="reward-v">Club digital y premios disponibles</div>
                    </div>
                    <div class="reward-k">${cardCode}</div>
                  </div>
                </div>
                <div class="qr-col">
                  <div class="qr-wrap">${qrSvg}</div>
                  <div class="scan">Escaneá tu club</div>
                  <div class="tiny">Escaneá para abrir la tarjeta virtual y completar tu ficha.</div>
                </div>
              </div>
              <div class="footer">
                <span>${escapeHtml(clubUrl.replace(/^https?:\/\//i, ''))}</span>
                <span>Modo Sabor</span>
              </div>
            </div>
          </div>
          <script>
            window.onload = () => {
              window.onafterprint = () => {
                setTimeout(() => window.close(), 400);
              };
              window.print();
              setTimeout(() => window.close(), 1800);
            };
          </script>
        </body>
      </html>
    `);
    popup.document.close();
  };

  const insertCampaignVariable = (key) => {
    setCampaignMessage((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}{{${key}}}`);
  };

  const exportarCsv = () => {
    if (!filtered.length) return toast.error('No hay clientes para exportar');
    // Todo entre comillas y con las comillas internas duplicadas: antes solo
    // se escapaban tres columnas, así que una dirección con coma corría el
    // resto de la fila.
    const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [
      [
        'ID',
        'Nombre',
        'Teléfono',
        'Dirección',
        'Nivel',
        'Puntos',
        'Total pedidos',
        'Total gastado',
        'Última compra',
        'Estado',
        'Sellos actuales',
        'Premios pendientes',
      ]
        .map(cell)
        .join(','),
      ...filtered.map((c) =>
        [
          c.id,
          c.nombre,
          c.telefono,
          c.direccion,
          c.nivel || 'Bronce',
          c.puntos || 0,
          c.total_pedidos || 0,
          c.total_gastado || 0,
          c.ultima_compra || '',
          segmentoTono(getClienteEstado(c)).label,
          c.sellos_actuales || 0,
          c.recompensas_pendientes || 0,
        ]
          .map(cell)
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} clientes exportados`);
  };

  const cargar = async (query = '') => {
    setLoading(true);
    try {
      const [resClientes, resConfig] = await Promise.allSettled([
        api.get(`/clientes${query ? `?search=${encodeURIComponent(query)}` : ''}`),
        api.get('/fidelizacion/config'),
      ]);

      if (resClientes.status !== 'fulfilled') {
        throw resClientes.reason;
      }

      setClientes(resClientes.value);

      if (resConfig.status === 'fulfilled') {
        setFidelidadConfig(resConfig.value);
        setCanManageFidelidadConfig(true);
      } else {
        setCanManageFidelidadConfig(false);
      }
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const cargarCampanas = async () => {
      try {
        const res = await api.get('/clientes/campanas/personalizadas/config');
        setCampaignTemplates(res.templates || {});
        setCampaignHistory(res.history || []);
        setCampaignDashboard(res.dashboard || null);
        setCampaignSegmentStats(res.segmentos || []);
        setCampaignTopCampaign(res.top_campaign || null);
        setCampaignVariables(res.variables || []);
      } catch {
        // Mantener funcional el modulo aunque falle la carga secundaria.
      }
    };
    cargarCampanas();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    // Sin guardas: `c.nombre.toLowerCase()` y `c.telefono.includes()` reventaban
    // la pantalla entera con un solo cliente sin teléfono o sin nombre —cosa
    // que pasa con los que carga el agente de WhatsApp o una importación—.
    const texto = (valor) => String(valor ?? '').toLowerCase();

    return clientes.filter((c) => {
      const estado = getClienteEstado(c);
      const hasReward = Number(c.recompensas_pendientes || 0) > 0;
      const fidelidadActiva = Boolean(c.fidelizacion_activa);

      const matchesTerm =
        !term ||
        texto(c.nombre).includes(term) ||
        texto(c.telefono).includes(term) ||
        texto(c.codigo_tarjeta).includes(term);

      const matchesNivel = filtroNivel === 'Todos' || c.nivel === filtroNivel;
      const matchesEstado = filtroEstado === 'Todos' || estado === filtroEstado;
      const matchesBeneficio =
        filtroBeneficio === 'Todos' ||
        (filtroBeneficio === 'Con premio' && hasReward) ||
        (filtroBeneficio === 'Fidelización activa' && fidelidadActiva) ||
        (filtroBeneficio === 'Fidelización pausada' && !fidelidadActiva) ||
        (filtroBeneficio === 'Perfil incompleto' && isProfileIncomplete(c));

      return matchesTerm && matchesNivel && matchesEstado && matchesBeneficio;
    });
  }, [clientes, search, filtroNivel, filtroEstado, filtroBeneficio, getClienteEstado]);

  const stats = useMemo(() => {
    const conPremio = clientes.filter((c) => Number(c.recompensas_pendientes || 0) > 0).length;
    const sinTelefono = clientes.filter((c) => !String(c.telefono || '').trim()).length;
    return {
      total: clientes.length,
      vip: clientes.filter((c) => getClienteEstado(c) === 'vip').length,
      // Esto se llamaba "ltv", que es otra cosa: LTV es el valor esperado por
      // cliente a futuro. Esto es la facturación histórica acumulada de los
      // clientes registrados, sin contar las ventas anónimas de mostrador.
      facturado: clientes.reduce((acc, c) => acc + Number(c.total_gastado || 0), 0),
      conPremio,
      sinTelefono,
    };
  }, [clientes, getClienteEstado]);

  const segmentHighlights = useMemo(
    () => [
      {
        key: 'premio-listo',
        label: 'Premio listo',
        count: clientes.filter((c) => getClienteEstado(c) === 'premio-listo').length,
        filter: 'premio-listo',
        icon: Gift,
        cta: 'Avisar premio',
      },
      {
        key: 'vip',
        label: 'VIP',
        count: clientes.filter((c) => getClienteEstado(c) === 'vip').length,
        filter: 'vip',
        icon: Star,
        cta: 'Beneficio premium',
      },
      {
        key: 'riesgo',
        label: 'En riesgo',
        count: clientes.filter((c) => getClienteEstado(c) === 'riesgo').length,
        filter: 'riesgo',
        icon: AlertTriangle,
        cta: 'Recuperar',
      },
      {
        key: 'nuevo',
        label: 'Nuevos',
        count: clientes.filter((c) => getClienteEstado(c) === 'nuevo').length,
        filter: 'nuevo',
        icon: UserRound,
        cta: 'Dar bienvenida',
      },
    ],
    [clientes, getClienteEstado]
  );

  const getSegmentMessage = (segmento) => {
    if (campaignTemplates?.[segmento]) return campaignTemplates[segmento];
    return SEGMENT_CAMPAIGN_COPY[segmento]?.message(branding.negocio_nombre || 'Modo Sabor') || '';
  };

  const getSegmentCandidates = (segmento) =>
    clientes
      .filter((cliente) => {
        const estado = getClienteEstado(cliente);
        if (segmento === 'riesgo') return ['riesgo', 'en-riesgo'].includes(estado);
        return estado === segmento;
      })
      .filter((cliente) => cliente.telefono);

  const launchSegmentCampaign = (segmento) => {
    const candidates = getSegmentCandidates(segmento);

    if (!candidates.length) {
      toast.error('No hay clientes con telefono para ese segmento');
      return;
    }

    setFiltroEstado(SEGMENT_CAMPAIGN_COPY[segmento]?.filter || 'Todos');
    setCampaignMessage(getSegmentMessage(segmento));
    setCampaignModal({
      segment: segmento,
      title:
        SEGMENT_CAMPAIGN_COPY[segmento]?.title ||
        segmentHighlights.find((item) => item.key === segmento)?.label ||
        'Campana',
      clients: candidates,
      selectedIds: candidates.map((cliente) => cliente.id),
      metrics: null,
    });
  };

  const saveCampaignTemplate = async () => {
    if (!campaignModal?.segment) return;
    try {
      await api.put(`/clientes/campanas/personalizadas/template/${campaignModal.segment}`, {
        mensaje: campaignMessage,
      });
      setCampaignTemplates((prev) => ({ ...prev, [campaignModal.segment]: campaignMessage }));
      toast.success('Plantilla guardada');
    } catch (err) {
      toast.error(err?.error || 'No se pudo guardar la plantilla');
    }
  };

  const registerCampaignHistory = async () => {
    if (!campaignModal?.segment) return;
    const selectedIds = campaignModal.selectedIds || [];
    if (!selectedIds.length) {
      toast.error('Selecciona al menos un cliente');
      return;
    }

    try {
      const item = await api.post('/clientes/campanas/personalizadas/historial', {
        segmento: campaignModal.segment,
        titulo: campaignModal.title,
        mensaje: campaignMessage,
        cliente_ids: selectedIds,
        total_clientes: selectedIds.length,
      });
      setCampaignHistory((prev) => [item, ...prev].slice(0, 12));
      setCampaignModal((prev) =>
        prev
          ? {
              ...prev,
              historyId: item.id,
              lastResult: item.ultimo_resultado || [],
              metrics:
                item.metricas ||
                summarizeCampaignMetrics(item.ultimo_resultado, item.total_clientes),
            }
          : prev
      );
      toast.success('Campaña registrada en historial');
    } catch (err) {
      toast.error(err?.error || 'No se pudo registrar la campaña');
    }
  };

  const reopenCampaignFromHistory = (item) => {
    const historyClientIds = Array.isArray(item.cliente_ids)
      ? item.cliente_ids.map((id) => Number(id))
      : [];
    const historyClients = clientes.filter((cliente) =>
      historyClientIds.includes(Number(cliente.id))
    );
    if (!historyClients.length) {
      toast.error('No se encontraron clientes vigentes para esta campaña');
      return;
    }

    setCampaignMessage(item.mensaje || getSegmentMessage(item.segmento));
    setCampaignModal({
      historyId: item.id,
      segment: item.segmento,
      title: item.titulo || item.segmento,
      clients: historyClients,
      selectedIds: historyClients.map((cliente) => cliente.id),
      lastResult: item.ultimo_resultado || [],
      metrics:
        item.metricas || summarizeCampaignMetrics(item.ultimo_resultado, item.total_clientes),
    });
  };

  const sendCampaign = async () => {
    if (!campaignModal?.selectedIds?.length) {
      toast.error('Selecciona al menos un cliente');
      return;
    }

    setCampaignSending(true);
    try {
      let historyId = campaignModal.historyId || null;

      if (!historyId) {
        const historyItem = await api.post('/clientes/campanas/personalizadas/historial', {
          segmento: campaignModal.segment,
          titulo: campaignModal.title,
          mensaje: campaignMessage,
          cliente_ids: campaignModal.selectedIds,
          total_clientes: campaignModal.selectedIds.length,
        });
        historyId = historyItem.id;
        setCampaignHistory((prev) => [historyItem, ...prev].slice(0, 12));
        setCampaignModal((prev) =>
          prev
            ? {
                ...prev,
                historyId,
                metrics:
                  historyItem.metricas ||
                  summarizeCampaignMetrics(
                    historyItem.ultimo_resultado,
                    historyItem.total_clientes
                  ),
              }
            : prev
        );
      }

      const res = await api.post('/clientes/campanas/personalizadas/enviar', {
        segmento: campaignModal.segment,
        mensaje: campaignMessage,
        cliente_ids: campaignModal.selectedIds,
        history_id: historyId,
      });

      if (historyId) {
        setCampaignHistory((prev) =>
          prev.map((item) =>
            item.id === historyId
              ? {
                  ...item,
                  enviados_ok: res.enviados_ok,
                  enviados_error: res.enviados_error,
                  ultimo_resultado: res.results,
                  metricas: res.metricas,
                }
              : item
          )
        );
      }

      setCampaignModal((prev) =>
        prev ? { ...prev, historyId, lastResult: res.results, metrics: res.metricas } : prev
      );
      toast.success(`Campaña procesada: ${res.enviados_ok} ok, ${res.enviados_error} con error`);
    } catch (err) {
      toast.error(err?.error || 'No se pudo procesar la campaña');
    } finally {
      setCampaignSending(false);
    }
  };

  const getCardQuickAction = (cliente) => {
    const estado = getClienteEstado(cliente);
    if (estado === 'premio-listo')
      return {
        label: 'Avisar premio',
        href: getWhatsAppLink(cliente.telefono, getRecoveryMessage(cliente)),
        icon: Gift,
      };
    if (estado === 'vip')
      return {
        label: 'Enviar VIP',
        href: getWhatsAppLink(cliente.telefono, getRecoveryMessage(cliente)),
        icon: Star,
      };
    if (['riesgo', 'en-riesgo', 'perdido'].includes(estado))
      return {
        label: 'Recuperar',
        href: getWhatsAppLink(cliente.telefono, getRecoveryMessage(cliente)),
        icon: MessageCircle,
      };
    if (estado === 'nuevo')
      return {
        label: 'Bienvenida',
        href: getWhatsAppLink(cliente.telefono, getRecoveryMessage(cliente)),
        icon: UserRound,
      };
    return {
      label: 'Contactar',
      href: getWhatsAppLink(cliente.telefono, getRecoveryMessage(cliente)),
      icon: Phone,
    };
  };

  const openCampaignPreview = () => {
    if (!campaignModal?.clients?.length) {
      toast.error('No hay clientes disponibles para esta campaña');
      return;
    }
    const firstClient = campaignModal.clients.find((cliente) =>
      campaignModal.selectedIds?.includes(cliente.id)
    );
    if (!firstClient) {
      toast.error('Selecciona al menos un cliente');
      return;
    }
    window.open(getWhatsAppLink(firstClient.telefono, campaignMessage), '_blank');
  };

  const abrirDetalle = async (c) => {
    try {
      const res = await api.get(`/clientes/${c.id}`);
      setDetalle(res);
    } catch {
      toast.error('Error');
    }
  };

  const handleEdit = (c) => {
    setForm({
      id: c.id,
      nombre: c.nombre || '',
      telefono: c.telefono || '',
      direccion: c.direccion || '',
      fecha_nacimiento: c.fecha_nacimiento || '',
      notas: c.notas || '',
      // Si el cliente es viejo y nunca tuvo foto, se precarga la que ya viene
      // mostrando la lista, así al guardar queda persistida en vez de volver
      // a la inicial gris.
      avatar_url: c.avatar_url || avatarTokenPorDefecto(c.id),
      fidelizacion_activa: c.fidelizacion_activa,
    });
    setModal('editar');
    setDetalle(null);
  };

  const save = async () => {
    if (!form.nombre.trim()) return toast.error('El nombre es obligatorio');
    setSaving(true);
    try {
      if (modal === 'nuevo') {
        await api.post('/clientes', form);
        toast.success('Cliente creado correctamente');
      } else {
        await api.put(`/clientes/${form.id}`, form);
        toast.success('Cliente actualizado');
      }
      setModal(null);
      setForm(EMPTY_FORM);
      cargar();
    } catch (err) {
      toast.error(err?.error || 'Error al guardar cliente');
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async () => {
    if (!canManageFidelidadConfig) {
      toast.error('No tienes permisos para editar la configuracion de fidelidad');
      return;
    }
    setSaving(true);
    try {
      await api.put('/fidelizacion/config', fidelidadConfig);
      toast.success('Configuración de fidelidad actualizada');
      setConfigModal(false);
    } catch (err) {
      toast.error(err?.error || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const deleteCliente = async (id) => {
    setDeleteDialog(id);
  };

  const confirmarEliminarCliente = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/clientes/${deleteDialog}`);
      toast.success('Eliminado');
      setDetalle(null);
      setDeleteDialog(null);
      cargar();
    } catch {
      toast.error('Error al eliminar');
    }
  };

  const canjearPremio = async (id) => {
    setRewardDialog(id);
  };

  const confirmarCanjePremio = async () => {
    if (!rewardDialog) return;
    try {
      const updated = await api.post(`/clientes/${rewardDialog}/canjear-regalo`);
      toast.success('¡Recompensa canjeada correctamente!');
      setDetalle(updated);
      setRewardDialog(null);
      cargar();
    } catch (err) {
      toast.error(err?.error || 'No se pudo canjear');
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('imagen', file);

    try {
      const res = await api.post('/productos/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((prev) => ({ ...prev, avatar_url: res.url }));
      toast.success('Imagen cargada');
    } catch {
      toast.error('Error al subir imagen');
    }
  };

  // `navigator.clipboard` no existe fuera de HTTPS (ni en localhost por IP),
  // así que en la tablet del mostrador esto tiraba un TypeError en vez de
  // avisar. Ahora falla con un mensaje.
  const copyToClipboard = (text) => {
    const value = String(text || '');
    if (!value) {
      toast.error('No hay nada para copiar');
      return;
    }
    if (!navigator.clipboard?.writeText) {
      toast.error('El navegador no permite copiar automáticamente');
      return;
    }
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success('Copiado al portapapeles'))
      .catch(() => toast.error('No se pudo copiar'));
  };

  const detalleTimeline = detalle?.timeline?.length
    ? detalle.timeline
    : detalle
      ? buildActivityTimeline(detalle)
      : [];
  const detalleDirecciones = detalle?.direcciones || [];
  const detalleDireccionPrincipal =
    detalleDirecciones.find((direccion) => direccion.principal) || detalleDirecciones[0] || null;
  const detalleClubUrl = detalle ? getClienteClubUrl(detalle) : '';
  const campaignMetrics =
    campaignModal?.metrics ||
    summarizeCampaignMetrics(
      campaignModal?.lastResult,
      campaignModal?.selectedIds?.length || campaignModal?.clients?.length || 0
    );
  const campaignDashboardStats = useMemo(
    () =>
      aggregateCampaignDashboard(campaignHistory, campaignDashboard || DEFAULT_CAMPAIGN_DASHBOARD),
    [campaignDashboard, campaignHistory]
  );
  const filteredCampaignHistory = useMemo(
    () => campaignHistory.filter((item) => matchesHistoryFilter(item, campaignHistoryFilter)),
    [campaignHistory, campaignHistoryFilter]
  );

  const onConfig = () => {
    if (!canManageFidelidadConfig) {
      toast.error('No tienes permisos para ver la configuracion de fidelidad');
      return;
    }
    setConfigModal(true);
  };
  // Al dar de alta se asigna una foto sola. Antes el alta arrancaba con
  // `avatar_url: ''` y casi nadie entraba a elegir una, así que la lista
  // terminaba siendo un muro de iniciales grises. Igual se puede cambiar
  // desde el mismo formulario.
  const onNuevo = () => {
    setForm({ ...EMPTY_FORM, avatar_url: avatarTokenAleatorio() });
    setModal('nuevo');
  };
  const onRefresh = () => cargar();
  const onExport = () => exportarCsv();
  const onCloseConfig = () => setConfigModal(false);
  const onCloseForm = () => setModal(null);
  const onCloseDetail = () => setDetalle(null);

  return {
    branding,
    brandingLogoUrl,
    publicAppDiagnostics,
    searchParams,
    setSearchParams,
    clientes,
    setClientes,
    search,
    setSearch,
    filtroNivel,
    setFiltroNivel,
    filtroEstado,
    setFiltroEstado,
    filtroBeneficio,
    setFiltroBeneficio,
    loading,
    saving,
    detalle,
    setDetalle,
    modal,
    setModal,
    configModal,
    setConfigModal,
    campaignModal,
    setCampaignModal,
    campaignMessage,
    setCampaignMessage,
    campaignTemplates,
    setCampaignTemplates,
    campaignHistory,
    setCampaignHistory,
    campaignDashboard,
    setCampaignDashboard,
    campaignSegmentStats,
    setCampaignSegmentStats,
    campaignTopCampaign,
    setCampaignTopCampaign,
    campaignHistoryFilter,
    setCampaignHistoryFilter,
    campaignVariables,
    setCampaignVariables,
    campaignSending,
    setCampaignSending,
    canManageFidelidadConfig,
    setCanManageFidelidadConfig,
    deleteDialog,
    setDeleteDialog,
    rewardDialog,
    setRewardDialog,
    form,
    setForm,
    fidelidadConfig,
    setFidelidadConfig,
    fileInputRef,
    sellosParaPremio,
    EMPTY_FORM,
    LOCAL_AVATARS,
    DEFAULT_CAMPAIGN_DASHBOARD,
    CAMPAIGN_HISTORY_FILTERS,
    SEGMENT_CAMPAIGN_COPY,
    formatPedidoDate,
    getDaysSince,
    getClienteEstado,
    getPrimaryPhoneLink,
    getWhatsAppLink,
    buildActivityTimeline,
    getTimelineTone,
    getRecoveryMessage,
    getClienteCardCode,
    getClienteClubUrl,
    isProfileIncomplete,
    getVirtualCardMessage,
    openWhatsAppCardShare,
    printLoyaltyCard,
    insertCampaignVariable,
    exportarCsv,
    cargar,
    abrirDetalle,
    handleEdit,
    save,
    saveConfig,
    deleteCliente,
    confirmarEliminarCliente,
    canjearPremio,
    confirmarCanjePremio,
    handleFileChange,
    copyToClipboard,
    getSegmentMessage,
    getSegmentCandidates,
    launchSegmentCampaign,
    saveCampaignTemplate,
    registerCampaignHistory,
    reopenCampaignFromHistory,
    sendCampaign,
    getCardQuickAction,
    openCampaignPreview,
    matchesHistoryFilter,
    summarizeCampaignMetrics,
    aggregateCampaignDashboard,
    fmtMoney,
    // `index.jsx` pasaba `hook.toast` y `hook.buildPublicAppUrl` a los hijos,
    // pero ninguno de los dos estaba en este return: llegaban `undefined`.
    // El de toast reventaba al tocar "contactar" en un cliente sin teléfono,
    // que es justo el caso en el que se quería mostrar el aviso.
    toast,
    buildPublicAppUrl,
    onConfig,
    onNuevo,
    onRefresh,
    onExport,
    onCloseConfig,
    onCloseForm,
    onCloseDetail,
    filtered,
    stats,
    segmentHighlights,
    campaignDashboardStats,
    filteredCampaignHistory,
    campaignMetrics,
    detalleTimeline,
    detalleDirecciones,
    detalleDireccionPrincipal,
    detalleClubUrl,
  };
}
