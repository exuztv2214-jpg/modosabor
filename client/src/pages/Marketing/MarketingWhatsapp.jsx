import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Activity,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  Send,
  Square,
  TestTube2,
  Users,
} from 'lucide-react';

import api from '../../lib/api.js';
import { BRAND, STROKE } from '../../lib/theme.js';

/**
 * WhatsApp masivo.
 *
 * ── Qué cambió respecto de la versión anterior ─────────────────────────────
 *
 * Antes esta pantalla hablaba con un panel que corría en la PC del local, en
 * `127.0.0.1:3847`. Eso quería decir que la promo sólo salía si esa máquina
 * estaba prendida y alguien la había abierto.
 *
 * Ahora habla con el sistema. El envío corre en el servidor, con Baileys, que
 * usa el protocolo de WhatsApp directo y no necesita navegador. Lo único que
 * sigue siendo manual es escanear el QR una vez para vincular el número.
 *
 * ── De dónde sale la lista ─────────────────────────────────────────────────
 *
 * De `clientes`: los que compraron. La app anterior la armaba leyendo los
 * chats del celular, y por eso terminaba mandándole la promo del menú del día
 * a Personal, a +Pagos y a un catering —cualquiera que alguna vez hubiera
 * escrito al número del local.
 */

const fmt = (n) => Number(n || 0).toLocaleString('es-AR');

