const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * El carrito tiene que estar en el contexto del modelo, siempre.
 *
 * Esto sale de una conversación real: el cliente tenía media docena de
 * empanadas cargadas y una guarnición a medio elegir, y el agente cerró con
 * "¡Hasta la próxima! Gracias por consultar". El pedido se perdió y nadie se
 * enteró.
 *
 * La causa no fue el modelo: fue que el estado del carrito sólo existía si se
 * acordaba de llamar a `ver_carrito`. Un dato que decide si la conversación
 * puede terminar no puede depender de que el modelo pregunte.
 *
 * Se prueban las dos puntas:
 *
 * 1. Con el carrito vacío, el texto dice que está vacío y nada más — si
 *    metiera la advertencia siempre, el modelo la ignoraría por repetida.
 *
 * 2. Con algo cargado, aparecen los ítems, el total y la instrucción de no
 *    despedirse sin confirmar.
 */
function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-carrito-ctx-'));
  const script = `
    process.env.DATA_DIR = ${JSON.stringify(tempDir)};
    process.env.DB_FILE = ${JSON.stringify(path.join(tempDir, 'test.sqlite'))};
    process.env.NODE_ENV = 'test';
    process.env.INITIAL_ADMIN_EMAIL = 'test@example.invalid';
    process.env.INITIAL_ADMIN_PASSWORD = 'test-only-password';
    const assert = require('assert');
    const db = require(${JSON.stringify(path.join(__dirname, '..', '..', 'db'))});
    const { resumenDelCarrito } = require(${JSON.stringify(
      path.join(__dirname, '..', '..', 'services', 'agenteWhatsapp')
    )});

    const telefono = '3815550000';

    // ── Sin nada cargado ──────────────────────────────────────────────────
    const vacio = resumenDelCarrito(db, telefono);
    assert.match(vacio, /vac/i, 'con el carrito vacío lo tiene que decir');
    assert.doesNotMatch(
      vacio,
      /no cierres/i,
      'sin pedido no corresponde advertir: repetida, la advertencia se vuelve ruido'
    );

    // ── Con un pedido a medio armar ───────────────────────────────────────
    db.prepare(
      "INSERT INTO whatsapp_pedidos_borrador (telefono, estado, total) VALUES (?, 'abierto', 550000)"
    ).run(telefono);
    const borradorId = db
      .prepare('SELECT id FROM whatsapp_pedidos_borrador WHERE telefono = ?')
      .get(telefono).id;
    db.prepare(
      \`INSERT INTO whatsapp_pedidos_borrador_items
         (borrador_id, producto_id, nombre, cantidad, precio_unitario)
       VALUES (?, 1, 'Empanadas de mondongo', 6, 91666)\`
    ).run(borradorId);

    const conPedido = resumenDelCarrito(db, telefono);

    assert.match(conPedido, /Empanadas de mondongo/, 'tiene que nombrar lo cargado');
    assert.match(conPedido, /6×/, 'y cuántas son');
    assert.match(conPedido, /5\\.500/, 'y cuánto lleva gastado');
    assert.match(
      conPedido,
      /no cierres/i,
      'con un pedido abierto tiene que prohibir la despedida'
    );

    db.close();
  `;

  try {
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..', '..'),
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    console.log('carritoEnContexto.test.js OK');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) run();

module.exports = { run };
