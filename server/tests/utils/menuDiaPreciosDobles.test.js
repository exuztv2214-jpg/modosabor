const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run() {
  const migraciones = fs.readFileSync(
    path.join(__dirname, '..', '..', 'db', 'migrations.js'),
    'utf8'
  );
  assert.match(
    migraciones,
    /migracion_precios_menu_20261001_v1/,
    'la suba de precios del menú necesita una marca idempotente'
  );
  assert.match(
    migraciones,
    /anterior:\s*500000,\s*nuevo:\s*600000/,
    'el menú económico debe pasar de $5.000 a $6.000'
  );
  assert.match(
    migraciones,
    /anterior:\s*700000,\s*nuevo:\s*800000/,
    'el menú ejecutivo debe pasar de $7.000 a $8.000'
  );
  assert.match(
    migraciones,
    /anterior:\s*900000,\s*nuevo:\s*1000000/,
    'el menú premium debe pasar de $9.000 a $10.000'
  );

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-menu-dia-'));
  const script = `
    process.env.DATA_DIR = ${JSON.stringify(tempDir)};
    process.env.DB_FILE = ${JSON.stringify(path.join(tempDir, 'test.sqlite'))};
    process.env.NODE_ENV = 'test';
    process.env.INITIAL_ADMIN_EMAIL = 'test@example.invalid';
    process.env.INITIAL_ADMIN_PASSWORD = 'test-only-password';
    const assert = require('assert');
    const db = require(${JSON.stringify(path.join(__dirname, '..', '..', 'db'))});
    const operacion = require(${JSON.stringify(path.join(__dirname, '..', '..', 'routes', 'operacion'))});
    const { hoyArgentina } = require(${JSON.stringify(path.join(__dirname, '..', '..', 'utils', 'fechaLocal'))});
    let categoria = db.prepare("SELECT id FROM categorias WHERE lower(nombre) = lower('Menu del Dia') LIMIT 1").get();
    if (!categoria) {
      const nueva = db.prepare("INSERT INTO categorias (nombre, activo) VALUES ('Menu del Dia', 1)").run();
      categoria = { id: Number(nueva.lastInsertRowid) };
    }
    const creado = db.prepare("INSERT INTO productos (nombre, precio, categoria_id, activo, menu_dia_base, stock_directo) VALUES ('Prueba doble precio', 500000, ?, 1, 1, 10)").run(categoria.id);
    const id = Number(creado.lastInsertRowid);
    const fecha = hoyArgentina();
    db.prepare('INSERT INTO menu_dia_historial (fecha, producto_id, disponible, precio, precio_economico, precio_ejecutivo, stock_directo) VALUES (?, ?, 1, 500000, 500000, 700000, 10)').run(fecha, id);

    operacion.persistMenuDiaItems([{ id, disponible_hoy: 1, precio_hoy: 500000, stock_hoy: 12 }], fecha);
    let fila = db.prepare('SELECT precio_economico, precio_ejecutivo FROM menu_dia_historial WHERE fecha = ? AND producto_id = ?').get(fecha, id);
    assert.deepStrictEqual(fila, { precio_economico: 500000, precio_ejecutivo: 700000 });

    operacion.persistMenuDiaItems([{ id, disponible_hoy: 1, precio_hoy: 500000, precio_economico_hoy: 0, precio_ejecutivo_hoy: 700000, stock_hoy: 12 }], fecha);
    fila = db.prepare('SELECT precio_economico, precio_ejecutivo FROM menu_dia_historial WHERE fecha = ? AND producto_id = ?').get(fecha, id);
    assert.deepStrictEqual(fila, { precio_economico: null, precio_ejecutivo: 700000 });
    db.close();
  `;

  try {
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..', '..'),
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    console.log('menuDiaPreciosDobles.test.js OK');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (require.main === module) run();

module.exports = { run };
