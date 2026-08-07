import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  LayoutGrid,
  Library,
  Megaphone,
  MessageCircle,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';

import api from '../lib/api.js';
import ActionDialog from '../components/ActionDialog.jsx';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';
import { fondoModal, useCerrarConEscape } from '../hooks/useCerrarConEscape.js';
import MarketingResumen from './Marketing/MarketingResumen.jsx';
import MarketingCampanas from './Marketing/MarketingCampanas.jsx';
import MarketingBiblioteca from './Marketing/MarketingBiblioteca.jsx';
import MarketingAgenda from './Marketing/MarketingAgenda.jsx';
import MarketingHub from './Marketing/MarketingHub.jsx';
import MarketingWhatsapp from './Marketing/MarketingWhatsapp.jsx';
import {
  CALENDAR_STATES,
  CHANNELS,
  CONTENT_STATES,
  PROMO_TYPES,
  copiar,
  toInputDate,
} from './Marketing/marketingUtils.js';

/**
 * Marketing.
 *
 * Estaba organizado en seis pestañas que eran, una por una, las tablas de la
 * base: Dashboard, Promos, Contenido, Campañas, Calendario y Publicador. Eso
 * te obliga a saber el modelo de datos para usarlo.
 *
 * Ahora son cuatro y siguen cómo se trabaja:
 *
 *  · Resumen — qué está corriendo y qué trajo.
 *  · Campañas — la unidad real; junta promo, contenido, canal y código.
 *  · Biblioteca — promos y contenido, que son insumos de una campaña.
 *  · Agenda — qué publicar y cuándo, con el publicador de Facebook al lado.
 */
/*
  `inicio` es la portada con los cuadros grandes y es adonde se entra. Las
  demás quedan como navegación de vuelta: una vez adentro de Campañas hay que
  poder saltar a Agenda sin volver a la portada cada vez.
*/
const TABS = [
  { id: 'inicio', label: 'Inicio', icon: LayoutGrid },
  { id: 'resumen', label: 'Resumen', icon: BarChart3 },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'campanas', label: 'Campañas', icon: Megaphone },
  { id: 'biblioteca', label: 'Biblioteca', icon: Library },
];

const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

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

function Campo({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[12px] font-medium text-gray-600">{label}</label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-gray-400">{hint}</p> : null}
    </div>
  );
}

