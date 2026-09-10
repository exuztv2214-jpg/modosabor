import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Bot,
  CheckCircle2,
  Loader2,
  Megaphone,
  PauseCircle,
  QrCode,
  Unplug,
  UserRound,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';

import api from '../../lib/api.js';
import { BRAND, STROKE } from '../../lib/theme.js';
import {
  InputField,
  SectionCard,
  TextareaField,
  SECRET_PLACEHOLDER,
  limpiarSecretoAlEnfocar,
} from './ConfigComponents.jsx';

function parseShiftRules(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseShifts(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    return Array.isArray(parsed) ? parsed.filter((shift) => shift?.activo !== false) : [];
  } catch {
    return [];
  }
}

function Switch({ checked, disabled, label, description, icon: Icon, onChange }) {
  return (
    <label
      className={`flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-4 ${disabled ? 'opacity-50' : ''}`}
    >
      <span className="flex min-w-0 items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-600">
          <Icon size={18} strokeWidth={STROKE} />
        </span>
        <span>
          <span className="block text-[14px] font-semibold text-gray-900">{label}</span>
          <span className="mt-0.5 block text-[12px] leading-relaxed text-gray-500">
            {description}
          </span>
        </span>
      </span>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 accent-red-600"
      />
    </label>
  );
}

