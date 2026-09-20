const assert = require('assert');
const { pathToFileURL } = require('url');
const path = require('path');
const Database = require('better-sqlite3');
const { categoriasVisibles, filtrarCatalogo } = require('../../utils/catalogVisibility');
const { getCurrentShiftInfo } = require('../../utils/shifts');

async function run() {
  const client = await import(
    pathToFileURL(path.resolve(__dirname, '../../../client/src/lib/catalogVisibility.js')).href
  );
  const db = new Database(':memory:');
  try {
    db.exec(
      'CREATE TABLE categorias(id INTEGER,activo INTEGER,turno_id TEXT); CREATE TABLE configuracion(clave TEXT,valor TEXT)'
    );
    db.exec("INSERT INTO categorias VALUES (1,1,''),(2,0,''),(3,1,'dia'),(4,1,'noche')");
    const config = {
      turnos_negocio: JSON.stringify([
        { id: 'dia', desde: '11:00', hasta: '15:00' },
        { id: 'noche', desde: '20:00', hasta: '01:00' },
      ]),
    };
    db.prepare('INSERT INTO configuracion VALUES (?,?)').run(
      'turnos_negocio',
      config.turnos_negocio
    );
    const cats = db.prepare('SELECT * FROM categorias').all();
    const productos = cats.map((c) => ({ id: c.id, categoria_id: c.id, activo: 1 }));
    for (const [time, expected] of [
      ['2026-09-17T15:00:00Z', [1, 3]],
      ['2026-09-18T03:00:00Z', [1, 4]],
      ['2026-09-18T10:00:00Z', [1, 3, 4]],
    ]) {
      const date = new Date(time);
      assert.deepEqual([...categoriasVisibles(db, date)], expected);
      const front = client.filtrarCatalogo(productos, cats, getCurrentShiftInfo(config, date));
      assert.deepEqual(
        front.map((p) => p.id),
        expected
      );
    }
    assert.equal(filtrarCatalogo(db, [{ id: 10, activo: 0, categoria_id: 1 }]).length, 0);
    assert.notEqual(
      client.claveSubcategoria({ categoria_id: 1, subcategoria: 'Especiales' }),
      client.claveSubcategoria({ categoria_id: 2, subcategoria: 'Especiales' })
    );
    console.log(
      '✓ Visibilidad web/TPV/API: ocultas, turnos diurno/nocturno, carta cerrada y subcategorías'
    );
  } finally {
    db.close();
  }
}
module.exports = { run };
