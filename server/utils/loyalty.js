/**
 * Estadísticas de compra de cada cliente.
 *
 * ── Qué NO hace, y por qué importa ─────────────────────────────────────────
 *
 * Este archivo **no toca los puntos ni el nivel**. De eso se encarga
 * `services/fidelizacionService.js`, que es el sistema de fidelidad de verdad:
 * lleva un libro de transacciones de puntos, usa el `pesos_por_punto` que se
 * configura desde el panel, y asigna el nivel según la tabla
 * `fidelizacion_niveles`.
 *
 * Antes esto también escribía `puntos` y `nivel`, con sus propias cuentas
 * escritas a mano:
 *
 *   · Los puntos eran `gastado / 100`, con el 100 fijo. Coincidía con el
 *     sistema nuevo sólo mientras nadie tocara `pesos_por_punto`. Al cambiarlo,
 *     este archivo pisaba el saldo correcto con uno inventado.
 *   · El nivel salía de unos umbrales de puntos escritos acá (500/1500/3000),
 *     ignorando la tabla de niveles configurable.
 *
 * Y como esto corre en **cada cambio de estado** de un pedido —no sólo al
 * entregarlo— borraba el saldo del libro de puntos varias veces por pedido.
 *
 * Lo que sí calcula son las tres cosas que nadie más calcula: cuántos pedidos
 * hizo, cuánto gastó, y cada cuántos días vuelve.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  const frecuenciaDias = averageFrequencyDays(pedidosEntregados);

  /*
    `puntos` y `nivel` quedan afuera del UPDATE a propósito. Son de
    fidelizacionService; si se listaran acá, cada cambio de estado de un pedido
    los sobreescribiría.
  */
  db.prepare(
    `
      UPDATE clientes
      SET total_pedidos = ?, total_gastado = ?, frecuencia_dias = ?
      WHERE id = ?
    `
  ).run(totalPedidos, totalGastado, frecuenciaDias, clienteId);

  return db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
}

function recalculateAllClientes(db) {
  const clientes = db.prepare('SELECT id FROM clientes').all();
  clientes.forEach((cliente) => {
    recalculateClienteStats(db, cliente.id);
  });
}

module.exports = {
  recalculateClienteStats,
  recalculateAllClientes,
};
