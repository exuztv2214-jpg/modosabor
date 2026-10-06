import { useEffect, useMemo, useRef, useState } from 'react';
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
  FileText,
  Info,
  Link2,
  Share2,
  Smartphone,
  Monitor,
  Smile,
  Hash,
  Heart,
  MessageCircle,
  Bookmark,
  Music2,
  Grid3X3,
  ThumbsUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import ActionDialog from '../components/ActionDialog.jsx';
import api from '../lib/api.js';
import {
  STATUS_STYLES,
  estadoVisualDeVia,
  formatSocialDate,
  formatSocialDateTime,
  formatearPorcentajeMetrica,
  planDeGuardado,
  resumenDeRevision,
  socialApiError,
} from './social/socialUi.js';
import { CATEGORIAS_DE_EMOJI, buscarEmojis } from './social/emojis.js';
import { FotoDeCuenta, MarcaDeIdentidad } from './social/marcas.jsx';
import {
  FORMATOS_UI,
  LIMITES_DE_RED,
  arranqueDeSemana,
  formatoDeCuenta,
  porQueNoEsteFormato,
  redDelDestino,
} from './social/compositorConfig.jsx';
import './Social.css';

const apiError = socialApiError;
const when = formatSocialDateTime;
const whenShort = formatSocialDate;
const esIdentidadFacebookOperativa = (identidad) =>
  identidad?.provider === 'facebook' && ['perfil', 'page'].includes(identidad?.metadata?.tipo);

