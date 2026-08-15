import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  Loader2,
  Mic,
  ScanSearch,
  Send,
  Square,
  X,
} from 'lucide-react';

import api from '../../lib/api.js';
import { BRAND, STROKE, Z } from '../../lib/theme.js';
import { useCerrarConEscape } from '../../hooks/useCerrarConEscape.js';
import { achicarImagen } from '../../lib/achicarImagen.js';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Asistente flotante del panel.
 *
 * Contesta preguntas sobre el negocio y propone cambios: stock, promos, menú
 * del día.
 *
 * ── Los cambios los confirma el usuario ────────────────────────────────────
 *
 * El asistente nunca modifica nada por su cuenta. Cuando le pedís un cambio,
 * arma una tarjeta con lo que va a pasar —de cuánto a cuánto, qué platos, qué
 * precio— y espera. Recién al tocar Confirmar se aplica.
 *
 * El detalle del cambio viaja firmado por el servidor. Esta pantalla lo muestra
 * pero no puede modificarlo, así que lo que se ejecuta es exactamente lo que se
 * mostró.
 *
 * ── Por qué no aparece siempre ─────────────────────────────────────────────
 *
 * Si no hay clave configurada, el botón directamente no se dibuja. Un botón
 * que al tocarlo dice "no está configurado" es peor que no tenerlo: ocupa
 * lugar en una pantalla que ya está llena y no ayuda a nadie.
 */

const EJEMPLOS = [
  '¿Cuánto vendí hoy?',
  'Revisá la caja y decime qué no cuadra',
  'Sumá 20 kilos de carne al stock',
  'Pedido de Juan, 2 milanesas a Rivadavia 450, paga en efectivo',
];

