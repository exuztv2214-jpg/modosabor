import { useState } from 'react';

import { estadoTono } from '../../lib/theme.js';
import { Card, Empty } from './clientesUi.jsx';

export default function HistorialPedidosPanel({ pedidos, formatPedidoDate, fmtMoney }) {
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const visibles = mostrarTodos ? lista : lista.slice(0, 5);
  const hayMas = lista.length > 5;

  const totalGastado = lista.reduce((acc, p) => acc + Number(p.total || 0), 0);

  return (
    <Card
      title="Pedidos del cliente"
      helper={
        lista.length
          ? `${lista.length} ${lista.length === 1 ? 'pedido' : 'pedidos'} · ${fmtMoney(totalGastado)} en total`
          : undefined
      }
      action={
        hayMas ? (
          <button
            type="button"
            onClick={() => setMostrarTodos((prev) => !prev)}
            className="shrink-0 text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
          >
            {mostrarTodos ? 'Ver menos' : `Ver los ${lista.length}`}
          </button>
        ) : null
      }
    >
      {visibles.length ? (
        <div className="space-y-1.5">
          {visibles.map((p) => {
            const tono = estadoTono(p.estado);
            return (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium tabular-nums text-gray-900">#{p.numero}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {formatPedidoDate(p.creado_en)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: tono.bg, color: tono.fg }}
                  >
                    {tono.label}
                  </span>
                  <span className="text-[13px] font-bold tabular-nums text-gray-900">
                    {fmtMoney(p.total)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty
          title="Sin pedidos registrados"
          description="Cuando este cliente compre desde el TPV o la web, los pedidos aparecen acá."
        />
      )}
    </Card>
  );
}
