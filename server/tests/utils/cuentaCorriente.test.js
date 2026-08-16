const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Cuenta corriente de clientes.
 *
 * Tres cosas se prueban, y las tres son de plata:
 *
 * 1. Que el límite frene de verdad. Sin eso la cuenta corriente es una forma
 *    elegante de regalar comida: el que no paga sigue pidiendo y nadie se
 *    entera hasta fin de mes.
 *
 * 2. Que un pedido no se cargue dos veces. Un reintento de cobro le duplicaría
 *    la deuda al cliente — el mismo problema de idempotencia que en los
 *    pedidos, pero acá el perjudicado es el que paga.
 *
 * 3. Que límite cero signifique "sin cuenta habilitada" y no "crédito
 *    infinito". Si fuera al revés, todos los clientes del sistema tendrían
 *    crédito sin límite desde el día uno.
 */
function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-ctacte-'));
  const script = `
    process.env.DATA_DIR = ${JSON.stringify(tempDir)};
    process.env.DB_FILE = ${JSON.stringify(path.join(tempDir, 'test.sqlite'))};
    process.env.NODE_ENV = 'test';
    process.env.INITIAL_ADMIN_EMAIL = 'test@example.invalid';
    process.env.INITIAL_ADMIN_PASSWORD = 'test-only-password';
    const assert = require('assert');
    const db = require(${JSON.stringify(path.join(__dirname, '..', '..', 'db'))});
    const CC = require(${JSON.stringify(path.join(__dirname, '..', '..', 'utils', 'cuentaCorriente'))});

    const usuario = { id: 1, nombre: 'Test' };
    db.prepare("INSERT INTO clientes (nombre, telefono, limite_credito) VALUES ('Oficina', '381', 5000000)").run();
    db.prepare("INSERT INTO clientes (nombre, telefono, limite_credito) VALUES ('Sin cuenta', '382', 0)").run();
    const oficina = db.prepare("SELECT id FROM clientes WHERE nombre = 'Oficina'").get().id;
    const sinCuenta = db.prepare("SELECT id FROM clientes WHERE nombre = 'Sin cuenta'").get().id;
    // pedido_id tiene clave foránea: el consumo debe referir a una venta real,
    // igual que lo hace la ruta de caja.
    db.prepare("INSERT INTO pedidos (id, numero, cliente_id, items, subtotal, total) VALUES (1, 1, ?, '[]', 0, 0)").run(oficina);

    // ── Arranca en cero ──────────────────────────────────────────────────────
    assert.strictEqual(CC.saldoDeCliente(db, oficina), 0);

    // ── Se le fía dentro del límite ──────────────────────────────────────────
    assert.ok(CC.puedeFiar(db, oficina, 2000000).ok, 'con límite de 50.000 se le fían 20.000');
    CC.anotarConsumo(db, { clienteId: oficina, monto: 2000000, pedidoId: 1, usuario });
    assert.strictEqual(CC.saldoDeCliente(db, oficina), 2000000, 'debe 20.000');

    // ── El mismo pedido dos veces no duplica la deuda ────────────────────────
    const repetido = CC.anotarConsumo(db, { clienteId: oficina, monto: 2000000, pedidoId: 1, usuario });
    assert.ok(repetido.duplicado, 'se detecta el reintento');
    assert.strictEqual(CC.saldoDeCliente(db, oficina), 2000000, 'la deuda no se duplicó');

    // ── El límite frena ──────────────────────────────────────────────────────
    const pasado = CC.puedeFiar(db, oficina, 4000000);
    assert.ok(!pasado.ok, '20.000 + 40.000 pasa el límite de 50.000');

    // ── Límite cero es "sin cuenta", no "infinito" ───────────────────────────
    assert.ok(!CC.puedeFiar(db, sinCuenta, 100000).ok);

    // ── Pagos ────────────────────────────────────────────────────────────────
    assert.ok(CC.registrarPago(db, { clienteId: oficina, monto: 800000, usuario }).ok);
    assert.strictEqual(CC.saldoDeCliente(db, oficina), 1200000, 'quedan 12.000');
    assert.ok(
      !CC.registrarPago(db, { clienteId: oficina, monto: 9900000, usuario }).ok,
      'no se puede pagar más de lo que se debe'
    );

    // ── Después de pagar, vuelve a haber crédito ─────────────────────────────
    assert.ok(CC.puedeFiar(db, oficina, 3000000).ok, '12.000 + 30.000 entra en 50.000');

    // ── La lista de deudores ─────────────────────────────────────────────────
    const lista = CC.deudores(db);
    assert.strictEqual(lista.length, 1, 'sólo figura quien debe');
    assert.strictEqual(lista[0].saldo, 1200000);

    db.close();
  `;

  try {
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..', '..'),
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    console.log('cuentaCorriente.test.js OK');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) run();

module.exports = { run };