export default function AsistenteFlotante() {
  const [disponible, setDisponible] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  // Cuál propuesta se está aplicando: sin esto, dos clics seguidos ejecutarían
  // el cambio dos veces.
  const [aplicando, setAplicando] = useState(null);
  // La foto de un remito, ya achicada y lista para mandar.
  const [foto, setFoto] = useState(null);
  const [audio, setAudio] = useState(null);
  const [grabando, setGrabando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const finDeLista = useRef(null);
  const campoFoto = useRef(null);
  const grabador = useRef(null);
  const flujoAudio = useRef(null);
  const { hasPermission } = useAuth();

  useCerrarConEscape(abierto, () => setAbierto(false));

  useEffect(() => {
    let vigente = true;
    api
      .get('/asistente/estado')
      // Un 403 acá es normal: significa que este usuario no tiene permiso de
      // reportes. No es un error que haya que mostrar, simplemente no ve el
      // asistente.
      .then((datos) => vigente && setDisponible(Boolean(datos?.habilitado)))
      .catch(() => vigente && setDisponible(false));
    return () => {
      vigente = false;
    };
  }, []);

  // Al llegar una respuesta la conversación crece hacia abajo; sin esto habría
  // que bajar a mano cada vez.
  useEffect(() => {
    finDeLista.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, pensando]);

  useEffect(
    () => () => {
      flujoAudio.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const elegirFoto = async (evento) => {
    const archivo = evento.target.files?.[0];
    // El input se limpia siempre: si no, elegir la misma foto dos veces
    // seguidas no dispara el evento la segunda vez.
    evento.target.value = '';
    if (!archivo) return;
    setFoto(await achicarImagen(archivo));
  };

  const alternarGrabacion = async () => {
    if (grabando) {
      grabador.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      flujoAudio.current = stream;
      const chunks = [];
      const recorder = new MediaRecorder(stream);
      grabador.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => setAudio(String(reader.result || ''));
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
        flujoAudio.current = null;
        grabador.current = null;
        setGrabando(false);
      };
      recorder.start();
      setGrabando(true);
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 60000);
    } catch {
      setMensajes((prev) => [
        ...prev,
        {
          rol: 'asistente',
          texto: 'No pude usar el micrófono. Revisá el permiso del navegador.',
          falló: true,
        },
      ]);
    }
  };

  const preguntar = async (preguntaCruda) => {
    const pregunta = String(preguntaCruda ?? texto).trim();
    if ((!pregunta && !foto && !audio) || pensando) return;

    // El historial se arma antes de agregar la pregunta nueva: el servidor
    // espera la conversación previa por un lado y la pregunta por otro.
    const historial = mensajes.map((m) => ({ rol: m.rol, texto: m.texto }));

    const imagen = foto;
    const audioAdjunto = audio;
    setMensajes((prev) => [
      ...prev,
      {
        rol: 'usuario',
        texto: pregunta || (audioAdjunto ? 'Te mando este audio.' : 'Te mando esta foto.'),
        imagen,
      },
    ]);
    setTexto('');
    setFoto(null);
    setAudio(null);
    setPensando(true);

    try {
      const datos = await api.post('/asistente/consulta', {
        pregunta: pregunta || 'Leé esta foto y decime qué ves.',
        historial,
        imagen,
        audio: audioAdjunto,
      });
      setMensajes((prev) => [
        ...prev,
        { rol: 'asistente', texto: datos.respuesta, propuesta: datos.propuesta || null },
      ]);
    } catch (error) {
      // El interceptor de axios rechaza con `.error`, no con `.message`.
      setMensajes((prev) => [
        ...prev,
        {
          rol: 'asistente',
          texto: error?.error || 'No pude consultar. Fijate la conexión y probá de nuevo.',
          falló: true,
        },
      ]);
    } finally {
      setPensando(false);
    }
  };

  /*
    Confirmar un cambio.

    Se manda sólo el token: el detalle de qué hacer viaja adentro, firmado por
    el servidor. El navegador no puede alterarlo, así que lo que se ejecuta es
    exactamente lo que se mostró en la tarjeta.
  */
  const confirmar = async (indice, token) => {
    if (aplicando !== null) return;
    setAplicando(indice);
    try {
      const datos = await api.post('/asistente/confirmar', { token });
      setMensajes((prev) => {
        const copia = [...prev];
        // La tarjeta se reemplaza por el resultado: una propuesta ya aplicada
        // no puede quedar con el botón disponible.
        copia[indice] = { ...copia[indice], propuesta: null, aplicado: datos.mensaje };
        return copia;
      });
    } catch (error) {
      setMensajes((prev) => {
        const copia = [...prev];
        copia[indice] = {
          ...copia[indice],
          propuesta: null,
          errorAlAplicar: error?.error || 'No se pudo aplicar el cambio.',
        };
        return copia;
      });
    } finally {
      setAplicando(null);
    }
  };

  const descartar = (indice) => {
    setMensajes((prev) => {
      const copia = [...prev];
      copia[indice] = { ...copia[indice], propuesta: null, descartado: true };
      return copia;
    });
  };

  const revisarSistema = async () => {
    if (revisando) return;
    setRevisando(true);
    setMensajes((prev) => [
      ...prev,
      { rol: 'usuario', texto: 'Revisá el sistema y decime qué encontrás.' },
    ]);
    try {
      const datos = await api.post('/asistente/revision');
      const severidad = datos.severidad;
      const color = severidad === 'critico' ? '🔴' : severidad === 'advertencia' ? '🟡' : '🟢';
      let texto = `${color} **Severidad: ${severidad.toUpperCase()}**\n\n`;
      if (datos.problemas_detectados === 0) {
        texto += 'No detecté ningún problema. Todo parece estar en orden.';
      } else {
        texto += `Detecté **${datos.problemas_detectados}** problema(s):\n\n`;
        datos.problemas.forEach((p) => {
          const emoji =
            p.severidad === 'critico' ? '🔴' : p.severidad === 'advertencia' ? '🟡' : 'ℹ️';
          texto += `${emoji} **[${p.modulo.toUpperCase()}]** ${p.mensaje}\n`;
        });
      }
      setMensajes((prev) => [...prev, { rol: 'asistente', texto, revision: datos }]);
    } catch (error) {
      setMensajes((prev) => [
        ...prev,
        {
          rol: 'asistente',
          texto: error?.error || 'No pude revisar el sistema. Fijate la conexión y probá de nuevo.',
          falló: true,
        },
      ]);
    } finally {
      setRevisando(false);
    }
  };

  if (!disponible) return null;

  return (
    <>
      {!abierto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir el asistente"
          style={{ zIndex: Z.modal }}
          className="fixed bottom-5 right-5 flex h-14 w-14 items-center justify-center rounded-full border border-red-100 bg-white shadow-lg shadow-red-900/20 transition hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
        >
          <img src="/brand-flame.svg" alt="" className="h-8 w-8 object-contain" />
        </button>
      ) : null}

      {abierto ? (
        <div
          style={{ zIndex: Z.modal }}
          className="fixed bottom-0 right-0 flex h-[min(600px,100dvh)] w-full flex-col bg-white shadow-2xl sm:bottom-5 sm:right-5 sm:h-[600px] sm:w-[420px] sm:rounded-2xl"
        >
          <header
            className="flex shrink-0 items-center justify-between border-b px-4 py-3"
            style={{ borderColor: STROKE }}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-100 bg-white">
                <img src="/brand-flame.svg" alt="" className="h-6 w-6 object-contain" />
              </span>
              <div>
                <p className="text-[14px] font-semibold text-gray-900">Asistente</p>
                <p className="text-[11px] text-gray-500">Consulta cómo va el negocio</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              aria-label="Cerrar el asistente"
              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={18} strokeWidth={STROKE} />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {mensajes.length === 0 ? (
              <div className="pt-2">
                <p className="text-[13px] leading-relaxed text-gray-500">
                  Preguntame cómo va el negocio, o pedime que cargue un pedido, ajuste el stock,
                  registre una compra, arme el menú del día o cree una promo. También podés mandarme
                  la foto de un remito. Los cambios te los muestro antes: no se aplica nada sin que
                  lo confirmes.
                </p>
                <div className="mt-4 space-y-2">
                  {hasPermission('config.manage') && (
                    <button
                      type="button"
                      onClick={revisarSistema}
                      disabled={revisando}
                      className="flex w-full items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-left text-[13px] font-medium text-red-800 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      <ScanSearch size={15} strokeWidth={STROKE} />
                      {revisando ? 'Revisando el sistema...' : '🔍 Revisar sistema'}
                    </button>
                  )}
                  {EJEMPLOS.map((ejemplo) => (
                    <button
                      key={ejemplo}
                      type="button"
                      onClick={() => preguntar(ejemplo)}
                      className="block w-full rounded-xl border px-3.5 py-2.5 text-left text-[13px] text-gray-700 transition hover:bg-gray-50"
                      style={{ borderColor: STROKE }}
                    >
                      {ejemplo}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {mensajes.map((mensaje, indice) => (
              // Los mensajes no se borran ni se reordenan: sólo se agregan al
              // final, así que el índice alcanza como clave.
              <div key={`${mensaje.rol}-${indice}`} className="space-y-2">
                <div
                  className={mensaje.rol === 'usuario' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    style={
                      mensaje.rol === 'usuario'
                        ? { background: BRAND }
                        : mensaje.falló
                          ? { background: '#FEF2F2', color: '#7A0F17' }
                          : undefined
                    }
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      mensaje.rol === 'usuario'
                        ? 'text-white'
                        : mensaje.falló
                          ? ''
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {mensaje.imagen ? (
                      <img
                        src={mensaje.imagen}
                        alt="Foto enviada"
                        className="mb-2 max-h-40 rounded-lg object-cover"
                      />
                    ) : null}
                    {mensaje.texto}
                  </div>
                </div>

                {mensaje.revision ? (
                  <div
                    className="rounded-2xl border p-3.5"
                    style={{
                      borderColor:
                        mensaje.revision.severidad === 'critico'
                          ? '#EF4444'
                          : mensaje.revision.severidad === 'advertencia'
                            ? '#F59E0B'
                            : '#22C55E',
                      background:
                        mensaje.revision.severidad === 'critico'
                          ? '#FEF2F2'
                          : mensaje.revision.severidad === 'advertencia'
                            ? '#FFFBEB'
                            : '#F0FDF4',
                    }}
                  >
                    <p className="text-[13px] font-semibold text-gray-900">
                      {mensaje.revision.severidad === 'critico'
                        ? '🔴 Problemas críticos detectados'
                        : mensaje.revision.severidad === 'advertencia'
                          ? '🟡 Advertencias encontradas'
                          : '🟢 Todo en orden'}
                    </p>
                    {mensaje.revision.problemas?.length ? (
                      <ul className="mt-2 space-y-1">
                        {mensaje.revision.problemas.map((p, i) => (
                          <li key={i} className="text-[12px] text-gray-700">
                            <span className="font-medium">[{p.modulo}]</span> {p.mensaje}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[12px] text-gray-600">No se encontraron problemas.</p>
                    )}
                  </div>
                ) : null}

                {/* ── La tarjeta de confirmación ── */}
                {mensaje.propuesta ? (
                  <div
                    className="rounded-2xl border p-3.5"
                    style={{ borderColor: BRAND, background: '#FFF8F8' }}
                  >
                    <p className="text-[13px] font-semibold text-gray-900">
                      {mensaje.propuesta.resumen}
                    </p>

                    {mensaje.propuesta.detalles?.length ? (
                      <dl className="mt-2.5 space-y-1">
                        {mensaje.propuesta.detalles.map((detalle) => (
                          <div key={detalle.etiqueta} className="flex justify-between gap-3">
                            <dt className="text-[12px] text-gray-500">{detalle.etiqueta}</dt>
                            <dd className="text-right text-[12px] font-medium text-gray-800">
                              {detalle.valor}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}

                    {mensaje.propuesta.advertencia ? (
                      <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
                        <AlertTriangle size={13} className="mt-px shrink-0" strokeWidth={STROKE} />
                        {mensaje.propuesta.advertencia}
                      </p>
                    ) : null}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => confirmar(indice, mensaje.propuesta.token)}
                        disabled={aplicando !== null}
                        style={{ background: BRAND }}
                        className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                      >
                        {aplicando === indice ? (
                          <Loader2 size={14} className="animate-spin" strokeWidth={STROKE} />
                        ) : (
                          <Check size={14} strokeWidth={STROKE} />
                        )}
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => descartar(indice)}
                        disabled={aplicando !== null}
                        className="h-10 rounded-xl border px-4 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                        style={{ borderColor: STROKE }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}

                {mensaje.aplicado ? (
                  <p className="flex items-start gap-1.5 rounded-xl bg-green-50 px-3 py-2.5 text-[12px] leading-relaxed text-green-900">
                    <Check size={13} className="mt-px shrink-0" strokeWidth={STROKE} />
                    {mensaje.aplicado}
                  </p>
                ) : null}

                {mensaje.errorAlAplicar ? (
                  <p className="rounded-xl bg-red-50 px-3 py-2.5 text-[12px] leading-relaxed text-red-900">
                    {mensaje.errorAlAplicar}
                  </p>
                ) : null}

                {mensaje.descartado ? (
                  <p className="px-1 text-[12px] text-gray-400">Cambio cancelado.</p>
                ) : null}
              </div>
            ))}

            {pensando ? (
              <div className="flex items-center gap-2 text-[13px] text-gray-400">
                <Loader2 size={14} className="animate-spin" strokeWidth={STROKE} />
                Buscando en el sistema...
              </div>
            ) : null}

            <div ref={finDeLista} />
          </div>

          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              preguntar();
            }}
            className="shrink-0 border-t px-3 py-3"
            style={{ borderColor: STROKE }}
          >
            {foto ? (
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-gray-50 p-2">
                <img src={foto} alt="Foto a enviar" className="h-12 w-12 rounded-lg object-cover" />
                <span className="flex-1 text-[12px] text-gray-600">Foto lista para mandar</span>
                <button
                  type="button"
                  onClick={() => setFoto(null)}
                  aria-label="Quitar la foto"
                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                >
                  <X size={15} strokeWidth={STROKE} />
                </button>
              </div>
            ) : null}

            {audio ? (
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-gray-50 p-2">
                <Mic size={16} className="text-gray-500" />
                <span className="flex-1 text-[12px] text-gray-600">Audio listo para mandar</span>
                <button
                  type="button"
                  onClick={() => setAudio(null)}
                  aria-label="Quitar el audio"
                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600"
                >
                  <X size={15} strokeWidth={STROKE} />
                </button>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <input
                ref={campoFoto}
                type="file"
                accept="image/*"
                onChange={elegirFoto}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => campoFoto.current?.click()}
                aria-label="Adjuntar una foto"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-gray-500 transition hover:bg-gray-50"
                style={{ borderColor: STROKE }}
              >
                <Camera size={17} strokeWidth={STROKE} />
              </button>
              <button
                type="button"
                onClick={alternarGrabacion}
                aria-label={grabando ? 'Detener grabación' : 'Dictar por audio'}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${grabando ? 'border-red-300 bg-red-50 text-red-600' : 'text-gray-500 hover:bg-gray-50'}`}
                style={grabando ? undefined : { borderColor: STROKE }}
              >
                {grabando ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}
              </button>
              <input
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
                placeholder="Preguntá algo..."
                className="h-11 flex-1 rounded-xl border border-gray-200 px-3.5 text-[14px] text-gray-900 outline-none transition focus:border-gray-400"
              />
              <button
                type="submit"
                disabled={pensando || grabando || (!texto.trim() && !foto && !audio)}
                aria-label="Enviar"
                style={{ background: BRAND }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <Send size={17} strokeWidth={STROKE} />
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