function Modal({ open, title, subtitle, onClose, onSubmit, saving, children }) {
  useCerrarConEscape(open, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={fondoModal(onClose)}
    >
      <form
        onSubmit={onSubmit}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-[17px] font-semibold text-gray-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-[12px] text-gray-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">{children}</div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{ background: BRAND }}
            className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function MarketingDigital() {
  const [tab, setTab] = useState('inicio');
  /*
    El resumen de WhatsApp para la portada. Se pide sólo cuando se está en el
    inicio: en Campañas o Biblioteca no aporta nada y sería pegarle al
    servidor de gusto. Si falla —por ejemplo porque el usuario no tiene el
    permiso de marketing— la portada muestra el cuadro sin número en vez de
    romperse entera.
  */
  const [whatsapp, setWhatsapp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [references, setReferences] = useState({ cupones: [], productos: [] });
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

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dash, refs, pr, co, ca, cal] = await Promise.all([
        api.get('/marketing/dashboard'),
        api.get('/marketing/references'),
        api.get('/marketing/promos'),
        api.get('/marketing/contenidos'),
        api.get('/marketing/campanas'),
        api.get('/marketing/calendario'),
      ]);
      setDashboard(dash);
      setReferences(refs || { cupones: [], productos: [] });
      setPromos(pr || []);
      setContenidos(co || []);
      setCampanas(ca || []);
      setCalendario(cal || []);
    } catch (error) {
      // Leía `error.message`. El interceptor de axios rechaza con el cuerpo
      // del servidor, que trae `.error`, así que el mensaje real nunca se
      // veía: siempre salía el genérico. Pasaba en las tres llamadas.
      toast.error(error?.error || 'No se pudo cargar Marketing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  /**
   * Resultado real por campaña.
   *
   * El backend devuelve las atribuciones sueltas; acá se agrupan para poder
   * decir, en cada tarjeta, cuántos pedidos y cuánta plata trajo.
   */
  const atribucionPorCampana = useMemo(() => {
    const filas = dashboard?.recent_attributions || [];
    return filas.reduce((acc, row) => {
      const id = row.marketing_campana_id;
      if (!id) return acc;
      if (!acc[id]) acc[id] = { pedidos: 0, ventas: 0 };
      if (row.pedido_id) acc[id].pedidos += 1;
      acc[id].ventas += Number(row.monto || row.total || 0);
      return acc;
    }, {});
  }, [dashboard]);

  const openModal = (type, item = null) => {
    setModal({ type, item });
    if (type === 'promo') {
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
    }
    if (type === 'contenido') setContenidoForm(item ? { ...item } : emptyContenido);
    if (type === 'campana') {
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
    }
    if (type === 'calendario') {
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
    }
  };

  const closeModal = () => setModal({ type: '', item: null });

  const guardar = async (recurso, payload) => {
    const editando = modal.item?.id;
    const base = `/marketing/${recurso}`;
    if (editando) return api.put(`${base}/${editando}`, payload);
    return api.post(base, payload);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (modal.type === 'campana') {
      if (!campanaForm.nombre.trim()) return toast.error('Poné un nombre a la campaña');
      if (
        campanaForm.fecha_inicio &&
        campanaForm.fecha_fin &&
        campanaForm.fecha_inicio > campanaForm.fecha_fin
      ) {
        return toast.error('La fecha de fin es anterior a la de inicio');
      }
    }
    if (modal.type === 'promo') {
      if (!promoForm.nombre.trim()) return toast.error('Poné un nombre a la promo');
      if (promoForm.tipo_promo === 'porcentaje' && Number(promoForm.valor) > 100) {
        return toast.error('Un porcentaje no puede superar el 100%');
      }
    }
    if (modal.type === 'contenido' && !contenidoForm.titulo.trim()) {
      return toast.error('Poné un título al contenido');
    }
    if (modal.type === 'calendario' && !calendarioForm.fecha_programada) {
      return toast.error('Elegí cuándo se publica');
    }

    setSaving(true);
    try {
      if (modal.type === 'promo') await guardar('promos', promoForm);
      if (modal.type === 'contenido') await guardar('contenidos', contenidoForm);
      if (modal.type === 'campana') await guardar('campanas', campanaForm);
      if (modal.type === 'calendario') await guardar('calendario', calendarioForm);
      toast.success('Guardado');
      closeModal();
      loadAll();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const confirmarEliminar = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/marketing/${deleteDialog.recurso}/${deleteDialog.id}`);
      toast.success('Eliminado');
      setDeleteDialog(null);
      loadAll();
    } catch (error) {
      toast.error(error?.error || 'No se pudo eliminar');
    }
  };

  const marcarPublicado = async (item) => {
    try {
      await api.put(`/marketing/calendario/${item.id}`, { ...item, estado: 'publicado' });
      toast.success('Marcada como publicada');
      loadAll();
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar');
    }
  };

  const onCopiar = (texto, mensaje) => copiar(texto, toast, mensaje);

  const pedirBorrar = (recurso, item, label) => setDeleteDialog({ recurso, id: item.id, label });

  useEffect(() => {
    if (tab !== 'inicio') return undefined;
    let vivo = true;
    const traer = () =>
      api
        .get('/whatsapp/estado')
        .then((d) => vivo && setWhatsapp(d))
        .catch(() => vivo && setWhatsapp(null));
    traer();
    const timer = setInterval(traer, 15000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [tab]);

  const accionPrincipal = {
    campanas: { label: 'Nueva campaña', onClick: () => openModal('campana') },
    biblioteca: { label: 'Nueva promo', onClick: () => openModal('promo') },
    agenda: { label: 'Agendar publicación', onClick: () => openModal('calendario') },
  }[tab];

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-7xl space-y-4 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              {tab !== 'inicio' ? (
                <button
                  type="button"
                  onClick={() => setTab('inicio')}
                  aria-label="Volver a Marketing"
                  className="-ml-1 flex h-8 w-8 items-center justify-center rounded-xl text-gray-400 transition hover:bg-white hover:text-gray-700"
                >
                  <ArrowLeft size={18} strokeWidth={STROKE} />
                </button>
              ) : null}
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                {tab === 'inicio' ? 'Marketing' : TABS.find((x) => x.id === tab)?.label}
              </h1>
            </div>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {tab === 'whatsapp'
                ? 'Promos a tus clientes, con el ritmo cuidado para no perder el número'
                : 'Campañas con código de seguimiento, para saber qué trajo cada peso'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {accionPrincipal ? (
              <button
                type="button"
                onClick={accionPrincipal.onClick}
                style={{ background: BRAND }}
                className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
              >
                <Plus size={16} strokeWidth={STROKE} />
                {accionPrincipal.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={loadAll}
              title="Actualizar"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="flex w-fit flex-wrap rounded-xl bg-gray-200/70 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
                tab === id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon size={14} strokeWidth={STROKE} />
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-200/70" />
            ))}
          </div>
        ) : (
          <>
            {tab === 'inicio' && (
              <MarketingHub
                dashboard={dashboard}
                campanas={campanas}
                contenidos={contenidos}
                promos={promos}
                calendario={calendario}
                whatsapp={whatsapp}
                onIr={setTab}
              />
            )}

            {tab === 'whatsapp' && <MarketingWhatsapp />}

            {tab === 'resumen' && (
              <MarketingResumen
                dashboard={dashboard}
                campanas={campanas}
                calendario={calendario}
                onIrACampanas={() => setTab('campanas')}
                onIrAAgenda={() => setTab('agenda')}
                onCopiar={onCopiar}
              />
            )}

            {tab === 'campanas' && (
              <MarketingCampanas
                campanas={campanas}
                atribucionPorCampana={atribucionPorCampana}
                onCrear={() => openModal('campana')}
                onEditar={(item) => openModal('campana', item)}
                onEliminar={(item) => pedirBorrar('campanas', item, `la campaña "${item.nombre}"`)}
                onCopiar={onCopiar}
              />
            )}

            {tab === 'biblioteca' && (
              <MarketingBiblioteca
                promos={promos}
                contenidos={contenidos}
                onCrearPromo={() => openModal('promo')}
                onEditarPromo={(item) => openModal('promo', item)}
                onEliminarPromo={(item) => pedirBorrar('promos', item, `la promo "${item.nombre}"`)}
                onCrearContenido={() => openModal('contenido')}
                onEditarContenido={(item) => openModal('contenido', item)}
                onEliminarContenido={(item) =>
                  pedirBorrar('contenidos', item, `el contenido "${item.titulo}"`)
                }
                onCopiar={onCopiar}
              />
            )}

            {tab === 'agenda' && (
              <MarketingAgenda
                calendario={calendario}
                onCrear={() => openModal('calendario')}
                onEditar={(item) => openModal('calendario', item)}
                onEliminar={(item) => pedirBorrar('calendario', item, 'esta publicación')}
                onMarcarPublicado={marcarPublicado}
              />
            )}
          </>
        )}
      </div>

      {/* ── Campaña ── */}
      <Modal
        open={modal.type === 'campana'}
        title={modal.item ? `Editar ${modal.item.nombre}` : 'Nueva campaña'}
        subtitle="El código de seguimiento es lo que después te dice si funcionó"
        onClose={closeModal}
        onSubmit={handleSubmit}
        saving={saving}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre" className="sm:col-span-2">
            <input
              value={campanaForm.nombre}
              onChange={(e) => setCampanaForm((p) => ({ ...p, nombre: e.target.value }))}
              placeholder="Ej: Promo lluvia julio"
              className={CONTROL}
            />
          </Campo>

          <Campo label="Qué buscás con esto" className="sm:col-span-2">
            <input
              value={campanaForm.objetivo}
              onChange={(e) => setCampanaForm((p) => ({ ...p, objetivo: e.target.value }))}
              placeholder="Ej: llenar los martes a la noche"
              className={CONTROL}
            />
          </Campo>

          <Campo label="Dónde se publica">
            <select
              value={campanaForm.canal}
              onChange={(e) => setCampanaForm((p) => ({ ...p, canal: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Cuánto vas a invertir" hint="Para comparar contra lo que trae">
            <input
              type="number"
              min="0"
              value={campanaForm.presupuesto_estimado}
              onChange={(e) =>
                setCampanaForm((p) => ({ ...p, presupuesto_estimado: e.target.value }))
              }
              placeholder="0"
              className={`${CONTROL} tabular-nums`}
            />
          </Campo>

          <Campo label="Arranca">
            <input
              type="datetime-local"
              value={campanaForm.fecha_inicio}
              onChange={(e) => setCampanaForm((p) => ({ ...p, fecha_inicio: e.target.value }))}
              className={CONTROL}
            />
          </Campo>

          <Campo label="Termina">
            <input
              type="datetime-local"
              value={campanaForm.fecha_fin}
              onChange={(e) => setCampanaForm((p) => ({ ...p, fecha_fin: e.target.value }))}
              className={CONTROL}
            />
          </Campo>

          <Campo label="Promo que ofrece" hint="Opcional">
            <select
              value={campanaForm.promo_id || ''}
              onChange={(e) => setCampanaForm((p) => ({ ...p, promo_id: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              <option value="">Sin promo</option>
              {promos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Contenido que usa" hint="Opcional">
            <select
              value={campanaForm.contenido_id || ''}
              onChange={(e) => setCampanaForm((p) => ({ ...p, contenido_id: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              <option value="">Sin contenido</option>
              {contenidos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            label="Código de seguimiento"
            className="sm:col-span-2"
            hint="El cliente lo menciona al pedir. Es lo único que permite saber qué trajo esta campaña. Si lo dejás vacío se genera solo a partir del nombre."
          >
            <input
              value={campanaForm.tracking_slug}
              onChange={(e) =>
                setCampanaForm((p) => ({ ...p, tracking_slug: e.target.value.toUpperCase() }))
              }
              placeholder="LLUVIA-JULIO"
              className={`${CONTROL} font-mono uppercase`}
            />
          </Campo>

          <Campo label="Notas" className="sm:col-span-2">
            <textarea
              value={campanaForm.observaciones}
              onChange={(e) => setCampanaForm((p) => ({ ...p, observaciones: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
            />
          </Campo>
        </div>

        {/*
          Los campos de UTM se mostraban con sus nombres de base de datos:
          "marketing_source (opcional)", "marketing_medium (opcional)". Nombres
          de columna a la vista de alguien que administra un restaurante.
          Ahora están explicados y plegados, porque el 95% de las veces no se
          tocan: el sistema los deriva del canal.
        */}
        <details className="rounded-xl bg-gray-50 p-3">
          <summary className="cursor-pointer text-[13px] font-medium text-gray-700">
            Parámetros de seguimiento avanzados
          </summary>
          <p className="mt-1.5 text-[12px] leading-4 text-gray-500">
            Sólo hace falta tocarlos si medís esta campaña también desde Google Analytics o Meta. Si
            los dejás vacíos, el sistema los completa según el canal.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Campo label="Origen (utm_source)">
              <input
                value={campanaForm.marketing_source}
                onChange={(e) =>
                  setCampanaForm((p) => ({ ...p, marketing_source: e.target.value }))
                }
                placeholder="instagram"
                className={CONTROL}
              />
            </Campo>
            <Campo label="Medio (utm_medium)">
              <input
                value={campanaForm.marketing_medium}
                onChange={(e) =>
                  setCampanaForm((p) => ({ ...p, marketing_medium: e.target.value }))
                }
                placeholder="social"
                className={CONTROL}
              />
            </Campo>
          </div>
        </details>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-gray-50 p-3">
          <input
            type="checkbox"
            checked={Boolean(campanaForm.activa)}
            onChange={(e) => setCampanaForm((p) => ({ ...p, activa: e.target.checked }))}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
            style={{ accentColor: BRAND }}
          />
          <span>
            <span className="block text-[13px] font-medium text-gray-900">Campaña habilitada</span>
            <span className="mt-0.5 block text-[12px] leading-4 text-gray-500">
              Si la pausás deja de atribuir pedidos aunque esté dentro de la fecha.
            </span>
          </span>
        </label>
      </Modal>

      {/* ── Promo ── */}
      <Modal
        open={modal.type === 'promo'}
        title={modal.item ? `Editar ${modal.item.nombre}` : 'Nueva promo'}
        subtitle="El beneficio concreto que ofrece una campaña"
        onClose={closeModal}
        onSubmit={handleSubmit}
        saving={saving}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre" className="sm:col-span-2">
            <input
              value={promoForm.nombre}
              onChange={(e) => setPromoForm((p) => ({ ...p, nombre: e.target.value }))}
              placeholder="Ej: 2x1 en empanadas"
              className={CONTROL}
            />
          </Campo>

          <Campo label="Tipo">
            <select
              value={promoForm.tipo_promo}
              onChange={(e) => setPromoForm((p) => ({ ...p, tipo_promo: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              {PROMO_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            label={promoForm.tipo_promo === 'porcentaje' ? 'Cuánto descuenta (%)' : 'Valor'}
            hint={
              promoForm.tipo_promo === 'envio_gratis'
                ? 'No hace falta para envío gratis'
                : undefined
            }
          >
            <input
              type="number"
              min="0"
              max={promoForm.tipo_promo === 'porcentaje' ? 100 : undefined}
              value={promoForm.valor}
              onChange={(e) => setPromoForm((p) => ({ ...p, valor: e.target.value }))}
              disabled={promoForm.tipo_promo === 'envio_gratis'}
              className={`${CONTROL} tabular-nums disabled:bg-gray-100 disabled:text-gray-400`}
            />
          </Campo>

          <Campo label="Arranca">
            <input
              type="datetime-local"
              value={promoForm.fecha_inicio}
              onChange={(e) => setPromoForm((p) => ({ ...p, fecha_inicio: e.target.value }))}
              className={CONTROL}
            />
          </Campo>

          <Campo label="Termina">
            <input
              type="datetime-local"
              value={promoForm.fecha_fin}
              onChange={(e) => setPromoForm((p) => ({ ...p, fecha_fin: e.target.value }))}
              className={CONTROL}
            />
          </Campo>

          <Campo label="Canal sugerido">
            <select
              value={promoForm.canal_sugerido}
              onChange={(e) => setPromoForm((p) => ({ ...p, canal_sugerido: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Cupón asociado" hint="Para que el descuento se aplique solo en la caja">
            <select
              value={promoForm.cupon_id || ''}
              onChange={(e) => setPromoForm((p) => ({ ...p, cupon_id: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              <option value="">Sin cupón</option>
              {(references.cupones || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Descripción" className="sm:col-span-2">
            <textarea
              value={promoForm.descripcion}
              onChange={(e) => setPromoForm((p) => ({ ...p, descripcion: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
            />
          </Campo>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-gray-50 p-3">
          <input
            type="checkbox"
            checked={Boolean(promoForm.activa)}
            onChange={(e) => setPromoForm((p) => ({ ...p, activa: e.target.checked }))}
            className="h-4 w-4 shrink-0 rounded border-gray-300"
            style={{ accentColor: BRAND }}
          />
          <span className="text-[13px] font-medium text-gray-900">Promo habilitada</span>
        </label>
      </Modal>

      {/* ── Contenido ── */}
      <Modal
        open={modal.type === 'contenido'}
        title={modal.item ? `Editar ${modal.item.titulo}` : 'Nuevo contenido'}
        subtitle="Guardá el texto una vez y reusalo al publicar"
        onClose={closeModal}
        onSubmit={handleSubmit}
        saving={saving}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Título" className="sm:col-span-2">
            <input
              value={contenidoForm.titulo}
              onChange={(e) => setContenidoForm((p) => ({ ...p, titulo: e.target.value }))}
              placeholder="Ej: Historia martes de milanesas"
              className={CONTROL}
            />
          </Campo>

          <Campo label="Para qué red">
            <select
              value={contenidoForm.red_sugerida}
              onChange={(e) => setContenidoForm((p) => ({ ...p, red_sugerida: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Estado">
            <select
              value={contenidoForm.estado}
              onChange={(e) => setContenidoForm((p) => ({ ...p, estado: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              {CONTENT_STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Texto corto" className="sm:col-span-2" hint="El que va en la publicación">
            <textarea
              value={contenidoForm.texto_corto}
              onChange={(e) => setContenidoForm((p) => ({ ...p, texto_corto: e.target.value }))}
              rows={3}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
            />
          </Campo>

          <Campo label="Texto largo" className="sm:col-span-2" hint="Opcional, para posteos o mail">
            <textarea
              value={contenidoForm.texto_largo}
              onChange={(e) => setContenidoForm((p) => ({ ...p, texto_largo: e.target.value }))}
              rows={4}
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
            />
          </Campo>

          <Campo label="Llamado a la acción" className="sm:col-span-2">
            <input
              value={contenidoForm.cta}
              onChange={(e) => setContenidoForm((p) => ({ ...p, cta: e.target.value }))}
              placeholder="Ej: Pedí por WhatsApp"
              className={CONTROL}
            />
          </Campo>
        </div>
      </Modal>

      {/* ── Agenda ── */}
      <Modal
        open={modal.type === 'calendario'}
        title={modal.item ? 'Editar publicación' : 'Agendar publicación'}
        onClose={closeModal}
        onSubmit={handleSubmit}
        saving={saving}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Cuándo se publica">
            <input
              type="datetime-local"
              value={calendarioForm.fecha_programada}
              onChange={(e) =>
                setCalendarioForm((p) => ({ ...p, fecha_programada: e.target.value }))
              }
              className={CONTROL}
            />
          </Campo>

          <Campo label="Dónde">
            <select
              value={calendarioForm.canal}
              onChange={(e) => setCalendarioForm((p) => ({ ...p, canal: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Campaña">
            <select
              value={calendarioForm.campana_id || ''}
              onChange={(e) => setCalendarioForm((p) => ({ ...p, campana_id: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              <option value="">Sin campaña</option>
              {campanas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Contenido">
            <select
              value={calendarioForm.contenido_id || ''}
              onChange={(e) => setCalendarioForm((p) => ({ ...p, contenido_id: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              <option value="">Sin contenido</option>
              {contenidos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.titulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Estado">
            <select
              value={calendarioForm.estado}
              onChange={(e) => setCalendarioForm((p) => ({ ...p, estado: e.target.value }))}
              className={`${CONTROL} font-medium`}
            >
              {CALENDAR_STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Campo>

          <Campo label="Notas" className="sm:col-span-2">
            <input
              value={calendarioForm.observaciones}
              onChange={(e) => setCalendarioForm((p) => ({ ...p, observaciones: e.target.value }))}
              className={CONTROL}
            />
          </Campo>
        </div>
      </Modal>

      <ActionDialog
        open={Boolean(deleteDialog)}
        title="Eliminar"
        description={deleteDialog ? `Se elimina ${deleteDialog.label}. No se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={confirmarEliminar}
        onClose={() => setDeleteDialog(null)}
      />
    </div>
  );
}
