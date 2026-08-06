import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Bike,
  Calendar,
  Camera,
  Check,
  Clock3,
  ExternalLink,
  FileText,
  Globe,
  Map as MapIcon,
  MapPin,
  MapPinned,
  Navigation,
  Pencil,
  Phone,
  RefreshCw,
  Smartphone,
  Trash2,
  User,
  UserPlus,
  X,
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
import { APP_BG, BRAND, STROKE, Z, estadoTono } from '../lib/theme.js';
import { horaLocal, msDesde, parseFechaServidor } from '../lib/fechas.js';

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
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

function LocationPreview({ direccion, appConfig, label = 'Ubicación', compact = false }) {
  if (!direccion) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-gray-300">
        <Globe size={28} strokeWidth={1.4} />
        <p className="text-[12px] text-gray-400">Escribí la dirección para ver la ubicación</p>
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
    <div className="flex h-full flex-col justify-between bg-white p-4">
      <div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
          <MapPin size={17} strokeWidth={STROKE} />
        </div>
        <p className="mt-3 text-[12px] text-gray-500">{label}</p>
        <p
          className={`${compact ? 'text-[13px]' : 'text-[15px]'} mt-1 font-medium leading-snug text-gray-900`}
        >
          {safeAddress}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={routeUrl}
          target="_blank"
          rel="noreferrer"
          style={{ background: BRAND }}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
        >
          <Navigation size={14} strokeWidth={STROKE} />
          Ruta
        </a>
        <a
          href={searchUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
        >
          <ExternalLink size={14} strokeWidth={STROKE} />
          Mapa
        </a>
      </div>
    </div>
  );
}

// Usaba `parseISO` sobre el string crudo de SQLite ("2026-08-06 14:30:00"),
// que da Invalid Date; `format` tiraba RangeError y el catch devolvía siempre
// '--:--'. O sea: la hora del pedido nunca se mostraba. Ver lib/fechas.js.
const safeTime = (value) => horaLocal(value);

// `fecha_ingreso` es una fecha sin hora. Antes se formateaba con
// `format(parseISO(...))` sin guarda: si el valor venía mal, el RangeError
// tumbaba el modal de detalle del repartidor entero.
const fechaCorta = (value) => {
  const fecha = parseFechaServidor(value);
  if (!Number.isFinite(fecha.getTime())) return 'Sin fecha';
  return fecha.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();
const GPS_STALE_MS = 3 * 60 * 1000;

/*
  Estas dos funciones hacían `new Date(timestamp)` sobre el string crudo de
  SQLite. Ese string es UTC pero no lo declara, así que Chrome lo leía como
  hora local: en Tucumán (UTC-3) toda fecha quedaba 3 horas adelantada y la
  antigüedad daba negativa o disparatada. Con el umbral de 3 minutos, el
  resultado práctico era que **todos los riders figuraban con "GPS atrasado"
  todo el tiempo**, aunque estuvieran transmitiendo bien. En Safari era peor:
  Invalid Date → NaN → todas las comparaciones falsas → mismo cartel rojo.

  `msDesde` (lib/fechas.js) normaliza y devuelve null cuando la fecha no se
  puede interpretar, que es distinto de "hace mucho".
*/
function gpsMeta(timestamp) {
  const age = msDesde(timestamp);
  if (age === null) return { label: 'Sin GPS', tone: 'slate' };
  if (age <= GPS_STALE_MS) return { label: 'GPS fresco', tone: 'emerald' };
  if (age <= GPS_STALE_MS * 3) return { label: 'GPS demorado', tone: 'amber' };
  return { label: 'GPS atrasado', tone: 'rose' };
}

function riderGpsStatus(repartidor) {
  const age = msDesde(repartidor?.ultima_ubicacion_en);
  if (age === null) return { label: 'Sin GPS', tone: 'slate', stale: true };
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
    gpsAt: parseFechaServidor(repartidor?.ultima_ubicacion_en).getTime() || 0,
    gpsReciente: (msDesde(repartidor?.ultima_ubicacion_en) ?? Infinity) <= GPS_STALE_MS,
  };
}

