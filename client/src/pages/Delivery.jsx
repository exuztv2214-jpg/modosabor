import { useEffect, useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertCircle,
  Bike,
  Clock3,
  MapPinned,
  Pencil,
  RefreshCw,
  Smartphone,
  Trash2,
  UserCheck,
  UserPlus,
  X,
  Camera,
  MapPin,
  Phone,
  Briefcase,
  Calendar,
  Star,
  CheckCircle2,
  Navigation,
  ExternalLink,
  ChevronRight,
  User,
  ShoppingBag,
  MoreVertical,
  Mail,
  ShieldCheck,
  FileText,
  Map as MapIcon,
  Globe,
  Check,
  Info,
} from 'lucide-react';

import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAuthenticatedSocket } from '../hooks/useAuthenticatedSocket.js';
import ActionDialog from '../components/ActionDialog.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import {
  buildAddressForMaps,
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsSearchUrl,
} from '../lib/maps.js';
import { buildPublicAppUrl } from '../lib/publicUrls.js';

// Importación de Avatars para selección rápida
import user1 from '../image/profile/user-1.jpg';
import user2 from '../image/profile/user-2.jpg';
import user3 from '../image/profile/user-3.jpg';
import user4 from '../image/profile/user-4.jpg';
import user5 from '../image/profile/user-5.jpg';
import user6 from '../image/profile/user-6.jpg';
import user7 from '../image/profile/user-7.jpg';
import user8 from '../image/profile/user-8.jpg';
import user9 from '../image/profile/user-9.jpg';
import user10 from '../image/profile/user-10.jpg';
import user11 from '../image/profile/user-11.jpg';
import user12 from '../image/profile/user-12.jpg';

const AVATARS = [
  user1,
  user2,
  user3,
  user4,
  user5,
  user6,
  user7,
  user8,
  user9,
  user10,
  user11,
  user12,
];

const fmt = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;
const emptyForm = {
  nombre: '',
  telefono: '',
  vehiculo: '',
  zona_preferida: '',
  codigo_acceso: '',
  direccion: '',
  latitud_casa: null,
  longitud_casa: null,
  avatar_url: '',
  notas: '',
  fecha_ingreso: '',
};

const CONTROL =
  'h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-bold text-gray-700 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-[#5D87FF]/10';