function Tarjeta({ children, className = '', style }) {
  return (
    <div
      style={style}
      className={`rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

function Dato({ label, valor, unidad, tono }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3">
      <p className="text-[11px] font-medium text-gray-400">{label}</p>
      <p
        className="mt-1 text-[22px] font-semibold leading-none tabular-nums"
        style={{ color: tono || '#111827' }}
      >
        {valor}
        {unidad ? (
          <span className="ml-1 text-[12px] font-normal text-gray-400">{unidad}</span>
        ) : null}
      </p>
    </div>
  );
}

const ESTADOS = {
  conectado: { texto: 'WhatsApp conectado', fondo: '#ECFDF5', color: '#059669' },
  qr: { texto: 'Falta vincular el número', fondo: '#FEF6E7', color: '#B45309' },
  conectando: { texto: 'Conectando…', fondo: '#F1F5F9', color: '#475569' },
  apagado: { texto: 'Sin conectar', fondo: '#F1F5F9', color: '#475569' },
  error: { texto: 'Error de sesión', fondo: '#FEF2F2', color: BRAND },
};

/** Confirmación: acá es donde se ve a cuántos se le va a escribir. */
function Confirmar({ previa, enviando, onCancelar, onConfirmar }) {
  return (
    <Tarjeta style={{ boxShadow: `0 0 0 2px ${BRAND}` }}>
      <p className="text-[15px] font-semibold text-gray-900">
        {previa.simulacro ? 'Simulacro listo' : 'Confirmá el envío'}
      </p>
      <p className="mt-1 text-[13px] text-gray-500">
        {previa.simulacro
          ? 'No se manda nada. Sirve para ver a quiénes les tocaría.'
          : 'Se le va a escribir a esta gente, con las pausas configuradas entre mensaje y mensaje.'}
      </p>

      <div className="mt-4 flex items-baseline gap-2">
        <span
          className="text-[40px] font-semibold leading-none tabular-nums"
          style={{ color: BRAND }}
        >
          {fmt(previa.total)}
        </span>
        <span className="text-[14px] text-gray-500">
          {previa.total === 1 ? 'cliente' : 'clientes'}
        </span>
      </div>

      {previa.dejadosAfuera > 0 ? (
        <p className="mt-2 text-[12px] text-gray-500">
          Quedan {fmt(previa.dejadosAfuera)} para otra corrida: hoy el tope es de {fmt(previa.tope)}
          .
        </p>
      ) : null}

      {previa.muestra?.length ? (
        <div className="mt-4 max-h-40 overflow-y-auto rounded-2xl bg-gray-50 p-3">
          <div className="flex flex-wrap gap-1.5">
            {previa.muestra.map((d) => (
              <span
                key={d.telefono}
                className="rounded-lg bg-white px-2 py-1 text-[11px] text-gray-600 shadow-[0_1px_1px_rgba(15,23,42,0.05)]"
              >
                {d.nombre?.trim() || d.telefono}
              </span>
            ))}
            {previa.total > previa.muestra.length ? (
              <span className="px-2 py-1 text-[11px] text-gray-400">
                y {fmt(previa.total - previa.muestra.length)} más
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          className="h-11 flex-1 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={enviando || !previa.total}
          style={{ background: previa.simulacro ? '#0F172A' : BRAND }}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enviando ? (
            <Loader2 size={15} strokeWidth={STROKE} className="animate-spin" />
          ) : (
            <Send size={15} strokeWidth={STROKE} />
          )}
          {previa.simulacro ? 'Correr simulacro' : `Enviar a ${fmt(previa.total)}`}
        </button>
      </div>
    </Tarjeta>
  );
}

export default function MarketingWhatsapp() {
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState('');
  const [previa, setPrevia] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const montado = useRef(true);

  const traer = useCallback(async () => {
    try {
      const datos = await api.get('/whatsapp/estado');
      if (montado.current) setEstado(datos);
    } catch (error) {
      if (montado.current && error?._httpStatus !== 401) setEstado(null);
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    traer();
    /*
      Mientras hay un envío en curso se pregunta seguido, porque la barra de
      progreso tiene que moverse; el resto del tiempo cada cinco segundos
      alcanza y no se le pega al servidor de gusto.
    */
    const corriendo = estado?.motor?.corriendo;
    const timer = setInterval(traer, corriendo ? 2000 : 5000);
    return () => {
      montado.current = false;
      clearInterval(timer);
    };
  }, [traer, estado?.motor?.corriendo]);

  const avisar = useCallback((error) => {
    toast.error(error?.error || error?.message || 'No se pudo completar la acción');
  }, []);

  const accion = useCallback(
    async (ruta, cuerpo, aviso) => {
      setOcupado(true);
      try {
        const r = await api.post(`/whatsapp/${ruta}`, cuerpo || {});
        if (aviso) toast.success(aviso);
        await traer();
        return r;
      } catch (error) {
        avisar(error);
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [traer, avisar]
  );

  const preparar = useCallback(
    async (simulacro) => {
      setOcupado(true);
      try {
        const datos = await api.post('/whatsapp/preparar', { mensaje, simulacro });
        setPrevia({ ...datos, simulacro });
      } catch (error) {
        avisar(error);
      } finally {
        setOcupado(false);
      }
    },
    [mensaje, avisar]
  );

  const confirmar = useCallback(async () => {
    if (!previa?.campanaId) return;
    const r = await accion('enviar', { campanaId: previa.campanaId }, 'Envío en marcha');
    if (r) setPrevia(null);
  }, [previa, accion]);

  if (cargando) {
    return (
      <Tarjeta>
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 size={16} strokeWidth={STROKE} className="animate-spin" />
          <span className="text-[13px]">Consultando el estado…</span>
        </div>
      </Tarjeta>
    );
  }

  const wa = estado?.whatsapp || {};
  const motor = estado?.motor || {};
  const hoy = estado?.hoy || {};
  const conectado = wa.estado === 'conectado';
  const masivosHabilitados = estado?.gateway?.masivos === true && !estado?.gateway?.pausaTotal;
  const tono = ESTADOS[wa.estado] || ESTADOS.apagado;

  if (!conectado && !motor.corriendo) {
    return (
      <div className="space-y-3">
        <Tarjeta>
          <div className="flex flex-col items-center gap-3 py-3 text-center">
            <p className="text-[15px] font-semibold text-gray-900">WhatsApp no está vinculado</p>
            <p className="max-w-md text-[13px] leading-relaxed text-gray-500">
              La conexión y el único código QR del sistema se administran desde Configuración.
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/admin/configuracion?tab=whatsapp';
              }}
              style={{ background: BRAND }}
              className="h-11 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              Ir a Configuración de WhatsApp
            </button>
          </div>
        </Tarjeta>
        <Tarjeta>
          <div className="flex items-center gap-3">
            <Users size={18} strokeWidth={STROKE} className="text-gray-400" />
            <p className="text-[13px] text-gray-600">
              Hay <b className="font-semibold text-gray-900">{fmt(estado?.pendientes)}</b> clientes
              listos para recibir cuando el número esté vinculado.
            </p>
          </div>
        </Tarjeta>
      </div>
    );
  }

  const pct = motor.stats?.total
    ? Math.round((Number(motor.stats.hechos || 0) / Number(motor.stats.total)) * 100)
    : 0;

  return (
    <div className="space-y-3">
      {/* ── Estado y controles ── */}
      <Tarjeta>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ background: tono.fondo, color: tono.color }}
            >
              {conectado ? (
                <CheckCircle2 size={20} strokeWidth={STROKE} />
              ) : (
                <Activity size={20} strokeWidth={STROKE} />
              )}
            </span>
            <div>
              <p className="text-[15px] font-semibold text-gray-900">{tono.texto}</p>
              <p className="text-[12px] text-gray-500">
                {motor.corriendo
                  ? motor.pausado
                    ? 'Envío pausado'
                    : 'Enviando ahora'
                  : hoy.esDiaDeEnvio === false
                    ? 'Hoy es día de no envío'
                    : `${fmt(estado?.pendientes)} clientes pendientes`}
              </p>
            </div>
          </div>

          {motor.corriendo ? (
            <div className="flex gap-2">
              {motor.pausado ? (
                <button
                  type="button"
                  onClick={() => accion('reanudar', {}, 'Envío reanudado')}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-[13px] font-semibold text-white transition hover:bg-gray-700"
                >
                  <Play size={14} strokeWidth={STROKE} />
                  Reanudar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => accion('pausar', {}, 'Envío pausado')}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  <Pause size={14} strokeWidth={STROKE} />
                  Pausar
                </button>
              )}
              <button
                type="button"
                onClick={() => accion('detener', {}, 'Envío detenido')}
                style={{ color: BRAND, background: '#FEF2F2' }}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition hover:brightness-95"
              >
                <Square size={13} strokeWidth={STROKE} />
                Detener
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => preparar(true)}
                disabled={ocupado || !masivosHabilitados}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
              >
                <TestTube2 size={14} strokeWidth={STROKE} />
                Simulacro
              </button>
              <button
                type="button"
                onClick={() => preparar(false)}
                disabled={ocupado || !mensaje.trim() || !masivosHabilitados}
                style={{ background: mensaje.trim() ? BRAND : '#CBD5E1' }}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed"
              >
                {ocupado ? (
                  <Loader2 size={14} strokeWidth={STROKE} className="animate-spin" />
                ) : (
                  <Send size={14} strokeWidth={STROKE} />
                )}
                Preparar envío
              </button>
            </div>
          )}
        </div>

        {motor.corriendo && motor.stats?.total ? (
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-[12px]">
              <span className="text-gray-500">
                {fmt(motor.stats.hechos)} de {fmt(motor.stats.total)}
                {motor.stats.fallidos > 0 ? ` · ${fmt(motor.stats.fallidos)} fallaron` : ''}
              </span>
              <span className="font-semibold tabular-nums text-gray-700">{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: BRAND }}
              />
            </div>
          </div>
        ) : null}
      </Tarjeta>

      {!masivosHabilitados && !motor.corriendo ? (
        <Tarjeta>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-gray-600">
              Los envíos masivos están apagados. Activarlos no envía nada por sí solo.
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/admin/configuracion?tab=whatsapp';
              }}
              className="h-9 rounded-xl bg-gray-100 px-4 text-[12px] font-semibold text-gray-700"
            >
              Abrir Configuración
            </button>
          </div>
        </Tarjeta>
      ) : null}

      {previa ? (
        <Confirmar
          previa={previa}
          enviando={ocupado}
          onCancelar={() => setPrevia(null)}
          onConfirmar={confirmar}
        />
      ) : null}

      {/* ── Mensaje ── */}
      <Tarjeta>
        <p className="text-[15px] font-semibold text-gray-900">Mensaje del día</p>
        <p className="mt-0.5 text-[13px] text-gray-500">
          El saludo y el cierre se eligen al azar en cada envío, así no salen cien mensajes
          idénticos
        </p>
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          rows={5}
          placeholder={
            'Hoy en Modo Sabor:\n\nMenú económico $5.000 — wok de pollo, canelones, suprema napolitana.\nMenú ejecutivo $7.000 — costeleta a la riojana, milanesa de merluza.'
          }
          className="mt-3 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400"
        />
        <p className="mt-2 text-[12px] text-gray-400">
          Podés usar <code className="rounded bg-gray-100 px-1">{'{NOMBRE}'}</code> y se reemplaza
          por el nombre de cada cliente.
        </p>
      </Tarjeta>

      {/* ── Números del día ── */}
      <Tarjeta>
        <p className="mb-4 text-[15px] font-semibold text-gray-900">Cómo viene el día</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Enviados hoy" valor={fmt(hoy.enviados)} />
          <Dato label="Tope de hoy" valor={fmt(hoy.tope)} />
          <Dato
            label={`Cupo (${hoy.ventanaMinutos || 60} min)`}
            valor={`${fmt(hoy.cupoUsado)}/${fmt(hoy.cupoTotal)}`}
            tono={hoy.cupoTotal && hoy.cupoUsado >= hoy.cupoTotal ? BRAND : undefined}
          />
          <Dato label="Clientes pendientes" valor={fmt(estado?.pendientes)} />
        </div>
      </Tarjeta>
    </div>
  );
}
