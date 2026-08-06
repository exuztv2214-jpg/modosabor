import { useState } from 'react';
import { Bot, CheckCircle2, Loader2, Plug, ShieldCheck, XCircle } from 'lucide-react';

import api from '../../lib/api.js';
import PROVEEDORES_IA from '../../lib/proveedoresIa.json';
import { BRAND, STROKE } from '../../lib/theme.js';
import {
  SectionCard,
  InputField,
  SelectField,
  ToggleSwitch,
  SECRET_PLACEHOLDER,
  limpiarSecretoAlEnfocar,
} from './ConfigComponents.jsx';

/**
 * Configuración del asistente del panel.
 *
 * ── Por qué se puede elegir cualquier proveedor ────────────────────────────
 *
 * Cada uno cobra distinto, tiene nivel gratuito distinto, y cualquiera puede
 * cambiar sus condiciones o dejar de estar disponible en el país. Que eso sea
 * una opción en pantalla y no una decisión enterrada en el código significa
 * poder cambiar en dos minutos, sin depender de nadie.
 *
 * ── Por qué la lista está en un archivo y no se pide al servidor ───────────
 *
 * Antes se traía con una llamada a la API. Fue un error: la lista es fija, no
 * cambia nunca en tiempo de ejecución, y no hay ningún motivo para que elegir
 * un proveedor dependa de que la red funcione, de que la sesión llegue o de que
 * el servidor esté al día.
 *
 * Cada vez que esa llamada fallaba —por sesión, por CORS, por un despliegue a
 * medias— el desplegable aparecía vacío y no se podía configurar nada. Un
 * archivo estático no falla nunca.
 *
 * El servidor mantiene su propia copia porque la necesita para hablar con cada
 * proveedor. Un test compara las dos y falla si se separan.
 */

