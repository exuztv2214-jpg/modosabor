const assert = require('assert');
const { createProductoSchema, updateProductoSchema } = require('../../schemas');

/*
 * El editor de Productos manda el stock dentro de FormData. validateBody()
 * reemplaza req.body por el resultado de Zod, así que este test protege que
 * el campo no vuelva a ser descartado silenciosamente.
 */
function run() {
  const created = createProductoSchema.parse({
    nombre: 'Producto con stock inicial',
    precio: '5000',
    categoria_id: '1',
    stock: '18.5',
  });
  assert.strictEqual(created.stock, 18.5, 'el alta conserva el stock enviado');

  const updated = updateProductoSchema.parse({ stock: '7' });
  assert.strictEqual(updated.stock, 7, 'la edición conserva el stock enviado');

  assert.throws(
    () => updateProductoSchema.parse({ stock: '-1' }),
    /nonnegative|greater than or equal/i,
    'no debe permitir stock negativo'
  );

  console.log('  OK el schema de productos conserva y valida el stock directo');
}

run();
