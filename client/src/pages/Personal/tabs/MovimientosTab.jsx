import { format, parseISO } from 'date-fns';
import { fmt } from '../constants.js';

export function MovimientosTab({ detail }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex items-center justify-between">
          <h4 className="text-base font-bold text-gray-900">Historial de Liquidaciones</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Periodo
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Método
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                  Neto
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {detail.liquidaciones.map((liq) => (
                <tr key={liq.id} className="hover:bg-gray-50/50 transition-all">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gray-700">
                      {format(parseISO(liq.creado_en), 'dd/MM/yyyy')}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      {liq.periodo_desde
                        ? `${liq.periodo_desde} - ${liq.periodo_hasta}`
                        : liq.frecuencia_pago}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-[10px] font-bold text-gray-600 uppercase tracking-wider">
                      {liq.metodo_pago}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-bold text-success-600">{fmt(liq.monto_neto)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <h4 className="text-base font-bold text-gray-900">Últimos Movimientos de Caja</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Descripción
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">
                  Monto
                </th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {detail.movimientos.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-all">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-gray-700">
                      {format(parseISO(m.creado_en), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        m.tipo === 'adelanto'
                          ? 'bg-danger-50 text-danger-600'
                          : m.tipo === 'descuento'
                            ? 'bg-warning-50 text-warning-600'
                            : 'bg-primary-50 text-primary-500'
                      }`}
                    >
                      {m.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-gray-600">{m.descripcion}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-bold text-gray-900">{fmt(m.monto)}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${m.estado === 'pendiente' ? 'bg-warning-100 text-warning-700' : 'bg-success-100 text-success-700'}`}
                    >
                      {m.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
