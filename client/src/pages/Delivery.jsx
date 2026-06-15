import { useEffect, useMemo, useState, useRef } from 'react';
import api from '../lib/api.js';
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
  History, 
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
import { useAuth } from '../context/AuthContext.jsx';
import { useAuthenticatedSocket } from '../hooks/useAuthenticatedSocket.js';

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

const AVATARS = [user1, user2, user3, user4, user5, user6, user7, user8, user9, user10, user11, user12];

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
  fecha_ingreso: ''
};

const CONTROL = 'h-12 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-bold text-gray-700 outline-none transition focus:border-[#5D87FF] focus:ring-4 focus:ring-[#5D87FF]/10';

const safeTime = (value) => { 
  try { return value ? format(parseISO(value), 'HH:mm') : '--:--'; } 
  catch { return '--:--'; } 
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

function riderScore(repartidor, pedido, loads, lastMap) {
  const targetZone = normalizeText(pedido?.delivery_zona || pedido?.cliente_direccion);
  const preferredZone = normalizeText(repartidor?.zona_preferida);
  return {
    zoneMatch: Boolean(targetZone && preferredZone && (targetZone.includes(preferredZone) || preferredZone.includes(targetZone))),
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
    return <img src={url} className={`${size} rounded-2xl object-cover shadow-lg`} alt={nombre} />;
  }
  return (
    <div className={`${size} rounded-2xl flex items-center justify-center font-black text-3xl text-white shadow-lg bg-gray-400`}>
      {nombre?.[0]?.toUpperCase() || <User />}
    </div>
  );
}

function DispatchCard({ pedido, assigningAuto, submittingActionId, onAutoAssign, onPick, onDispatch, onDeliver }) {
  return (
    <div className="rounded-[24px] border border-white/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Pedido</p>
          <p className="mt-1 text-lg font-black text-slate-900">#{pedido.numero}</p>
        </div>
        <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${pedido.estado === 'en_camino' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
          {pedido.estado === 'en_camino' ? 'En viaje' : 'Listo'}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-black uppercase tracking-tight text-slate-900">{pedido.cliente_nombre || 'Cliente sin nombre'}</p>
          <div className="mt-1 flex items-start gap-2 text-xs font-semibold text-slate-500">
            <MapPinned size={13} className="mt-0.5 flex-shrink-0" />
            <span>{pedido.cliente_direccion || 'Sin direccion cargada'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          <div className="flex items-center gap-2"><Clock3 size={13} /><span>{safeTime(pedido.creado_en)} hs</span></div>
          <div className="font-black text-slate-900">{fmt(pedido.total)}</div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {pedido.estado === 'listo' && !pedido.repartidor_id ? (
            <>
              <button onClick={() => onAutoAssign(pedido.id)} disabled={assigningAuto} className="h-11 rounded-2xl bg-[#5D87FF] px-5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-100 disabled:opacity-50 hover:bg-[#4570EA] transition-all">
                {assigningAuto ? '...' : 'Auto'}
              </button>
              <button onClick={() => onPick(pedido)} className="h-11 rounded-2xl border border-slate-200 bg-white px-5 text-[11px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all">
                Elegir
              </button>
            </>
          ) : null}
          {pedido.estado === 'listo' && pedido.repartidor_id ? (
            <button onClick={() => onDispatch(pedido.id)} disabled={submittingActionId === pedido.id} className="h-11 rounded-2xl bg-[#5D87FF] px-5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-100 disabled:opacity-50 hover:bg-[#4570EA] transition-all">
              {submittingActionId === pedido.id ? '...' : 'Despachar'}
            </button>
          ) : null}
          {pedido.estado === 'en_camino' ? (
            <button onClick={() => onDeliver(pedido)} disabled={submittingActionId === pedido.id} className="h-11 rounded-2xl bg-[#13DEB9] px-5 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-100 disabled:opacity-50 hover:bg-[#0EB795] transition-all">
              {submittingActionId === pedido.id ? '...' : 'Entregar'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Delivery() {
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
  const fileInputRef = useRef(null);

  const cargar = async () => {
    try {
      const [reps, peds] = await Promise.all([api.get('/repartidores'), api.get('/pedidos?limit=100')]);
      setRepartidores(reps || []);
      setPedidos(peds || []);
    } catch {
      toast.error('No se pudo cargar el panel de delivery');
    }
  };

  useAuthenticatedSocket({ nuevo_pedido: cargar, pedido_actualizado_admin: cargar, repartidor_ubicacion_admin: cargar });
  useEffect(() => { cargar(); }, []);

  const repartidoresActivos = useMemo(() => repartidores.filter((item) => item.activo), [repartidores]);
  const repartidoresDisponibles = useMemo(() => repartidoresActivos.filter((item) => item.disponible), [repartidoresActivos]);
  const pedidosDelivery = useMemo(() => pedidos.filter((pedido) => pedido.tipo_entrega === 'delivery'), [pedidos]);
  const activos = useMemo(() => pedidosDelivery.filter((pedido) => ['listo', 'en_camino'].includes(pedido.estado)), [pedidosDelivery]);
  const listosSinAsignar = useMemo(() => activos.filter((pedido) => pedido.estado === 'listo' && !pedido.repartidor_id), [activos]);
  const listosAsignados = useMemo(() => activos.filter((pedido) => pedido.estado === 'listo' && pedido.repartidor_id), [activos]);
  const enCamino = useMemo(() => activos.filter((pedido) => pedido.estado === 'en_camino'), [activos]);
  const historial = useMemo(() => pedidosDelivery.filter((pedido) => pedido.estado === 'entregado').slice(0, 20), [pedidosDelivery]);

  const riderLoads = useMemo(() => pedidosDelivery.reduce((acc, pedido) => {
    if (!pedido.repartidor_id || !['listo', 'en_camino'].includes(pedido.estado)) return acc;
    acc[pedido.repartidor_id] = (acc[pedido.repartidor_id] || 0) + 1;
    return acc;
  }, {}), [pedidosDelivery]);

  const lastAssignmentByRider = useMemo(() => pedidosDelivery.reduce((acc, pedido) => {
    if (!pedido.repartidor_id) return acc;
    const timestamp = new Date(pedido.actualizado_en || pedido.creado_en || 0).getTime() || 0;
    acc[pedido.repartidor_id] = Math.max(acc[pedido.repartidor_id] || 0, timestamp);
    return acc;
  }, {}), [pedidosDelivery]);

  const repartidoresSugeridos = useMemo(() => {
    if (!asignarModal) return repartidoresDisponibles;
    return [...repartidoresDisponibles].sort((a, b) => {
      const scoreA = riderScore(a, asignarModal, riderLoads, lastAssignmentByRider);
      const scoreB = riderScore(b, asignarModal, riderLoads, lastAssignmentByRider);
      if (scoreA.zoneMatch !== scoreB.zoneMatch) return scoreA.zoneMatch ? -1 : 1;
      if (scoreA.load !== scoreB.load) return scoreA.load - scoreB.load;
      if (scoreA.lastAssignedAt !== scoreB.lastAssignedAt) return scoreA.lastAssignedAt - scoreB.lastAssignedAt;
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
    formData.append('imagen', file);
    try {
      const res = await api.post('/productos/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setForm({ ...form, avatar_url: res.url });
      toast.success('Imagen cargada');
    } catch {
      toast.error('Error al subir imagen');
    }
  };

  const eliminarRider = async (repartidor) => {
    if (!window.confirm(`¿Eliminar a ${repartidor.nombre}?`)) return;
    try {
      await api.delete(`/repartidores/${repartidor.id}`);
      toast.success('Rider eliminado');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo eliminar el rider');
    }
  };

  const toggleDisponible = async (repartidor) => {
    try {
      await api.put(`/repartidores/${repartidor.id}`, { ...repartidor, disponible: repartidor.disponible ? 0 : 1 });
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
    const payload = { estado: 'entregado' };
    if (pedido.entrega_pin) {
      const pin = window.prompt(`Ingresa el PIN de entrega del pedido #${pedido.numero}`);
      if (pin === null) return;
      payload.pin = pin;
    }
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

  const columns = [
    { key: 'sin_asignar', title: 'Listos sin rider', subtitle: 'Esperando asignación', items: listosSinAsignar, shell: 'border-rose-100 bg-rose-50/40', badge: 'bg-rose-100 text-rose-700', empty: 'No hay pedidos listos sin asignar.' },
    { key: 'asignados', title: 'Listos para despachar', subtitle: 'Reservados para salida', items: listosAsignados, shell: 'border-blue-100 bg-blue-50/30', badge: 'bg-blue-100 text-blue-700', empty: 'No hay pedidos listos con rider asignado.' },
    { key: 'en_camino', title: 'En camino', subtitle: 'Pedidos en viaje', items: enCamino, shell: 'border-emerald-100 bg-emerald-50/30', badge: 'bg-emerald-100 text-emerald-700', empty: 'No hay pedidos en camino ahora mismo.' },
  ];

  return (
    <div className="min-h-screen bg-[#F4F7FB] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8 pb-12">
        
        {/* Header Seccion */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3"><div className="h-8 w-1 rounded-full bg-[#5D87FF]"></div><p className="text-sm font-black uppercase tracking-[0.3em] text-[#5D87FF]">Logística de reparto</p></div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900 uppercase leading-none">Centro de Delivery</h1>
            <p className="mt-2 font-medium text-gray-500">{activos.length} envíos activos ahora mismo.</p>
          </div>
          <div className="flex gap-3">
            {canManage ? <button onClick={() => { setForm(emptyForm); setModal({ mode: 'create' }); }} className="flex h-12 items-center gap-2 rounded-2xl bg-[#5D87FF] px-6 text-sm font-black text-white shadow-lg shadow-blue-100 hover:bg-[#4570EA] active:scale-95 transition-all">
              <UserPlus size={18} strokeWidth={3} />NUEVO RIDER
            </button> : null}
            <button onClick={cargar} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-gray-100 bg-white text-gray-400 shadow-sm active:scale-90 transition-all"><RefreshCw size={18} /></button>
          </div>
        </div>

        {/* Metricas Rapidas */}
        <div className="grid gap-4 md:grid-cols-3 lg:gap-6">
          <div className="rounded-[32px] border border-rose-100 bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-500 mb-1">Sin rider</p><p className="text-3xl font-black text-gray-900">{listosSinAsignar.length}</p></div>
          <div className="rounded-[32px] border border-blue-100 bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5D87FF] mb-1">Listos</p><p className="text-3xl font-black text-gray-900">{listosAsignados.length}</p></div>
          <div className="rounded-[32px] border border-emerald-100 bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-1">En viaje</p><p className="text-3xl font-black text-gray-900">{enCamino.length}</p></div>
        </div>

        {/* Flota de Riders */}
        <div className="rounded-[40px] border border-gray-100 bg-white p-8 shadow-sm">
          <div className="mb-8 flex items-center justify-between">
            <h3 className="text-xl font-black uppercase tracking-tight text-gray-900">Nuestra Flota</h3>
            <div className="rounded-xl bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-600">{repartidoresActivos.length} riders activos</div>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {repartidoresActivos.map((repartidor) => (
              <div key={repartidor.id} className="group relative rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 text-center">
                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => { setForm({ ...repartidor }); setModal({ mode: 'edit', repartidor }); }} className="p-2 bg-blue-50 text-[#5D87FF] rounded-xl hover:bg-[#5D87FF] hover:text-white transition-colors"><Pencil size={14} /></button>
                  <button onClick={() => eliminarRider(repartidor)} className="p-2 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-colors"><Trash2 size={14} /></button>
                </div>

                <div className="mx-auto w-24 h-24 mb-4 relative">
                  <div className="w-full h-full rounded-[28px] overflow-hidden border-4 border-white shadow-lg relative z-10">
                    <AvatarDisplay url={repartidor.avatar_url} nombre={repartidor.nombre} size="w-full h-full" />
                  </div>
                  <div className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-lg border-2 border-white shadow-sm z-20 ${repartidor.disponible ? 'bg-emerald-500' : 'bg-[#5D87FF]'}`}></div>
                </div>

                <div className="mb-6">
                  <h4 className="font-black text-gray-900 uppercase tracking-tight text-lg truncate">{repartidor.nombre}</h4>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center justify-center gap-1"><Bike size={12} /> {repartidor.vehiculo || 'Sin vehículo'}</p>
                </div>

                {/* Credenciales */}
                <div className="mb-6 flex items-center gap-2 p-2.5 rounded-2xl bg-gray-50 border border-gray-100/50">
                  <div className="flex-1 text-left pl-2">
                    <p className="text-[8px] font-black text-gray-400 uppercase leading-none">ID</p>
                    <p className="text-sm font-black text-[#5D87FF] mt-0.5">#{repartidor.id}</p>
                  </div>
                  <div className="w-[1px] h-6 bg-gray-200"></div>
                  <div className="flex-1 text-right pr-2">
                    <p className="text-[8px] font-black text-gray-400 uppercase leading-none">PIN</p>
                    <p className="text-xs font-mono font-bold text-gray-800 mt-0.5 select-all">{repartidor.codigo_acceso}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => toggleDisponible(repartidor)} className={`h-11 rounded-2xl text-[10px] font-black uppercase transition-all ${repartidor.disponible ? 'bg-emerald-50 text-emerald-600 shadow-sm' : 'border-2 border-gray-100 text-gray-400'}`}>
                    {repartidor.disponible ? 'PRIORIDAD' : 'EN REPARTO'}
                  </button>
                  <button onClick={() => setDetailModal(repartidor)} className="h-11 rounded-2xl bg-gray-900 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all">
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
            <div><h3 className="text-xl font-black uppercase tracking-tight text-gray-900 leading-none">Mesa de Despacho</h3><p className="mt-2 text-sm font-medium text-gray-500">Organiza las salidas del local.</p></div>
            <div className="flex w-fit rounded-2xl bg-gray-100 p-1">
              <button onClick={() => setTab('activos')} className={`rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${tab === 'activos' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Activos ({activos.length})</button>
              <button onClick={() => setTab('historial')} className={`rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest transition-all ${tab === 'historial' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}>Historial</button>
            </div>
          </div>

          {tab === 'activos' ? (
            <div className="grid gap-6 xl:grid-cols-3">
              {columns.map((column) => (
                <div key={column.key} className={`rounded-[32px] border p-6 ${column.shell}`}>
                  <div className="mb-6 flex items-center justify-between">
                    <h4 className="text-lg font-black text-gray-900 uppercase tracking-tight">{column.title}</h4>
                    <div className={`h-8 min-w-[32px] rounded-lg flex items-center justify-center font-black text-xs ${column.badge}`}>{column.items.length}</div>
                  </div>
                  <div className="space-y-4">
                    {column.items.map((pedido) => (
                      <DispatchCard key={pedido.id} pedido={pedido} assigningAuto={assigningAuto} submittingActionId={submittingActionId} onAutoAssign={autoAsignar} onPick={setAsignarModal} onDispatch={marcarEnCamino} onDeliver={marcarEntregado} />
                    ))}
                    {column.items.length === 0 && <div className="py-12 text-center opacity-30 italic text-sm">{column.empty}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[32px] border border-gray-100">
              <table className="w-full text-left text-sm font-bold">
                <thead className="bg-gray-50 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400"><tr><th className="px-8 py-5">Orden</th><th className="px-8 py-5">Cliente</th><th className="px-8 py-5">Rider</th><th className="px-8 py-5 text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {historial.map((pedido) => <tr key={pedido.id} className="hover:bg-gray-50 transition-colors"><td className="px-8 py-5 text-gray-900">#{pedido.numero}</td><td className="px-8 py-5 uppercase tracking-tight text-xs">{pedido.cliente_nombre}</td><td className="px-8 py-5 text-gray-400 text-xs">{pedido.repartidor_nombre || '-'}</td><td className="px-8 py-5 text-right text-[#5D87FF]">{fmt(pedido.total)}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL FICHA REPARTIDOR (CREATE/EDIT) ── */}
      {modal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-md" onClick={() => setModal(null)}>
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-[40px] bg-white shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            {/* Header del Modal */}
            <div className="shrink-0 p-8 pb-4 flex items-center justify-between border-b border-gray-50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-1 bg-[#5D87FF] rounded-full"></div>
                  <p className="text-xs font-black text-[#5D87FF] uppercase tracking-[0.2em]">{modal.mode === 'edit' ? 'Actualizar Ficha' : 'Nuevo Repartidor'}</p>
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase leading-none">Gestión de Personal Delivery</h3>
              </div>
              <button onClick={() => setModal(null)} className="rounded-full p-2 bg-gray-50 text-gray-400 hover:bg-gray-100 transition-all"><X size={24} /></button>
            </div>

            {/* Contenido con Scroll */}
            <div className="flex-1 overflow-y-auto p-8 pt-6 space-y-10 no-scrollbar">
              
              {/* Bloque 1: Perfil y Foto */}
              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10 items-start">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                    <div className="h-44 w-44 rounded-[48px] overflow-hidden border-8 border-white shadow-2xl bg-gray-100 relative z-10">
                      <AvatarDisplay url={form.avatar_url} nombre={form.nombre} size="w-full h-full" />
                    </div>
                    <button onClick={() => setAvatarPickerOpen(true)} className="absolute -bottom-2 -right-2 h-12 w-12 bg-[#5D87FF] text-white rounded-2xl border-4 border-white shadow-lg flex items-center justify-center hover:bg-[#4570EA] transition-all active:scale-90 z-20"><Camera size={24} /></button>
                  </div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center px-4">Utiliza una foto clara para identificar al repartidor en la calle.</p>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                      <input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} className={CONTROL + " mt-1"} placeholder="Ej: Carlos Rodriguez" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp / Celular</label>
                      <input value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} className={CONTROL + " mt-1"} placeholder="3811234567" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Vehículo (Marca/Modelo)</label>
                      <input value={form.vehiculo} onChange={e => setForm({...form, vehiculo: e.target.value})} className={CONTROL + " mt-1"} placeholder="Motomel Blitz 110" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">PIN de acceso del rider</label>
                      <input value={form.codigo_acceso || ''} onChange={e => setForm({...form, codigo_acceso: e.target.value})} className={CONTROL + " mt-1 font-mono uppercase tracking-widest"} placeholder="Ej: 9235ce31" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloque 2: Residencia y Mapa */}
              <div className="pt-8 border-t border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center text-[#5D87FF]"><MapIcon size={18} strokeWidth={3} /></div>
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest leading-none">Información de Residencia</h4>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Dirección de Domicilio</label>
                      <div className="relative">
                        <input value={form.direccion} onChange={e => setForm({...form, direccion: e.target.value})} className={CONTROL + " mt-1 pl-10"} placeholder="Ej: Calle San Martín 123, Monteros" />
                        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Zona Operativa</label>
                        <input value={form.zona_preferida} onChange={e => setForm({...form, zona_preferida: e.target.value})} className={CONTROL + " mt-1"} placeholder="Ej: Centro / Sur" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Fecha de Ingreso</label>
                        <input type="date" value={form.fecha_ingreso} onChange={e => setForm({...form, fecha_ingreso: e.target.value})} className={CONTROL + " mt-1"} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Vista de Ubicación</label>
                    <div className="h-48 w-full rounded-[32px] overflow-hidden bg-gray-100 border-4 border-white shadow-inner relative group">
                      {form.direccion ? (
                        <>
                          <iframe 
                            width="100%" 
                            height="100%" 
                            frameBorder="0" 
                            scrolling="no" 
                            src={`https://maps.google.com/maps?q=${encodeURIComponent(form.direccion)}&t=&z=15&ie=UTF8&iwloc=&output=embed`} 
                            className="grayscale group-hover:grayscale-0 transition-all duration-700 contrast-125 opacity-80 group-hover:opacity-100" 
                          />
                          <div className="absolute inset-0 pointer-events-none border-[12px] border-white/20 rounded-[32px]"></div>
                        </>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2 p-8 text-center">
                          <Globe size={32} strokeWidth={1} />
                          <p className="text-[10px] font-black uppercase tracking-tighter">Escribe la dirección para cargar el mapa</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloque 3: Notas */}
              <div className="pt-8 border-t border-gray-100 pb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-8 w-8 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400"><FileText size={18} strokeWidth={3} /></div>
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest leading-none">Notas de Legajo y Observaciones</h4>
                </div>
                <textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} className={CONTROL + " h-32 py-4 resize-none no-scrollbar"} placeholder="Registra historial de seguros, licencia, o notas internas sobre el desempeño..." />
              </div>
            </div>

            {/* Footer Fijo */}
            <div className="shrink-0 p-8 pt-4 border-t border-gray-50 flex gap-4 bg-gray-50/30">
              <button onClick={() => setModal(null)} className="flex-1 h-16 rounded-2xl border-2 border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-white transition-all">CANCELAR</button>
              <button onClick={guardarRider} disabled={savingRider} className="flex-[2] h-16 rounded-2xl bg-[#5D87FF] text-white text-lg font-black uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-[#4570EA] active:scale-95 transition-all">
                {savingRider ? 'PROCESANDO...' : (modal.mode === 'edit' ? 'GUARDAR CAMBIOS' : 'CREAR REPARTIDOR')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALLE (VIEW MODE) ── */}
      {detailModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm" onClick={() => setDetailModal(null)}>
          <div className="w-full max-w-2xl rounded-[48px] bg-white overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <div className="h-40 bg-gray-900 relative">
               <div className="absolute inset-0 bg-gradient-to-br from-[#5D87FF] to-indigo-900 opacity-90"></div>
               <div className="absolute inset-0 flex items-center justify-center opacity-10"><Bike size={160} strokeWidth={1} className="text-white" /></div>
            </div>
            <div className="px-10 pb-10">
              <div className="relative z-10 flex justify-between items-end -mt-16 mb-8">
                <div className="h-32 w-32 rounded-[40px] border-8 border-white bg-gray-100 shadow-2xl overflow-hidden relative">
                  <AvatarDisplay url={detailModal.avatar_url} nombre={detailModal.nombre} size="w-full h-full" />
                </div>
                <div className="flex gap-2 pb-2">
                  <button onClick={() => window.open(`https://wa.me/${detailModal.telefono}`, '_blank')} className="h-14 w-14 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-emerald-500 shadow-sm hover:bg-emerald-50 active:scale-90 transition-all"><Phone size={24} fill="currentColor" /></button>
                  <button onClick={() => window.open(`${window.location.origin}/rider/${detailModal.id}/${detailModal.codigo_acceso}`, '_blank')} className="h-14 px-8 rounded-2xl bg-gray-900 text-white text-xs font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95">ABRIR APP</button>
                  <button onClick={() => {
                    const riderUrl = `${window.location.origin}/rider/${detailModal.id}/${detailModal.codigo_acceso}`;
                    if (!navigator.clipboard?.writeText) {
                      toast.error('No se pudo copiar automáticamente');
                      return;
                    }
                    navigator.clipboard.writeText(riderUrl).then(() => toast.success('Link copiado')).catch(() => toast.error('No se pudo copiar'));
                  }} className="h-14 px-6 rounded-2xl bg-white border border-gray-100 text-xs font-black uppercase tracking-widest text-[#5D87FF] shadow-sm hover:bg-blue-50 active:scale-95 transition-all">COPIAR LINK</button>
                </div>
              </div>

              <div className="mb-10">
                <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tight leading-none">{detailModal.nombre}</h3>
                <div className="flex flex-wrap items-center gap-4 mt-4 text-gray-400 font-bold text-xs uppercase tracking-widest">
                  <span className="flex items-center gap-1.5"><Smartphone size={14} /> {detailModal.telefono}</span>
                  <span className="flex items-center gap-1.5"><Bike size={14} /> {detailModal.vehiculo}</span>
                  <span className="flex items-center gap-1.5"><Calendar size={14} /> Ingreso: {detailModal.fecha_ingreso || '2024'}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
                <div className="rounded-[32px] bg-blue-50 p-6 border border-blue-100/50 flex flex-col justify-between">
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 leading-none">Credenciales de Trabajo</p>
                  <div className="flex items-center justify-between">
                    <div><p className="text-[9px] font-black text-blue-300 uppercase mb-1">ID RIDER</p><p className="text-xl font-black text-blue-700">#{detailModal.id}</p></div>
                    <div className="text-right"><p className="text-[9px] font-black text-blue-300 uppercase mb-1">CÓDIGO PIN</p><p className="text-xl font-mono font-black text-blue-700 uppercase tracking-widest">{detailModal.codigo_acceso}</p></div>
                  </div>
                  <p className="mt-4 text-xs font-semibold leading-5 text-blue-900">
                    En el celular abre el link de la app y luego instálala desde el navegador para usar ubicación en vivo.
                  </p>
                </div>
                
                <div className="rounded-[32px] bg-white p-2 border border-gray-100 shadow-inner h-44 overflow-hidden relative group cursor-pointer" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailModal.direccion)}`, '_blank')}>
                  <iframe width="100%" height="100%" frameBorder="0" scrolling="no" src={`https://maps.google.com/maps?q=${encodeURIComponent(detailModal.direccion)}&t=&z=15&ie=UTF8&iwloc=&output=embed`} className="grayscale group-hover:grayscale-0 transition-all duration-700" />
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-[9px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-1.5"><MapPin size={10} className="text-[#5D87FF]" /> Domicilio</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Resumen de Desempeño</h4>
                  <span className="text-[10px] font-black text-[#5D87FF] uppercase tracking-widest hover:underline cursor-pointer">Ver Historial</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                   <div className="p-4 rounded-[24px] bg-gray-50 border border-gray-100 text-center"><p className="text-[9px] font-black text-gray-400 uppercase mb-1 leading-none">Entregas</p><p className="text-lg font-black text-gray-800">124</p></div>
                   <div className="p-4 rounded-[24px] bg-gray-50 border border-gray-100 text-center"><p className="text-[9px] font-black text-gray-400 uppercase mb-1 leading-none">Rating</p><p className="text-lg font-black text-gray-800">4.8</p></div>
                   <div className="p-4 rounded-[24px] bg-gray-50 border border-gray-100 text-center"><p className="text-[9px] font-black text-gray-400 uppercase mb-1 leading-none">Puntual</p><p className="text-lg font-black text-emerald-600">92%</p></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Selector de Avatar */}
      {avatarPickerOpen && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[40px] bg-white p-10 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between mb-8 shrink-0">
              <div><div className="flex items-center gap-2 mb-1"><div className="h-6 w-1 bg-[#5D87FF] rounded-full"></div><p className="text-xs font-black text-[#5D87FF] uppercase tracking-[0.2em]">Identidad</p></div><h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase leading-none">Personalizar Perfil</h3></div>
              <button onClick={() => setAvatarPickerOpen(false)} className="rounded-full p-2 hover:bg-gray-100 text-gray-400 transition-all"><X size={24} /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 overflow-y-auto no-scrollbar pr-2 pb-4">
              <button onClick={() => fileInputRef.current.click()} className="group aspect-square rounded-[32px] border-4 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 hover:border-[#5D87FF] hover:bg-blue-50 transition-all">
                <div className="h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-[#5D87FF] group-hover:text-white transition-all"><Camera size={24} /></div>
                <span className="text-[10px] font-black uppercase text-gray-400 group-hover:text-[#5D87FF]">Subir Foto</span>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
              </button>
              {AVATARS.map((av, idx) => (
                <button key={idx} onClick={() => { setForm({ ...form, avatar_url: av }); setAvatarPickerOpen(false); }} className={`relative aspect-square rounded-[32px] overflow-hidden border-4 transition-all hover:scale-105 ${form.avatar_url === av ? 'border-[#5D87FF] shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'}`}><img src={av} className="w-full h-full object-cover" alt={`avatar-${idx}`} />{form.avatar_url === av && <div className="absolute inset-0 bg-[#5D87FF]/20 flex items-center justify-center"><div className="bg-white rounded-full p-1 text-[#5D87FF] shadow-md"><Check size={16} strokeWidth={4} /></div></div>}</button>
              ))}
            </div>
            <div className="mt-8 flex justify-end shrink-0 pt-4 border-t border-gray-50"><button onClick={() => setAvatarPickerOpen(false)} className="h-14 px-10 rounded-2xl border border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 active:scale-95 transition-all">Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
