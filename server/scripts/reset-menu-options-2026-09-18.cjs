// One-time, explicitly requested catalog reset. Dry-run unless --apply is supplied.
// Uses raw SQLite: never starts the app, migrations, providers or order processing.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');

const sides = ['Arroz blanco', 'Arroz a la provenzal', 'Arroz primavera', 'Fideos con manteca', 'Fideos a la provenzal', 'Ensalada mixta', 'Ensalada completa', 'Ensalada mediterránea', 'Ensalada rusa', 'Puré', 'Puré mixto', 'Papas fritas', 'Papas al horno', 'Papas a la española', 'Papas rústicas', 'Papas al natural', 'Verduras salteadas'];
const sauces = ['Salsa blanca', 'Salsa roja', 'Salsa filetto', 'Salsa rosa', 'Tuco con pollo', 'Tuco con carne'];
const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const apply = process.argv.includes('--apply');
assert(process.env.DB_FILE, 'DB_FILE required');
const db = new Database(process.env.DB_FILE, { readonly: !apply, fileMustExist: true });
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
const read = () => ({
  lists: db.prepare('SELECT * FROM opcion_listas ORDER BY id').all(),
  items: db.prepare('SELECT * FROM opcion_items ORDER BY id').all(),
  assignments: db.prepare('SELECT * FROM producto_opcion_listas ORDER BY producto_id, lista_id').all(),
  products: db.prepare('SELECT * FROM productos ORDER BY id').all(),
  config: db.prepare("SELECT * FROM configuracion WHERE clave = 'menu_dia_guarniciones_lista'").all(),
});
function plan(before) {
  assert.deepEqual(before.lists.map((l) => [l.id, l.nombre]), [[1, 'Guarniciones'], [2, 'Agregados hamburguesas'], [3, 'Salsas de canelones y lasaña'], [4, 'Salsas de pastas']], 'Catalog changed or reset already applied; stop and inspect');
  const edits = [];
  for (const product of before.products) {
    if (product.categoria_id !== 7 && product.menu_dia_base !== 1) continue;
    const groups = JSON.parse(product.variantes || '[]');
    const kept = groups.filter((g) => !['guarnicion', 'guarniciones', 'salsa', 'salsas'].includes(normalize(g.nombre)));
    if (groups.length !== kept.length) edits.push({ id: product.id, nombre: product.nombre, variantes: JSON.stringify(kept) });
  }
  return edits;
}
try {
  if (!apply) {
    const before = read();
    console.log(JSON.stringify({ dryRun: true, removeLists: [1, 3, 4], preserveList: 2, clearOwnGroups: plan(before), newLists: { Guarniciones: sides, Salsas: sauces }, newAssignments: 0 }, null, 2));
  } else {
    const result = db.transaction(() => {
      const before = read();
      const edits = plan(before);
      const originalFk = db.pragma('foreign_key_check');
      const folder = path.join(path.dirname(process.env.DB_FILE), 'catalog-option-backups');
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
      const backup = path.join(folder, `before-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      const fd = fs.openSync(backup, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify({ purpose: 'Targeted catalog rollback, not a full database backup', ...before }, null, 2));
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
      assert.deepEqual(JSON.parse(fs.readFileSync(backup, 'utf8')).products, before.products);

      db.prepare('DELETE FROM producto_opcion_listas WHERE lista_id IN (1,3,4)').run();
      db.prepare('DELETE FROM opcion_items WHERE lista_id IN (1,3,4)').run();
      db.prepare('DELETE FROM opcion_listas WHERE id IN (1,3,4)').run();
      for (const edit of edits) db.prepare('UPDATE productos SET variantes = ? WHERE id = ?').run(edit.variantes, edit.id);
      const created = [];
      for (const [name, names] of [['Guarniciones', sides], ['Salsas', sauces]]) {
        const id = Number(db.prepare("INSERT INTO opcion_listas (nombre,tipo,obligatorio,orden,activo) VALUES (?,'variante',1,?,1)").run(name, created.length).lastInsertRowid);
        names.forEach((name, order) => db.prepare('INSERT INTO opcion_items (lista_id,nombre,precio,orden,activo) VALUES (?,?,0,?,1)').run(id, name, order));
        created.push({ id, nombre: name, opciones: names.length });
      }
      // Keep the old fallback consistent so a missing-list recovery cannot revive mixed options.
      db.prepare("UPDATE configuracion SET valor = ? WHERE clave = 'menu_dia_guarniciones_lista'").run(JSON.stringify(sides));
      const after = read();
      for (const key of ['lists', 'items', 'assignments']) {
        const kept = (rows) => rows.filter((r) => (key === 'lists' ? r.id : r.lista_id) === 2);
        assert.deepEqual(kept(after[key]), kept(before[key]), `Agregados ${key} changed`);
      }
      assert.equal(after.assignments.filter((r) => r.lista_id !== 2).length, 0);
      const expected = before.products.map((p) => {
        const edit = edits.find((e) => e.id === p.id);
        return edit ? { ...p, variantes: edit.variantes } : p;
      });
      assert.deepEqual(after.products, expected, 'Unexpected product changes');
      assert.deepEqual(db.pragma('foreign_key_check'), originalFk);
      assert.deepEqual(db.pragma('quick_check').map((r) => r.quick_check), ['ok']);
      for (const [index, names] of [sides, sauces].entries()) {
        assert.deepEqual(after.items.filter((i) => i.lista_id === created[index].id).map((i) => [i.nombre, i.precio]), names.map((n) => [n, 0]));
      }
      return { backup, removedLists: 3, removedAssignments: before.assignments.length - after.assignments.length, clearedProducts: edits.map(({ id, nombre }) => ({ id, nombre })), created, preservedAdditions: after.assignments.length, integrity: 'ok', assignmentsPendingConfirmation: true };
    }).immediate();
    console.log(JSON.stringify(result, null, 2));
  }
} finally { db.close(); }
