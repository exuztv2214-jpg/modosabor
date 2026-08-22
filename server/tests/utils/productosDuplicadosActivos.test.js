const assert = require('assert');
const Database = require('better-sqlite3');

const {
  normalizarNombreProducto,
  buscarProductoActivoDuplicado,
  asegurarNombreProductoUnico,
} = require('../../utils/productosDuplicados');

console.log('\nProductos activos duplicados');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE productos (
    id INTEGER PRIMARY KEY,
    nombre TEXT NOT NULL,
    categoria_id INTEGER NOT NULL,
    activo INTEGER DEFAULT 1
  );
  INSERT INTO productos (id, nombre, categoria_id, activo) VALUES
    (1, 'Clásica', 3, 1),
    (2, '(duplicado) Clásica', 3, 0),
    (3, 'Clásica', 4, 1);
`);

assert.strictEqual(normalizarNombreProducto('  CLASICA  '), normalizarNombreProducto('Clásica'));
assert.strictEqual(buscarProductoActivoDuplicado(db, { nombre: 'clasica', categoriaId: 3 }).id, 1);
assert.strictEqual(
  buscarProductoActivoDuplicado(db, { nombre: 'Clásica', categoriaId: 3, excluirId: 1 }),
  null,
  'editar el mismo producto no debe bloquearse a sí mismo'
);
assert.doesNotThrow(() =>
  asegurarNombreProductoUnico(db, { nombre: 'Clásica', categoriaId: 4, excluirId: 3 })
);
assert.throws(
  () => asegurarNombreProductoUnico(db, { nombre: 'CLASICA', categoriaId: 3 }),
  /Ya existe un producto activo/
);

db.close();
console.log('  OK compara sin tildes, respeta categoría, estado y edición propia');