export default function SeccionWhatsapp({ config, setConfig }) {
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [conversaciones, setConversaciones] = useState([]);
  const [paginaChats, setPaginaChats] = useState(0);
  const [totalChats, setTotalChats] = useState(0);
  const [metricas, setMetricas] = useState(null);
  const [probandoEmergencia, setProbandoEmergencia] = useState(false);
  const [resultadoEmergencia, setResultadoEmergencia] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [status, chats, stats] = await Promise.all([
        api.get('/whatsapp/estado'),
        api.get(`/whatsapp/conversaciones?limite=12&offset=${paginaChats * 12}`),
        api.get('/whatsapp/metricas-atencion'),
      ]);
      setEstado(status);
      setConversaciones(chats?.items || []);
      setTotalChats(Number(chats?.total || 0));
      setMetricas(stats || null);
    } catch (error) {
      if (error?._httpStatus !== 401) toast.error(error?.error || 'No se pudo consultar WhatsApp');
    }
  }, [paginaChats]);

  useEffect(() => {
    cargar();
    const timer = setInterval(cargar, 3000);
    return () => clearInterval(timer);
  }, [cargar]);

  const conectar = async () => {
    setOcupado(true);
    try {
      await api.post('/whatsapp/conectar');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo iniciar la vinculación');
    } finally {
      setOcupado(false);
    }
  };

  const desconectar = async () => {
    if (
      !window.confirm(
        '¿Desconectar este dispositivo de WhatsApp? Luego hará falta escanear otro QR.'
      )
    )
      return;
    setOcupado(true);
    try {
      await api.post('/whatsapp/desconectar');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo desconectar WhatsApp');
    } finally {
      setOcupado(false);
    }
  };

  const cambiar = async (campo, valor) => {
    setOcupado(true);
    try {
      const result = await api.put('/whatsapp/gateway', { [campo]: valor });
      setEstado((prev) => ({ ...prev, gateway: result.gateway }));
    } catch (error) {
      toast.error(error?.error || 'No se pudo cambiar la función');
    } finally {
      setOcupado(false);
    }
  };

  const controlarChat = async (id, accion) => {
    setOcupado(true);
    try {
      await api.put(`/whatsapp/conversaciones/${id}/control`, { accion });
      await cargar();
      toast.success(
        accion === 'tomar' ? 'Conversación tomada por el local' : 'Conversación devuelta a Chispita'
      );
    } catch (error) {
      toast.error(error?.error || 'No se pudo cambiar la conversación');
    } finally {
      setOcupado(false);
    }
  };

  const wa = estado?.whatsapp || {};
  const gateway = estado?.gateway || {};
  const conectado = wa.estado === 'conectado';
  const turnos = parseShifts(config?.turnos_negocio || config?.negocio_horarios);
  const reglasTurnos = parseShiftRules(config?.whatsapp_agente_reglas_turnos);
  const respaldoEsGemini = /\b(?:google\s+)?gemini\b/i.test(
    String(config?.whatsapp_emergencia_proveedor || '')
  );
  const conversacionDestacada = Number(
    new URLSearchParams(window.location.search).get('conversacion') || 0
  );

  useEffect(() => {
    if (!conversacionDestacada || !conversaciones.length) return undefined;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`whatsapp-conversacion-${conversacionDestacada}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [conversacionDestacada, conversaciones]);

  const editar = (clave, valor) => {
    setConfig((prev) => ({ ...prev, [clave]: valor }));
  };

  const editarTurno = (turnoId, valor) => {
    editar('whatsapp_agente_reglas_turnos', JSON.stringify({ ...reglasTurnos, [turnoId]: valor }));
  };

  const probarEmergencia = async () => {
    setProbandoEmergencia(true);
    setResultadoEmergencia(null);
    try {
      const result = await api.post('/whatsapp/emergencia/probar');
      setResultadoEmergencia(result);
      toast.success(`Respondió ${result.proveedor} en ${result.duracion_ms} ms`);
    } catch (error) {
      setResultadoEmergencia({ ok: false, error: error?.error || 'No se pudo probar la API' });
    } finally {
      setProbandoEmergencia(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 md:px-6">
      <div className="rounded-[22px] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ${conectado ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'}`}
            >
              {conectado ? <CheckCircle2 size={20} /> : <QrCode size={20} />}
            </span>
            <div>
              <h2 className="text-[16px] font-semibold text-gray-900">
                Conexión única de WhatsApp
              </h2>
              <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-gray-500">
                Se vincula una sola vez. La misma sesión atiende clientes y envía campañas, sin
                abrir conexiones separadas.
              </p>
              <p className="mt-2 text-[12px] font-medium text-gray-700">
                {conectado
                  ? `Conectado${wa.numero ? ` · +${wa.numero}` : ''}`
                  : wa.detalle || 'Sin conectar'}
              </p>
            </div>
          </div>
          {conectado ? (
            <button
              type="button"
              onClick={desconectar}
              disabled={ocupado}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-4 text-[12px] font-semibold text-gray-700 disabled:opacity-50"
            >
              <Unplug size={14} /> Desvincular
            </button>
          ) : null}
        </div>

        {!conectado ? (
          <div className="mt-5 flex flex-col items-center rounded-2xl bg-gray-50 p-5 text-center">
            {wa.qrImagen ? (
              <img
                src={wa.qrImagen}
                alt="Código QR único de WhatsApp"
                className="h-[260px] w-[260px] rounded-2xl bg-white"
              />
            ) : (
              <button
                type="button"
                onClick={conectar}
                disabled={ocupado || wa.estado === 'conectando'}
                style={{ background: BRAND }}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {ocupado || wa.estado === 'conectando' ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <QrCode size={15} />
                )}
                Generar código QR
              </button>
            )}
            <p className="mt-3 text-[12px] text-gray-500">
              WhatsApp → Dispositivos vinculados → Vincular dispositivo
            </p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Switch
          checked={gateway.pausaTotal === true}
          disabled={ocupado}
          label="Pausa total"
          description="Detiene IA y bloquea nuevos envíos masivos. Usalo ante cualquier problema."
          icon={PauseCircle}
          onChange={(value) => cambiar('pausaTotal', value)}
        />
        <Switch
          checked={gateway.atencionIa === true}
          disabled={ocupado || !conectado || gateway.pausaTotal}
          label="Atención con IA"
          description="Responde chats individuales y toma pedidos. Se aparta si una persona contesta."
          icon={Bot}
          onChange={(value) => cambiar('atencionIa', value)}
        />
        <Switch
          checked={gateway.masivos === true}
          disabled={ocupado || !conectado || gateway.pausaTotal}
          label="WhatsApp masivo"
          description="Autoriza campañas. Cada envío sigue requiriendo preparación y confirmación humana."
          icon={Megaphone}
          onChange={(value) => cambiar('masivos', value)}
        />
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">
        <b>Motor propio activo.</b> Chispita usa un único historial, reglas y herramientas dentro de
        Modo Sabor. Si falla el proveedor principal, intenta Gemini automáticamente.
      </div>

      <SectionCard
        icon={Bot}
        title="Cómo debe atender"
        subtitle="Estas instrucciones se aplican en vivo; no hace falta modificar n8n cada vez"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <InputField
            label="Nombre de quien atiende"
            description="El nombre que puede usar al presentarse."
            value={config?.whatsapp_agente_nombre || ''}
            onChange={(event) => editar('whatsapp_agente_nombre', event.target.value)}
            placeholder="Chispita"
          />
          <InputField
            label="Espera para mensajes partidos (ms)"
            description="Chispita junta mensajes consecutivos antes de responder. Recomendado: 2000."
            type="number"
            min="0"
            max="8000"
            value={config?.whatsapp_agrupar_ms || '2000'}
            onChange={(event) => editar('whatsapp_agrupar_ms', event.target.value)}
          />
          <TextareaField
            label="Estilo de conversación"
            description="Tono, extensión y forma de escribir."
            rows={4}
            value={config?.whatsapp_agente_estilo || ''}
            onChange={(event) => editar('whatsapp_agente_estilo', event.target.value)}
          />
        </div>

        <div className="mt-4">
          <TextareaField
            label="Reglas generales"
            description="Qué debe preguntar, cuándo derivar y qué nunca debe prometer. Los precios y el stock siguen saliendo del sistema."
            rows={6}
            value={config?.whatsapp_agente_reglas_generales || ''}
            onChange={(event) => editar('whatsapp_agente_reglas_generales', event.target.value)}
          />
        </div>

        <div className="mt-5 border-t border-gray-100 pt-5">
          <p className="text-[14px] font-semibold text-gray-900">Instrucciones por turno</p>
          <p className="mt-1 text-[12px] text-gray-500">
            El agente toma automáticamente el turno actual configurado en General.
          </p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {turnos.map((turno) => (
              <TextareaField
                key={turno.id}
                label={`${turno.nombre || turno.id} · ${turno.desde} a ${turno.hasta}`}
                rows={5}
                value={reglasTurnos[turno.id] || ''}
                onChange={(event) => editarTurno(turno.id, event.target.value)}
                placeholder="Qué ofrecer, qué no ofrecer y cómo responder en este turno."
              />
            ))}
          </div>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-5">
          <TextareaField
            label="Ejemplos de respuestas correctas"
            description="Usá pares Cliente/Respuesta. No pegues teléfonos, direcciones ni nombres completos."
            rows={7}
            value={config?.whatsapp_agente_ejemplos || ''}
            onChange={(event) => editar('whatsapp_agente_ejemplos', event.target.value)}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
            Patrón inicial extraído del historial local: respuestas breves, directas y casi sin
            emojis.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        icon={ShieldCheck}
        title="Proveedor de IA para WhatsApp"
        subtitle="Puede actuar como respaldo o atender primero sin cambiar la IA del panel"
      >
        <Switch
          checked={String(config?.whatsapp_emergencia_activa ?? '0') === '1'}
          disabled={ocupado}
          label="Usar respaldo automático"
          description="Si Chispita no obtiene respuesta del proveedor principal, intenta esta API una sola vez."
          icon={ShieldCheck}
          onChange={(value) => editar('whatsapp_emergencia_activa', value ? '1' : '0')}
        />

        <Switch
          checked={String(config?.whatsapp_ia_priorizar_respaldo ?? '0') === '1'}
          disabled={ocupado || String(config?.whatsapp_emergencia_activa ?? '0') !== '1'}
          label="Priorizar este proveedor en WhatsApp"
          description="Atiende primero con esta API. Si falla, utiliza la IA principal del sistema. Requiere el respaldo automático activado."
          icon={ShieldCheck}
          onChange={(value) => editar('whatsapp_ia_priorizar_respaldo', value ? '1' : '0')}
        />

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <InputField
            label="Nombre del proveedor"
            description="Sólo sirve para identificarlo en el estado y los registros."
            value={config?.whatsapp_emergencia_proveedor || ''}
            onChange={(event) => editar('whatsapp_emergencia_proveedor', event.target.value)}
            placeholder="NVIDIA, Groq, OpenRouter..."
          />
          <InputField
            label="Modelo"
            description="Nombre exacto que usa la API."
            value={config?.whatsapp_emergencia_modelo || ''}
            onChange={(event) => editar('whatsapp_emergencia_modelo', event.target.value)}
            placeholder="nvidia/nemotron-3.5-lightning-30b-a3b"
          />
        </div>

        <div className="mt-4">
          <InputField
            label="Dirección de la API"
            description={
              respaldoEsGemini
                ? 'Para Gemini se usa la API nativa de Google.'
                : 'Debe ser compatible con OpenAI y terminar normalmente en /v1.'
            }
            value={config?.whatsapp_emergencia_base_url || ''}
            onChange={(event) => editar('whatsapp_emergencia_base_url', event.target.value)}
            placeholder="https://api.proveedor.com/v1"
          />
        </div>

        {respaldoEsGemini ? (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[12px] leading-relaxed text-emerald-800">
            Gemini reutiliza la clave cifrada que ya usa el sistema para las alertas y la
            transcripción. No hace falta pegarla otra vez.
          </p>
        ) : (
          <div className="mt-4">
            <InputField
              label="Clave de la API"
              type="password"
              value={config?.whatsapp_emergencia_api_key || ''}
              onChange={(event) => editar('whatsapp_emergencia_api_key', event.target.value)}
              onFocus={limpiarSecretoAlEnfocar(setConfig, 'whatsapp_emergencia_api_key')}
              placeholder="..."
              hint={
                config?.whatsapp_emergencia_api_key_configured &&
                config?.whatsapp_emergencia_api_key === SECRET_PLACEHOLDER
                  ? 'Ya hay una clave cifrada. Pegá otra solamente si querés reemplazarla.'
                  : 'Se guarda cifrada y nunca vuelve a mostrarse en el navegador.'
              }
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 p-4">
          <button
            type="button"
            onClick={probarEmergencia}
            disabled={probandoEmergencia}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-gray-900 px-5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {probandoEmergencia ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ShieldCheck size={15} />
            )}
            Probar API guardada
          </button>
          <p className="w-full text-[11px] leading-relaxed text-gray-500">
            Primero guardá los cambios generales. Después probá la conexión: el motor propio usa
            este respaldo automáticamente si falla el proveedor principal.
          </p>
          {resultadoEmergencia ? (
            <p
              className={`w-full text-[12px] ${resultadoEmergencia.ok ? 'text-emerald-700' : 'text-red-600'}`}
            >
              {resultadoEmergencia.ok
                ? `${resultadoEmergencia.proveedor} listo · ${resultadoEmergencia.modelo}${resultadoEmergencia.duracion_ms ? ` · ${resultadoEmergencia.duracion_ms} ms` : ''}`
                : resultadoEmergencia.error}
            </p>
          ) : null}
        </div>
      </SectionCard>

      <div className="rounded-2xl bg-white p-4 text-[12px] text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        Recibidos por IA: <b className="text-gray-800">{gateway.recibidos || 0}</b> · Respondidos:{' '}
        <b className="text-gray-800">{gateway.respondidos || 0}</b>
        {gateway.ultimaActividad ? ` · ${gateway.ultimaActividad}` : ''}
        {gateway.ultimoError ? <p className="mt-2 text-red-600">{gateway.ultimoError}</p> : null}
      </div>

      <SectionCard
        icon={UserRound}
        title="Conversaciones recientes"
        subtitle="Control humano, transcripciones y pedidos creados"
      >
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          {[
            ['Recibidos', metricas?.recibidos],
            ['Respondidos', metricas?.respondidos],
            ['Audios', metricas?.audios_transcriptos],
            ['Pedidos', metricas?.pedidos],
            ['Errores', Number(metricas?.errores_audio || 0) + Number(metricas?.errores_ia || 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-gray-50 p-3">
              <p className="text-[11px] text-gray-500">{label} · 7 días</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{Number(value || 0)}</p>
            </div>
          ))}
        </div>
        {metricas?.agente ? (
          <div className="mb-5 border-t border-gray-100 pt-5">
            <p className="text-[14px] font-semibold text-gray-900">Rendimiento del motor propio</p>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                ['Conversión', `${Number(metricas.agente.conversion_pct || 0)}%`],
                ['Latencia media', `${Number(metricas.agente.latencia_promedio_ms || 0)} ms`],
                ['Derivaciones', Number(metricas.agente.handoffs || 0)],
                [
                  'Herramienta principal',
                  metricas.agente.herramientas_mas_usadas?.[0]?.nombre || 'Sin datos',
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">{label} · 7 días</p>
                  <p className="mt-1 truncate text-[14px] font-bold text-gray-900">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {(metricas.agente.trazas || []).map((traza) => (
                <details key={traza.id} className="rounded-xl border border-gray-100 px-3 py-2">
                  <summary className="cursor-pointer text-[12px] font-medium text-gray-700">
                    {traza.nombre || `+${traza.telefono}`} · {Number(traza.latencia_ms || 0)} ms
                    {traza.error ? ' · error' : traza.pedido_creado ? ' · pedido creado' : ''}
                  </summary>
                  <p className="mt-2 break-words text-[11px] text-gray-500">
                    {traza.proveedor || 'Proveedor sin informar'} ·{' '}
                    {traza.modelo || 'modelo sin informar'} · {Number(traza.tokens_entrada || 0)}{' '}
                    entrada / {Number(traza.tokens_salida || 0)} salida
                  </p>
                  <p className="mt-1 break-words text-[11px] text-gray-500">
                    Herramientas: {traza.herramientas?.join(' → ') || 'ninguna'}
                  </p>
                  {traza.error ? (
                    <p className="mt-1 text-[11px] text-red-600">{traza.error}</p>
                  ) : null}
                </details>
              ))}
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          {conversaciones.map((chat) => {
            const humano = Number(chat.bot_silenciado || 0) === 1;
            return (
              <div
                key={chat.id}
                id={`whatsapp-conversacion-${chat.id}`}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition ${Number(chat.id) === conversacionDestacada ? 'border-red-300 bg-red-50 ring-2 ring-red-100' : 'border-gray-100'}`}
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900">
                    {chat.nombre || `+${chat.telefono}`}
                  </p>
                  <p className="max-w-xl truncate text-[12px] text-gray-500">
                    {chat.ultimo_tipo === 'audio' ? '🎤 ' : ''}
                    {chat.ultimo_mensaje || 'Sin mensajes'}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-400">
                    {humano ? 'Atención humana' : 'Atiende Chispita'} ·{' '}
                    {Number(chat.pedidos_creados || 0)} pedidos
                  </p>
                </div>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => controlarChat(chat.id, humano ? 'devolver' : 'tomar')}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-gray-100 px-3 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
                >
                  {humano ? <RotateCcw size={13} /> : <UserRound size={13} />}
                  {humano ? 'Devolver a Chispita' : 'Tomar conversación'}
                </button>
              </div>
            );
          })}
          {!conversaciones.length ? (
            <p className="text-[12px] text-gray-400">Todavía no hay conversaciones.</p>
          ) : null}
          {totalChats > 12 ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <button
                type="button"
                disabled={paginaChats === 0}
                onClick={() => setPaginaChats((p) => Math.max(0, p - 1))}
              >
                Anterior
              </button>
              <span>
                Página {paginaChats + 1} · {totalChats} conversaciones · pendientes primero
              </span>
              <button
                type="button"
                disabled={(paginaChats + 1) * 12 >= totalChats}
                onClick={() => setPaginaChats((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
