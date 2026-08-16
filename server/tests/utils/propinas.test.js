const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * Las propinas y el arqueo de caja.
 *
 * Lo que se prueba acá no es que el número se guarde: es que **el cajón
 * cierre**.
 *
 * La propina vive fuera de `pedidos.total` porque `total` es lo que cuesta la
 * comida y es de lo que salen los reportes de venta. Pero la plata sí está en
 * el cajón. Si el arqueo no la suma, el cierre da de más y parece un faltante
 * que no existe; si la suma dos veces, da de menos.
 *
 * Los cuatro casos que importan:
 *
 *   1. propina en efectivo    → suma al esperado
 *   2. propina con tarjeta     → NO suma al esperado
 *   3. pedido sin cobrar       → NO suma, la plata todavía no entró
 *   4. `total` nunca la incluye → los reportes de venta no se inflan
 */
function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-propinas-'));
  const script = `
    process.env.DATA_DIR = ${JSON.stringify(tempDir)};
    process.env.DB_FILE = ${JSON.stringify(path.join(tempDir, 'test.sqlite'))};
    process.env.NODE_ENV = 'test';
    process.env.INITIAL_ADMIN_EMAIL = 'test@example.invalid';
    process.env.INITIAL_ADMIN_PASSWORD = 'test-only-password';
    const assert = require('assert');
    const db = require(${JSON.stringify(path.join(__dirname, '..', '..', 'db'))});
    const caja = require(${JSON.stringify(path.join(__dirname, '..', '..', 'routes', 'caja'))});

    const desde = '2020-01-01 00:00:00';
    db.prepare("DELETE FROM pedidos").run();

    const insertar = db.prepare(\`
      INSERT INTO pedidos
        (numero, cliente_nombre, items, estado, tipo_entrega, metodo_pago,
         pago_estado, subtotal, costo_envio, descuento, total, propina,
         mozo_nombre, creado_en)
      VALUES (?, 'Test', '[]', ?, 'mostrador', ?, ?, ?, 0, 0, ?, ?, ?, '2020-06-01 12:00:00')
    \`);

    // 1. cobrado en efectivo, $1.000 de propina  → entra al cajón
    insertar.run(9001, 'entregado', 'efectivo', 'pagado', 1000000, 1000000, 100000, 'Ana');
    // 2. cobrado con tarjeta, $500 de propina    → NO entra al cajón
    insertar.run(9002, 'entregado', 'tarjeta', 'pagado', 500000, 500000, 50000, 'Ana');
    // 3. sin cobrar, con propina anotada         → NO cuenta todavía
    insertar.run(9003, 'nuevo', 'efectivo', 'pendiente', 300000, 300000, 30000, 'Beto');
    // 4. cobrado en efectivo, sin propina
    insertar.run(9004, 'entregado', 'efectivo', 'pagado', 200000, 200000, 0, 'Beto');

    const r = caja.buildCajaResumen(desde);

    // ── total no incluye propinas ──────────────────────────────────────────
    // 1.000.000 + 500.000 + 300.000 + 200.000 = 2.000.000 (sin las propinas)
    assert.strictEqual(r.totalVentas, 2000000, 'totalVentas no debe incluir propinas');

    // ── propinas: sólo las de pedidos cobrados ─────────────────────────────
    assert.strictEqual(r.propinas, 150000, 'propinas cobradas = 100.000 + 50.000');
    assert.strictEqual(r.propinasEfectivo, 100000, 'sólo la de efectivo va al cajón');
    assert.strictEqual(r.propinasDigitales, 50000, 'la de tarjeta no pasa por el cajón');

    // ── el cajón ───────────────────────────────────────────────────────────
    // ventas en efectivo cobradas: 1.000.000 + 200.000 = 1.200.000
    // más la propina en efectivo:                          100.000
    assert.strictEqual(
      r.efectivoNeto,
      1300000,
      'el esperado del cajón tiene que incluir la propina en efectivo'
    );

    // ── reparto por mozo ───────────────────────────────────────────────────
    const ana = r.propinasPorMozo.find((m) => m.mozo === 'Ana');
    assert.ok(ana, 'Ana tiene que aparecer en el reparto');
    assert.strictEqual(ana.propinas, 150000, 'a Ana le corresponden las dos propinas');
    assert.strictEqual(ana.pedidos, 2);
    assert.ok(
      !r.propinasPorMozo.find((m) => m.mozo === 'Beto'),
      'Beto no cobró ninguna propina: no debe figurar'
    );

    db.close();
  `;

  try {
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..', '..'),
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    console.log('propinas.test.js OK');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) run();

module.exports = { run };
