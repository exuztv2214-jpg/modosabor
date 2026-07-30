const MS_PER_DAY = 24 * 60 * 60 * 1000;

function levelFromPoints(points) {
  const value = Number(points || 0);
  if (value >= 3000) return 'Platino';
  if (value >= 1500) return 'Oro';
  if (value >= 500) return 'Plata';
  return 'Bronce';
}

function computeRewardState(totalPedidos, canjesHistoricos) {
  const delivered = Math.max(0, Number(totalPedidos || 0));
  const canjesRealizados = Math.max(0, Number(canjesHistoricos || 0));

  // Las compras que "cuentan" para sellos son el total menos las que ya se usaron para premios
  const comprasConsumidas = canjesRealizados * 6;
  const comprasDisponibles = Math.max(0, delivered - comprasConsumidas);

  return {
    recompensasPendientes: Math.floor(comprasDisponibles / 6),
    sellos: comprasDisponibles % 6,
  };
}

function averageFrequencyDays(pedidos) {
  if (!Array.isArray(pedidos) || pedidos.length < 2) return 7;

  let totalDiff = 0;
  let validDiffs = 0;

  for (let index = 1; index < pedidos.length; index += 1) {
    const previous = new Date(pedidos[index - 1].creado_en);
    const current = new Date(pedidos[index].creado_en);
    const diff = Math.round((current - previous) / MS_PER_DAY);

    if (Number.isFinite(diff) && diff > 0) {
      totalDiff += diff;
      validDiffs += 1;
    }
  }

  if (validDiffs === 0) return 7;
  return Math.max(1, Math.round(totalDiff / validDiffs));
}

function recalculateClienteStats(db, clienteId) {
  const existing = db.prepare('SELECT id FROM clientes WHERE id = ?').get(clienteId);
  if (!existing) return null;

  const pedidosEntregados = db
    .prepare(
      "SELECT total, creado_en FROM pedidos WHERE cliente_id = ? AND estado = 'entregado' ORDER BY datetime(creado_en) ASC"
    )
    .all(clienteId);

  const totalPedidos = pedidosEntregados.length;
  const totalGastado = pedidosEntregados.reduce(
    (acc, pedido) => acc + Number(pedido.total || 0),
    0
  );
  const puntos = Math.floor(totalGastado / 100);
  const nivel = levelFromPoints(puntos);
  const frecuenciaDias = averageFrequencyDays(pedidosEntregados);

  // Detectar si acaba de ganar un premio nuevo (múltiplo de 6 real)

  db.prepare(
    `
      UPDATE clientes
      SET total_pedidos = ?, total_gastado = ?, puntos = ?, nivel = ?,
          frecuencia_dias = ?
      WHERE id = ?
    `
  ).run(totalPedidos, totalGastado, puntos, nivel, frecuenciaDias, clienteId);

  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
}

function recalculateAllClientes(db) {
  const clientes = db.prepare('SELECT id FROM clientes').all();
  clientes.forEach((cliente) => {
    recalculateClienteStats(db, cliente.id);
  });
}

module.exports = {
  computeRewardState,
  levelFromPoints,
  recalculateClienteStats,
  recalculateAllClientes,
};
