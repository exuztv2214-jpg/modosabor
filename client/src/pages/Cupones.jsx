import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Calendar,
  Copy,
  DollarSign,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';

import api from '../lib/api.js';
import ActionDialog from '../components/ActionDialog.jsx';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';
import { fondoModal, useCerrarConEscape } from '../hooks/useCerrarConEscape.js';
import { Stat } from './Clientes/clientesUi.jsx';

const fmtMoney = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

/**
 * Estado real del cupón.
 *
 * El panel mostraba "Activo" en verde mirando únicamente el flag `activo`.
 * Pero el backend, al validarlo en el checkout, además chequea la fecha de
 * inicio, la de fin y el límite de usos. O sea que un cupón vencido ayer, o
 * uno que ya agotó sus 100 usos, seguía figurando en verde como si estuviera
 * funcionando —y al cliente le rebotaba en la caja—.
 *
 * Esta función reproduce las mismas reglas del server para que lo que ves en
 * la lista sea lo que realmente pasa al aplicarlo.
 */
const ESTADOS = {
  activo: { label: 'Activo', bg: '#E7F5EF', fg: '#0F6E56' },
  programado: { label: 'Programado', bg: '#E9F1FA', fg: '#1F5FA0' },
  vencido: { label: 'Vencido', bg: '#FEF2F2', fg: '#9E141E' },
  agotado: { label: 'Agotado', bg: '#FEF2F2', fg: '#9E141E' },
  pausado: { label: 'Pausado', bg: '#E5E7EB', fg: '#4B5563' },
};

function estadoCupon(cupon) {
  if (!cupon.activo) return 'pausado';

  const limite = Number(cupon.limite_usos || 0);
  if (limite > 0 && Number(cupon.usos_actuales || 0) >= limite) return 'agotado';

  const ahora = Date.now();
  const inicio = cupon.fecha_inicio ? new Date(cupon.fecha_inicio).getTime() : null;
  const fin = cupon.fecha_fin ? new Date(cupon.fecha_fin).getTime() : null;

  if (inicio && !Number.isNaN(inicio) && ahora < inicio) return 'programado';
  if (fin && !Number.isNaN(fin) && ahora > fin) return 'vencido';

  return 'activo';
}

function formatDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const texto = (valor) => String(valor ?? '').toLowerCase();

function Campo({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[12px] font-medium text-gray-600">{label}</label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-gray-400">{hint}</p> : null}
    </div>
  );
}

