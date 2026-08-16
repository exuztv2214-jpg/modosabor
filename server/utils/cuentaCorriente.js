/**
 * Cuenta corriente de clientes: consumir ahora y pagar después.
 *
 * ── El saldo se calcula, no se guarda ──────────────────────────────────────
 *
 * Sumando los movimientos, siempre. Un saldo guardado en una columna se
 * desincroniza el día que algo falla a mitad de camino, y desde ahí nadie sabe
 * cuál de los dos números es el bueno.
 *
 * Además, cuando el cliente discute la cuenta —y en algún momento la discute—
 * lo único que sirve es la lista de movimientos con fecha, motivo y quién lo
 * cargó. Un número solo no se puede defender.
 *
 * ── Signo ──────────────────────────────────────────────────────────────────
 *
 * Saldo positivo = el cliente debe. Es lo intuitivo para quien lo mira: "Juan
 * tiene $12.000 de cuenta" se entiende como que Juan debe $12.000.
 */

function saldoDeCliente(db, clienteId) {
  const fila = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo = 'consumo' THEN monto
                           WHEN tipo = 'ajuste'  THEN monto
                           ELSE -monto END), 0) AS saldo
       FROM cliente_cuenta_movimientos
      WHERE cliente_id = ?`
    )
    .get(clienteId);
  return Number(fila?.saldo || 0);
}

/**
 * ¿Se le puede fiar este monto?
 *
 * Se chequea contra el límite **antes** de crear el consumo. Sin esto, la
 * cuenta corriente es una forma elegante de regalar comida: el que no paga
 * sigue pidiendo y nadie se entera hasta fin de mes.
 */
function puedeFiar(db, clienteId, monto) {
  const cliente = db
    .prepare('SELECT id, nombre, limite_credito FROM clientes WHERE id = ?')
    .get(clienteId);
  if (!cliente) return { ok: false, motivo: 'No encontramos ese cliente' };

  const limite = Number(cliente.limite_credito || 0);
  /*
    Cero es "no tiene cuenta corriente", no "crédito infinito". Habilitarla
    tiene que ser una decisión que alguien tomó por este cliente, no el estado
    por defecto de todos.
  */
  if (limite <= 0) {
    return {
      ok: false,
      motivo: `${cliente.nombre} no tiene cuenta corriente habilitada. Configurale un límite primero.`,
    };
  }

  const saldo = saldoDeCliente(db, clienteId);
  const quedaria = saldo + Number(monto || 0);
  if (quedaria > limite) {
    return {
      ok: false,
      saldo,
      limite,
      motivo:
        `${cliente.nombre} debe ${pesos(saldo)} y su límite es ${pesos(limite)}. ` +
        `Con este pedido quedaría en ${pesos(quedaria)}.`,
    };
  }

  return { ok: true, saldo, limite, disponible: limite - quedaria };
}

function pesos(centavos) {
  return `$${(Number(centavos || 0) / 100).toLocaleString('es-AR')}`;
}

/**
 * Anota un consumo a la cuenta.
 *
 * El índice único sobre `pedido_id` impide cargar el mismo pedido dos veces:
 * un reintento de cobro le duplicaría la deuda al cliente. Es el mismo
 * problema de idempotencia que en la creación de pedidos, pero acá el
 * perjudicado es el que paga.
 */
function anotarConsumo(db, { clienteId, monto, pedidoId, nota, usuario }) {
  const yaEsta = pedidoId
    ? db
        .prepare(
          "SELECT id FROM cliente_cuenta_movimientos WHERE pedido_id = ? AND tipo = 'consumo'"
        )
        .get(pedidoId)
    : null;
  if (yaEsta) return { duplicado: true, id: yaEsta.id };

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO cliente_cuenta_movimientos
         (cliente_id, tipo, monto, pedido_id, nota, usuario_id, usuario_nombre)
       VALUES (?, 'consumo', ?, ?, ?, ?, ?)`
    )
    .run(
      clienteId,
      Math.round(Number(monto || 0)),
      pedidoId || null,
      String(nota || ''),
      usuario?.id || null,
      usuario?.nombre || ''
    );

  return { id: Number(lastInsertRowid), saldo: saldoDeCliente(db, clienteId) };
}

function registrarPago(db, { clienteId, monto, nota, usuario }) {
  const cantidad = Math.round(Number(monto || 0));
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return { ok: false, motivo: 'El pago tiene que ser mayor a cero' };
  }

  const saldo = saldoDeCliente(db, clienteId);
  /*
    No se acepta un pago mayor a la deuda. Casi siempre es un error de tipeo, y
    dejarlo pasar deja al cliente con saldo a favor: una cuenta que el sistema
    no sabe cómo devolver y que después nadie entiende.
  */
  if (cantidad > saldo) {
    return {
      ok: false,
      motivo: `Debe ${pesos(saldo)}. No se puede registrar un pago mayor.`,
      saldo,
    };
  }

  db.prepare(
    `INSERT INTO cliente_cuenta_movimientos
       (cliente_id, tipo, monto, nota, usuario_id, usuario_nombre)
     VALUES (?, 'pago', ?, ?, ?, ?)`
  ).run(clienteId, cantidad, String(nota || ''), usuario?.id || null, usuario?.nombre || '');

  return { ok: true, saldo: saldoDeCliente(db, clienteId) };
}

/** Quiénes deben, ordenados por cuánto. */
function deudores(db) {
  return db
    .prepare(
      `SELECT c.id, c.nombre, c.telefono, c.limite_credito,
              COALESCE(SUM(CASE WHEN m.tipo IN ('consumo','ajuste') THEN m.monto
                                ELSE -m.monto END), 0) AS saldo,
              MAX(m.creado_en) AS ultimo_movimiento
         FROM clientes c
         JOIN cliente_cuenta_movimientos m ON m.cliente_id = c.id
        GROUP BY c.id
       HAVING saldo > 0
        ORDER BY saldo DESC`
    )
    .all();
}

module.exports = { saldoDeCliente, puedeFiar, anotarConsumo, registrarPago, deudores, pesos };
