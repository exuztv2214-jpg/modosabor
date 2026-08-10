/**
 * Productos y Categorías: tres cosas que estaban mal.
 *
 * 1. Borrar un producto destruía su receta y su historial del menú del día.
 * 2. El catálogo público devolvía el costo y el stock de cada plato.
 * 3. El tiempo de preparación de cada plato no lo leía nadie.
 *
 * Un cuarto hallazgo —que borrar una categoría no avisaba cuántos platos
 * quedaban sueltos— resultó falso: la pantalla ya lo dice, contando sobre la
 * lista de productos que tiene cargada. Se revisó del lado del servidor y no
 * del cliente, y se estuvo por arreglar algo que funcionaba.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const leer = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

function run() {
  console.log('\n🍽️  Productos y Categorías\n');

  const productos = leer('routes/productos.js');
  const eta = leer('utils/deliveryEta.js');
  const pedidoService = leer('services/pedidoService.js');

  // ── 1. Borrar no puede llevarse la receta ─────────────────────────────────
  //
  // `inventario_recetas` y `menu_dia_historial` tienen ON DELETE CASCADE contra
  // productos, y las claves foráneas están activas. Un DELETE directo destruía
  // la carga de insumos de ese plato, que es trabajo que nadie quiere repetir.
  assert.ok(
    productos.includes('UPDATE productos SET activo = 0 WHERE id = ?'),
    'el borrado por defecto dejó de ser una baja: vuelve a destruir la receta'
  );
  const bloqueDelete = productos.slice(productos.indexOf("router.delete('/:id'"));
  assert.ok(
    bloqueDelete.includes('req.query.definitivo'),
    'el borrado definitivo dejó de ser explícito'
  );
  const posicionBaja = bloqueDelete.indexOf('UPDATE productos SET activo = 0');
  const posicionBorrado = bloqueDelete.indexOf('DELETE FROM productos');
  assert.ok(
    posicionBaja > 0 && posicionBaja < posicionBorrado,
    'la baja tiene que resolverse antes del borrado, o siempre se borra'
  );
  console.log('  ✓ borrar un producto lo da de baja; eliminarlo es explícito');

  // Y la pantalla tiene que poder decir qué se pierde antes de preguntar.
  assert.ok(
    productos.includes("'/:id/dependencias'") &&
      productos.includes('inventario_recetas') &&
      productos.includes('menu_dia_historial'),
    'se perdió la consulta de qué se lleva puesto el borrado'
  );
  console.log('  ✓ se puede consultar qué se pierde antes de confirmar');

  // ── 2. El catálogo público no muestra costos ni stock ─────────────────────
  //
  // Es el hallazgo comprobado contra producción: GET /api/productos respondía
  // sin credenciales con "costo" y "stock_directo" de cada plato.
  const listaPublica = productos.slice(
    productos.indexOf('const CAMPOS_PUBLICOS'),
    productos.indexOf('function paraElPublico')
  );
  for (const prohibido of ['costo', 'stock_directo', 'stock_mode', 'receta_']) {
    assert.ok(
      !listaPublica.includes(`'${prohibido}`),
      `"${prohibido}" volvió a la respuesta pública`
    );
  }
  // Y lo que la carta sí necesita tiene que seguir estando, o se rompe la web.
  for (const necesario of ['nombre', 'precio', 'imagen', 'variantes', 'extras']) {
    assert.ok(
      listaPublica.includes(`'${necesario}'`),
      `"${necesario}" desapareció de la respuesta pública: la web deja de funcionar`
    );
  }
  assert.ok(
    productos.includes("router.get('/', authOpcional") &&
      productos.includes("router.get('/:id', authOpcional"),
    'las rutas del catálogo dejaron de distinguir quién pregunta'
  );
  assert.ok(
    (productos.match(/segunQuienPregunta\(req,/g) || []).length >= 2,
    'alguna de las dos rutas del catálogo volvió a devolver la fila entera'
  );
  console.log('  ✓ el catálogo público no lleva costo ni stock, y el panel ve todo');

  // ── 3. El tiempo de preparación se usa ────────────────────────────────────
  //
  // Estaba cargado en cada producto y no lo leía nadie: la estimación usaba un
  // número fijo, igual para una milanesa que para un café.
  assert.ok(
    eta.includes('minutos_cocina'),
    'la estimación volvió a ignorar el tiempo de preparación de los platos'
  );
  assert.ok(
    eta.includes('Math.max(baseConfigurada, minutosCocina)'),
    'el tiempo de cocina tiene que ser un piso, no reemplazar a la configuración'
  );
  assert.ok(
    pedidoService.includes('MAX(tiempo_preparacion)'),
    'nadie calcula los minutos de cocina del pedido'
  );
  assert.ok(
    !pedidoService.includes('SUM(tiempo_preparacion)'),
    'se está sumando el tiempo de los platos: la cocina trabaja en paralelo, va el más lento'
  );
  console.log('  ✓ la estimación usa el plato más lento del pedido');

  // Y que no se lean los ítems dos veces por pedido: en un listado de cien,
  // eso es cien consultas de más.
  const cuerpoHydrate = pedidoService.slice(
    pedidoService.indexOf('function hydratePedido'),
    pedidoService.indexOf('function hydratePedido') + 3000
  );
  assert.strictEqual(
    (cuerpoHydrate.match(/loadPedidoItems\(db, pedido/g) || []).length,
    1,
    'los ítems se cargan más de una vez por pedido'
  );
  console.log('  ✓ los ítems se leen una sola vez por pedido\n');

  console.log('✅ Productos y Categorías: los tres arreglos en su lugar\n');
}

if (require.main === module) run();

module.exports = { run };
