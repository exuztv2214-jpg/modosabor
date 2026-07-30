import { useState } from 'react';

export default function HistorialPedidosPanel({ pedidos, formatPedidoDate, fmtMoney }) {
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const total = pedidos?.length || 0;
  const visibles = mostrarTodos ? pedidos : (pedidos || []).slice(0, 4);
  const hayMas = total > 4;

  return (
    <div className="rounded-[32px] border border-white bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
          Últimos pedidos
        </h4>
        {hayMas && (
          <button
            onClick={() => setMostrarTodos((prev) => !prev)}
            className="text-[9px] font-black uppercase tracking-widest text-primary-500 hover:underline"
          >
            {mostrarTodos ? 'Ver menos' : 'Ver historial'}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {visibles?.length > 0 ? (
          visibles.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-[24px] border border-gray-100 bg-[#F8FAFD] px-4 py-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-xs font-black text-gray-800 shadow-sm">
                  #{p.numero}
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900">
                    {formatPedidoDate(p.creado_en)}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {p.estado}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-black text-gray-900">{fmtMoney(p.total)}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-4 text-center text-xs font-bold uppercase text-gray-400">
            Sin pedidos registrados
          </p>
        )}
      </div>
    </div>
  );
}
