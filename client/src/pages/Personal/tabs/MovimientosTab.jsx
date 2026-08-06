import { format, parseISO, isValid } from 'date-fns';

import { BRAND } from '../../../lib/theme.js';
import { Card, Empty, Pill } from '../components.jsx';
import { fmt } from '../constants.js';

/** `format(parseISO(x))` explota si `x` viene vacío o mal formado. */
function fecha(valor, patron = 'dd/MM/yyyy') {
  if (!valor) return '—';
  try {
    const d = parseISO(String(valor));
    return isValid(d) ? format(d, patron) : '—';
  } catch {
    return '—';
  }
}

const TONOS_TIPO = {
  adelanto: { bg: '#FEF2F2', fg: '#9E141E', label: 'Adelanto' },
  descuento: { bg: '#FDF3D3', fg: '#95661A', label: 'Descuento' },
  consumo: { bg: '#F1F5F9', fg: '#475569', label: 'Consumo' },
};

const METODOS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  modo: 'Modo',
  uala: 'Ualá',
};

export function MovimientosTab({ detail }) {
  // Se hacía `detail.liquidaciones.map(...)` sin guarda: si el endpoint no
  // devolvía el array (empleado recién creado), la pestaña rompía entera.
  const liquidaciones = Array.isArray(detail?.liquidaciones) ? detail.liquidaciones : [];
  const movimientos = Array.isArray(detail?.movimientos) ? detail.movimientos : [];

  const pendientes = movimientos.filter(
    (m) => String(m.estado || '').toLowerCase() === 'pendiente'
  );
  const totalPendiente = pendientes.reduce((acc, m) => acc + Number(m.monto || 0), 0);

  return (
    <div className="space-y-4">
      <Card
        title="Movimientos"
        helper="Adelantos, descuentos y consumos cargados a la cuenta"
        action={
          pendientes.length > 0 ? (
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{ background: '#FEF2F2', color: '#9E141E' }}
            >
              {fmt(totalPendiente)} sin liquidar
            </span>
          ) : null
        }
      >
        {movimientos.length === 0 ? (
          <Empty
            title="Sin movimientos"
            description="Acá aparecen los adelantos, descuentos y consumos que le vayas cargando."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[12px] text-gray-500">
                  <th className="pb-3 font-normal">Fecha</th>
                  <th className="pb-3 font-normal">Tipo</th>
                  <th className="pb-3 font-normal">Detalle</th>
                  <th className="pb-3 text-right font-normal">Monto</th>
                  <th className="pb-3 text-right font-normal">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movimientos.map((m) => {
                  const tono = TONOS_TIPO[m.tipo] || TONOS_TIPO.consumo;
                  const pendiente = String(m.estado || '').toLowerCase() === 'pendiente';
                  return (
                    <tr key={m.id}>
                      <td className="py-3 text-[13px] tabular-nums text-gray-600">
                        {fecha(m.creado_en, 'dd/MM/yy HH:mm')}
                      </td>
                      <td className="py-3">
                        <Pill label={tono.label} bg={tono.bg} fg={tono.fg} />
                      </td>
                      <td className="max-w-[240px] truncate py-3 text-[13px] text-gray-700">
                        {m.descripcion || '—'}
                      </td>
                      <td className="py-3 text-right text-[13px] font-semibold tabular-nums text-gray-900">
                        {fmt(m.monto)}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className="text-[12px]"
                          style={{ color: pendiente ? BRAND : '#6B7280' }}
                        >
                          {pendiente ? 'Sin liquidar' : 'Liquidado'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Liquidaciones" helper="Cada vez que se le pagó y por cuánto">
        {liquidaciones.length === 0 ? (
          <Empty
            title="Todavía no se le liquidó nada"
            description="Cuando confirmes una liquidación va a quedar registrada acá."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[12px] text-gray-500">
                  <th className="pb-3 font-normal">Fecha</th>
                  <th className="pb-3 font-normal">Período</th>
                  <th className="pb-3 font-normal">Método</th>
                  <th className="pb-3 text-right font-normal">Neto pagado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {liquidaciones.map((liq) => (
                  <tr key={liq.id}>
                    <td className="py-3 text-[13px] tabular-nums text-gray-600">
                      {fecha(liq.creado_en)}
                    </td>
                    <td className="py-3 text-[13px] text-gray-700">
                      {liq.periodo_desde
                        ? `${liq.periodo_desde} → ${liq.periodo_hasta || '—'}`
                        : liq.frecuencia_pago || '—'}
                    </td>
                    <td className="py-3 text-[13px] text-gray-700">
                      {METODOS[liq.metodo_pago] || liq.metodo_pago || '—'}
                    </td>
                    <td className="py-3 text-right text-[13px] font-semibold tabular-nums text-gray-900">
                      {fmt(liq.monto_neto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
