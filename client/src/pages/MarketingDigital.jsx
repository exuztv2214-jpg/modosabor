import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Megaphone,
  TicketPercent,
  CalendarDays,
  MessageSquareText,
  Share2,
  Plus,
  Edit2,
  Trash2,
  Copy,
  RefreshCw,
  CheckCircle2,
  CircleDollarSign,
  Users,
  Receipt,
  BarChart3,
} from 'lucide-react';

import api from '../lib/api.js';
import PublicadorFacebookPanel from '../components/Marketing/PublicadorFacebookPanel.jsx';
import ActionDialog from '../components/ActionDialog.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'promos', label: 'Promos', icon: TicketPercent },
  { id: 'contenido', label: 'Contenido', icon: MessageSquareText },
  { id: 'campanas', label: 'Campañas', icon: Megaphone },
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
  { id: 'publicador', label: 'Publicador', icon: Share2 },
];

const CHANNELS = ['instagram', 'facebook', 'tiktok', 'google', 'general'];
const PROMO_TYPES = [
  { value: 'descuento_fijo', label: 'Descuento fijo' },
  { value: 'porcentaje', label: 'Porcentaje' },
  { value: 'envio_gratis', label: 'Envío gratis' },
  { value: 'combo_especial', label: 'Combo especial' },
  { value: 'promo_producto', label: 'Promo por producto' },
];
const CONTENT_STATES = ['borrador', 'listo', 'publicado'];
const CALENDAR_STATES = ['pendiente', 'listo', 'publicado', 'cancelado'];

const fmtMoney = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;
const fmtDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
const toInputDate = (value) => (value ? new Date(value).toISOString().slice(0, 16) : '');

const emptyPromo = {
  nombre: '',
  descripcion: '',
  tipo_promo: 'descuento_fijo',
  valor: '',
  fecha_inicio: '',
  fecha_fin: '',
  activa: true,
  canal_sugerido: 'general',
  cupon_id: '',
  producto_id: '',
};
const emptyContenido = {
  titulo: '',
  objetivo: '',
  red_sugerida: 'instagram',
  texto_corto: '',
  texto_largo: '',
  cta: '',
  estado: 'borrador',
};
const emptyCampana = {
  nombre: '',
  objetivo: '',
  canal: 'instagram',
  fecha_inicio: '',
  fecha_fin: '',
  presupuesto_estimado: '',
  promo_id: '',
  contenido_id: '',
  activa: true,
  observaciones: '',
  tracking_slug: '',
  marketing_source: '',
  marketing_medium: '',
  marketing_campaign: '',
  marketing_content: '',
};
const emptyCalendario = {
  fecha_programada: '',
  canal: 'instagram',
  estado: 'pendiente',
  contenido_id: '',
  promo_id: '',
  campana_id: '',
  observaciones: '',
};

function Badge({ children, tone = 'slate' }) {
  const styles = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-success-100 text-success-700',
    blue: 'bg-primary-100 text-primary-700',
    amber: 'bg-warning-100 text-warning-700',
    rose: 'bg-danger-100 text-danger-700',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles[tone] || styles.slate}`}
    >
      {children}
    </span>
  );
}

function Modal({ open, title, onClose, children, maxWidth = 'max-w-3xl' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full ${maxWidth} rounded-3xl bg-white p-6 shadow-2xl`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = 'blue' }) {
  const tones = {
    blue: 'bg-primary-100 text-primary-700',
    green: 'bg-success-100 text-success-700',
    amber: 'bg-warning-100 text-warning-700',
    rose: 'bg-danger-100 text-danger-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[tone] || tones.blue}`}
        >
          <Icon size={22} />
        </div>
        <div>
          <p className="text-2xl font-black text-slate-900">{value}</p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

function TextField({ label, ...props }) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
      />
    </label>
  );
}

function SelectField({ label, children, ...props }) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select
        {...props}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
      >
        {children}
      </select>
    </label>
  );
}

function TextAreaField({ label, ...props }) {
  return (
    <label className="space-y-1">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea
        {...props}
        className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
      />
    </label>
  );
}