function riderBadges(repartidor, pedido, loads, lastMap) {
  const score = riderScore(repartidor, pedido, loads, lastMap);
  const badges = [];
  if (score.zoneMatch) badges.push('Mejor zona');
  if (score.load === 0) badges.push('Libre');
  // Antes alcanzaba con que existiera un timestamp: un rider con la última
  // posición de ayer igual mostraba "GPS reciente". Ahora se compara la edad
  // real contra el mismo umbral que usa el semáforo de GPS.
  if (score.gpsReciente) badges.push('GPS reciente');
  return badges.slice(0, 2);
}

function AvatarDisplay({ url, nombre, size = 'h-24 w-24' }) {
  if (url) {
    return (
      <div className={`${size} overflow-hidden rounded-xl bg-gray-100`}>
        <img src={url} className="h-full w-full object-cover object-center" alt={nombre} />
      </div>
    );
  }
  return (
    <div
      className={`${size} flex items-center justify-center rounded-xl bg-gray-200 text-[18px] font-semibold text-gray-600`}
    >
      {nombre?.[0]?.toUpperCase() || <User size={18} strokeWidth={STROKE} />}
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
  const tono = estadoTono(pedido.estado);
  const rutaUrl = pedido.cliente_direccion
    ? buildGoogleMapsDirectionsUrl(
        {
          latitud: pedido.cliente_latitud,
          longitud: pedido.cliente_longitud,
          direccion: pedido.cliente_direccion,
          ubicacionExacta: Boolean(pedido.cliente_ubicacion_exacta),
        },
        {
          localidad: mapConfig?.negocio_localidad,
          provincia: mapConfig?.negocio_provincia,
        }
      )
    : null;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:shadow-[0_4px_14px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold tabular-nums text-gray-900">
              #{pedido.numero}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: tono.bg, color: tono.fg }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: tono.dot }}
                aria-hidden="true"
              />
              {tono.label}
            </span>
          </div>
          <p className="mt-1 truncate text-[13px] text-gray-700">
            {pedido.cliente_nombre || 'Cliente sin nombre'}
          </p>
        </div>
        <span className="shrink-0 text-[15px] font-bold tabular-nums text-gray-900">
          {fmt(pedido.total)}
        </span>
      </div>

      <div className="mt-2 flex items-start gap-1.5 text-[12px] leading-4 text-gray-500">
        <MapPinned size={13} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-gray-400" />
        <span className="line-clamp-2">{pedido.cliente_direccion || 'Sin dirección cargada'}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
        <span className="inline-flex items-center gap-1">
          <Clock3 size={12} strokeWidth={STROKE} />
          {safeTime(pedido.creado_en)} hs
        </span>
        {pedido.hora_entrega ? <span>Entrega {pedido.hora_entrega}</span> : null}
        {pedido.delivery_zona ? <span>{pedido.delivery_zona}</span> : null}
        {Number(pedido.tiempo_estimado_min || 0) > 0 ? (
          <span>ETA {pedido.tiempo_estimado_min} min</span>
        ) : null}
        {pedido.estado === 'en_camino' ? (
          <span
            className={
              pedidoGps.tone === 'emerald'
                ? 'text-emerald-600'
                : pedidoGps.tone === 'amber'
                  ? 'text-amber-600'
                  : pedidoGps.tone === 'rose'
                    ? 'text-rose-600'
                    : 'text-gray-400'
            }
          >
            {pedidoGps.label}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {pedido.estado === 'listo' && !pedido.repartidor_id ? (
          <>
            <button
              type="button"
              onClick={() => onAutoAssign(pedido.id)}
              disabled={assigningAuto}
              style={{ background: BRAND }}
              className="h-10 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {assigningAuto ? 'Asignando…' : 'Asignar auto'}
            </button>
            <button
              type="button"
              onClick={() => onPick(pedido)}
              className="h-10 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Elegir rider
            </button>
          </>
        ) : null}
        {pedido.estado === 'listo' && pedido.repartidor_id ? (
          <button
            type="button"
            onClick={() => onDispatch(pedido.id)}
            disabled={submittingActionId === pedido.id}
            style={{ background: BRAND }}
            className="h-10 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {submittingActionId === pedido.id ? 'Despachando…' : 'Despachar'}
          </button>
        ) : null}
        {pedido.estado === 'en_camino' ? (
          <button
            type="button"
            onClick={() => onDeliver(pedido)}
            disabled={submittingActionId === pedido.id}
            className="h-10 rounded-xl bg-emerald-600 px-4 text-[13px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submittingActionId === pedido.id ? 'Guardando…' : 'Marcar entregado'}
          </button>
        ) : null}
        {rutaUrl ? (
          <a
            href={rutaUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            <Navigation size={14} strokeWidth={STROKE} />
            Ruta
          </a>
        ) : null}
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
        // Solo delivery: antes se pedian 100 pedidos de cualquier tipo y se
        // filtraban aca, asi que un dia con mucho mostrador dejaba el panel
        // vacio o con el historial cortado.
        api.get('/pedidos?tipo_entrega=delivery&limit=100'),
      ]);
      setRepartidores(reps || []);
      setPedidos(peds || []);
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar el panel de delivery');
    }
  };

  /**
   * Recarga con freno.
   *
   * Los tres eventos de socket llamaban directo a `cargar`, y cada llamada
   * son dos requests completos. El problema estaba en
   * `repartidor_ubicacion_admin`: los riders reportan posición cada pocos
   * segundos, así que con dos riders en la calle esta pantalla le pegaba al
   * servidor unas veinte veces por minuto para redibujar un puntito en el
   * mapa.
   *
   * Ahora se agrupan: no importa cuántos eventos lleguen, se recarga como
   * mucho una vez por segundo.
   */
  const recargaPendiente = useRef(null);
  const recargarConFreno = useCallback(() => {
    if (recargaPendiente.current) return;
    recargaPendiente.current = window.setTimeout(() => {
      recargaPendiente.current = null;
      cargar();
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (recargaPendiente.current) window.clearTimeout(recargaPendiente.current);
    },
    []
  );

  useAuthenticatedSocket({
    nuevo_pedido: recargarConFreno,
    pedido_actualizado_admin: recargarConFreno,
    repartidor_ubicacion_admin: recargarConFreno,
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
        const timestamp =
          parseFechaServidor(pedido.actualizado_en || pedido.creado_en).getTime() || 0;
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
    } catch (error) {
      toast.error(error?.error || 'Error al subir imagen');
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
    } catch (error) {
      toast.error(error?.error || 'No se pudo cambiar la disponibilidad');
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
      items: listosSinAsignar,
      urgente: true,
      empty: 'Nada frenado esperando rider.',
    },
    {
      key: 'asignados',
      title: 'Listos para despachar',
      items: listosAsignados,
      empty: 'Nada reservado para salir.',
    },
    {
      key: 'en_camino',
      title: 'En camino',
      items: enCamino,
      empty: 'Nadie en la calle ahora mismo.',
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
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      {/*
        Flex + `order` en vez de reordenar el JSX: la mesa de despacho es
        donde realmente se trabaja, así que va apenas debajo de las métricas.
        El radar y la flota son consulta y quedan abajo.
      */}
      <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-10">
        {/* ── Encabezado ── */}
        <div className="order-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Delivery</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {activos.length === 0
                ? 'No hay envíos en curso'
                : `${activos.length} ${activos.length === 1 ? 'envío activo' : 'envíos activos'} · ${ridersReady} de ${repartidoresActivos.length} riders libres`}
            </p>
          </div>
          <div className="flex gap-2">
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  setForm(emptyForm);
                  setModal({ mode: 'create' });
                }}
                style={{ background: BRAND }}
                className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
              >
                <UserPlus size={16} strokeWidth={STROKE} />
                Nuevo rider
              </button>
            ) : null}
            <button
              type="button"
              onClick={cargar}
              className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              <RefreshCw size={16} strokeWidth={STROKE} />
              Actualizar
            </button>
          </div>
        </div>

        {/*
          Cinco métricas del mismo tamaño no ordenan nada: todas gritan igual.
          Lo único accionable acá es "hay pedidos listos sin rider", porque es
          plata frenada en el mostrador. Va primero y en rojo sólo cuando
          efectivamente hay alguno; el resto es contexto en gris.
        */}
        <div className="order-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Sin rider asignado',
              value: listosSinAsignar.length,
              helper:
                listosSinAsignar.length > 0
                  ? 'Pedidos listos frenados en el mostrador'
                  : 'Todo lo que está listo tiene rider',
              alerta: listosSinAsignar.length > 0,
            },
            {
              label: 'Listos para salir',
              value: listosAsignados.length,
              helper: 'Con rider asignado, esperando salida',
            },
            {
              label: 'En viaje',
              value: enCamino.length,
              helper: 'Rumbo al cliente ahora mismo',
            },
            {
              label: 'GPS a revisar',
              value: ridersGpsStale,
              helper: `${ridersBusy} ${ridersBusy === 1 ? 'rider ocupado' : 'riders ocupados'} en reparto`,
              alerta: ridersGpsStale > 0,
            },
          ].map((metrica) => (
            <div
              key={metrica.label}
              className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
            >
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: metrica.alerta ? BRAND : '#E5E7EB' }}
              />
              <div className="pl-2">
                <p className="text-[12px] text-gray-500">{metrica.label}</p>
                <p
                  className="mt-1 text-[28px] font-bold leading-none tabular-nums tracking-tight"
                  style={{ color: metrica.alerta ? BRAND : '#111827' }}
                >
                  {metrica.value}
                </p>
                <p className="mt-1.5 text-[11px] text-gray-400">{metrica.helper}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="order-4 grid gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900">Radar de calle</h3>
                <p className="mt-0.5 text-[12px] text-gray-500">
                  Seguimiento del pedido que está en la calle
                </p>
              </div>
              {selectedRadarPedido?.cliente_direccion ? (
                <a
                  href={buildGoogleMapsDirectionsUrl(
                    {
                      latitud: selectedRadarPedido.cliente_latitud,
                      longitud: selectedRadarPedido.cliente_longitud,
                      direccion: selectedRadarPedido.cliente_direccion,
                      ubicacionExacta: Boolean(selectedRadarPedido.cliente_ubicacion_exacta),
                    },
                    {
                      localidad: appConfig?.negocio_localidad,
                      provincia: appConfig?.negocio_provincia,
                    }
                  )}
                  target="_blank"
                  rel="noreferrer"
                  style={{ background: BRAND }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
                >
                  <Navigation size={14} strokeWidth={STROKE} />
                  Abrir ruta
                </a>
              ) : null}
            </div>

            {selectedRadarPedido ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr,300px]">
                  <div className="overflow-hidden rounded-xl border border-gray-100">
                    {selectedRadarPedido.cliente_direccion ? (
                      <LocationPreview
                        direccion={selectedRadarPedido.cliente_direccion}
                        appConfig={appConfig}
                        label={`Pedido #${selectedRadarPedido.numero}`}
                      />
                    ) : (
                      <div className="flex h-[240px] items-center justify-center text-[13px] text-gray-400">
                        Sin dirección cargada para este pedido
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-gray-50 p-4">
                    <div className="flex items-baseline justify-between">
                      <p className="text-[20px] font-semibold tabular-nums text-gray-900">
                        #{selectedRadarPedido.numero}
                      </p>
                      <p className="text-[15px] font-bold tabular-nums text-gray-900">
                        {fmt(selectedRadarPedido.total)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[13px] text-gray-500">
                      {selectedRadarPedido.cliente_nombre || 'Cliente sin nombre'}
                    </p>
                    <dl className="mt-4 space-y-2.5 text-[13px]">
                      <div>
                        <dt className="text-[11px] text-gray-400">Dirección</dt>
                        <dd className="mt-0.5 leading-5 text-gray-700">
                          {selectedRadarPedido.cliente_direccion || 'Sin dirección'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-gray-400">Rider</dt>
                        <dd className="mt-0.5 text-gray-700">
                          {selectedRadarPedido.repartidor_nombre || 'Sin asignar'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-gray-400">Estado</dt>
                        <dd className="mt-0.5 text-gray-700">
                          {estadoTono(selectedRadarPedido.estado).label}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {radarPedidos.length > 1 ? (
                  <div className="grid gap-2 md:grid-cols-3">
                    {radarPedidos.slice(0, 6).map((pedido) => {
                      const active = pedido.id === selectedRadarPedido?.id;
                      const gps = gpsMeta(pedido?.repartidor_ubicacion_en);
                      const sinRider = !pedido.repartidor_id;
                      return (
                        <button
                          type="button"
                          key={`radar-${pedido.id}`}
                          onClick={() => setSelectedRadarPedidoId(pedido.id)}
                          style={active ? { borderColor: BRAND } : undefined}
                          className={`rounded-xl border px-3 py-3 text-left transition ${
                            active ? 'bg-white' : 'border-gray-100 bg-white hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[14px] font-semibold tabular-nums text-gray-900">
                              #{pedido.numero}
                            </span>
                            <span
                              className="text-[11px]"
                              style={{ color: sinRider ? BRAND : '#6B7280' }}
                            >
                              {pedido.estado === 'en_camino'
                                ? 'En viaje'
                                : sinRider
                                  ? 'Sin rider'
                                  : 'Asignado'}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[12px] text-gray-500">
                            {pedido.cliente_nombre || 'Cliente'}
                          </p>
                          <p className="mt-1.5 line-clamp-1 text-[11px] text-gray-400">
                            {pedido.cliente_direccion || 'Sin dirección cargada'}
                          </p>
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                            <span
                              className={
                                gps.tone === 'emerald'
                                  ? 'text-emerald-600'
                                  : gps.tone === 'amber'
                                    ? 'text-amber-600'
                                    : gps.tone === 'rose'
                                      ? 'text-rose-600'
                                      : 'text-gray-400'
                              }
                            >
                              {gps.label}
                            </span>
                            <span className="font-medium tabular-nums text-gray-700">
                              {fmt(pedido.total)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-[13px] text-gray-400">
                No hay pedidos activos en la calle ahora mismo.
              </div>
            )}
          </div>
        </div>

        {/* ── Flota ── */}
        <div className="order-5 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900">Riders</h3>
              <p className="mt-0.5 text-[12px] text-gray-500">
                {repartidoresActivos.length} activos · {ridersReady} libres
              </p>
            </div>
          </div>

          {repartidoresActivos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-[13px] text-gray-400">
              Todavía no cargaste ningún rider.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {repartidoresActivos.map((repartidor) => {
                const gps = riderGpsStatus(repartidor);
                const carga = Number(riderLoads[repartidor.id] || 0);
                return (
                  <div
                    key={repartidor.id}
                    className="group rounded-xl border border-gray-100 p-3 transition hover:border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <AvatarDisplay
                          url={repartidor.avatar_url}
                          nombre={repartidor.nombre}
                          size="h-12 w-12"
                        />
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white"
                          style={{ background: repartidor.disponible ? '#10B981' : '#F59E0B' }}
                          aria-hidden="true"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[14px] font-semibold text-gray-900">
                            {repartidor.nombre}
                          </p>
                          <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              title="Editar rider"
                              onClick={() => {
                                setForm({ ...repartidor });
                                setModal({ mode: 'edit', repartidor });
                              }}
                              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                            >
                              <Pencil size={14} strokeWidth={STROKE} />
                            </button>
                            <button
                              type="button"
                              title="Eliminar rider"
                              onClick={() => eliminarRider(repartidor)}
                              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 size={14} strokeWidth={STROKE} />
                            </button>
                          </div>
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-[12px] text-gray-500">
                          <Bike size={12} strokeWidth={STROKE} />
                          {repartidor.vehiculo || 'Sin vehículo'}
                          {repartidor.zona_preferida ? ` · ${repartidor.zona_preferida}` : ''}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                          <span
                            className={
                              gps.tone === 'emerald'
                                ? 'text-emerald-600'
                                : gps.tone === 'amber'
                                  ? 'text-amber-600'
                                  : gps.tone === 'rose'
                                    ? 'text-rose-600'
                                    : 'text-gray-400'
                            }
                          >
                            {gps.label}
                          </span>
                          <span>·</span>
                          <span>
                            {carga} {carga === 1 ? 'pedido activo' : 'pedidos activos'}
                          </span>
                          <span>·</span>
                          <span className="font-mono select-all">
                            PIN {repartidor.codigo_acceso}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleDisponible(repartidor)}
                        className={`h-9 flex-1 rounded-xl text-[12px] font-semibold transition ${
                          repartidor.disponible
                            ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {repartidor.disponible ? 'Disponible' : 'En reparto'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailModal(repartidor)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                      >
                        <Smartphone size={14} strokeWidth={STROKE} />
                        Ficha
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Mesa de despacho ── */}
        <div className="order-3 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900">Mesa de despacho</h3>
              <p className="mt-0.5 text-[12px] text-gray-500">
                Las salidas del local, de izquierda a derecha
              </p>
            </div>
            <div className="flex w-fit rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setTab('activos')}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${tab === 'activos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Activos ({activos.length})
              </button>
              <button
                type="button"
                onClick={() => setTab('historial')}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${tab === 'historial' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Historial ({historial.length})
              </button>
            </div>
          </div>

          {tab === 'activos' ? (
            <div className="grid gap-4 xl:grid-cols-3">
              {columns.map((column) => (
                <div key={column.key} className="rounded-xl bg-gray-50 p-3">
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h4 className="text-[13px] font-semibold text-gray-700">{column.title}</h4>
                    <span
                      className="flex h-6 min-w-[24px] items-center justify-center rounded-lg px-1.5 text-[12px] font-semibold tabular-nums"
                      style={
                        column.urgente && column.items.length > 0
                          ? { background: BRAND, color: '#fff' }
                          : { background: '#E5E7EB', color: '#4B5563' }
                      }
                    >
                      {column.items.length}
                    </span>
                  </div>
                  <div className="space-y-2.5">
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
                      <div className="py-10 text-center text-[12px] text-gray-400">
                        {column.empty}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : historial.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center text-[13px] text-gray-400">
              Todavía no hay entregas cerradas para mostrar.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-gray-50 text-[11px] text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Pedido</th>
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">Rider</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historial.map((pedido) => (
                    <tr key={pedido.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium tabular-nums text-gray-900">
                        #{pedido.numero}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{pedido.cliente_nombre || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{pedido.repartidor_nombre || '—'}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">
                        {fmt(pedido.total)}
                      </td>
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
          className="fixed inset-0 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          style={{ zIndex: Z.modal }}
          onClick={() => setModal(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h3 className="text-[17px] font-semibold text-gray-900">
                  {modal.mode === 'edit' ? 'Editar rider' : 'Nuevo rider'}
                </h3>
                <p className="mt-0.5 text-[12px] text-gray-500">
                  Datos de contacto, zona y acceso a la app
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} strokeWidth={STROKE} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[150px_1fr]">
                <div className="flex flex-col items-center gap-2">
                  <div className="relative">
                    <AvatarDisplay
                      url={form.avatar_url}
                      nombre={form.nombre}
                      size="h-28 w-28 text-[32px]"
                    />
                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpen(true)}
                      style={{ background: BRAND }}
                      className="absolute -bottom-1.5 -right-1.5 flex h-9 w-9 items-center justify-center rounded-xl border-2 border-white text-white transition hover:brightness-110"
                    >
                      <Camera size={16} strokeWidth={STROKE} />
                    </button>
                  </div>
                  <p className="text-center text-[11px] leading-4 text-gray-400">
                    Una foto clara ayuda a identificarlo en la calle
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="text-[12px] font-medium text-gray-600">Nombre completo</label>
                    <input
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      className={CONTROL + ' mt-1'}
                      placeholder="Ej: Carlos Rodríguez"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-gray-600">
                      WhatsApp / celular
                    </label>
                    <input
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      className={CONTROL + ' mt-1'}
                      placeholder="3811234567"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-gray-600">Vehículo</label>
                    <input
                      value={form.vehiculo}
                      onChange={(e) => setForm({ ...form, vehiculo: e.target.value })}
                      className={CONTROL + ' mt-1'}
                      placeholder="Motomel Blitz 110"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[12px] font-medium text-gray-600">
                      PIN de acceso a la app
                    </label>
                    <input
                      value={form.codigo_acceso || ''}
                      onChange={(e) => setForm({ ...form, codigo_acceso: e.target.value })}
                      className={CONTROL + ' mt-1 font-mono tracking-widest'}
                      placeholder="Ej: 9235ce31"
                    />
                    <p className="mt-1 text-[11px] text-gray-400">
                      Es la clave con la que el rider entra desde su celular. Si lo dejás vacío se
                      genera solo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <div className="mb-3 flex items-center gap-2">
                  <MapIcon size={16} strokeWidth={STROKE} className="text-gray-400" />
                  <h4 className="text-[13px] font-semibold text-gray-900">Domicilio y zona</h4>
                </div>

                <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[12px] font-medium text-gray-600">Dirección</label>
                      <div className="relative mt-1">
                        <input
                          value={form.direccion}
                          onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                          className={CONTROL + ' pl-9'}
                          placeholder="Ej: San Martín 123, Monteros"
                        />
                        <MapPin
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          size={15}
                          strokeWidth={STROKE}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[12px] font-medium text-gray-600">
                          Zona preferida
                        </label>
                        <input
                          value={form.zona_preferida}
                          onChange={(e) => setForm({ ...form, zona_preferida: e.target.value })}
                          className={CONTROL + ' mt-1'}
                          placeholder="Centro / Sur"
                        />
                      </div>
                      <div>
                        <label className="text-[12px] font-medium text-gray-600">
                          Fecha de ingreso
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

                  <div className="h-44 overflow-hidden rounded-xl border border-gray-100">
                    <LocationPreview
                      direccion={form.direccion}
                      appConfig={appConfig}
                      label="Domicilio del rider"
                      compact
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <div className="mb-3 flex items-center gap-2">
                  <FileText size={16} strokeWidth={STROKE} className="text-gray-400" />
                  <h4 className="text-[13px] font-semibold text-gray-900">Notas internas</h4>
                </div>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  className={CONTROL + ' h-24 resize-none py-2.5'}
                  placeholder="Seguro, licencia, observaciones de desempeño…"
                />
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarRider}
                disabled={savingRider}
                style={{ background: BRAND }}
                className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              >
                {savingRider
                  ? 'Guardando…'
                  : modal.mode === 'edit'
                    ? 'Guardar cambios'
                    : 'Crear rider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE (VIEW MODE) ── */}
      {detailModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
          style={{ zIndex: Z.modal }}
          onClick={() => setDetailModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
              <div className="flex min-w-0 items-center gap-3">
                <AvatarDisplay
                  url={detailModal.avatar_url}
                  nombre={detailModal.nombre}
                  size="h-14 w-14 text-[20px]"
                />
                <div className="min-w-0">
                  <h3 className="truncate text-[17px] font-semibold text-gray-900">
                    {detailModal.nombre}
                  </h3>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <Smartphone size={12} strokeWidth={STROKE} />
                      {detailModal.telefono || 'Sin teléfono'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Bike size={12} strokeWidth={STROKE} />
                      {detailModal.vehiculo || 'Sin vehículo'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} strokeWidth={STROKE} />
                      {fechaCorta(detailModal.fecha_ingreso)}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} strokeWidth={STROKE} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      buildPublicAppUrl(
                        `/rider/${detailModal.id}/${detailModal.codigo_acceso}`,
                        appConfig
                      ),
                      '_blank'
                    )
                  }
                  style={{ background: BRAND }}
                  className="h-10 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
                >
                  Abrir app del rider
                </button>
                <button
                  type="button"
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
                  className="h-10 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  Copiar link
                </button>
                {detailModal.telefono ? (
                  <button
                    type="button"
                    onClick={() => window.open(`https://wa.me/${detailModal.telefono}`, '_blank')}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
                  >
                    <Phone size={14} strokeWidth={STROKE} />
                    WhatsApp
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-[12px] text-gray-500">Acceso a la app</p>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-gray-400">ID</p>
                      <p className="text-[17px] font-semibold tabular-nums text-gray-900">
                        #{detailModal.id}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-gray-400">PIN</p>
                      <p className="select-all font-mono text-[17px] font-semibold tracking-wider text-gray-900">
                        {detailModal.codigo_acceso}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] leading-4 text-gray-500">
                    Desde el celular abrí el link y luego instalá la app desde el navegador para que
                    funcione la ubicación en vivo.
                  </p>
                </div>

                <div className="h-40 overflow-hidden rounded-xl border border-gray-100">
                  <LocationPreview
                    direccion={detailModal.direccion}
                    appConfig={appConfig}
                    label="Domicilio"
                    compact
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-[12px] text-gray-500">Entregas registradas</p>
                  <p className="mt-1 text-[22px] font-bold tabular-nums text-gray-900">
                    {detailRiderStats.entregas}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-[12px] text-gray-500">En reparto ahora</p>
                  <p className="mt-1 text-[22px] font-bold tabular-nums text-gray-900">
                    {detailRiderStats.activos}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Selector de Avatar */}
      {avatarPickerOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          style={{ zIndex: Z.modalSobreModal }}
        >
          <div className="flex max-h-[80vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
              <h3 className="text-[17px] font-semibold text-gray-900">Foto del rider</h3>
              <button
                type="button"
                onClick={() => setAvatarPickerOpen(false)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} strokeWidth={STROKE} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current.click()}
                  className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 transition hover:border-gray-400 hover:bg-gray-50"
                >
                  <Camera size={20} strokeWidth={STROKE} className="text-gray-400" />
                  <span className="text-[12px] font-medium text-gray-500">Subir foto</span>
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
                    type="button"
                    key={idx}
                    onClick={() => {
                      setForm({ ...form, avatar_url: av });
                      setAvatarPickerOpen(false);
                    }}
                    style={form.avatar_url === av ? { borderColor: BRAND } : undefined}
                    className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-gray-100 transition ${
                      form.avatar_url === av
                        ? ''
                        : 'border-transparent opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={av}
                      className="h-full w-full object-cover object-center"
                      alt={`avatar-${idx}`}
                    />
                    {form.avatar_url === av && (
                      <span
                        className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full text-white"
                        style={{ background: BRAND }}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 justify-end border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setAvatarPickerOpen(false)}
                className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/*
        Este modal existía a medias: el botón "Elegir rider" seteaba el estado
        y el ranking `repartidoresSugeridos` ya estaba calculado, pero nunca
        se renderizaba nada. El botón no hacía absolutamente nada.
      */}
      {asignarModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          style={{ zIndex: Z.modal }}
          onClick={() => setAsignarModal(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
              <div className="min-w-0">
                <h3 className="text-[17px] font-semibold text-gray-900">
                  Asignar rider al #{asignarModal.numero}
                </h3>
                <p className="mt-0.5 truncate text-[12px] text-gray-500">
                  {asignarModal.cliente_direccion || 'Sin dirección cargada'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAsignarModal(null)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} strokeWidth={STROKE} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-4">
              {repartidoresSugeridos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-6 py-10 text-center text-[13px] text-gray-400">
                  No hay riders disponibles ahora mismo.
                </div>
              ) : (
                repartidoresSugeridos.map((repartidor, idx) => {
                  const badges = riderBadges(
                    repartidor,
                    asignarModal,
                    riderLoads,
                    lastAssignmentByRider
                  );
                  const gps = riderGpsStatus(repartidor);
                  return (
                    <button
                      type="button"
                      key={`asignar-${repartidor.id}`}
                      onClick={() => asignarManual(repartidor.id, asignarModal.id)}
                      disabled={assigningManualId !== null}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-3 text-left transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <AvatarDisplay
                        url={repartidor.avatar_url}
                        nombre={repartidor.nombre}
                        size="h-11 w-11 text-[16px]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[14px] font-semibold text-gray-900">
                            {repartidor.nombre}
                          </p>
                          {idx === 0 ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                              style={{ background: BRAND }}
                            >
                              Sugerido
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-gray-500">
                          {repartidor.vehiculo || 'Sin vehículo'}
                          {repartidor.zona_preferida ? ` · ${repartidor.zona_preferida}` : ''}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {[gps.label, ...badges].join(' · ')}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12px] font-medium text-gray-500 tabular-nums">
                        {Number(riderLoads[repartidor.id] || 0)} act.
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex shrink-0 justify-between gap-2 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => {
                  autoAsignar(asignarModal.id);
                  setAsignarModal(null);
                }}
                disabled={assigningAuto}
                className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
              >
                Que elija el sistema
              </button>
              <button
                type="button"
                onClick={() => setAsignarModal(null)}
                className="h-11 rounded-xl px-5 text-[13px] font-semibold text-gray-500 transition hover:text-gray-800"
              >
                Cancelar
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
