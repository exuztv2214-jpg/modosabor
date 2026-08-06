import { Gift, MapPin, PauseCircle, Phone } from 'lucide-react';

import { STROKE } from '../../lib/theme.js';
import {
  AvatarDisplay,
  Empty,
  METRICA_TONOS,
  nivelEstilo,
  segmentoTono,
} from '../../pages/Clientes/clientesUi.jsx';

const VERDE_BANDA = '#E7F5EF';
const VERDE_FUERTE = '#047857';
const VERDE_TEXTO = '#065F46';

export default function ClientesGrid({
  filtered,
  abrirDetalle,
  getClienteEstado,
  getCardQuickAction,
  fmtMoney,
  formatPedidoDate,
  sellosParaPremio,
  hayFiltros,
  onLimpiarFiltros,
  onNuevo,
  toast,
}) {
  if (!filtered.length) {
    return (
      <Empty
        title={hayFiltros ? 'Ningún cliente coincide' : 'Todavía no hay clientes'}
        description={
          hayFiltros
            ? 'Probá con otro término de búsqueda o sacá alguno de los filtros.'
            : 'Los clientes se cargan desde el TPV al cobrar, desde la web pública o a mano acá.'
        }
        action={
          hayFiltros ? (
            <button
              type="button"
              onClick={onLimpiarFiltros}
              className="h-10 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Limpiar filtros
            </button>
          ) : (
            <button
              type="button"
              onClick={onNuevo}
              style={{ background: nivelEstilo('Oro').fuerte }}
              className="h-10 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              Cargar el primero
            </button>
          )
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {filtered.map((cliente) => {
        // Se llamaba dos veces por tarjeta, una para el label y otra para el href.
        const accion = getCardQuickAction(cliente);
        const sellos = Math.min(Number(cliente.sellos_actuales || 0), sellosParaPremio);
        const premios = Number(cliente.recompensas_pendientes || 0);
        const sinTelefono = !String(cliente.telefono || '').trim();
        const conPremio = premios > 0;
        const nivel = nivelEstilo(cliente.nivel);
        const estado = segmentoTono(getClienteEstado(cliente));

        /*
          La cabecera se pinta con el color del nivel del cliente. Es la única
          parte con color fuerte de la tarjeta, y no es decoración: scrolleás
          la grilla y ves de un vistazo quiénes son tus Oro sin leer nada.

          La excepción es cuando hay un premio esperando. Ahí manda el verde,
          porque esa es la tarjeta a la que hay que escribirle hoy y tiene que
          ganarle en atención al nivel.
        */
        const banda = conPremio ? VERDE_BANDA : nivel.banda;
        const acento = conPremio ? VERDE_FUERTE : nivel.fuerte;
        const textoBanda = conPremio ? VERDE_TEXTO : nivel.texto;
        const textoSuave = conPremio ? VERDE_FUERTE : nivel.apagado;

        return (
          <div
            key={cliente.id}
            className="group overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)]"
          >
            <button
              type="button"
              onClick={() => abrirDetalle(cliente)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
              style={{ background: banda }}
            >
              <span className="shrink-0 rounded-[14px] p-[2px]" style={{ background: acento }}>
                <AvatarDisplay
                  url={cliente.avatar_url}
                  fallbackId={cliente.id}
                  nombre={cliente.nombre}
                  size="h-11 w-11"
                />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold" style={{ color: textoBanda }}>
                  {cliente.nombre || 'Cliente sin nombre'}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold"
                    style={{ color: nivel.fg }}
                  >
                    {cliente.nivel || 'Bronce'}
                  </span>
                  <span
                    className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium"
                    style={{ color: estado.fg }}
                  >
                    {estado.label}
                  </span>
                  {!cliente.fidelizacion_activa ? (
                    <span
                      className="inline-flex items-center gap-1 text-[11px]"
                      style={{ color: textoSuave }}
                      title="Este cliente no acumula sellos"
                    >
                      <PauseCircle size={11} strokeWidth={STROKE} />
                      Pausado
                    </span>
                  ) : null}
                </div>
              </div>
            </button>

            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="rounded-xl px-3 py-2"
                  style={{ background: METRICA_TONOS.gastado.bg }}
                >
                  <p className="text-[11px]" style={{ color: METRICA_TONOS.gastado.label }}>
                    Gastado
                  </p>
                  <p
                    className="mt-0.5 truncate text-[15px] font-bold tabular-nums"
                    style={{ color: METRICA_TONOS.gastado.valor }}
                  >
                    {fmtMoney(cliente.total_gastado)}
                  </p>
                </div>
                <div
                  className="rounded-xl px-3 py-2"
                  style={{ background: METRICA_TONOS.pedidos.bg }}
                >
                  <p className="text-[11px]" style={{ color: METRICA_TONOS.pedidos.label }}>
                    Pedidos
                  </p>
                  <p
                    className="mt-0.5 text-[15px] font-bold tabular-nums"
                    style={{ color: METRICA_TONOS.pedidos.valor }}
                  >
                    {cliente.total_pedidos || 0}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-[12px] text-gray-500">
                <p className="flex items-center gap-1.5">
                  <Phone size={12} strokeWidth={STROKE} className="shrink-0 text-gray-400" />
                  {sinTelefono ? (
                    <span className="text-gray-400">Sin teléfono cargado</span>
                  ) : (
                    <span className="tabular-nums">{cliente.telefono}</span>
                  )}
                </p>
                <p className="flex items-center gap-1.5">
                  <MapPin size={12} strokeWidth={STROKE} className="shrink-0 text-gray-400" />
                  <span className="truncate">{cliente.direccion || 'Sin dirección'}</span>
                </p>
              </div>

              <div className="mt-3">
                {conPremio ? (
                  <div
                    className="flex items-center gap-2 rounded-xl px-3 py-2"
                    style={{ background: VERDE_BANDA }}
                  >
                    <Gift size={15} strokeWidth={STROKE} style={{ color: VERDE_FUERTE }} />
                    <p className="text-[12px] font-semibold" style={{ color: VERDE_TEXTO }}>
                      {premios === 1 ? 'Tiene un premio esperando' : `Tiene ${premios} premios`}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] text-gray-400">
                        {cliente.ultima_compra
                          ? `Última compra ${formatPedidoDate(cliente.ultima_compra)}`
                          : 'Sin compras registradas'}
                      </p>
                      <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                        {sellos}/{sellosParaPremio}
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {Array.from({ length: sellosParaPremio }, (_, i) => i).map((i) => (
                        <span
                          key={i}
                          className="h-1.5 flex-1 rounded-full transition-all duration-500"
                          style={{ background: i < sellos ? nivel.fuerte : '#EEF0F3' }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => abrirDetalle(cliente)}
                  className="h-9 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  Ver ficha
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Acá reventaba: `toast` llegaba undefined desde el hook,
                    // así que el cliente sin teléfono —el único caso que este
                    // aviso existía para cubrir— tiraba un TypeError y dejaba
                    // la pantalla en blanco.
                    if (sinTelefono) {
                      toast?.error?.('Este cliente no tiene teléfono cargado');
                      return;
                    }
                    window.open(accion.href, '_blank', 'noopener,noreferrer');
                  }}
                  disabled={sinTelefono}
                  style={sinTelefono ? undefined : { background: acento, color: '#fff' }}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:brightness-110 disabled:opacity-40"
                >
                  <accion.icon size={13} strokeWidth={STROKE} />
                  {accion.label}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