function LocationPreview({ direccion, appConfig, label = 'Ubicacion', compact = false }) {
  if (!direccion) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-gray-300">
        <Globe size={32} strokeWidth={1} />
        <p className="text-[10px] font-black uppercase tracking-tighter">
          Escribe la direccion para cargar la vista
        </p>
      </div>
    );
  }

  const mapConfig = {
    localidad: appConfig?.negocio_localidad,
    provincia: appConfig?.negocio_provincia,
  };
  const safeAddress = buildAddressForMaps(direccion, mapConfig);
  const searchUrl = buildGoogleMapsSearchUrl({ direccion }, mapConfig);
  const routeUrl = buildGoogleMapsDirectionsUrl({ direccion }, mapConfig);

  return (
    <div className="flex h-full flex-col justify-between bg-gradient-to-br from-slate-50 to-white p-5">
      <div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
          <MapPin size={20} />
        </div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
          {label}
        </p>
        <p
          className={`${compact ? 'text-sm' : 'text-base'} mt-2 font-black leading-snug text-gray-900`}
        >
          {safeAddress}
        </p>
        <p className="mt-2 text-xs font-semibold leading-5 text-gray-500">
          Ruta preparada para Monteros, Tucuman, Argentina.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={routeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-2xl bg-primary-500 px-4 text-[10px] font-black uppercase tracking-wider text-white"
        >
          <Navigation size={14} />
          Ruta
        </a>
        <a
          href={searchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-[10px] font-black uppercase tracking-wider text-gray-700"
        >
          <ExternalLink size={14} />
          Mapa
        </a>
      </div>
    </div>
  );
}

const safeTime = (value) => {
  try {
    return value ? format(parseISO(value), 'HH:mm') : '--:--';
  } catch {
    return '--:--';
  }
};

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();
const GPS_STALE_MS = 3 * 60 * 1000;

function gpsMeta(timestamp) {
  if (!timestamp) return { label: 'Sin GPS', tone: 'slate' };
  const age = Date.now() - new Date(timestamp).getTime();
  if (age <= GPS_STALE_MS) return { label: 'GPS fresco', tone: 'emerald' };
  if (age <= GPS_STALE_MS * 3) return { label: 'GPS demorado', tone: 'amber' };
  return { label: 'GPS atrasado', tone: 'rose' };
}

function riderGpsStatus(repartidor) {
  const lastAt = repartidor?.ultima_ubicacion_en
    ? new Date(repartidor.ultima_ubicacion_en).getTime()
    : 0;
  if (!lastAt) return { label: 'Sin GPS', tone: 'slate', stale: true };
  const age = Date.now() - lastAt;
  if (age <= GPS_STALE_MS) return { label: 'GPS fresco', tone: 'emerald', stale: false };
  if (age <= GPS_STALE_MS * 3) return { label: 'GPS demorado', tone: 'amber', stale: true };
  return { label: 'GPS atrasado', tone: 'rose', stale: true };
}

function riderScore(repartidor, pedido, loads, lastMap) {
  const targetZone = normalizeText(pedido?.delivery_zona || pedido?.cliente_direccion);
  const preferredZone = normalizeText(repartidor?.zona_preferida);
  return {
    zoneMatch: Boolean(
      targetZone &&
      preferredZone &&
      (targetZone.includes(preferredZone) || preferredZone.includes(targetZone))
    ),
    load: Number(loads?.[repartidor.id] || 0),
    lastAssignedAt: Number(lastMap?.[repartidor.id] || 0),
    gpsAt: repartidor?.ultima_ubicacion_en ? new Date(repartidor.ultima_ubicacion_en).getTime() : 0,
  };
}

function riderBadges(repartidor, pedido, loads, lastMap) {
  const score = riderScore(repartidor, pedido, loads, lastMap);
  const badges = [];
  if (score.zoneMatch) badges.push('Mejor zona');
  if (score.load === 0) badges.push('Libre');
  if (score.gpsAt) badges.push('GPS reciente');
  return badges.slice(0, 2);
}

function AvatarDisplay({ url, nombre, size = 'h-24 w-24' }) {
  if (url) {
    return (
      <div className={`${size} overflow-hidden rounded-2xl bg-slate-100 shadow-lg`}>
        <img src={url} className="h-full w-full object-cover object-center" alt={nombre} />
      </div>
    );
  }
  return (
    <div
      className={`${size} rounded-2xl flex items-center justify-center font-black text-3xl text-white shadow-lg bg-gray-400`}
    >
      {nombre?.[0]?.toUpperCase() || <User />}
    </div>
  );
}

function DispatchCard({
  pedido,
  mapConfig,
  assigningAuto,
  submittingActionId,
  onAutoAssign,
  onPick,
  onDispatch,
  onDeliver,
}) {
  const pedidoGps = gpsMeta(pedido?.repartidor_ubicacion_en);
  return (
    <div className="rounded-[24px] border border-white/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
            Pedido
          </p>
          <p className="mt-1 text-lg font-black text-slate-900">#{pedido.numero}</p>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${pedido.estado === 'en_camino' ? 'bg-success-100 text-success-700' : 'bg-primary-100 text-blue-700'}`}
        >
          {pedido.estado === 'en_camino' ? 'En viaje' : 'Listo'}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-black uppercase tracking-tight text-slate-900">
            {pedido.cliente_nombre || 'Cliente sin nombre'}
          </p>
          <div className="mt-1 flex items-start gap-2 text-xs font-semibold text-slate-500">
            <MapPinned size={13} className="mt-0.5 flex-shrink-0" />
            <span>{pedido.cliente_direccion || 'Sin direccion cargada'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          <div className="flex items-center gap-2">
            <Clock3 size={13} />
            <span>{safeTime(pedido.creado_en)} hs</span>
          </div>
          <div className="font-black text-slate-900">{fmt(pedido.total)}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {pedido.hora_entrega ? (
            <span className="rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">
              Entrega {pedido.hora_entrega}
            </span>
          ) : null}
          {pedido.delivery_zona ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600">
              {pedido.delivery_zona}
            </span>
          ) : null}
          {Number(pedido.tiempo_estimado_min || 0) > 0 ? (
            <span className="rounded-full bg-primary-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-700">
              ETA {pedido.tiempo_estimado_min} min
            </span>
          ) : null}
          {pedido.estado === 'en_camino' ? (
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                pedidoGps.tone === 'emerald'
                  ? 'bg-success-100 text-success-700'
                  : pedidoGps.tone === 'amber'
                    ? 'bg-warning-100 text-warning-700'
                    : pedidoGps.tone === 'rose'
                      ? 'bg-danger-100 text-danger-700'
                      : 'bg-slate-100 text-slate-600'
              }`}
            >
              {pedidoGps.label}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {pedido.estado === 'listo' && !pedido.repartidor_id ? (
            <>
              <button
                onClick={() => onAutoAssign(pedido.id)}
                disabled={assigningAuto}
                className="h-11 rounded-2xl bg-primary-500 px-5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 disabled:opacity-50 hover:bg-primary-600 transition-all"
              >
                {assigningAuto ? '...' : 'Auto'}
              </button>
              <button
                onClick={() => onPick(pedido)}
                className="h-11 rounded-2xl border border-slate-200 bg-white px-5 text-[11px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all"
              >
                Elegir
              </button>
            </>
          ) : null}
          {pedido.estado === 'listo' && pedido.repartidor_id ? (
            <button
              onClick={() => onDispatch(pedido.id)}
              disabled={submittingActionId === pedido.id}
              className="h-11 rounded-2xl bg-primary-500 px-5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 disabled:opacity-50 hover:bg-primary-600 transition-all"
            >
              {submittingActionId === pedido.id ? '...' : 'Despachar'}
            </button>
          ) : null}
          {pedido.estado === 'en_camino' ? (
            <button
              onClick={() => onDeliver(pedido)}
              disabled={submittingActionId === pedido.id}
              className="h-11 rounded-2xl bg-success-500 px-5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-success-100 disabled:opacity-50 hover:bg-[#0EB795] transition-all"
            >
              {submittingActionId === pedido.id ? '...' : 'Entregar'}
            </button>
          ) : null}
          {pedido.cliente_direccion ? (
            <a
              href={buildGoogleMapsDirectionsUrl(
                {
                  latitud: pedido.cliente_latitud,
                  longitud: pedido.cliente_longitud,
                  direccion: pedido.cliente_direccion,
                },
                {
                  localidad: mapConfig?.negocio_localidad,
                  provincia: mapConfig?.negocio_provincia,
                }
              )}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-[11px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all"
            >
              Ruta
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Delivery() {
  const { config: appConfig } = useAppConfig();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('delivery.manage');
  const [repartidores, setRepartidores] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [tab, setTab] = useState('activos');
  const [modal, setModal] = useState(null);
  const [asignarModal, setAsignarModal] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [savingRider, setSavingRider] = useState(false);
  const [assigningAuto, setAssigningAuto] = useState(false);
  const [assigningManualId, setAssigningManualId] = useState(null);
  const [submittingActionId, setSubmittingActionId] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [deliverDialog, setDeliverDialog] = useState(null);
  const [selectedRadarPedidoId, setSelectedRadarPedidoId] = useState(null);
  const fileInputRef = useRef(null);

  const cargar = async () => {
    try {
      const [reps, peds] = await Promise.all([
        api.get('/repartidores'),
        api.get('/pedidos?limit=100'),
      ]);
      setRepartidores(reps || []);
      setPedidos(peds || []);
    } catch {
      toast.error('No se pudo cargar el panel de delivery');
    }
  };

  useAuthenticatedSocket({
    nuevo_pedido: cargar,
    pedido_actualizado_admin: cargar,
    repartidor_ubicacion_admin: cargar,
  });
  useEffect(() => {
    cargar();
  }, []);

  const repartidoresActivos = useMemo(
    () => repartidores.filter((item) => item.activo),
    [repartidores]
  );
  const repartidoresDisponibles = useMemo(
    () => repartidoresActivos.filter((item) => item.disponible),
    [repartidoresActivos]
  );
  const pedidosDelivery = useMemo(
    () => pedidos.filter((pedido) => pedido.tipo_entrega === 'delivery'),
    [pedidos]
  );
  const activos = useMemo(
    () => pedidosDelivery.filter((pedido) => ['listo', 'en_camino'].includes(pedido.estado)),
    [pedidosDelivery]
  );
  const listosSinAsignar = useMemo(
    () => activos.filter((pedido) => pedido.estado === 'listo' && !pedido.repartidor_id),
    [activos]
  );
  const listosAsignados = useMemo(
    () => activos.filter((pedido) => pedido.estado === 'listo' && pedido.repartidor_id),
    [activos]
  );
  const enCamino = useMemo(
    () => activos.filter((pedido) => pedido.estado === 'en_camino'),
    [activos]
  );
  const historial = useMemo(
    () => pedidosDelivery.filter((pedido) => pedido.estado === 'entregado').slice(0, 20),
    [pedidosDelivery]
  );

  const riderLoads = useMemo(
    () =>
      pedidosDelivery.reduce((acc, pedido) => {
        if (!pedido.repartidor_id || !['listo', 'en_camino'].includes(pedido.estado)) return acc;
        acc[pedido.repartidor_id] = (acc[pedido.repartidor_id] || 0) + 1;
        return acc;
      }, {}),
    [pedidosDelivery]
  );

  const lastAssignmentByRider = useMemo(
    () =>
      pedidosDelivery.reduce((acc, pedido) => {
        if (!pedido.repartidor_id) return acc;
        const timestamp = new Date(pedido.actualizado_en || pedido.creado_en || 0).getTime() || 0;
        acc[pedido.repartidor_id] = Math.max(acc[pedido.repartidor_id] || 0, timestamp);
        return acc;
      }, {}),
    [pedidosDelivery]
  );

  const repartidoresSugeridos = useMemo(() => {
    if (!asignarModal) return repartidoresDisponibles;
    return [...repartidoresDisponibles].sort((a, b) => {
      const scoreA = riderScore(a, asignarModal, riderLoads, lastAssignmentByRider);
      const scoreB = riderScore(b, asignarModal, riderLoads, lastAssignmentByRider);
      if (scoreA.zoneMatch !== scoreB.zoneMatch) return scoreA.zoneMatch ? -1 : 1;
      if (scoreA.load !== scoreB.load) return scoreA.load - scoreB.load;
      if (scoreA.lastAssignedAt !== scoreB.lastAssignedAt)
        return scoreA.lastAssignedAt - scoreB.lastAssignedAt;
      if (scoreA.gpsAt !== scoreB.gpsAt) return scoreB.gpsAt - scoreA.gpsAt;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
    });
  }, [asignarModal, repartidoresDisponibles, riderLoads, lastAssignmentByRider]);

  const guardarRider = async () => {
    if (!form.nombre.trim()) return toast.error('Ingresa el nombre del repartidor');
    setSavingRider(true);
    try {
      if (modal?.mode === 'edit') {
        await api.put(`/repartidores/${modal.repartidor.id}`, form);
      } else {
        await api.post('/repartidores', form);
      }
      toast.success('Rider guardado');
      setModal(null);
      setForm(emptyForm);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar el rider');
    } finally {
      setSavingRider(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('asset', file);
    try {
      const res = await api.post('/configuracion/web-publica/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm({ ...form, avatar_url: res.url });
      toast.success('Imagen cargada');
    } catch {
      toast.error('Error al subir imagen');
    }
  };

  const eliminarRider = async (repartidor) => {
    setDeleteDialog(repartidor);
  };

  const confirmarEliminarRider = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/repartidores/${deleteDialog.id}`);
      toast.success('Rider eliminado');
      setDeleteDialog(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo eliminar el rider');
    }
  };

  const toggleDisponible = async (repartidor) => {
    try {
      await api.put(`/repartidores/${repartidor.id}`, {
        ...repartidor,
        disponible: repartidor.disponible ? 0 : 1,
      });
      await cargar();
    } catch {
      toast.error('No se pudo cambiar la disponibilidad');
    }
  };

  const autoAsignar = async (pedidoId) => {
    setAssigningAuto(true);
    try {
      await api.post(`/repartidores/auto-asignar/${pedidoId}`);
      toast.success('Pedido asignado');
      setAsignarModal(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No hay riders disponibles');
    } finally {
      setAssigningAuto(false);
    }
  };

  const asignarManual = async (repartidorId, pedidoId) => {
    setAssigningManualId(repartidorId);
    try {
      await api.post(`/repartidores/${repartidorId}/asignar/${pedidoId}`);
      toast.success('Rider asignado');
      setAsignarModal(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo asignar el rider');
    } finally {
      setAssigningManualId(null);
    }
  };

  const marcarEnCamino = async (pedidoId) => {
    setSubmittingActionId(pedidoId);
    try {
      await api.put(`/pedidos/${pedidoId}/estado`, { estado: 'en_camino' });
      toast.success('Pedido despachado');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo despachar el pedido');
    } finally {
      setSubmittingActionId(null);
    }
  };

  const marcarEntregado = async (pedido) => {
    if (pedido.entrega_pin) {
      setDeliverDialog({ pedido, pin: '' });
      return;
    }
    const payload = { estado: 'entregado' };
    setSubmittingActionId(pedido.id);
    try {
      await api.put(`/pedidos/${pedido.id}/estado`, payload);
      toast.success('Pedido entregado');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo cerrar la entrega');
    } finally {
      setSubmittingActionId(null);
    }
  };

  const confirmarEntregaConPin = async () => {
    if (!deliverDialog?.pedido) return;
    if (!String(deliverDialog.pin || '').trim()) {
      toast.error('Ingresa el PIN de entrega');
      return;
    }
    setSubmittingActionId(deliverDialog.pedido.id);
    try {
      await api.put(`/pedidos/${deliverDialog.pedido.id}/estado`, {
        estado: 'entregado',
        pin: String(deliverDialog.pin).trim(),
      });
      toast.success('Pedido entregado');
      setDeliverDialog(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo cerrar la entrega');
    } finally {
      setSubmittingActionId(null);
    }
  };

  const columns = [
    {
      key: 'sin_asignar',
      title: 'Listos sin rider',
      subtitle: 'Esperando asignación',
      items: listosSinAsignar,
      shell: 'border-rose-100 bg-danger-50/40',
      badge: 'bg-danger-100 text-danger-700',
      empty: 'No hay pedidos listos sin asignar.',
    },
    {
      key: 'asignados',
      title: 'Listos para despachar',
      subtitle: 'Reservados para salida',
      items: listosAsignados,
      shell: 'border-primary-100 bg-primary-50/30',
      badge: 'bg-primary-100 text-blue-700',
      empty: 'No hay pedidos listos con rider asignado.',
    },
    {
      key: 'en_camino',
      title: 'En camino',
      subtitle: 'Pedidos en viaje',
      items: enCamino,
      shell: 'border-emerald-100 bg-success-50/30',
      badge: 'bg-success-100 text-success-700',
      empty: 'No hay pedidos en camino ahora mismo.',
    },
  ];
  const ridersGpsStale = repartidoresActivos.filter((item) => riderGpsStatus(item).stale).length;
  const ridersBusy = repartidoresActivos.filter((item) => !item.disponible).length;
  const ridersReady = repartidoresDisponibles.length;
  const radarPedidos = useMemo(
    () => [...enCamino, ...listosAsignados, ...listosSinAsignar],
    [enCamino, listosAsignados, listosSinAsignar]
  );
  const selectedRadarPedido = useMemo(() => {
    if (!radarPedidos.length) return null;
    return radarPedidos.find((pedido) => pedido.id === selectedRadarPedidoId) || radarPedidos[0];
  }, [radarPedidos, selectedRadarPedidoId]);

  const detailRiderStats = useMemo(() => {
    if (!detailModal) return { entregas: 0, activos: 0 };
    const entregas = pedidosDelivery.filter(
      (pedido) => pedido.repartidor_id === detailModal.id && pedido.estado === 'entregado'
    ).length;
    const activos = Number(riderLoads[detailModal.id] || 0);
    return { entregas, activos };
  }, [detailModal, pedidosDelivery, riderLoads]);

  useEffect(() => {
    if (!radarPedidos.length) {
      if (selectedRadarPedidoId !== null) setSelectedRadarPedidoId(null);
      return;
    }
    if (
      !selectedRadarPedidoId ||
      !radarPedidos.some((pedido) => pedido.id === selectedRadarPedidoId)
    ) {
      setSelectedRadarPedidoId(radarPedidos[0].id);
    }
  }, [radarPedidos, selectedRadarPedidoId]);

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8 pb-12">
        {/* Header Seccion */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="h-8 w-1 rounded-full bg-primary-500"></div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-primary-500">
                Logística de reparto
              </p>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase leading-none">
              Centro de Delivery
            </h1>
            <p className="mt-2 font-medium text-gray-500">
              {activos.length} envíos activos ahora mismo.
            </p>
          </div>
          <div className="flex gap-3">
            {canManage ? (
              <button
                onClick={() => {
                  setForm(emptyForm);
                  setModal({ mode: 'create' });
                }}
                className="flex h-12 items-center gap-2 rounded-2xl bg-primary-500 px-6 text-sm font-black text-white shadow-lg shadow-primary-100 hover:bg-primary-600 active:scale-95 transition-all"
              >
                <UserPlus size={18} strokeWidth={3} />
                NUEVO RIDER
              </button>
            ) : null}
            <button
              onClick={cargar}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-100 bg-white text-gray-400 shadow-sm active:scale-90 transition-all"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Metricas Rapidas */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 lg:gap-6">
          <div className="rounded-[32px] border border-rose-100 bg-white p-6 shadow-sm">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-rose-500">
              Sin rider
            </p>
            <p className="text-3xl font-black text-gray-900">{listosSinAsignar.length}</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Pedidos frenados esperando asignación
            </p>
          </div>
          <div className="rounded-[32px] border border-primary-100 bg-white p-6 shadow-sm">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary-500">
              Listos
            </p>
            <p className="text-3xl font-black text-gray-900">{listosAsignados.length}</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Ya reservados para salir del local
            </p>
          </div>
          <div className="rounded-[32px] border border-emerald-100 bg-white p-6 shadow-sm">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">
              En viaje
            </p>
            <p className="text-3xl font-black text-gray-900">{enCamino.length}</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Seguimiento activo rumbo al cliente
            </p>
          </div>
          <div className="rounded-[32px] border border-sky-100 bg-white p-6 shadow-sm">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-sky-600">
              Disponibles
            </p>
            <p className="text-3xl font-black text-gray-900">{ridersReady}</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">
              Riders listos para tomar un pedido
            </p>
          </div>
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              GPS a revisar
            </p>
            <p className="text-3xl font-black text-gray-900">{ridersGpsStale}</p>
            <p className="mt-2 text-xs font-semibold text-slate-400">
              {ridersBusy} riders siguen ocupados en reparto
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-[40px] border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary-500">
                  Radar de calle
                </p>
                <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-gray-900">
                  Seguimiento rápido de reparto
                </h3>
              </div>
              {selectedRadarPedido?.cliente_direccion ? (
                <a
                  href={buildGoogleMapsDirectionsUrl(
                    {
                      latitud: selectedRadarPedido.cliente_latitud,
                      longitud: selectedRadarPedido.cliente_longitud,
                      direccion: selectedRadarPedido.cliente_direccion,
                    },
                    {
                      localidad: appConfig?.negocio_localidad,
                      provincia: appConfig?.negocio_provincia,
                    }
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary-500 px-4 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition hover:bg-primary-600"
                >
                  <Navigation size={15} />
                  Abrir ruta
                </a>
              ) : null}
            </div>

            {selectedRadarPedido ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[1fr,280px]">
                  <div className="overflow-hidden rounded-[32px] border border-gray-100 bg-gray-50 shadow-inner">
                    {selectedRadarPedido.cliente_direccion ? (
                      <LocationPreview
                        direccion={selectedRadarPedido.cliente_direccion}
                        appConfig={appConfig}
                        label={`Pedido #${selectedRadarPedido.numero}`}
                      />
                    ) : (
                      <div className="flex h-[320px] items-center justify-center text-sm font-semibold text-gray-400">
                        Sin dirección cargada para este pedido
                      </div>
                    )}
                  </div>

                  <div className="rounded-[32px] border border-gray-100 bg-primary-50 p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-400">
                      Pedido activo
                    </p>
                    <p className="mt-2 text-2xl font-black text-gray-900">
                      #{selectedRadarPedido.numero}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-gray-500">
                      {selectedRadarPedido.cliente_nombre || 'Cliente sin nombre'}
                    </p>
                    <div className="mt-4 space-y-3 text-sm font-semibold text-gray-600">
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                          Dirección
                        </p>
                        <p className="mt-1 leading-6 text-gray-700">
                          {selectedRadarPedido.cliente_direccion || 'Sin dirección'}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                          Rider
                        </p>
                        <p className="mt-1 text-gray-700">
                          {selectedRadarPedido.repartidor_nombre || 'Sin asignar'}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                            Estado
                          </p>
                          <p className="mt-1 text-gray-700">
                            {String(selectedRadarPedido.estado || '').replace(/_/g, ' ')}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                            Total
                          </p>
                          <p className="mt-1 text-gray-900">{fmt(selectedRadarPedido.total)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {radarPedidos.slice(0, 6).map((pedido) => {
                    const active = pedido.id === selectedRadarPedido?.id;
                    const gps = gpsMeta(pedido?.repartidor_ubicacion_en);
                    return (
                      <button
                        key={`radar-${pedido.id}`}
                        onClick={() => setSelectedRadarPedidoId(pedido.id)}
                        className={`rounded-[26px] border px-4 py-4 text-left transition-all ${active ? 'border-primary-500 bg-primary-50 shadow-md' : 'border-gray-100 bg-white hover:-translate-y-0.5 hover:shadow-sm'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black uppercase tracking-tight text-gray-900">
                              #{pedido.numero}
                            </p>
                            <p className="mt-1 text-xs font-semibold text-gray-500">
                              {pedido.cliente_nombre || 'Cliente'}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
                              pedido.estado === 'en_camino'
                                ? 'bg-success-100 text-success-700'
                                : pedido.repartidor_id
                                  ? 'bg-primary-100 text-blue-700'
                                  : 'bg-danger-100 text-danger-700'
                            }`}
                          >
                            {pedido.estado === 'en_camino'
                              ? 'En viaje'
                              : pedido.repartidor_id
                                ? 'Asignado'
                                : 'Sin rider'}
                          </span>
                        </div>
                        <p className="mt-3 line-clamp-2 text-xs font-medium leading-5 text-gray-500">
                          {pedido.cliente_direccion || 'Sin dirección cargada'}
                        </p>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
                              gps.tone === 'emerald'
                                ? 'bg-success-100 text-success-700'
                                : gps.tone === 'amber'
                                  ? 'bg-warning-100 text-warning-700'
                                  : gps.tone === 'rose'
                                    ? 'bg-danger-100 text-danger-700'
                                    : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {gps.label}
                          </span>
                          <span className="text-xs font-black text-gray-900">
                            {fmt(pedido.total)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-[32px] border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center text-sm font-semibold text-gray-400">
                No hay pedidos activos para mostrar en el radar ahora mismo.
              </div>
            )}
          </div>

          <div className="rounded-[40px] border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary-500">
                Acción rápida
              </p>
              <h3 className="mt-1 text-xl font-black uppercase tracking-tight text-gray-900">
                Riders y salida inmediata
              </h3>
            </div>
            <div className="space-y-4">
              {repartidoresActivos.slice(0, 6).map((repartidor) => {
                const gps = riderGpsStatus(repartidor);
                const load = Number(riderLoads[repartidor.id] || 0);
                return (
                  <div
                    key={`quick-rider-${repartidor.id}`}
                    className="rounded-[26px] border border-gray-100 bg-gray-50/70 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-tight text-gray-900">
                          {repartidor.nombre}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-gray-500">
                          {repartidor.vehiculo || 'Sin vehículo'} ·{' '}
                          {repartidor.zona_preferida || 'Sin zona'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${repartidor.disponible ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}
                      >
                        {repartidor.disponible ? 'Disponible' : 'Ocupado'}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
                          gps.tone === 'emerald'
                            ? 'bg-success-100 text-success-700'
                            : gps.tone === 'amber'
                              ? 'bg-warning-100 text-warning-700'
                              : gps.tone === 'rose'
                                ? 'bg-danger-100 text-danger-700'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {gps.label}
                      </span>
                      <span className="text-xs font-black text-gray-500">
                        {load} pedido{load === 1 ? '' : 's'} activo{load === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => setDetailModal(repartidor)}
                        className="inline-flex h-10 items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 text-[10px] font-black uppercase tracking-[0.18em] text-gray-700 transition hover:bg-gray-100"
                      >
                        Ver ficha
                      </button>
                      {repartidor.direccion ? (
                        <a
                          href={buildGoogleMapsSearchUrl(
                            { direccion: repartidor.direccion },
                            {
                              localidad: appConfig?.negocio_localidad,
                              provincia: appConfig?.negocio_provincia,
                            }
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center justify-center rounded-2xl bg-primary-50 px-4 text-[10px] font-black uppercase tracking-[0.18em] text-primary-500 transition hover:bg-[#dbe8ff]"
                        >
                          Ver base
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Flota de Riders */}
        <div className="rounded-[40px] border border-gray-100 bg-white p-8 shadow-sm">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="text-xl font-black uppercase tracking-tight text-gray-900">
              Nuestra Flota
            </h3>
            <div className="rounded-xl bg-success-50 px-3 py-1.5 text-[10px] font-black uppercase text-success-600">
              {repartidoresActivos.length} riders activos
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {repartidoresActivos.map((repartidor) => (
              <div
                key={repartidor.id}
                className="group relative rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 text-center"
              >
                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => {
                      setForm({ ...repartidor });
                      setModal({ mode: 'edit', repartidor });
                    }}
                    className="p-2 bg-primary-50 text-primary-500 rounded-xl hover:bg-primary-500 hover:text-white transition-colors"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => eliminarRider(repartidor)}
                    className="p-2 bg-danger-50 text-rose-500 rounded-xl hover:bg-danger-500 hover:text-white transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mx-auto w-24 h-24 mb-4 relative">
                  <div className="w-full h-full rounded-[28px] overflow-hidden border-4 border-white shadow-lg relative z-10">
                    <AvatarDisplay
                      url={repartidor.avatar_url}
                      nombre={repartidor.nombre}
                      size="w-full h-full"
                    />
                  </div>
                  <div
                    className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-lg border-2 border-white shadow-sm z-20 ${repartidor.disponible ? 'bg-success-500' : 'bg-primary-500'}`}
                  ></div>
                </div>

                <div className="mb-6">
                  <h4 className="font-black text-gray-900 uppercase tracking-tight text-lg truncate">
                    {repartidor.nombre}
                  </h4>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center justify-center gap-1">
                    <Bike size={12} /> {repartidor.vehiculo || 'Sin vehículo'}
                  </p>
                </div>

                <div className="mb-4 flex justify-center">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                      riderGpsStatus(repartidor).tone === 'emerald'
                        ? 'bg-success-100 text-success-700'
                        : riderGpsStatus(repartidor).tone === 'amber'
                          ? 'bg-warning-100 text-warning-700'
                          : riderGpsStatus(repartidor).tone === 'rose'
                            ? 'bg-danger-100 text-danger-700'
                            : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {riderGpsStatus(repartidor).label}
                  </span>
                </div>

                {/* Credenciales */}
                <div className="mb-6 flex items-center gap-2 p-2.5 rounded-2xl bg-gray-50 border border-gray-100/50">
                  <div className="flex-1 text-left pl-2">
                    <p className="text-[8px] font-black text-gray-400 uppercase leading-none">ID</p>
                    <p className="text-sm font-black text-primary-500 mt-0.5">#{repartidor.id}</p>
                  </div>
                  <div className="w-[1px] h-6 bg-gray-200"></div>
                  <div className="flex-1 text-right pr-2">
                    <p className="text-[8px] font-black text-gray-400 uppercase leading-none">
                      PIN
                    </p>
                    <p className="text-xs font-mono font-bold text-gray-800 mt-0.5 select-all">
                      {repartidor.codigo_acceso}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => toggleDisponible(repartidor)}
                    className={`h-11 rounded-2xl text-[10px] font-black uppercase transition-all ${repartidor.disponible ? 'bg-success-50 text-success-600 shadow-sm' : 'border-2 border-gray-100 text-gray-400'}`}
                  >
                    {repartidor.disponible ? 'PRIORIDAD' : 'EN REPARTO'}
                  </button>
                  <button
                    onClick={() => setDetailModal(repartidor)}
                    className="flex h-11 items-center justify-center rounded-2xl bg-primary-500 text-white shadow-lg shadow-primary-100 active:scale-90 transition-all hover:bg-primary-600"
                  >
                    <Smartphone size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mesa de Despacho */}
        <div className="rounded-[40px] border border-gray-100 bg-white p-8 shadow-sm">
          <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-gray-900 leading-none">
                Mesa de Despacho
              </h3>
              <p className="mt-2 text-sm font-medium text-gray-500">
                Organiza las salidas del local.
              </p>
            </div>
            <div className="flex w-fit rounded-2xl bg-gray-100 p-1">
              <button
                onClick={() => setTab('activos')}
                className={`rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${tab === 'activos' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Activos ({activos.length})
              </button>
              <button
                onClick={() => setTab('historial')}
                className={`rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${tab === 'historial' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Historial
              </button>
            </div>
          </div>

          {tab === 'activos' ? (
            <div className="grid gap-6 xl:grid-cols-3">
              {columns.map((column) => (
                <div key={column.key} className={`rounded-[32px] border p-6 ${column.shell}`}>
                  <div className="mb-6 flex items-center justify-between">
                    <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">
                      {column.title}
                    </h4>
                    <div
                      className={`h-8 min-w-[32px] rounded-lg flex items-center justify-center font-black text-xs ${column.badge}`}
                    >
                      {column.items.length}
                    </div>
                  </div>
                  <div className="space-y-4">
                    {column.items.map((pedido) => (
                      <DispatchCard
                        key={pedido.id}
                        pedido={pedido}
                        mapConfig={appConfig}
                        assigningAuto={assigningAuto}
                        submittingActionId={submittingActionId}
                        onAutoAssign={autoAsignar}
                        onPick={setAsignarModal}
                        onDispatch={marcarEnCamino}
                        onDeliver={marcarEntregado}
                      />
                    ))}
                    {column.items.length === 0 && (
                      <div className="py-12 text-center opacity-30 italic text-sm">
                        {column.empty}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[32px] border border-gray-100">
              <table className="w-full text-left text-sm font-bold">
                <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                  <tr>
                    <th className="px-8 py-5">Orden</th>
                    <th className="px-8 py-5">Cliente</th>
                    <th className="px-8 py-5">Rider</th>
                    <th className="px-8 py-5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historial.map((pedido) => (
                    <tr key={pedido.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-8 py-5 text-gray-900">#{pedido.numero}</td>
                      <td className="px-8 py-5 uppercase tracking-tight text-xs">
                        {pedido.cliente_nombre}
                      </td>
                      <td className="px-8 py-5 text-gray-400 text-xs">
                        {pedido.repartidor_nombre || '-'}
                      </td>
                      <td className="px-8 py-5 text-right text-primary-500">{fmt(pedido.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL FICHA REPARTIDOR (CREATE/EDIT) ── */}
      {modal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          onClick={() => setModal(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[40px] bg-white shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="shrink-0 p-8 pb-4 flex items-center justify-between border-b border-gray-50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-1 bg-primary-500 rounded-full"></div>
                  <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em]">
                    {modal.mode === 'edit' ? 'Actualizar Ficha' : 'Nuevo Repartidor'}
                  </p>
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase leading-none">
                  Gestión de Personal Delivery
                </h3>
              </div>
              <button
                onClick={() => setModal(null)}
                className="rounded-full p-2 bg-gray-50 text-gray-400 hover:bg-gray-100 transition-all"
              >
                <X size={24} />
              </button>
            </div>

            {/* Contenido con Scroll */}
            <div className="flex-1 overflow-y-auto p-8 pt-6 space-y-10 no-scrollbar">
              {/* Bloque 1: Perfil y Foto */}
              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10 items-start">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                    <div className="h-44 w-44 rounded-[48px] overflow-hidden border-8 border-white shadow-2xl bg-gray-100 relative z-10">
                      <AvatarDisplay
                        url={form.avatar_url}
                        nombre={form.nombre}
                        size="w-full h-full"
                      />
                    </div>
                    <button
                      onClick={() => setAvatarPickerOpen(true)}
                      className="absolute -bottom-2 -right-2 h-12 w-12 bg-primary-500 text-white rounded-2xl border-4 border-white shadow-lg flex items-center justify-center hover:bg-primary-600 transition-all active:scale-90 z-20"
                    >
                      <Camera size={24} />
                    </button>
                  </div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center px-4">
                    Utiliza una foto clara para identificar al repartidor en la calle.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Nombre Completo
                      </label>
                      <input
                        value={form.nombre}
                        onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                        className={CONTROL + ' mt-1'}
                        placeholder="Ej: Carlos Rodriguez"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        WhatsApp / Celular
                      </label>
                      <input
                        value={form.telefono}
                        onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                        className={CONTROL + ' mt-1'}
                        placeholder="3811234567"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Vehículo (Marca/Modelo)
                      </label>
                      <input
                        value={form.vehiculo}
                        onChange={(e) => setForm({ ...form, vehiculo: e.target.value })}
                        className={CONTROL + ' mt-1'}
                        placeholder="Motomel Blitz 110"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        PIN de acceso del rider
                      </label>
                      <input
                        value={form.codigo_acceso || ''}
                        onChange={(e) => setForm({ ...form, codigo_acceso: e.target.value })}
                        className={CONTROL + ' mt-1 font-mono uppercase tracking-widest'}
                        placeholder="Ej: 9235ce31"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloque 2: Residencia y Mapa */}
              <div className="pt-8 border-t border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-8 w-8 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500">
                    <MapIcon size={18} strokeWidth={3} />
                  </div>
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest leading-none">
                    Información de Residencia
                  </h4>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                        Dirección de Domicilio
                      </label>
                      <div className="relative">
                        <input
                          value={form.direccion}
                          onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                          className={CONTROL + ' mt-1 pl-10'}
                          placeholder="Ej: Calle San Martín 123, Monteros"
                        />
                        <MapPin
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300"
                          size={16}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                          Zona Operativa
                        </label>
                        <input
                          value={form.zona_preferida}
                          onChange={(e) => setForm({ ...form, zona_preferida: e.target.value })}
                          className={CONTROL + ' mt-1'}
                          placeholder="Ej: Centro / Sur"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                          Fecha de Ingreso
                        </label>
                        <input
                          type="date"
                          value={form.fecha_ingreso}
                          onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
                          className={CONTROL + ' mt-1'}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                      Vista de Ubicación
                    </label>
                    <div className="h-48 w-full rounded-[32px] overflow-hidden bg-gray-100 border-4 border-white shadow-inner relative group">
                      <LocationPreview
                        direccion={form.direccion}
                        appConfig={appConfig}
                        label="Domicilio del rider"
                        compact
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloque 3: Notas */}
              <div className="pt-8 border-t border-gray-100 pb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
                    <FileText size={18} strokeWidth={3} />
                  </div>
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest leading-none">
                    Notas de Legajo y Observaciones
                  </h4>
                </div>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  className={CONTROL + ' h-32 py-4 resize-none no-scrollbar'}
                  placeholder="Registra historial de seguros, licencia, o notas internas sobre el desempeño..."
                />
              </div>
            </div>

            {/* Footer Fijo */}
            <div className="shrink-0 p-8 pt-4 border-t border-gray-50 flex gap-4 bg-gray-50/30">
              <button
                onClick={() => setModal(null)}
                className="flex-1 h-16 rounded-2xl border-2 border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-white transition-all"
              >
                CANCELAR
              </button>
              <button
                onClick={guardarRider}
                disabled={savingRider}
                className="flex-[2] h-16 rounded-2xl bg-primary-500 text-white text-lg font-black uppercase tracking-widest shadow-xl shadow-primary-100 hover:bg-primary-600 active:scale-95 transition-all"
              >
                {savingRider
                  ? 'PROCESANDO...'
                  : modal.mode === 'edit'
                    ? 'GUARDAR CAMBIOS'
                    : 'CREAR REPARTIDOR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE (VIEW MODE) ── */}
      {detailModal && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          onClick={() => setDetailModal(null)}
        >
          <div
            className="w-full max-w-2xl rounded-[48px] bg-white overflow-hidden shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-40 overflow-hidden border-b border-primary-100 bg-gradient-to-br from-[#ECF2FF] via-white to-[#E8FFF8]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(93,135,255,0.18),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(19,222,185,0.16),transparent_40%)]"></div>
              <div className="absolute right-8 top-5 rounded-full bg-white/80 px-4 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-primary-500 shadow-sm">
                Rider activo
              </div>
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.08]">
                <Bike size={160} strokeWidth={1} className="text-primary-500" />
              </div>
            </div>
            <div className="px-10 pb-10">
              <div className="relative z-10 flex justify-between items-end -mt-16 mb-8">
                <div className="h-32 w-32 rounded-[40px] border-8 border-white bg-gray-100 shadow-2xl overflow-hidden relative">
                  <AvatarDisplay
                    url={detailModal.avatar_url}
                    nombre={detailModal.nombre}
                    size="w-full h-full"
                  />
                </div>
                <div className="flex gap-2 pb-2">
                  <button
                    onClick={() => window.open(`https://wa.me/${detailModal.telefono}`, '_blank')}
                    className="h-14 w-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-emerald-500 shadow-sm hover:bg-success-50 active:scale-90 transition-all"
                  >
                    <Phone size={24} fill="currentColor" />
                  </button>
                  <button
                    onClick={() =>
                      window.open(
                        buildPublicAppUrl(
                          `/rider/${detailModal.id}/${detailModal.codigo_acceso}`,
                          appConfig
                        ),
                        '_blank'
                      )
                    }
                    className="h-14 px-8 rounded-2xl bg-primary-500 text-white text-xs font-black uppercase tracking-widest hover:bg-primary-600 transition-all shadow-lg shadow-primary-100 active:scale-95"
                  >
                    ABRIR APP
                  </button>
                  <button
                    onClick={() => {
                      const riderUrl = buildPublicAppUrl(
                        `/rider/${detailModal.id}/${detailModal.codigo_acceso}`,
                        appConfig
                      );
                      if (!navigator.clipboard?.writeText) {
                        toast.error('No se pudo copiar automáticamente');
                        return;
                      }
                      navigator.clipboard
                        .writeText(riderUrl)
                        .then(() => toast.success('Link copiado'))
                        .catch(() => toast.error('No se pudo copiar'));
                    }}
                    className="h-14 px-6 rounded-2xl bg-white border border-gray-100 text-xs font-black uppercase tracking-widest text-primary-500 shadow-sm hover:bg-primary-50 active:scale-95 transition-all"
                  >
                    COPIAR LINK
                  </button>
                </div>
              </div>

              <div className="mb-10">
                <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tight leading-none">
                  {detailModal.nombre}
                </h3>
                <div className="flex flex-wrap items-center gap-4 mt-4 text-gray-400 font-bold text-xs uppercase tracking-widest">
                  <span className="flex items-center gap-1.5">
                    <Smartphone size={14} /> {detailModal.telefono}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Bike size={14} /> {detailModal.vehiculo}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} /> Ingreso:{' '}
                    {detailModal.fecha_ingreso
                      ? format(parseISO(detailModal.fecha_ingreso), 'dd/MM/yy')
                      : 'N/A'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
                <div className="rounded-[32px] bg-primary-50 p-6 border border-primary-100/50 flex flex-col justify-between">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 leading-none">
                    Credenciales de Trabajo
                  </p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black text-blue-300 uppercase mb-1">ID RIDER</p>
                      <p className="text-xl font-black text-blue-700">#{detailModal.id}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black text-blue-300 uppercase mb-1">
                        CÓDIGO PIN
                      </p>
                      <p className="text-xl font-mono font-black text-blue-700 uppercase tracking-widest">
                        {detailModal.codigo_acceso}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-xs font-semibold leading-5 text-blue-900">
                    En el celular abre el link de la app y luego instálala desde el navegador para
                    usar ubicación en vivo.
                  </p>
                </div>

                <div className="rounded-[32px] bg-white border border-gray-100 shadow-inner h-44 overflow-hidden relative group">
                  <LocationPreview
                    direccion={detailModal.direccion}
                    appConfig={appConfig}
                    label="Domicilio"
                    compact
                  />
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-[9px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-1.5">
                      <MapPin size={10} className="text-primary-500" /> Domicilio
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">
                    Resumen de Desempeño
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-[24px] bg-gray-50 border border-gray-100 text-center">
                    <p className="text-[9px] font-black text-gray-400 uppercase mb-1 leading-none">
                      Entregas registradas
                    </p>
                    <p className="text-lg font-black text-gray-800">{detailRiderStats.entregas}</p>
                  </div>
                  <div className="p-4 rounded-[24px] bg-gray-50 border border-gray-100 text-center">
                    <p className="text-[9px] font-black text-gray-400 uppercase mb-1 leading-none">
                      En reparto ahora
                    </p>
                    <p className="text-lg font-black text-success-600">
                      {detailRiderStats.activos}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Selector de Avatar */}
      {avatarPickerOpen && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-[40px] bg-white p-10 shadow-2xl">
            <div className="flex items-center justify-between mb-8 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-1 bg-primary-500 rounded-full"></div>
                  <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em]">
                    Identidad
                  </p>
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase leading-none">
                  Personalizar Perfil
                </h3>
              </div>
              <button
                onClick={() => setAvatarPickerOpen(false)}
                className="rounded-full p-2 hover:bg-gray-100 text-gray-400 transition-all"
              >
                <X size={24} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-4">
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                <button
                  onClick={() => fileInputRef.current.click()}
                  className="group aspect-square rounded-[32px] border-4 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 hover:border-primary-500 hover:bg-primary-50 transition-all"
                >
                  <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-primary-500 group-hover:text-white transition-all">
                    <Camera size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase text-gray-400 group-hover:text-primary-500">
                    Subir Foto
                  </span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileUpload}
                  />
                </button>
                {AVATARS.map((av, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setForm({ ...form, avatar_url: av });
                      setAvatarPickerOpen(false);
                    }}
                    className={`relative aspect-square rounded-[32px] overflow-hidden border-4 bg-slate-100 transition-all hover:scale-105 ${form.avatar_url === av ? 'border-primary-500 shadow-lg' : 'border-transparent opacity-80 hover:opacity-100'}`}
                  >
                    <img
                      src={av}
                      className="h-full w-full object-cover object-center"
                      alt={`avatar-${idx}`}
                    />
                    {form.avatar_url === av && (
                      <div className="absolute inset-0 bg-primary-500/20 flex items-center justify-center">
                        <div className="bg-white rounded-full p-1 text-primary-500 shadow-md">
                          <Check size={16} strokeWidth={4} />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-8 flex justify-end shrink-0 pt-4 border-t border-gray-50">
              <button
                onClick={() => setAvatarPickerOpen(false)}
                className="h-14 px-10 rounded-2xl border border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 active:scale-95 transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      <ActionDialog
        open={Boolean(deleteDialog)}
        title={deleteDialog ? `Eliminar a ${deleteDialog.nombre}` : ''}
        description="Se quitará este rider del panel de delivery. Si estaba vinculado al personal, luego conviene revisar esa ficha."
        confirmLabel="Eliminar rider"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={confirmarEliminarRider}
        onClose={() => setDeleteDialog(null)}
      />
      <ActionDialog
        open={Boolean(deliverDialog)}
        title={deliverDialog ? `Cerrar entrega #${deliverDialog.pedido.numero}` : ''}
        description="Este pedido requiere validación con PIN del cliente para poder marcarlo como entregado."
        confirmLabel="Confirmar entrega"
        cancelLabel="Cancelar"
        tone="primary"
        inputLabel="PIN de entrega"
        inputPlaceholder="Ingresa el PIN"
        inputValue={deliverDialog?.pin || ''}
        onInputChange={(value) =>
          setDeliverDialog((prev) => (prev ? { ...prev, pin: value } : prev))
        }
        onConfirm={confirmarEntregaConPin}
        onClose={() => setDeliverDialog(null)}
      />
    </div>
  );
}
