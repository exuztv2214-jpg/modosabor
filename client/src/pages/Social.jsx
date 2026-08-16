import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Facebook,
  FolderPlus,
  ImagePlus,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';

const initialDraft = {
  nombre: '',
  texto: '',
  programadaPara: '',
  destinoIds: [],
  conjuntoIds: [],
  mediaIds: [],
  personalizaciones: { modo_prueba: true },
};
const apiError = (error) => error?.error || error?.message || 'No se pudo completar la operación';
const when = (value) =>
  value
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value)
      )
    : '—';

export default function Social() {
  const [tab, setTab] = useState('inicio');
  const [data, setData] = useState({
    dashboard: null,
    destinos: [],
    conjuntos: [],
    campanas: [],
    media: [],
    logs: [],
  });
  const [draft, setDraft] = useState(initialDraft);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [setName, setSetName] = useState('');
  const [page, setPage] = useState({ nombre: '', url: '' });

  const reload = async () => {
    try {
      const [dashboard, destinos, conjuntos, campanas, media, logs] = await Promise.all([
        api.get('/social/dashboard'),
        api.get('/social/destinos'),
        api.get('/social/conjuntos'),
        api.get('/social/campanas'),
        api.get('/social/media'),
        api.get('/social/logs'),
      ]);
      setData({ dashboard, destinos, conjuntos, campanas, media, logs });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    reload();
  }, []);

  const selectedCount = useMemo(
    () =>
      new Set([
        ...draft.destinoIds,
        ...data.conjuntos
          .filter((set) => draft.conjuntoIds.includes(set.id))
          .flatMap((set) => set.destinos.map((item) => item.id)),
      ]).size,
    [data.conjuntos, draft]
  );
  const toggle = (field, id) =>
    setDraft((old) => ({
      ...old,
      [field]: old[field].includes(id)
        ? old[field].filter((value) => value !== id)
        : [...old[field], id],
    }));
  const saveCampaign = async (queueNow = false) => {
    if (!draft.nombre.trim() || (!draft.texto.trim() && !draft.mediaIds.length) || !selectedCount)
      return toast.error('Completá nombre, contenido y al menos un destino.');
    if (draft.personalizaciones.modo_prueba && (draft.conjuntoIds.length || selectedCount !== 1))
      return toast.error(
        'Modo de prueba: elegí manualmente un único destino: una Page o un grupo.'
      );
    setSending(true);
    try {
      const campaign = await api.post('/social/campanas', draft);
      if (queueNow) await api.post(`/social/campanas/${campaign.id}/encolar`, { ahora: true });
      toast.success(queueNow ? 'Publicación enviada a la cola local.' : 'Borrador guardado.');
      setDraft(initialDraft);
      await reload();
      setTab('campanas');
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSending(false);
    }
  };
  const syncGroups = async () => {
    try {
      await api.post('/social/grupos/sincronizar');
      toast.success('Sincronización solicitada al Worker Social.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };
  const health = async () => {
    try {
      await api.post('/social/worker/health-check');
      toast.success('Chequeo solicitado al Worker Social.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };
  const upload = async (event) => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    const form = new FormData();
    files.forEach((file) => form.append('archivos', file));
    try {
      const created = await api.post('/social/media', form);
      setDraft((old) => ({
        ...old,
        mediaIds: [...old.mediaIds, ...created.map((item) => item.id)],
      }));
      await reload();
      toast.success('Multimedia cargada.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };
  const createSet = async () => {
    if (!setName.trim() || !draft.destinoIds.length)
      return toast.error('Elegí nombre y destinos para el conjunto.');
    try {
      await api.post('/social/conjuntos', { nombre: setName, destinoIds: draft.destinoIds });
      setSetName('');
      await reload();
      toast.success('Conjunto creado.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };
  const createPage = async () => {
    if (!page.nombre.trim() || !page.url.trim())
      return toast.error('Indicá el nombre y la URL de la página.');
    try {
      await api.post('/social/destinos', { provider: 'facebook', tipo: 'facebook_page', ...page });
      setPage({ nombre: '', url: '' });
      await reload();
      toast.success('Página de Facebook agregada.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };
  const retryFailed = async (id) => {
    try {
      await api.post(`/social/campanas/${id}/reintentar-fallidos`);
      await reload();
      toast.success('Sólo los destinos fallidos volvieron a la cola.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };
  const cards = [
    ['Grupos disponibles', data.dashboard?.groups || 0, Users, 'text-blue-600'],
    ['En cola', data.dashboard?.queued || 0, CalendarClock, 'text-amber-600'],
    ['Con errores', data.dashboard?.failed || 0, XCircle, 'text-rose-600'],
    [
      'Worker local',
      data.dashboard?.health?.resultado?.facebook_session === 'ACTIVE'
        ? 'READY'
        : data.dashboard?.health?.resultado?.facebook_session === 'EXPIRED'
          ? 'Sesión vencida'
          : data.dashboard?.worker?.estado === 'online'
            ? 'Sin validar'
            : 'Sin señal',
      ShieldCheck,
      data.dashboard?.health?.resultado?.facebook_session === 'ACTIVE'
        ? 'text-emerald-600'
        : 'text-slate-500',
    ],
  ];
  if (loading) return <div className="p-8 text-slate-500">Cargando Modo Sabor Social…</div>;

  return (
    <main className="min-h-full bg-slate-50 p-4 md:p-7">
      <div className="mx-auto max-w-7xl">
        <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm">
                <Facebook size={16} /> Marketing integrado
              </p>
              <h1 className="text-3xl font-black md:text-4xl">Modo Sabor Social</h1>
              <p className="mt-2 max-w-2xl text-slate-300">
                Una publicación, varios destinos. La campaña se guarda acá; el Worker local publica
                desde tu Chrome con sesión iniciada.
              </p>
            </div>
            <button
              onClick={reload}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              <RefreshCw size={16} /> Actualizar
            </button>
          </div>
        </section>
        <nav className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {[
            ['inicio', 'Inicio'],
            ['crear', 'Crear publicación'],
            ['destinos', 'Grupos y destinos'],
            ['campanas', 'Calendario y campañas'],
            ['actividad', 'Actividad'],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${tab === id ? 'bg-red-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === 'inicio' && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map(([label, value, Icon, color]) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
                >
                  <Icon className={color} size={23} />
                  <p className="mt-4 text-2xl font-black text-slate-900">{value}</p>
                  <p className="text-sm text-slate-500">{label}</p>
                </div>
              ))}
            </section>
            <section className="mt-6 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h2 className="font-bold text-slate-900">Conexión de Facebook</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {data.dashboard?.health?.resultado
                    ? `Chrome: ${data.dashboard.health.resultado.chrome} · Sesión: ${data.dashboard.health.resultado.facebook_session} · Grupos: ${data.dashboard.health.resultado.groups_sync}`
                    : data.dashboard?.worker?.ultimo_heartbeat_en
                      ? `Última señal: ${when(data.dashboard.worker.ultimo_heartbeat_en)}. Falta health check.`
                      : 'El Worker todavía no envió señal.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    onClick={health}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
                  >
                    Probar conexión
                  </button>
                  <button
                    onClick={syncGroups}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
                  >
                    Sincronizar grupos
                  </button>
                </div>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <h2 className="font-bold text-slate-900">Publicar con control</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  No se guardan cookies ni contraseñas. Si Facebook pide una verificación, el Worker
                  se frena y queda registrado; no intenta evadirla.
                </p>
                <button
                  onClick={() => setTab('crear')}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
                >
                  <Send size={16} /> Nueva publicación
                </button>
              </div>
            </section>
          </>
        )}
        {tab === 'crear' && (
          <section className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <b>MODO DE PRUEBA</b>
                <br />
                Elegí manualmente una Page o un grupo. Nunca se seleccionan todos los grupos.
              </div>
              <h2 className="mt-4 text-xl font-black">Nueva publicación</h2>
              <label className="mt-5 block text-sm font-bold">
                Nombre interno
                <input
                  value={draft.nombre}
                  onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                  placeholder="Ej.: Prueba Page Facebook"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-3"
                />
              </label>
              <label className="mt-4 block text-sm font-bold">
                Texto
                <textarea
                  value={draft.texto}
                  onChange={(e) => setDraft({ ...draft, texto: e.target.value })}
                  rows={8}
                  placeholder="PRUEBA MODO SABOR SOCIAL — no es una promoción"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal"
                />
              </label>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">
                <ImagePlus size={18} /> Adjuntar foto opcional
                <input type="file" accept="image/*" multiple className="hidden" onChange={upload} />
              </label>
              {draft.mediaIds.length > 0 && (
                <p className="mt-2 text-sm text-emerald-700">
                  {draft.mediaIds.length} archivo(s) seleccionado(s).
                </p>
              )}
              <label className="mt-4 block text-sm font-bold">
                Programar (hora argentina)
                <input
                  type="datetime-local"
                  value={draft.programadaPara}
                  onChange={(e) => setDraft({ ...draft, programadaPara: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 p-3"
                />
              </label>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  disabled={sending}
                  onClick={() => saveCampaign(false)}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold"
                >
                  Guardar borrador
                </button>
                <button
                  disabled={sending}
                  onClick={() => saveCampaign(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white"
                >
                  <Play size={16} />{' '}
                  {draft.programadaPara ? 'Programar prueba' : 'Enviar prueba al Worker'}
                </button>
              </div>
            </div>
            <aside className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h3 className="font-black">
                Destino <span className="text-red-600">({selectedCount}/1)</span>
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Seleccioná manualmente una Page o un único grupo. Los conjuntos están bloqueados
                durante la validación.
              </p>
              <div className="mt-4 space-y-2">
                {data.destinos.map((item) => (
                  <label
                    key={item.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={draft.destinoIds.includes(item.id)}
                      onChange={() => toggle('destinoIds', item.id)}
                    />
                    <span className="min-w-0">
                      <b className="block truncate">{item.nombre}</b>
                      <small className="text-slate-500">
                        {item.tipo.replace('facebook_', 'Facebook ')}
                      </small>
                    </span>
                  </label>
                ))}
                {!data.destinos.length && (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                    Primero sincronizá tus grupos desde la pestaña “Grupos y destinos”.
                  </p>
                )}
              </div>
            </aside>
          </section>
        )}
        {tab === 'destinos' && (
          <section className="grid gap-6 lg:grid-cols-[1fr_.8fr]">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black">Facebook: página y grupos</h2>
                  <p className="text-sm text-slate-500">
                    Los grupos se detectan desde el Chrome del local.
                  </p>
                </div>
                <button
                  onClick={syncGroups}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
                >
                  Sincronizar grupos
                </button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <input
                  value={page.nombre}
                  onChange={(e) => setPage({ ...page, nombre: e.target.value })}
                  placeholder="Nombre de tu página"
                  className="rounded-xl border border-slate-300 p-3 text-sm"
                />
                <input
                  value={page.url}
                  onChange={(e) => setPage({ ...page, url: e.target.value })}
                  placeholder="https://facebook.com/tu-pagina"
                  className="rounded-xl border border-slate-300 p-3 text-sm"
                />
              </div>
              <button
                onClick={createPage}
                className="mt-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold"
              >
                Agregar página Facebook
              </button>
              <div className="mt-5 divide-y">
                {data.destinos.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-3">
                    <div>
                      <b>{item.nombre}</b>
                      <p className="text-xs text-slate-500">
                        {item.tipo === 'facebook_page' ? 'Página Facebook' : 'Grupo Facebook'} ·{' '}
                        {item.url || item.identificador_externo}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${item.habilitada ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                    >
                      {item.habilitada ? 'Habilitado' : 'Pausado'}
                    </span>
                  </div>
                ))}
                {!data.destinos.length && (
                  <p className="py-6 text-sm text-slate-500">Aún no hay grupos sincronizados.</p>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-black">Conjuntos</h2>
              <p className="mt-1 text-sm text-slate-500">
                Seleccioná destinos en “Crear publicación” y guardalos para elegirlos en un clic.
              </p>
              <input
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                placeholder="Ej.: Grupos Monteros"
                className="mt-4 w-full rounded-xl border border-slate-300 p-3"
              />
              <button
                onClick={createSet}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
              >
                <FolderPlus size={16} /> Crear conjunto
              </button>
              <div className="mt-5 space-y-2">
                {data.conjuntos.map((set) => (
                  <div key={set.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <b>{set.nombre}</b>
                    <span className="ml-2 text-slate-500">{set.total} destinos</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
        {tab === 'campanas' && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black">Calendario y campañas</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-slate-500">
                  <tr>
                    <th className="p-3">Campaña</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Programada</th>
                    <th className="p-3">Resultado</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.campanas.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-3 font-bold">{item.nombre}</td>
                      <td className="p-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                          {item.estado}
                        </span>
                      </td>
                      <td className="p-3">{when(item.programada_para)}</td>
                      <td className="p-3 text-slate-600">
                        {item.publicados}/{item.total} publicados · {item.fallidos} fallidos
                      </td>
                      <td className="p-3">
                        {item.fallidos > 0 && (
                          <button
                            onClick={() => retryFailed(item.id)}
                            className="text-xs font-bold text-red-600"
                          >
                            Reintentar fallidos
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.campanas.length && (
                <p className="p-5 text-sm text-slate-500">Todavía no hay campañas.</p>
              )}
            </div>
          </section>
        )}
        {tab === 'actividad' && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-black">Actividad</h2>
            <div className="mt-4 space-y-3">
              {data.logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex justify-between gap-4">
                    <b className={log.nivel === 'error' ? 'text-rose-700' : 'text-slate-800'}>
                      {log.mensaje}
                    </b>
                    <span className="text-xs text-slate-500">{when(log.creado_en)}</span>
                  </div>
                  {log.codigo && <p className="mt-1 text-xs text-slate-500">{log.codigo}</p>}
                </div>
              ))}
              {!data.logs.length && (
                <p className="text-sm text-slate-500">Sin movimientos por ahora.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