export default function Social() {
  /*
    Al volver de Facebook hay que aterrizar en Destinos, no en el Dashboard.

    La pantalla donde se eligen las páginas vive dentro de Destinos, así que si
    la vuelta cae en el Dashboard ese componente ni se monta: la conexión quedó
    hecha y guardada, pero no aparece nada y parece que falló. Pasó de verdad
    la primera vez que se probó esto.
  */
  const [activeSection, setActiveSection] = useState(() =>
    new URLSearchParams(window.location.search).get('conexion') ? 'destinos' : 'dashboard'
  );
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
  const [loadError, setLoadError] = useState('');
  const [sending, setSending] = useState(false);
  const [campaignError, setCampaignError] = useState('');
  const [editingCampaignId, setEditingCampaignId] = useState(null);

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
    formato: 'post',
    /*
      Un formato por cuenta: `{ '12|facebook': 'post', '18|facebook': 'reel' }`.

      Arranca vacío y cae en `formato` mientras no se elija nada. Así una
      publicación rápida sigue siendo un clic, y la elección por red aparece
      sólo cuando alguien la quiere.
    */
    formatos: {},
  });
  const [genTema, setGenTema] = useState('');
  const [generating, setGenerating] = useState(false);

  /*
    ¿Está instalada la extensión?

    Se sabe porque ella misma avisa al cargar la página. Sin ese aviso, la única
    forma de enterarse sería apretar el botón y esperar a que no pase nada — que
    es exactamente el problema que la extensión viene a resolver.
  */
  const [extensionInstalada, setExtensionInstalada] = useState(false);

  /*
    El sidebar se pliega, igual que el de Masivos.

    En una notebook de 13 pulgadas, 256 píxeles de menú son el 20% de la
    pantalla. Plegarlo deja la lista de grupos y el compositor con aire.
  */
  const [menuAbiertoLateral, setMenuAbiertoLateral] = useState(true);

  useEffect(() => {
    const escucha = (evento) => {
      if (evento.source !== window) return;
      if (evento.data?.canal !== 'modosabor-social') return;

      /*
        Dos formas de enterarse, y las dos hacen falta:

        - `extension-presente` lo manda la extensión al cargar la página. Llega
          antes de que esta pantalla se monte, así que a veces se pierde.
        - `estado-respuesta` es la contestación a la pregunta de abajo. Es la
          que funciona cuando el aviso llegó demasiado temprano.

        Al principio sólo se escuchaba la primera, y como la respuesta venía
        con otro nombre, el panel decía "falta instalar la extensión" con la
        extensión instalada y contestando.
      */
      if (evento.data.tipo === 'extension-presente' || evento.data.tipo === 'estado-respuesta') {
        setExtensionInstalada(true);
      }
    };

    window.addEventListener('message', escucha);

    /*
      La extensión avisa al cargar la página, y esta pantalla puede montarse
      después. Se le pregunta también, para no depender del orden.
    */
    window.postMessage({ canal: 'modosabor-social', tipo: 'estado' }, window.origin);

    return () => window.removeEventListener('message', escucha);
  }, []);

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

  /*
    Filtros del calendario.

    Viven acá y no adentro del componente de la semana porque también los usa
    la vista de mes: un filtro que se resetea al cambiar de vista es un filtro
    que hay que volver a poner cada vez.
  */
  const [calBusqueda, setCalBusqueda] = useState('');
  const [calRed, setCalRed] = useState('todas');

  /* El lunes de la semana que se está mirando. */
  const [semanaArranque, setSemanaArranque] = useState(() => arranqueDeSemana(new Date()));

  /*
    Lo que el calendario muestra después de los filtros.

    ── Por qué la red se resuelve por los destinos y no por la campaña ──────

    Una campaña no tiene red: tiene destinos, y cada destino sí. La misma
    publicación puede ir a un grupo de Facebook y a Instagram a la vez, así que
    filtrar por "Instagram" tiene que dejarla pasar si **alguno** de sus
    destinos es de Instagram.
  */
  const campanasDelCalendario = useMemo(() => {
    const texto = calBusqueda.trim().toLowerCase();

    return (data.campanas || []).filter((campana) => {
      if (texto) {
        const enNombre = String(campana.nombre || '')
          .toLowerCase()
          .includes(texto);
        const enTexto = String(campana.texto || '')
          .toLowerCase()
          .includes(texto);
        if (!enNombre && !enTexto) return false;
      }

      if (calRed === 'todas') return true;

      const suyos = (data.destinos || []).filter((d) => (campana.destinoIds || []).includes(d.id));
      /*
        Sin destinos cargados no se puede saber la red. Se deja pasar en vez
        de esconderla: una campaña que desaparece del calendario sin motivo es
        peor que una de más.
      */
      if (!suyos.length) return true;
      return suyos.some((d) => redDelDestino(d) === calRed);
    });
  }, [data.campanas, data.destinos, calBusqueda, calRed]);

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
  const [metricsError, setMetricsError] = useState('');
  const [socialConfig, setSocialConfig] = useState({ delaySegundos: 30 });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState('');

  const loadMetrics = async () => {
    setMetricsError('');
    setMetricsLoading(true);
    try {
      const data = await api.get('/social/metricas?dias=30');
      setMetricsData(data);
    } catch (error) {
      setMetricsError(apiError(error));
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadSocialConfig = async () => {
    setConfigError('');
    try {
      const config = await api.get('/social/config');
      setSocialConfig(config);
    } catch (error) {
      setConfigError(apiError(error));
    }
  };

  const saveSocialConfig = async (cambios) => {
    setSavingConfig(true);
    try {
      const config = await api.post('/social/config', cambios);
      setSocialConfig(config);
      setConfigError('');
      toast.success('Configuración de cola guardada.');
    } catch (error) {
      const message = apiError(error);
      setConfigError(message);
      toast.error(message);
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

  /*
    Si ya se pidieron las fotos en esta sesión.

    Va en un ref y no en estado: cambiarlo no tiene que redibujar nada, y un
    `setState` acá dispararía otra recarga, que es justo lo que se quiere
    evitar.
  */
  const fotosPedidas = useRef(false);

  const reload = async () => {
    setLoadError('');
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

      /*
        ── Las rueditas de atrás se sacan solas ──────────────────────────────

        El modo seguro limita cada publicación a un destino. Tiene sentido
        mientras el sistema no publicó nunca nada: si la primera sale mal,
        sale mal en un solo lugar.

        Después de la primera que sale bien deja de tener sentido, y dejarlo
        prendido convierte una protección en un estorbo que hay que apagar
        cada vez.

        Sólo se toca un borrador en blanco: si estabas escribiendo algo y
        elegiste el modo seguro a mano, una recarga automática no puede
        cambiarte esa decisión por atrás.
      */
      if (dashboard?.resumen?.yaPublicoAlgunaVez) {
        setDraft((actual) =>
          actual.nombre || actual.texto || actual.destinoIds.length
            ? actual
            : { ...actual, personalizaciones: { ...actual.personalizaciones, modo_prueba: false } }
        );
      }

      /*
        ── Las fotos de perfil que faltan ────────────────────────────────────

        La Fan Page y el Instagram se conectaron antes de que el sistema
        supiera bajar la foto, así que sus destinos existen sin foto. Esto la
        busca una sola vez, cuando detecta que falta, y recarga.

        Va sin `await` y sin `toast`: es decoración. Si Meta no contesta, la
        pantalla sigue andando con la inicial y no aparece un error rojo por
        algo que a nadie le impide trabajar.

        La condición corta el bucle: apenas hay foto, no se vuelve a pedir. Sin
        ella, cada recarga llamaría a Meta de nuevo — y si la foto no se puede
        bajar nunca, sería para siempre.
      */
      const faltanFotos = (destinos || []).some((d) => d.executionClass === 'api' && !d.avatar);
      if (faltanFotos && !fotosPedidas.current) {
        fotosPedidas.current = true;
        api
          .post('/social/avatares/refrescar')
          .then((r) => r?.conFoto && reload())
          .catch(() => {});
      }
    } catch (error) {
      setLoadError(apiError(error));
    } finally {
      setLoading(false);
    }
  };

  // La carga inicial debe ejecutar la versión más reciente de `reload` sin
  // volver a dispararse cada vez que cambia una función o un filtro local.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    reloadRef.current();
    loadSocialConfig();
  }, []);

  useEffect(() => {
    if (activeSection === 'metricas' && !metricsData) {
      loadMetrics();
    }
  }, [activeSection, metricsData]);

  const resolvedDestinationIds = useMemo(
    () => [
      ...new Set([
        ...draft.destinoIds,
        ...data.conjuntos
          .filter((set) => draft.conjuntoIds.includes(set.id))
          .flatMap((set) => set.destinos.map((item) => item.id)),
      ]),
    ],
    [data.conjuntos, draft]
  );
  const selectedCount = resolvedDestinationIds.length;

  const toggle = (field, id) =>
    setDraft((old) => ({
      ...old,
      [field]: old[field].includes(id)
        ? old[field].filter((value) => value !== id)
        : [...old[field], id],
    }));

  const saveCampaign = async (action = 'borrador') => {
    const textosPorRed = draft.personalizaciones?.textos_por_red || {};
    const hayTexto =
      draft.texto.trim() || Object.values(textosPorRed).some((texto) => String(texto || '').trim());
    if (!hayTexto && !draft.mediaIds.length) return toast.error('Completá el contenido.');
    if (action !== 'borrador' && !selectedCount) return toast.error('Elegí al menos un destino.');
    /*
      ── El aviso tiene que decir dónde está la perilla ─────────────────────

      Antes decía "Modo de prueba: elegí manualmente un único destino" y ahí
      terminaba. Quien lo leía no sabía qué era el modo de prueba, no lo había
      prendido —venía prendido de fábrica— y no tenía forma de encontrarlo,
      porque la casilla no estaba en ninguna pantalla.

      Un mensaje de error que no dice cómo salir del error es un cartel de
      "no". Este dice cuántos elegiste y dónde se apaga.
    */
    if (
      action !== 'borrador' &&
      !draft.ensayo &&
      draft.personalizaciones.modo_prueba &&
      (draft.conjuntoIds.length || selectedCount !== 1)
    )
      return toast.error(
        `El modo seguro deja publicar en un solo lugar y elegiste ${selectedCount}. ` +
          'Dejá uno solo, o destildá «Modo seguro» abajo en Más opciones.'
      );
    setCampaignError('');
    setSending(true);
    try {
      /* El nombre interno es una nota opcional, no una traba escondida. */
      const primerTexto =
        draft.texto.trim() ||
        Object.values(textosPorRed).find((texto) => String(texto || '').trim()) ||
        '';
      const nombreAutomatico = String(primerTexto).replace(/\s+/g, ' ').trim().slice(0, 72);
      const publish = action === 'publicar';
      const schedule = action === 'programar';
      const plan = planDeGuardado(action, draft.programadaPara);
      if (schedule && !draft.programadaPara) {
        throw new Error('Elegí una fecha y hora para programar.');
      }
      const campaign = await api.post('/social/campanas', {
        ...draft,
        programadaPara: plan.programadaPara,
        personalizaciones: {
          ...draft.personalizaciones,
          auto_publicar: plan.autoPublicar,
        },
        nombre:
          draft.nombre.trim() ||
          nombreAutomatico ||
          `Publicación ${new Date().toLocaleDateString('es-AR')}`,
      });

      let encolada = null;
      if (plan.encolar) {
        encolada = await api.post(`/social/campanas/${campaign.id}/encolar`, { ahora: true });
      }
      if (editingCampaignId) {
        try {
          await api.delete(`/social/campanas/${editingCampaignId}`);
        } catch {
          toast.error('La nueva versión se guardó, pero el borrador anterior sigue en la lista.');
        }
      }

      /*
        El resumen del reparto se dice acá y no media hora después.

        Si de 35 grupos entran 25 hoy, 3 quedan excluidos por reglas y 2 son
        repetidos, la persona tiene que enterarse **en el momento de apretar el
        botón**. Enterarse al día siguiente, mirando una campaña "a medias",
        es lo que hace que uno desconfíe del sistema.
      */
      toast.success(
        publish
          ? (draft.ensayo ? 'Ensayo: ' : '') + resumenDelReparto(encolada?.reparto)
          : schedule
            ? 'Publicación programada.'
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
        /*
          El formato también se limpia.

          Sin esto, mandar un reel dejaba «reel» puesto para la publicación
          siguiente — y la próxima foto salía marcada como video sin que nadie
          lo eligiera.
        */
        formato: 'post',
        formatos: {},
      });
      setEditingCampaignId(null);
      await reload();
      loadSocialConfig();
      setActiveSection('campanas');
    } catch (error) {
      const message = apiError(error);
      setCampaignError(message);
      toast.error(message);
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
  /**
   * Vincular esta PC con un botón.
   *
   * ── Qué reemplaza ────────────────────────────────────────────────────────
   *
   * Buscar un archivo `.cmd` en una carpeta, abrirlo, y copiar una clave
   * desde un `.env` a una ventana que pedía "API Key", "CDP URL" e "intervalo
   * en segundos". Cuatro pasos, ninguno con forma de botón, y si la URL
   * quedaba mal no había error: todo se quedaba quieto.
   *
   * ── Por qué el código se pide recién al apretar ──────────────────────────
   *
   * Dura cinco minutos. Pedirlo al cargar la pantalla significaría que a los
   * seis minutos de tener Social abierto el botón ya no sirve, sin que nada lo
   * muestre.
   */
  const vincularEstaPC = async () => {
    if (!extensionInstalada) {
      toast.error('Falta instalar la extensión de Chrome. Es una sola vez y te lleva un minuto.', {
        duration: 8000,
      });
      return;
    }

    try {
      const { servidor, codigo } = await api.get('/social/worker/vinculacion');

      /*
        El mensaje lo levanta `puente-panel.js`, que Chrome inyecta en esta
        misma página. Se manda al origen exacto y no a "*": un "*" se lo puede
        leer cualquier otro marco incrustado.
      */
      const respuesta = await new Promise((listo) => {
        const escucha = (evento) => {
          if (evento.data?.canal !== 'modosabor-social') return;
          if (evento.data?.tipo !== 'vinculado') return;
          window.removeEventListener('message', escucha);
          listo(evento.data);
        };
        window.addEventListener('message', escucha);

        window.postMessage(
          { canal: 'modosabor-social', tipo: 'vincular', servidor, codigo },
          window.origin
        );

        /* Si la extensión no contesta en diez segundos, algo pasa. */
        setTimeout(() => {
          window.removeEventListener('message', escucha);
          listo({ ok: false, error: 'La extensión no respondió.' });
        }, 10000);
      });

      if (!respuesta.ok) {
        toast.error(respuesta.error || 'No se pudo vincular la extensión.', { duration: 9000 });
        return;
      }

      const fresco = await api.get('/social/dashboard');
      setData((old) => ({ ...old, dashboard: fresco }));

      toast.success('Listo. Tus grupos ya se pueden traer y publicar.', { duration: 7000 });
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

  const openCampaignDraft = async (id) => {
    try {
      const campaign = await api.get(`/social/campanas/${id}`);
      let formatos = {};
      try {
        formatos =
          typeof campaign.formatos === 'string'
            ? JSON.parse(campaign.formatos || '{}')
            : campaign.formatos || {};
      } catch {
        formatos = {};
      }
      setDraft({
        nombre: campaign.nombre || '',
        texto: campaign.texto || '',
        programadaPara: campaign.programada_para
          ? String(campaign.programada_para).replace(' ', 'T').slice(0, 16)
          : '',
        destinoIds: (campaign.targets || []).map((item) => item.destino_id),
        conjuntoIds: [],
        mediaIds: (campaign.media || []).map((item) => item.id),
        personalizaciones: campaign.personalizaciones || { modo_prueba: true },
        ensayo: Boolean(campaign.ensayo),
        formato: campaign.formato || 'post',
        formatos,
      });
      setEditingCampaignId(id);
      setCampaignError('');
      setActiveSection('crear');
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

  /*
    Lee de `campanasDelCalendario` y no de `data.campanas`.

    Antes leía de la lista cruda, así que el buscador y el filtro de red
    funcionaban en la vista de semana y no hacían nada en la de mes. Un filtro
    que anda en una pestaña y no en la de al lado es peor que no tenerlo:
    dejás de confiar en lo que ves.
  */
  const getCampaignsForDay = (year, month, day) => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return campanasDelCalendario.filter(
      (c) => c.programada_para && c.programada_para.startsWith(prefix)
    );
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

  /*
    ── El menú, agrupado ──────────────────────────────────────────────────────

    Eran nueve ítems planos, uno abajo del otro. En una notebook de 13 pulgadas
    los últimos tres —Campañas, Actividad, Configuración— quedaban abajo del
    pliegue: había que scrollear el menú para encontrarlos, cosa que nadie hace
    porque un menú no parece que se scrollee.

    Agrupados quedan cuatro bloques que responden a cuatro preguntas:
    qué hago, dónde sale, qué pasó, y cómo se configura. Cuatro títulos
    ocupan menos que tres ítems, así que ahora entra todo sin scroll.

    El orden no es alfabético ni por importancia: es el orden en que se usa.
    Primero se escribe, después se elige dónde, después se mira qué pasó.
  */
  const gruposDeMenu = [
    {
      titulo: '',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      titulo: 'Publicar',
      items: [
        { id: 'crear', label: 'Crear', icon: PenSquare },
        { id: 'calendario', label: 'Calendario', icon: CalendarDays },
        { id: 'autolistas', label: 'Autolistas', icon: RefreshCw },
      ],
    },
    {
      titulo: 'Dónde',
      items: [{ id: 'destinos', label: 'Destinos', icon: MapPin }],
    },
    {
      titulo: 'Qué pasó',
      items: [
        { id: 'campanas', label: 'Campañas', icon: ListFilter },
        { id: 'metricas', label: 'Métricas', icon: BarChart3 },
        { id: 'actividad', label: 'Actividad', icon: Bell },
      ],
    },
    {
      titulo: '',
      items: [{ id: 'config', label: 'Configuración', icon: Settings }],
    },
  ];

  /* La lista plana sigue existiendo: la usa el título de la cabecera. */
  const navItems = gruposDeMenu.flatMap((g) => g.items);

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

  if (loadError && !data.dashboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div
          className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm"
          role="alert"
        >
          <AlertTriangle className="mx-auto text-rose-500" size={30} />
          <h1 className="mt-3 text-lg font-bold text-slate-900">No se pudo cargar Social</h1>
          <p className="mt-2 text-sm text-slate-600">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              reload();
            }}
            className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            Reintentar
          </button>
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
      {/*
        Mismo sidebar que Masivos, a propósito.

        Los dos módulos son lo mismo para quien los usa: elegir a quién le
        hablás y mandar. Que uno fuera oscuro y el otro claro hacía sentir que
        eran dos programas distintos, y obligaba a reaprender dónde está cada
        cosa al cambiar de pestaña.
      */}
      <aside
        className={`social-shell-nav flex-shrink-0 border-r flex flex-col transition-all duration-300 ${
          menuAbiertoLateral ? 'w-64' : 'w-16'
        }`}
      >
        <div className="social-shell-brand h-16 flex items-center px-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white flex-shrink-0">
            <Share2 size={17} />
          </div>
          {menuAbiertoLateral && (
            <span className="ml-3 font-bold text-gray-900 text-sm truncate">Modo Sabor Social</span>
          )}
        </div>

        <nav
          className="social-shell-menu flex-1 overflow-y-auto py-3 px-2"
          aria-label="Secciones de Modo Sabor Social"
        >
          {gruposDeMenu.map((grupo, i) => (
            <div key={grupo.titulo || `bloque-${i}`} className="space-y-1">
              {/*
                El título del grupo se esconde con el menú plegado.

                Con 64 píxeles de ancho no entra "Publicar", y un texto cortado
                a la mitad se lee peor que no tener título. La separación entre
                bloques la marca el espacio.
              */}
              {grupo.titulo && menuAbiertoLateral && (
                <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-gray-300">
                  {grupo.titulo}
                </p>
              )}
              {grupo.titulo && !menuAbiertoLateral && <div className="h-3" />}

              {grupo.items.map((item) => {
                const Icon = item.icon;
                const activa = activeSection === item.id;
                const cuenta = contadoresDelMenu[item.id];

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    title={!menuAbiertoLateral ? item.label : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      activa
                        ? 'bg-brand-50 text-brand-700 shadow-sm'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon
                      size={18}
                      className={`flex-shrink-0 ${activa ? 'text-brand-500' : 'text-gray-400'}`}
                    />
                    {menuAbiertoLateral && (
                      <span className="truncate flex-1 text-left">{item.label}</span>
                    )}
                    {/*
                  El número no es adorno: hace que se vea que hay 3 con error
                  sin tener que entrar a buscarlos.
                */}
                    {menuAbiertoLateral && cuenta ? (
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          cuenta.tono === 'mal'
                            ? 'bg-red-50 text-red-600'
                            : cuenta.tono === 'ojo'
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {cuenta.valor}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Las identidades: la primera decisión de todo lo demás. */}
        {menuAbiertoLateral && (
          /*
            Alto máximo y scroll propio.

            Sin tope, este bloque crece con cada identidad y le come el lugar
            al menú de arriba, que es lo que se usa para navegar. Con dos
            identidades no se nota; con cinco, «Configuración» desaparece de la
            pantalla sin que nada lo insinúe.
          */
          <div className="social-shell-identidades max-h-[168px] flex-shrink-0 overflow-y-auto border-t border-gray-100 px-2 py-2">
            <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Publicás como
            </p>
            {(data.identidades || []).filter(esIdentidadFacebookOperativa).map((identidad) => {
              const elegida = identidadElegida === identidad.id;
              const detenida = identidad.pausada || identidad.frenadaAutomaticamente;
              const via =
                identidad.metadata?.tipo === 'page'
                  ? data.dashboard?.vias?.pagina
                  : data.dashboard?.vias?.perfilGrupos;
              const estadoVia = estadoVisualDeVia(via);
              const cuantos = data.destinos.filter(
                (d) => d.tipo === 'facebook_group' && d.cuenta_id === identidad.id
              ).length;

              return (
                <button
                  key={identidad.id}
                  type="button"
                  onClick={() => {
                    setIdentidadElegida(identidad.id);
                    setActiveSection('destinos');
                  }}
                  className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left transition-colors ${
                    elegida ? 'bg-brand-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <FotoDeCuenta
                    foto={identidad.avatar}
                    nombre={identidad.nombre}
                    red="facebook"
                    size={30}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-gray-900">
                      {identidad.nombre}
                    </span>
                    <span className="block text-[11px] text-gray-400">
                      {cuantos} {cuantos === 1 ? 'grupo' : 'grupos'}
                    </span>
                  </span>
                  <span
                    className={`w-2 h-2 flex-shrink-0 rounded-full ${
                      detenida || estadoVia.tono !== 'lista' ? 'bg-amber-400' : 'bg-emerald-500'
                    }`}
                    title={
                      identidad.frenadaAutomaticamente
                        ? `Frenada por ${identidad.fallosSeguidos} fallos seguidos`
                        : identidad.pausada
                          ? 'En pausa'
                          : estadoVia.etiqueta
                    }
                  />
                </button>
              );
            })}
            {!(data.identidades || []).length && (
              <p className="px-2 text-[11px] leading-relaxed text-gray-400">
                Todavía no hay identidades. Conectá tus grupos y sincronizá.
              </p>
            )}
          </div>
        )}

        <div className="social-shell-footer border-t border-gray-100 p-2 space-y-1">
          {/*
            Conectar va arriba de Verificar a propósito: es lo primero que hay
            que hacer, y verificar algo que nunca se conectó siempre va a dar
            "sin validar".
          */}
          <button
            type="button"
            onClick={vincularEstaPC}
            title={!menuAbiertoLateral ? 'Conectar mis grupos' : undefined}
            className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors ${
              menuAbiertoLateral ? '' : 'justify-center'
            }`}
          >
            <Link2 size={15} className="flex-shrink-0" />
            {menuAbiertoLateral && (
              <span className="truncate">
                {extensionInstalada ? 'Conectar mis grupos' : 'Instalar extensión'}
              </span>
            )}
          </button>

          {/*
            «Verificar» y «Actualizar» se fueron a la cabecera.

            Acá abajo ocupaban dos renglones fijos que empujaban el menú hasta
            que Campañas y Configuración quedaban abajo del pliegue. Son dos
            botones que se tocan cuando algo no sale — no todos los días — y en
            la cabecera, como iconos, ocupan cero altura del menú.
          */}
          <button
            type="button"
            onClick={() => setMenuAbiertoLateral((v) => !v)}
            className="w-full flex items-center justify-center p-2 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            <ChevronRight size={18} className={menuAbiertoLateral ? 'rotate-180' : ''} />
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
            {data.dashboard?.vias?.perfilGrupos?.estado !== 'lista' && (
              <span className="social-chip alerta">
                <AlertTriangle size={12} /> Extensión desconectada
              </span>
            )}

            {/*
              Verificar y actualizar, como iconos.

              Estaban al pie del menú ocupando dos renglones fijos que empujaban
              las últimas secciones abajo del pliegue. Son acciones de
              "algo no salió", no de todos los días: acá están a mano y no le
              sacan lugar a nada.
            */}
            {[
              { Icono: ShieldCheck, texto: 'Verificar conexión', accion: health },
              { Icono: RefreshCw, texto: 'Actualizar', accion: reload },
            ].map(({ Icono, texto, accion }) => (
              <button
                key={texto}
                type="button"
                onClick={accion}
                title={texto}
                aria-label={texto}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Icono size={16} />
              </button>
            ))}

            <button onClick={() => setActiveSection('crear')} className="social-boton-principal">
              <Send size={14} /> Nueva publicación
            </button>
          </div>
        </header>

        <div className="social-content p-6 md:p-8">
          {loadError && (
            <div
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
              role="alert"
            >
              <span>No se pudieron actualizar los datos: {loadError}</span>
              <button type="button" onClick={reload} className="font-bold">
                Reintentar
              </button>
            </div>
          )}
          {/* ==================== DASHBOARD ==================== */}
          {activeSection === 'dashboard' && (
            <div className="space-y-6">
              <EstadoDeVias
                vias={data.dashboard?.vias}
                onIr={setActiveSection}
                onVincular={vincularEstaPC}
              />

              {/* Métricas Cards */}
              <div className="grid gap-4 sm:grid-cols-3">
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
              </div>

              <QueFaltaParaEmpezar
                vias={data.dashboard?.vias}
                extensionInstalada={extensionInstalada}
                onIr={setActiveSection}
                onVincular={vincularEstaPC}
              />

              <FrenoDeMano
                pausado={Boolean(socialConfig.pausaGlobal)}
                motivo={socialConfig.pausaGlobalMotivo}
                identidades={(data.identidades || []).filter(esIdentidadFacebookOperativa)}
                onPausaGeneral={cambiarPausaGeneral}
                onPausaIdentidad={cambiarPausaIdentidad}
              />

              {/*
                Cuando la extensión no está dando señales.

                ── Por qué son dos líneas y no cuatro pasos ──────────────────

                Antes acá había una lista numerada de cuatro pasos explicando
                cómo abrir un programa de escritorio, con qué Chrome, y en qué
                orden. Ese programa ya no existe: lo reemplazó la extensión,
                que se arregla con un botón.

                Una alerta que aparece cuando algo falló no es el lugar para
                enseñar a usar el sistema. Es el lugar para decir qué pasa y
                dar el botón que lo arregla.
              */}
              {data.dashboard?.vias?.perfilGrupos?.estado !== 'lista' && (
                <div className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <AlertTriangle size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-amber-900">
                      La extensión no está respondiendo
                    </p>
                    <p className="text-xs text-amber-700">
                      Sin ella no se publica en grupos ni en el perfil.
                    </p>
                  </div>
                  <button
                    onClick={vincularEstaPC}
                    className="flex-shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700"
                  >
                    {extensionInstalada ? 'Reconectar' : 'Instalar'}
                  </button>
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
                  {(data.identidades || []).some(esIdentidadFacebookOperativa) && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                        Publicar como
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(data.identidades || [])
                          .filter(esIdentidadFacebookOperativa)
                          .map((identidad) => {
                            const activa = identidadElegida === identidad.id;
                            const grupos = (data.destinos || []).filter(
                              (d) => d.cuenta_id === identidad.id && d.tipo === 'facebook_group'
                            ).length;
                            return (
                              <button
                                key={identidad.id}
                                onClick={() => setIdentidadElegida(identidad.id)}
                                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all ${
                                  activa
                                    ? 'bg-slate-900 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                <FotoDeCuenta
                                  foto={identidad.avatar}
                                  nombre={identidad.nombre}
                                  red="facebook"
                                  size={32}
                                />
                                <span>
                                  <span className="block text-sm font-bold">
                                    {identidad.nombre}
                                  </span>
                                  <span
                                    className={`block text-xs ${activa ? 'text-white/70' : 'text-slate-400'}`}
                                  >
                                    {grupos > 0
                                      ? `${grupos} ${grupos === 1 ? 'grupo' : 'grupos'}`
                                      : 'sin grupos'}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/*
                    ── Tres botones, cero párrafos ──────────────────────────

                    Antes cada botón traía debajo dos renglones explicando qué
                    hacía. Eran seis renglones de texto para tres acciones que
                    se entienden por el nombre, y encima describían un programa
                    de escritorio que ya no existe: "abre el Chrome del
                    Worker", "chequea que Chrome responda".

                    Lo que se usa todos los días no necesita instrucciones al
                    lado. El que quiere saber más pasa el mouse por encima.
                  */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      onClick={() => syncGroups()}
                      title="Trae los grupos donde puede publicar la identidad elegida"
                      className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-slate-800"
                    >
                      <RefreshCw size={14} /> Traer mis grupos
                    </button>
                    <button
                      onClick={() => syncGroups('ambas')}
                      title="Los del Perfil y los de la Fan Page, que son listas distintas"
                      className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <Users size={14} /> Las dos identidades
                    </button>
                    <button
                      onClick={health}
                      title="Comprueba que la extensión responda y que la sesión de Facebook siga viva"
                      className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      <ShieldCheck size={14} /> Verificar
                    </button>
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
                  {data.campanas.slice(0, 5).map((item) => {
                    const total = Number(item.total) || 0;
                    const hechos = Number(item.publicados) || 0;
                    const avance = total ? Math.round((hechos / total) * 100) : 0;
                    const formato =
                      FORMATOS_UI.find((f) => f.clave === (item.formato || 'post')) ||
                      FORMATOS_UI[0];
                    const IconoFormato = formato.icono;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50"
                      >
                        {/*
                          El ícono del formato, no un puntito de color.

                          Un punto sólo dice "hay un estado". El ícono dice si
                          eso fue un reel, una historia o un posteo — que es la
                          primera pregunta cuando uno mira una lista de lo que
                          publicó.
                        */}
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
                          title={formato.nombre}
                        >
                          <IconoFormato size={16} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {item.nombre}
                          </p>
                          <p className="text-xs text-slate-400">
                            {whenShort(item.programada_para)} · {hechos}/{total || '—'}
                          </p>

                          {/*
                            La barra de avance sólo cuando hay algo que avanzar.

                            En un borrador sin destinos sería una barra vacía
                            que no significa nada: parecería que algo falló.
                          */}
                          {total > 0 && (
                            <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-slate-100">
                              <span
                                className="block h-full rounded-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${avance}%` }}
                              />
                            </span>
                          )}
                        </div>

                        <span
                          className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[item.estado]?.bg} ${STATUS_STYLES[item.estado]?.text}`}
                        >
                          {STATUS_STYLES[item.estado]?.label || item.estado}
                        </span>
                      </div>
                    );
                  })}
                  {!data.campanas.length && (
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                      <PenSquare size={26} className="text-slate-300" />
                      <p className="text-sm text-slate-400">Todavía no publicaste nada</p>
                      <button
                        onClick={() => setActiveSection('crear')}
                        className="mt-1 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-600"
                      >
                        Crear la primera
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== CONFIGURACIÓN ==================== */}
          {activeSection === 'config' && (
            <div className="mx-auto max-w-5xl space-y-6">
              {configError && (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
                  role="alert"
                >
                  <span>{configError}</span>
                  <button type="button" onClick={loadSocialConfig} className="font-bold">
                    Reintentar
                  </button>
                </div>
              )}
              <EstadoDeVias
                vias={data.dashboard?.vias}
                onIr={setActiveSection}
                onVincular={vincularEstaPC}
              />
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
              destinosRevision={data.destinos.filter((item) =>
                resolvedDestinationIds.includes(item.id)
              )}
              errorAlGuardar={campaignError}
              identidades={data.identidades || []}
              onIrADestinos={() => setActiveSection('destinos')}
              /*
                Cancelar vacía el borrador y vuelve al tablero.

                Se limpia todo, incluido el formato: sin eso, cancelar un reel
                dejaba «reel» puesto para la publicación siguiente y la próxima
                foto salía marcada como video.
              */
              onCancelar={() => {
                setDraft({
                  nombre: '',
                  texto: '',
                  programadaPara: '',
                  destinoIds: [],
                  conjuntoIds: [],
                  mediaIds: [],
                  personalizaciones: { modo_prueba: true },
                  ensayo: false,
                  formato: 'post',
                  formatos: {},
                });
                setEditingCampaignId(null);
                setActiveSection('dashboard');
              }}
            />
          )}
          {/* ==================== CALENDARIO ==================== */}
          {activeSection === 'calendario' && (
            <div className="mx-auto max-w-6xl">
              {/*
                ── La barra, copiada de Metricool ──────────────────────────

                Buscar, «Esta semana», el rango con flechas, los filtros y el
                botón de crear. El orden es el de ellos porque funciona: lo que
                se usa siempre a la izquierda, lo que decide qué se ve en el
                medio, y la acción principal al final, separada.

                Lo que no copié: «Crear vista» y el aviso de plan. Uno es una
                función de su producto pago y el otro es publicidad.
              */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[190px] flex-1 sm:max-w-xs">
                  <Filter
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={calBusqueda}
                    onChange={(e) => setCalBusqueda(e.target.value)}
                    placeholder="Buscar"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-slate-400"
                  />
                </div>

                {/*
                  «Esta semana» vuelve a hoy desde donde estés.

                  Sin esto, navegar tres meses adelante y volver es apretar la
                  flecha doce veces. Es el botón que más se agradece de la
                  barra de Metricool y el más fácil de olvidar.
                */}
                <button
                  onClick={() => setSemanaArranque(arranqueDeSemana(new Date()))}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Esta semana
                </button>

                {/* Filtro por red, como el de ellos pero con las dos que tenemos. */}
                <div className="flex rounded-xl bg-slate-100 p-1">
                  {[
                    ['todas', 'Todas', null],
                    ['facebook', 'Facebook', Facebook],
                    ['instagram', 'Instagram', Instagram],
                  ].map(([id, texto, Icono]) => (
                    <button
                      key={id}
                      onClick={() => setCalRed(id)}
                      title={texto}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        calRed === id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {Icono ? <Icono size={13} /> : null}
                      {texto}
                    </button>
                  ))}
                </div>
              </div>

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
                  campanas={campanasDelCalendario}
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
                  {/*
                    El conteo real en lugar de la frase de siempre.

                    Antes decía "Páginas y grupos de Facebook sincronizados",
                    que es cierto tanto con cero grupos como con doscientos: no
                    informaba nada. El número sí, y de paso confirma de un
                    vistazo que la última sincronización trajo algo.
                  */}
                  <p className="text-sm text-slate-400">
                    {(data.destinos || []).length > 0
                      ? `${(data.destinos || []).length} destinos sincronizados`
                      : 'Sin destinos todavía'}
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
                identidades={(data.identidades || []).filter(esIdentidadFacebookOperativa)}
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
                    .filter(esIdentidadFacebookOperativa)
                    .map((identidad) => (
                      <ConectarMeta key={identidad.id} identidad={identidad} onGuardado={reload} />
                    ))}
                </div>
              </details>

              <GruposFacebook
                identidades={(data.identidades || []).filter(esIdentidadFacebookOperativa)}
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
                onCambiarMuchos={async (ids, habilitada) => {
                  try {
                    await api.put('/social/destinos/lote', { ids, habilitada });
                    await reload();
                    toast.success(
                      habilitada
                        ? `${ids.length} grupos seleccionados.`
                        : `${ids.length} grupos quitados de la selección.`
                    );
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
                {data.destinos.map((item) => {
                  const conexion = estadoVisualDeVia(item.estadoConexion);
                  return (
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
                            <span className={`social-via-estado ${conexion.tono}`}>
                              {item.habilitada ? conexion.etiqueta : 'Pausado'}
                            </span>
                            {item.favorita && (
                              <Star size={14} className="text-amber-400" fill="currentColor" />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
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
                              {item.estado === 'draft' && (
                                <button
                                  onClick={() => openCampaignDraft(item.id)}
                                  className="rounded p-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
                                  title="Continuar editando"
                                >
                                  <Pencil size={14} />
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
              {!metricsLoading && metricsError && (
                <div
                  className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700"
                  role="alert"
                >
                  <p>{metricsError}</p>
                  <button type="button" onClick={loadMetrics} className="mt-3 font-bold">
                    Reintentar
                  </button>
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
                      value={formatearPorcentajeMetrica(metricsData.resumen.tasaExito)}
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
                      {!metricsData.porDia.length && (
                        <p className="m-auto text-sm text-slate-400">
                          Todavía no hay ejecuciones para mostrar.
                        </p>
                      )}
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
                      <h3 className="text-sm font-bold text-slate-900">Ejecución por hora</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        Indica si el sistema logró publicar, no cuánta gente lo vio.
                      </p>
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
                      {!metricsData.estados.length && (
                        <p className="text-sm text-slate-400">
                          Todavía no hay estados registrados.
                        </p>
                      )}
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
function GruposFacebook({
  identidades,
  destinos,
  identidadElegida,
  onElegirIdentidad,
  onCambiar,
  onCambiarMuchos,
}) {
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
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                activa
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FotoDeCuenta
                foto={identidad.avatar}
                nombre={identidad.nombre}
                red="facebook"
                size={28}
              />
              <span>{identidad.nombre}</span>
              <span className={`text-xs ${activa ? 'text-white/60' : 'text-slate-400'}`}>
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
        {visibles.length > 0 && onCambiarMuchos && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onCambiarMuchos(
                  visibles.map((grupo) => grupo.id),
                  true
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
            >
              <Check size={14} /> Seleccionar todo
            </button>
            <button
              type="button"
              onClick={() =>
                onCambiarMuchos(
                  visibles.map((grupo) => grupo.id),
                  false
                )
              }
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"
            >
              Quitar selección
            </button>
          </div>
        )}
      </div>

      {/* La lista */}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {deLaIdentidad.length === 0 && (
          <div className="rounded-xl bg-slate-50 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">Sin grupos todavía</p>
            <p className="mt-1 text-xs text-slate-400">Tocá «Sincronizar esta identidad» arriba.</p>
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
            className={`relative rounded-2xl border p-4 transition-all ${
              grupo.habilitada
                ? 'border-blue-100 bg-white shadow-sm hover:-translate-y-0.5 hover:shadow-md'
                : 'border-slate-200 bg-slate-50 opacity-70'
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-blue-600 ring-2 ring-white shadow-sm">
                {grupo.avatar ? (
                  <img src={grupo.avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Users size={22} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 min-h-10 text-sm font-bold leading-5 text-slate-900">
                  {grupo.nombre}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
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
                  {/*
                  Se muestra sólo si pasó algo digno de contar.

                  «detectado» y «pendiente» son estados internos que aparecían
                  en las veintinueve filas diciendo lo mismo. Un dato que está
                  siempre y es siempre igual no es información: es ruido que
                  tapa las etiquetas que sí cambian.
                */}
                  {grupo.ultimo_estado &&
                    !['pendiente', 'detectado'].includes(grupo.ultimo_estado) && (
                      <span>{grupo.ultimo_estado}</span>
                    )}
                  {/*
                  La dirección, como un link y no como texto.

                  Antes se imprimía entera —"https://www.facebook.com/groups/
                  1898845847012019/"— debajo de cada uno de los veintinueve
                  grupos. Cincuenta caracteres que nadie lee y que empujaban
                  fuera de la vista las etiquetas que sí importan: si requiere
                  aprobación, si está bloqueado, cada cuánto se puede publicar.

                  Como link se puede abrir, que es lo único que uno quiere
                  hacer con una dirección.
                */}
                  {grupo.url && (
                    <a
                      href={grupo.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Abrir en Facebook"
                      className="inline-flex items-center gap-1 font-medium text-slate-400 transition-colors hover:text-blue-600"
                    >
                      <Facebook size={11} /> Abrir
                    </a>
                  )}
                </p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(grupo.habilitada)}
                onChange={(e) => onCambiar(grupo.id, { habilitada: e.target.checked })}
                title={grupo.habilitada ? 'Recibe publicaciones' : 'Deshabilitado'}
                className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span
                className={`text-xs font-semibold ${grupo.habilitada ? 'text-emerald-600' : 'text-slate-400'}`}
              >
                {grupo.habilitada ? 'Seleccionado para campañas' : 'No seleccionado'}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onCambiar(grupo.id, { favorita: !grupo.favorita })}
                  title={grupo.favorita ? 'Sacar de favoritos' : 'Marcar como favorito'}
                  className={`rounded-lg p-1.5 transition-colors ${
                    grupo.favorita
                      ? 'text-amber-500 hover:bg-amber-50'
                      : 'text-slate-300 hover:bg-slate-100'
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
                      : 'text-slate-400 hover:bg-slate-100'
                  }`}
                >
                  <Settings size={16} />
                </button>
              </div>
            </div>
            {abierto === grupo.id && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <ReglasDelGrupo grupo={grupo} onCambiar={onCambiar} />
              </div>
            )}
          </div>
        ))}
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
        <div className="mt-4 flex flex-col items-center gap-2 py-6 text-center">
          <CalendarDays size={26} className="text-slate-300" />
          <p className="text-sm text-slate-400">Nada programado</p>
        </div>
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
function EstadoDeVias({ vias = {}, onIr, onVincular }) {
  const items = [
    { clave: 'pagina', nombre: 'Página de Facebook', icono: Facebook },
    { clave: 'instagram', nombre: 'Instagram', icono: Instagram },
    { clave: 'perfilGrupos', nombre: 'Perfil y grupos', icono: Users },
  ];

  return (
    <section aria-labelledby="social-vias-titulo">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 id="social-vias-titulo" className="text-sm font-bold text-slate-900">
            Canales de publicación
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">Cada canal funciona por separado.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map(({ clave, nombre, icono: Icono }) => {
          const via = vias?.[clave] || { estado: 'sin_configurar' };
          const visual = estadoVisualDeVia(via);
          return (
            <article key={clave} className={`social-via social-via--${visual.tono}`}>
              <span className="social-via-icono" aria-hidden="true">
                <Icono size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-slate-900">{nombre}</h4>
                  <span className={`social-via-estado ${visual.tono}`}>{visual.etiqueta}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {via.motivo || 'Todavía no se comprobó este canal.'}
                </p>
              </div>
              {visual.accion && (
                <button
                  type="button"
                  onClick={() => {
                    if (via.estado === 'en_pausa') {
                      onIr('dashboard');
                      setTimeout(
                        () =>
                          document
                            .getElementById('social-freno')
                            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                        0
                      );
                      return;
                    }
                    if (clave === 'perfilGrupos') onVincular();
                    else onIr('destinos');
                  }}
                  className="social-via-accion"
                >
                  {visual.accion}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function QueFaltaParaEmpezar({ vias = {}, extensionInstalada, onIr, onVincular }) {
  const perfilListo = vias?.perfilGrupos?.estado === 'lista';
  const paginaLista = vias?.pagina?.estado === 'lista';
  const instagramListo = vias?.instagram?.estado === 'lista';

  const pasos = [
    /*
      Este paso cambia según haya extensión o no, porque son dos problemas
      distintos y la solución no es la misma.

      Antes decía siempre lo mismo —"prender el Worker"— y había que buscar un
      archivo .cmd, abrirlo, y copiar una clave de un .env a una ventana.
      Cuatro cosas que no significan nada para quien atiende un local.
    */
    extensionInstalada
      ? {
          hecho: perfilListo,
          titulo: 'Comprobar perfil y grupos',
          detalle: vias?.perfilGrupos?.motivo || 'Vinculá esta PC y comprobá tu sesión.',
          accion: { texto: 'Conectar', vincular: true },
        }
      : {
          hecho: perfilListo,
          titulo: 'Instalar la extensión de Chrome',
          detalle:
            'Es una sola vez y lleva un minuto. Facebook cerró la forma de publicar en grupos desde un servidor, así que hay que hacerlo desde tu navegador.',
          accion: { texto: 'Cómo se instala', ir: 'config' },
        },
    {
      hecho: paginaLista,
      titulo: 'Conectar la Página de Facebook',
      detalle: vias?.pagina?.motivo || 'Elegí la página que administrás y comprobá la conexión.',
      accion: { texto: 'Conectar', ir: 'destinos' },
    },
    {
      hecho: instagramListo,
      titulo: 'Comprobar Instagram',
      detalle: vias?.instagram?.motivo || 'Instagram se conecta desde la página de Facebook.',
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
              <button
                onClick={() => (paso.accion.vincular ? onVincular() : onIr(paso.accion.ir))}
                className="social-arranque-boton"
              >
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
/**
 * El selector de emojis.
 *
 * ── Por qué se busca en castellano ─────────────────────────────────────────
 *
 * Los selectores que vienen en librerías buscan en inglés: hay que escribir
 * "burger" para la hamburguesa y "happy" para la cara contenta. Esa fricción
 * es la que hace que nadie los use y las promos terminen sin un solo emoji.
 *
 * Acá se escribe "hamburguesa", "contento" o "plata" y aparece. Y sin tildes
 * también: "camion" encuentra el camión.
 *
 * ── Por qué el panel no se cierra al elegir ────────────────────────────────
 *
 * Nadie pone un emoji solo. Poner tres y cerrarlo a mano es un clic más;
 * cerrarlo cada vez son dos clics extra por emoji.
 */
function SelectorDeEmojis({ onElegir }) {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState(CATEGORIAS_DE_EMOJI[0].nombre);

  const resultados = busqueda.trim() ? buscarEmojis(busqueda) : null;
  const activa = CATEGORIAS_DE_EMOJI.find((c) => c.nombre === categoria);
  const mostrados = resultados ?? activa.emojis;

  return (
    <div className="social-emojis">
      <div className="social-emojis-buscar">
        <Filter size={13} />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar: pizza, contento, plata…"
        />
        {busqueda && (
          <button type="button" onClick={() => setBusqueda('')} title="Limpiar">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Las categorías se esconden mientras se busca: el resultado manda. */}
      {!resultados && (
        <div className="social-emojis-categorias">
          {CATEGORIAS_DE_EMOJI.map((c) => (
            <button
              key={c.nombre}
              type="button"
              onClick={() => setCategoria(c.nombre)}
              title={c.nombre}
              className={c.nombre === categoria ? 'activa' : ''}
            >
              {c.icono}
            </button>
          ))}
        </div>
      )}

      <div className="social-emojis-grilla">
        {mostrados.map(([emoji, palabras]) => (
          <button
            key={emoji + palabras}
            type="button"
            onClick={() => onElegir(emoji)}
            title={palabras.split(' ')[0]}
            className="social-comp-emoji"
          >
            {emoji}
          </button>
        ))}

        {resultados && !resultados.length && (
          <p className="social-emojis-nada">Ninguno con «{busqueda}»</p>
        )}
      </div>
    </div>
  );
}

/**
 * El chip de una red, con su selector de formato.
 *
 * ── Por qué el formato va acá y no arriba de todo ──────────────────────────
 *
 * Es la pieza que hacía falta cambiar el modelo de datos para poder copiar.
 *
 * Antes el formato era uno solo para toda la publicación: elegir Reel se lo
 * ponía a Facebook y a Instagram por igual. Pero el caso normal es tener un
 * video vertical que querés como **reel en Instagram** y como **posteo común
 * en la Fan Page**, porque en el muro un reel se ve peor.
 *
 * Pegado al ícono de cada red, se ve de un vistazo qué va a salir dónde.
 */
function ChipDeRed({
  cuenta,
  formato,
  onCambiar,
  onElegirGrupos,
  gruposActivos = false,
  cuantos,
  activa = true,
}) {
  const [abierto, setAbierto] = useState(false);
  const red = cuenta.red;

  /*
    Las descripciones son las de Metricool, en castellano rioplatense.

    Dicen algo que no es obvio: qué tipo de archivo espera cada formato. "Un
    video" y "una imagen o un carrusel" evitan el intento fallido que termina
    en un error de Meta diez minutos después.
  */
  /*
    Los formatos que esta cuenta puede hacer, no los de su red.

    La Fan Page sale por API y el Perfil por el Worker local. Por eso ambos
    ofrecen Post, Reel e Historia, aunque usen motores diferentes.
  */
  const formatosDisponibles = FORMATOS_UI.filter((f) => f.destinos.includes(cuenta.tipoDestino));
  const opcionGrupos = cuenta.tipos?.includes('facebook_group')
    ? {
        clave: 'grupos',
        nombre: 'Grupos',
        queEspera: 'Elegí uno o varios grupos de Facebook',
        icono: Users,
      }
    : null;
  const opciones = opcionGrupos ? [...formatosDisponibles, opcionGrupos] : formatosDisponibles;

  const actual = formatosDisponibles.find((o) => o.clave === formato) || formatosDisponibles[0];
  const actualVisible = gruposActivos && opcionGrupos ? opcionGrupos : actual;
  const IconoFormato = actualVisible.icono;
  const soloUno = opciones.length === 1;

  return (
    <div className={`social-chip-red ${activa ? '' : 'apagada'}`}>
      {/*
        El ícono real de la marca, no una silueta gris.

        Acá el ícono **es** la identificación de la cuenta: es lo que te dice de
        un vistazo si eso va a Facebook o a Instagram. Dos contornos grises
        obligan a leer el nombre para distinguirlos.
      */}
      <span
        className="social-chip-red-avatar"
        title={cuenta.nombre}
        style={activa ? undefined : { opacity: 0.72 }}
      >
        {/*
          La foto real, con la marca de la red encima.

          Antes acá había sólo el logo de la red. Con dos cuentas de Facebook
          —el Perfil y la Fan Page— eso son dos círculos azules idénticos, y
          hay que leer el nombre chiquito de al lado para saber cuál es cuál.
          La foto lo resuelve de un vistazo.
        */}
        <MarcaDeIdentidad tipo={red} size={34} />
        <span className="social-chip-red-calendario" aria-hidden="true">
          <CalendarDays size={11} />
        </span>
        {cuantos > 0 && <em className="social-chip-red-cuantos">{cuantos}</em>}
      </span>

      <button
        type="button"
        onClick={() => !soloUno && setAbierto((v) => !v)}
        className={`social-chip-red-formato ${soloUno ? 'fijo' : ''}`}
        title={`${cuenta.nombre} · ${actualVisible.nombre}`}
      >
        <IconoFormato size={13} />
        <span className="social-chip-red-formato-texto">
          <strong>{actualVisible.nombre.toUpperCase()}</strong>
          <em>{cuenta.nombre}</em>
        </span>
        {/*
          Sin flecha cuando hay un solo formato posible.

          Una flecha que abre un menú de una opción es una promesa que no se
          cumple: el que la aprieta espera poder elegir.
        */}
        {!soloUno && <ChevronDown size={13} />}
      </button>

      {abierto && (
        <>
          {/*
            La capa que cierra al hacer clic afuera.

            Sin esto el menú queda abierto hasta que elijas algo, y si te
            arrepentiste no hay forma de salir sin cambiar el formato.
          */}
          <button
            type="button"
            className="social-chip-red-fuera"
            aria-label="Cerrar"
            onClick={() => setAbierto(false)}
          />

          <div className="social-chip-red-menu">
            {opciones.map((opcion) => {
              const IconoOpcion = opcion.icono;
              const esGrupos = opcion.clave === 'grupos';
              const elegida = esGrupos
                ? gruposActivos
                : !gruposActivos && opcion.clave === actual.clave;

              return (
                <button
                  key={opcion.clave}
                  type="button"
                  onClick={() => {
                    if (esGrupos) onElegirGrupos();
                    else onCambiar(opcion.clave);
                    setAbierto(false);
                  }}
                  className={`social-chip-red-opcion ${elegida ? 'elegida' : ''}`}
                >
                  <IconoOpcion size={18} />
                  <span>
                    <strong>{opcion.nombre}</strong>
                    <em>{opcion.queEspera}</em>
                  </span>
                  {elegida && <Check size={15} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Cómo se va a ver, en el teléfono o en la computadora.
 *
 * ── Por qué el aviso de abajo ──────────────────────────────────────────────
 *
 * Es el mismo que pone Metricool, y no es humildad: una vista previa que
 * promete exactitud genera un reclamo cada vez que Facebook recorta una
 * imagen distinto. Decir que es una aproximación, una vez, evita esa
 * conversación para siempre.
 */
function VistaPreviaRed({ red, formato = 'post', texto, media, identidad, avatar, dispositivo }) {
  const esInstagram = red === 'instagram';
  const esReel = formato === 'reel';
  const esHistoria = formato === 'historia';
  const esCarrusel = formato === 'carrusel';

  const hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
  const foto = media[0];
  const origen = foto?.url || foto?.ruta || '';
  const esVideo = String(foto?.mime || '').startsWith('video/');

  const avatarVisual = (
    <span className="social-previa-avatar">
      {avatar ? (
        <img src={avatar} alt="" />
      ) : (
        <em>{identidad?.replace(/^@/, '').slice(0, 2).toUpperCase() || 'MS'}</em>
      )}
    </span>
  );

  const contenidoVisual = (clase = '') => (
    <div className={`social-previa-media social-previa-media-${clase}`}>
      {origen ? (
        esVideo ? (
          <video src={origen} muted playsInline controls={false} />
        ) : (
          <img src={origen} alt="" />
        )
      ) : (
        <span>
          {esReel
            ? 'Video no disponible'
            : esHistoria
              ? 'Imagen o video no disponible'
              : esCarrusel
                ? 'Agregá entre 2 y 10 imágenes o videos'
                : 'Agregá una imagen o un video'}
        </span>
      )}
    </div>
  );

  if (esHistoria) {
    return (
      <div className={`social-previa-vertical historia ${dispositivo}`}>
        {contenidoVisual('vertical')}
        <div className="social-previa-historia-progreso">
          <span />
        </div>
        <div className="social-previa-historia-cabecera">
          {avatarVisual}
          <strong>{identidad || 'Modo Sabor'}</strong>
          <em>Ahora</em>
          <b>•••</b>
        </div>
        {texto.trim() && <p className="social-previa-vertical-texto">{texto}</p>}
        <div className="social-previa-historia-pie">
          <span>Enviar mensaje</span>
          <Heart size={25} />
          <Send size={25} />
        </div>
      </div>
    );
  }

  if (esReel) {
    return (
      <div className={`social-previa-vertical reel ${dispositivo}`}>
        {contenidoVisual('vertical')}
        <div className="social-previa-reel-acciones">
          <span>
            <Heart size={27} />
            <em>0</em>
          </span>
          <span>
            <MessageCircle size={27} />
            <em>0</em>
          </span>
          <span>
            <Send size={27} />
            <em>0</em>
          </span>
          <span>
            <b>•••</b>
          </span>
        </div>
        <div className="social-previa-reel-pie">
          <div>
            {avatarVisual}
            <strong>{identidad || 'Modo Sabor'}</strong>
            <button type="button">Seguir</button>
          </div>
          {texto.trim() && <p>{texto.length > 90 ? `${texto.slice(0, 90)}…` : texto}</p>}
          <span>
            <Music2 size={15} /> Audio original
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`social-previa-tarjeta ${dispositivo} ${esInstagram ? 'instagram' : 'facebook'}`}
    >
      <div className="social-previa-cabecera">
        {/*
          La foto de perfil de verdad.

          Acá había un círculo rojo con dos letras. La vista previa existe para
          contestar "¿cómo va a salir esto?", y en Facebook ahí va la foto de
          la página: con las iniciales, la respuesta era que no.

          Sin marca de red encima —a diferencia del chip— porque la tarjeta ya
          está imitando a esa red entera: repetir el logo sería ruido que en la
          publicación real no está.
        */}
        {avatarVisual}
        <span className="social-previa-quien">
          <strong>{identidad || 'Modo Sabor'}</strong>
          <em>{esInstagram ? 'Ahora' : `${hoy} · 🌎`}</em>
        </span>
        <span className="social-previa-puntos">•••</span>
      </div>

      {(foto || esCarrusel) && contenidoVisual(esCarrusel ? 'carrusel' : 'post')}
      {esCarrusel && (
        <>
          <span className="social-previa-carrusel-contador">1/{Math.max(media.length, 2)}</span>
          <div className="social-previa-carrusel-puntos">
            {Array.from({ length: Math.max(Math.min(media.length, 10), 2) }).map((_, indice) => (
              <i key={indice} className={indice === 0 ? 'activo' : ''} />
            ))}
          </div>
        </>
      )}

      {texto.trim() ? (
        <p className="social-previa-texto">
          {/*
            Instagram corta el pie a dos líneas y esconde el resto detrás de
            «más». Mostrarlo entero acá haría creer que se lee todo, y el
            primer renglón es el que decide si alguien sigue leyendo.
          */}
          {esInstagram && texto.length > 125 ? (
            <>
              {texto.slice(0, 125)}
              <span className="social-previa-mas">… más</span>
            </>
          ) : (
            texto
          )}
        </p>
      ) : (
        <p className="social-previa-texto vacio">Tu publicación aparecerá acá…</p>
      )}

      <div className="social-previa-acciones">
        {esInstagram ? (
          <>
            <span>
              <Heart size={22} />
            </span>
            <span>
              <MessageCircle size={22} />
            </span>
            <span>
              <Send size={22} />
            </span>
            <span className="social-previa-guardar">
              <Bookmark size={22} />
            </span>
          </>
        ) : (
          <>
            <span>
              <ThumbsUp size={17} /> Me gusta
            </span>
            <span>
              <MessageCircle size={17} /> Comentar
            </span>
            <span>
              <Share2 size={17} /> Compartir
            </span>
          </>
        )}
      </div>
      {esInstagram && <Grid3X3 className="social-previa-grid" size={17} />}
    </div>
  );
}

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
  destinosRevision,
  errorAlGuardar,
  onCancelar,
  identidades,
  onIrADestinos,
}) {
  const [masOpciones, setMasOpciones] = useState(false);
  const [mostrarNotas, setMostrarNotas] = useState(Boolean(draft.nombre));
  const [accionPendiente, setAccionPendiente] = useState('');
  const disparadorAccion = useRef(null);

  const elegidos = useMemo(
    () => destinos.filter((d) => draft.destinoIds.includes(d.id)),
    [destinos, draft.destinoIds]
  );

  /*
    `redes` va en useMemo porque abajo lo usa otro useMemo como dependencia.

    Un array nuevo en cada render hace que el useMemo de al lado se recalcule
    siempre, que es exactamente lo contrario de para qué está. Lo marcó eslint
    y tenía razón.
  */
  const redes = useMemo(() => [...new Set(elegidos.map(redDelDestino))], [elegidos]);

  /*
    Las redes que existen, tengas o no destinos elegidos.

    Sale de todos los destinos disponibles, no de los elegidos: son las cuentas
    conectadas. Si tenés Instagram conectado, el chip de Instagram tiene que
    estar aunque todavía no hayas tildado nada — es lo que te dice que podés
    publicar ahí.
  */
  const cuentasDisponibles = useMemo(() => {
    /*
      ── Una cuenta por identidad, no una por red ──────────────────────────

      Estaba mal agrupado. Yo juntaba todo Facebook en un chip, y vos tenés
      **dos cuentas de Facebook**: el Perfil, con 28 grupos, y la Fan Page.
      Fusionadas en un chip no había forma de decir "esto va por la Fan Page y
      no por mi perfil personal" — que es justamente la decisión más
      importante de la pantalla.

      Metricool muestra un chip por cuenta conectada. Es lo correcto: son
      cuentas distintas, con permisos distintos y formatos distintos.
    */
    const porIdentidad = new Map();

    for (const destino of destinos) {
      const red = redDelDestino(destino);

      /*
        Los grupos y el perfil comparten identidad: son todos "el Perfil".
        La Fan Page es otra. Instagram es otra más.
      */
      const clave = `${destino.cuenta_id}|${red}`;
      if (porIdentidad.has(clave)) continue;

      const identidad = (identidades || []).find((i) => i.id === destino.cuenta_id);

      porIdentidad.set(clave, {
        clave,
        red,
        cuentaId: destino.cuenta_id,
        tipos: [destino.tipo],
        /*
          El tipo de destino más capaz de esa cuenta.

          Una identidad puede tener grupos (sólo posteo) y la página (posteo,
          reel, historia). El chip tiene que ofrecer lo que la cuenta puede
          hacer en su mejor caso, no el mínimo común.
        */
        tipoDestino: red === 'instagram' ? 'instagram_feed' : destino.tipo,
        nombre:
          red === 'instagram' ? destino.nombre : identidad?.nombre || destino.nombre || 'Facebook',
        avatar: destino.avatar || null,
      });
    }

    /*
      Se mejora el tipo si la misma cuenta tiene un destino más capaz.
      La Fan Page tiene grupos Y la página: el chip debe permitir reels.
    */
    for (const destino of destinos) {
      const clave = `${destino.cuenta_id}|${redDelDestino(destino)}`;
      const cuenta = porIdentidad.get(clave);
      if (!cuenta) continue;

      if (!cuenta.tipos.includes(destino.tipo)) cuenta.tipos.push(destino.tipo);

      const capacidad = (tipo) => FORMATOS_UI.filter((f) => f.destinos.includes(tipo)).length;
      if (capacidad(destino.tipo) > capacidad(cuenta.tipoDestino)) {
        cuenta.tipoDestino = destino.tipo;
      }

      /*
        La foto sale del destino que la tenga.

        Los grupos no tienen foto de perfil y suelen venir primero en la lista
        —están ordenados por nombre—, así que el primer destino de la Fan Page
        que aparece es casi siempre un grupo. La foto está en el destino de la
        página, que puede venir mucho después.
      */
      if (!cuenta.avatar && destino.avatar) cuenta.avatar = destino.avatar;
    }

    /* Facebook antes que Instagram: es donde más se publica. */
    return [...porIdentidad.values()].sort((a, b) =>
      a.red === b.red ? 0 : a.red === 'facebook' ? -1 : 1
    );
  }, [destinos, identidades]);

  /* Qué cuenta y qué dispositivo se está viendo en la previa. */
  const [previaCuentaElegida, setPreviaCuenta] = useState('');
  const [previaDispositivo, setPreviaDispositivo] = useState('telefono');
  const [emojisAbiertos, setEmojisAbiertos] = useState(false);
  const [redEdicionElegida, setRedEdicion] = useState('facebook');
  const [filtroCuentaGrupos, setFiltroCuentaGrupos] = useState(null);
  const bloqueDestinos = useRef(null);

  const destinosVisibles = filtroCuentaGrupos
    ? destinos.filter(
        (destino) => destino.cuenta_id === filtroCuentaGrupos && destino.tipo === 'facebook_group'
      )
    : destinos;

  const cuentaFiltrada = cuentasDisponibles.find(
    (cuenta) => cuenta.cuentaId === filtroCuentaGrupos
  );

  const mostrarGruposDe = (cuentaId) => {
    setFiltroCuentaGrupos(cuentaId);
    requestAnimationFrame(() =>
      bloqueDestinos.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    );
  };

  const edicionPorRed = Boolean(draft.personalizaciones?.editar_por_red);
  const redesDeEdicion = [...new Set(cuentasDisponibles.map((cuenta) => cuenta.red))];
  const redEdicion = redesDeEdicion.includes(redEdicionElegida)
    ? redEdicionElegida
    : redesDeEdicion[0] || 'facebook';

  const textoDeRed = (red) => {
    if (!edicionPorRed) return draft.texto;
    return draft.personalizaciones?.textos_por_red?.[red] ?? draft.texto;
  };

  const textoEditable = textoDeRed(redEdicion);

  const actualizarTexto = (texto) =>
    setDraft((actual) =>
      edicionPorRed
        ? {
            ...actual,
            personalizaciones: {
              ...actual.personalizaciones,
              textos_por_red: {
                ...(actual.personalizaciones?.textos_por_red || {}),
                [redEdicion]: texto,
              },
            },
          }
        : { ...actual, texto }
    );

  const alternarEdicionPorRed = () => {
    setDraft((actual) => {
      const estabaActiva = Boolean(actual.personalizaciones?.editar_por_red);
      const textosActuales = actual.personalizaciones?.textos_por_red || {};

      if (estabaActiva) {
        return {
          ...actual,
          texto: textosActuales[redEdicion] ?? actual.texto,
          personalizaciones: { ...actual.personalizaciones, editar_por_red: false },
        };
      }

      return {
        ...actual,
        personalizaciones: {
          ...actual.personalizaciones,
          editar_por_red: true,
          textos_por_red: Object.fromEntries(
            redesDeEdicion.map((red) => [red, textosActuales[red] ?? actual.texto])
          ),
        },
      };
    });
  };

  /*
    Mete algo en el texto donde está el cursor.

    ── Por qué no se pega al final ────────────────────────────────────────

    Pegar al final es más simple y está mal: si estás escribiendo el segundo
    renglón y tocás un emoji, aparece cinco líneas abajo y hay que ir a
    buscarlo con el mouse.

    Lo que se inserta reemplaza lo que esté seleccionado, como en cualquier
    editor. Y el cursor queda **después** de lo insertado, así podés seguir
    escribiendo sin tocar nada.
  */
  const caja = useRef(null);

  const insertarEnElTexto = (texto) => {
    const campo = caja.current;

    if (!campo) {
      actualizarTexto(textoEditable + texto);
      return;
    }

    const desde = campo.selectionStart ?? campo.value.length;
    const hasta = campo.selectionEnd ?? desde;

    actualizarTexto(textoEditable.slice(0, desde) + texto + textoEditable.slice(hasta));

    /*
      El cursor se recoloca después de que React redibuje.

      Sin el requestAnimationFrame se movería sobre el texto viejo y saltaría
      al final apenas cambie el valor.
    */
    requestAnimationFrame(() => {
      campo.focus();
      campo.setSelectionRange(desde + texto.length, desde + texto.length);
    });
  };

  /*
    Si la red elegida ya no está entre los destinos, se cae en la primera.

    Pasa al sacar el único destino de Instagram: sin esto la previa queda
    pidiendo una red que ya no existe y se dibuja vacía.
  */
  const cuentasElegidas = useMemo(
    () =>
      cuentasDisponibles.filter((cuenta) =>
        elegidos.some(
          (destino) =>
            destino.cuenta_id === cuenta.cuentaId && redDelDestino(destino) === cuenta.red
        )
      ),
    [cuentasDisponibles, elegidos]
  );

  const cuentaDeLaPrevia =
    cuentasElegidas.find((cuenta) => cuenta.clave === previaCuentaElegida) ||
    cuentasElegidas[0] ||
    null;
  const previaRed = cuentaDeLaPrevia?.red;

  /*
    El problema de formato se busca cuenta por cuenta.

    Antes había un solo formato y un solo chequeo. Ahora que cada red tiene el
    suyo, el aviso tiene que decir **cuál** de las dos está mal: "el carrusel
    existe sólo en Instagram" no ayuda si no sabés que lo elegiste en Facebook.
  */
  const problemaDeFormato = useMemo(() => {
    for (const cuenta of cuentasElegidas) {
      const clave = formatoDeCuenta(draft, cuenta);
      const formato = FORMATOS_UI.find((f) => f.clave === clave);
      if (!formato) continue;

      const deEsaCuenta = elegidos.filter(
        (d) => d.cuenta_id === cuenta.cuentaId && redDelDestino(d) === cuenta.red
      );
      const motivo = porQueNoEsteFormato(formato, deEsaCuenta);
      if (motivo) return motivo;
    }
    return '';
  }, [cuentasElegidas, elegidos, draft]);

  /* El nombre de la identidad, para la cabecera. */
  const identidadPrincipal = elegidos[0]?.cuenta_nombre || elegidos[0]?.nombre || '';

  /*
    La cuenta que se está previsualizando, que no siempre es la primera.

    La cabecera muestra "con qué identidad" en general; la vista previa muestra
    **una red a la vez**. Si publicás en la Fan Page y en Instagram, la previa
    de Instagram tiene que decir @modosaborok con la foto de Instagram, no el
    nombre de la Fan Page porque quedó primera en la lista.
  */
  /*
    No se deja publicar con un formato que los destinos elegidos no aceptan.

    El servidor lo rechazaría igual, pero recién al guardar. Frenarlo acá
    convierte un error en una explicación.
  */
  const todosLosTextosListos = redes.length
    ? redes.every((red) => textoDeRed(red).trim() || draft.mediaIds.length)
    : draft.texto.trim() || draft.mediaIds.length;

  const puedePublicar = todosLosTextosListos && destinosElegidos && !problemaDeFormato;
  const puedeGuardarBorrador = Boolean(todosLosTextosListos);
  const revision = useMemo(
    () =>
      resumenDeRevision(
        { ...draft, destinoIds: destinosRevision.map((item) => item.id) },
        destinosRevision,
        media
      ),
    [draft, destinosRevision, media]
  );
  const cerrarRevision = () => {
    setAccionPendiente('');
    requestAnimationFrame(() => disparadorAccion.current?.focus());
  };
  const pedirConfirmacion = (accion, evento) => {
    disparadorAccion.current = evento.currentTarget;
    setAccionPendiente(accion);
  };

  return (
    <div className="social-compositor">
      {/* ── Cabecera: con qué identidad ─────────────────────────────────── */}
      <div className="social-comp-cabecera">
        <div className="social-comp-titulo">
          <h2>Crear nueva publicación</h2>
          <p>Prepará el contenido una vez y adaptalo para cada red.</p>
        </div>
        {identidadPrincipal && (
          <span className="social-comp-identidad">
            <FotoDeCuenta
              foto={cuentasDisponibles.find((c) => c.cuentaId === elegidos[0]?.cuenta_id)?.avatar}
              nombre={identidadPrincipal}
              red={redDelDestino(elegidos[0] || {})}
              size={26}
            />
            {identidadPrincipal}
          </span>
        )}
      </div>

      {/*
        ── Los chips de red, con su formato ──────────────────────────────

        Es la fila de arriba del compositor de Metricool. Cada red tiene su
        propio selector, y por eso hubo que separar el formato por cuenta en la
        base antes de poder dibujar esto: si el formato fuera uno solo, cambiar
        el de Instagram le cambiaría el de Facebook y el chip de al lado
        mentiría.
      */}
      <div className="social-comp-formatos">
        {/*
          ── Las redes van siempre, no sólo cuando hay destinos ─────────────

          Estaba al revés. Los chips aparecían recién después de elegir un
          grupo abajo, así que la primera vez que abrís el compositor no se ve
          ninguna red y no hay forma de saber que se puede elegir el formato.

          En Metricool las redes están arriba desde el principio porque son las
          cuentas que tenés conectadas: primero decidís **en qué red** y **en
          qué formato**, y recién después a qué grupos concretos.

          La red que no tiene destinos elegidos se muestra apagada. Que se vea
          apagada dice algo —"esto existe pero no va a salir"—; que no se vea
          no dice nada.
        */}
        {cuentasDisponibles.map((cuenta) => {
          const suyos = elegidos.filter(
            (d) => d.cuenta_id === cuenta.cuentaId && redDelDestino(d) === cuenta.red
          );

          return (
            <ChipDeRed
              key={cuenta.clave}
              cuenta={cuenta}
              activa={suyos.length > 0}
              cuantos={suyos.length}
              gruposActivos={filtroCuentaGrupos === cuenta.cuentaId}
              formato={formatoDeCuenta(draft, cuenta)}
              onElegirGrupos={() => {
                setPreviaCuenta(cuenta.clave);
                mostrarGruposDe(cuenta.cuentaId);
              }}
              onCambiar={(clave) => {
                setFiltroCuentaGrupos(null);
                setPreviaCuenta(cuenta.clave);
                setDraft((actual) => ({
                  ...actual,
                  formatos: { ...(actual.formatos || {}), [cuenta.clave]: clave },
                }));
              }}
            />
          );
        })}

        <button
          type="button"
          className="social-comp-agregar-red"
          onClick={onIrADestinos}
          title="Conectar o administrar cuentas"
          aria-label="Conectar otra cuenta"
        >
          <span>+</span>
          <em>Conectar cuenta</em>
        </button>

        <span className="social-comp-separador" />

        <button
          type="button"
          className={`social-comp-notas ${mostrarNotas ? 'activo' : ''}`}
          onClick={() => setMostrarNotas((valor) => !valor)}
          title="Agregar un nombre interno para encontrar la campaña"
        >
          <FileText size={14} /> Notas
        </button>

        {/*
          Editar por red social.

          Cuando está prendido, cada red tiene su propio texto: en Instagram
          ponés los hashtags y en Facebook el link, que es lo que conviene en
          cada una. Apagado, el mismo texto va a todas — que es lo que se
          quiere el 90% de las veces y por eso viene apagado.
        */}
        <button
          type="button"
          onClick={alternarEdicionPorRed}
          className={`social-comp-porred ${edicionPorRed ? 'activo' : ''}`}
          title="Escribir un texto distinto para cada red"
        >
          <PenSquare size={13} /> EDITAR POR RED SOCIAL
        </button>
      </div>

      {problemaDeFormato && (
        <p className="social-comp-formato-aviso">
          <AlertTriangle size={14} />
          {problemaDeFormato}
        </p>
      )}

      {/*
        Los requisitos, uno por cuenta y no uno solo.

        Antes había un formato único y por eso un solo bloque. Ahora que
        Facebook puede ir como posteo e Instagram como reel, los requisitos son
        distintos: 90 segundos allá, 60 acá. Un bloque solo mostraría los de
        una y callaría los de la otra.

        Se muestran únicamente los formatos que tienen algo que advertir: el
        posteo común no necesita instrucciones.
      */}
      {!problemaDeFormato &&
        cuentasElegidas
          .map((cuenta) => ({
            cuenta,
            formato: FORMATOS_UI.find((f) => f.clave === formatoDeCuenta(draft, cuenta)),
          }))
          .filter(({ formato }) => formato?.requisitos.length)
          .map(({ cuenta, formato }) => (
            <div key={cuenta.clave} className="social-comp-requisitos">
              <Info size={14} />
              <div>
                <strong>
                  {cuenta.nombre} · {formato.nombre}:
                </strong>{' '}
                {formato.ayuda}
                <ul>
                  {formato.requisitos.map((requisito) => (
                    <li key={requisito}>{requisito}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}

      <div className="social-comp-cuerpo">
        {/* ── Izquierda: escribir ───────────────────────────────────────── */}
        <div className="social-comp-editor">
          {mostrarNotas && (
            <label className="social-comp-nota-interna">
              <span>Nombre interno</span>
              <input
                value={draft.nombre}
                onChange={(e) => setDraft({ ...draft, nombre: e.target.value })}
                placeholder="Ej.: Promo de lomitos del viernes"
                className="social-comp-nombre"
              />
              <em>No se publica; sirve para encontrarla en campañas y calendario.</em>
            </label>
          )}

          {edicionPorRed && redesDeEdicion.length > 0 && (
            <div className="social-comp-edicion-redes" role="tablist" aria-label="Texto por red">
              {redesDeEdicion.map((red) => (
                <button
                  key={red}
                  type="button"
                  role="tab"
                  aria-selected={redEdicion === red}
                  onClick={() => setRedEdicion(red)}
                  className={redEdicion === red ? 'activo' : ''}
                >
                  <MarcaDeIdentidad tipo={red} size={19} />
                  {LIMITES_DE_RED[red].nombre}
                </button>
              ))}
              <span>Estás editando sólo esta red</span>
            </div>
          )}

          <textarea
            ref={caja}
            value={textoEditable}
            onChange={(e) => actualizarTexto(e.target.value)}
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

            {/*
              ── Emojis y hashtags, como en Metricool ──────────────────────

              Los dos hacen lo mismo: meten algo en el texto donde está el
              cursor. Sin eso habría que salir a buscar el emoji en otro lado y
              volver, que es exactamente lo que nadie hace — y por eso las
              publicaciones terminan sin ninguno.
            */}
            <button
              type="button"
              className={`social-comp-icono ${emojisAbiertos ? 'activo' : ''}`}
              title="Emojis"
              onClick={() => setEmojisAbiertos((v) => !v)}
            >
              <Smile size={17} />
            </button>

            <button
              type="button"
              className="social-comp-icono"
              title="Agregar un hashtag"
              onClick={() => insertarEnElTexto('#')}
            >
              <Hash size={17} />
            </button>

            {/*
              ── Los atajos que faltaban ──────────────────────────────────

              Ubicación y link son los dos datos que más se repiten en una
              promo de local y los que más se olvidan. Tenerlos a un clic con
              el dato del negocio ya puesto es la diferencia entre ponerlos
              siempre y ponerlos cuando uno se acuerda.
            */}
            <button
              type="button"
              className="social-comp-icono"
              title="Agregar la dirección del local"
              onClick={() => insertarEnElTexto('\n📍 ')}
            >
              <MapPin size={17} />
            </button>

            <button
              type="button"
              className="social-comp-icono"
              title="Agregar un link"
              onClick={() => insertarEnElTexto('\n🔗 https://')}
            >
              <Link2 size={17} />
            </button>

            <button
              type="button"
              className="social-comp-icono"
              title="Agregar el horario"
              onClick={() => insertarEnElTexto('\n🕐 ')}
            >
              <Clock size={17} />
            </button>

            <span className="social-comp-contador">
              {draft.mediaIds.length > 0 && (
                <span className="social-comp-adjuntos">
                  {draft.mediaIds.length} adjunto{draft.mediaIds.length > 1 ? 's' : ''}
                </span>
              )}

              {/*
                ── Un contador por red, no uno solo ─────────────────────────

                Facebook tolera 60.000 caracteres e Instagram 2.200. Un número
                suelto —"1.847"— no dice nada: hay que saber contra qué tope se
                compara, y el tope depende de dónde estés publicando.

                Se muestra en rojo cuando se pasa, porque pasarse no da error
                al escribir: da error media hora después, cuando le toca salir.
              */}
              {redes.map((red) => {
                const tope = LIMITES_DE_RED[red].tope;
                const Icono = LIMITES_DE_RED[red].icono;
                const cantidad = textoDeRed(red).length;
                const pasado = cantidad > tope;

                return (
                  <span
                    key={red}
                    className={`social-comp-cuenta-red ${pasado ? 'pasado' : ''}`}
                    title={`${LIMITES_DE_RED[red].nombre}: hasta ${tope.toLocaleString('es-AR')} caracteres`}
                  >
                    <Icono size={12} />
                    {cantidad.toLocaleString('es-AR')}/{tope.toLocaleString('es-AR')}
                  </span>
                );
              })}

              {!redes.length && textoEditable.length}
            </span>
          </div>

          {/*
            Los emojis que de verdad se usan en un local de comida.

            Un selector completo tiene mil ochocientos y hace falta buscarlo.
            Estos son los veinte que aparecen en cualquier promo de comida, a
            un clic. Si alguien quiere otro, el teclado del sistema sigue
            estando.
          */}
          {emojisAbiertos && <SelectorDeEmojis onElegir={(emoji) => insertarEnElTexto(emoji)} />}

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

              {/*
                ── El modo seguro, ahora visible ──────────────────────────────

                Esto ya existía y estaba **prendido y escondido**: la casilla no
                estaba en ninguna pantalla, así que cualquier intento de
                publicar en más de un lugar moría con un cartel rojo que decía
                "Modo de prueba: elegí un único destino" y no aclaraba qué era
                el modo de prueba ni dónde se apagaba.

                Un seguro sin manija no es un seguro: es una pared.

                Se queda —la primera publicación real conviene que vaya a un
                solo lado— pero ahora se ve, se explica y se puede apagar. Y se
                apaga solo después de la primera que sale bien: pasada esa, las
                rueditas de atrás molestan.
              */}
              <label
                className={`social-comp-seguro ${draft.personalizaciones?.modo_prueba ? 'activo' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={Boolean(draft.personalizaciones?.modo_prueba)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      personalizaciones: {
                        ...draft.personalizaciones,
                        modo_prueba: e.target.checked,
                      },
                    })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  <strong>
                    <ShieldCheck size={14} /> Modo seguro: un solo destino
                  </strong>
                  <em>
                    {draft.personalizaciones?.modo_prueba
                      ? 'No te deja publicar en más de un lugar a la vez. Sirve para la primera vez: si algo sale mal, sale mal en un solo lado. Destildalo para publicar en varios.'
                      : 'Apagado. Podés publicar en todos los destinos que elijas de una sola vez.'}
                  </em>
                </span>
              </label>
            </div>
          )}

          {/*
            ── Configuración global y por red ────────────────────────────

            Los dos bloques plegables del compositor de Metricool.

            Van plegados porque son decisiones que se toman una vez y después
            se dejan: publicar solo o dejar en borrador, y el primer comentario
            de Instagram. Desplegados ocuparían la mitad del editor todos los
            días para algo que se toca una vez por mes.
          */}
          {/*
            La de Instagram sólo aparece si Instagram está entre los destinos.

            Mostrar la configuración de una red donde no vas a publicar es
            ofrecer una decisión que no existe.
          */}
          {redes.includes('instagram') && (
            <details className="social-comp-config">
              <summary>
                <Instagram size={15} className="text-pink-600" />
                Configuración de Instagram
              </summary>

              <div className="social-comp-campo">
                <span className="social-comp-etiqueta">Primer comentario</span>
                <textarea
                  rows={2}
                  value={draft.personalizaciones?.primer_comentario_instagram || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      personalizaciones: {
                        ...draft.personalizaciones,
                        primer_comentario_instagram: e.target.value,
                      },
                    })
                  }
                  placeholder="#monteros #delivery #comida"
                />
                {/*
                  Es donde va lo que no querés en el pie.

                  Los hashtags en el pie ensucian el texto y hacen que se corte
                  a las dos líneas antes de que se lea la promo. En el primer
                  comentario cuentan igual para Instagram y no molestan.
                */}
                <em className="social-comp-ayuda">
                  Los hashtags acá cuentan igual y no ensucian el pie.
                </em>
              </div>
            </details>
          )}

          {/* ── Adónde va ───────────────────────────────────────────────── */}
          <div className="social-comp-destinos" ref={bloqueDestinos}>
            <div className="social-comp-destinos-cabecera">
              <span className="social-comp-etiqueta">
                {filtroCuentaGrupos
                  ? `Grupos de ${cuentaFiltrada?.nombre || 'Facebook'}`
                  : 'Dónde se publica'}{' '}
                {destinosElegidos > 0 && (
                  <b className="text-red-600">
                    · {destinosElegidos} elegido{destinosElegidos > 1 ? 's' : ''}
                  </b>
                )}
              </span>

              {filtroCuentaGrupos && (
                <button type="button" onClick={() => setFiltroCuentaGrupos(null)}>
                  Ver todos los destinos
                </button>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {destinosVisibles.map((destino) => {
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

            {filtroCuentaGrupos && !destinosVisibles.length && (
              <p className="social-comp-destinos-vacio">
                Esta identidad todavía no tiene grupos sincronizados.
              </p>
            )}

            {!destinos.length && (
              <p className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <AlertTriangle size={13} className="flex-shrink-0" />
                Todavía no hay dónde publicar
              </p>
            )}
          </div>

          {/* ── Pie: cuándo y el botón ──────────────────────────────────── */}
          <div className="social-comp-pie">
            {/*
              Cancelar, a la izquierda y separado de todo.

              Está lejos del botón de publicar a propósito: son las dos
              acciones más distintas de la pantalla y la que borra no puede
              quedar al lado de la que manda. Metricool lo pone igual, en la
              esquina opuesta.

              Sólo aparece si hay algo escrito: un "Cancelar" sobre una
              pantalla vacía no cancela nada.
            */}
            {/*
              El `Boolean()` no es adorno: sin él aparece un «0» suelto.

              `draft.mediaIds.length` vale 0 cuando no hay archivos, y en
              JavaScript 0 es falso — así que la condición no muestra el botón,
              que es lo correcto. Pero React **imprime el 0** en vez de no
              dibujar nada, porque 0 es un valor válido para mostrar.

              El resultado era un cero gris flotando en la barra de abajo, sin
              explicación. Es el error de React más viejo que existe y lo acabo
              de cometer.
            */}
            {Boolean(draft.nombre || draft.texto || draft.mediaIds.length) && (
              <button type="button" onClick={onCancelar} className="social-comp-cancelar">
                Cancelar
              </button>
            )}

            {/*
              ── Los atajos de hora ────────────────────────────────────────

              Programar algo a mano es abrir un calendario, elegir el día,
              elegir la hora. Para "esta noche a las 20" —que es el 80% de lo
              que programa un local— son cinco clics.

              Los tres atajos cubren eso: hoy a la noche, mañana al mediodía,
              mañana a la noche. El calendario sigue estando para el resto.
            */}
            <div className="social-comp-atajos">
              {[
                ['Hoy 20:00', 0, 20],
                ['Mañana 12:00', 1, 12],
                ['Mañana 20:00', 1, 20],
              ].map(([texto, dias, hora]) => {
                const cuando = new Date();
                cuando.setDate(cuando.getDate() + dias);
                cuando.setHours(hora, 0, 0, 0);

                /*
                  El atajo que ya pasó no se ofrece.

                  A las 21 no tiene sentido "Hoy 20:00": programaría algo para
                  hace una hora, y el sistema lo mandaría de inmediato sin que
                  nadie lo haya pedido.
                */
                if (cuando <= new Date()) return null;

                const valor = new Date(cuando.getTime() - cuando.getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16);

                return (
                  <button
                    key={texto}
                    type="button"
                    onClick={() => setDraft({ ...draft, programadaPara: valor })}
                    className={`social-comp-atajo ${draft.programadaPara === valor ? 'activo' : ''}`}
                  >
                    {texto}
                  </button>
                );
              })}
            </div>

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
              ── El modo seguro avisa antes, no después ────────────────────

              Esto es lo que faltaba. El seguro existía, venía prendido y sólo
              se manifestaba como un cartel rojo al apretar Publicar — después
              de escribir todo, elegir los destinos y decidir la hora.

              Un límite que aparece recién cuando chocás contra él es una
              trampa. Este se ve mientras elegís, dice exactamente cuántos
              destinos hay de más, y trae la salida al lado: un botón que lo
              apaga. No hay que ir a buscar una casilla escondida en un
              engranaje.
            */}
            {!draft.ensayo &&
              draft.personalizaciones?.modo_prueba &&
              (draft.conjuntoIds.length > 0 || destinosElegidos > 1) && (
                <div className="social-comp-aviso-seguro">
                  <ShieldCheck size={15} />
                  <span>
                    <strong>El modo seguro deja publicar en un solo lugar</strong>
                    <em>
                      {draft.conjuntoIds.length
                        ? 'Y elegiste un conjunto, que son varios de una.'
                        : `Elegiste ${destinosElegidos}.`}
                    </em>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        personalizaciones: { ...draft.personalizaciones, modo_prueba: false },
                      })
                    }
                  >
                    Publicar en todos
                  </button>
                </div>
              )}

            {/*
              Un botón principal con desplegable, no tres botones sueltos.

              Con tres al lado, los tres se ven igual de importantes y hay que
              leerlos para saber cuál apretar. Así, la acción habitual está a un
              clic y las otras a dos, que es la proporción en que se usan.
            */}
            <div className="social-comp-acciones">
              <button
                type="button"
                disabled={enviando || !puedeGuardarBorrador}
                onClick={() => onGuardar('borrador')}
                className="social-comp-borrador"
              >
                <Save size={14} /> Guardar borrador
              </button>
              <button
                type="button"
                disabled={
                  enviando || !puedePublicar || !draft.programadaPara || !revision.puedePublicar
                }
                onClick={(evento) => pedirConfirmacion('programar', evento)}
                className="social-comp-programar"
              >
                <Clock size={14} /> Programar
              </button>
              <button
                type="button"
                disabled={enviando || !puedePublicar}
                onClick={(evento) => pedirConfirmacion('publicar', evento)}
                className={`social-comp-principal ${draft.ensayo ? 'ensayo' : ''}`}
              >
                <Play size={14} /> {draft.ensayo ? 'Correr ensayo' : 'Publicar ahora'}
              </button>
            </div>
          </div>

          {errorAlGuardar && (
            <p className="social-comp-error" role="alert">
              <AlertTriangle size={14} /> {errorAlGuardar}
            </p>
          )}

          {!puedePublicar && (
            <p className="social-comp-falta">
              {!todosLosTextosListos
                ? 'Falta el texto o una imagen.'
                : 'Falta elegir dónde se publica.'}
            </p>
          )}
        </div>

        {/* ── Derecha: cómo se va a ver ─────────────────────────────────── */}
        {/*
          ── La vista previa, como la de Metricool ────────────────────────

          Pestañas por red arriba a la izquierda, alternador teléfono/escritorio
          arriba a la derecha, y el aviso de que es una aproximación abajo.

          Ese aviso no es humildad: una vista previa que promete exactitud
          genera un reclamo cada vez que Facebook recorta una imagen distinto.
          Decirlo una vez evita esa conversación para siempre.
        */}
        <div className="social-comp-previa">
          <div className="social-previa-barra">
            <div className="social-previa-redes">
              {cuentasElegidas.map((cuenta) => {
                return (
                  <button
                    key={cuenta.clave}
                    type="button"
                    onClick={() => setPreviaCuenta(cuenta.clave)}
                    title={`${LIMITES_DE_RED[cuenta.red].nombre} · ${cuenta.nombre}`}
                    className={`social-previa-red ${cuentaDeLaPrevia?.clave === cuenta.clave ? 'activa' : ''}`}
                    style={
                      cuentaDeLaPrevia?.clave === cuenta.clave
                        ? { color: LIMITES_DE_RED[cuenta.red].color }
                        : undefined
                    }
                  >
                    <FotoDeCuenta
                      foto={cuenta.avatar}
                      nombre={cuenta.nombre}
                      red={cuenta.red}
                      size={24}
                    />
                  </button>
                );
              })}
            </div>

            <div className="social-previa-dispositivo">
              {[
                ['telefono', Smartphone, 'Teléfono'],
                ['escritorio', Monitor, 'Escritorio'],
              ].map(([id, Icono, texto]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreviaDispositivo(id)}
                  title={texto}
                  aria-label={texto}
                  className={previaDispositivo === id ? 'activo' : ''}
                >
                  <Icono size={15} />
                </button>
              ))}
            </div>
          </div>

          {cuentasElegidas.length ? (
            <VistaPreviaRed
              red={previaRed}
              formato={formatoDeCuenta(draft, cuentaDeLaPrevia)}
              texto={textoDeRed(previaRed)}
              media={(media || []).filter((m) => draft.mediaIds.includes(m.id))}
              identidad={cuentaDeLaPrevia?.nombre || identidadPrincipal}
              avatar={cuentaDeLaPrevia?.avatar || null}
              dispositivo={previaDispositivo}
            />
          ) : (
            <div className="social-previa-vacia">
              <MapPin size={24} />
              <p>Elegí dónde se publica para ver cómo va a quedar</p>
            </div>
          )}

          <p className="social-previa-aviso">
            <Info size={14} />
            Es una aproximación. El resultado final puede ser distinto.
          </p>
        </div>
      </div>

      <ActionDialog
        open={Boolean(accionPendiente)}
        title={accionPendiente === 'programar' ? 'Confirmar programación' : 'Confirmar publicación'}
        description="Revisá el contenido, los destinos y el momento antes de continuar."
        confirmLabel={accionPendiente === 'programar' ? 'Confirmar y programar' : 'Publicar ahora'}
        cancelLabel="Volver a editar"
        tone="primary"
        loading={enviando}
        onClose={cerrarRevision}
        onConfirm={() => {
          const accion = accionPendiente;
          cerrarRevision();
          onGuardar(accion);
        }}
      >
        <div className="social-revision">
          <p>
            <strong>Texto:</strong> {revision.texto || 'Sólo contenido multimedia'}
          </p>
          <p>
            <strong>Destinos:</strong> {revision.destinos.join(', ') || 'Ninguno'}
          </p>
          <p>
            <strong>Adjuntos:</strong> {revision.adjuntos.join(', ') || 'Ninguno'}
          </p>
          <p>
            <strong>Momento:</strong> {accionPendiente === 'programar' ? revision.momento : 'Ahora'}
          </p>
          {revision.alertas.length > 0 && (
            <ul>
              {revision.alertas.map((alerta) => (
                <li key={alerta}>{alerta}</li>
              ))}
            </ul>
          )}
        </div>
      </ActionDialog>
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
  /*
    Todo el día, no de 8 a 23.

    Recortar el rango parece prolijo hasta que alguien programa algo a las 7 de
    la mañana y no lo ve en ningún lado. La grilla arranca donde arranca el
    día; el scroll se posiciona solo en la hora actual, que es lo que hace que
    no moleste.
  */
  const PRIMERA_HORA = 0;
  const ULTIMA_HORA = 23;

  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(arranque);
    d.setDate(arranque.getDate() + i);
    return d;
  });

  const horas = Array.from({ length: ULTIMA_HORA - PRIMERA_HORA + 1 }, (_, i) => PRIMERA_HORA + i);

  /*
    ── Las «mejores horas», calculadas y no inventadas ───────────────────────

    Metricool pinta el fondo con las horas donde tu audiencia responde mejor.
    Ese dato sale de sus analíticas, que nosotros no tenemos: inventarlo sería
    pintar una decoración que parece información.

    Acá se calcula de lo único cierto que hay: **a qué horas publicaste vos y
    salió bien**. Con cero publicaciones no se pinta nada, y eso es correcto —
    todavía no hay nada que saber. Se va llenando solo a medida que publicás.
  */
  const calorPorHora = useMemo(() => {
    const conteo = new Map();
    let tope = 0;

    for (const campana of campanas) {
      if (campana.estado !== 'sent' && campana.estado !== 'published') continue;
      const cuando = new Date(String(campana.programada_para || '').replace(' ', 'T'));
      if (Number.isNaN(cuando.getTime())) continue;

      const clave = `${cuando.getDay()}|${cuando.getHours()}`;
      const nuevo = (conteo.get(clave) || 0) + 1;
      conteo.set(clave, nuevo);
      if (nuevo > tope) tope = nuevo;
    }

    return { conteo, tope };
  }, [campanas]);

  /* De 0 a 1, para poder usarlo como opacidad sin hacer cuentas en el JSX. */
  const calorDe = (dia, hora) => {
    if (!calorPorHora.tope) return 0;
    const veces = calorPorHora.conteo.get(`${dia.getDay()}|${hora}`) || 0;
    return veces / calorPorHora.tope;
  };

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
  const ahora = new Date();
  const horaAhora = ahora.getHours();

  /*
    El scroll arranca en la hora actual.

    Con las 24 horas en la grilla, abrir el calendario y ver las 3 de la
    mañana es abrir el calendario y tener que scrollear siempre. La hora
    actual es lo que uno viene a mirar.
  */
  const cuerpo = useRef(null);
  useEffect(() => {
    if (!cuerpo.current) return;
    const fila = cuerpo.current.querySelector('[data-hora-actual="si"]');
    /*
      `block: 'center'` y no `start`: deja ver un par de horas para atrás, que
      es donde está lo que acaba de salir.
    */
    fila?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div className="social-semana">
      <div className="social-semana-cabecera">
        <span className="social-semana-esquina" />
        {dias.map((dia) => {
          const finDeSemana = [0, 6].includes(dia.getDay());
          return (
            <div
              key={dia.toDateString()}
              className={`social-semana-dia ${dia.toDateString() === hoy ? 'es-hoy' : ''} ${
                finDeSemana ? 'es-finde' : ''
              }`}
            >
              {/*
                El día entero, no abreviado.

                "lun 17" ahorra cuatro letras y obliga a traducir mentalmente.
                En una columna de 200 píxeles entra "Lunes 17" sin apretar.
              */}
              <strong>
                {conMayusculaInicial(dia.toLocaleDateString('es-AR', { weekday: 'long' }))}
              </strong>
              <em>{dia.getDate()}</em>
            </div>
          );
        })}
      </div>

      <div className="social-semana-cuerpo" ref={cuerpo}>
        {horas.map((hora) => (
          <div
            key={hora}
            className="social-semana-fila"
            data-hora-actual={hora === horaAhora ? 'si' : 'no'}
          >
            <span className="social-semana-hora">{String(hora).padStart(2, '0')}:00</span>

            {dias.map((dia) => {
              const enEsta = porCelda.get(`${dia.toDateString()}|${hora}`) || [];
              const esHoy = dia.toDateString() === hoy;
              const calor = calorDe(dia, hora);

              return (
                <button
                  key={dia.toDateString() + hora}
                  type="button"
                  onClick={() => onMover?.(dia, hora)}
                  className={`social-semana-celda ${[0, 6].includes(dia.getDay()) ? 'es-finde' : ''}`}
                  title={
                    calor > 0
                      ? `${dia.toLocaleDateString('es-AR')} a las ${hora}:00 · solés publicar a esta hora`
                      : `${dia.toLocaleDateString('es-AR')} a las ${hora}:00`
                  }
                >
                  {/*
                    El fondo azul de las horas donde ya publicaste.

                    Va como capa aparte y no como `background` de la celda para
                    que el hover y el estado activo sigan funcionando encima sin
                    pelearse con la opacidad.
                  */}
                  {calor > 0 && (
                    <span
                      className="social-semana-calor"
                      style={{ opacity: 0.12 + calor * 0.45 }}
                      aria-hidden="true"
                    />
                  )}

                  {/* La línea de "ahora", sólo en la columna de hoy. */}
                  {esHoy && hora === horaAhora && (
                    <span
                      className="social-semana-ahora"
                      style={{ top: `${(ahora.getMinutes() / 60) * 100}%` }}
                      aria-hidden="true"
                    />
                  )}

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

      {/*
        Por qué el fondo está vacío, dicho una vez.

        Sin esto, alguien que vio Metricool va a preguntarse por qué acá no se
        pinta nada — y la respuesta no es que falte, es que todavía no hay de
        dónde sacarlo.
      */}
      {!calorPorHora.tope && (
        <p className="social-semana-nota">
          Las horas se van a ir pintando con las que más usás, a medida que publiques.
        </p>
      )}
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
        <p className="mt-1 text-sm text-slate-500">
          Publicá desde el servidor y mirá el alcance real de cada publicación.
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
            <p className="mt-3 text-xs text-amber-700">
              Mientras tanto, Facebook publica igual: sólo Instagram queda esperando.
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

  /*
    Los motivos conocidos, traducidos.

    Estaban escritos para el programa de escritorio: hablaban del puerto 9222,
    de "el acceso directo del Worker" y de cerrar todas las ventanas de Chrome.
    Nada de eso existe con la extensión, así que eran instrucciones que no sólo
    no ayudaban: mandaban a hacer algo imposible.
  */
  const explicar = (crudo) => {
    if (/checkpoint|verification|login|EXPIRED/i.test(crudo)) {
      return {
        titulo: 'Facebook pide que inicies sesión',
        comoSeArregla: 'Abrí Facebook en este mismo Chrome, entrá, y volvé a verificar.',
      };
    }
    if (/timeout|ETIMEDOUT|tard[óo] demasiado/i.test(crudo)) {
      return {
        titulo: 'Facebook tardó demasiado',
        comoSeArregla: 'Puede ser la conexión. Probá de nuevo en un minuto.',
      };
    }
    return {
      titulo: 'No se pudo verificar',
      comoSeArregla: 'Revisá que la extensión esté instalada y conectada.',
    };
  };

  if (!seProbo && !worker?.ultimo_heartbeat_en) {
    return (
      <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-slate-50 px-4 py-3">
        <Clock size={15} className="flex-shrink-0 text-slate-400" />
        <p className="text-sm text-slate-500">Todavía sin verificar</p>
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
      /*
        `Chrome` salió de la lista: era un chip que decía "Listo" siempre y no
        significaba nada para quien lo lee. Y los grupos ya se cuentan en el
        menú de la izquierda, identidad por identidad — repetirlos acá era
        ocupar lugar para decir lo mismo dos veces.

        Queda lo único que puede estar mal y que hay que mirar: la sesión.
      */
      ['Sesión de Facebook', resultado.facebook_session],
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
      <p className="mt-1.5 text-xs text-slate-400">
        Subirlos publica más rápido y aumenta el riesgo de bloqueo.
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
  const frenadasSolas = identidades.filter((i) => i.frenadaAutomaticamente);

  return (
    <div id="social-freno" className={`social-freno ${pausado ? 'social-freno--activo' : ''}`}>
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
          {/*
            La nota sólo aparece si está pausado.

            Cuando todo anda bien no hace falta explicar qué pasaría si lo
            frenaras: es una frase que ocupa lugar todos los días para el caso
            de un día. Cuando sí está frenado, ahí sí importa saber que nada se
            canceló — y el motivo, si alguien lo escribió.
          */}
          {pausado && (
            <p className="social-freno-nota">
              {motivo
                ? `${motivo} · La cola sigue esperando donde estaba.`
                : 'Nada se canceló: la cola sigue esperando donde estaba.'}
            </p>
          )}
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
          {identidades.map((identidad) => {
            const detenida = identidad.pausada || identidad.frenadaAutomaticamente;
            return (
              <div key={identidad.id} className="social-freno-identidad">
                <span className={`social-freno-punto ${detenida ? 'esta-pausada' : ''}`} />
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
                  onClick={() => onPausaIdentidad(identidad, !detenida)}
                >
                  {detenida ? 'Reanudar' : 'Pausar'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {frenadasSolas.length > 0 && (
        /*
          La pausa automática no escribe la columna `pausada`: es una decisión
          del motor basada en los fallos seguidos. Por eso se explica acá y se
          ofrece Reanudar, que también pone el contador en cero.
        */
        <p className="social-freno-aviso">
          <AlertTriangle size={13} />
          {frenadasSolas.map((i) => i.nombre).join(' y ')} se frenó automáticamente por fallos
          seguidos. Revisá la conexión y tocá Reanudar para volver a intentar.
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