export default function SeccionAsistente({ config, setConfig }) {
  const proveedores = PROVEEDORES_IA;
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState(null);
  // El modelo se elige de una lista, pero también se puede escribir: los
  // proveedores sacan modelos nuevos mucho más seguido de lo que se actualiza
  // esta pantalla.
  const [modeloAMano, setModeloAMano] = useState(false);

  const activo = String(config.ia_asistente_activo ?? '0') === '1';
  const proveedorId = String(config.ia_proveedor || 'gemini');
  const proveedor = proveedores.find((p) => p.id === proveedorId);
  const claveGuardada = config.ia_api_key_configured && config.ia_api_key === SECRET_PLACEHOLDER;

  const setToggle = (clave, encendido) => {
    setConfig((prev) => ({ ...prev, [clave]: encendido ? '1' : '0' }));
  };

  /*
    Al cambiar de proveedor se reemplazan la dirección y el modelo por los de
    ese proveedor. Si no, quedarían los del anterior y la conexión fallaría con
    un error que no dice nada útil: "modelo inexistente".

    La clave no se toca: es del usuario, y borrársela sin avisar sería peor.
  */
  const cambiarProveedor = (id) => {
    const elegido = proveedores.find((p) => p.id === id);
    setConfig((prev) => ({
      ...prev,
      ia_proveedor: id,
      ia_base_url: elegido?.baseUrl || '',
      ia_modelo: elegido?.modeloPorDefecto || '',
    }));
    setModeloAMano(false);
    setPrueba(null);
  };

  const probarConexion = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      setPrueba(await api.post('/api/asistente/probar'));
    } catch (error) {
      setPrueba({ ok: false, error: error?.error || 'No se pudo probar la conexión.' });
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <SectionCard
        icon={Bot}
        title="Asistente del panel"
        subtitle="Un chat para preguntarle cómo va el negocio"
      >
        <ToggleSwitch
          checked={activo}
          onChange={(encendido) => setToggle('ia_asistente_activo', encendido)}
          label="Mostrar el asistente"
          description="Aparece como un botón flotante abajo a la derecha del panel."
        />

        {activo ? (
          <>
            <div className="mt-4 grid items-end gap-3 lg:grid-cols-2">
              <SelectField
                label="Proveedor"
                description="Cualquiera de estos, o uno propio."
                value={proveedorId}
                onChange={(evento) => cambiarProveedor(evento.target.value)}
                options={proveedores.map((p) => ({ value: p.id, label: p.nombre }))}
              />

              {/*
                Lista si el proveedor trae modelos conocidos, campo libre si no.

                Las dos cosas hacen falta: la lista evita errores de tipeo en
                nombres largos como "meta-llama/Llama-3.3-70B-Instruct-Turbo", y
                el campo libre permite usar un modelo que salió después de que
                se escribió esta pantalla, sin esperar una actualización.
              */}
              {proveedor?.modelos?.length && !modeloAMano ? (
                <div>
                  <SelectField
                    label="Modelo"
                    description="El primero es el recomendado."
                    value={config.ia_modelo || ''}
                    onChange={(evento) =>
                      setConfig((prev) => ({ ...prev, ia_modelo: evento.target.value }))
                    }
                    options={[
                      ...proveedor.modelos.map((m) => ({ value: m, label: m })),
                      // Si lo que está guardado no figura en la lista, igual
                      // tiene que verse elegido y no perderse.
                      ...(config.ia_modelo && !proveedor.modelos.includes(config.ia_modelo)
                        ? [{ value: config.ia_modelo, label: `${config.ia_modelo} (guardado)` }]
                        : []),
                    ]}
                  />
                  <button
                    type="button"
                    onClick={() => setModeloAMano(true)}
                    className="mt-1.5 text-[11px] font-medium text-gray-500 underline transition hover:text-gray-700"
                  >
                    Escribir otro modelo
                  </button>
                </div>
              ) : (
                <div>
                  <InputField
                    label="Modelo"
                    description="Escribí el nombre exacto que usa tu proveedor."
                    value={config.ia_modelo || ''}
                    onChange={(evento) =>
                      setConfig((prev) => ({ ...prev, ia_modelo: evento.target.value }))
                    }
                    placeholder={proveedor?.modeloPorDefecto || 'nombre-del-modelo'}
                  />
                  {proveedor?.modelos?.length ? (
                    <button
                      type="button"
                      onClick={() => setModeloAMano(false)}
                      className="mt-1.5 text-[11px] font-medium text-gray-500 underline transition hover:text-gray-700"
                    >
                      Volver a la lista
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div className="mt-3">
              <InputField
                label="Dirección de la API"
                description="Sólo tocala si tu proveedor usa otra, o si es uno propio."
                value={config.ia_base_url || ''}
                onChange={(evento) =>
                  setConfig((prev) => ({ ...prev, ia_base_url: evento.target.value }))
                }
                placeholder="https://api.ejemplo.com/v1"
              />
            </div>

            <div className="mt-3">
              <InputField
                label="Clave de la API"
                type="password"
                value={config.ia_api_key || ''}
                onChange={(evento) =>
                  setConfig((prev) => ({ ...prev, ia_api_key: evento.target.value }))
                }
                onFocus={limpiarSecretoAlEnfocar(setConfig, 'ia_api_key')}
                placeholder="..."
                hint={
                  claveGuardada
                    ? 'Ya hay una clave guardada. Hacé clic en el campo y pegá la nueva si querés cambiarla.'
                    : proveedor?.donde
                      ? `La sacás en ${proveedor.donde}. ${proveedor.nota || ''}`.trim()
                      : proveedor?.nota || ''
                }
              />
            </div>

            {/* ── Probar antes de necesitarlo ── */}
            <div className="mt-4 rounded-xl bg-gray-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-gray-900">Probar la conexión</p>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    Guardá primero, después probá: se usa lo que está guardado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={probarConexion}
                  disabled={probando}
                  style={{ background: BRAND }}
                  className="flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {probando ? (
                    <Loader2 size={15} className="animate-spin" strokeWidth={STROKE} />
                  ) : (
                    <Plug size={15} strokeWidth={STROKE} />
                  )}
                  {probando ? 'Probando...' : 'Probar'}
                </button>
              </div>

              {prueba ? (
                <div
                  className="mt-3 flex items-start gap-2 rounded-xl px-3.5 py-3 text-[12px] leading-relaxed"
                  style={
                    prueba.ok
                      ? { background: '#F0FDF4', color: '#14532D' }
                      : { background: '#FEF2F2', color: '#7A0F17' }
                  }
                >
                  {prueba.ok ? (
                    <CheckCircle2 size={15} className="mt-px shrink-0" strokeWidth={STROKE} />
                  ) : (
                    <XCircle size={15} className="mt-px shrink-0" strokeWidth={STROKE} />
                  )}
                  <span>
                    {prueba.ok
                      ? `Funciona. Contestó ${prueba.proveedor} con el modelo ${prueba.modelo}.`
                      : prueba.error}
                  </span>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SectionCard>

      {activo ? (
        <SectionCard
          icon={ShieldCheck}
          title="Qué puede y qué no"
          subtitle="Los límites del asistente, para que sepas con qué contás"
        >
          <div className="space-y-3 text-[13px] leading-relaxed text-gray-600">
            <p>
              <span className="font-medium text-gray-900">Puede consultar</span> ventas por período,
              productos más vendidos, insumos por debajo del mínimo, pedidos en curso, cuánto tiene
              que rendir cada repartidor, el estado de la caja y los clientes más habituales.
            </p>
            <p>
              <span className="font-medium text-gray-900">Puede proponer cambios</span> de stock,
              promociones y el menú del día. Pero no los aplica solo: te muestra una tarjeta con lo
              que va a pasar —de cuánto a cuánto, qué platos, qué precio— y espera que confirmes.
            </p>
            <p>
              Eso es lo que te protege de las dos cosas que van a pasar tarde o temprano: que
              entienda mal lo que le pediste, y que alguien intente darle órdenes escribiéndolas en
              la nota de un pedido. En los dos casos el cambio queda esperando una confirmación que
              sólo vos podés dar.
            </p>
            <p>
              Lo que confirmás es exactamente lo que se ejecuta: el detalle del cambio va firmado
              por el servidor y no se puede alterar desde el navegador.
            </p>
            <p>
              Consultar requiere permiso de Reportes. Proponer cambios, permiso para editar
              productos: quien no lo tenga puede preguntar, pero el asistente ni siquiera le ofrece
              modificar nada.
            </p>
          </div>

          <p
            className="mt-4 rounded-xl px-4 py-3 text-[12px] leading-relaxed text-gray-500"
            style={{ background: '#F8FAFC', border: `1px solid ${STROKE}` }}
          >
            Queda todo en la auditoría: qué preguntaste, qué te propuso y qué confirmaste, con tu
            usuario y la hora. Lo que preguntes viaja al proveedor que elijas: si te importa que no
            se use para entrenar sus modelos, fijate las condiciones de su plan gratuito.
          </p>
        </SectionCard>
      ) : null}
    </div>
  );
}
