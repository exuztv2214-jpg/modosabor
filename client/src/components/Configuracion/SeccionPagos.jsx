import { Banknote, Check, Info, Landmark, Zap } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { paymentBrand } from '../TPV/paymentBrands.jsx';
import { SectionCard, InputField, ToggleSwitch } from './ConfigComponents.jsx';

const SECRET_PLACEHOLDER = '__CONFIGURED__';

/**
 * Métodos que el sistema realmente sabe procesar.
 *
 * La lista anterior ofrecía `debito` y `credito`, que no existen en ninguna
 * parte del sistema —ni en el TPV, ni en la app del rider, ni en el checkout
 * de la web— y omitía `modo` y `uala`, que sí se usan y vienen cargados desde
 * el seed. Resultado: se podían activar dos métodos que no hacían nada y no
 * se podían apagar dos que sí funcionaban.
 *
 * Ahora coincide con `PAGOS` del TPV y con lo que el backend acepta.
 */
const METODOS = ['efectivo', 'mercadopago', 'transferencia', 'modo', 'uala'];

export default function SeccionPagos({ config, setConfig, f, setToggle }) {
  let metodos = [];
  try {
    const parsed = JSON.parse(config.metodos_pago || '[]');
    metodos = Array.isArray(parsed) ? parsed : [];
  } catch {
    metodos = ['efectivo', 'mercadopago'];
  }

  const toggleMetodo = (metodo) => {
    const actualizado = metodos.includes(metodo)
      ? metodos.filter((item) => item !== metodo)
      : [...metodos, metodo];
    // No dejamos apagar el último: sin ningún método habilitado, el checkout
    // de la web queda sin forma de cerrar el pedido.
    if (actualizado.length === 0) return;
    setConfig((prev) => ({ ...prev, metodos_pago: JSON.stringify(actualizado) }));
  };

  const limpiarSecretoAlEnfocar = (key) => (event) => {
    if (event.target.value === SECRET_PLACEHOLDER) {
      setConfig((prev) => ({ ...prev, [key]: '' }));
    }
  };

  const mpHabilitado = metodos.includes('mercadopago');
  const transferenciaHabilitada = metodos.includes('transferencia');
  const tokenGuardado =
    config.mercadopago_token_configured && config.mercadopago_token === SECRET_PLACEHOLDER;
  const urlWebhook = config.public_api_url
    ? `${String(config.public_api_url).replace(/\/$/, '')}/api/pedidos/webhook/mercadopago`
    : null;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      {/* El título de la sección lo muestra el módulo arriba de las pestañas. */}

      <SectionCard
        icon={Banknote}
        title="Métodos de cobro"
        subtitle="Los que estén activos aparecen en la web, en el TPV y en la app del rider"
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {METODOS.map((metodo) => {
            const marca = paymentBrand(metodo);
            const Icono = marca.icon;
            const activo = metodos.includes(metodo);
            const esUltimo = activo && metodos.length === 1;
            return (
              <button
                key={metodo}
                type="button"
                role="switch"
                aria-checked={activo}
                onClick={() => toggleMetodo(metodo)}
                disabled={esUltimo}
                title={esUltimo ? 'Tiene que quedar al menos un método activo' : undefined}
                className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition disabled:cursor-not-allowed ${activo ? 'bg-white' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}
                style={activo ? { borderColor: marca.color } : undefined}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={
                    activo
                      ? { background: marca.soft, color: marca.color }
                      : { background: '#FFFFFF', color: '#9CA3AF' }
                  }
                >
                  <Icono size={17} strokeWidth={STROKE} />
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-[14px] font-medium ${activo ? 'text-gray-900' : 'text-gray-400'}`}
                >
                  {marca.label}
                </span>
                {activo ? (
                  <Check size={16} strokeWidth={2.6} style={{ color: marca.color }} />
                ) : null}
              </button>
            );
          })}
        </div>
      </SectionCard>

      {mpHabilitado ? (
        <SectionCard icon={Zap} title="Mercado Pago" subtitle="Cobro online desde la carta web">
          <InputField
            label="Access Token de producción"
            type="password"
            value={config.mercadopago_token || ''}
            onChange={(event) =>
              setConfig((prev) => ({ ...prev, mercadopago_token: event.target.value }))
            }
            onFocus={limpiarSecretoAlEnfocar('mercadopago_token')}
            placeholder="APP_USR-..."
            hint={
              tokenGuardado
                ? 'Ya hay un token guardado. Hacé clic en el campo y pegá el nuevo si querés cambiarlo.'
                : 'Lo sacás del panel de Mercado Pago, en Credenciales de producción.'
            }
          />

          <div className="mt-3">
            <ToggleSwitch
              checked={config.mercadopago_binary_mode === '1'}
              onChange={(valor) => setToggle('mercadopago_binary_mode', valor)}
              label="Aprobar o rechazar al instante"
              description="Sin pagos en estado pendiente. Evita pedidos que quedan en el limbo."
            />
          </div>

          {/*
            La nota anterior decía "configurá el webhook apuntando a la URL
            pública de tu API" sin decir cuál era. Ahora se arma sola con la
            URL configurada y se puede copiar.
          */}
          <div className="mt-3 flex gap-3 rounded-xl bg-gray-50 px-4 py-3">
            <Info size={16} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-gray-400" />
            <div className="min-w-0 text-[12px] leading-relaxed text-gray-600">
              <p>
                Para que los pedidos se marquen como pagados solos, cargá esta dirección como
                webhook en el panel de Mercado Pago:
              </p>
              {urlWebhook ? (
                <code className="mt-2 block break-all rounded-lg bg-white px-3 py-2 font-mono text-[11px] text-gray-800">
                  {urlWebhook}
                </code>
              ) : (
                <p className="mt-2 font-medium" style={{ color: BRAND }}>
                  Primero cargá la URL pública de la API en la pestaña Avanzado.
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}

      {transferenciaHabilitada ? (
        <SectionCard
          icon={Landmark}
          title="Transferencias"
          subtitle="Datos que ve el cliente para transferir"
        >
          <InputField
            label="CBU o alias"
            {...f('pagos_cbu_transferencia')}
            placeholder="modosabor.mp o 0000003100010000000001"
            hint="Se le muestra al cliente cuando elige transferencia en la web."
          />
          <div className="mt-3">
            <ToggleSwitch
              checked={config.pagos_validar_transferencia === '1'}
              onChange={(valor) => setToggle('pagos_validar_transferencia', valor)}
              label="Pedir comprobante"
              description="El cliente tiene que subir la foto de la transferencia para cerrar el pedido."
            />
          </div>
        </SectionCard>
      ) : null}

      {/*
        Las tarjetas de Mercado Pago y transferencia sólo se muestran si el
        método está habilitado. Antes estaban siempre, pidiendo un token y un
        CBU aunque el local no usara ninguno de los dos.
      */}
      {!mpHabilitado && !transferenciaHabilitada ? (
        <p className="rounded-2xl bg-white px-5 py-4 text-[13px] text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          Activá Mercado Pago o transferencia arriba para configurar sus datos.
        </p>
      ) : null}
    </div>
  );
}
