import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Heart,
  Inbox,
  Layers,
  LayoutDashboard,
  List,
  MessageCircle,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Shield,
  Star,
  StopCircle,
  Target,
  TrendingUp,
  Users,
  X,
  Image as ImageIcon,
  FileText,
  Paperclip,
  AlertTriangle,
  LayoutGrid,
  Smartphone,
  Trash2,
  Sparkles,
  ArrowLeft,
  Link as LinkIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api.js';
import {
  BRAND,
  DANGER,
  GRAY,
  INFO,
  PIE_COLORS,
  SUCCESS,
  WARNING,
  classNames,
  fmtDate,
  fmtDateShort,
  fmtNum,
  fmtWeekday,
} from './whatsappMasivo/whatsappMasivoUi.js';

// ── Utilidades ────────────────────────────────────────────────────────────

// ── Componentes UI base ───────────────────────────────────────────────────

function Card({ children, className, style }) {
  return (
    <div
      className={classNames(
        'bg-white rounded-2xl shadow-card border border-gray-200/60',
        className
      )}
      style={style}
    >
      {children}
    </div>
  );
}

function Badge({ children, variant = 'default', className }) {
  const styles = {
    default: 'bg-gray-100 text-gray-700',
    brand: 'bg-brand-50 text-brand-700',
    success: 'bg-success-50 text-success-700',
    warning: 'bg-warning-50 text-warning-700',
    danger: 'bg-danger-50 text-danger-700',
    info: 'bg-info-50 text-info-700',
  };
  return (
    <span
      className={classNames(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

function Button({ children, variant = 'primary', size = 'md', className, disabled, ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary:
      'bg-brand-500 text-white hover:bg-brand-600 shadow-md hover:shadow-lg active:scale-[0.98]',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200 active:scale-[0.98]',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 active:scale-[0.98]',
    outline:
      'border-2 border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]',
    danger:
      'bg-danger-500 text-white hover:bg-danger-600 shadow-md hover:shadow-lg active:scale-[0.98]',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
  };
  return (
    <button
      className={classNames(base, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * El cuadro de un indicador.
 *
 * ── Qué se cambió y por qué ────────────────────────────────────────────────
 *
 * Era correcto y estaba muerto: número negro, cuadradito pastel, borde gris.
 * Cuatro de estos en fila se leen como una planilla, y esta es la primera
 * pantalla que se mira todos los días.
 *
 * Tres cosas le dan vida sin ensuciar:
 *
 *  · Un halo del color del indicador atrás, arriba a la derecha. Se reconoce
 *    de qué habla la tarjeta de reojo, sin leer la etiqueta.
 *  · El número con degradado. Es el dato que importa y ahora pesa.
 *  · La tarjeta se levanta un poco al pasarle el mouse por encima.
 *
 * El color sigue siendo información, no decoración: cada indicador tiene el
 * suyo y no se repite.
 */
function StatCard({ label, value, icon: Icon, trend, color = BRAND, subtitle }) {
  return (
    <Card className="relative overflow-hidden p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-[0.13] blur-[2px]"
        style={{ backgroundColor: color }}
      />

      <div className="relative flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-sm font-medium text-gray-500">{label}</p>
          <p
            className="text-3xl font-extrabold tracking-tight tabular-nums"
            style={{
              backgroundImage: `linear-gradient(135deg, ${color}, ${color}99)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {fmtNum(value)}
          </p>
          {subtitle && <p className="mt-1 text-xs text-gray-400">{subtitle}</p>}
        </div>

        <div
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm"
          style={{
            backgroundImage: `linear-gradient(145deg, ${color}22, ${color}0d)`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,.7), 0 6px 16px -8px ${color}`,
          }}
        >
          <Icon size={20} style={{ color }} />
        </div>
      </div>

      {trend !== undefined && (
        <div className="relative mt-3 flex items-center gap-1.5">
          <span
            className={classNames(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              trend >= 0 ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
            )}
          >
            <TrendingUp size={12} className={trend >= 0 ? '' : 'rotate-180'} />
            {trend >= 0 ? '+' : ''}
            {trend}%
          </span>
          <span className="text-xs text-gray-400">vs. período anterior</span>
        </div>
      )}
    </Card>
  );
}

/**
 * El cartel de "acá no hay nada".
 *
 * El icono va adentro de un círculo con degradado en vez de suelto y gris.
 * Una pantalla vacía es la primera que ve alguien que recién empieza: si se
 * ve abandonada, el sistema parece roto antes de haberlo usado.
 *
 * `accion` permite ofrecer la salida ahí mismo — "no hay campañas" con el
 * botón de crear una al lado vale mucho más que la frase sola.
 */
/**
 * El diálogo de confirmación.
 *
 * ── Por qué no alcanza con window.confirm ──────────────────────────────────
 *
 * La caja gris del navegador no se puede escribir bien: no admite dar detalle,
 * ni distinguir lo grave de lo rutinario, ni poner el botón peligroso en rojo.
 * Y aparece pegada al borde de la pantalla, lejos de lo que estabas mirando.
 *
 * ── Qué tiene que decir una confirmación ───────────────────────────────────
 *
 * No "¿estás seguro?", que no informa nada y sólo agrega un click. Tiene que
 * contar **qué va a pasar y qué no se puede deshacer**. El script de Kimi lo
 * hace bien en un caso —al bajar fotos avisa "tarda varios minutos, los
 * perfiles con privacidad quedan sin foto"— y eso es lo que se copia acá.
 *
 * `peligro` pinta el botón de rojo. Se reserva para lo que no tiene vuelta
 * atrás: detener una campaña, volver a escribirle a alguien que pidió la baja,
 * desvincular el teléfono.
 */
function Confirmacion({
  abierto,
  titulo,
  detalle,
  textoOk = 'Confirmar',
  peligro,
  onOk,
  onCerrar,
}) {
  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclear = (e) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto, onCerrar]);

  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          /*
            Cerrar tocando el fondo, pero sólo si el click empezó ahí. Sin el
            chequeo de `currentTarget`, arrastrar el mouse desde adentro del
            diálogo hacia afuera lo cerraba y se perdía lo escrito.
          */
          onClick={(e) => {
            if (e.target === e.currentTarget) onCerrar();
          }}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex gap-4">
              <div
                className={classNames(
                  'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl',
                  peligro ? 'bg-danger-50 text-danger-600' : 'bg-warning-50 text-warning-600'
                )}
              >
                <AlertTriangle size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-gray-900">{titulo}</h3>
                {detalle && <p className="mt-2 text-sm leading-relaxed text-gray-600">{detalle}</p>}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button variant={peligro ? 'danger' : 'primary'} onClick={onOk}>
                {textoOk}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Pedir una confirmación desde cualquier lado sin armar estado a mano.
 *
 * Devuelve el diálogo ya listo para poner en la pantalla y una función
 * `pedir()` que recibe el texto y qué hacer si dice que sí. Sin esto, cada
 * pantalla que quiera confirmar algo necesita tres useState propios, y ahí es
 * donde se termina cayendo en el `window.confirm` de nuevo.
 */
function useConfirmacion() {
  const [estado, setEstado] = useState(null);

  const pedir = useCallback((opciones) => setEstado(opciones), []);
  const cerrar = useCallback(() => setEstado(null), []);

  const dialogo = (
    <Confirmacion
      abierto={Boolean(estado)}
      titulo={estado?.titulo || ''}
      detalle={estado?.detalle}
      textoOk={estado?.textoOk}
      peligro={estado?.peligro}
      onCerrar={cerrar}
      onOk={() => {
        const accion = estado?.onOk;
        cerrar();
        accion?.();
      }}
    />
  );

  return { dialogo, pedir };
}

function Empty({ children, icon: Icon, accion }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-gray-100 to-gray-50 shadow-inner ring-1 ring-gray-100">
          <Icon size={28} className="text-gray-400" />
        </div>
      )}
      <p className="max-w-xs text-sm leading-relaxed text-gray-500">{children}</p>
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-100/80 p-1 rounded-xl">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={classNames(
            'px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200',
            active === t.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Hook de datos principal ───────────────────────────────────────────────

function useData() {
  const [estado, setEstado] = useState({});
  const [contactos, setContactos] = useState([]);
  const [campanas, setCampanas] = useState([]);
  const [respuestas, setRespuestas] = useState([]);
  const [bajas, setBajas] = useState([]);
  const [segmentos, setSegmentos] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [config, setConfig] = useState({});
  const [salud, setSalud] = useState(null);
  const [planOperativo, setPlanOperativo] = useState(null);
  const [crm, setCrm] = useState([]);
  const [cierre, setCierre] = useState(null);
  const [recordatorios, setRecordatorios] = useState([]);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [e, c, ca, r, b, cf, sg, pl, sl, po, cr, ci, rec] = await Promise.allSettled([
        api.get('/whatsapp/estado'),
        api.get('/whatsapp/contactos?limite=200'),
        api.get('/whatsapp/campanas?limite=30'),
        api.get('/whatsapp/respuestas?limite=50'),
        api.get('/whatsapp/excluidos'),
        api.get('/whatsapp/config'),
        api.get('/whatsapp/segmentos'),
        api.get('/whatsapp/plantillas'),
        api.get('/whatsapp/salud-numero'),
        api.get('/whatsapp/plan-operativo'),
        api.get('/whatsapp/crm?limite=100'),
        api.get('/whatsapp/cierre-jornada'),
        api.get('/whatsapp/recordatorios?hecho=0'),
      ]);
      if (e.status === 'fulfilled') setEstado(e.value || {});
      if (c.status === 'fulfilled') setContactos(c.value?.items || []);
      if (ca.status === 'fulfilled') setCampanas(ca.value || []);
      if (r.status === 'fulfilled') setRespuestas(r.value || []);
      if (b.status === 'fulfilled') setBajas(b.value || []);
      if (cf.status === 'fulfilled') setConfig(cf.value || {});
      if (sg.status === 'fulfilled') setSegmentos(sg.value?.items || []);
      if (pl.status === 'fulfilled') setPlantillas(pl.value || []);
      if (sl.status === 'fulfilled') setSalud(sl.value || null);
      if (po.status === 'fulfilled') setPlanOperativo(po.value || null);
      if (cr.status === 'fulfilled') setCrm(cr.value?.items || []);
      if (ci.status === 'fulfilled') setCierre(ci.value || null);
      if (rec.status === 'fulfilled') setRecordatorios(rec.value?.items || []);
    } catch (err) {
      toast.error('No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const refrescar = useCallback(() => cargar(), [cargar]);

  return {
    estado,
    contactos,
    campanas,
    respuestas,
    bajas,
    segmentos,
    plantillas,
    config,
    salud,
    planOperativo,
    crm,
    cierre,
    recordatorios,
    loading,
    refrescar,
    setContactos,
    setCampanas,
    setCrm,
    setRecordatorios,
  };
}

// ── Vistas ────────────────────────────────────────────────────────────────

function Dashboard({ data, onNuevaCampana, onVerCRM, onVerPlan, onVerReportes }) {
  /*
    `respuestas` ya no se saca de acá. Era la lista limitada a 50 y su largo
    se mostraba como si fuera el total; el número de verdad viene en
    `salud.metricas.respuestas`, que lo cuenta el servidor.
  */
  const { estado, campanas, salud, planOperativo, cierre, recordatorios } = data;
  const whatsapp = estado.whatsapp || {};
  const hoy = estado.hoy || {};
  const conectado = whatsapp.estado === 'conectado';
  const enviadosTotal = campanas.reduce((t, c) => t + Number(c.enviados || 0), 0);

  /*
    Respuestas de campaña, no del WhatsApp del local.

    `respuestas` es la lista que se pide con `?limite=50`, así que su largo
    nunca puede pasar de 50: el tablero mostraba "50" y era el tope de la
    consulta, no un dato. El total de verdad lo calcula el servidor en
    /salud-numero, contando sólo a los que primero recibieron un envío.
  */
  const respuestasReales = Number(salud?.metricas?.respuestas ?? 0);
  const sinDatosSalud = !salud || salud.sinDatos === true || salud.score == null;

  const embudoData = useMemo(() => {
    if (cierre?.embudo && Object.keys(cierre.embudo).length > 0) {
      return Object.entries(cierre.embudo).map(([name, value], i) => ({
        name,
        value: Number(value),
        color: PIE_COLORS[i % PIE_COLORS.length],
      }));
    }

    const enviados = Number(cierre?.enviados ?? enviadosTotal);
    /*
      No se puede contestar un mensaje que nunca salió. Antes el embudo tomaba
      las respuestas por un lado y los envíos por otro, y dibujaba 101
      respuestas sobre 0 enviados. Se topea contra los envíos y listo.
    */
    const contestaron = Math.min(enviados, respuestasReales);

    return [
      { name: 'Enviados', value: enviados, color: BRAND },
      { name: 'Respuestas', value: contestaron, color: SUCCESS },
      { name: 'Sin respuesta', value: Math.max(0, enviados - contestaron), color: GRAY },
    ];
  }, [cierre, enviadosTotal, respuestasReales]);

  const hayEmbudo = embudoData.some((x) => x.value > 0);

  /*
    Antes esto armaba siete días con todo en cero y dejaba anotado que "en
    producción se pediría un endpoint de histórico". Nunca se pidió, así que
    el gráfico más grande del tablero era una línea plana que no leía nada:
    una decoración con forma de dato, que es peor que no tener gráfico.
  */
  const [historial, setHistorial] = useState([]);
  useEffect(() => {
    let vivo = true;
    api
      .get('/whatsapp/actividad?dias=7')
      .then((r) => {
        if (vivo) setHistorial(r?.items || []);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const historialData = useMemo(
    () =>
      historial.map((d) => ({
        dia: fmtWeekday(d.dia),
        enviados: d.enviados,
        respuestas: d.respuestas,
      })),
    [historial]
  );

  const huboActividad = historial.some((d) => d.enviados > 0 || d.respuestas > 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Enviados totales"
          value={enviadosTotal}
          icon={Send}
          color={BRAND}
          subtitle={`Hoy: ${fmtNum(hoy.enviados || 0)}`}
        />
        <StatCard
          label="Respuestas"
          value={respuestasReales}
          icon={MessageSquare}
          color={SUCCESS}
          subtitle="Últimos 7 días"
        />
        <StatCard label="Campañas" value={campanas.length} icon={Target} color={INFO} />
        <StatCard label="En cola" value={estado.pendientes || 0} icon={Layers} color={WARNING} />
      </div>

      {/* Salud + Gráfico + Plan */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Salud del número */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Shield size={16} className="text-brand-500" /> Salud del número
            </h3>
            {/*
              Sin envíos no hay nada que medir, y la etiqueta lo dice.

              Antes el ternario terminaba en "Crítico" para cualquier cosa que
              no fuera bajo o medio — incluido el caso de que no hubiera dato
              ninguno. Un número recién conectado aparecía en rojo.
            */}
            <Badge
              variant={
                sinDatosSalud
                  ? 'default'
                  : salud?.riesgo === 'bajo'
                    ? 'success'
                    : salud?.riesgo === 'medio'
                      ? 'warning'
                      : 'danger'
              }
            >
              {sinDatosSalud
                ? 'Sin datos'
                : salud?.riesgo === 'bajo'
                  ? 'Sano'
                  : salud?.riesgo === 'medio'
                    ? 'Atención'
                    : 'Crítico'}
            </Badge>
          </div>

          {sinDatosSalud ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Shield size={32} className="text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-700">Todavía no hay nada que medir</p>
              {/*
                Dos motivos distintos para el mismo cartel, y hay que
                distinguirlos: "no mandaste nada" y "mandaste antes de que
                existieran los recibos" no son lo mismo.

                Decir "no salió ningún mensaje" cuando sí salieron es
                exactamente el tipo de dato con cara de conclusión que hace
                perder una tarde buscando un problema que no existe.
              */}
              <p className="mt-1.5 max-w-[15rem] text-xs leading-relaxed text-gray-500">
                {Number(salud?.metricas?.enviados || 0) > 0 ? (
                  <>
                    Salieron {fmtNum(salud.metricas.enviados)} mensajes, pero ninguno tiene
                    confirmación de WhatsApp: son de antes de que empezáramos a registrarla. La
                    próxima campaña ya se mide.
                  </>
                ) : (
                  <>
                    No salió ningún mensaje en los últimos {salud?.ventanaDias ?? 7} días. Cuando
                    mandes la primera campaña vas a ver acá cómo responde la gente.
                  </>
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center py-4">
                <div className="relative w-36 h-36">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#F1F5F9" strokeWidth="8" />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={salud?.score >= 80 ? SUCCESS : salud?.score >= 50 ? WARNING : DANGER}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${(salud?.score || 0) * 2.64} 264`}
                      initial={{ strokeDasharray: '0 264' }}
                      animate={{ strokeDasharray: `${(salud?.score || 0) * 2.64} 264` }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold text-gray-900">{salud?.score ?? '-'}</span>
                    <span className="text-xs text-gray-400">de 100</span>
                  </div>
                </div>
              </div>
              {/*
                Las cuatro que importan, en el orden en que pasan las cosas:
                le llegó → lo abrió → contestó → se fue.

                "Lo abrió" al lado de "le llegó" es lo que separa un problema
                del número de uno del mensaje: si entrega bien y nadie abre, el
                texto no sirve; si no entrega, el número está en problemas.
              */}
              <div className="space-y-2">
                {[
                  ['Le llegó', salud?.metricas?.tasaExito],
                  ['Lo abrió', salud?.metricas?.tasaLectura],
                  ['Contestó', salud?.metricas?.tasaRespuesta],
                  ['Se dio de baja', salud?.metricas?.tasaBaja],
                ].map(([etiqueta, valor]) => (
                  <div key={etiqueta} className="flex justify-between text-xs">
                    <span className="text-gray-500">{etiqueta}</span>
                    <span className="font-semibold tabular-nums text-gray-900">
                      {valor === null || valor === undefined ? '—' : `${valor}%`}
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-[11px] leading-relaxed text-gray-400">
                  Sobre {fmtNum(salud?.metricas?.conRecibo || 0)} mensajes con confirmación de
                  WhatsApp.
                </p>
              </div>
            </>
          )}
        </Card>

        {/* Embudo / Gráfico */}
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-brand-500" /> Embudo
          </h3>
          {hayEmbudo ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={embudoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {embudoData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => fmtNum(value)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {embudoData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="text-gray-600">{d.name}</span>
                    <span className="font-semibold text-gray-900">{fmtNum(d.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /*
              Las referencias con los números también van adentro del if. Antes
              quedaban afuera y se veían tres ceros debajo del cartel de "sin
              datos", que es la peor manera de decir que no hay nada.
            */
            <Empty icon={BarChart3}>Todavía no mandaste ninguna campaña.</Empty>
          )}
        </Card>

        {/* Plan operativo resumen */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-brand-500" /> Plan operativo
            </h3>
            <button
              onClick={onVerPlan}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Ver completo
            </button>
          </div>
          {/* Una tarjeta en blanco no dice si no hay nada o si algo falló. */}
          {(planOperativo?.pasos || []).length === 0 && (
            <Empty icon={CheckCircle2}>Hoy no hay pasos cargados.</Empty>
          )}
          <div className="space-y-3">
            {(planOperativo?.pasos || []).slice(0, 4).map((paso) => (
              <div key={paso.paso} className="flex items-start gap-3">
                <div
                  className={classNames(
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                    paso.hecho ? 'bg-success-100 text-success-600' : 'bg-gray-100 text-gray-400'
                  )}
                >
                  {paso.hecho ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={classNames(
                      'text-sm font-medium',
                      paso.hecho ? 'text-gray-500 line-through' : 'text-gray-900'
                    )}
                  >
                    {paso.titulo}
                  </p>
                  <p className="text-xs text-gray-400">{paso.descripcion}</p>
                </div>
              </div>
            ))}
          </div>
          {recordatorios.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                <Clock size={12} /> Recordatorios pendientes ({recordatorios.length})
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Estado de conexión + Acciones rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Actividad reciente</h3>

          {/*
            Sin movimiento no se dibuja una línea plana: se dice que no hubo
            movimiento. Un gráfico en cero se lee como "algo se rompió", y lo
            que pasa es que todavía no mandaste nada.
          */}
          {!huboActividad ? (
            <Empty icon={TrendingUp}>Sin movimiento en los últimos 7 días.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={historialData}>
                <defs>
                  <linearGradient id="env" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BRAND} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 12, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 12, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="enviados"
                  stroke={BRAND}
                  fill="url(#env)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Acciones rápidas</h3>
          <div className="space-y-2">
            <Button variant="primary" className="w-full" onClick={onNuevaCampana}>
              <Send size={16} /> Nueva campaña
            </Button>
            <Button variant="outline" className="w-full" onClick={onVerCRM}>
              <Inbox size={16} /> Revisar CRM
            </Button>
            <Button variant="outline" className="w-full" onClick={onVerReportes}>
              <BarChart3 size={16} /> Cierre de jornada
            </Button>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span
                className={classNames(
                  'w-2 h-2 rounded-full',
                  conectado ? 'bg-success-500 animate-pulse' : 'bg-danger-500'
                )}
              />
              {conectado
                ? `Conectado${whatsapp.numero ? ` · ${whatsapp.numero}` : ''}`
                : 'Sin conexión'}
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Cupo: {fmtNum(hoy.cupoUsado || 0)} / {fmtNum(hoy.cupoTotal || 0)} en{' '}
              {hoy.ventanaMinutos || 60} min
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function CampanasVista({ campanas, onReenviar, motor, onControlar, ocupado }) {
  const [mirando, setMirando] = useState(null);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const { dialogo, pedir } = useConfirmacion();

  const enMarcha = Boolean(motor?.corriendo);
  const pausado = Boolean(motor?.pausado);
  const hechos = Number(motor?.stats?.hechos || 0);
  const total = Number(motor?.stats?.total || 0);

  const verSinRespuesta = async (campana) => {
    if (mirando === campana.id) {
      setMirando(null);
      setDatos(null);
      return;
    }
    setMirando(campana.id);
    setDatos(null);
    setCargando(true);
    try {
      setDatos(await api.get(`/whatsapp/campanas/${campana.id}/sin-respuesta`));
    } catch (e) {
      toast.error(e?.error || 'No se pudo calcular');
      setMirando(null);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="space-y-4">
      {dialogo}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Campañas</h2>
      </div>

      {/*
        El freno de mano.

        Los endpoints de pausar, reanudar y detener existían desde siempre y no
        había un solo botón que los llamara: se podía arrancar un envío a
        trescientas personas y no había forma de frenarlo desde la pantalla.
        Era lo más importante que faltaba en todo el módulo.

        La barra sólo aparece cuando hay algo andando. Un freno visible cuando
        no hay nada que frenar es ruido; cuando hay, tiene que estar arriba de
        todo y sin buscarlo.
      */}
      {enMarcha && (
        <Card className="border-2 border-brand-100 bg-gradient-to-r from-brand-50/60 to-white p-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="relative flex h-3 w-3 flex-shrink-0">
              <span
                className={classNames(
                  'absolute inline-flex h-full w-full rounded-full opacity-75',
                  pausado ? 'bg-warning-400' : 'animate-ping bg-brand-400'
                )}
              />
              <span
                className={classNames(
                  'relative inline-flex h-3 w-3 rounded-full',
                  pausado ? 'bg-warning-500' : 'bg-brand-500'
                )}
              />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900">
                {pausado ? 'Campaña pausada' : 'Enviando ahora'}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {fmtNum(hechos)} de {fmtNum(total)}
                {total > 0 && ` · faltan ${fmtNum(Math.max(0, total - hechos))}`}
              </p>
              {total > 0 && (
                <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, (hechos / total) * 100)}%` }}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {pausado ? (
                <Button
                  variant="primary"
                  onClick={() => onControlar('reanudar')}
                  disabled={ocupado}
                >
                  <Play size={15} /> Seguir
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => onControlar('pausar')}
                  disabled={ocupado}
                >
                  <Pause size={15} /> Pausar
                </Button>
              )}

              <Button
                variant="danger"
                disabled={ocupado}
                onClick={() =>
                  pedir({
                    titulo: '¿Detener la campaña?',
                    detalle: `Ya salieron ${fmtNum(hechos)} mensajes y no se pueden recuperar. Los ${fmtNum(Math.max(0, total - hechos))} que faltan no van a salir, y la campaña no se puede retomar: habría que armar una nueva.`,
                    textoOk: 'Detener',
                    peligro: true,
                    onOk: () => onControlar('detener'),
                  })
                }
              >
                <StopCircle size={15} /> Detener
              </Button>
            </div>
          </div>
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Nombre</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Estado</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Enviados</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Respuestas</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Fallidos</th>
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Fecha</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {campanas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8">
                    <Empty icon={Target}>No hay campañas todavía.</Empty>
                  </td>
                </tr>
              )}
              {campanas.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    {c.nombre || `Campaña #${c.id}`}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge
                      variant={
                        c.estado === 'terminada'
                          ? 'success'
                          : c.estado === 'enviando'
                            ? 'brand'
                            : c.estado === 'pausada'
                              ? 'warning'
                              : 'default'
                      }
                    >
                      {c.estado}
                    </Badge>
                    {Number(c.simulacro) ? (
                      <span className="ml-2 text-xs text-gray-400">simulacro</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold">{fmtNum(c.enviados)}</td>
                  <td className="px-5 py-3.5 text-right text-success-600 font-semibold">
                    {fmtNum(c.respuestas || 0)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-danger-500">
                    {fmtNum(c.fallidos || 0)}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{fmtDate(c.creado_en)}</td>
                  <td className="px-5 py-3.5 text-right">
                    {/*
                      Sólo tiene sentido en una campaña terminada y real. En
                      una que todavía está saliendo, "no contestó" no quiere
                      decir nada: todavía no tuvieron tiempo.
                    */}
                    {c.estado === 'terminada' && !Number(c.simulacro) && (
                      <button
                        onClick={() => verSinRespuesta(c)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50"
                      >
                        {mirando === c.id ? 'Cerrar' : 'Insistir'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {mirando &&
                (() => {
                  const c = campanas.find((x) => x.id === mirando);
                  if (!c) return null;
                  return (
                    <tr className="bg-gray-50/60">
                      <td colSpan={7} className="px-5 py-4">
                        {cargando && <p className="text-sm text-gray-500">Calculando…</p>}

                        {datos && datos.total === 0 && (
                          <p className="text-sm text-gray-600">
                            Todos los que recibieron esta campaña contestaron. No hay a quién
                            insistirle.
                          </p>
                        )}

                        {datos && datos.total > 0 && (
                          <div className="space-y-3">
                            <div>
                              <p className="text-sm text-gray-900">
                                <b className="text-lg tabular-nums">{fmtNum(datos.total)}</b>{' '}
                                personas recibieron el mensaje y no contestaron.
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                Se cuentan sólo los que tienen confirmación de entrega: a uno que
                                nunca le llegó no lo ignoró, le falló el envío.
                                {datos.sinRecibo > 0 && (
                                  <> Quedan afuera {fmtNum(datos.sinRecibo)} sin confirmación.</>
                                )}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {datos.items.slice(0, 12).map((x) => (
                                <span
                                  key={x.telefono}
                                  className="rounded-lg bg-white px-2.5 py-1 text-xs text-gray-600 ring-1 ring-gray-200"
                                >
                                  {x.nombre || x.telefonoLegible}
                                </span>
                              ))}
                              {datos.total > 12 && (
                                <span className="px-1 py-1 text-xs text-gray-400">
                                  y {fmtNum(datos.total - 12)} más
                                </span>
                              )}
                            </div>

                            <Button
                              variant="primary"
                              onClick={() => onReenviar?.(c, datos)}
                              disabled={!datos.clientesIds.length}
                            >
                              <Send size={15} /> Escribirle a estos{' '}
                              {fmtNum(datos.clientesIds.length)}
                            </Button>

                            {!datos.clientesIds.length && (
                              <p className="text-xs text-danger-600">
                                Ninguno tiene ficha en la agenda, así que no se los puede usar como
                                destinatarios.
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })()}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/**
 * La cara del contacto: la foto de WhatsApp, o la inicial.
 *
 * Se guarda en estado si la imagen falla al cargar, en vez de confiar sólo en
 * que el servidor haya mandado una dirección. El archivo puede no estar —
 * alguien limpió la carpeta de subidas, o la foto se bajó a medias— y sin este
 * respaldo la fila mostraría el cuadrito roto del navegador, que se ve peor
 * que no tener foto.
 */
/*
  Los colores de la inicial cuando no hay foto.

  El color sale de un hash del nombre, así que a cada persona le toca siempre
  el mismo: Ana es violeta hoy y violeta mañana. Eso convierte la inicial en
  algo reconocible de reojo en vez de un círculo gris más. Es de las cosas que
  Kimi tiene y nosotros no.
*/
const COLORES_AVATAR = [
  '#e11d48',
  '#db2777',
  '#9333ea',
  '#4f46e5',
  '#0284c7',
  '#0d9488',
  '#059669',
  '#65a30d',
  '#ca8a04',
  '#ea580c',
];

function colorDeNombre(nombre) {
  const texto = String(nombre || '?').trim();
  let h = 0;
  for (const ch of texto) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES_AVATAR[h % COLORES_AVATAR.length];
}

function Avatar({ nombre, url, size = 36 }) {
  const [fallo, setFallo] = useState(false);
  const inicial = (nombre || '?').trim().charAt(0).toUpperCase() || '?';

  if (!url || fallo) {
    return (
      <div
        className="flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          backgroundColor: colorDeNombre(nombre),
        }}
      >
        {inicial}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFallo(true)}
      className="rounded-full object-cover bg-gray-100 flex-shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

/* Los nombres lindos de los segmentos, para no mostrar el id crudo. */
const NOMBRE_SEGMENTO = {
  pidio: 'Pidió',
  pidio_ayer: 'Pidió ayer',
  respondio: 'Respondió',
  nuevo: 'Nuevo',
  nuevo_sin_enviar: 'Nuevo sin campaña',
  activo: 'Activo',
  frio: 'Frío',
  viejo: 'Sin actividad',
  sin_enviar: 'Sin campañas',
};

const ETIQUETAS = { frecuente: 'Frecuente', ejecutivo: 'Ejecutivo', economico: 'Económico' };

/**
 * Un contacto como tarjeta.
 *
 * ── El tope de dos chips ───────────────────────────────────────────────────
 *
 * Se muestran dos y el resto se resume en un "+N" con el detalle en el título.
 * No es capricho: en el script de Kimi hay un comentario contando que con
 * cuatro segmentos la tarjeta se desarmaba y los chips se montaban unos sobre
 * otros. Es un problema que alguien ya pagó; no hay razón para volver a
 * pagarlo.
 *
 * ── Por qué la tarjeta se apaga ────────────────────────────────────────────
 *
 * Un excluido sigue en la lista —hay que poder verlo y volver a activarlo—
 * pero no puede parecer igual que uno que sí va a recibir. La opacidad lo
 * cuenta sin agregar una palabra.
 */
function TarjetaContacto({ contacto, elegido, onElegir, onAbrir, onEtiqueta }) {
  const apagado = Boolean(contacto.excluido);

  const chips = [];
  if (contacto.envios > 0 && contacto.respuestas === 0) chips.push(['frio', 'no contestó']);
  (contacto.segmentos || []).forEach((s) => {
    if (NOMBRE_SEGMENTO[s]) chips.push([s, NOMBRE_SEGMENTO[s]]);
  });

  const visibles = chips.slice(0, 2);
  const resto = chips.slice(2);

  const datos = [];
  if (contacto.envios) datos.push(`${fmtNum(contacto.envios)} env`);
  if (contacto.respuestas) datos.push(`${fmtNum(contacto.respuestas)} resp`);

  return (
    <div
      className={classNames(
        'group relative rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        apagado && 'opacity-55',
        elegido && 'ring-2 ring-brand-400'
      )}
    >
      <span className="absolute right-3 top-3 cursor-pointer" title="Elegir para una campaña">
        <input
          aria-label={`Elegir ${contacto.nombre || contacto.telefono || 'contacto'} para una campaña`}
          type="checkbox"
          checked={elegido}
          onChange={(e) => onElegir(contacto.id, e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
        />
      </span>

      <button
        onClick={() => onAbrir(contacto)}
        className="flex w-full items-center gap-3 text-left"
      >
        <Avatar nombre={contacto.nombre} url={contacto.fotoUrl} size={46} />
        <span className="min-w-0 flex-1 pr-6">
          <span className="block truncate font-semibold text-gray-900">
            {contacto.nombre || 'Sin nombre'}
          </span>
          <span className="block truncate text-xs text-gray-500">
            {contacto.telefonoLegible || contacto.telefono}
          </span>
        </span>
      </button>

      {(visibles.length > 0 || datos.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {visibles.map(([id, texto]) => (
            <span
              key={id}
              className={classNames(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                id === 'frio' ? 'bg-warning-50 text-warning-700' : 'bg-gray-100 text-gray-600'
              )}
            >
              {texto}
            </span>
          ))}
          {resto.length > 0 && (
            <span
              title={resto.map((x) => x[1]).join(', ')}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500"
            >
              +{resto.length}
            </span>
          )}
          {datos.length > 0 && (
            <span className="ml-auto text-[11px] tabular-nums text-gray-400">
              {datos.join(' · ')}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-1.5 border-t border-gray-50 pt-3">
        {Object.entries(ETIQUETAS).map(([id, texto]) => {
          const puesta = (contacto.etiquetas || []).includes(id);
          return (
            <button
              key={id}
              onClick={() => onEtiqueta(contacto, id, puesta)}
              title={puesta ? `Sacar ${texto.toLowerCase()}` : `Marcar como ${texto.toLowerCase()}`}
              className={classNames(
                'flex-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors',
                puesta
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              )}
            >
              {texto}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Lo que se manda seguido, para no reescribirlo cada vez. */
const RESPUESTAS_RAPIDAS = [
  ['Horarios', '¡Hola! Abrimos hoy de 20:30 a 01:00. Te esperamos 🍔'],
  ['Mandar la carta', '¡Hola! Te paso la carta así elegís tranquilo 📋'],
  ['Ya salió', 'Tu pedido ya salió, en unos minutos te llega 🛵'],
  ['Gracias', '¡Gracias por elegirnos! Cualquier cosa escribinos 🙌'],
];

/**
 * El cajón del contacto.
 *
 * ── Por qué un cajón y no una tarjeta al costado ───────────────────────────
 *
 * Antes el detalle vivía en una columna fija que se comía un tercio del ancho
 * estuviera abierta o no, y sólo mostraba notas y etiquetas. Un cajón aparece
 * cuando hace falta, ocupa lo que necesita y se va.
 *
 * ── Qué muestra, y por qué ese orden ───────────────────────────────────────
 *
 * Arriba los tres números de esa persona, después qué le mandamos y cómo le
 * fue, después lo que dijo, y al final las notas. Es el orden en que uno
 * decide: primero si vale la pena escribirle, después qué decirle.
 */
function CajonContacto({ contacto, onCerrar, onEtiqueta, refrescar }) {
  const [datos, setDatos] = useState(null);
  const [notas, setNotas] = useState([]);
  const [nuevaNota, setNuevaNota] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!contacto) return undefined;
    let vivo = true;
    setCargando(true);
    Promise.all([
      api.get(`/whatsapp/contactos/${contacto.id}/historial`).catch(() => null),
      api.get(`/whatsapp/contactos/${contacto.id}/notas`).catch(() => null),
    ])
      .then(([h, n]) => {
        if (!vivo) return;
        setDatos(h);
        setNotas(n?.items || n || []);
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [contacto]);

  useEffect(() => {
    if (!contacto) return undefined;
    const alTeclear = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [contacto, onCerrar]);

  const guardarNota = async () => {
    if (!nuevaNota.trim()) return;
    try {
      await api.post(`/whatsapp/contactos/${contacto.id}/notas`, { nota: nuevaNota.trim() });
      setNuevaNota('');
      const n = await api.get(`/whatsapp/contactos/${contacto.id}/notas`);
      setNotas(n?.items || n || []);
    } catch (e) {
      toast.error(e?.error || 'No se pudo guardar la nota');
    }
  };

  const campanas = datos?.campanas || [];
  const mensajes = datos?.mensajes || [];

  /* Cómo le fue a cada envío, en palabras y no en estados de base. */
  const comoLeFue = (c) => {
    if (c.envio_estado === 'fallido') return ['No salió', 'text-danger-600'];
    if (c.leido_en) return ['Lo abrió', 'text-success-600'];
    if (c.entregado_en) return ['Le llegó', 'text-gray-700'];
    if (c.envio_estado === 'enviado') return ['Salió, sin confirmar', 'text-gray-400'];
    return [c.envio_estado || '—', 'text-gray-400'];
  };

  return (
    <AnimatePresence>
      {contacto && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && onCerrar()}
          />

          <motion.aside
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Cabecera */}
            <div className="flex items-center gap-3 border-b border-gray-100 p-5">
              <Avatar nombre={contacto.nombre} url={contacto.fotoUrl} size={52} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-gray-900">
                  {contacto.nombre || 'Sin nombre'}
                </p>
                <p className="truncate text-sm text-gray-500">
                  {contacto.telefonoLegible || contacto.telefono}
                </p>
              </div>
              <button
                onClick={onCerrar}
                className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Los tres números */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Le mandamos', campanas.length],
                  ['Contestó', mensajes.length],
                  ['Lo abrió', campanas.filter((c) => c.leido_en).length],
                ].map(([texto, valor]) => (
                  <div key={texto} className="rounded-xl bg-gray-50 p-3 text-center">
                    <p className="text-xl font-bold tabular-nums text-gray-900">{fmtNum(valor)}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">{texto}</p>
                  </div>
                ))}
              </div>

              {/* Etiquetas */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                  Etiquetas
                </h4>
                <div className="flex gap-2">
                  {Object.entries(ETIQUETAS).map(([id, texto]) => {
                    const puesta = (contacto.etiquetas || []).includes(id);
                    return (
                      <button
                        key={id}
                        onClick={() => onEtiqueta(contacto, id, puesta)}
                        className={classNames(
                          'flex-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors',
                          puesta
                            ? 'bg-brand-500 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                      >
                        {texto}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Responder */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                  Escribirle
                </h4>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {RESPUESTAS_RAPIDAS.map(([etiqueta, texto]) => (
                    <button
                      key={etiqueta}
                      onClick={async () => {
                        try {
                          await api.post('/whatsapp/responder', {
                            telefono: contacto.telefono,
                            texto,
                          });
                          toast.success('Enviado');
                        } catch (e) {
                          toast.error(e?.error || 'No se pudo mandar');
                        }
                      }}
                      className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-200"
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>
                <CajaRespuesta telefono={contacto.telefono} onListo={refrescar} />
              </div>

              {/* Qué le mandamos */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                  Qué le mandamos
                </h4>
                {cargando && <p className="text-sm text-gray-400">Cargando…</p>}
                {!cargando && campanas.length === 0 && (
                  <p className="text-sm text-gray-400">Nunca entró en una campaña.</p>
                )}
                <div className="space-y-1.5">
                  {campanas.slice(0, 8).map((c, i) => {
                    const [texto, color] = comoLeFue(c);
                    return (
                      <div
                        key={`${c.id}-${i}`}
                        className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                          {c.nombre || `Campaña #${c.id}`}
                        </span>
                        <span className={classNames('text-[11px] font-medium', color)}>
                          {texto}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {fmtDateShort(c.enviado_en)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Qué dijo */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                  Qué contestó
                </h4>
                {!cargando && mensajes.length === 0 && (
                  <p className="text-sm text-gray-400">Todavía no contestó nada.</p>
                )}
                <div className="space-y-1.5">
                  {mensajes.slice(0, 8).map((m, i) => (
                    <div key={i} className="rounded-lg bg-[#dcf8c6] px-3 py-2">
                      <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-800">
                        {m.texto || '—'}
                      </p>
                      <p className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                        {fmtDate(m.recibido_en)}
                        {Number(m.es_baja) ? (
                          <span className="font-semibold text-danger-600">pidió la baja</span>
                        ) : null}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                  Notas del equipo
                </h4>
                <div className="mb-2 space-y-1.5">
                  {notas.map((n) => (
                    <div key={n.id} className="rounded-lg bg-warning-50 px-3 py-2">
                      <p className="text-xs leading-relaxed text-gray-800">{n.nota}</p>
                      <p className="mt-1 text-[10px] text-gray-500">{fmtDate(n.creado_en)}</p>
                    </div>
                  ))}
                  {notas.length === 0 && <p className="text-sm text-gray-400">Sin notas.</p>}
                </div>
                <div className="flex gap-2">
                  <input
                    value={nuevaNota}
                    onChange={(e) => setNuevaNota(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && guardarNota()}
                    placeholder="Anotar algo…"
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                  <Button size="sm" variant="secondary" onClick={guardarNota}>
                    <Plus size={14} />
                  </Button>
                </div>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function ContactosVista({ contactos, setContactos, refrescar }) {
  const [buscar, setBuscar] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [fotos, setFotos] = useState(null);
  const [abrirImportar, setAbrirImportar] = useState(false);
  const [pegado, setPegado] = useState('');
  const [importando, setImportando] = useState(false);
  const [filtroSegmento, setFiltroSegmento] = useState('');
  const [filtroEtiqueta, setFiltroEtiqueta] = useState('');
  const [vistaTarjetas, setVistaTarjetas] = useState(true);
  const [elegidos, setElegidos] = useState(() => new Set());
  const [seleccionado, setSeleccionado] = useState(null);

  const filtrados = useMemo(() => {
    let arr = contactos;
    if (buscar) {
      const q = buscar.toLowerCase();
      arr = arr.filter(
        (c) => (c.nombre || '').toLowerCase().includes(q) || (c.telefono || '').includes(q)
      );
    }
    if (filtro === 'excluidos') arr = arr.filter((c) => c.excluido);
    if (filtro === 'activos') arr = arr.filter((c) => !c.excluido);
    if (filtro === 'conScore') arr = arr.filter((c) => (c.score || 0) > 0);

    /* Segmento y etiqueta filtran encima del estado, no en lugar de él. */
    if (filtroSegmento) arr = arr.filter((c) => (c.segmentos || []).includes(filtroSegmento));
    if (filtroEtiqueta === 'sin') arr = arr.filter((c) => !(c.etiquetas || []).length);
    else if (filtroEtiqueta) arr = arr.filter((c) => (c.etiquetas || []).includes(filtroEtiqueta));

    return arr;
  }, [contactos, buscar, filtro, filtroSegmento, filtroEtiqueta]);

  /*
    Los segmentos que se ofrecen salen de los contactos que hay, no de una
    lista fija. Ofrecer "Pidieron ayer" cuando no hay ninguno es prometer un
    filtro que devuelve vacío, y eso se lee como que algo se rompió.
  */
  const segmentosPresentes = useMemo(() => {
    const vistos = new Set();
    contactos.forEach((c) => (c.segmentos || []).forEach((s) => vistos.add(s)));
    return Object.entries(NOMBRE_SEGMENTO).filter(([id]) => vistos.has(id));
  }, [contactos]);

  const conteos = useMemo(
    () => ({
      total: contactos.length,
      excluidos: contactos.filter((c) => c.excluido).length,
      conFoto: contactos.filter((c) => c.fotoUrl).length,
      sinContestar: contactos.filter((c) => c.envios > 0 && !c.respuestas).length,
    }),
    [contactos]
  );

  const cambiarEtiqueta = async (contacto, etiqueta, puesta) => {
    try {
      if (puesta) {
        await api.delete(`/whatsapp/contactos/${contacto.id}/etiquetas/${etiqueta}`);
      } else {
        await api.post(`/whatsapp/contactos/${contacto.id}/etiquetas`, { etiqueta });
      }
      /*
        Se actualiza la lista en memoria en vez de volver a pedirla entera.
        Marcar tres etiquetas seguidas serían tres recargas completas de la
        agenda, y entre una y otra las tarjetas saltan de lugar.
      */
      setContactos?.((prev) =>
        prev.map((c) =>
          c.id === contacto.id
            ? {
                ...c,
                etiquetas: puesta
                  ? (c.etiquetas || []).filter((x) => x !== etiqueta)
                  : [...(c.etiquetas || []), etiqueta],
              }
            : c
        )
      );
    } catch (e) {
      toast.error(e?.error || 'No se pudo cambiar la etiqueta');
    }
  };

  /*
    Mientras se bajan las fotos se pregunta cada dos segundos cómo va.

    Preguntar es más simple que abrir un canal permanente, y para un trabajo
    que dura minutos y avanza de a una foto, dos segundos de retraso no se
    notan. Cuando termina se refresca la lista para que aparezcan las caras.
  */
  useEffect(() => {
    if (!fotos?.corriendo) return undefined;
    const id = setInterval(async () => {
      try {
        const estado = await api.get('/whatsapp/fotos/estado');
        setFotos(estado);
        if (!estado?.corriendo) {
          clearInterval(id);
          refrescar?.();
          toast.success(
            `Fotos listas: ${estado.conFoto} con foto, ${estado.sinFoto} sin foto visible`
          );
        }
      } catch {
        clearInterval(id);
        setFotos(null);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [fotos?.corriendo, refrescar]);

  /**
   * Pegar una lista de números.
   *
   * ── Por qué pegar y no subir un archivo ────────────────────────────────
   *
   * El servidor acepta hasta 5.000 contactos y esto no se podía hacer desde
   * ninguna parte. Se podría pedir un CSV, pero de dónde salen los números en
   * la vida real es de un WhatsApp, de un cuaderno o de una planilla abierta:
   * en los tres casos se copian y se pegan. Pedir un archivo con el formato
   * correcto agrega un paso que se puede hacer mal.
   *
   * Se acepta cualquier separador —coma, punto y coma, salto de línea— y se
   * limpia todo lo que no sea número, así un pegado de "381 544-2210" entra
   * igual que uno de "5493815442210".
   */
  const importarPegado = async () => {
    const crudos = String(pegado || '')
      .split(/[\s,;]+/)
      .map((x) => x.replace(/\D/g, ''))
      .filter((x) => x.length >= 8);

    const unicos = [...new Set(crudos)];
    if (!unicos.length) {
      toast.error('No encontré ningún número en lo que pegaste');
      return;
    }
    if (unicos.length > 5000) {
      toast.error('Son más de 5.000 números. Andá por partes.');
      return;
    }

    setImportando(true);
    try {
      const r = await api.post('/whatsapp/contactos/importar', {
        contactos: unicos.map((telefono) => ({ telefono })),
      });
      toast.success(
        `${fmtNum(r?.importados ?? unicos.length)} agregados` +
          (r?.ignorados ? ` · ${fmtNum(r.ignorados)} ignorados` : '')
      );
      setPegado('');
      setAbrirImportar(false);
      refrescar?.();
    } catch (e) {
      toast.error(e?.error || 'No se pudieron importar');
    } finally {
      setImportando(false);
    }
  };

  const sincronizarFotos = async () => {
    try {
      const r = await api.post('/whatsapp/fotos', {});
      setFotos({ ...(r?.estado || {}), corriendo: true });
      toast.success('Bajando las fotos. Va de a una para no arriesgar el número.');
    } catch (e) {
      toast.error(e?.message || 'No se pudieron bajar las fotos');
    }
  };

  /*
    Abrir un contacto ahora es sólo abrir el cajón. Las notas y el historial
    los pide el cajón adentro, cuando se muestra: pedirlos acá significaba
    traerlos aunque el panel nunca llegara a verse.
  */
  const abrirContacto = (c) => setSeleccionado(c);

  return (
    <div className="space-y-4">
      <CajonContacto
        contacto={seleccionado}
        onCerrar={() => setSeleccionado(null)}
        onEtiqueta={cambiarEtiqueta}
        refrescar={refrescar}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">Agenda de contactos</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar..."
              className="pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 w-56"
            />
          </div>
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="todos">Todos</option>
            <option value="activos">Habilitados</option>
            <option value="excluidos">Excluidos</option>
            <option value="conScore">Con score</option>
          </select>

          <select
            value={filtroSegmento}
            onChange={(e) => setFiltroSegmento(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">Todos los segmentos</option>
            {segmentosPresentes.map(([id, texto]) => (
              <option key={id} value={id}>
                {texto}
              </option>
            ))}
          </select>

          <select
            value={filtroEtiqueta}
            onChange={(e) => setFiltroEtiqueta(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            <option value="">Todas las etiquetas</option>
            {Object.entries(ETIQUETAS).map(([id, texto]) => (
              <option key={id} value={id}>
                {texto}
              </option>
            ))}
            <option value="sin">Sin etiqueta</option>
          </select>

          {/* Tarjetas o tabla. Las dos sirven: para mirar, tarjetas; para
              comparar muchos de un vistazo, tabla. */}
          <div className="flex overflow-hidden rounded-xl border border-gray-200">
            <button
              onClick={() => setVistaTarjetas(true)}
              title="Ver como tarjetas"
              className={classNames(
                'px-3 py-2 transition-colors',
                vistaTarjetas ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-700'
              )}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setVistaTarjetas(false)}
              title="Ver como tabla"
              className={classNames(
                'px-3 py-2 transition-colors',
                !vistaTarjetas ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-700'
              )}
            >
              <List size={15} />
            </button>
          </div>

          <Button variant="secondary" onClick={sincronizarFotos} disabled={fotos?.corriendo}>
            <ImageIcon size={15} />
            {fotos?.corriendo ? 'Bajando fotos…' : 'Traer fotos'}
          </Button>

          <Button variant="secondary" onClick={() => setAbrirImportar((v) => !v)}>
            <Users size={15} /> Agregar números
          </Button>
        </div>
      </div>

      {abrirImportar && (
        <Card className="p-5">
          <h4 className="mb-1 text-sm font-semibold text-gray-900">Pegá los números</h4>
          <p className="mb-3 text-xs leading-relaxed text-gray-500">
            Uno por línea o separados por coma. No importa cómo estén escritos: 381 544-2210 o
            5493815442210 entran igual.
          </p>
          <textarea
            value={pegado}
            onChange={(e) => setPegado(e.target.value)}
            rows={5}
            placeholder={'3815442210\n3815118890\n3815223341'}
            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <div className="mt-3 flex items-center gap-3">
            <Button variant="primary" onClick={importarPegado} disabled={importando}>
              {importando ? 'Agregando…' : 'Agregar a la agenda'}
            </Button>
            <Button variant="ghost" onClick={() => setAbrirImportar(false)}>
              Cancelar
            </Button>
            <span className="text-xs text-gray-400">
              {
                [
                  ...new Set(
                    String(pegado)
                      .split(/[\s,;]+/)
                      .map((x) => x.replace(/\D/g, ''))
                      .filter((x) => x.length >= 8)
                  ),
                ].length
              }{' '}
              números encontrados
            </span>
          </div>
        </Card>
      )}

      {/*
        El avance a la vista. Un trabajo que tarda minutos sin nada en pantalla
        se siente colgado, y el reflejo es apretar el botón otra vez.
      */}
      {fotos?.corriendo && (
        <Card className="p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600">
              Bajando fotos de perfil · una cada medio segundo para no arriesgar el número
            </span>
            <span className="font-semibold text-gray-900 tabular-nums">
              {fmtNum(fotos.hechos)} de {fmtNum(fotos.total)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-success-500"
              initial={{ width: 0 }}
              animate={{ width: `${fotos.total ? (fotos.hechos / fotos.total) * 100 : 0}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {fmtNum(fotos.conFoto)} con foto · {fmtNum(fotos.sinFoto)} sin foto visible
          </p>
        </Card>
      )}

      {/*
        Los contadores arriba. Sin esto hay que bajar hasta el final para saber
        de qué tamaño es lo que estás mirando, y "sin contestar" —que es la
        lista que más plata deja— no se veía en ningún lado.
      */}
      <div className="flex flex-wrap gap-2">
        {[
          ['Total', conteos.total, 'bg-gray-100 text-gray-700'],
          ['Con foto', conteos.conFoto, 'bg-success-50 text-success-700'],
          ['Sin contestar', conteos.sinContestar, 'bg-warning-50 text-warning-700'],
          ['Excluidos', conteos.excluidos, 'bg-danger-50 text-danger-700'],
        ].map(([texto, valor, clase]) => (
          <span
            key={texto}
            className={classNames(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
              clase
            )}
          >
            {texto} <b className="tabular-nums">{fmtNum(valor)}</b>
          </span>
        ))}

        {elegidos.size > 0 && (
          <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white">
            {fmtNum(elegidos.size)} elegidos
            <button
              onClick={() => setElegidos(new Set())}
              className="opacity-80 hover:opacity-100"
              title="Deseleccionar todos"
            >
              <X size={13} />
            </button>
          </span>
        )}
      </div>

      {vistaTarjetas ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtrados.length === 0 && (
            <div className="col-span-full">
              <Empty icon={Users}>No hay contactos con esos filtros.</Empty>
            </div>
          )}
          {filtrados.map((c) => (
            <TarjetaContacto
              key={c.id}
              contacto={c}
              elegido={elegidos.has(c.id)}
              onElegir={(id, marcado) =>
                setElegidos((prev) => {
                  const siguiente = new Set(prev);
                  if (marcado) siguiente.add(id);
                  else siguiente.delete(id);
                  return siguiente;
                })
              }
              onAbrir={abrirContacto}
              onEtiqueta={cambiarEtiqueta}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Contacto</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Score</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Estado</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">
                      Último mensaje
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8">
                        <Empty icon={Users}>No hay contactos.</Empty>
                      </td>
                    </tr>
                  )}
                  {filtrados.map((c) => (
                    <tr
                      key={c.id}
                      className={classNames(
                        'border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer',
                        seleccionado?.id === c.id && 'bg-brand-50/40'
                      )}
                      onClick={() => abrirContacto(c)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar nombre={c.nombre} url={c.fotoUrl} size={36} />
                          <div>
                            <p className="font-medium text-gray-900">{c.nombre || 'Sin nombre'}</p>
                            <p className="text-xs text-gray-400">{c.telefono}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Star
                            size={14}
                            className={
                              c.score > 0 ? 'text-warning-400 fill-warning-400' : 'text-gray-200'
                            }
                          />
                          <span className="text-sm font-semibold text-gray-700">
                            {c.score || 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={c.excluido ? 'danger' : 'success'}>
                          {c.excluido ? 'Excluido' : 'Habilitado'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {fmtDate(c.ultimo_mensaje_en)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/**
 * Los chats con el bot.
 *
 * ── Por qué esta pantalla no existía y por qué hace falta ──────────────────
 *
 * El servidor tenía tres endpoints —listar los chats, ver los mensajes de uno,
 * y tomar o devolverle la conversación al bot— y **ningún item en el menú**.
 *
 * Lo que se perdía es lo más caro: cuando alguien contesta desde el teléfono
 * del local, el bot se calla treinta minutos en ese chat. Es lo correcto, pero
 * pasaba en silencio y no se veía en ninguna pantalla. Nos costó una hora
 * buscando un bot roto que funcionaba bien.
 *
 * Por eso lo primero que se ve acá son **los chats silenciados**, arriba de
 * todo y con el botón para devolvérselos al bot.
 */
function ConversacionesVista() {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const [mensajes, setMensajes] = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get('/whatsapp/conversaciones?limite=60');
      setItems(r?.items || r || []);
    } catch {
      setItems([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrir = async (c) => {
    if (abierta?.id === c.id) {
      setAbierta(null);
      return;
    }
    setAbierta(c);
    setMensajes([]);
    try {
      const r = await api.get(`/whatsapp/conversaciones/${c.id}/mensajes?limite=30`);
      setMensajes(r?.items || r?.mensajes || r || []);
    } catch {
      setMensajes([]);
    }
  };

  const controlar = async (c, accion) => {
    try {
      await api.put(`/whatsapp/conversaciones/${c.id}/control`, { accion });
      toast.success(accion === 'devolver' ? 'El bot vuelve a atender' : 'Chat tomado por vos');
      await cargar();
    } catch (e) {
      toast.error(e?.error || 'No se pudo cambiar');
    }
  };

  const silenciados = items.filter((c) => Number(c.bot_silenciado));
  const normales = items.filter((c) => !Number(c.bot_silenciado));

  const fila = (c) => (
    <Fragment key={c.id}>
      <div
        className={classNames(
          'flex items-center gap-3 rounded-xl p-3 transition-colors',
          Number(c.bot_silenciado) ? 'bg-warning-50/60' : 'hover:bg-gray-50'
        )}
      >
        <Avatar nombre={c.nombre || c.telefono} size={40} />

        <button onClick={() => abrir(c)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-gray-900">
            {c.nombre || c.telefono}
          </span>
          <span className="block truncate text-xs text-gray-500">{c.ultimo_mensaje || '—'}</span>
        </button>

        <div className="flex flex-shrink-0 items-center gap-2">
          {Number(c.pedidos_creados) > 0 && (
            <Badge variant="success">{fmtNum(c.pedidos_creados)} pedidos</Badge>
          )}
          <span className="hidden text-xs text-gray-400 sm:block">
            {fmtDate(c.ultimo_mensaje_en)}
          </span>
          {Number(c.bot_silenciado) ? (
            <Button size="sm" variant="secondary" onClick={() => controlar(c, 'devolver')}>
              Que siga el bot
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => controlar(c, 'tomar')}>
              Atender yo
            </Button>
          )}
        </div>
      </div>

      {abierta?.id === c.id && (
        <div className="mb-2 ml-12 rounded-xl bg-[#ece5dd] p-3">
          {mensajes.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-500">Sin mensajes para mostrar.</p>
          ) : (
            <div className="space-y-1.5">
              {mensajes.slice(-20).map((m) => (
                <div
                  key={m.id}
                  className={classNames(
                    'max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm',
                    m.direccion === 'saliente'
                      ? 'ml-auto rounded-br-sm bg-[#dcf8c6]'
                      : 'rounded-bl-sm bg-white'
                  )}
                >
                  <p className="whitespace-pre-wrap break-words leading-relaxed text-gray-800">
                    {m.contenido || `[${m.tipo}]`}
                  </p>
                  <p className="mt-1 text-right text-[10px] text-gray-400">
                    {fmtDate(m.creado_en)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Fragment>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Conversaciones</h2>
        <Button variant="ghost" onClick={cargar} disabled={cargando}>
          <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </Button>
      </div>

      {silenciados.length > 0 && (
        <Card className="border-2 border-warning-100 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning-600" />
            <h3 className="text-sm font-bold text-gray-900">
              {fmtNum(silenciados.length)} chats donde el bot no está contestando
            </h3>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-gray-500">
            Pasa cuando alguien contesta desde el teléfono del local o el agente deriva a una
            persona. Es a propósito, pero si nadie lo atiende el cliente queda esperando.
          </p>
          <div className="space-y-1">{silenciados.map(fila)}</div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold text-gray-900">Todos los chats</h3>
        {cargando && normales.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">Cargando…</p>
        )}
        {!cargando && normales.length === 0 && (
          <Empty icon={MessageSquare}>No hay conversaciones todavía.</Empty>
        )}
        <div className="space-y-1">{normales.map(fila)}</div>
      </Card>
    </div>
  );
}

function CRMVista({ crm, refrescar }) {
  const [filtroEstado, setFiltroEstado] = useState('');
  const estados = ['nuevo', 'contactado', 'interesado', 'descartado', 'cliente'];
  const coloresEstado = {
    nuevo: 'bg-gray-100 text-gray-700',
    contactado: 'bg-info-50 text-info-700',
    interesado: 'bg-success-50 text-success-700',
    descartado: 'bg-danger-50 text-danger-700',
    cliente: 'bg-brand-50 text-brand-700',
  };

  const filtrados = filtroEstado ? crm.filter((c) => c.estado === filtroEstado) : crm;

  const cambiarEstado = async (id, estado) => {
    await api.put(`/whatsapp/crm/${id}`, { estado });
    refrescar();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-gray-900">CRM de respuestas</h2>
        <Tabs
          tabs={[
            { id: '', label: 'Todos' },
            ...estados.map((e) => ({ id: e, label: e.charAt(0).toUpperCase() + e.slice(1) })),
          ]}
          active={filtroEstado}
          onChange={setFiltroEstado}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {filtrados.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="p-5 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {item.telefonoLegible || item.telefono}
                    </p>
                    <p className="text-xs text-gray-400">{fmtDate(item.creado_en)}</p>
                  </div>
                  <select
                    value={item.estado}
                    onChange={(e) => cambiarEstado(item.id, e.target.value)}
                    className={classNames(
                      'text-xs font-medium px-2 py-1 rounded-lg border-0 cursor-pointer',
                      coloresEstado[item.estado]
                    )}
                  >
                    {estados.map((e) => (
                      <option key={e} value={e}>
                        {e.charAt(0).toUpperCase() + e.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-3">
                  {item.respuesta_texto || 'Sin texto'}
                </p>
                {item.nota && (
                  <p className="text-xs text-gray-500 italic mb-3">Nota: {item.nota}</p>
                )}
                <div className="flex items-center gap-2">
                  <input
                    placeholder="Agregar nota..."
                    className="flex-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        await api.put(`/whatsapp/crm/${item.id}`, { nota: e.target.value });
                        e.target.value = '';
                        refrescar();
                      }
                    }}
                  />
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
        {filtrados.length === 0 && <Empty icon={Inbox}>No hay respuestas en este estado.</Empty>}
      </div>
    </div>
  );
}

function PlanOperativoVista({ planOperativo, recordatorios, setRecordatorios }) {
  const [textoRecordatorio, setTextoRecordatorio] = useState('');
  const [venceRecordatorio, setVenceRecordatorio] = useState('');

  const agregarRecordatorio = async () => {
    if (!textoRecordatorio.trim()) return;
    await api.post('/whatsapp/recordatorios', {
      contacto_id: 0,
      texto: textoRecordatorio,
      vence: venceRecordatorio || null,
    });
    setTextoRecordatorio('');
    setVenceRecordatorio('');
    const res = await api.get('/whatsapp/recordatorios?hecho=0');
    setRecordatorios(res?.items || []);
  };

  const toggleRecordatorio = async (id, hecho) => {
    await api.put(`/whatsapp/recordatorios/${id}`, { hecho: hecho ? 0 : 1 });
    const res = await api.get('/whatsapp/recordatorios?hecho=0');
    setRecordatorios(res?.items || []);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Plan operativo · {planOperativo?.fecha}</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Pasos del día</h3>
          <div className="space-y-4">
            {(planOperativo?.pasos || []).map((paso) => (
              <div key={paso.paso} className="flex items-start gap-4">
                <div
                  className={classNames(
                    'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
                    paso.hecho ? 'bg-success-100 text-success-600' : 'bg-gray-100 text-gray-500'
                  )}
                >
                  {paso.hecho ? <CheckCircle2 size={16} /> : paso.paso}
                </div>
                <div className="flex-1">
                  <p
                    className={classNames(
                      'text-sm font-semibold',
                      paso.hecho ? 'text-gray-400 line-through' : 'text-gray-900'
                    )}
                  >
                    {paso.titulo}
                  </p>
                  <p className="text-xs text-gray-400">{paso.descripcion}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Recordatorios</h3>
          <div className="space-y-2 mb-4">
            {recordatorios.map((r) => (
              <div key={r.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                <button onClick={() => toggleRecordatorio(r.id, r.hecho)}>
                  {r.hecho ? (
                    <CheckCircle2 size={16} className="text-success-500" />
                  ) : (
                    <Circle size={16} className="text-gray-400" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={classNames(
                      'text-sm',
                      r.hecho ? 'line-through text-gray-400' : 'text-gray-800'
                    )}
                  >
                    {r.texto}
                  </p>
                  {r.vence && <p className="text-xs text-gray-400">Vence: {fmtDate(r.vence)}</p>}
                </div>
              </div>
            ))}
            {recordatorios.length === 0 && (
              <Empty icon={Clock}>Sin recordatorios pendientes.</Empty>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={textoRecordatorio}
              onChange={(e) => setTextoRecordatorio(e.target.value)}
              placeholder="Nuevo recordatorio..."
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              onKeyDown={(e) => e.key === 'Enter' && agregarRecordatorio()}
            />
            <input
              type="datetime-local"
              value={venceRecordatorio}
              onChange={(e) => setVenceRecordatorio(e.target.value)}
              className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <Button size="sm" variant="secondary" onClick={agregarRecordatorio}>
              <Plus size={16} />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ReportesVista({ cierre }) {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);

  const guardarCierre = async () => {
    setGuardando(true);
    try {
      /*
        El embudo ya no viaja desde acá. Antes se mandaban cuatro ceros
        escritos a mano y el servidor los guardaba tal cual, así que cada
        cierre metía datos inventados en la base. Ahora los calcula el
        servidor con las mismas tablas que usa todo lo demás.
      */
      await api.post('/whatsapp/cierre-jornada', { fecha });
      toast.success('Cierre guardado');
    } catch (e) {
      toast.error('No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Cierre de jornada</h2>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <Button variant="primary" onClick={guardarCierre} disabled={guardando}>
            <CheckCircle2 size={16} /> Guardar cierre
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Enviados (hoy)" value={cierre?.enviados || 0} icon={Send} color={BRAND} />
        <StatCard
          label="Respuestas (hoy)"
          value={cierre?.respuestas || 0}
          icon={MessageSquare}
          color={SUCCESS}
        />
        <StatCard
          label="Salud score"
          value={cierre?.salud_score || 0}
          icon={Heart}
          color={cierre?.salud_score >= 80 ? SUCCESS : cierre?.salud_score >= 50 ? WARNING : DANGER}
        />
      </div>

      <Card className="p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Resumen histórico</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Enviados</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Respuestas</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Salud</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="px-4 py-3 font-medium">{cierre?.fecha || fecha}</td>
                <td className="px-4 py-3 text-right">{fmtNum(cierre?.enviados || 0)}</td>
                <td className="px-4 py-3 text-right text-success-600 font-semibold">
                  {fmtNum(cierre?.respuestas || 0)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Badge
                    variant={
                      cierre?.salud_score >= 80
                        ? 'success'
                        : cierre?.salud_score >= 50
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    {cierre?.salud_score || '-'}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/**
 * El adjunto de la campaña: una foto o un PDF.
 *
 * ── Por qué esto no existía ────────────────────────────────────────────────
 *
 * El servidor ya sabía hacerlo todo desde antes: `/whatsapp/media` recibe el
 * archivo, `wa_campanas.imagen` guarda la ruta y el motor lo manda con el
 * texto como epígrafe. Lo único que faltaba era esta pieza, así que la
 * campaña se podía mandar sólo con texto pelado.
 *
 * ── Por qué el texto queda como epígrafe y no como mensaje aparte ──────────
 *
 * WhatsApp permite mandar la foto con el texto adentro, en un solo globo. Es
 * mejor así: dos mensajes seguidos son dos notificaciones, y para el que
 * recibe se siente el doble de invasivo. Además el motor ya lo resuelve de
 * esta forma, con `caption`.
 */
function Adjunto({ valor, onCambiar }) {
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef(null);

  const esPdf = String(valor || '')
    .toLowerCase()
    .endsWith('.pdf');

  const elegir = async (archivo) => {
    if (!archivo) return;

    /*
      El tope de 16 MB es el mismo que aplica el servidor. Avisar acá evita
      que alguien espere la subida de un archivo de 40 MB para recién
      enterarse de que no entra.
    */
    if (archivo.size > 16 * 1024 * 1024) {
      toast.error('El archivo no puede pasar de 16 MB');
      return;
    }

    const datos = new FormData();
    datos.append('archivo', archivo);
    setSubiendo(true);
    try {
      const r = await api.post('/whatsapp/media', datos);
      onCambiar(r.path);
      toast.success('Adjunto listo');
    } catch (e) {
      toast.error(e?.error || 'No se pudo subir el archivo');
    } finally {
      setSubiendo(false);
      /* Se limpia para que elegir el mismo archivo dos veces vuelva a disparar. */
      if (entrada.current) entrada.current.value = '';
    }
  };

  if (valor) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        {esPdf ? (
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-danger-100 to-danger-50 text-danger-600">
            <FileText size={22} />
          </div>
        ) : (
          <img
            src={valor}
            alt=""
            className="h-14 w-14 flex-shrink-0 rounded-xl object-cover ring-1 ring-gray-200"
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">
            {String(valor).split('/').pop()}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {esPdf ? 'PDF · va como documento' : 'Foto · el texto va como epígrafe'}
          </p>
        </div>

        <button
          onClick={() => onCambiar('')}
          className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
          title="Quitar el adjunto"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => elegir(e.target.files?.[0])}
      />
      <button
        onClick={() => entrada.current?.click()}
        disabled={subiendo}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-gray-200 py-5 text-sm font-medium text-gray-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-600 disabled:opacity-60"
      >
        {subiendo ? (
          <>
            <RefreshCw size={16} className="animate-spin" /> Subiendo…
          </>
        ) : (
          <>
            <Paperclip size={16} /> Agregar una foto o el PDF del menú
          </>
        )}
      </button>
    </>
  );
}

function NuevaCampanaVista({
  form,
  setForm,
  segmentos,
  plantillas,
  onPreparar,
  onEnviar,
  onProgramar,
  preview,
  setPreview,
  ocupado,
  estado,
  refrescar,
}) {
  const [paso, setPaso] = useState(1);
  const [tipoMensaje, setTipoMensaje] = useState(form.imagen ? 'foto' : 'texto');
  const [temaIa, setTemaIa] = useState('');
  const [redactando, setRedactando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [iEjemplo, setIEjemplo] = useState(0);

  useEffect(() => {
    if (preview) setPaso(3);
  }, [preview]);

  const handlePreparar = async () => {
    await onPreparar();
  };

  /*
    El límite real de WhatsApp.

    Con foto o documento el texto va como epígrafe, y ahí el corte es mucho más
    bajo: lo que pasa de 1.024 queda escondido detrás de un "ver más" que casi
    nadie toca. Escribir doscientas palabras hermosas para que el cliente lea
    las primeras cuarenta es peor que escribir cuarenta.
  */
  const limiteTexto = tipoMensaje === 'texto' ? 4096 : 1024;
  const pasadoDeLargo = form.mensaje.length > limiteTexto;

  /* Clientes de ejemplo para la vista previa. */
  const EJEMPLOS = [
    { nombre: 'Luciana', dias: 34 },
    { nombre: 'Ramiro', dias: 51 },
    { nombre: 'Carla', dias: 12 },
  ];
  const ejemplo = EJEMPLOS[iEjemplo % EJEMPLOS.length];
  const cambiarEjemplo = () => setIEjemplo((i) => i + 1);

  const textoVista = form.mensaje.replace(/\{NOMBRE\}/gi, ejemplo.nombre);

  /* La primera dirección que aparezca en el texto, para dibujar su tarjeta. */
  const linkEnTexto = (form.mensaje.match(/https?:\/\/[^\s]+/) || [])[0] || null;

  /*
    Insertar donde está el cursor, no al final.

    Pegar {NOMBRE} al final de todo obliga a cortarlo y moverlo a mano, que es
    justo lo que el botón tendría que ahorrar.
  */
  const insertarEnEditor = (texto) => {
    const caja = document.getElementById('editor-campana');
    const actual = form.mensaje;
    if (!caja) {
      setForm((f) => ({ ...f, mensaje: `${actual}${texto}` }));
      return;
    }
    const desde = caja.selectionStart ?? actual.length;
    const hasta = caja.selectionEnd ?? actual.length;
    setForm((f) => ({ ...f, mensaje: actual.slice(0, desde) + texto + actual.slice(hasta) }));
    requestAnimationFrame(() => {
      caja.focus();
      caja.setSelectionRange(desde + texto.length, desde + texto.length);
    });
  };

  /*
    Escribir puede tardar.

    Si el proveedor de IA está saturado, el servidor reintenta y después prueba
    los de respaldo: eso llegó a tardar treinta y dos segundos en una prueba
    real. Con un botón que sólo dice "Escribiendo…" eso se lee como colgado, y
    con razón — nadie espera medio minuto mirando una palabra fija.

    Por eso se cuentan los segundos en el botón y, pasados unos pocos, se
    explica qué está pasando. Y hay corte propio a los cuarenta y cinco: si el
    servidor nunca contesta, la pantalla igual se destraba en vez de quedar
    pidiendo un refresh.
  */
  const [segundosIa, setSegundosIa] = useState(0);

  useEffect(() => {
    if (!redactando) {
      setSegundosIa(0);
      return undefined;
    }
    const reloj = setInterval(() => setSegundosIa((s) => s + 1), 1000);
    return () => clearInterval(reloj);
  }, [redactando]);

  const redactar = async (tema) => {
    const pedido = String(tema || '').trim();
    if (!pedido) return;
    setRedactando(true);
    try {
      const r = await Promise.race([
        api.post('/whatsapp/redactar', { tema: pedido }),
        new Promise((_, rechazar) =>
          setTimeout(
            () => rechazar({ error: 'La IA no contestó en 45 segundos. Probá de nuevo.' }),
            45000
          )
        ),
      ]);
      setForm((f) => ({ ...f, mensaje: r?.texto || f.mensaje }));
      setTemaIa('');
      toast.success('Listo. Leelo antes de mandar.');
    } catch (e) {
      toast.error(e?.error || 'No se pudo escribir');
    } finally {
      setRedactando(false);
    }
  };

  /*
    La prueba va al número del propio local, que es el que está vinculado.
    Mandarse un mensaje a uno mismo funciona en WhatsApp, así que no hace falta
    configurar un número aparte sólo para probar.
  */
  const mandarmePrueba = async () => {
    const propio = estado?.whatsapp?.numero;
    if (!propio) {
      toast.error('No sé a qué número mandarla: WhatsApp no está conectado');
      return;
    }
    setProbando(true);
    try {
      await api.post('/whatsapp/responder', { telefono: propio, texto: textoVista });
      toast.success('Te la mandé al número del local');
    } catch (e) {
      toast.error(e?.error || 'No se pudo mandar la prueba');
    } finally {
      setProbando(false);
    }
  };

  const guardarComoPlantilla = async () => {
    try {
      await api.post('/whatsapp/plantillas', {
        nombre: form.nombre?.trim() || `Plantilla ${new Date().toLocaleDateString('es-AR')}`,
        mensaje: form.mensaje,
        imagen: form.imagen || '',
        segmento: form.segmento || 'todos',
      });
      toast.success('Guardada en Plantillas');
      refrescar?.();
    } catch (e) {
      toast.error(e?.error || 'No se pudo guardar');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((p) => (
          <div key={p} className="flex items-center gap-2">
            <div
              className={classNames(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                paso >= p ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-400'
              )}
            >
              {paso > p ? <CheckCircle2 size={16} /> : p}
            </div>
            {p < 3 && (
              <div
                className={classNames(
                  'w-8 h-0.5 rounded',
                  paso > p ? 'bg-brand-500' : 'bg-gray-200'
                )}
              />
            )}
          </div>
        ))}
      </div>

      {paso === 1 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ── El editor ──────────────────────────────────────────── */}
          <div className="space-y-4">
            <Card className="space-y-4 p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Send size={16} />
                </span>
                <h3 className="text-lg font-bold text-gray-900">El mensaje</h3>
              </div>

              <input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre interno de la campaña"
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />

              {plantillas.length > 0 && (
                <select
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  onChange={(e) => {
                    const pl = plantillas.find((p) => String(p.id) === e.target.value);
                    if (pl)
                      setForm((f) => ({
                        ...f,
                        nombre: pl.nombre,
                        mensaje: pl.mensaje,
                        imagen: pl.imagen || '',
                        segmento: pl.segmento || 'todos',
                      }));
                  }}
                >
                  <option value="">Usar plantilla guardada</option>
                  {plantillas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              )}

              {/*
                Qué tipo de mensaje es.

                No son "adjuntos separados" a propósito: una campaña manda un
                mensaje por persona. Foto y PDF juntos serían dos mensajes a
                cada uno —dos notificaciones, el doble contra el cupo diario—,
                así que se elige uno.

                El link no necesita casilla propia: escrito adentro del texto,
                WhatsApp le arma la tarjeta de vista previa solo.
              */}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                  Tipo de mensaje
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['texto', 'Sólo texto', MessageSquare, '4.096 caracteres'],
                    ['foto', 'Con foto', ImageIcon, 'corta a 1.024'],
                    ['pdf', 'Con PDF', FileText, 'el menú, la carta'],
                  ].map(([id, texto, Icono, nota]) => {
                    const activo = tipoMensaje === id;
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          setTipoMensaje(id);
                          if (id === 'texto') setForm((f) => ({ ...f, imagen: '' }));
                        }}
                        className={classNames(
                          'flex flex-col items-center gap-1.5 rounded-2xl px-3 py-4 transition-all duration-200',
                          activo
                            ? 'bg-brand-500 text-white shadow-md'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        )}
                      >
                        <Icono size={20} />
                        <span className="text-xs font-semibold">{texto}</span>
                        <span
                          className={classNames(
                            'text-[10px]',
                            activo ? 'text-white/70' : 'text-gray-400'
                          )}
                        >
                          {nota}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <textarea
                  id="editor-campana"
                  value={form.mensaje}
                  onChange={(e) => setForm((f) => ({ ...f, mensaje: e.target.value }))}
                  rows={7}
                  placeholder="Escribí el mensaje, o pedile a Chispita que lo escriba."
                  className={classNames(
                    'w-full resize-none rounded-t-xl border border-b-0 border-gray-200 px-4 py-3 text-sm leading-relaxed focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
                    pasadoDeLargo && 'border-warning-300'
                  )}
                />

                {/* La barra de herramientas, pegada abajo del editor. */}
                <div className="flex flex-wrap items-center gap-1.5 rounded-b-xl border border-gray-200 bg-gray-50/80 px-3 py-2">
                  {[
                    ['{NOMBRE}', 'Nombre'],
                    ['🔥', '🔥'],
                    ['🍔', '🍔'],
                    ['🛵', '🛵'],
                    ['👋', '👋'],
                  ].map(([valor, etiqueta]) => (
                    <button
                      key={valor}
                      onClick={() => insertarEnEditor(valor)}
                      className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-100"
                    >
                      {etiqueta}
                    </button>
                  ))}

                  <button
                    onClick={() => insertarEnEditor(' https://modosabor.com.ar ')}
                    title="Pegar el link de la web. WhatsApp le arma la tarjeta solo."
                    className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-100"
                  >
                    <LinkIcon size={13} /> Link
                  </button>

                  <span
                    className={classNames(
                      'ml-auto text-xs tabular-nums',
                      pasadoDeLargo ? 'font-semibold text-warning-600' : 'text-gray-400'
                    )}
                  >
                    {fmtNum(form.mensaje.length)} / {fmtNum(limiteTexto)}
                  </span>
                </div>

                {pasadoDeLargo && (
                  <p className="mt-1.5 text-xs leading-relaxed text-warning-700">
                    Con foto, WhatsApp muestra hasta 1.024 caracteres y el resto queda escondido
                    detrás de un &quot;ver más&quot;. Conviene acortarlo o mandarlo sin foto.
                  </p>
                )}
              </div>

              {tipoMensaje !== 'texto' && (
                <Adjunto
                  valor={form.imagen}
                  onCambiar={(path) => setForm((f) => ({ ...f, imagen: path }))}
                />
              )}
            </Card>

            {/* ── Que lo escriba Chispita ───────────────────────────── */}
            <Card className="border-2 border-violet-100 bg-gradient-to-br from-violet-50/60 to-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                  <Sparkles size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-gray-900">Que lo escriba Chispita</h3>
                  <p className="text-xs text-gray-500">
                    Escribe con el menú y los precios de verdad. Vos revisás antes de mandar.
                  </p>
                </div>
              </div>

              <div className="mb-2 flex flex-wrap gap-1.5">
                {[
                  'El menú de hoy',
                  'Una promo para el finde',
                  'Recuperar a los que no vienen',
                  'Presentar un plato nuevo',
                  'Avisar que abrimos',
                ].map((atajo) => (
                  <button
                    key={atajo}
                    onClick={() => redactar(atajo)}
                    disabled={redactando}
                    className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-violet-700 shadow-sm ring-1 ring-violet-100 transition-colors hover:bg-violet-50 disabled:opacity-50"
                  >
                    {atajo}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  value={temaIa}
                  onChange={(e) => setTemaIa(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && redactar(temaIa)}
                  placeholder="O contale qué querés decir…"
                  className="flex-1 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
                <Button
                  variant="primary"
                  onClick={() => redactar(temaIa)}
                  disabled={redactando || !temaIa.trim()}
                  className="!bg-violet-600 hover:!bg-violet-700"
                >
                  {redactando ? (
                    <RefreshCw size={15} className="animate-spin" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  {redactando ? `Escribiendo… ${segundosIa}s` : 'Escribir'}
                </Button>
              </div>

              {redactando && segundosIa >= 6 && (
                <p className="mt-2 text-xs leading-relaxed text-violet-700">
                  {segundosIa < 20
                    ? 'Está pensando. A veces tarda unos segundos.'
                    : 'La IA principal no contesta y está probando las de respaldo. Puede tardar hasta medio minuto.'}
                </p>
              )}
            </Card>

            {/* ── A quién y cómo ───────────────────────────────────── */}
            <Card className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.simulacro}
                    onChange={(e) => setForm((f) => ({ ...f, simulacro: e.target.checked }))}
                    className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                  Modo prueba
                </label>

                <select
                  value={form.segmento}
                  onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value }))}
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  {segmentos.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre} · {s.total}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  variant="primary"
                  onClick={() => setPaso(2)}
                  disabled={!form.mensaje.trim()}
                >
                  Continuar <ArrowRight size={16} />
                </Button>
              </div>
            </Card>
          </div>

          {/* ── El teléfono ────────────────────────────────────────── */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
              Así le llega a {ejemplo.nombre}
            </p>

            <div className="overflow-hidden rounded-[2rem] border-[10px] border-gray-900 bg-[#ece5dd] shadow-2xl">
              <div className="flex items-center gap-2.5 bg-gradient-to-r from-[#128c7e] to-[#075e54] px-3 py-2.5 text-white">
                <ArrowLeft size={16} className="opacity-80" />
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-sm">
                  🍔
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">Modo Sabor</p>
                  <p className="text-[10px] opacity-80">en línea</p>
                </div>
              </div>

              <div
                className="min-h-[22rem] space-y-2 p-3"
                style={{
                  backgroundImage: 'radial-gradient(rgba(0,0,0,.045) 1px, transparent 1px)',
                  backgroundSize: '16px 16px',
                }}
              >
                <div className="max-w-[92%] overflow-hidden rounded-xl rounded-bl-sm bg-white shadow-sm">
                  {tipoMensaje === 'foto' && form.imagen && (
                    <img src={form.imagen} alt="" className="max-h-48 w-full object-cover" />
                  )}

                  {tipoMensaje === 'pdf' && form.imagen && (
                    <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50 px-3 py-2.5">
                      <FileText size={20} className="flex-shrink-0 text-danger-500" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-gray-700">
                          {String(form.imagen).split('/').pop()}
                        </p>
                        <p className="text-[10px] text-gray-400">PDF</p>
                      </div>
                    </div>
                  )}

                  {/*
                    La tarjeta del link, como la arma WhatsApp cuando encuentra
                    una dirección en el texto. Se muestra sola: es lo que hace
                    innecesario un campo aparte para el link.
                  */}
                  {linkEnTexto && !form.imagen && (
                    <div className="m-2 mb-0 overflow-hidden rounded-lg bg-gray-50">
                      <div className="flex h-16 items-center justify-center bg-gradient-to-br from-brand-100 to-brand-50 text-2xl">
                        🍔
                      </div>
                      <div className="px-2.5 py-2">
                        <p className="text-[11px] font-semibold text-gray-800">Modo Sabor</p>
                        <p className="truncate text-[10px] text-gray-500">{linkEnTexto}</p>
                      </div>
                    </div>
                  )}

                  <p className="whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-relaxed text-gray-800">
                    {textoVista || (
                      <span className="text-gray-400">Acá va a aparecer lo que escribas.</span>
                    )}
                  </p>
                  <p className="px-3 pb-2 text-right text-[10px] text-gray-400">
                    20:14 <span className="text-sky-500">✓✓</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <Button variant="outline" className="w-full" onClick={cambiarEjemplo}>
                <RefreshCw size={14} /> Ver con otro cliente
              </Button>

              <Button
                variant="secondary"
                className="w-full"
                onClick={mandarmePrueba}
                disabled={!form.mensaje.trim() || probando}
              >
                <Smartphone size={14} /> {probando ? 'Mandando…' : 'Mandármela a mí'}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={guardarComoPlantilla}
                disabled={!form.mensaje.trim()}
              >
                <Plus size={14} /> Guardar como plantilla
              </Button>
            </div>
          </div>
        </div>
      )}

      {paso === 2 && (
        <Card className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Revisión</h3>
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Nombre</span>
              <span className="font-medium">{form.nombre || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Mensaje</span>
              <span className="font-medium max-w-xs truncate">{form.mensaje}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Segmento</span>
              <span className="font-medium">{form.segmento}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Modo</span>
              <span className="font-medium">{form.simulacro ? 'Simulacro' : 'Envío real'}</span>
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="whatsapp-programada-para" className="text-sm text-gray-600">
              Programar para (opcional)
            </label>
            <input
              id="whatsapp-programada-para"
              type="datetime-local"
              value={form.programadaPara}
              onChange={(e) => setForm((f) => ({ ...f, programadaPara: e.target.value }))}
              className="mt-1 w-full px-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" onClick={() => setPaso(1)}>
              Volver
            </Button>
            <div className="flex gap-2">
              {form.programadaPara && (
                <Button variant="secondary" onClick={onProgramar} disabled={ocupado}>
                  <Calendar size={16} /> Programar
                </Button>
              )}
              <Button variant="primary" onClick={handlePreparar} disabled={ocupado}>
                {form.simulacro ? 'Simular' : 'Enviar'} <Send size={16} />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {paso === 3 && preview && (
        <Card className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Resultado</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Destinatarios</span>
              <span className="font-bold text-gray-900">{fmtNum(preview.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Turno</span>
              <span className="font-medium">{preview.turnoClave}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Modo</span>
              <Badge variant={preview.simulacro ? 'warning' : 'brand'}>
                {preview.simulacro ? 'Simulacro' : 'Real'}
              </Badge>
            </div>
          </div>
          <div className="mt-6 flex justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setPaso(1);
                setPreview(null);
              }}
            >
              Nueva campaña
            </Button>
            <Button variant="primary" onClick={onEnviar} disabled={ocupado}>
              Confirmar y enviar <Send size={16} />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/**
 * Plantillas: crear, editar, borrar y usar.
 *
 * Antes eran diecinueve líneas: una lista para mirar. Los tres endpoints
 * —crear, borrar y guardar— existían desde el principio y no había un solo
 * botón que los llamara, así que las plantillas sólo se podían crear entrando
 * a la base a mano.
 *
 * "Usar" abre el compositor con el texto adentro. Sin eso, tener la plantilla
 * guardada no ahorra nada: había que ir a Nueva campaña y buscarla en un
 * desplegable.
 */
function PlantillasVista({ plantillas, segmentos, refrescar, onUsar }) {
  const { dialogo, pedir } = useConfirmacion();
  const [editando, setEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const vacia = { nombre: '', mensaje: '', segmento: 'todos' };

  const guardar = async () => {
    if (!editando?.nombre?.trim() || !editando?.mensaje?.trim()) {
      toast.error('Falta el nombre o el mensaje');
      return;
    }
    setGuardando(true);
    try {
      await api.post('/whatsapp/plantillas', {
        nombre: editando.nombre.trim(),
        mensaje: editando.mensaje.trim(),
        segmento: editando.segmento || 'todos',
        imagen: editando.imagen || '',
      });
      toast.success('Plantilla guardada');
      setEditando(null);
      await refrescar();
    } catch (e) {
      toast.error(e?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = (p) =>
    pedir({
      titulo: `¿Borrar "${p.nombre}"?`,
      detalle:
        'La plantilla desaparece de la lista. Las campañas que ya se mandaron con ella no se tocan.',
      textoOk: 'Borrar',
      peligro: true,
      onOk: async () => {
        try {
          await api.delete(`/whatsapp/plantillas/${p.id}`);
          toast.success('Borrada');
          await refrescar();
        } catch (e) {
          toast.error(e?.error || 'No se pudo borrar');
        }
      },
    });

  return (
    <div className="space-y-4">
      {dialogo}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Plantillas</h2>
        {!editando && (
          <Button variant="primary" onClick={() => setEditando(vacia)}>
            <Plus size={15} /> Nueva plantilla
          </Button>
        )}
      </div>

      {editando && (
        <Card className="space-y-3 p-5">
          <h3 className="text-sm font-bold text-gray-900">
            {editando.id ? 'Editar plantilla' : 'Nueva plantilla'}
          </h3>

          <input
            value={editando.nombre}
            onChange={(e) => setEditando((p) => ({ ...p, nombre: e.target.value }))}
            placeholder="Nombre de la plantilla"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />

          <textarea
            value={editando.mensaje}
            onChange={(e) => setEditando((p) => ({ ...p, mensaje: e.target.value }))}
            rows={5}
            placeholder="El mensaje. Podés usar {NOMBRE}."
            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />

          <select
            value={editando.segmento}
            onChange={(e) => setEditando((p) => ({ ...p, segmento: e.target.value }))}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          >
            {(segmentos || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <Button variant="primary" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button variant="ghost" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {plantillas.map((p) => (
          <Card key={p.id} className="flex flex-col p-5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <h4 className="min-w-0 flex-1 font-semibold text-gray-900">{p.nombre}</h4>
              <Badge variant="info">{p.segmento || 'todos'}</Badge>
            </div>
            <p className="line-clamp-4 flex-1 whitespace-pre-wrap text-sm text-gray-600">
              {p.mensaje}
            </p>
            <div className="mt-4 flex gap-2 border-t border-gray-50 pt-3">
              <Button size="sm" variant="primary" onClick={() => onUsar?.(p)}>
                <Send size={13} /> Usar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditando({ ...p, id: undefined, nombre: `${p.nombre} (copia)` })}
              >
                Duplicar
              </Button>
              <button
                onClick={() => borrar(p)}
                className="ml-auto rounded-lg p-2 text-gray-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                title="Borrar"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </Card>
        ))}

        {plantillas.length === 0 && !editando && (
          <div className="md:col-span-2">
            <Empty
              icon={RefreshCw}
              accion={
                <Button variant="primary" onClick={() => setEditando(vacia)}>
                  <Plus size={15} /> Crear la primera
                </Button>
              }
            >
              Todavía no guardaste ninguna plantilla. Sirven para no reescribir el mismo mensaje
              cada vez.
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Contestarle a alguien sin agarrar el teléfono.
 *
 * ── Por qué avisa que el bot se retira ─────────────────────────────────────
 *
 * Cuando una persona responde, el bot se calla 30 minutos en ese chat. Está
 * bien que lo haga —dos voces contestando lo mismo es peor que una—, pero
 * antes pasaba en silencio: nadie sabía que ese chat había quedado mudo. Ya
 * nos costó una hora buscando un bot roto que estaba funcionando exactamente
 * como tenía que funcionar.
 *
 * Ahora se dice en pantalla, con el botón para devolvérselo enseguida.
 */
function CajaRespuesta({ telefono, conversacionId, onListo }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [silenciado, setSilenciado] = useState(null);

  const mandar = async () => {
    const limpio = texto.trim();
    if (!limpio) return;
    setEnviando(true);
    try {
      const r = await api.post('/whatsapp/responder', { telefono, texto: limpio });
      setTexto('');
      setSilenciado(r?.botSilenciado ? r : null);
      toast.success('Mensaje enviado');
      onListo?.();
    } catch (e) {
      toast.error(e?.error || 'No se pudo mandar');
    } finally {
      setEnviando(false);
    }
  };

  const devolverAlBot = async () => {
    const id = silenciado?.conversacionId || conversacionId;
    if (!id) return;
    try {
      await api.put(`/whatsapp/conversaciones/${id}/control`, { accion: 'devolver' });
      setSilenciado(null);
      toast.success('El bot vuelve a atender este chat');
    } catch (e) {
      toast.error(e?.error || 'No se pudo devolver');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              mandar();
            }
          }}
          placeholder="Escribí la respuesta…"
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
        <Button variant="primary" onClick={mandar} disabled={enviando || !texto.trim()}>
          <Send size={15} /> {enviando ? 'Mandando…' : 'Mandar'}
        </Button>
      </div>

      {silenciado && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warning-50 px-3 py-2.5 text-xs text-warning-800">
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span className="flex-1 leading-relaxed">
            El bot se retiró de este chat por {silenciado.minutosSilencio} minutos, para no
            contestar encima tuyo.
          </span>
          <button
            onClick={devolverAlBot}
            className="font-semibold underline underline-offset-2 hover:no-underline"
          >
            Que siga el bot
          </button>
        </div>
      )}
    </div>
  );
}

function RespuestasVista({ respuestas, refrescar }) {
  const [respondiendo, setRespondiendo] = useState(null);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Respuestas recientes</h2>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Teléfono</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Mensaje</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Fecha</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {respuestas.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium">{r.telefonoLegible || r.telefono}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{r.texto || '-'}</td>
                    <td className="px-4 py-3">
                      {Number(r.es_baja) ? (
                        <Badge variant="danger">Baja</Badge>
                      ) : (
                        <Badge variant="success">Respuesta</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(r.recibido_en)}</td>
                    <td className="px-4 py-3 text-right">
                      {/*
                        A quien pidió la baja no se le contesta desde acá. El
                        servidor igual lo rechaza, pero ofrecer el botón sería
                        invitar a un error que después se paga con un reporte.
                      */}
                      {!Number(r.es_baja) && (
                        <button
                          onClick={() => setRespondiendo(respondiendo === r.id ? null : r.id)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50"
                        >
                          {respondiendo === r.id ? 'Cerrar' : 'Responder'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {respondiendo === r.id && (
                    <tr className="bg-gray-50/60">
                      <td colSpan={5} className="px-4 py-3">
                        <CajaRespuesta telefono={r.telefono} onListo={() => refrescar?.()} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {respuestas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <Empty icon={MessageSquare}>Sin respuestas.</Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BajasVista({ bajas, onQuitar }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Bajas y bloqueados</h2>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Teléfono</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Motivo</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Acción</th>
              </tr>
            </thead>
            <tbody>
              {bajas.map((b) => (
                <tr key={b.telefono} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium">{b.telefonoLegible || b.telefono}</td>
                  <td className="px-4 py-3 text-gray-600">{b.motivo || 'Baja solicitada'}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => onQuitar(b.telefono)}>
                      Habilitar
                    </Button>
                  </td>
                </tr>
              ))}
              {bajas.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8">
                    <Empty icon={Shield}>No hay bajas.</Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/**
 * Las perillas del motor, con su explicación al lado.
 *
 * ── De dónde salen ─────────────────────────────────────────────────────────
 *
 * Son exactamente las de `server/services/whatsappMasivo/reglas.js`. Antes la
 * pantalla ofrecía tres campos, y uno de ellos —"pausa mínima (segundos)"— no
 * existía en el motor: se guardaba en la base y no lo leía nadie. Una perilla
 * que parece que hace algo es peor que no tenerla.
 *
 * ── Por qué cada una tiene un párrafo ──────────────────────────────────────
 *
 * Estos números deciden si WhatsApp limita el número del local. Un campo que
 * dice "maxPorVentana" y nada más se toca a ciegas, y tocarlo a ciegas acá
 * sale caro.
 */
const PERILLAS_MOTOR = [
  {
    grupo: 'El ritmo',
    campos: [
      {
        clave: 'demoraMinMs',
        label: 'Esperar como mínimo',
        unidad: 'ms',
        ayuda:
          'Entre un mensaje y el siguiente. La espera es un valor al azar entre el mínimo y el máximo: una cadencia exacta es la firma más obvia de un robot.',
      },
      { clave: 'demoraMaxMs', label: 'Esperar como máximo', unidad: 'ms' },
      {
        clave: 'pausaLargaCada',
        label: 'Pausa larga cada',
        unidad: 'mensajes',
        ayuda: 'Cada tantos mensajes se toma un descanso, como si dejaras el teléfono un rato.',
      },
      { clave: 'pausaLargaSegundos', label: 'Duración de la pausa larga', unidad: 'seg' },
    ],
  },
  {
    grupo: 'Los techos',
    campos: [
      {
        clave: 'maxPorVentana',
        label: 'Máximo por ventana',
        unidad: 'mensajes',
        ayuda:
          'Es el freno que evita el pico repentino, que es lo que más rápido dispara la alarma del otro lado.',
      },
      { clave: 'ventanaMinutos', label: 'Ventana', unidad: 'min' },
      {
        clave: 'maxPorCorrida',
        label: 'Máximo por corrida',
        unidad: 'mensajes',
        ayuda: 'Cuánto sale de una sentada antes de cortar o esperar a la próxima tanda.',
      },
      { clave: 'esperaEntreTandasMinutos', label: 'Espera entre tandas', unidad: 'min' },
    ],
  },
  {
    grupo: 'Arrancar despacio',
    campos: [
      {
        clave: 'calentamientoInicio',
        label: 'El primer día',
        unidad: 'mensajes',
        ayuda:
          'Para un número nuevo o uno que estuvo callado mucho tiempo. Empieza bajo y sube todos los días.',
      },
      { clave: 'calentamientoIncremento', label: 'Sube por día', unidad: 'mensajes' },
    ],
  },
  {
    grupo: 'Si algo falla',
    campos: [
      {
        clave: 'reintentos',
        label: 'Reintentos',
        unidad: 'veces',
        ayuda: 'Si un mensaje no sale, cuántas veces más se prueba antes de darlo por perdido.',
      },
    ],
  },
];

const LLAVES_MOTOR = [
  {
    clave: 'modoTandas',
    label: 'Mandar por tandas',
    ayuda: 'En vez de cortar al llegar al máximo por corrida, espera y sigue.',
  },
  {
    clave: 'calentamientoActivo',
    label: 'Arrancar despacio y subir',
    ayuda: 'Usa los valores de arriba en lugar del techo diario completo.',
  },
  {
    clave: 'noRepetirMismoTurno',
    label: 'Nunca dos veces en el mismo turno',
    ayuda: 'Aunque una persona entre en dos campañas del mismo turno, recibe una sola.',
  },
];

const DIAS_SEMANA = [
  [0, 'Dom'],
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mié'],
  [4, 'Jue'],
  [5, 'Vie'],
  [6, 'Sáb'],
];

function Llave({ prendida, onCambiar, disabled }) {
  return (
    <button
      onClick={() => !disabled && onCambiar(!prendida)}
      disabled={disabled}
      className={classNames(
        'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50',
        prendida ? 'bg-success-500' : 'bg-gray-300'
      )}
    >
      <span
        className={classNames(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200',
          prendida ? 'left-[22px]' : 'left-0.5'
        )}
      />
    </button>
  );
}

function ConfigVista({ config, onGuardar, estado, gateway, onGateway, onConectar, onDesconectar }) {
  const { dialogo, pedir } = useConfirmacion();
  const whatsapp = estado?.whatsapp || {};
  const conectado = whatsapp.estado === 'conectado';
  const diasSinEnvio = Array.isArray(config.diasSinEnvio) ? config.diasSinEnvio : [];

  return (
    <div className="max-w-3xl space-y-5">
      {dialogo}

      {/* ── El teléfono ──────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-gray-900">El teléfono</h2>
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-4">
            <span
              className={classNames(
                'flex h-12 w-12 items-center justify-center rounded-2xl',
                conectado ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600'
              )}
            >
              <Smartphone size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900">
                {conectado ? 'Conectado' : 'Sin conectar'}
              </p>
              <p className="mt-0.5 text-sm text-gray-500">
                {conectado
                  ? whatsapp.numero || 'Número vinculado'
                  : whatsapp.detalle || 'Escaneá el código con el WhatsApp del local'}
              </p>
            </div>

            {conectado ? (
              <Button
                variant="outline"
                onClick={() =>
                  pedir({
                    titulo: '¿Desvincular el teléfono?',
                    detalle:
                      'El bot deja de atender y las campañas dejan de salir hasta que alguien escanee el código otra vez con el teléfono del local. Si no lo tenés a mano, no lo hagas ahora.',
                    textoOk: 'Desvincular',
                    peligro: true,
                    onOk: onDesconectar,
                  })
                }
              >
                Desvincular
              </Button>
            ) : (
              <Button variant="primary" onClick={onConectar}>
                Conectar
              </Button>
            )}
          </div>

          {/*
            El QR ya venía dibujado del servidor desde siempre —se genera acá
            adentro justamente para no mandárselo a un servicio ajeno, porque
            quien tiene ese código puede meterse al WhatsApp del local— y la
            pantalla nunca lo mostró.
          */}
          {whatsapp.qrImagen && (
            <div className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-gray-50 p-6">
              <img src={whatsapp.qrImagen} alt="Código QR" className="h-56 w-56 rounded-xl" />
              <p className="max-w-xs text-center text-xs leading-relaxed text-gray-500">
                WhatsApp → Dispositivos vinculados → Vincular un dispositivo. El código vence en un
                minuto y se renueva solo.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Los interruptores ────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-gray-900">Qué está prendido</h2>
        <Card className="divide-y divide-gray-100 p-0">
          {[
            {
              clave: 'atencionIa',
              label: 'El agente atiende por WhatsApp',
              ayuda: 'Si lo apagás, nadie contesta los mensajes que entran.',
            },
            {
              clave: 'masivos',
              label: 'Se pueden mandar campañas',
              ayuda: 'Apagarlo frena los envíos masivos sin tocar la atención.',
            },
            {
              clave: 'pausaTotal',
              label: 'Pausa total',
              ayuda: 'Corta todo de una: atención y campañas. Es el botón rojo.',
              invertido: true,
            },
          ].map((item) => (
            <div key={item.clave} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p
                  className={classNames(
                    'text-sm font-medium',
                    item.invertido ? 'text-danger-700' : 'text-gray-900'
                  )}
                >
                  {item.label}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{item.ayuda}</p>
              </div>
              <Llave
                prendida={Boolean(gateway?.[item.clave])}
                onCambiar={(valor) => {
                  if (item.clave === 'pausaTotal' && valor) {
                    pedir({
                      titulo: '¿Cortar todo?',
                      detalle:
                        'Deja de contestar mensajes y de mandar campañas. Los clientes que escriban no van a recibir respuesta de nadie hasta que lo vuelvas a prender.',
                      textoOk: 'Cortar todo',
                      peligro: true,
                      onOk: () => onGateway(item.clave, valor),
                    });
                    return;
                  }
                  onGateway(item.clave, valor);
                }}
              />
            </div>
          ))}
        </Card>
      </div>

      {/* ── Las perillas ─────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-1 text-lg font-bold text-gray-900">Ritmo y seguridad</h2>
        <p className="mb-3 text-sm leading-relaxed text-gray-500">
          Estos números deciden si WhatsApp limita el número del local — y ese número es el que usan
          tus clientes para pedir. Si no estás seguro, dejalos como están.
        </p>

        {PERILLAS_MOTOR.map((seccion) => (
          <Card key={seccion.grupo} className="mb-3 p-5">
            <h3 className="mb-4 text-sm font-bold text-gray-900">{seccion.grupo}</h3>
            <div className="space-y-4">
              {seccion.campos.map((campo) => (
                <div key={campo.clave}>
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 text-sm font-medium text-gray-700">
                      {campo.label}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={config[campo.clave] ?? ''}
                      onChange={(e) => onGuardar(campo.clave, Number(e.target.value))}
                      className="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm tabular-nums focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    />
                    <span className="w-16 text-xs text-gray-400">{campo.unidad}</span>
                  </div>
                  {campo.ayuda && (
                    <p className="mt-1 pr-40 text-xs leading-relaxed text-gray-500">
                      {campo.ayuda}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}

        <Card className="mb-3 divide-y divide-gray-100 p-0">
          {LLAVES_MOTOR.map((item) => (
            <div key={item.clave} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{item.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{item.ayuda}</p>
              </div>
              <Llave
                prendida={Boolean(config[item.clave])}
                onCambiar={(valor) => onGuardar(item.clave, valor)}
              />
            </div>
          ))}
        </Card>

        <Card className="p-5">
          <h3 className="mb-1 text-sm font-bold text-gray-900">Días que no se manda</h3>
          <p className="mb-3 text-xs leading-relaxed text-gray-500">
            Los días marcados no sale ninguna campaña, aunque esté programada.
          </p>
          <div className="flex flex-wrap gap-2">
            {DIAS_SEMANA.map(([num, texto]) => {
              const marcado = diasSinEnvio.includes(num);
              return (
                <button
                  key={num}
                  onClick={() =>
                    onGuardar(
                      'diasSinEnvio',
                      marcado ? diasSinEnvio.filter((d) => d !== num) : [...diasSinEnvio, num]
                    )
                  }
                  className={classNames(
                    'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                    marcado
                      ? 'bg-danger-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {texto}
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Navegación ────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'nueva', label: 'Nueva campaña', icon: Send },
  { id: 'campanas', label: 'Campañas', icon: List },
  { id: 'contactos', label: 'Contactos', icon: Users },
  { id: 'conversaciones', label: 'Conversaciones', icon: MessageSquare },
  { id: 'crm', label: 'CRM', icon: Inbox },
  { id: 'plan', label: 'Plan operativo', icon: CheckCircle2 },
  { id: 'plantillas', label: 'Plantillas', icon: RefreshCw },
  { id: 'respuestas', label: 'Respuestas', icon: MessageSquare },
  { id: 'reportes', label: 'Reportes', icon: BarChart3 },
  { id: 'bajas', label: 'Bajas', icon: Shield },
  { id: 'config', label: 'Configuración', icon: Settings2 },
];

// ── Componente principal ──────────────────────────────────────────────────

export default function WhatsAppMasivo() {
  const [vista, setVista] = useState('dashboard');
  const contenedorRef = useRef(null);
  useEffect(() => {
    contenedorRef.current?.scrollTo({ top: 0 });
  }, [vista]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    mensaje: '',
    imagen: '',
    adjuntoNombre: '',
    simulacro: true,
    segmento: 'todos',
    programadaPara: '',
    /*
      Vacío quiere decir "usá el segmento". Se llena sólo cuando la campaña
      sale de un "insistir", donde los destinatarios ya están elegidos uno por
      uno y no hay que volver a filtrarlos.
    */
    clientesIds: null,
  });

  const data = useData();
  const {
    estado,
    contactos,
    campanas,
    respuestas,
    bajas,
    segmentos,
    plantillas,
    config,
    planOperativo,
    crm,
    cierre,
    recordatorios,
    refrescar,
    setRecordatorios,
  } = data;

  const whatsapp = estado.whatsapp || {};
  const conectado = whatsapp.estado === 'conectado';

  const controlarMotor = async (accion) => {
    setOcupado(true);
    try {
      await api.post(`/whatsapp/${accion}`);
      toast.success(
        accion === 'pausar' ? 'Pausado' : accion === 'reanudar' ? 'Reanudado' : 'Detenido'
      );
      await refrescar();
    } catch (e) {
      toast.error('No se pudo controlar el motor');
    } finally {
      setOcupado(false);
    }
  };

  const preparar = async () => {
    setOcupado(true);
    try {
      const res = await api.post('/whatsapp/preparar', {
        mensaje: form.mensaje,
        nombre: form.nombre,
        imagen: form.imagen,
        simulacro: form.simulacro,
        segmento: form.segmento,
        /*
          Cuando la campaña viene de un "insistir", los destinatarios ya están
          elegidos y mandan ellos: el segmento no tiene que volver a filtrar
          nada. Sin esto, la lista de los que no contestaron se perdía entre
          preparar y enviar.
        */
        clientesIds: form.clientesIds?.length ? form.clientesIds : null,
      });
      setPreview(res);
    } catch (e) {
      toast.error(e?.error || 'No se pudo preparar');
    } finally {
      setOcupado(false);
    }
  };

  const enviar = async () => {
    if (!preview?.campanaId) return;
    if (
      !window.confirm(
        `¿Confirmás ${preview.simulacro ? 'el simulacro' : 'el envío'} a ${fmtNum(preview.total)} contactos?`
      )
    )
      return;
    setOcupado(true);
    try {
      await api.post('/whatsapp/enviar', { campanaId: preview.campanaId });
      toast.success('Campaña iniciada');
      setPreview(null);
      setVista('dashboard');
      await refrescar();
    } catch (e) {
      toast.error(e?.error || 'No se pudo enviar');
    } finally {
      setOcupado(false);
    }
  };

  const programar = async () => {
    if (!preview?.campanaId || !form.programadaPara) {
      toast.error('Elegí fecha y hora');
      return;
    }
    setOcupado(true);
    try {
      await api.post('/whatsapp/programar', {
        campanaId: preview.campanaId,
        programadaPara: form.programadaPara,
      });
      toast.success('Programada');
      setPreview(null);
      setVista('campanas');
      await refrescar();
    } catch (e) {
      toast.error(e?.error || 'No se pudo programar');
    } finally {
      setOcupado(false);
    }
  };

  const quitarBaja = async (telefono) => {
    try {
      await api.delete(`/whatsapp/excluidos/${encodeURIComponent(telefono)}`);
      toast.success('Habilitado');
      await refrescar();
    } catch (e) {
      toast.error('No se pudo habilitar');
    }
  };

  const guardarConfig = async (clave, valor) => {
    try {
      await api.put('/whatsapp/config', { [clave]: valor });
      await refrescar();
    } catch (e) {
      toast.error(e?.error || 'No se pudo guardar');
    }
  };

  /*
    Los cuatro interruptores del gateway. El endpoint existía y no lo llamaba
    nadie: para prender o apagar la atención había que entrar a la base a mano,
    que es exactamente lo que tuvimos que hacer en producción.
  */
  const cambiarGateway = async (clave, valor) => {
    try {
      await api.put('/whatsapp/gateway', { [clave]: valor });
      toast.success('Guardado');
      await refrescar();
    } catch (e) {
      toast.error(e?.error || 'No se pudo cambiar');
    }
  };

  const conectarWhatsapp = async () => {
    try {
      await api.post('/whatsapp/conectar');
      toast.success('Generando el código, esperá unos segundos');
      await refrescar();
    } catch (e) {
      toast.error(e?.error || 'No se pudo conectar');
    }
  };

  const desconectarWhatsapp = async () => {
    try {
      await api.post('/whatsapp/desconectar');
      toast.success('Teléfono desvinculado');
      await refrescar();
    } catch (e) {
      toast.error(e?.error || 'No se pudo desvincular');
    }
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        className={classNames(
          'flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        <div className="h-16 flex items-center px-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white flex-shrink-0">
            <MessageCircle size={18} />
          </div>
          {sidebarOpen && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="ml-3 font-bold text-gray-900 text-sm truncate"
            >
              WhatsApp Masivo
            </motion.span>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const activo = vista === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  /*
                    Entrar a "Nueva campaña" desde el menú es empezar de cero.
                    Sin esto, si venías de un "insistir" los destinatarios de
                    esa lista quedaban pegados en silencio y la campaña
                    siguiente le escribía a ellos en vez de al segmento
                    elegido.
                  */
                  if (item.id === 'nueva') {
                    setForm((f) => ({ ...f, clientesIds: null }));
                    setPreview(null);
                  }
                  setVista(item.id);
                }}
                className={classNames(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  activo
                    ? 'bg-brand-50 text-brand-700 shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
                title={!sidebarOpen ? item.label : undefined}
              >
                <Icon
                  size={18}
                  className={classNames(
                    'flex-shrink-0',
                    activo ? 'text-brand-500' : 'text-gray-400'
                  )}
                />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="w-full flex items-center justify-center p-2 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            {sidebarOpen ? (
              <ChevronRight size={18} className="rotate-180" />
            ) : (
              <ChevronRight size={18} />
            )}
          </button>
        </div>
      </motion.aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <div>
            <h1 className="text-base font-bold text-gray-900">
              {NAV_ITEMS.find((n) => n.id === vista)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100">
              <span
                className={classNames(
                  'w-2 h-2 rounded-full',
                  conectado ? 'bg-success-500 animate-pulse' : 'bg-danger-500'
                )}
              />
              <span className="text-xs font-medium text-gray-600">
                {conectado ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <Button size="sm" variant="primary" onClick={() => setVista('nueva')}>
              <Send size={14} /> Nueva
            </Button>
            <button
              onClick={refrescar}
              disabled={data.loading}
              className="p-2 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={data.loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/*
          Al cambiar de sección hay que volver arriba.

          Sin esto, si venías con el tablero scrolleado y tocabas Contactos, la
          pantalla nueva aparecía a mitad de camino: se veía un espacio en
          blanco y parecía que la sección estaba rota. Me pasó revisando esto
          mismo y di por rota una pantalla que andaba bien.
        */}
        <div className="flex-1 overflow-y-auto p-6" ref={contenedorRef}>
          <AnimatePresence mode="wait">
            <motion.div
              key={vista}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {vista === 'dashboard' && (
                <Dashboard
                  data={data}
                  onNuevaCampana={() => setVista('nueva')}
                  onVerCRM={() => setVista('crm')}
                  onVerPlan={() => setVista('plan')}
                  onVerReportes={() => setVista('reportes')}
                />
              )}
              {vista === 'nueva' && (
                <NuevaCampanaVista
                  form={form}
                  setForm={setForm}
                  segmentos={segmentos}
                  plantillas={plantillas}
                  onPreparar={preparar}
                  onEnviar={enviar}
                  onProgramar={programar}
                  preview={preview}
                  setPreview={setPreview}
                  ocupado={ocupado}
                  estado={estado}
                  refrescar={refrescar}
                />
              )}
              {vista === 'campanas' && (
                <CampanasVista
                  campanas={campanas}
                  motor={estado.motor}
                  onControlar={controlarMotor}
                  ocupado={ocupado}
                  onReenviar={(campana, datos) => {
                    /*
                      Se abre el compositor con los destinatarios ya fijados y
                      el texto de la campaña original como punto de partida,
                      pero en modo prueba y con el nombre marcado como
                      insistencia. Nadie debería reenviarle a 300 personas de
                      un clic sin releer lo que va a decir.
                    */
                    setForm((f) => ({
                      ...f,
                      nombre: `Insistencia · ${campana.nombre || `Campaña #${campana.id}`}`,
                      mensaje: campana.mensaje || f.mensaje,
                      imagen: campana.imagen || '',
                      simulacro: true,
                      programadaPara: '',
                      clientesIds: datos.clientesIds,
                    }));
                    setPreview(null);
                    setVista('nueva');
                    toast.success(
                      `${fmtNum(datos.clientesIds.length)} destinatarios listos. Revisá el texto.`
                    );
                  }}
                />
              )}
              {vista === 'contactos' && (
                <ContactosVista
                  contactos={contactos}
                  setContactos={data.setContactos}
                  refrescar={refrescar}
                />
              )}
              {vista === 'conversaciones' && <ConversacionesVista />}
              {vista === 'crm' && <CRMVista crm={crm} refrescar={refrescar} />}
              {vista === 'plan' && (
                <PlanOperativoVista
                  planOperativo={planOperativo}
                  recordatorios={recordatorios}
                  setRecordatorios={setRecordatorios}
                />
              )}
              {vista === 'plantillas' && (
                <PlantillasVista
                  plantillas={plantillas}
                  segmentos={segmentos}
                  refrescar={refrescar}
                  onUsar={(p) => {
                    setForm((f) => ({
                      ...f,
                      nombre: p.nombre,
                      mensaje: p.mensaje,
                      imagen: p.imagen || '',
                      segmento: p.segmento || 'todos',
                      clientesIds: null,
                    }));
                    setPreview(null);
                    setVista('nueva');
                    toast.success('Plantilla cargada. Revisá el texto antes de mandar.');
                  }}
                />
              )}
              {vista === 'respuestas' && (
                <RespuestasVista respuestas={respuestas} refrescar={refrescar} />
              )}
              {vista === 'reportes' && <ReportesVista cierre={cierre} />}
              {vista === 'bajas' && <BajasVista bajas={bajas} onQuitar={quitarBaja} />}
              {vista === 'config' && (
                <ConfigVista
                  config={config}
                  onGuardar={guardarConfig}
                  estado={estado}
                  gateway={estado.gateway}
                  onGateway={cambiarGateway}
                  onConectar={conectarWhatsapp}
                  onDesconectar={desconectarWhatsapp}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