export default function MarketingDigital() {
  const [tab, setTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [references, setReferences] = useState({
    cupones: [],
    productos: [],
    promos: [],
    contenidos: [],
    campanas: [],
  });
  const [promos, setPromos] = useState([]);
  const [contenidos, setContenidos] = useState([]);
  const [campanas, setCampanas] = useState([]);
  const [calendario, setCalendario] = useState([]);
  const [modal, setModal] = useState({ type: '', item: null });
  const [promoForm, setPromoForm] = useState(emptyPromo);
  const [contenidoForm, setContenidoForm] = useState(emptyContenido);
  const [campanaForm, setCampanaForm] = useState(emptyCampana);
  const [calendarioForm, setCalendarioForm] = useState(emptyCalendario);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const metrics = dashboard?.metrics || {};
  const activeCampaigns = useMemo(() => dashboard?.active_campaigns || [], [dashboard]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [
        dashboardData,
        referencesData,
        promosData,
        contenidosData,
        campanasData,
        calendarioData,
      ] = await Promise.all([
        api.get('/marketing/dashboard'),
        api.get('/marketing/references'),
        api.get('/marketing/promos'),
        api.get('/marketing/contenidos'),
        api.get('/marketing/campanas'),
        api.get('/marketing/calendario'),
      ]);
      setDashboard(dashboardData);
      setReferences(referencesData);
      setPromos(promosData);
      setContenidos(contenidosData);
      setCampanas(campanasData);
      setCalendario(calendarioData);
    } catch (error) {
      toast.error(error.message || 'No se pudo cargar Marketing Digital');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openModal = (type, item = null) => {
    setModal({ type, item });
    if (type === 'promo')
      setPromoForm(
        item
          ? {
              ...item,
              fecha_inicio: toInputDate(item.fecha_inicio),
              fecha_fin: toInputDate(item.fecha_fin),
              cupon_id: item.cupon_id || '',
              producto_id: item.producto_id || '',
            }
          : emptyPromo
      );
    if (type === 'contenido') setContenidoForm(item ? { ...item } : emptyContenido);
    if (type === 'campana')
      setCampanaForm(
        item
          ? {
              ...item,
              fecha_inicio: toInputDate(item.fecha_inicio),
              fecha_fin: toInputDate(item.fecha_fin),
              promo_id: item.promo_id || '',
              contenido_id: item.contenido_id || '',
            }
          : emptyCampana
      );
    if (type === 'calendario')
      setCalendarioForm(
        item
          ? {
              ...item,
              fecha_programada: toInputDate(item.fecha_programada),
              contenido_id: item.contenido_id || '',
              promo_id: item.promo_id || '',
              campana_id: item.campana_id || '',
            }
          : emptyCalendario
      );
  };

  const closeModal = () => setModal({ type: '', item: null });

  const saveEntity = async (type, payload) => {
    const editing = modal.item?.id;
    const base = `/marketing/${type}`;
    if (editing) return api.put(`${base}/${editing}`, payload);
    return api.post(base, payload);
  };

  const removeEntity = async (type, id, label) => {
    setDeleteDialog({ type, id, label });
  };

  const confirmarEliminar = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/marketing/${deleteDialog.type}/${deleteDialog.id}`);
      toast.success('Eliminado');
      setDeleteDialog(null);
      loadAll();
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar');
    }
  };

  const copyText = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      if (modal.type === 'promo') await saveEntity('promos', promoForm);
      if (modal.type === 'contenido') await saveEntity('contenidos', contenidoForm);
      if (modal.type === 'campana') await saveEntity('campanas', campanaForm);
      if (modal.type === 'calendario') await saveEntity('calendario', calendarioForm);
      toast.success('Guardado');
      closeModal();
      loadAll();
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Marketing Digital</h1>
          <p className="mt-1 text-slate-500">
            Promos, contenido, campañas, calendario y tracking real hacia la carta online y pedidos.
          </p>
        </div>
        <button
          onClick={loadAll}
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-3xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${tab === id ? 'bg-primary-500 text-white shadow-lg shadow-primary-200' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          <RefreshCw className="mx-auto mb-3 animate-spin" size={26} />
          Cargando Marketing Digital...
        </div>
      ) : (
        <>
          {tab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  icon={Megaphone}
                  label="Campañas activas"
                  value={metrics.campanas_activas || 0}
                />
                <StatCard
                  icon={TicketPercent}
                  label="Promos activas"
                  value={metrics.promos_activas || 0}
                  tone="green"
                />
                <StatCard
                  icon={MessageSquareText}
                  label="Conversaciones atribuidas"
                  value={metrics.conversaciones_atribuidas || 0}
                  tone="amber"
                />
                <StatCard
                  icon={Receipt}
                  label="Pedidos atribuidos"
                  value={metrics.pedidos_atribuidos || 0}
                  tone="violet"
                />
                <StatCard
                  icon={CircleDollarSign}
                  label="Ventas atribuidas"
                  value={fmtMoney(metrics.ventas_atribuidas || 0)}
                  tone="green"
                />
                <StatCard
                  icon={Users}
                  label="Clientes nuevos estimados"
                  value={metrics.clientes_nuevos_estimados || 0}
                  tone="rose"
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-3">
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-black text-slate-900">Campañas activas</h2>
                    <Badge tone="blue">{activeCampaigns.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {activeCampaigns.length === 0 ? (
                      <p className="text-sm text-slate-500">Todavía no hay campañas activas.</p>
                    ) : (
                      activeCampaigns.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-slate-900">{item.nombre}</p>
                            <Badge tone="green">{item.canal || 'general'}</Badge>
                            <Badge>{item.tracking_slug || 'sin código'}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-slate-600">
                            {item.objetivo || 'Sin objetivo cargado'}
                          </p>
                          <p className="mt-2 text-xs text-slate-500">
                            Llamado a la accion: {item.whatsapp_cta_texto}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-black text-slate-900">Pendientes</h2>
                    <Badge tone="amber">{metrics.publicaciones_pendientes || 0}</Badge>
                  </div>
                  <div className="space-y-3">
                    {(dashboard?.pending_calendar || []).length === 0 ? (
                      <p className="text-sm text-slate-500">No hay publicaciones pendientes.</p>
                    ) : (
                      (dashboard?.pending_calendar || []).map((item) => (
                        <div key={item.id} className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-sm font-bold text-slate-800">
                            {item.campana_nombre || item.contenido_titulo || 'Publicación'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {fmtDate(item.fecha_programada)} · {item.canal}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          )}

          {tab === 'promos' && (
            <SectionCrud
              title="Biblioteca de Promos"
              buttonLabel="Nueva promo"
              onCreate={() => openModal('promo')}
            >
              <SimpleTable
                rows={promos}
                emptyText="Todavía no cargaste promos."
                columns={[
                  { key: 'nombre', label: 'Nombre' },
                  { key: 'tipo_promo', label: 'Tipo' },
                  {
                    key: 'valor',
                    label: 'Valor',
                    render: (row) =>
                      row.tipo_promo === 'porcentaje' ? `${row.valor}%` : fmtMoney(row.valor),
                  },
                  { key: 'canal_sugerido', label: 'Canal' },
                  {
                    key: 'activo',
                    label: 'Estado',
                    render: (row) => (
                      <Badge tone={row.activa ? 'green' : 'slate'}>
                        {row.activa ? 'Activa' : 'Inactiva'}
                      </Badge>
                    ),
                  },
                ]}
                onEdit={(row) => openModal('promo', row)}
                onDelete={(row) => removeEntity('promos', row.id, `la promo "${row.nombre}"`)}
              />
            </SectionCrud>
          )}

          {tab === 'contenido' && (
            <SectionCrud
              title="Ideas y Plantillas de Contenido"
              buttonLabel="Nuevo contenido"
              onCreate={() => openModal('contenido')}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                {contenidos.length === 0 ? (
                  <EmptyCard text="Todavía no cargaste piezas de contenido." />
                ) : (
                  contenidos.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-900">{item.titulo}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {item.objetivo || 'Sin objetivo'}
                          </p>
                        </div>
                        <Badge
                          tone={
                            item.estado === 'publicado'
                              ? 'green'
                              : item.estado === 'listo'
                                ? 'blue'
                                : 'amber'
                          }
                        >
                          {item.estado}
                        </Badge>
                      </div>
                      <p className="mt-4 text-sm text-slate-700">
                        {item.texto_corto || item.texto_largo || 'Sin copy todavía'}
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        <Badge>{item.red_sugerida || 'general'}</Badge>
                        <div className="flex gap-2">
                          <ActionButton icon={Edit2} onClick={() => openModal('contenido', item)} />
                          <ActionButton
                            icon={Trash2}
                            onClick={() =>
                              removeEntity('contenidos', item.id, `el contenido "${item.titulo}"`)
                            }
                            danger
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCrud>
          )}

          {tab === 'campanas' && (
            <SectionCrud
              title="Campañas"
              buttonLabel="Nueva campaña"
              onCreate={() => openModal('campana')}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                {campanas.length === 0 ? (
                  <EmptyCard text="Todavía no cargaste campañas." />
                ) : (
                  campanas.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-900">{item.nombre}</p>
                          <p className="text-sm text-slate-500">
                            {item.objetivo || 'Sin objetivo'}
                          </p>
                        </div>
                        <Badge tone={item.activa ? 'green' : 'slate'}>
                          {item.activa ? 'Activa' : 'Pausada'}
                        </Badge>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <Badge>{item.canal || 'general'}</Badge>
                        <Badge tone="blue">{item.tracking_slug || 'sin código'}</Badge>
                        <Badge tone="amber">{item.promo_nombre || 'sin promo'}</Badge>
                      </div>
                      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                          Llamado a la accion
                        </p>
                        <p className="mt-2 text-sm text-slate-800">{item.whatsapp_cta_texto}</p>
                        <button
                          onClick={() => copyText(item.whatsapp_cta_texto)}
                          className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200"
                        >
                          <Copy size={14} />
                          Copiar CTA
                        </button>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <ActionButton icon={Edit2} onClick={() => openModal('campana', item)} />
                        <ActionButton
                          icon={Trash2}
                          onClick={() =>
                            removeEntity('campanas', item.id, `la campaña "${item.nombre}"`)
                          }
                          danger
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCrud>
          )}

          {tab === 'calendario' && (
            <SectionCrud
              title="Calendario / Planificador"
              buttonLabel="Nuevo evento"
              onCreate={() => openModal('calendario')}
            >
              <SimpleTable
                rows={calendario}
                emptyText="Todavía no hay publicaciones planificadas."
                columns={[
                  {
                    key: 'fecha_programada',
                    label: 'Fecha',
                    render: (row) => fmtDate(row.fecha_programada),
                  },
                  { key: 'canal', label: 'Canal' },
                  {
                    key: 'campana_nombre',
                    label: 'Campaña',
                    render: (row) => row.campana_nombre || '-',
                  },
                  {
                    key: 'contenido_titulo',
                    label: 'Contenido',
                    render: (row) => row.contenido_titulo || '-',
                  },
                  {
                    key: 'estado',
                    label: 'Estado',
                    render: (row) => (
                      <Badge
                        tone={
                          row.estado === 'publicado'
                            ? 'green'
                            : row.estado === 'cancelado'
                              ? 'rose'
                              : 'amber'
                        }
                      >
                        {row.estado}
                      </Badge>
                    ),
                  },
                ]}
                onEdit={(row) => openModal('calendario', row)}
                onDelete={(row) => removeEntity('calendario', row.id, 'este evento')}
              />
            </SectionCrud>
          )}
          {tab === 'publicador' && <PublicadorFacebookPanel />}
        </>
      )}

      <Modal
        open={modal.type === 'promo'}
        title={modal.item ? 'Editar promo' : 'Nueva promo'}
        onClose={closeModal}
      >
        <EntityForm onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Nombre"
              value={promoForm.nombre}
              onChange={(e) => setPromoForm((prev) => ({ ...prev, nombre: e.target.value }))}
            />
            <SelectField
              label="Tipo"
              value={promoForm.tipo_promo}
              onChange={(e) => setPromoForm((prev) => ({ ...prev, tipo_promo: e.target.value }))}
            >
              {PROMO_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Valor"
              value={promoForm.valor}
              onChange={(e) => setPromoForm((prev) => ({ ...prev, valor: e.target.value }))}
            />
            <SelectField
              label="Canal sugerido"
              value={promoForm.canal_sugerido}
              onChange={(e) =>
                setPromoForm((prev) => ({ ...prev, canal_sugerido: e.target.value }))
              }
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Inicio"
              type="datetime-local"
              value={promoForm.fecha_inicio}
              onChange={(e) => setPromoForm((prev) => ({ ...prev, fecha_inicio: e.target.value }))}
            />
            <TextField
              label="Fin"
              type="datetime-local"
              value={promoForm.fecha_fin}
              onChange={(e) => setPromoForm((prev) => ({ ...prev, fecha_fin: e.target.value }))}
            />
            <SelectField
              label="Cupón real (opcional)"
              value={promoForm.cupon_id}
              onChange={(e) => setPromoForm((prev) => ({ ...prev, cupon_id: e.target.value }))}
            >
              <option value="">Sin cupón</option>
              {references.cupones.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.codigo}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Producto (opcional)"
              value={promoForm.producto_id}
              onChange={(e) => setPromoForm((prev) => ({ ...prev, producto_id: e.target.value }))}
            >
              <option value="">Sin producto</option>
              {references.productos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </SelectField>
          </div>
          <TextAreaField
            label="Descripción"
            value={promoForm.descripcion}
            onChange={(e) => setPromoForm((prev) => ({ ...prev, descripcion: e.target.value }))}
          />
          <CheckField
            label="Promo activa"
            checked={Boolean(promoForm.activa)}
            onChange={(checked) => setPromoForm((prev) => ({ ...prev, activa: checked }))}
          />
        </EntityForm>
      </Modal>

      <Modal
        open={modal.type === 'contenido'}
        title={modal.item ? 'Editar contenido' : 'Nuevo contenido'}
        onClose={closeModal}
      >
        <EntityForm onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Título interno"
              value={contenidoForm.titulo}
              onChange={(e) => setContenidoForm((prev) => ({ ...prev, titulo: e.target.value }))}
            />
            <TextField
              label="Objetivo"
              value={contenidoForm.objetivo}
              onChange={(e) => setContenidoForm((prev) => ({ ...prev, objetivo: e.target.value }))}
            />
            <SelectField
              label="Red sugerida"
              value={contenidoForm.red_sugerida}
              onChange={(e) =>
                setContenidoForm((prev) => ({ ...prev, red_sugerida: e.target.value }))
              }
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Estado"
              value={contenidoForm.estado}
              onChange={(e) => setContenidoForm((prev) => ({ ...prev, estado: e.target.value }))}
            >
              {CONTENT_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </SelectField>
          </div>
          <TextAreaField
            label="Texto corto"
            value={contenidoForm.texto_corto}
            onChange={(e) => setContenidoForm((prev) => ({ ...prev, texto_corto: e.target.value }))}
          />
          <TextAreaField
            label="Texto largo"
            value={contenidoForm.texto_largo}
            onChange={(e) => setContenidoForm((prev) => ({ ...prev, texto_largo: e.target.value }))}
          />
          <TextField
            label="CTA"
            value={contenidoForm.cta}
            onChange={(e) => setContenidoForm((prev) => ({ ...prev, cta: e.target.value }))}
          />
        </EntityForm>
      </Modal>

      <Modal
        open={modal.type === 'campana'}
        title={modal.item ? 'Editar campaña' : 'Nueva campaña'}
        onClose={closeModal}
      >
        <EntityForm onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Nombre"
              value={campanaForm.nombre}
              onChange={(e) => setCampanaForm((prev) => ({ ...prev, nombre: e.target.value }))}
            />
            <TextField
              label="Objetivo"
              value={campanaForm.objetivo}
              onChange={(e) => setCampanaForm((prev) => ({ ...prev, objetivo: e.target.value }))}
            />
            <SelectField
              label="Canal"
              value={campanaForm.canal}
              onChange={(e) => setCampanaForm((prev) => ({ ...prev, canal: e.target.value }))}
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Presupuesto estimado"
              value={campanaForm.presupuesto_estimado}
              onChange={(e) =>
                setCampanaForm((prev) => ({ ...prev, presupuesto_estimado: e.target.value }))
              }
            />
            <TextField
              label="Inicio"
              type="datetime-local"
              value={campanaForm.fecha_inicio}
              onChange={(e) =>
                setCampanaForm((prev) => ({ ...prev, fecha_inicio: e.target.value }))
              }
            />
            <TextField
              label="Fin"
              type="datetime-local"
              value={campanaForm.fecha_fin}
              onChange={(e) => setCampanaForm((prev) => ({ ...prev, fecha_fin: e.target.value }))}
            />
            <SelectField
              label="Promo asociada"
              value={campanaForm.promo_id}
              onChange={(e) => setCampanaForm((prev) => ({ ...prev, promo_id: e.target.value }))}
            >
              <option value="">Sin promo</option>
              {references.promos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Contenido asociado"
              value={campanaForm.contenido_id}
              onChange={(e) =>
                setCampanaForm((prev) => ({ ...prev, contenido_id: e.target.value }))
              }
            >
              <option value="">Sin contenido</option>
              {references.contenidos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.titulo}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Código / slug de tracking"
              value={campanaForm.tracking_slug}
              onChange={(e) =>
                setCampanaForm((prev) => ({ ...prev, tracking_slug: e.target.value }))
              }
            />
            <CheckField
              label="Campaña activa"
              checked={Boolean(campanaForm.activa)}
              onChange={(checked) => setCampanaForm((prev) => ({ ...prev, activa: checked }))}
            />
            <TextField
              label="marketing_source (opcional)"
              value={campanaForm.marketing_source}
              onChange={(e) =>
                setCampanaForm((prev) => ({ ...prev, marketing_source: e.target.value }))
              }
            />
            <TextField
              label="marketing_medium (opcional)"
              value={campanaForm.marketing_medium}
              onChange={(e) =>
                setCampanaForm((prev) => ({ ...prev, marketing_medium: e.target.value }))
              }
            />
            <TextField
              label="marketing_campaign (opcional)"
              value={campanaForm.marketing_campaign}
              onChange={(e) =>
                setCampanaForm((prev) => ({ ...prev, marketing_campaign: e.target.value }))
              }
            />
            <TextField
              label="marketing_content (opcional)"
              value={campanaForm.marketing_content}
              onChange={(e) =>
                setCampanaForm((prev) => ({ ...prev, marketing_content: e.target.value }))
              }
            />
          </div>
          <TextAreaField
            label="Observaciones"
            value={campanaForm.observaciones}
            onChange={(e) => setCampanaForm((prev) => ({ ...prev, observaciones: e.target.value }))}
          />
        </EntityForm>
      </Modal>

      <Modal
        open={modal.type === 'calendario'}
        title={modal.item ? 'Editar calendario' : 'Nuevo evento'}
        onClose={closeModal}
      >
        <EntityForm onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Fecha sugerida"
              type="datetime-local"
              value={calendarioForm.fecha_programada}
              onChange={(e) =>
                setCalendarioForm((prev) => ({ ...prev, fecha_programada: e.target.value }))
              }
            />
            <SelectField
              label="Canal"
              value={calendarioForm.canal}
              onChange={(e) => setCalendarioForm((prev) => ({ ...prev, canal: e.target.value }))}
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Estado"
              value={calendarioForm.estado}
              onChange={(e) => setCalendarioForm((prev) => ({ ...prev, estado: e.target.value }))}
            >
              {CALENDAR_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Campaña"
              value={calendarioForm.campana_id}
              onChange={(e) =>
                setCalendarioForm((prev) => ({ ...prev, campana_id: e.target.value }))
              }
            >
              <option value="">Sin campaña</option>
              {references.campanas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Contenido"
              value={calendarioForm.contenido_id}
              onChange={(e) =>
                setCalendarioForm((prev) => ({ ...prev, contenido_id: e.target.value }))
              }
            >
              <option value="">Sin contenido</option>
              {references.contenidos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.titulo}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Promo"
              value={calendarioForm.promo_id}
              onChange={(e) => setCalendarioForm((prev) => ({ ...prev, promo_id: e.target.value }))}
            >
              <option value="">Sin promo</option>
              {references.promos.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </SelectField>
          </div>
          <TextAreaField
            label="Observaciones"
            value={calendarioForm.observaciones}
            onChange={(e) =>
              setCalendarioForm((prev) => ({ ...prev, observaciones: e.target.value }))
            }
          />
        </EntityForm>
      </Modal>
      <ActionDialog
        open={Boolean(deleteDialog)}
        title={deleteDialog ? `Eliminar ${deleteDialog.label}` : ''}
        description="Este elemento dejará de formar parte de la planificación de marketing."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={confirmarEliminar}
        onClose={() => setDeleteDialog(null)}
      />
    </div>
  );
}

function SectionCrud({ title, buttonLabel, onCreate, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-900">{title}</h2>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-primary-200"
        >
          <Plus size={16} />
          {buttonLabel}
        </button>
      </div>
      {children}
    </div>
  );
}

function SimpleTable({ rows, columns, emptyText, onEdit, onDelete }) {
  if (!rows.length) return <EmptyCard text={emptyText} />;
  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-black text-slate-700">
                {column.label}
              </th>
            ))}
            <th className="px-4 py-3 text-right font-black text-slate-700">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-slate-700">
                  {column.render ? column.render(row) : row[column.key] || '-'}
                </td>
              ))}
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <ActionButton icon={Edit2} onClick={() => onEdit(row)} />
                  <ActionButton icon={Trash2} onClick={() => onDelete(row)} danger />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionButton({ icon: Icon, onClick, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl p-2.5 ${danger ? 'bg-danger-50 text-danger-600' : 'bg-slate-100 text-slate-700'}`}
    >
      <Icon size={16} />
    </button>
  );
}

function EmptyCard({ text }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function EntityForm({ onSubmit, children }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {children}
      <div className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-2xl bg-primary-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-primary-200"
        >
          <CheckCircle2 size={16} />
          Guardar
        </button>
      </div>
    </form>
  );
}

function CheckField({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
