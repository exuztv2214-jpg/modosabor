import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Loader2, Plug, ShieldCheck, XCircle } from 'lucide-react';

import api from '../../lib/api.js';
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
 * La lista viene del servidor en vez de estar repetida acá: si mañana se
 * agrega un proveedor, aparece solo en el desplegable.
 */

export default function SeccionAsistente({ config, setConfig }) {
  const [proveedores, setProveedores] = useState([]);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState(null);

  const activo = String(config.ia_asistente_activo ?? '0') === '1';
  const proveedorId = String(config.ia_proveedor || 'gemini');
  const proveedor = proveedores.find((p) => p.id === proveedorId);
  const claveGuardada = config.ia_api_key_configured && config.ia_api_key === SECRET_PLACEHOLDER;

  useEffect(() => {
    let vigente = true;
    api
      .get('/api/asistente/proveedores')
      .then((datos) => vigente && setProveedores(datos?.proveedores || []))
      .catch(() => vigente && setProveedores([]));
    return () => {
      vigente = false;
    };
  }, []);

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
              <InputField
                label="Modelo"
                description="Los nombres cambian seguido: si te da error, revisá cuál está vigente."
                value={config.ia_modelo || ''}
                onChange={(evento) =>
                  setConfig((prev) => ({ ...prev, ia_modelo: evento.target.value }))
                }
                placeholder={proveedor?.modeloPorDefecto || 'nombre-del-modelo'}
              />
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