export default function Cupones() {
  const [cupones, setCupones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCupon, setEditingCupon] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const [form, setForm] = useState({
    codigo: '',
    descripcion: '',
    tipo_descuento: 'porcentaje',
    valor_descuento: '',
    minimo_compra: '',
    descuento_maximo: '',
    fecha_inicio: '',
    fecha_fin: '',
    limite_usos: '',
    limite_por_cliente: '1',
    activo: true,
  });

  useEffect(() => {
    loadCupones();
  }, []);

  async function loadCupones() {
    try {
      setLoading(true);
      const data = await api.get('/cupones');
      setCupones(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error?.error || 'Error al cargar cupones');
    } finally {
      setLoading(false);
    }
  }

  const cuponesUi = useMemo(
    () => cupones.map((c) => ({ ...c, estado: estadoCupon(c) })),
    [cupones]
  );

  const cuponesFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cuponesUi.filter((c) => {
      // `c.codigo.toLowerCase()` sin guarda: un cupón con código nulo tiraba
      // abajo la pantalla apenas escribías en el buscador.
      const matchTexto = !q || texto(c.codigo).includes(q) || texto(c.descripcion).includes(q);

      const matchEstado =
        filtroEstado === 'todos' ||
        (filtroEstado === 'usables' && c.estado === 'activo') ||
        (filtroEstado === 'problema' && ['vencido', 'agotado'].includes(c.estado)) ||
        filtroEstado === c.estado;

      return matchTexto && matchEstado;
    });
  }, [cuponesUi, search, filtroEstado]);

  /*
    `stats` era `useState` recalculado a mano dentro de `loadCupones`: datos
    derivados guardados en estado, que se desincronizan solos. Y contaba
    "Total usos", un número de vitrina. Lo que sí hace falta saber es cuántos
    cupones están rotos: publicados pero vencidos o agotados.
  */
  const stats = useMemo(() => {
    const porEstado = cuponesUi.reduce((acc, c) => {
      acc[c.estado] = (acc[c.estado] || 0) + 1;
      return acc;
    }, {});
    return {
      total: cuponesUi.length,
      activos: porEstado.activo || 0,
      programados: porEstado.programado || 0,
      caidos: (porEstado.vencido || 0) + (porEstado.agotado || 0),
      usos: cuponesUi.reduce((acc, c) => acc + Number(c.usos_actuales || 0), 0),
    };
  }, [cuponesUi]);

  function resetForm() {
    setForm({
      codigo: '',
      descripcion: '',
      tipo_descuento: 'porcentaje',
      valor_descuento: '',
      minimo_compra: '',
      descuento_maximo: '',
      fecha_inicio: '',
      fecha_fin: '',
      limite_usos: '',
      limite_por_cliente: '1',
      activo: true,
    });
    setEditingCupon(null);
  }

  function openModal(cupon = null) {
    if (cupon) {
      setEditingCupon(cupon);
      setForm({
        codigo: cupon.codigo || '',
        descripcion: cupon.descripcion || '',
        tipo_descuento: cupon.tipo_descuento === 'fijo' ? 'fijo' : 'porcentaje',
        valor_descuento: cupon.valor_descuento ?? '',
        minimo_compra: cupon.minimo_compra || '',
        descuento_maximo: cupon.descuento_maximo || '',
        fecha_inicio: cupon.fecha_inicio ? String(cupon.fecha_inicio).slice(0, 16) : '',
        fecha_fin: cupon.fecha_fin ? String(cupon.fecha_fin).slice(0, 16) : '',
        limite_usos: cupon.limite_usos || '',
        limite_por_cliente: cupon.limite_por_cliente ?? 1,
        activo: Number(cupon.activo) === 1,
      });
    } else {
      resetForm();
    }
    setModalOpen(true);
  }

  function cerrarModal() {
    setModalOpen(false);
    resetForm();
  }

  useCerrarConEscape(modalOpen, cerrarModal);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.codigo.trim()) return toast.error('El código es obligatorio');

    const valor = parseFloat(form.valor_descuento);
    if (!valor || valor <= 0) return toast.error('El descuento debe ser mayor a 0');

    // No había tope: se podía guardar un cupón de 150% de descuento, que en
    // la caja significa pagarle al cliente por llevarse la comida.
    if (form.tipo_descuento === 'porcentaje' && valor > 100) {
      return toast.error('Un descuento en porcentaje no puede superar el 100%');
    }

    if (form.fecha_inicio && form.fecha_fin && form.fecha_inicio > form.fecha_fin) {
      return toast.error('La fecha de fin es anterior a la de inicio');
    }

    const payload = {
      ...form,
      codigo: form.codigo.trim().toUpperCase(),
      valor_descuento: valor,
      minimo_compra: parseFloat(form.minimo_compra || 0),
      descuento_maximo: parseFloat(form.descuento_maximo || 0),
      limite_usos: parseInt(form.limite_usos || 0, 10),
      limite_por_cliente: parseInt(form.limite_por_cliente || 1, 10),
      activo: form.activo ? 1 : 0,
    };

    setSaving(true);
    try {
      if (editingCupon) {
        await api.put(`/cupones/${editingCupon.id}`, payload);
        toast.success('Cupón actualizado');
      } else {
        await api.post('/cupones', payload);
        toast.success('Cupón creado');
      }
      cerrarModal();
      loadCupones();
    } catch (error) {
      // Leía `error.message`, pero el interceptor rechaza con el cuerpo del
      // servidor, que trae `.error`. Resultado: mensajes útiles como "Ya
      // existe un cupón con ese código" nunca llegaban a verse; siempre salía
      // el genérico y no sabías por qué no guardaba.
      toast.error(error?.error || 'Error al guardar el cupón');
    } finally {
      setSaving(false);
    }
  }

  async function confirmarDelete() {
    if (!deleteDialog) return;
    try {
      await api.delete(`/cupones/${deleteDialog.id}`);
      toast.success('Cupón eliminado');
      setDeleteDialog(null);
      loadCupones();
    } catch (error) {
      toast.error(error?.error || 'Error al eliminar el cupón');
    }
  }

  function copiarCodigo(text) {
    if (!navigator.clipboard?.writeText) {
      return toast.error('El navegador no permite copiar automáticamente');
    }
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Código copiado'))
      .catch(() => toast.error('No se pudo copiar'));
  }

  const generarCodigo = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = Array.from(
      { length: 6 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    setForm((f) => ({ ...f, codigo: `PROMO-${part}` }));
  };

  const hayFiltros = Boolean(search.trim()) || filtroEstado !== 'todos';

  const FILTROS = [
    { value: 'todos', label: 'Todos' },
    { value: 'usables', label: 'Funcionando' },
    { value: 'programado', label: 'Programados' },
    { value: 'problema', label: 'Vencidos o agotados' },
    { value: 'pausado', label: 'Pausados' },
  ];

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-7xl space-y-4 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Cupones</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {stats.total === 0
                ? 'Todavía no hay cupones creados'
                : `${stats.total} cupones · ${stats.usos} usos acumulados`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openModal()}
              style={{ background: BRAND }}
              className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              <Plus size={16} strokeWidth={STROKE} />
              Nuevo cupón
            </button>
            <button
              type="button"
              onClick={loadCupones}
              title="Actualizar"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Funcionando ahora"
            value={stats.activos}
            helper="Se pueden aplicar en la caja"
            tono="verde"
          />
          <Stat
            label="Vencidos o agotados"
            value={stats.caidos}
            helper={stats.caidos > 0 ? 'Figuran publicados pero ya no aplican' : 'Ninguno caído'}
            alerta={stats.caidos > 0}
          />
          <Stat
            label="Programados"
            value={stats.programados}
            helper="Arrancan en una fecha futura"
            tono="azul"
          />
          <Stat
            label="Usos acumulados"
            value={stats.usos}
            helper="Veces que se aplicó un cupón"
            tono="ambar"
          />
        </div>

        {/* ── Filtros ── */}
        <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative lg:max-w-sm lg:flex-1">
              <Search
                size={16}
                strokeWidth={STROKE}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código o descripción"
                className={CONTROL + ' pl-9'}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FILTROS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFiltroEstado(f.value)}
                  style={
                    filtroEstado === f.value ? { background: BRAND, color: '#fff' } : undefined
                  }
                  className={`h-9 rounded-xl px-3 text-[12px] font-semibold transition ${
                    filtroEstado === f.value ? '' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {hayFiltros ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
              <p className="text-[12px] text-gray-500">
                Mostrando{' '}
                <span className="font-semibold text-gray-900">{cuponesFiltrados.length}</span> de{' '}
                {stats.total}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFiltroEstado('todos');
                }}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
              >
                <X size={13} strokeWidth={STROKE} />
                Limpiar
              </button>
            </div>
          ) : null}
        </div>

        {/* ── Listado ── */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-200/70" />
            ))}
          </div>
        ) : cuponesFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-14 text-center">
            <p className="text-[14px] font-medium text-gray-600">
              {hayFiltros ? 'Ningún cupón coincide' : 'Todavía no hay cupones'}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[12px] leading-4 text-gray-400">
              {hayFiltros
                ? 'Probá con otro código o sacá los filtros.'
                : 'Un cupón es un código que el cliente escribe para llevarse un descuento.'}
            </p>
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={
                  hayFiltros
                    ? () => {
                        setSearch('');
                        setFiltroEstado('todos');
                      }
                    : () => openModal()
                }
                style={hayFiltros ? undefined : { background: BRAND }}
                className={`h-10 rounded-xl px-4 text-[13px] font-semibold transition ${
                  hayFiltros
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'text-white hover:brightness-110'
                }`}
              >
                {hayFiltros ? 'Limpiar filtros' : 'Crear el primero'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cuponesFiltrados.map((cupon) => {
              const tono = ESTADOS[cupon.estado];
              const esPorcentaje = cupon.tipo_descuento !== 'fijo';
              // `TIPOS_DESCUENTO[cupon.tipo_descuento].icon` reventaba la
              // tabla entera si un cupón traía un tipo distinto a los dos
              // conocidos: no había ningún fallback.
              const Icono = esPorcentaje ? Percent : DollarSign;
              const limite = Number(cupon.limite_usos || 0);
              const usos = Number(cupon.usos_actuales || 0);
              const desde = formatDate(cupon.fecha_inicio);
              const hasta = formatDate(cupon.fecha_fin);
              const caido = ['vencido', 'agotado'].includes(cupon.estado);

              return (
                <div
                  key={cupon.id}
                  className={`group rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)] ${
                    cupon.estado === 'pausado' ? 'opacity-70' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <code className="truncate rounded-lg bg-gray-100 px-2 py-1 font-mono text-[13px] font-semibold text-gray-900">
                          {cupon.codigo || 'SIN CÓDIGO'}
                        </code>
                        <button
                          type="button"
                          onClick={() => copiarCodigo(cupon.codigo)}
                          title="Copiar código"
                          className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Copy size={13} strokeWidth={STROKE} />
                        </button>
                      </div>
                      <span
                        className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: tono.bg, color: tono.fg }}
                      >
                        {tono.label}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1 text-right">
                      <Icono size={15} strokeWidth={STROKE} style={{ color: BRAND }} />
                      <span className="text-[18px] font-bold tabular-nums text-gray-900">
                        {esPorcentaje
                          ? `${cupon.valor_descuento}%`
                          : fmtMoney(cupon.valor_descuento)}
                      </span>
                    </div>
                  </div>

                  {cupon.descripcion ? (
                    <p className="mt-2 line-clamp-2 text-[12px] leading-4 text-gray-500">
                      {cupon.descripcion}
                    </p>
                  ) : null}

                  <div className="mt-3 space-y-1 text-[11px] text-gray-500">
                    {Number(cupon.minimo_compra || 0) > 0 ? (
                      <p>Compra mínima {fmtMoney(cupon.minimo_compra)}</p>
                    ) : null}
                    {esPorcentaje && Number(cupon.descuento_maximo || 0) > 0 ? (
                      <p>Tope de descuento {fmtMoney(cupon.descuento_maximo)}</p>
                    ) : null}
                    <p>
                      {cupon.limite_por_cliente} {cupon.limite_por_cliente === 1 ? 'uso' : 'usos'}{' '}
                      por cliente
                    </p>
                    {desde || hasta ? (
                      <p className="flex items-center gap-1">
                        <Calendar size={11} strokeWidth={STROKE} />
                        {desde ? `Desde ${desde}` : 'Sin inicio'}
                        {hasta ? ` · hasta ${hasta}` : ' · sin vencimiento'}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-gray-400">
                        {limite > 0 ? 'Usos' : 'Usos (sin límite)'}
                      </span>
                      <span className="text-[12px] font-semibold tabular-nums text-gray-900">
                        {usos}
                        {limite > 0 ? ` / ${limite}` : ''}
                      </span>
                    </div>
                    {limite > 0 ? (
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (usos / limite) * 100)}%`,
                            background: caido ? BRAND : '#047857',
                          }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    <button
                      type="button"
                      onClick={() => openModal(cupon)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      <Pencil size={13} strokeWidth={STROKE} />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteDialog(cupon)}
                      title="Eliminar"
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} strokeWidth={STROKE} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
          onClick={fondoModal(cerrarModal)}
        >
          <form
            onSubmit={handleSubmit}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-[17px] font-semibold text-gray-900">
                  {editingCupon ? `Editar ${editingCupon.codigo}` : 'Nuevo cupón'}
                </h3>
                <p className="mt-0.5 text-[12px] text-gray-500">
                  El cliente escribe este código para llevarse el descuento
                </p>
              </div>
              <button
                type="button"
                onClick={cerrarModal}
                aria-label="Cerrar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} strokeWidth={STROKE} />
              </button>
            </div>

            {/* El formulario no tenía scroll propio: en pantalla chica los
                últimos campos y los botones quedaban cortados. */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo label="Código" className="sm:col-span-2">
                  <div className="flex gap-2">
                    <input
                      value={form.codigo}
                      onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                      placeholder="VERANO20"
                      className={`${CONTROL} font-mono uppercase`}
                    />
                    <button
                      type="button"
                      onClick={generarCodigo}
                      title="Generar uno al azar"
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      <Shuffle size={14} strokeWidth={STROKE} />
                      Generar
                    </button>
                  </div>
                </Campo>

                <Campo label="Descripción" className="sm:col-span-2">
                  <input
                    value={form.descripcion}
                    onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                    placeholder="Para qué es este cupón"
                    className={CONTROL}
                  />
                </Campo>

                <Campo label="Tipo de descuento">
                  <select
                    value={form.tipo_descuento}
                    onChange={(e) => setForm({ ...form, tipo_descuento: e.target.value })}
                    className={`${CONTROL} font-medium`}
                  >
                    <option value="porcentaje">Porcentaje</option>
                    <option value="fijo">Monto fijo</option>
                  </select>
                </Campo>

                <Campo
                  label={
                    form.tipo_descuento === 'porcentaje'
                      ? 'Cuánto descuenta (%)'
                      : 'Cuánto descuenta ($)'
                  }
                  hint={form.tipo_descuento === 'porcentaje' ? 'Hasta 100' : undefined}
                >
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={form.tipo_descuento === 'porcentaje' ? 100 : undefined}
                    value={form.valor_descuento}
                    onChange={(e) => setForm({ ...form, valor_descuento: e.target.value })}
                    placeholder={form.tipo_descuento === 'porcentaje' ? '20' : '5000'}
                    className={`${CONTROL} tabular-nums`}
                  />
                </Campo>

                <Campo label="Compra mínima" hint="Dejalo vacío si no pedís mínimo">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.minimo_compra}
                    onChange={(e) => setForm({ ...form, minimo_compra: e.target.value })}
                    placeholder="Sin mínimo"
                    className={`${CONTROL} tabular-nums`}
                  />
                </Campo>

                <Campo
                  label="Tope de descuento"
                  hint={
                    form.tipo_descuento === 'fijo'
                      ? 'Sólo aplica a descuentos por porcentaje'
                      : 'Cuánto es lo máximo que puede descontar'
                  }
                >
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.descuento_maximo}
                    onChange={(e) => setForm({ ...form, descuento_maximo: e.target.value })}
                    disabled={form.tipo_descuento === 'fijo'}
                    placeholder="Sin tope"
                    className={`${CONTROL} tabular-nums disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}
                  />
                </Campo>

                <Campo label="Empieza" hint="Vacío = desde ya">
                  <input
                    type="datetime-local"
                    value={form.fecha_inicio}
                    onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                    className={CONTROL}
                  />
                </Campo>

                <Campo label="Vence" hint="Vacío = sin vencimiento">
                  <input
                    type="datetime-local"
                    value={form.fecha_fin}
                    onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                    className={CONTROL}
                  />
                </Campo>

                <Campo label="Límite total de usos" hint="Vacío = ilimitado">
                  <input
                    type="number"
                    min="0"
                    value={form.limite_usos}
                    onChange={(e) => setForm({ ...form, limite_usos: e.target.value })}
                    placeholder="Sin límite"
                    className={`${CONTROL} tabular-nums`}
                  />
                </Campo>

                <Campo label="Usos por cliente">
                  <input
                    type="number"
                    min="1"
                    value={form.limite_por_cliente}
                    onChange={(e) => setForm({ ...form, limite_por_cliente: e.target.value })}
                    className={`${CONTROL} tabular-nums`}
                  />
                </Campo>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-gray-50 p-3">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                  style={{ accentColor: BRAND }}
                />
                <span>
                  <span className="block text-[13px] font-medium text-gray-900">
                    Cupón habilitado
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-4 text-gray-500">
                    Si lo apagás deja de aplicarse aunque esté dentro de la fecha.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={cerrarModal}
                className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !form.codigo.trim()}
                style={{ background: BRAND }}
                className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {saving ? 'Guardando…' : editingCupon ? 'Guardar cambios' : 'Crear cupón'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ActionDialog
        open={Boolean(deleteDialog)}
        title={deleteDialog ? `Eliminar ${deleteDialog.codigo}` : ''}
        description={
          Number(deleteDialog?.usos_actuales || 0) > 0
            ? `Este cupón ya se usó ${deleteDialog.usos_actuales} ${Number(deleteDialog.usos_actuales) === 1 ? 'vez' : 'veces'}. Si lo borrás perdés ese historial. Para que deje de aplicarse alcanza con pausarlo.`
            : 'Se elimina el cupón del sistema. No se puede deshacer.'
        }
        confirmLabel="Eliminar cupón"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={confirmarDelete}
        onClose={() => setDeleteDialog(null)}
      />
    </div>
  );
}
