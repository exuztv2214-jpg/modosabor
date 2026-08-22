import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  PenSquare,
  CalendarDays,
  MapPin,
  ListFilter,
  Bell,
  BarChart3,
  Save,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  XCircle,
  Star,
  Pencil,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Play,
  Pause,
  ImagePlus,
  Sparkles,
  X,
  Facebook,
  Check,
  Clock,
  Filter,
  Settings,
  Instagram,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import {
  STATUS_STYLES,
  formatSocialDate,
  formatSocialDateTime,
  socialApiError,
} from './social/socialUi.js';
import './Social.css';

const apiError = socialApiError;
const when = formatSocialDateTime;
const whenShort = formatSocialDate;

export default function Social() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [data, setData] = useState({
    dashboard: null,
    destinos: [],
    conjuntos: [],
    campanas: [],
    media: [],
    logs: [],
    templates: [],
  });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Composer state
  const [draft, setDraft] = useState({
    nombre: '',
    texto: '',
    programadaPara: '',
    destinoIds: [],
    conjuntoIds: [],
    mediaIds: [],
    personalizaciones: { modo_prueba: true },
    ensayo: false,
  });
  const [genTema, setGenTema] = useState('');
  const [generating, setGenerating] = useState(false);

  // Destinations state
  const [editingDest, setEditingDest] = useState(null);
  const [editForm, setEditForm] = useState({
    nombre: '',
    url: '',
    habilitada: true,
    favorita: false,
  });
  const [setName, setSetName] = useState('');
  const [page, setPage] = useState({ nombre: '', url: '' });

  /*
    Con qué identidad se está trabajando: Perfil o Fan Page. Es la primera
    decisión de toda la pantalla — los grupos, los conjuntos y la publicación
    dependen de ella. Arranca en la primera de Facebook, que es el Perfil.
  */
  const [identidadElegida, setIdentidadElegida] = useState(null);

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date());
  const [calVista, setCalVista] = useState('semana');

  /* El lunes de la semana que se está mirando. */
  const [semanaArranque, setSemanaArranque] = useState(() => {
    const hoy = new Date();
    const dia = hoy.getDay();
    /* getDay() da 0 para domingo; acá la semana arranca el lunes. */
    hoy.setDate(hoy.getDate() - (dia === 0 ? 6 : dia - 1));
    hoy.setHours(0, 0, 0, 0);
    return hoy;
  });

  const moverSemana = (dias) =>
    setSemanaArranque((actual) => {
      const nueva = new Date(actual);
      nueva.setDate(actual.getDate() + dias);
      return nueva;
    });

  // Campaign filters
  const [campFilter, setCampFilter] = useState('all');
  const [metricsData, setMetricsData] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [socialConfig, setSocialConfig] = useState({ delaySegundos: 30 });
  const [savingConfig, setSavingConfig] = useState(false);

  const loadMetrics = async () => {
    setMetricsLoading(true);
    try {
      const data = await api.get('/social/metricas?dias=30');
      setMetricsData(data);
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadSocialConfig = async () => {
    try {
      const config = await api.get('/social/config');
      setSocialConfig(config);
    } catch (error) {
      // Silencioso: usamos default
    }
  };

  const saveSocialConfig = async (cambios) => {
    setSavingConfig(true);
    try {
      const config = await api.post('/social/config', cambios);
      setSocialConfig(config);
      toast.success('Configuración de cola guardada.');
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSavingConfig(false);
    }
  };

  /*
    ── El freno de mano ─────────────────────────────────────────────────────

    Pausar no cancela nada: los destinos quedan en cola donde están y siguen
    cuando se reanuda. Por eso el botón no pregunta "¿seguro?": no hay nada
    que perder, y una confirmación de más es una confirmación que se aprende a
    apretar sin leer.
  */
  const cambiarPausaGeneral = async (activa) => {
    try {
      const config = await api.post('/social/pausa', { activa });
      setSocialConfig(config);
      toast.success(activa ? 'Se pausó toda la publicación.' : 'Publicación reanudada.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const cambiarPausaIdentidad = async (identidad, activa) => {
    try {
      await api.post(`/social/identidades/${identidad.id}/pausa`, { activa });
      toast.success(activa ? `${identidad.nombre} en pausa.` : `${identidad.nombre} reanudada.`);
      await reload();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const reload = async () => {
    try {
      const [dashboard, destinos, conjuntos, campanas, media, logs, templates, identidades] =
        await Promise.all([
          api.get('/social/dashboard'),
          api.get('/social/destinos'),
          api.get('/social/conjuntos'),
          api.get('/social/campanas'),
          api.get('/social/media'),
          api.get('/social/logs'),
          api.get('/social/plantillas'),
          /*
            Las identidades: Perfil Modo Sabor y Fan Page Modo Sabor Delivery.
            Facebook no es una cuenta sola, y cada identidad tiene sus propios
            grupos. Sin esta lista no se puede preguntar "¿con cuál publicás?",
            que es la primera decisión de todo lo demás.
          */
          api.get('/social/identidades'),
        ]);
      setData({
        dashboard,
        destinos,
        conjuntos,
        campanas,
        media,
        logs,
        templates,
        identidades: identidades?.items || [],
      });

      /*
        Elegir la primera identidad de Facebook la primera vez. No se pisa la
        elección de la persona en las recargas siguientes: si estaba mirando la
        Page, un refresco automático no puede devolverla al Perfil sin aviso.
      */
      setIdentidadElegida((actual) => {
        if (actual) return actual;
        const primera = (identidades?.items || []).find((i) => i.provider === 'facebook');
        return primera?.id || null;
      });
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    loadSocialConfig();
  }, []);

  useEffect(() => {
    if (activeSection === 'metricas' && !metricsData) {
      loadMetrics();
    }
  }, [activeSection, metricsData]);

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
    if (
      !draft.ensayo &&
      draft.personalizaciones.modo_prueba &&
      (draft.conjuntoIds.length || selectedCount !== 1)
    )
      return toast.error('Modo de prueba: elegí manualmente un único destino.');
    setSending(true);
    try {
      const campaign = await api.post('/social/campanas', draft);

      let encolada = null;
      if (queueNow) {
        encolada = await api.post(`/social/campanas/${campaign.id}/encolar`, { ahora: true });
      }

      /*
        El resumen del reparto se dice acá y no media hora después.

        Si de 35 grupos entran 25 hoy, 3 quedan excluidos por reglas y 2 son
        repetidos, la persona tiene que enterarse **en el momento de apretar el
        botón**. Enterarse al día siguiente, mirando una campaña "a medias",
        es lo que hace que uno desconfíe del sistema.
      */
      toast.success(
        queueNow
          ? (draft.ensayo ? 'Ensayo: ' : '') + resumenDelReparto(encolada?.reparto)
          : 'Borrador guardado.'
      );
      setDraft({
        nombre: '',
        texto: '',
        programadaPara: '',
        destinoIds: [],
        conjuntoIds: [],
        mediaIds: [],
        personalizaciones: { modo_prueba: true },
        ensayo: false,
      });
      await reload();
      loadSocialConfig();
      setActiveSection('campanas');
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setSending(false);
    }
  };

  const generateText = async () => {
    if (!genTema.trim()) return toast.error('Escribí un tema para la publicación.');
    setGenerating(true);
    try {
      const { texto } = await api.post('/social/generar-texto', { tema: genTema });
      setDraft((old) => ({ ...old, texto: old.texto ? old.texto + '\n\n' + texto : texto }));
      toast.success('Texto generado con IA.');
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Sincronizar los grupos de una identidad, o de las dos.
   *
   * `cual` puede ser el id de una identidad o la palabra 'ambas'. Sin eso el
   * servidor rechaza el pedido: los grupos del Perfil no son los de la Page, y
   * guardarlos contra la identidad equivocada es peor que no tenerlos.
   */
  const syncGroups = async (cual) => {
    const identidad = cual ?? identidadElegida;
    if (!identidad) {
      toast.error('Elegí con qué identidad querés sincronizar.');
      return;
    }
    try {
      const r = await api.post('/social/grupos/sincronizar', { identidad });
      toast.success(
        r?.comandos
          ? `Sincronización pedida para ${r.comandos.length} identidades.`
          : 'Sincronización pedida al Worker.'
      );
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

  /**
   * Pide a Windows que abra el Worker instalado en esta PC.
   *
   * ── Por qué esto no siempre funciona, y por qué hay que decirlo ──────────
   *
   * `modosabor-social://` es un protocolo propio. Windows sólo sabe qué hacer
   * con él si el Worker se registró como su dueño, y eso pasa **la primera vez
   * que se abre el Worker en modo escritorio**. Si sólo se corrió por consola,
   * el protocolo no existe y el navegador ignora el pedido en silencio.
   *
   * Antes acá se decía "Abrimos el Worker Social" apenas se hacía el pedido,
   * sin ninguna forma de saber si había pasado algo. En el caso más común
   * —Worker nunca abierto en modo escritorio— el mensaje era directamente
   * falso: no se abría nada y el sistema te felicitaba igual.
   *
   * Ahora se mira el latido del Worker, que es el único dato real que tenemos
   * de si está vivo o no.
   */
  const connectFacebook = async () => {
    const estabaOnline = data.dashboard?.worker?.estado === 'online';

    window.location.assign('modosabor-social://connect');

    if (estabaOnline) {
      toast.success(
        'Le pedimos al Worker que abra Facebook. Iniciá sesión sólo si te la pide y después tocá «Verificar worker».'
      );
      return;
    }

    /*
      El Worker no estaba dando señales. Se le da un rato por si el pedido lo
      despertó, y recién ahí se dice qué pasó. Cinco segundos es lo que tarda
      Electron en arrancar y mandar su primer latido en una PC lenta.
    */
    toast.loading('Esperando al Worker…', { id: 'esperando-worker' });
    await new Promise((listo) => setTimeout(listo, 5000));

    try {
      const fresco = await api.get('/social/dashboard');
      toast.dismiss('esperando-worker');

      if (fresco?.worker?.estado === 'online') {
        toast.success('El Worker arrancó. Iniciá sesión en Facebook si te la pide.');
        await reload();
        return;
      }

      toast.error(
        'No se abrió nada. Abrí «Modo Sabor Social Worker» desde el menú Inicio una primera vez y después este botón va a funcionar.',
        { duration: 9000 }
      );
    } catch {
      toast.dismiss('esperando-worker');
      toast.error('No pudimos confirmar si el Worker arrancó. Abrilo a mano y probá de nuevo.');
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
      loadSocialConfig();
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
      loadSocialConfig();
      toast.success('Conjunto creado.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const createPage = async () => {
    if (!page.nombre.trim() || !page.url.trim())
      return toast.error('Indicá el nombre y la URL de la página.');
    try {
      const provider = page.provider || 'facebook';
      const tipo = provider === 'instagram' ? 'instagram_feed' : 'facebook_page';

      /*
        Todo destino nace atado a una identidad. Si la pantalla no eligió una,
        se usa la primera de esa red — hay exactamente dos de Facebook y una de
        Instagram, así que el caso ambiguo casi no existe. Pero si no hubiera
        ninguna, hay que frenar y decirlo: el servidor lo rechazaría igual y
        con un mensaje menos claro.
      */
      const cuentaId =
        Number(page.cuentaId) || (data.identidades || []).find((i) => i.provider === provider)?.id;

      if (!cuentaId) {
        return toast.error(
          `No hay ninguna identidad de ${provider} cargada. Revisá Destinos → Identidades.`
        );
      }

      await api.post('/social/destinos', { provider, tipo, cuentaId, ...page });
      setPage({ nombre: '', url: '' });
      await reload();
      loadSocialConfig();
      toast.success('Página de Facebook agregada.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const retryFailed = async (id) => {
    try {
      await api.post(`/social/campanas/${id}/reintentar-fallidos`);
      await reload();
      loadSocialConfig();
      toast.success('Sólo los destinos fallidos volvieron a la cola.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const duplicateCampaign = async (id) => {
    try {
      await api.post(`/social/campanas/${id}/duplicar`);
      await reload();
      loadSocialConfig();
      toast.success('Campaña duplicada.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const removeCampaign = async (id) => {
    if (!window.confirm('¿Eliminar esta campaña? No se puede deshacer.')) return;
    try {
      await api.delete(`/social/campanas/${id}`);
      await reload();
      loadSocialConfig();
      toast.success('Campaña eliminada.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const cancelCampaignAction = async (id) => {
    try {
      await api.post(`/social/campanas/${id}/cancelar`);
      await reload();
      loadSocialConfig();
      toast.success('Campaña cancelada.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };
  const applyTemplate = (template) => {
    setDraft((old) => ({
      ...old,
      texto: template.texto || old.texto,
      destinoIds: template.destinos_sugeridos || old.destinoIds,
      conjuntoIds: template.conjuntos_sugeridos || old.conjuntoIds,
      programadaPara: template.horario_sugerido || old.programadaPara,
    }));
    toast.success(`Plantilla "${template.nombre}" aplicada.`);
  };
  const saveAsTemplate = async () => {
    if (!draft.texto.trim())
      return toast.error('Escribí un texto antes de guardar como plantilla.');
    const nombre = window.prompt('Nombre de la plantilla:', '');
    if (!nombre) return;
    try {
      await api.post('/social/plantillas', { nombre, texto: draft.texto });
      await reload();
      loadSocialConfig();
      toast.success('Plantilla guardada.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const startEditDest = (item) => {
    setEditingDest(item.id);
    setEditForm({
      nombre: item.nombre,
      url: item.url || '',
      habilitada: item.habilitada,
      favorita: item.favorita,
    });
  };

  const saveEditDest = async () => {
    try {
      await api.put(`/social/destinos/${editingDest}`, editForm);
      setEditingDest(null);
      await reload();
      loadSocialConfig();
      toast.success('Destino actualizado.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const removeDest = async (id) => {
    if (!window.confirm('¿Eliminar este destino? No se puede deshacer.')) return;
    try {
      await api.delete(`/social/destinos/${id}`);
      await reload();
      loadSocialConfig();
      toast.success('Destino eliminado.');
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const calendarDays = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const last = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= last.getDate(); i++) days.push(i);
    return days;
  };

  const getCampaignsForDay = (year, month, day) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return data.campanas.filter((c) => c.programada_para && c.programada_para.startsWith(prefix));
  };

  const filteredCampaigns = useMemo(() => {
    /*
      «Todas» no incluye la papelera. Lo cancelado no es parte del trabajo del
      día: mezclarlo obligaría a leer y descartar en cada vistazo.
    */
    if (campFilter === 'all') return data.campanas.filter((c) => c.estado !== 'cancelled');
    return data.campanas.filter((c) => c.estado === campFilter);
  }, [data.campanas, campFilter]);

  const restaurarCampana = async (id) => {
    try {
      await api.post(`/social/campanas/${id}/restaurar`);
      toast.success('Volvió como borrador. Revisala antes de encolarla de nuevo.');
      await reload();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  /*
    Los números que van al lado de cada sección del menú.

    Salen de datos reales, no son adorno. La regla es que un número sólo
    aparece si significa algo: mostrar "0 con errores" es ruido, mostrar
    "3 con errores" es lo que hace que alguien entre a mirar.
  */
  /* Cuántas autolistas están andando. Se guarda aparte porque la pantalla de
     autolistas se carga sola y el menú tiene que enterarse igual. */
  const [autolistasActivas, setAutolistasActivas] = useState(0);

  const contadoresDelMenu = useMemo(() => {
    const conError = (data.campanas || []).filter((c) =>
      ['failed', 'partial'].includes(c.estado)
    ).length;
    const enCola = Number(data.dashboard?.queued || 0);
    const programadas = (data.campanas || []).filter((c) => c.estado === 'scheduled').length;
    const grupos = (data.destinos || []).filter((d) => d.habilitada).length;

    return {
      dashboard: enCola ? { valor: enCola, tono: 'espera' } : null,
      campanas: conError ? { valor: conError, tono: 'alerta' } : null,
      calendario: programadas ? { valor: programadas } : null,
      destinos: grupos ? { valor: grupos } : null,
      autolistas: autolistasActivas ? { valor: autolistasActivas } : null,
    };
  }, [data.campanas, data.dashboard, data.destinos, autolistasActivas]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'metricas', label: 'Métricas', icon: BarChart3 },
    { id: 'crear', label: 'Crear', icon: PenSquare },
    { id: 'calendario', label: 'Calendario', icon: CalendarDays },
    { id: 'destinos', label: 'Destinos', icon: MapPin },
    { id: 'autolistas', label: 'Autolistas', icon: RefreshCw },
    { id: 'campanas', label: 'Campañas', icon: ListFilter },
    { id: 'actividad', label: 'Actividad', icon: Bell },
    { id: 'config', label: 'Configuración', icon: Settings },
  ];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-3 animate-spin" size={28} />
          <p className="text-sm font-medium">Cargando Modo Sabor Social…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="social-vista">
      {/*
        ── El sidebar ──────────────────────────────────────────────────────

        Antes era una barra de iconos sin nombres: había que pasar el mouse por
        cada uno para saber qué era. Eso obliga a memorizar siete símbolos, y
        el que entra una vez por semana los olvida todos.

        Ahora cada sección tiene su nombre y su número al lado. El número no es
        adorno: es lo que hace que se vea de un vistazo que hay 3 con error sin
        tener que entrar a buscarlos.
      */}
      <aside className="social-lateral">
        <div className="social-marca">
          <span className="social-marca-sello">MS</span>
          <span className="social-marca-texto">
            <strong>Modo Sabor</strong>
            <em>Social</em>
          </span>
        </div>

        <nav className="social-menu" aria-label="Secciones de Modo Sabor Social">
          {navItems.map((item) => {
            const Icon = item.icon;
            const activa = activeSection === item.id;
            const cuenta = contadoresDelMenu[item.id];

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`social-menu-item ${activa ? 'activa' : ''} ${
                  item.id === 'crear' ? 'destacada' : ''
                }`}
              >
                <span className="social-menu-icono">
                  <Icon size={17} />
                </span>
                <span className="social-menu-texto">{item.label}</span>
                {cuenta ? (
                  <span className={`social-menu-cuenta ${cuenta.tono || ''}`}>{cuenta.valor}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Las identidades, que es la primera decisión de todo lo demás. */}
        <div className="social-lateral-bloque">
          <p className="social-lateral-titulo">Publicás como</p>
          {(data.identidades || [])
            .filter((i) => i.provider === 'facebook')
            .map((identidad) => (
              <button
                key={identidad.id}
                type="button"
                onClick={() => {
                  setIdentidadElegida(identidad.id);
                  setActiveSection('destinos');
                }}
                className={`social-identidad ${identidadElegida === identidad.id ? 'activa' : ''}`}
              >
                <span className="social-identidad-avatar">
                  {identidad.metadata?.tipo === 'page' ? (
                    <Facebook size={14} />
                  ) : (
                    <Users size={14} />
                  )}
                </span>
                <span className="social-identidad-texto">
                  <strong>{identidad.nombre}</strong>
                  <em>
                    {
                      data.destinos.filter(
                        (d) => d.tipo === 'facebook_group' && d.cuenta_id === identidad.id
                      ).length
                    }{' '}
                    grupos
                  </em>
                </span>
                <span
                  className={`social-punto ${identidad.pausada ? 'pausada' : 'viva'}`}
                  title={identidad.pausada ? 'En pausa' : 'Activa'}
                />
              </button>
            ))}
          {!(data.identidades || []).length && (
            <p className="social-lateral-vacio">
              Todavía no hay identidades. Conectá el Worker y sincronizá.
            </p>
          )}
        </div>

        <div className="social-lateral-pie">
          <button type="button" onClick={health} className="social-lateral-accion">
            <ShieldCheck size={14} /> Verificar worker
          </button>
          <button type="button" onClick={reload} className="social-lateral-accion sutil">
            <RefreshCw size={14} /> Actualizar
          </button>
        </div>
      </aside>

      <main className="social-main">
        <header className="social-header">
          <div className="social-header-titulo">
            <h2>{navItems.find((n) => n.id === activeSection)?.label}</h2>
            {/*
              `capitalize` de CSS pone mayúscula en cada palabra y deja
              "Viernes, 21 De Agosto De 2026". Se capitaliza sólo la primera
              letra, que es como se escribe una fecha en castellano.
            */}
            <p>{conMayusculaInicial(fechaDeHoy())}</p>
          </div>

          <div className="social-header-acciones">
            {Boolean(socialConfig.pausaGlobal) && (
              <span className="social-chip alerta">
                <Pause size={12} /> Todo pausado
              </span>
            )}
            {data.dashboard?.workerOffline && (
              <span className="social-chip alerta">
                <AlertTriangle size={12} /> Worker offline
              </span>
            )}
            <button onClick={() => setActiveSection('crear')} className="social-boton-principal">
              <Send size={14} /> Nueva publicación
            </button>
          </div>
        </header>

        <div className="social-content p-6 md:p-8">
          {/* ==================== DASHBOARD ==================== */}
          {activeSection === 'dashboard' && (
            <div className="space-y-6">
              {/* Métricas Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Grupos disponibles"
                  tinte="#2563eb"
                  value={data.dashboard?.groups || 0}
                  icon={Users}
                  color="text-blue-600"
                  bg="bg-blue-50"
                  pie={`${data.destinos.filter((d) => d.favorita).length} favoritos`}
                />
                <MetricCard
                  label="En cola"
                  tinte="#d97706"
                  value={data.dashboard?.queued || 0}
                  icon={Clock}
                  color="text-amber-600"
                  bg="bg-amber-50"
                  /*
                    La barra muestra cuánto del cupo del día está comprometido.
                    Un "12 en cola" no dice nada solo; contra un cupo de 25 dice
                    que hoy entra todo.
                  */
                  barra={
                    socialConfig.cupoDiario
                      ? (Number(data.dashboard?.queued || 0) / socialConfig.cupoDiario) * 100
                      : undefined
                  }
                  pie={socialConfig.cupoDiario ? `cupo ${socialConfig.cupoDiario}/día` : null}
                />
                <MetricCard
                  label="Con errores"
                  tinte="#e11d48"
                  value={data.dashboard?.failed || 0}
                  icon={XCircle}
                  color="text-rose-600"
                  bg="bg-rose-50"
                />
                <MetricCard
                  label="Worker local"
                  tinte="#0d9488"
                  value={
                    data.dashboard?.health?.resultado?.facebook_session === 'ACTIVE'
                      ? 'Online'
                      : data.dashboard?.health?.resultado?.facebook_session === 'EXPIRED'
                        ? 'Sesión vencida'
                        : data.dashboard?.worker?.estado === 'online'
                          ? 'Sin validar'
                          : 'Offline'
                  }
                  icon={ShieldCheck}
                  color={
                    data.dashboard?.health?.resultado?.facebook_session === 'ACTIVE'
                      ? 'text-emerald-600'
                      : 'text-slate-400'
                  }
                  bg={
                    data.dashboard?.health?.resultado?.facebook_session === 'ACTIVE'
                      ? 'bg-emerald-50'
                      : 'bg-slate-100'
                  }
                />
              </div>

              <QueFaltaParaEmpezar
                identidades={data.identidades || []}
                destinos={data.destinos || []}
                workerOnline={data.dashboard?.worker?.estado === 'online'}
                onIr={setActiveSection}
              />

              <FrenoDeMano
                pausado={Boolean(socialConfig.pausaGlobal)}
                motivo={socialConfig.pausaGlobalMotivo}
                identidades={(data.identidades || []).filter((i) => i.provider === 'facebook')}
                onPausaGeneral={cambiarPausaGeneral}
                onPausaIdentidad={cambiarPausaIdentidad}
              />

              {/* Alerta Worker */}
              {data.dashboard?.workerOffline && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle size={18} /> Worker offline
                  </div>
                  <p className="mt-1 text-sm">
                    El Worker Social no envió señal en los últimos 5 minutos. Sin él no se puede
                    publicar en grupos ni en el perfil: es el que abre Chrome en la PC del local.
                  </p>

                  {/*
                    Los pasos, en orden, y con la advertencia que faltaba: el
                    botón «Conectar Facebook» sólo funciona si el Worker se
                    abrió alguna vez en modo escritorio, porque es ahí donde se
                    registra el protocolo que ese botón usa. Sin eso, el botón
                    no hace nada y no hay forma de darse cuenta.
                  */}
                  <ol className="mt-3 space-y-1.5 border-t border-rose-200 pt-3 text-xs leading-relaxed">
                    <li>
                      <strong>1.</strong> En la PC del local, abrí{' '}
                      <span className="font-semibold">Modo Sabor Social Worker</span> desde el menú
                      Inicio. Después vuelve a arrancar configurado automáticamente.
                    </li>
                    <li>
                      <strong>2.</strong> Tocá «Conectar Facebook». El Worker abre su Chrome
                      protegido automáticamente; un Chrome normal no comparte la sesión.
                    </li>
                    <li>
                      <strong>3.</strong> Iniciá sesión en Facebook <strong>vos</strong>. El sistema
                      nunca te pide la contraseña ni la guarda.
                    </li>
                    <li>
                      <strong>4.</strong> Volvé acá y tocá «Verificar worker».
                    </li>
                  </ol>
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Conexión Facebook */}
                <div
                  className="social-tarjeta social-tarjeta--cinta p-6"
                  style={{ '--cinta': 'linear-gradient(90deg,#3b82f6,#1d4ed8)' }}
                >
                  <h3 className="text-sm font-bold text-slate-900">Conexión de Facebook</h3>

                  {/*
                    Antes acá decía "Chrome: undefined · Sesión: undefined ·
                    Grupos: undefined".

                    El motivo era de una línea: se preguntaba `if (resultado)` y
                    se pintaban sus campos, pero `resultado` llega como `{}`
                    cuando la prueba falló. Un objeto vacío en JavaScript **es
                    verdadero**, así que entraba por ahí y mostraba tres campos
                    que no existen.

                    Y lo peor: el motivo real viajaba en `health.error` —
                    "connect ECONNREFUSED 127.0.0.1:9222", o sea que Chrome no
                    está abierto con el puerto de depuración— y no se mostraba
                    en ninguna parte. El sistema sabía qué pasaba y decía
                    "undefined" tres veces.
                  */}
                  <ConexionFacebook
                    health={data.dashboard?.health}
                    worker={data.dashboard?.worker}
                    when={when}
                  />

                  {/*
                    Con qué identidad se trabaja.

                    Facebook no es una cuenta sola: el Perfil y la Fan Page
                    tienen grupos distintos y permisos distintos. Elegir esto
                    antes que nada evita el error más caro del módulo, que es
                    sincronizar los grupos de una creyendo que son de la otra.
                  */}
                  {(data.identidades || []).some((i) => i.provider === 'facebook') && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                        Publicar como
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(data.identidades || [])
                          .filter((i) => i.provider === 'facebook')
                          .map((identidad) => {
                            const activa = identidadElegida === identidad.id;
                            const grupos = (data.destinos || []).filter(
                              (d) => d.cuenta_id === identidad.id && d.tipo === 'facebook_group'
                            ).length;
                            return (
                              <button
                                key={identidad.id}
                                onClick={() => setIdentidadElegida(identidad.id)}
                                className={`rounded-xl px-4 py-2.5 text-left transition-all ${
                                  activa
                                    ? 'bg-slate-900 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                <span className="block text-sm font-bold">{identidad.nombre}</span>
                                <span
                                  className={`block text-xs ${activa ? 'text-white/70' : 'text-slate-400'}`}
                                >
                                  {grupos > 0 ? `${grupos} grupos` : 'sin grupos todavía'}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex gap-3">
                    {/*
                      Los tres botones estaban sueltos, uno al lado del otro y
                      sin ningún orden. Si nunca lo usaste, no hay forma de
                      saber cuál va primero — y el orden importa: probar antes
                      de conectar da error, y sincronizar sin sesión también.

                      Numerados y con la explicación de qué hace cada uno, la
                      pantalla se explica sola.
                    */}
                    <div className="social-pasos w-full">
                      <div className="social-paso">
                        <button
                          onClick={connectFacebook}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-700"
                        >
                          Conectar Facebook
                        </button>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                          Abre el Chrome del Worker en Facebook. Iniciá sesión ahí una sola vez.
                        </p>
                      </div>

                      <div className="social-paso">
                        <button
                          onClick={health}
                          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800"
                        >
                          Probar conexión
                        </button>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                          Chequea que Chrome responda y que la sesión siga viva. Es lo primero que
                          hay que tocar cuando algo no sale.
                        </p>
                      </div>

                      <div className="social-paso">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => syncGroups()}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Sincronizar los de esta identidad
                          </button>
                          <button
                            onClick={() => syncGroups('ambas')}
                            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-50"
                          >
                            Las dos
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                          Trae la lista de grupos donde puede publicar la identidad elegida arriba.
                          Los del Perfil y los de la Fan Page se guardan por separado.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/*
                  Acá estaban dos cosas que no van en un tablero.

                  Una era «Publicar con control», un texto de folleto que no
                  informaba nada: repetía una promesa y ofrecía un botón que ya
                  estaba arriba a la derecha.

                  La otra eran las seis perillas de la cola. Configurar el
                  intervalo y el cupo se hace una vez cada varios meses; el
                  tablero se mira todos los días. Lo que se usa poco no puede
                  ocupar la mitad de lo que se mira siempre — se movieron a
                  Configuración.
                */}
                <ProximasSalidas
                  campanas={data.campanas}
                  onVerCalendario={() => setActiveSection('calendario')}
                />
              </div>

              {/* Campañas recientes */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                  <h3 className="text-sm font-bold text-slate-900">Campañas recientes</h3>
                  <button
                    onClick={() => setActiveSection('campanas')}
                    className="text-xs font-bold text-red-600 hover:text-red-700"
                  >
                    Ver todas
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {data.campanas.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2 w-2 rounded-full ${STATUS_STYLES[item.estado]?.bg.replace('bg-', 'bg-') || 'bg-slate-300'}`}
                        />
                        <div>
                          <p className="text-sm font-semibold">{item.nombre}</p>
                          <p className="text-xs text-slate-400">
                            {whenShort(item.programada_para)} · {item.publicados}/{item.total}{' '}
                            publicados
                          </p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[item.estado]?.bg} ${STATUS_STYLES[item.estado]?.text}`}
                      >
                        {STATUS_STYLES[item.estado]?.label || item.estado}
                      </span>
                    </div>
                  ))}
                  {!data.campanas.length && (
                    <p className="px-6 py-6 text-sm text-slate-400">Todavía no hay campañas.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== CONFIGURACIÓN ==================== */}
          {activeSection === 'config' && (
            <div className="mx-auto max-w-2xl">
              <PerillasDeLaCola
                config={socialConfig}
                onCambiar={(campo, valor) =>
                  setSocialConfig((actual) => ({ ...actual, [campo]: valor }))
                }
                onGuardar={() => saveSocialConfig(socialConfig)}
                guardando={savingConfig}
              />
            </div>
          )}

          {/* ==================== CREAR (COMPOSER) ==================== */}
          {activeSection === 'crear' && (
            <Compositor
              draft={draft}
              setDraft={setDraft}
              destinos={data.destinos}
              plantillas={data.templates}
              onAplicarPlantilla={applyTemplate}
              onGuardarPlantilla={saveAsTemplate}
              onSubirArchivo={upload}
              media={data.media}
              genTema={genTema}
              setGenTema={setGenTema}
              onGenerar={generateText}
              generando={generating}
              enviando={sending}
              onGuardar={saveCampaign}
              onAlternarDestino={(id) => toggle('destinoIds', id)}
              destinosElegidos={selectedCount}
            />
          )}
          {/* ==================== CALENDARIO ==================== */}
          {activeSection === 'calendario' && (
            <div className="mx-auto max-w-6xl">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      calVista === 'semana'
                        ? moverSemana(-7)
                        : setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))
                    }
                    className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <h3 className="min-w-[13rem] text-center text-lg font-bold">
                    {calVista === 'semana'
                      ? `${semanaArranque.getDate()} al ${new Date(
                          semanaArranque.getFullYear(),
                          semanaArranque.getMonth(),
                          semanaArranque.getDate() + 6
                        ).getDate()} de ${conMayusculaInicial(
                          semanaArranque.toLocaleString('es-AR', { month: 'long' })
                        )}`
                      : conMayusculaInicial(
                          calMonth.toLocaleString('es-AR', { month: 'long', year: 'numeric' })
                        )}
                  </h3>
                  <button
                    onClick={() =>
                      calVista === 'semana'
                        ? moverSemana(7)
                        : setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))
                    }
                    className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  {/*
                    La zona horaria, dicha. El servidor guarda todo en UTC y el
                    local vive en UTC-3: sin esta línea nadie sabe si "20:00"
                    es la hora del salón o la del servidor.
                  */}
                  <span className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
                    <Clock size={13} /> Hora de Argentina
                  </span>

                  <div className="flex rounded-lg bg-slate-100 p-1">
                    {[
                      ['semana', 'Semana'],
                      ['mes', 'Mes'],
                    ].map(([id, texto]) => (
                      <button
                        key={id}
                        onClick={() => setCalVista(id)}
                        className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                          calVista === id
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {texto}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {calVista === 'semana' && (
                <SemanaPorHoras
                  campanas={data.campanas || []}
                  arranque={semanaArranque}
                  onMover={(dia, hora) => {
                    /*
                      Tocar una celda vacía arranca una publicación para ese
                      momento. Es la diferencia entre un calendario que se mira
                      y uno con el que se trabaja.
                    */
                    const cuando = new Date(dia);
                    cuando.setHours(hora, 0, 0, 0);
                    setDraft((actual) => ({
                      ...actual,
                      programadaPara: new Date(
                        cuando.getTime() - cuando.getTimezoneOffset() * 60000
                      )
                        .toISOString()
                        .slice(0, 16),
                    }));
                    setActiveSection('crear');
                  }}
                />
              )}

              {calVista === 'mes' && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400">
                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => (
                      <div key={d}>{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays(calMonth).map((day, idx) => (
                      <div
                        key={idx}
                        className={`min-h-[100px] rounded-lg border p-2 text-sm ${day ? 'border-slate-100 bg-slate-50/50' : 'border-transparent'}`}
                      >
                        {day && (
                          <>
                            <span className="text-xs font-bold text-slate-500">{day}</span>
                            <div className="mt-1 space-y-1">
                              {getCampaignsForDay(
                                calMonth.getFullYear(),
                                calMonth.getMonth(),
                                day
                              ).map((c) => (
                                <div
                                  key={c.id}
                                  className={`truncate rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    c.estado === 'published'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : c.estado === 'failed'
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-blue-100 text-blue-700'
                                  }`}
                                  title={c.nombre}
                                >
                                  {c.nombre}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== AUTOLISTAS ==================== */}
          {activeSection === 'autolistas' && (
            <Autolistas
              destinos={(data.destinos || []).filter((d) => d.habilitada)}
              onCambio={async () => {
                try {
                  const r = await api.get('/social/autolistas');
                  setAutolistasActivas((r.items || []).filter((l) => l.activa).length);
                } catch {
                  /* El contador del menú es un lujo: si falla, no se rompe nada. */
                }
              }}
            />
          )}

          {/* ==================== DESTINOS ==================== */}
          {activeSection === 'destinos' && (
            <div className="space-y-6">
              {/* Header + Agregar página */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {/*
                    El título ya está en la cabecera de la pantalla. Repetirlo
                    acá no agrega nada y le roba jerarquía al de arriba: queda
                    "Destinos / Destinos" y el ojo no sabe cuál manda.
                  */}
                  <p className="text-sm text-slate-400">
                    Páginas y grupos de Facebook sincronizados
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => syncGroups()}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    <RefreshCw size={14} /> Sincronizar esta identidad
                  </button>
                  <button
                    onClick={() => syncGroups('ambas')}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Las dos
                  </button>
                </div>
              </div>

              {/*
                Conectar por la API oficial va arriba de los grupos a
                propósito: es lo que conviene hacer, y lo de abajo —los grupos
                por navegador— es lo que no tiene alternativa.
              */}
              <ConectarConFacebook
                identidades={(data.identidades || []).filter((i) => i.provider === 'facebook')}
                onConectado={reload}
              />

              {/*
                El camino a mano queda, plegado, para el día que el de un botón
                no alcance: una app propia, un token de sistema, un caso raro.
                No se borra porque cuando hace falta, hace falta mucho.
              */}
              <details className="social-tarjeta p-5">
                <summary className="cursor-pointer text-sm font-bold text-slate-700">
                  Cargar las credenciales a mano
                </summary>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {(data.identidades || [])
                    .filter((i) => i.provider === 'facebook')
                    .map((identidad) => (
                      <ConectarMeta key={identidad.id} identidad={identidad} onGuardado={reload} />
                    ))}
                </div>
              </details>

              <GruposFacebook
                identidades={(data.identidades || []).filter((i) => i.provider === 'facebook')}
                destinos={data.destinos || []}
                identidadElegida={identidadElegida}
                onElegirIdentidad={setIdentidadElegida}
                onCambiar={async (id, cambios) => {
                  try {
                    await api.put(`/social/destinos/${id}`, cambios);
                    await reload();
                  } catch (error) {
                    toast.error(apiError(error));
                  }
                }}
              />

              {/* Agregar página */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="text-sm font-bold text-slate-700">Agregar destino</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <select
                    value={page.provider || 'facebook'}
                    onChange={(e) => setPage({ ...page, provider: e.target.value })}
                    className="rounded-lg border border-slate-200 p-2.5 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                  >
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                  </select>
                  <input
                    value={page.nombre}
                    onChange={(e) => setPage({ ...page, nombre: e.target.value })}
                    placeholder="Nombre de tu página"
                    className="rounded-lg border border-slate-200 p-2.5 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                  />
                  <input
                    value={page.url}
                    onChange={(e) => setPage({ ...page, url: e.target.value })}
                    placeholder={
                      page.provider === 'instagram'
                        ? 'https://instagram.com/tu-cuenta'
                        : 'https://facebook.com/tu-pagina'
                    }
                    className="rounded-lg border border-slate-200 p-2.5 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                  />
                </div>
                <button
                  onClick={createPage}
                  className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Agregar página
                </button>
              </div>

              {/* Grid de destinos */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.destinos.map((item) => (
                  <div
                    key={item.id}
                    className="group relative rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    {editingDest === item.id ? (
                      <div className="space-y-2">
                        <input
                          value={editForm.nombre}
                          onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                        />
                        <input
                          value={editForm.url}
                          onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 p-2 text-sm"
                        />
                        <div className="flex items-center gap-3 text-xs">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={editForm.habilitada}
                              onChange={(e) =>
                                setEditForm({ ...editForm, habilitada: e.target.checked })
                              }
                            />
                            Habilitado
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={editForm.favorita}
                              onChange={(e) =>
                                setEditForm({ ...editForm, favorita: e.target.checked })
                              }
                            />
                            Favorito
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEditDest}
                            className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-bold text-white"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditingDest(null)}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-bold"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                item.tipo.startsWith('instagram_')
                                  ? 'bg-pink-50 text-pink-600'
                                  : item.tipo === 'facebook_page'
                                    ? 'bg-blue-50 text-blue-600'
                                    : 'bg-indigo-50 text-indigo-600'
                              }`}
                            >
                              {item.tipo.startsWith('instagram_') ? (
                                <Instagram size={14} />
                              ) : (
                                <Facebook size={14} />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold">{item.nombre}</p>
                              <p className="text-[10px] text-slate-400 uppercase">
                                {item.tipo
                                  .replace('facebook_', 'Facebook ')
                                  .replace('instagram_', 'Instagram ')}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => startEditDest(item)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100"
                              title="Editar"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => removeDest(item.id)}
                              className="rounded p-1 text-rose-400 hover:bg-rose-50"
                              title="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${item.habilitada ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                          >
                            {item.habilitada ? 'Activo' : 'Pausado'}
                          </span>
                          {item.favorita && (
                            <Star size={14} className="text-amber-400" fill="currentColor" />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {!data.destinos.length && (
                  <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                    Aún no hay destinos sincronizados.
                  </div>
                )}
              </div>

              {/* Conjuntos */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="text-sm font-bold text-slate-700">Conjuntos de destinos</h4>
                <div className="mt-3 flex gap-2">
                  <input
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                    placeholder="Ej.: Grupos Monteros"
                    className="flex-1 rounded-lg border border-slate-200 p-2.5 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
                  />
                  <button
                    onClick={createSet}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
                  >
                    Crear conjunto
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.conjuntos.map((set) => (
                    <span
                      key={set.id}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                    >
                      {set.nombre} <span className="text-slate-400">({set.total})</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ==================== CAMPAÑAS ==================== */}
          {activeSection === 'campanas' && (
            <div className="space-y-4">
              {/* Filtros */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter size={14} className="text-slate-400" />
                {[
                  { key: 'all', label: 'Todas' },
                  { key: 'draft', label: 'Borradores' },
                  { key: 'scheduled', label: 'Programadas' },
                  { key: 'queued', label: 'En cola' },
                  { key: 'published', label: 'Publicadas' },
                  { key: 'failed', label: 'Fallidas' },
                  /*
                    La papelera. Cancelar era la única acción que se sentía
                    definitiva, y por eso daba miedo apretarla. Con esto deja
                    de ser una decisión que hay que pensar dos veces.
                  */
                  { key: 'cancelled', label: 'Papelera' },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setCampFilter(f.key)}
                    className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                      campFilter === f.key
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Tabla */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-bold uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-5 py-3">Campaña</th>
                        <th className="px-5 py-3">Estado</th>
                        <th className="px-5 py-3">Programada</th>
                        <th className="px-5 py-3">Resultado</th>
                        <th className="px-5 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCampaigns.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3">
                            <p className="font-semibold">{item.nombre}</p>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[item.estado]?.bg} ${STATUS_STYLES[item.estado]?.text}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${STATUS_STYLES[item.estado]?.bg.replace('bg-', 'bg-') || 'bg-slate-300'}`}
                              />
                              {STATUS_STYLES[item.estado]?.label || item.estado}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-slate-500">{when(item.programada_para)}</td>
                          <td className="px-5 py-3 text-slate-500">
                            {item.publicados}/{item.total} · {item.fallidos} fallidos
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              {item.fallidos > 0 && (
                                <button
                                  onClick={() => retryFailed(item.id)}
                                  className="rounded p-1 text-xs font-bold text-red-600 hover:bg-red-50"
                                  title="Reintentar fallidos"
                                >
                                  <RefreshCw size={14} />
                                </button>
                              )}
                              {['draft', 'scheduled', 'queued', 'processing'].includes(
                                item.estado
                              ) && (
                                <button
                                  onClick={() => cancelCampaignAction(item.id)}
                                  className="rounded p-1 text-xs font-bold text-slate-500 hover:bg-slate-100"
                                  title="Cancelar"
                                >
                                  <Pause size={14} />
                                </button>
                              )}
                              {item.estado === 'cancelled' && (
                                <button
                                  onClick={() => restaurarCampana(item.id)}
                                  className="rounded px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                                  title="Sacar de la papelera"
                                >
                                  Restaurar
                                </button>
                              )}
                              <button
                                onClick={() => duplicateCampaign(item.id)}
                                className="rounded p-1 text-xs font-bold text-blue-600 hover:bg-blue-50"
                                title="Duplicar"
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                onClick={() => removeCampaign(item.id)}
                                className="rounded p-1 text-xs font-bold text-rose-600 hover:bg-rose-50"
                                title="Eliminar"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!filteredCampaigns.length && (
                  <p className="px-5 py-8 text-center text-sm text-slate-400">
                    {campFilter === 'cancelled'
                      ? 'La papelera está vacía.'
                      : 'No hay campañas que coincidan con el filtro.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ==================== MÉTRICAS ==================== */}
          {activeSection === 'metricas' && (
            <div className="space-y-6">
              {metricsLoading && (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <RefreshCw className="mr-2 animate-spin" size={18} /> Cargando métricas…
                </div>
              )}
              {!metricsLoading && metricsData && (
                <>
                  {/* Resumen */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                      label="Campañas totales"
                      value={metricsData.resumen.totalCampanas}
                      icon={ListFilter}
                      color="text-blue-600"
                      bg="bg-blue-50"
                    />
                    <MetricCard
                      label="Publicaciones"
                      value={metricsData.resumen.totalPublicaciones}
                      icon={Send}
                      color="text-indigo-600"
                      bg="bg-indigo-50"
                    />
                    <MetricCard
                      label="Tasa de éxito"
                      value={metricsData.resumen.tasaExito}
                      icon={ShieldCheck}
                      color="text-emerald-600"
                      bg="bg-emerald-50"
                    />
                    <MetricCard
                      label="Destinos activos"
                      value={metricsData.resumen.destinosActivos}
                      icon={MapPin}
                      color="text-rose-600"
                      bg="bg-rose-50"
                    />
                  </div>

                  {/*
                    Estas métricas son de ejecución, no de alcance. Decirlo
                    importa: sin la aclaración uno lee "120 publicaciones" y
                    entiende "120 personas lo vieron", que es otra cosa.
                  */}
                  {metricsData.alcance?.sinDatosPara?.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-800">
                        Estos números son de lo que hizo el sistema, no de cuánta gente lo vio
                      </p>
                      <ul className="mt-2 space-y-1">
                        {metricsData.alcance.sinDatosPara.map((item) => (
                          <li key={item.tipo} className="text-xs leading-relaxed text-slate-500">
                            {item.motivo}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500">
                        El alcance real sólo existe donde Meta lo publica: la Fan Page e Instagram,
                        y con la API oficial conectada. Preferimos decirlo antes que mostrar un cero
                        que parece un dato.
                      </p>
                    </div>
                  )}

                  {/* Publicaciones por día */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">
                      Publicaciones por día (últimos 30 días)
                    </h3>
                    <div className="mt-4 flex items-end gap-1" style={{ height: 180 }}>
                      {metricsData.porDia
                        .slice()
                        .reverse()
                        .map((d) => {
                          const max = Math.max(...metricsData.porDia.map((x) => x.total), 1);
                          const h = (d.total / max) * 100;
                          return (
                            <div
                              key={d.fecha}
                              className="group relative flex flex-1 flex-col items-center"
                            >
                              <div
                                className="w-full rounded-t-sm bg-slate-200 transition-all group-hover:bg-red-400"
                                style={{ height: `${h}%` }}
                              />
                              <span className="mt-1 text-[9px] text-slate-400 rotate-0">
                                {d.fecha.slice(5)}
                              </span>
                              <div className="pointer-events-none absolute bottom-full mb-1 hidden rounded-lg bg-slate-900 px-2 py-1 text-[10px] text-white group-hover:block">
                                {d.fecha}: {d.total} total · {d.exitosos} ✅ · {d.fallidos} ❌
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <div className="grid gap-6 lg:grid-cols-2">
                    {/* Destinos más usados */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900">Destinos más usados</h3>
                      <div className="mt-4 space-y-3">
                        {metricsData.destinosTop.map((d) => {
                          const max = Math.max(...metricsData.destinosTop.map((x) => x.total), 1);
                          const pct = (d.total / max) * 100;
                          return (
                            <div key={d.id}>
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold truncate">{d.nombre}</span>
                                <span className="text-slate-400">{d.total}</span>
                              </div>
                              <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                                <div
                                  className="h-2 rounded-full bg-blue-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                        {!metricsData.destinosTop.length && (
                          <p className="text-sm text-slate-400">Sin datos suficientes.</p>
                        )}
                      </div>
                    </div>

                    {/* Horarios más efectivos */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900">Horarios más efectivos</h3>
                      <div className="mt-4 grid grid-cols-6 gap-2">
                        {metricsData.porHora.map((h) => (
                          <div key={h.hora} className="text-center">
                            <div
                              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${
                                h.tasa >= 90
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : h.tasa >= 70
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                              title={`${h.total} publicaciones · ${h.exitosos} exitosos`}
                            >
                              {h.tasa}%
                            </div>
                            <p className="mt-1 text-[9px] text-slate-400">
                              {String(h.hora).padStart(2, '0')}:00
                            </p>
                          </div>
                        ))}
                        {!metricsData.porHora.length && (
                          <p className="col-span-full text-sm text-slate-400">
                            Sin datos suficientes.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Distribución de estados */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900">
                      Distribución de estados (últimos 30 días)
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {metricsData.estados.map((e) => (
                        <div
                          key={e.estado}
                          className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${STATUS_STYLES[e.estado]?.bg.replace('bg-', 'bg-') || 'bg-slate-300'}`}
                          />
                          <span className="text-xs font-semibold">
                            {STATUS_STYLES[e.estado]?.label || e.estado}
                          </span>
                          <span className="text-xs text-slate-400">{e.cantidad}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ==================== ACTIVIDAD ==================== */}
          {activeSection === 'actividad' && (
            <div className="mx-auto max-w-3xl">
              <h3 className="mb-4 text-lg font-bold">Actividad reciente</h3>
              <div className="space-y-3">
                {data.logs.map((log) => (
                  <div
                    key={log.id}
                    className={`rounded-xl border bg-white p-4 shadow-sm ${
                      log.nivel === 'error' ? 'border-rose-200' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            log.nivel === 'error'
                              ? 'bg-rose-500'
                              : log.nivel === 'warn'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                          }`}
                        />
                        <p
                          className={`text-sm font-semibold ${log.nivel === 'error' ? 'text-rose-700' : 'text-slate-800'}`}
                        >
                          {log.mensaje}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{when(log.creado_en)}</span>
                    </div>
                    {log.codigo && (
                      <p className="mt-1 pl-4 text-xs text-slate-400 font-mono">{log.codigo}</p>
                    )}
                  </div>
                ))}
                {!data.logs.length && (
                  <p className="text-center text-sm text-slate-400">Sin movimientos por ahora.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/* ==================== SUB-COMPONENTES ==================== */

/**
 * El estado de la conexión con Facebook, contado como es.
 *
 * ── Los tres estados que hay que distinguir ────────────────────────────────
 *
 *  1. Nunca se probó — el Worker todavía no mandó señal.
 *  2. Se probó y falló — hay un motivo concreto y hay que mostrarlo.
 *  3. Se probó y anduvo — se muestran las tres piezas en verde.
 *
 * Mezclar el 2 con el 3 es lo que producía los "undefined": el resultado vacío
 * de una prueba fallida se trataba como una prueba exitosa.
 *
 * ── Por qué el error va traducido y crudo a la vez ─────────────────────────
 *
 * "connect ECONNREFUSED 127.0.0.1:9222" no le dice nada a quien quiere
 * publicar una promo. Pero tampoco se puede esconder: el día que el error sea
 * otro, ese texto es lo único que permite entender qué pasó. Así que va la
 * explicación arriba y el texto original abajo, en chico.
 */
/**
 * Los grupos de Facebook, siempre de una identidad a la vez.
 *
 * ── Por qué nunca se muestran mezclados ────────────────────────────────────
 *
 * Los grupos donde puede publicar el Perfil no son los mismos que los de la
 * Fan Page, y el mismo grupo puede estar en las dos listas siendo dos destinos
 * distintos. Una lista revuelta haría imposible saber cuál es cuál, y elegir
 * mal significa una publicación que falla sin motivo aparente.
 *
 * Por eso la identidad se elige arriba y la lista de abajo obedece. Cambiar de
 * identidad cambia la lista entera.
 */
function GruposFacebook({ identidades, destinos, identidadElegida, onElegirIdentidad, onCambiar }) {
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [abierto, setAbierto] = useState(null);

  const deLaIdentidad = destinos.filter(
    (d) => d.tipo === 'facebook_group' && d.cuenta_id === identidadElegida
  );

  const requiereAprobacion = (d) => Boolean(d.metadata?.requiereAprobacion);

  const visibles = deLaIdentidad
    .filter((d) => {
      if (!buscar.trim()) return true;
      const q = buscar.toLowerCase();
      return (
        String(d.nombre || '')
          .toLowerCase()
          .includes(q) ||
        String(d.url || '')
          .toLowerCase()
          .includes(q)
      );
    })
    .filter((d) => {
      if (filtro === 'habilitados') return d.habilitada;
      if (filtro === 'favoritos') return d.favorita;
      if (filtro === 'aprobacion') return requiereAprobacion(d);
      if (filtro === 'conreglas')
        return d.bloqueadoManualmente || d.permiteComercial === false || d.frecuenciaMaximaHoras;
      return true;
    });

  const conteos = {
    todos: deLaIdentidad.length,
    habilitados: deLaIdentidad.filter((d) => d.habilitada).length,
    favoritos: deLaIdentidad.filter((d) => d.favorita).length,
    aprobacion: deLaIdentidad.filter(requiereAprobacion).length,
    conreglas: deLaIdentidad.filter(
      (d) => d.bloqueadoManualmente || d.permiteComercial === false || d.frecuenciaMaximaHoras
    ).length,
  };

  return (
    <div className="social-tarjeta p-5">
      <h4 className="text-sm font-bold text-slate-900">Grupos de Facebook</h4>

      {/* Con qué identidad */}
      <div className="mt-3 flex flex-wrap gap-2">
        {identidades.map((identidad) => {
          const activa = identidadElegida === identidad.id;
          const cuantos = destinos.filter(
            (d) => d.tipo === 'facebook_group' && d.cuenta_id === identidad.id
          ).length;
          return (
            <button
              key={identidad.id}
              onClick={() => onElegirIdentidad(identidad.id)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
                activa
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {identidad.nombre}
              <span className={`ml-2 text-xs ${activa ? 'text-white/60' : 'text-slate-400'}`}>
                {cuantos}
              </span>
            </button>
          );
        })}
      </div>

      {/* Buscar y filtrar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          placeholder="Buscar por nombre o link…"
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100"
        />
        {[
          ['todos', 'Todos'],
          ['habilitados', 'Habilitados'],
          ['favoritos', 'Favoritos'],
          ['aprobacion', 'Requieren aprobación'],
          ['conreglas', 'Con reglas'],
        ].map(([id, texto]) => (
          <button
            key={id}
            onClick={() => setFiltro(id)}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              filtro === id
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {texto} <span className="opacity-60">{conteos[id]}</span>
          </button>
        ))}
      </div>

      {/* La lista */}
      <div className="mt-4 space-y-1.5">
        {deLaIdentidad.length === 0 && (
          <div className="rounded-xl bg-slate-50 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">
              Esta identidad todavía no tiene grupos
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
              Tocá «Sincronizar esta identidad» arriba. El Worker abre Facebook con esa identidad y
              trae la lista de grupos donde puede publicar.
            </p>
          </div>
        )}

        {deLaIdentidad.length > 0 && visibles.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">
            Ninguno coincide con ese filtro.
          </p>
        )}

        {visibles.map((grupo) => (
          <div
            key={grupo.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
              grupo.habilitada ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 opacity-60'
            }`}
          >
            <input
              type="checkbox"
              checked={Boolean(grupo.habilitada)}
              onChange={(e) => onCambiar(grupo.id, { habilitada: e.target.checked })}
              title={grupo.habilitada ? 'Recibe publicaciones' : 'Deshabilitado'}
              className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{grupo.nombre}</p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {requiereAprobacion(grupo) && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                    Un admin aprueba cada posteo
                  </span>
                )}
                {grupo.bloqueadoManualmente && (
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                    No publicar
                  </span>
                )}
                {grupo.permiteComercial === false && (
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-700">
                    Sin comercio
                  </span>
                )}
                {grupo.frecuenciaMaximaHoras && (
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                    1 cada {grupo.frecuenciaMaximaHoras} h
                  </span>
                )}
                {grupo.ultimo_estado && grupo.ultimo_estado !== 'pendiente' && (
                  <span>{grupo.ultimo_estado}</span>
                )}
                {grupo.url && <span className="truncate">{grupo.url}</span>}
              </p>
            </div>

            {/*
              El favorito no es decorativo: son los grupos donde de verdad se
              vende, y con cuarenta en la lista es lo único que hace posible
              armar una campaña sin leerlos todos.
            */}
            <button
              onClick={() => onCambiar(grupo.id, { favorita: !grupo.favorita })}
              title={grupo.favorita ? 'Sacar de favoritos' : 'Marcar como favorito'}
              className={`rounded-lg p-1.5 transition-colors ${
                grupo.favorita
                  ? 'text-amber-500 hover:bg-amber-50'
                  : 'text-slate-300 hover:bg-slate-100 hover:text-slate-400'
              }`}
            >
              <Star size={16} fill={grupo.favorita ? 'currentColor' : 'none'} />
            </button>

            <button
              onClick={() => setAbierto(abierto === grupo.id ? null : grupo.id)}
              title="Reglas de este grupo"
              className={`rounded-lg p-1.5 transition-colors ${
                abierto === grupo.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'
              }`}
            >
              <Settings size={16} />
            </button>
          </div>
        ))}

        {visibles.map(
          (grupo) =>
            abierto === grupo.id && (
              <ReglasDelGrupo key={`reglas-${grupo.id}`} grupo={grupo} onCambiar={onCambiar} />
            )
        )}
      </div>
    </div>
  );
}

/**
 * Conectar la Fan Page e Instagram por la API oficial de Meta.
 *
 * ── Por qué hay dos formas de conectar y no una ────────────────────────────
 *
 * Los **grupos y el perfil** no se conectan acá: no existe una API oficial que
 * los cubra. Esos los maneja el Worker abriendo Chrome en la PC del local con
 * tu sesión ya iniciada a mano.
 *
 * La **Fan Page e Instagram** sí tienen API oficial, y es muchísimo mejor:
 * publica desde el servidor sin navegador, sin que la PC tenga que estar
 * prendida, y sin ningún riesgo de que Facebook lo tome por actividad rara.
 *
 * Por eso hay dos caminos. No es una inconsistencia: es que Meta permite una
 * cosa y no la otra.
 */
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Lo que está por salir.
 *
 * ── Por qué esto reemplazó al texto de folleto ─────────────────────────────
 *
 * En el lugar donde estaba esto había un párrafo que decía que no se guardan
 * cookies y un botón que ya estaba arriba a la derecha. Es decir: ninguna
 * información y una repetición.
 *
 * Lo que uno quiere saber al abrir el tablero es **qué va a pasar sin que yo
 * haga nada**. Si hay algo programado para esta noche, eso es lo que importa.
 */
function ProximasSalidas({ campanas, onVerCalendario }) {
  const ahora = Date.now();

  const proximas = (campanas || [])
    .filter((c) => ['scheduled', 'queued'].includes(c.estado) && c.programada_para)
    .map((c) => ({ ...c, cuando: new Date(String(c.programada_para).replace(' ', 'T')) }))
    .filter((c) => !Number.isNaN(c.cuando.getTime()) && c.cuando.getTime() > ahora - 3600 * 1000)
    .sort((a, b) => a.cuando - b.cuando)
    .slice(0, 4);

  return (
    <div className="social-tarjeta p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Lo que está por salir</h3>
        <button
          onClick={onVerCalendario}
          className="text-xs font-bold text-red-600 hover:text-red-700"
        >
          Ver calendario
        </button>
      </div>

      {proximas.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          No hay nada programado. Lo que armes queda acá con su hora, para que se vea de un vistazo
          qué va a publicarse sin que toques nada.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {proximas.map((campana) => (
            <div key={campana.id} className="flex items-center gap-3">
              <span className="social-proxima-hora">
                {campana.cuando.toLocaleString('es-AR', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                {campana.nombre}
              </p>
              <span className="whitespace-nowrap text-xs text-slate-400">
                {campana.total} destino{campana.total === 1 ? '' : 's'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Qué falta para que esto empiece a publicar.
 *
 * ── Por qué un tablero en cero necesita esto ───────────────────────────────
 *
 * Cuatro tarjetas en cero no dicen nada. Peor: dan a entender que algo está
 * roto, cuando en realidad todavía no se conectó nada.
 *
 * Los pasos están en orden y sólo se muestran los que faltan. Cuando está
 * todo hecho, el bloque desaparece solo y el tablero queda para lo que
 * importa: qué se publicó y qué está por salir.
 */
function QueFaltaParaEmpezar({ identidades, destinos, workerOnline, onIr }) {
  const hayGrupos = destinos.some((d) => d.tipo === 'facebook_group');
  const hayConexionApi = identidades.some((i) => i.tieneToken);

  const pasos = [
    {
      hecho: workerOnline,
      titulo: 'Prender el Worker en la PC del local',
      detalle:
        'Es lo que abre Chrome para publicar en grupos y en el perfil. Facebook no tiene otra forma para eso.',
      accion: null,
    },
    {
      hecho: hayGrupos,
      titulo: 'Traer tus grupos de Facebook',
      detalle: 'Con el Worker andando y la sesión iniciada, el sistema trae la lista solo.',
      accion: { texto: 'Ir a Destinos', ir: 'destinos' },
    },
    {
      hecho: hayConexionApi,
      titulo: 'Conectar la Fan Page e Instagram',
      detalle:
        'Con un botón. Eso publica desde el servidor, sin navegador y sin que la PC esté prendida.',
      accion: { texto: 'Conectar', ir: 'destinos' },
    },
  ];

  const faltan = pasos.filter((p) => !p.hecho);
  if (!faltan.length) return null;

  return (
    <div className="social-arranque">
      <div className="social-arranque-titulo">
        <span>Para empezar a publicar</span>
        <em>
          {pasos.length - faltan.length} de {pasos.length} listo
          {pasos.length - faltan.length === 1 ? '' : 's'}
        </em>
      </div>

      <div className="social-arranque-pasos">
        {pasos.map((paso, i) => (
          <div key={paso.titulo} className={`social-arranque-paso ${paso.hecho ? 'hecho' : ''}`}>
            <span className="social-arranque-numero">
              {paso.hecho ? <Check size={13} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="social-arranque-nombre">{paso.titulo}</p>
              {!paso.hecho && <p className="social-arranque-detalle">{paso.detalle}</p>}
            </div>
            {!paso.hecho && paso.accion && (
              <button onClick={() => onIr(paso.accion.ir)} className="social-arranque-boton">
                {paso.accion.texto}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * El compositor.
 *
 * ── Por qué se rehízo ──────────────────────────────────────────────────────
 *
 * Antes eran tres columnas de tarjetas sueltas: una para el nombre, otra para
 * el texto, otra para la multimedia, otra para programar. Cada una con su
 * borde y su sombra. El ojo tenía que saltar entre seis cajas para armar una
 * publicación de dos líneas.
 *
 * Ahora es una sola superficie: arriba las redes, en el medio el texto con su
 * barra de herramientas, abajo la fecha y el botón. Todo lo que no se usa
 * siempre —plantillas, IA, programación, ensayo— vive plegado en «Más
 * opciones», que es donde va lo que se usa una de cada cinco veces.
 *
 * ── Qué se copió de Metricool y por qué ────────────────────────────────────
 *
 * Las fichas de red arriba del texto, la vista previa al costado que cambia
 * según la red, el contador con el ícono de la red, y el botón principal con
 * desplegable en vez de tres botones sueltos.
 *
 * No se copió el diseño: se copió **el orden en que se toman las decisiones**.
 * Primero con qué red, después qué digo, después cuándo. Ese orden es el que
 * hace que no haya que volver atrás.
 */
function Compositor({
  draft,
  setDraft,
  destinos,
  plantillas,
  onAplicarPlantilla,
  onGuardarPlantilla,
  onSubirArchivo,
  media,
  genTema,
  setGenTema,
  onGenerar,
  generando,
  enviando,
  onGuardar,
  onAlternarDestino,
  destinosElegidos,
}) {
  const [masOpciones, setMasOpciones] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  const elegidos = destinos.filter((d) => draft.destinoIds.includes(d.id));
  const redes = [...new Set(elegidos.map(redDelDestino))];

  const puedePublicar =
    draft.nombre.trim() && (draft.texto.trim() || draft.mediaIds.length) && destinosElegidos;

  return (
    <div className="social-compositor">
      {/* ── Cabecera: con qué identidad ─────────────────────────────────── */}
      <div className="social-comp-cabecera">
        <h2>Nueva publicación</h2>
        <div className="social-comp-redes">
          {['facebook', 'instagram'].map((clave) => {
            const config = LIMITES_DE_RED[clave];
            const activa = redes.includes(clave);
            const cuantos = elegidos.filter((d) => redDelDestino(d) === clave).length;
            return (
              <span
                key={clave}
                className={`social-comp-red ${activa ? 'activa' : ''}`}
                style={activa ? { borderColor: config.color, color: config.color } : undefined}
                title={
                  activa
                    ? `${cuantos} destino(s) de ${config.nombre}`
                    : `Sin destinos de ${config.nombre}`
                }
              >
                <config.icono size={14} />
                {activa ? cuantos : '—'}
              </span>
            );
          })}
        </div>
      </div>

      <div className="social-comp-cuerpo">
        {/* ── Izquierda: escribir ───────────────────────────────────────── */}
        <div className="social-comp-editor">
          <input
            value={draft.nombre}
            onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
            placeholder="Nombre interno (ej.: Promo de lomitos del viernes)"
            className="social-comp-nombre"
          />

          <textarea
            value={draft.texto}
            onChange={(e) => setDraft({ ...draft, texto: e.target.value })}
            rows={9}
            placeholder="Escribí lo que querés publicar…"
            className="social-comp-texto"
          />

          {/* La barra de herramientas, pegada abajo del texto como en Metricool. */}
          <div className="social-comp-barra">
            <label className="social-comp-icono" title="Agregar imagen o video">
              <ImagePlus size={17} />
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={onSubirArchivo}
                className="hidden"
              />
            </label>

            <button
              type="button"
              className="social-comp-icono"
              title="Guardar como plantilla"
              onClick={onGuardarPlantilla}
            >
              <Save size={17} />
            </button>

            <button
              type="button"
              className={`social-comp-icono ${masOpciones ? 'activo' : ''}`}
              title="Más opciones"
              onClick={() => setMasOpciones(!masOpciones)}
            >
              <Settings size={17} />
            </button>

            <span className="social-comp-contador">
              {draft.mediaIds.length > 0 && (
                <span className="social-comp-adjuntos">
                  {draft.mediaIds.length} adjunto{draft.mediaIds.length > 1 ? 's' : ''}
                </span>
              )}
              {draft.texto.length}
            </span>
          </div>

          {/* ── Lo que no se usa siempre ────────────────────────────────── */}
          {masOpciones && (
            <div className="social-comp-extra">
              <div>
                <span className="social-comp-etiqueta">
                  <Sparkles size={12} /> Que lo escriba la IA
                </span>
                <div className="mt-2 flex gap-2">
                  <input
                    value={genTema}
                    onChange={(e) => setGenTema(e.target.value)}
                    placeholder="Ej.: promo de empanadas para el finde"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-300 focus:outline-none"
                  />
                  <button
                    onClick={onGenerar}
                    disabled={generando}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    <Sparkles size={13} /> {generando ? 'Escribiendo…' : 'Generar'}
                  </button>
                </div>
              </div>

              {plantillas.length > 0 && (
                <div>
                  <span className="social-comp-etiqueta">Plantillas guardadas</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {plantillas.map((plantilla) => (
                      <button
                        key={plantilla.id}
                        onClick={() => onAplicarPlantilla(plantilla)}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      >
                        {plantilla.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {media?.length > 0 && (
                <div>
                  <span className="social-comp-etiqueta">Archivos subidos</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {media.slice(0, 12).map((archivo) => {
                      const puesto = draft.mediaIds.includes(archivo.id);
                      return (
                        <button
                          key={archivo.id}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              mediaIds: puesto
                                ? draft.mediaIds.filter((m) => m !== archivo.id)
                                : [...draft.mediaIds, archivo.id],
                            })
                          }
                          className={`overflow-hidden rounded-lg border-2 ${
                            puesto ? 'border-red-500' : 'border-transparent'
                          }`}
                        >
                          <img
                            src={archivo.ruta}
                            alt={archivo.nombre}
                            className="h-14 w-14 object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <label className="social-comp-ensayo">
                <input
                  type="checkbox"
                  checked={Boolean(draft.ensayo)}
                  onChange={(e) => setDraft({ ...draft, ensayo: e.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                />
                <span>
                  <strong>Ensayo: no publicar nada</strong>
                  <em>
                    Pasa por todos los controles y te deja anotado qué habría mandado a cada grupo.
                    Nadie en Facebook ve nada.
                  </em>
                </span>
              </label>
            </div>
          )}

          {/* ── Adónde va ───────────────────────────────────────────────── */}
          <div className="social-comp-destinos">
            <span className="social-comp-etiqueta">
              Dónde se publica{' '}
              {destinosElegidos > 0 && (
                <b className="text-red-600">
                  · {destinosElegidos} elegido{destinosElegidos > 1 ? 's' : ''}
                </b>
              )}
            </span>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {destinos.map((destino) => {
                const puesto = draft.destinoIds.includes(destino.id);
                const Icono = LIMITES_DE_RED[redDelDestino(destino)].icono;
                return (
                  <button
                    key={destino.id}
                    onClick={() => onAlternarDestino(destino.id)}
                    disabled={!destino.habilitada}
                    className={`social-comp-destino ${puesto ? 'puesto' : ''}`}
                    title={destino.habilitada ? destino.nombre : 'Este destino está pausado'}
                  >
                    <Icono size={12} />
                    <span className="truncate">{destino.nombre}</span>
                    {puesto && <Check size={12} />}
                  </button>
                );
              })}
            </div>

            {!destinos.length && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Todavía no hay dónde publicar. Sincronizá tus grupos o conectá tu página desde
                Destinos.
              </p>
            )}
          </div>

          {/* ── Pie: cuándo y el botón ──────────────────────────────────── */}
          <div className="social-comp-pie">
            <div className="social-comp-cuando">
              <Clock size={14} className="text-slate-400" />
              <input
                type="datetime-local"
                value={draft.programadaPara}
                onChange={(e) => setDraft({ ...draft, programadaPara: e.target.value })}
                className="border-0 bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
              />
              {draft.programadaPara && (
                <button
                  onClick={() => setDraft({ ...draft, programadaPara: '' })}
                  className="text-slate-300 hover:text-slate-500"
                  title="Publicar ahora en vez de programar"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/*
              Un botón principal con desplegable, no tres botones sueltos.

              Con tres al lado, los tres se ven igual de importantes y hay que
              leerlos para saber cuál apretar. Así, la acción habitual está a un
              clic y las otras a dos, que es la proporción en que se usan.
            */}
            <div className="social-comp-accion">
              <button
                disabled={enviando || !puedePublicar}
                onClick={() => onGuardar(true)}
                className={`social-comp-principal ${draft.ensayo ? 'ensayo' : ''}`}
              >
                <Play size={14} />
                {draft.ensayo
                  ? 'Correr el ensayo'
                  : draft.programadaPara
                    ? 'Programar'
                    : 'Publicar ahora'}
              </button>

              <button
                onClick={() => setMenuAbierto(!menuAbierto)}
                disabled={enviando}
                className={`social-comp-flecha ${draft.ensayo ? 'ensayo' : ''}`}
                title="Otras opciones"
              >
                <ChevronDown size={15} />
              </button>

              {menuAbierto && (
                <div className="social-comp-menu">
                  <button
                    onClick={() => {
                      setMenuAbierto(false);
                      onGuardar(false);
                    }}
                  >
                    Guardar como borrador
                  </button>
                  <button
                    onClick={() => {
                      setMenuAbierto(false);
                      setDraft({ ...draft, ensayo: !draft.ensayo });
                    }}
                  >
                    {draft.ensayo ? 'Salir del ensayo' : 'Convertir en ensayo'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {!puedePublicar && (
            <p className="social-comp-falta">
              {!draft.nombre.trim()
                ? 'Falta el nombre interno, para poder encontrarla después.'
                : !draft.texto.trim() && !draft.mediaIds.length
                  ? 'Falta el texto o una imagen.'
                  : 'Falta elegir dónde se publica.'}
            </p>
          )}
        </div>

        {/* ── Derecha: cómo se va a ver ─────────────────────────────────── */}
        <div className="social-comp-previa">
          <VistaPrevia
            texto={draft.texto}
            cuantosArchivos={draft.mediaIds.length}
            destinos={elegidos}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Los límites de cada red, y de dónde salen.
 *
 * No son inventados: son los que publica Meta. El de Instagram importa mucho
 * más que el de Facebook porque se llega de verdad — 2.200 caracteres es un
 * texto normal de promoción, y pasarse hace que la publicación falle recién al
 * intentar salir, media hora después.
 */
const LIMITES_DE_RED = {
  facebook: { nombre: 'Facebook', tope: 60000, color: '#1877f2', icono: Facebook },
  instagram: { nombre: 'Instagram', tope: 2200, color: '#e1306c', icono: Instagram },
};

const redDelDestino = (destino) =>
  String(destino?.tipo || '').startsWith('instagram') ? 'instagram' : 'facebook';

/**
 * Cómo se va a ver la publicación en cada red.
 *
 * ── Por qué una vista por red y no una sola ────────────────────────────────
 *
 * Facebook y Instagram no muestran lo mismo. Instagram corta el pie a las dos
 * líneas y esconde el resto detrás de «más»; Facebook lo muestra casi entero.
 * El mismo texto que en Facebook se lee completo, en Instagram puede quedar
 * cortado justo antes del precio.
 *
 * Con una sola vista previa eso no se ve hasta que ya se publicó.
 *
 * ── Y por qué el toggle de teléfono ────────────────────────────────────────
 *
 * Casi toda la gente que va a ver esto lo va a ver en el teléfono. Mirarlo en
 * un rectángulo ancho de escritorio da una idea equivocada de dónde corta el
 * texto.
 */
function VistaPrevia({ texto, cuantosArchivos, destinos }) {
  /* Las redes que están realmente elegidas; si no hay ninguna, Facebook. */
  const redes = [...new Set(destinos.map(redDelDestino))];
  const disponibles = redes.length ? redes : ['facebook'];

  const [red, setRed] = useState(disponibles[0]);
  const [enTelefono, setEnTelefono] = useState(true);

  /* Si se deselecciona la red que se estaba mirando, hay que volver a una válida. */
  const activa = disponibles.includes(red) ? red : disponibles[0];
  const config = LIMITES_DE_RED[activa];
  const pasado = texto.length > config.tope;

  /*
    Instagram esconde todo lo que pase de dos líneas detrás de «más». Se
    muestra dónde corta, porque es lo que decide si el precio se ve o no.
  */
  const cortado = activa === 'instagram' && texto.length > 125;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Vista previa</p>

        <div className="flex items-center gap-2">
          {disponibles.length > 1 && (
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {disponibles.map((clave) => {
                const Icono = LIMITES_DE_RED[clave].icono;
                return (
                  <button
                    key={clave}
                    onClick={() => setRed(clave)}
                    title={LIMITES_DE_RED[clave].nombre}
                    className={`rounded-md p-1.5 ${
                      activa === clave ? 'bg-white shadow-sm' : 'text-slate-400'
                    }`}
                    style={activa === clave ? { color: LIMITES_DE_RED[clave].color } : undefined}
                  >
                    <Icono size={14} />
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setEnTelefono(!enTelefono)}
            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-200"
          >
            {enTelefono ? 'Teléfono' : 'Escritorio'}
          </button>
        </div>
      </div>

      <div className={enTelefono ? 'mx-auto max-w-[320px]' : ''}>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div
              className="grid h-10 w-10 place-items-center rounded-full text-white"
              style={{ background: config.color }}
            >
              <config.icono size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Modo Sabor</p>
              <p className="text-xs text-slate-400">
                {activa === 'instagram' ? 'Ahora' : 'Ahora · 🌎 Público'}
              </p>
            </div>
          </div>

          {/* En Instagram la imagen va antes del texto; en Facebook, después. */}
          {activa === 'instagram' && (
            <div className="mt-3 grid aspect-square place-items-center rounded-lg bg-slate-100 text-xs text-slate-400">
              {cuantosArchivos ? `${cuantosArchivos} imagen(es)` : 'Instagram necesita una imagen'}
            </div>
          )}

          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">
            {texto ? (
              <>
                {cortado ? texto.slice(0, 125) : texto}
                {cortado && <span className="font-semibold text-slate-400"> … más</span>}
              </>
            ) : (
              <span className="italic text-slate-300">Tu publicación aparecerá acá…</span>
            )}
          </p>

          {activa === 'facebook' && cuantosArchivos > 0 && (
            <div className="mt-3 rounded-lg bg-slate-100 p-8 text-center text-xs text-slate-400">
              {cuantosArchivos} archivo(s) adjunto(s)
            </div>
          )}

          <div className="mt-3 flex gap-4 text-xs text-slate-400">
            {activa === 'instagram' ? (
              <>
                <span>♡ Me gusta</span>
                <span>💬 Comentar</span>
                <span>✈ Enviar</span>
              </>
            ) : (
              <>
                <span>👍 Me gusta</span>
                <span>💬 Comentar</span>
                <span>↗️ Compartir</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/*
        El contador es por red, no uno solo. Un texto de 3.000 caracteres está
        perfecto para Facebook y rebota en Instagram: un único contador no
        podría decir las dos cosas.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {disponibles.map((clave) => {
          const limite = LIMITES_DE_RED[clave];
          const excedido = texto.length > limite.tope;
          return (
            <span
              key={clave}
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                excedido ? 'text-rose-600' : 'text-slate-400'
              }`}
            >
              <limite.icono size={12} />
              {texto.length}/{limite.tope.toLocaleString('es-AR')}
            </span>
          );
        })}
      </div>

      {pasado && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700">
          El texto no entra en {config.nombre}. Si lo mandás así, esa publicación va a fallar cuando
          intente salir.
        </p>
      )}

      {cortado && !pasado && (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          En Instagram sólo se ven las primeras dos líneas. Poné lo importante —el precio, el
          horario— antes del corte.
        </p>
      )}
    </div>
  );
}

/**
 * Autolistas: contenido que se publica solo.
 *
 * ── Qué resuelve ───────────────────────────────────────────────────────────
 *
 * Un local no tiene a nadie dedicado a las redes. Lo que pasa siempre es tres
 * días seguidos de entusiasmo y después dos meses de nada.
 *
 * Hay contenido que no caduca: que hacemos delivery hasta las 23, la pizza a
 * la piedra, cómo llegar, las fotos del salón. Se carga una vez y queda
 * girando: cuando una pieza sale, vuelve al final de la fila.
 */
function Autolistas({ destinos, onCambio }) {
  const [listas, setListas] = useState([]);
  const [abierta, setAbierta] = useState(null);
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState({ nombre: '', dias: [1, 3, 5], horas: [11, 20] });

  const cargar = async () => {
    try {
      const r = await api.get('/social/autolistas');
      setListas(r.items || []);
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const crear = async () => {
    try {
      const lista = await api.post('/social/autolistas', nueva);
      toast.success('Autolista creada. Ahora cargale las publicaciones.');
      setCreando(false);
      setNueva({ nombre: '', dias: [1, 3, 5], horas: [11, 20] });
      await cargar();
      setAbierta(lista.id);
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const alternar = (campo, valor) =>
    setNueva((actual) => ({
      ...actual,
      [campo]: actual[campo].includes(valor)
        ? actual[campo].filter((v) => v !== valor)
        : [...actual[campo], valor],
    }));

  return (
    <div className="space-y-4">
      <div className="social-conectar">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-900">Publicá en piloto automático</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Cargá una vez las publicaciones que no caducan —que hacés delivery, la pizza a la
            piedra, cómo llegar— y elegí días y horas. Cuando una sale, vuelve al final de la fila y
            en unas semanas se repite. No hay que tocar nada más.
          </p>
        </div>
        <button onClick={() => setCreando(!creando)} className="social-conectar-boton">
          <PenSquare size={16} /> Nueva autolista
        </button>
      </div>

      {creando && (
        <div className="social-tarjeta space-y-4 p-5">
          <div>
            <span className="text-xs font-bold text-slate-700">Nombre</span>
            <input
              value={nueva.nombre}
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              placeholder="Ej.: Lo que siempre sirve"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none"
            />
          </div>

          <div>
            <span className="text-xs font-bold text-slate-700">Qué días</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIAS_CORTOS.map((nombre, dia) => (
                <button
                  key={dia}
                  onClick={() => alternar('dias', dia)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    nueva.dias.includes(dia)
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs font-bold text-slate-700">A qué hora</span>
            {/*
              Sólo de 8 a 23: las horas en las que un local de comida publica.
              Ofrecer las 24 obligaría a buscar entre horas que nadie va a usar.
            */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from({ length: 16 }, (_, i) => i + 8).map((hora) => (
                <button
                  key={hora}
                  onClick={() => alternar('horas', hora)}
                  className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                    nueva.horas.includes(hora)
                      ? 'bg-red-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {hora}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">Hora de Argentina.</p>
          </div>

          <button
            onClick={crear}
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
          >
            Crear
          </button>
        </div>
      )}

      {!listas.length && !creando && (
        <div className="social-tarjeta py-12 text-center">
          <p className="text-sm font-semibold text-slate-700">Todavía no hay autolistas</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Es lo que hace que las redes no se apaguen cuando el local está lleno y nadie tiene
            tiempo de publicar.
          </p>
        </div>
      )}

      {listas.map((lista) => (
        <AutolistaFila
          key={lista.id}
          lista={lista}
          destinos={destinos}
          abierta={abierta === lista.id}
          onAbrir={() => setAbierta(abierta === lista.id ? null : lista.id)}
          onCambio={async () => {
            await cargar();
            await onCambio?.();
          }}
        />
      ))}
    </div>
  );
}

function AutolistaFila({ lista, destinos, abierta, onAbrir, onCambio }) {
  const [detalle, setDetalle] = useState(null);
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (!abierta) return;
    api
      .get(`/social/autolistas/${lista.id}`)
      .then(setDetalle)
      .catch((error) => toast.error(apiError(error)));
  }, [abierta, lista.id]);

  const guardar = async (cambios) => {
    try {
      await api.put(`/social/autolistas/${lista.id}`, cambios);
      await onCambio?.();
      if (abierta) setDetalle(await api.get(`/social/autolistas/${lista.id}`));
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const agregar = async () => {
    if (!texto.trim()) return;
    try {
      setDetalle(await api.post(`/social/autolistas/${lista.id}/piezas`, { texto }));
      setTexto('');
      await onCambio?.();
    } catch (error) {
      toast.error(apiError(error));
    }
  };

  const elegidos = destinos.filter((d) => lista.destinos.includes(d.id));

  return (
    <div className="social-tarjeta p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span className={`social-punto ${lista.activa ? 'viva' : 'pausada'}`} />
            {lista.nombre}
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            {lista.piezas} {lista.piezas === 1 ? 'publicación' : 'publicaciones'} ·{' '}
            {lista.dias.map((d) => DIAS_CORTOS[d]).join(', ')} a las{' '}
            {lista.horas.map((h) => `${h}h`).join(' y ')} ·{' '}
            {lista.circular ? 'se repiten' : 'salen una vez'}
          </p>
          {!elegidos.length && (
            <p className="mt-1 text-xs font-semibold text-amber-700">
              Falta elegir dónde publica: sin destinos no va a salir nada.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => guardar({ activa: !lista.activa })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            {lista.activa ? 'Pausar' : 'Activar'}
          </button>
          <button
            onClick={onAbrir}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
          >
            {abierta ? 'Cerrar' : 'Ver y editar'}
          </button>
        </div>
      </div>

      {abierta && detalle && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div>
            <span className="text-xs font-bold text-slate-700">Dónde publica</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {destinos.map((destino) => {
                const puesto = lista.destinos.includes(destino.id);
                return (
                  <button
                    key={destino.id}
                    onClick={() =>
                      guardar({
                        destinos: puesto
                          ? lista.destinos.filter((d) => d !== destino.id)
                          : [...lista.destinos, destino.id],
                      })
                    }
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      puesto
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {destino.nombre}
                  </button>
                );
              })}
              {!destinos.length && (
                <p className="text-xs text-slate-400">
                  Primero sincronizá grupos o conectá tu página.
                </p>
              )}
            </div>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={lista.circular}
              onChange={(e) => guardar({ circular: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm">
              <span className="font-semibold text-slate-800">Repetir para siempre</span>
              <span className="block text-xs leading-relaxed text-slate-500">
                Cuando una publicación sale, vuelve al final de la fila. Sin esto, cada una sale una
                vez y la lista se termina — que es lo que querés para una promoción con fecha de
                fin.
              </span>
            </span>
          </label>

          <div>
            <span className="text-xs font-bold text-slate-700">La fila</span>
            <div className="mt-2 space-y-1.5">
              {detalle.piezas.map((pieza, i) => (
                <div
                  key={pieza.id}
                  className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="mt-0.5 text-xs font-bold text-slate-400">{i + 1}</span>
                  <p className="min-w-0 flex-1 text-sm text-slate-700">{pieza.texto}</p>
                  {pieza.veces_publicada > 0 && (
                    <span className="whitespace-nowrap text-[11px] text-slate-400">
                      salió {pieza.veces_publicada} {pieza.veces_publicada === 1 ? 'vez' : 'veces'}
                    </span>
                  )}
                  <button
                    onClick={async () => {
                      setDetalle(await api.delete(`/social/autolistas/piezas/${pieza.id}`));
                      await onCambio?.();
                    }}
                    className="text-slate-300 hover:text-rose-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!detalle.piezas.length && (
                <p className="py-3 text-center text-xs text-slate-400">
                  La fila está vacía. Agregá la primera publicación abajo.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={2}
              placeholder="Ej.: Hacemos delivery hasta las 23. Pedí por WhatsApp."
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none"
            />
            <button
              onClick={agregar}
              className="self-end rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              Agregar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * La semana, hora por hora.
 *
 * ── Por qué hacía falta además del mes ─────────────────────────────────────
 *
 * La grilla mensual sirve para ver *qué días* hay algo. Pero en un restaurante
 * lo que decide si una publicación funciona no es el día: es la hora. El menú
 * del día a las once de la mañana llega a quien todavía no decidió dónde
 * almorzar; el mismo texto a las cuatro de la tarde no le sirve a nadie.
 *
 * En la vista de mes esa diferencia no se ve. Acá sí.
 *
 * ── Por qué sólo de 8 a 23 ─────────────────────────────────────────────────
 *
 * Las horas en las que un local de comida publica. Mostrar las 24 obligaría a
 * hacer scroll para llegar a la franja que importa, y las de la madrugada
 * estarían siempre vacías.
 */
function SemanaPorHoras({ campanas, arranque, onMover }) {
  const PRIMERA_HORA = 8;
  const ULTIMA_HORA = 23;

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(arranque);
    d.setDate(arranque.getDate() + i);
    return d;
  });

  const horas = Array.from({ length: ULTIMA_HORA - PRIMERA_HORA + 1 }, (_, i) => PRIMERA_HORA + i);

  /*
    Las campañas se agrupan por día y hora una sola vez, no una vez por celda.
    Con 112 celdas y una lista de campañas, filtrar adentro del bucle sería
    recorrerla 112 veces para nada.
  */
  const porCelda = useMemo(() => {
    const mapa = new Map();
    for (const campana of campanas) {
      if (!campana.programada_para) continue;
      const cuando = new Date(String(campana.programada_para).replace(' ', 'T'));
      if (Number.isNaN(cuando.getTime())) continue;
      const clave = `${cuando.toDateString()}|${cuando.getHours()}`;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(campana);
    }
    return mapa;
  }, [campanas]);

  const hoy = new Date().toDateString();
  const ahora = new Date().getHours();

  return (
    <div className="social-semana">
      <div className="social-semana-cabecera">
        <span className="social-semana-esquina" />
        {dias.map((dia) => (
          <div
            key={dia.toDateString()}
            className={`social-semana-dia ${dia.toDateString() === hoy ? 'es-hoy' : ''}`}
          >
            <strong>{dia.toLocaleDateString('es-AR', { weekday: 'short' })}</strong>
            <em>{dia.getDate()}</em>
          </div>
        ))}
      </div>

      <div className="social-semana-cuerpo">
        {horas.map((hora) => (
          <div key={hora} className="social-semana-fila">
            <span className="social-semana-hora">{String(hora).padStart(2, '0')}:00</span>

            {dias.map((dia) => {
              const enEsta = porCelda.get(`${dia.toDateString()}|${hora}`) || [];
              const esAhora = dia.toDateString() === hoy && hora === ahora;

              return (
                <button
                  key={dia.toDateString() + hora}
                  type="button"
                  onClick={() => onMover?.(dia, hora)}
                  className={`social-semana-celda ${esAhora ? 'es-ahora' : ''}`}
                  title={`${dia.toLocaleDateString('es-AR')} a las ${hora}:00`}
                >
                  {enEsta.map((campana) => (
                    <span
                      key={campana.id}
                      className={`social-semana-post estado-${campana.estado}`}
                    >
                      {campana.nombre}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Conectar Facebook con un botón.
 *
 * ── Por qué esto reemplaza al token pegado a mano ──────────────────────────
 *
 * Pegar un token funciona, pero nadie que no sea programador lo va a hacer, y
 * un token pegado a mano vence a los dos meses sin avisar. Con este camino
 * Facebook te pregunta, elegís la página, y el servidor pide el token solo —
 * uno de página, que no vence.
 *
 * ── Los dos momentos ───────────────────────────────────────────────────────
 *
 * 1. Apretás el botón y te vas a Facebook.
 * 2. Volvés con `?conexion=elegir` y acá aparecen tus páginas para elegir.
 *
 * El estado viaja por la dirección porque en el medio hubo un viaje afuera del
 * sistema: cuando volvés, la pantalla se armó de cero y no se acuerda de nada.
 */
function ConectarConFacebook({ identidades, onConectado }) {
  const [estado, setEstado] = useState(null);
  const [paginas, setPaginas] = useState([]);
  const [eligiendo, setEligiendo] = useState(false);
  const [identidadDestino, setIdentidadDestino] = useState(null);

  useEffect(() => {
    /*
      Si no se puede averiguar el estado, se dice. Antes se dejaba en `null` y
      el bloque quedaba igual que si estuviera todo listo: el botón habilitado
      y sin ninguna advertencia. Apretarlo llevaba a un error sin explicación.

      El caso más común no es un bug sino algo trivial: el servidor todavía no
      se reinició y no conoce las rutas nuevas.
    */
    api
      .get('/social/oauth/facebook/estado')
      .then(setEstado)
      .catch(() => setEstado({ configurado: false, sinRespuesta: true }));

    const params = new URLSearchParams(window.location.search);
    const conexion = params.get('conexion');
    if (!conexion) return;

    /* La dirección se limpia para que un refresco no repita el mensaje. */
    window.history.replaceState({}, '', window.location.pathname);

    if (conexion === 'cancelada') {
      toast('Cancelaste la conexión con Facebook.');
      return;
    }
    if (conexion === 'error') {
      toast.error(params.get('motivo') || 'No se pudo conectar con Facebook.', { duration: 8000 });
      return;
    }
    if (conexion === 'elegir') {
      api
        .get('/social/oauth/facebook/paginas')
        .then((r) => {
          setPaginas(r.items || []);
          const page = (identidades || []).find((i) => i.metadata?.tipo === 'page');
          setIdentidadDestino(page?.id || identidades?.[0]?.id || null);
        })
        .catch((error) => toast.error(apiError(error)));
    }
  }, [identidades]);

  const conectar = async () => {
    try {
      const { url } = await api.post('/social/oauth/facebook/iniciar');
      window.location.assign(url);
    } catch (error) {
      toast.error(apiError(error), { duration: 9000 });
    }
  };

  const elegir = async (pageId) => {
    setEligiendo(true);
    try {
      const r = await api.post('/social/oauth/facebook/elegir', {
        pageId,
        cuentaId: identidadDestino,
      });
      toast.success(
        r.instagram
          ? `Conectada «${r.pagina}», con Instagram @${r.instagram}.`
          : `Conectada «${r.pagina}».`
      );
      setPaginas([]);
      await onConectado?.();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setEligiendo(false);
    }
  };

  /* Elegir la página: el mismo momento que en Metricool. */
  if (paginas.length) {
    return (
      <div className="social-tarjeta p-6">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Facebook size={18} className="text-blue-600" /> Elegí la página
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Estas son las páginas que administrás.{' '}
          {paginas.some((p) => p.instagram) && (
            <>
              Las que tienen Instagram vinculado <strong>conectan las dos cosas de una vez</strong>:
              Instagram sólo se puede conectar a través de la página de Facebook, no por separado.
            </>
          )}
        </p>

        {identidades.length > 1 && (
          <div className="mt-4">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Conectarla como
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {identidades.map((i) => (
                <button
                  key={i.id}
                  onClick={() => setIdentidadDestino(i.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                    identidadDestino === i.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {i.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {paginas.map((pagina) => (
            <div
              key={pagina.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"
            >
              <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-blue-50 text-blue-600">
                <Facebook size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{pagina.nombre}</p>
                {pagina.instagram ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-pink-600">
                    <Instagram size={13} /> @{pagina.instagram.usuario}
                    <span className="font-normal text-slate-400">· se conecta junto</span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-slate-400">
                    Sin Instagram vinculado a esta página
                  </p>
                )}
              </div>
              <button
                onClick={() => elegir(pagina.id)}
                disabled={eligiendo || !identidadDestino}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {eligiendo ? 'Conectando…' : 'Seleccionar'}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const yaHayAlguna = identidades.some((i) => i.tieneToken);

  return (
    <div className="social-conectar">
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold text-slate-900">
          {yaHayAlguna ? 'Conectar otra página de Facebook' : 'Conectá tu página de Facebook'}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Publicá en la Fan Page y en Instagram sin abrir el navegador, y mirá el alcance real de
          cada publicación. Los grupos siguen yendo por el Worker: Facebook no tiene otra forma.
        </p>

        {estado?.sinRespuesta && (
          <p className="mt-2 text-xs leading-relaxed text-amber-700">
            El servidor no reconoce esta función todavía. Suele ser que quedó corriendo con el
            código anterior: reiniciálo y volvé a entrar.
          </p>
        )}

        {estado && !estado.configurado && !estado.sinRespuesta && (
          <p className="mt-2 text-xs leading-relaxed text-amber-700">
            Falta configurar la app de Meta en el servidor. Hace falta{' '}
            <span className="font-mono">FACEBOOK_APP_ID</span>,{' '}
            <span className="font-mono">FACEBOOK_APP_SECRET</span> y{' '}
            <span className="font-mono">PUBLIC_URL</span>. No necesitás la revisión de Meta: con ser
            administrador de tu propia app alcanza.
          </p>
        )}
      </div>

      {/* Mientras no se sepa que se puede conectar, el botón no promete nada. */}
      <button onClick={conectar} disabled={!estado?.configurado} className="social-conectar-boton">
        <Facebook size={16} /> Conectar Facebook
      </button>
    </div>
  );
}

function ConectarMeta({ identidad, onGuardado }) {
  const [token, setToken] = useState('');
  const [pageId, setPageId] = useState(identidad.metadata?.pageId || '');
  const [igId, setIgId] = useState(identidad.metadata?.igId || '');
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [abierto, setAbierto] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      await api.post(`/social/identidades/${identidad.id}/credenciales`, {
        token: token || undefined,
        pageId,
        igId,
      });
      /*
        El campo se vacía apenas se guarda. El token ya está en el servidor y
        no hay motivo para que siga en la pantalla, donde cualquiera que pase
        por atrás lo puede leer.
      */
      setToken('');
      toast.success('Credenciales guardadas.');
      await onGuardado?.();
    } catch (error) {
      toast.error(apiError(error));
    } finally {
      setGuardando(false);
    }
  };

  const probar = async (tipo) => {
    setProbando(true);
    setResultado(null);
    try {
      setResultado(await api.post(`/social/identidades/${identidad.id}/probar`, { tipo }));
    } catch (error) {
      setResultado({ estado: 'ERROR', detalle: apiError(error) });
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="social-tarjeta p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">{identidad.nombre}</h4>
          <p className="mt-1 text-xs text-slate-500">
            {identidad.tieneToken
              ? 'Conectada por la API oficial de Meta.'
              : 'Sin conectar. Hoy publica por el Worker, con Chrome abierto.'}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold ${
            identidad.tieneToken ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {identidad.tieneToken ? 'Conectada' : 'Sin conectar'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="mt-3 text-xs font-bold text-red-600 hover:underline"
      >
        {abierto ? 'Ocultar' : identidad.tieneToken ? 'Cambiar credenciales' : 'Conectar ahora'}
      </button>

      {abierto && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Dónde sacar estos datos
            </p>
            <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600">
              <li>
                <strong>1.</strong> Entrá a{' '}
                <span className="font-mono text-[11px]">developers.facebook.com</span> con tu cuenta
                y creá una app de tipo «Empresa».
              </li>
              <li>
                <strong>2.</strong> En la app, agregá el producto «Facebook Login for Business» y
                pedí estos permisos:{' '}
                <span className="font-mono text-[11px]">pages_manage_posts</span>,{' '}
                <span className="font-mono text-[11px]">pages_read_engagement</span>,{' '}
                <span className="font-mono text-[11px]">instagram_content_publish</span> y{' '}
                <span className="font-mono text-[11px]">read_insights</span>.
              </li>
              <li>
                <strong>3.</strong> Meta tiene que <strong>aprobar esos permisos</strong> (App
                Review). Eso puede tardar varios días y lo tenés que hacer vos: yo no puedo.
              </li>
              <li>
                <strong>4.</strong> Con los permisos aprobados, generá un token de página en el
                «Explorador de la API Graph» y pegalo acá abajo.
              </li>
              <li>
                <strong>5.</strong> El ID de la página lo ves en la misma pantalla. El de Instagram
                sale de la cuenta profesional vinculada a esa página.
              </li>
            </ol>
            <p className="mt-3 text-xs leading-relaxed text-amber-700">
              Mientras tanto no pasa nada: la Fan Page sigue publicando por el Worker, igual que
              hoy.
            </p>
          </div>

          <div>
            <span className="text-xs font-bold text-slate-700">Token de acceso</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                identidad.tieneToken
                  ? 'Ya hay uno cargado. Pegá otro para cambiarlo.'
                  : 'Pegá el token de Meta'
              }
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-red-300 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Se guarda cifrado y no se vuelve a mostrar nunca, ni a mí.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="text-xs font-bold text-slate-700">ID de la página</span>
              <input
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="1234567890"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-red-300 focus:outline-none"
              />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-700">ID de Instagram</span>
              <input
                value={igId}
                onChange={(e) => setIgId(e.target.value)}
                placeholder="Opcional"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:border-red-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => probar('pagina')}
              disabled={probando || !identidad.tieneToken}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              {probando ? 'Probando…' : 'Probar la página'}
            </button>
            <button
              type="button"
              onClick={() => probar('instagram')}
              disabled={probando || !identidad.tieneToken || !igId}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Probar Instagram
            </button>
          </div>

          {resultado && (
            <div
              className={`rounded-lg p-3 text-xs leading-relaxed ${
                resultado.estado === 'ACTIVE'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-rose-50 text-rose-800'
              }`}
            >
              <strong className="block">
                {resultado.estado === 'ACTIVE' ? 'Anda bien' : 'No anduvo'}
              </strong>
              {resultado.detalle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Las reglas que puso el administrador del grupo.
 *
 * ── Por qué se cargan a mano ───────────────────────────────────────────────
 *
 * Nadie puede leer automáticamente las reglas de un grupo de Facebook: están
 * escritas en prosa, en la descripción, y cada admin las redacta como quiere.
 * Adivinarlas sería peor que no tenerlas, porque daría la falsa sensación de
 * que el sistema las está respetando.
 *
 * Se cargan una vez y el sistema las respeta siempre. Es un minuto de trabajo
 * por grupo que evita la única cosa que no tiene arreglo: que te echen.
 */
function ReglasDelGrupo({ grupo, onCambiar }) {
  const [notas, setNotas] = useState(grupo.notas || '');
  const [horas, setHoras] = useState(grupo.frecuenciaMaximaHoras || '');

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
        Reglas de {grupo.nombre}
      </p>

      <div className="mt-3 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={grupo.bloqueadoManualmente === true}
            onChange={(e) => onCambiar(grupo.id, { bloqueadoManualmente: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm">
            <span className="font-semibold text-slate-800">No publicar acá por ahora</span>
            <span className="block text-xs text-slate-500">
              Se saltea sin intentar y sin gastar cupo del día. No se pierde: queda anotado el
              motivo.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={grupo.permiteComercial === false}
            onChange={(e) => onCambiar(grupo.id, { permiteComercial: !e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
          />
          <span className="text-sm">
            <span className="font-semibold text-slate-800">Prohíbe contenido comercial</span>
            <span className="block text-xs text-slate-500">
              Sólo van a salir las publicaciones que marques como no comerciales, tipo «mañana no
              abrimos».
            </span>
          </span>
        </label>

        <div>
          <span className="text-sm font-semibold text-slate-800">Una publicación cada</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={720}
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              onBlur={() =>
                onCambiar(grupo.id, { frecuenciaMaximaHoras: horas === '' ? 0 : Number(horas) })
              }
              placeholder="24"
              className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-red-300 focus:outline-none"
            />
            <span className="text-xs text-slate-500">
              horas. Vacío usa el general. Si el admin dijo «una vez por semana», poné 168.
            </span>
          </div>
        </div>

        <div>
          <span className="text-sm font-semibold text-slate-800">Notas</span>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            onBlur={() => onCambiar(grupo.id, { notas })}
            rows={2}
            placeholder="Ej: el admin pidió que se publique sólo los martes"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-red-300 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function ConexionFacebook({ health, worker, when }) {
  const resultado = health?.resultado || {};
  const seProbo = Boolean(health?.finalizado_en);
  const hayResultado = Object.keys(resultado).length > 0;
  const error = health?.error || '';

  /* Los motivos conocidos, traducidos y con la salida al lado. */
  const explicar = (crudo) => {
    if (/ECONNREFUSED.*9222|connectOverCDP/i.test(crudo)) {
      return {
        titulo: 'Chrome no está abierto para que el Worker lo maneje',
        comoSeArregla:
          'Cerrá todas las ventanas de Chrome y abrilo de nuevo con el acceso directo del Worker, el que tiene el puerto 9222.',
      };
    }
    if (/timeout|ETIMEDOUT/i.test(crudo)) {
      return {
        titulo: 'Chrome no respondió a tiempo',
        comoSeArregla: 'Puede estar cargando o trabado. Cerralo y volvé a abrirlo.',
      };
    }
    if (/checkpoint|verification|login/i.test(crudo)) {
      return {
        titulo: 'Facebook está pidiendo verificación',
        comoSeArregla:
          'Entrá a Facebook desde ese mismo Chrome, resolvé lo que te pida, y después probá de nuevo.',
      };
    }
    return {
      titulo: 'La prueba de conexión falló',
      comoSeArregla: 'Revisá que el Worker y Chrome estén andando en la PC del local.',
    };
  };

  if (!seProbo && !worker?.ultimo_heartbeat_en) {
    return (
      <div className="mt-3 rounded-xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-700">Todavía no se probó nada</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          El Worker de la PC del local no mandó ninguna señal. Abrilo primero y después tocá «Probar
          conexión».
        </p>
      </div>
    );
  }

  if (seProbo && !hayResultado) {
    const { titulo, comoSeArregla } = explicar(error);
    return (
      <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-rose-900">
          <AlertTriangle size={16} /> {titulo}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-rose-800">{comoSeArregla}</p>
        {error && (
          <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-rose-400">
            {String(error).slice(0, 200)}
          </p>
        )}
        <p className="mt-2 text-xs text-rose-500">Última prueba: {when(health.finalizado_en)}</p>
      </div>
    );
  }

  if (hayResultado) {
    /*
      Las ocho filas del punto 34, en castellano y separando cada identidad.
      Se muestran sólo las que el worker informa: una instalación vieja manda
      menos campos y no tiene sentido inventar los que faltan.
    */
    const piezas = [
      ['Chrome', resultado.chrome],
      ['Sesión de Facebook', resultado.facebook_session],
      ['Perfil', resultado.facebook_profile],
      ['Fan Page', resultado.facebook_page],
      ['Grupos del Perfil', resultado.groups_profile],
      ['Grupos de la Page', resultado.groups_page],
      ['Instagram', resultado.instagram],
    ].filter(([, valor]) => valor !== undefined && valor !== null);

    /* Cada estado dicho como lo diría una persona. */
    const enCastellano = {
      READY: ['Listo', 'ok'],
      ACTIVE: ['Sesión activa', 'ok'],
      EXPIRED: ['Sesión vencida', 'mal'],
      CHECKPOINT: ['Facebook pide verificación', 'mal'],
      BLOCKED: ['Bloqueado por la sesión', 'mal'],
      PENDIENTE_DE_VALIDACION: ['Pendiente de validación', 'gris'],
      PENDING_SELECTION: ['Falta elegir', 'gris'],
    };

    const colores = {
      ok: 'bg-emerald-50 text-emerald-700',
      mal: 'bg-rose-50 text-rose-700',
      gris: 'bg-slate-100 text-slate-500',
    };

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {piezas.map(([nombre, valor]) => {
          const [texto, tono] = enCastellano[String(valor)] || [String(valor), 'gris'];
          return (
            <span
              key={nombre}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${colores[tono]}`}
            >
              {nombre}: {texto}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <p className="mt-3 text-sm text-slate-500">
      Última señal del Worker: {when(worker?.ultimo_heartbeat_en)}. Falta probar la conexión.
    </p>
  );
}

/**
 * El cuadro de un indicador.
 *
 * Mismo criterio que en WhatsApp Masivo: un halo del color atrás, el número en
 * degradado y la tarjeta que se levanta al pasar por encima. Cuatro números
 * negros en fila se leen como una planilla, y esta es la primera pantalla que
 * se mira.
 */
/** La fecha de hoy, escrita como se escribe en Argentina. */
function fechaDeHoy() {
  return new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const conMayusculaInicial = (texto) =>
  String(texto || '')
    .charAt(0)
    .toUpperCase() + String(texto || '').slice(1);

/**
 * Qué se le dice a la persona después de encolar.
 *
 * En castellano y contando todo, incluido lo que **no** se va a publicar. Un
 * "Publicación enviada a la cola" cuando en realidad tres grupos quedaron
 * afuera es la clase de silencio que hace que uno deje de confiar en el
 * sistema.
 */
function resumenDelReparto(reparto) {
  if (!reparto) return 'Publicación enviada a la cola.';

  const partes = [];
  if (reparto.hoy) partes.push(`${reparto.hoy} hoy`);
  if (reparto.despues) partes.push(`${reparto.despues} mañana por el cupo diario`);
  if (reparto.porRegla) partes.push(`${reparto.porRegla} excluidos por reglas del grupo`);
  if (reparto.repetidos) partes.push(`${reparto.repetidos} salteados por repetidos`);

  if (!partes.length) return 'No quedó ningún destino para publicar.';
  return partes.join(', ') + '.';
}

/**
 * Las perillas de la cola.
 *
 * Cada una explica **qué protege**, no qué hace. "Intervalo: 90 segundos" no
 * le dice nada a nadie; "publicar seguido es lo que hace que te marquen como
 * spam" sí, y es lo que permite decidir si moverla o no.
 */
const PERILLAS_COLA = [
  {
    campo: 'intervaloSegundos',
    titulo: 'Espera entre publicaciones',
    unidad: 'seg',
    min: 5,
    max: 900,
    paso: 5,
    ayuda:
      'Cuánto espera entre un grupo y el siguiente. Publicar seguido es lo que marca como spam.',
  },
  {
    campo: 'jitter',
    titulo: 'Variación al azar',
    unidad: '',
    min: 0,
    max: 0.9,
    paso: 0.05,
    formato: (v) => `±${Math.round(v * 100)}%`,
    ayuda:
      'Mueve esa espera para arriba y para abajo. Publicar cada 90 segundos clavados no lo hace ninguna persona.',
  },
  {
    campo: 'cupoDiario',
    titulo: 'Grupos por día',
    unidad: '',
    min: 1,
    max: 200,
    paso: 1,
    ayuda:
      'Máximo por identidad y por día. Lo que no entra hoy queda para mañana: no falla, espera.',
  },
  {
    campo: 'cooldownGrupoHoras',
    titulo: 'Descanso de cada grupo',
    unidad: 'h',
    min: 1,
    max: 168,
    paso: 1,
    ayuda:
      'Antes de volver a publicar en el mismo grupo. Repetir el mismo día es lo que hace que un administrador te eche.',
  },
  {
    campo: 'ventanaDedupeDias',
    titulo: 'No repetir dentro de',
    unidad: 'días',
    min: 0,
    max: 90,
    paso: 1,
    ayuda:
      'Si ya se publicó lo mismo en ese grupo dentro de este plazo, se saltea. Cero apaga el control.',
  },
  {
    campo: 'fallosParaPausar',
    titulo: 'Fallos seguidos para frenar sola',
    unidad: '',
    min: 2,
    max: 50,
    paso: 1,
    ayuda:
      'Fallos seguidos de una identidad antes de pausarla sola. Sueltos son ruido; seguidos son algo roto.',
  },
];

function PerillasDeLaCola({ config, onCambiar, onGuardar, guardando }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900">Cola inteligente</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        Los frenos que protegen la cuenta. Los valores de fábrica son conservadores a propósito:
        subirlos publica más rápido y aumenta el riesgo de bloqueo.
      </p>

      <div className="mt-5 space-y-5">
        {PERILLAS_COLA.map((perilla) => {
          const valor = Number(config[perilla.campo] ?? perilla.min);
          const mostrado = perilla.formato
            ? perilla.formato(valor)
            : `${valor}${perilla.unidad ? ` ${perilla.unidad}` : ''}`;

          return (
            <div key={perilla.campo}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">{perilla.titulo}</span>
                <span className="text-sm font-bold text-red-600">{mostrado}</span>
              </div>
              <input
                type="range"
                min={perilla.min}
                max={perilla.max}
                step={perilla.paso}
                value={valor}
                onChange={(e) => onCambiar(perilla.campo, Number(e.target.value))}
                className="mt-2 w-full accent-red-600"
              />
              <p className="mt-1 text-[11.5px] leading-5 text-slate-400">{perilla.ayuda}</p>
            </div>
          );
        })}
      </div>

      <button
        onClick={onGuardar}
        disabled={guardando}
        className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </div>
  );
}

/**
 * El freno de mano.
 *
 * ── Por qué está en el dashboard y no en configuración ─────────────────────
 *
 * Es lo que se busca cuando algo salió mal, y cuando algo sale mal nadie
 * navega tres pantallas. Va arriba de todo, siempre visible, sin entrar a
 * ningún lado.
 *
 * ── Por qué son dos niveles ────────────────────────────────────────────────
 *
 * Que la Fan Page tenga un problema no es motivo para frenar al Perfil. Poder
 * pausar una sola identidad evita el reflejo de apagar todo por las dudas.
 */
function FrenoDeMano({ pausado, motivo, identidades, onPausaGeneral, onPausaIdentidad }) {
  const frenadasSolas = identidades.filter((i) => !i.pausada && i.fallosSeguidos >= 3);

  return (
    <div className={`social-freno ${pausado ? 'social-freno--activo' : ''}`}>
      <div className="social-freno-principal">
        <div>
          <div className="social-freno-titulo">
            {pausado ? (
              <>
                <Pause size={16} /> Publicación pausada
              </>
            ) : (
              <>
                <Play size={16} /> Publicación activa
              </>
            )}
          </div>
          <p className="social-freno-nota">
            {pausado
              ? motivo
                ? `Motivo: ${motivo}. Nada se canceló: la cola sigue esperando.`
                : 'Nada se canceló: la cola sigue esperando donde estaba.'
              : 'Frenar no cancela nada. Lo que está en cola queda esperando.'}
          </p>
        </div>

        <button
          type="button"
          className={
            pausado ? 'social-freno-boton social-freno-boton--verde' : 'social-freno-boton'
          }
          onClick={() => onPausaGeneral(!pausado)}
        >
          {pausado ? (
            <>
              <Play size={14} /> Reanudar todo
            </>
          ) : (
            <>
              <Pause size={14} /> Pausar todo
            </>
          )}
        </button>
      </div>

      {identidades.length > 0 && (
        <div className="social-freno-identidades">
          {identidades.map((identidad) => (
            <div key={identidad.id} className="social-freno-identidad">
              <span className={`social-freno-punto ${identidad.pausada ? 'esta-pausada' : ''}`} />
              <span className="social-freno-nombre">{identidad.nombre}</span>

              {identidad.fallosSeguidos > 0 && (
                <span className="social-freno-fallos">
                  {identidad.fallosSeguidos} {identidad.fallosSeguidos === 1 ? 'fallo' : 'fallos'}{' '}
                  seguidos
                </span>
              )}

              <button
                type="button"
                className="social-freno-mini"
                onClick={() => onPausaIdentidad(identidad, !identidad.pausada)}
              >
                {identidad.pausada ? 'Reanudar' : 'Pausar'}
              </button>
            </div>
          ))}
        </div>
      )}

      {frenadasSolas.length > 0 && (
        /*
          Aviso antes de que se frene sola, no después. Cuando ya se frenó, el
          usuario se entera porque no publica nada; el momento útil para
          avisarle es mientras todavía va camino al tope.
        */
        <p className="social-freno-aviso">
          <AlertTriangle size={13} />
          {frenadasSolas.map((i) => i.nombre).join(' y ')} viene fallando. Si sigue así se va a
          frenar sola.
        </p>
      )}
    </div>
  );
}

/**
 * Un número grande del dashboard.
 *
 * ── Por qué el número sube en vez de aparecer ──────────────────────────────
 *
 * Un número que sube en medio segundo se lee igual, pero avisa que el dato es
 * de ahora y no de la última vez que se miró. Es la diferencia entre una
 * pantalla que informa y una que parece una foto vieja.
 *
 * Si el número no es un número —"Online", "Sesión vencida"— no se anima nada:
 * contar hasta una palabra no significa nada.
 *
 * `barra` es opcional y va de 0 a 100. Cuando hay una proporción de por medio
 * —cupo usado, tasa de éxito— una barra dice en un vistazo lo que el número
 * solo obliga a calcular.
 */
function MetricCard({ label, value, icon: Icon, color, bg, tinte = '#64748b', barra, pie }) {
  const esNumero = typeof value === 'number' || /^\d+$/.test(String(value));
  const [mostrado, setMostrado] = useState(esNumero ? 0 : value);

  useEffect(() => {
    if (!esNumero) {
      setMostrado(value);
      return undefined;
    }

    const destino = Number(value);
    if (destino === 0) {
      setMostrado(0);
      return undefined;
    }

    /*
      Medio segundo, con desaceleración. Más lento que eso se siente lento;
      más rápido no se llega a ver.
    */
    const duracion = 500;
    const arranque = performance.now();
    let animacion;

    const paso = (ahora) => {
      const avance = Math.min((ahora - arranque) / duracion, 1);
      const suave = 1 - Math.pow(1 - avance, 3);
      setMostrado(Math.round(destino * suave));
      if (avance < 1) animacion = requestAnimationFrame(paso);
    };

    animacion = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(animacion);
  }, [value, esNumero]);

  return (
    <div className="social-kpi group">
      <span className="social-kpi-halo" style={{ background: tinte }} />

      <div className="relative flex items-start justify-between">
        <div className={`inline-flex rounded-xl ${bg} p-2.5`}>
          <Icon className={color} size={20} />
        </div>
        {pie && <span className="social-kpi-pie">{pie}</span>}
      </div>

      <p
        className={`relative mt-3 font-black leading-none tracking-tight ${
          esNumero ? 'text-[2.1rem]' : 'text-[1.35rem] pt-1.5'
        }`}
        style={{
          backgroundImage: `linear-gradient(135deg, ${tinte}, ${tinte}99)`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        {mostrado}
      </p>

      <p className="relative mt-1.5 text-[11px] font-bold uppercase tracking-[.12em] text-slate-400">
        {label}
      </p>

      {typeof barra === 'number' && (
        <span className="social-kpi-barra">
          <span
            className="social-kpi-barra-llena"
            style={{
              width: `${Math.min(Math.max(barra, 0), 100)}%`,
              background: `linear-gradient(90deg, ${tinte}, ${tinte}bb)`,
            }}
          />
        </span>
      )}
    </div>
  );
}
