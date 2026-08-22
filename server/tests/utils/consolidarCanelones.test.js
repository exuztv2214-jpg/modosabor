const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

function ejecutar(args, env, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${result.stdout}\n${result.stderr}`.trim());
  }
  return result.stdout;
}

function run() {
  console.log('\nConsolidación de Canelones entre Menú del Día y Pastas');
  const root = path.join(__dirname, '..', '..', '..');
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-canelones-'));
  const archivo = path.join(temporal, 'canelones.sqlite');
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATA_DIR: temporal,
    DB_FILE: archivo,
    INITIAL_ADMIN_EMAIL: 'canelones@example.invalid',
    INITIAL_ADMIN_PASSWORD: 'test-only-password',
  };

  try {
    ejecutar(['-e', "require('./server/db').close()"], env, root);
    const db = new Database(archivo);
    const menu = db
      .prepare("INSERT INTO categorias (nombre, activo) VALUES ('Menu del Dia', 1)")
      .run().lastInsertRowid;
    const pastas = db
      .prepare("INSERT INTO categorias (nombre, activo) VALUES ('Pastas', 1)")
      .run().lastInsertRowid;
    const variantes = JSON.stringify([
      {
        nombre: 'Guarnición',
        opciones: ['Salsa roja', 'Salsa blanca', 'Salsa mixta'].map((nombre) => ({
          nombre,
          precio_extra: 0,
        })),
      },
    ]);
    const canelon = db
      .prepare(
        `INSERT INTO productos
          (nombre, categoria_id, precio, activo, stock_directo, stock_mode,
           menu_dia_base, menu_dia_disponible_hoy, menu_dia_tipo, variantes)
         VALUES ('Canelón', ?, 500000, 1, 22, 'directo', 1, 1, 'economico', ?)`
      )
      .run(menu, variantes).lastInsertRowid;
    const duplicado = db
      .prepare(
        `INSERT INTO productos
          (nombre, categoria_id, precio, activo, stock_directo, stock_mode,
           menu_dia_base, menu_dia_disponible_hoy, menu_dia_tipo)
         VALUES ('Canelones', ?, 500000, 1, 30, 'directo', 0, 0, 'economico')`
      )
      .run(pastas).lastInsertRowid;
    db.prepare(
      `INSERT INTO menu_dia_historial (fecha, producto_id, disponible, precio)
       VALUES ('2026-08-21', ?, 1, 500000)`
    ).run(canelon);
    const lista = db
      .prepare(
        "INSERT INTO opcion_listas (nombre, tipo, obligatorio) VALUES ('Salsas para pastas', 'variante', 1)"
      )
      .run().lastInsertRowid;
    db.prepare('INSERT INTO producto_opcion_listas (producto_id, lista_id) VALUES (?, ?)').run(
      duplicado,
      lista
    );
    db.close();

    const script = path.join('server', 'scripts', 'consolidarCanelonesDuplicados.js');
    const preview = ejecutar([script], env, root);
    assert.match(preview, /Canelones en Pastas y Menú del Día/);

    ejecutar([script, '--aplicar'], env, root);
    const verificacion = new Database(archivo, { readonly: true });
    const canonico = verificacion.prepare('SELECT * FROM productos WHERE id = ?').get(canelon);
    const archivado = verificacion.prepare('SELECT * FROM productos WHERE id = ?').get(duplicado);
    assert.strictEqual(canonico.nombre, 'Canelones');
    assert.strictEqual(canonico.categoria_id, pastas);
    assert.strictEqual(canonico.menu_dia_base, 1);
    assert.strictEqual(canonico.menu_dia_disponible_hoy, 1);
    assert.strictEqual(canonico.stock_directo, 30);
    assert.deepStrictEqual(JSON.parse(canonico.variantes), []);
    assert.strictEqual(
      verificacion
        .prepare('SELECT COUNT(*) AS n FROM producto_opcion_listas WHERE producto_id = ?')
        .get(canelon).n,
      1
    );
    assert.strictEqual(archivado.activo, 0);
    assert.strictEqual(archivado.stock_directo, 0);
    verificacion.close();

    const segunda = ejecutar([script, '--aplicar'], env, root);
    assert.match(segunda, /No hay Canelones activos duplicados/);
    console.log('  OK conserva historial, carta, menú, salsas y stock sin duplicar');
  } finally {
    fs.rmSync(temporal, { recursive: true, force: true });
  }
}

module.exports = { run };
