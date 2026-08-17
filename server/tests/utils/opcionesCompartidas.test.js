/**
 * Listas de opciones compartidas entre platos.
 *
 * ── Qué se está arreglando ─────────────────────────────────────────────────
 *
 * Los cuatro agregados de hamburguesa estaban cargados idénticos en dieciséis
 * platos. Subirle $200 al queso extra eran dieciséis ediciones, y alcanzaba con
 * saltearse una para vender el mismo agregado a dos precios distintos.
 *
 * Ahora la lista se carga una vez y se le asigna a los platos. Para no tocar
 * los veintitantos archivos que leen un producto, las listas se **mezclan
 * adentro de `variantes` y `extras` al leer**: río abajo nadie se entera.
 *
 * ── Lo que este test cuida ─────────────────────────────────────────────────
 *
 * Sobre todo dos cosas que hacen perder plata en silencio:
 *
 *   1. Que un agregado no se sume dos veces cuando está en la lista compartida
 *      y también cargado a mano en el plato.
 *   2. Que las opciones compartidas lleguen al validador de precios del
 *      servidor. Si no llegan, una guarnición perfectamente válida se lee como
 *      "opción que este producto no tiene" y **el pedido entero se rechaza**.
 *      Eso no es cobrar de menos: es la web fuera de servicio.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { mezclarListas, textoNormalizado } = require('../../utils/opcionesCompartidas');

const leer = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

// Las listas como salen de `listasPorProducto`: precios en centavos.
const GUARNICIONES = {
  id: 1,
  nombre: 'Guarniciones',
  tipo: 'variante',
  obligatorio: 1,
  opciones: [
    { nombre: 'Papas fritas', precio: 0 },
    { nombre: 'Puré', precio: 0 },
    { nombre: 'Ensalada', precio: 50000 },
  ],
};

const AGREGADOS = {
  id: 2,
  nombre: 'Agregados',
  tipo: 'extra',
  obligatorio: 0,
  opciones: [
    { nombre: 'Queso extra', precio: 100000 },
    { nombre: 'Huevo', precio: 100000 },
  ],
};

function run() {
  console.log('\n🧾 Listas de opciones compartidas\n');

  // ── 1. Una lista de variante entra como grupo ─────────────────────────────
  const conGuarnicion = mezclarListas('[]', '[]', [GUARNICIONES]);
  const variantes = JSON.parse(conGuarnicion.variantes);
  assert.strictEqual(variantes.length, 1, 'la guarnición compartida no llegó al plato');
  assert.strictEqual(variantes[0].nombre, 'Guarniciones');
  assert.deepStrictEqual(
    variantes[0].opciones.map((o) => o.nombre),
    ['Papas fritas', 'Puré', 'Ensalada']
  );
  assert.strictEqual(
    variantes[0].opciones[2].precio_extra,
    50000,
    'el recargo tiene que viajar en centavos, como productos.precio'
  );
  console.log('  ✓ una lista de variante se agrega como grupo, con sus precios');

  // ── 2. Una lista de extra entra como agregado ─────────────────────────────
  const conAgregados = mezclarListas('[]', '[]', [AGREGADOS]);
  // `lista_id` marca que vinieron de una lista y no del plato. Está probado
  // aparte, más abajo; acá se lo incluye porque forma parte de la respuesta.
  assert.deepStrictEqual(JSON.parse(conAgregados.extras), [
    { nombre: 'Queso extra', precio: 100000, lista_id: 2 },
    { nombre: 'Huevo', precio: 100000, lista_id: 2 },
  ]);
  assert.deepStrictEqual(JSON.parse(conAgregados.variantes), [], 'un extra no es una variante');
  console.log('  ✓ una lista de extra se agrega como agregado');

  // ── 3. Lo cargado a mano en el plato manda ────────────────────────────────
  //
  // Este es el punto que evita cobrar de más. Mientras se van pasando los
  // dieciséis platos a la lista compartida, cada uno todavía tiene los suyos
  // cargados: si se sumaran los dos, el queso extra saldría $2.000.
  const propios = JSON.stringify([{ nombre: 'Queso extra', precio: 80000 }]);
  const mezclado = mezclarListas('[]', propios, [AGREGADOS]);
  const extras = JSON.parse(mezclado.extras);
  assert.strictEqual(extras.length, 2, 'el queso extra quedó duplicado');
  assert.strictEqual(
    extras.find((e) => e.nombre === 'Queso extra').precio,
    80000,
    'la lista compartida le pisó el precio propio al plato'
  );
  console.log('  ✓ un agregado que ya estaba en el plato no se duplica ni cambia de precio');

  // Lo mismo para los grupos: un plato con su propio "Guarniciones" no recibe
  // el compartido, o quedarían dos grupos con el mismo nombre y el cajero
  // tendría que elegir dos veces.
  const grupoPropio = JSON.stringify([
    { nombre: 'Guarniciones', opciones: [{ nombre: 'Sólo papas', precio_extra: 0 }] },
  ]);
  const conGrupoPropio = JSON.parse(mezclarListas(grupoPropio, '[]', [GUARNICIONES]).variantes);
  assert.strictEqual(conGrupoPropio.length, 1, 'quedaron dos grupos "Guarniciones"');
  assert.deepStrictEqual(
    conGrupoPropio[0].opciones.map((o) => o.nombre),
    ['Sólo papas']
  );
  console.log('  ✓ un grupo propio del plato no lo pisa la lista compartida');

  // Y la comparación ignora tildes y mayúsculas, porque nadie escribe igual dos
  // veces: "Guarnición" y "guarnicion" son el mismo grupo.
  assert.strictEqual(textoNormalizado('Guarnición'), textoNormalizado('  GUARNICION '));
  console.log('  ✓ los nombres se comparan sin tildes ni mayúsculas');

  // ── 4. Una lista vacía no deja un grupo imposible ─────────────────────────
  //
  // Un grupo obligatorio sin opciones es un grupo que nunca se puede completar,
  // y con eso el botón de cobrar queda apagado para siempre.
  const vacia = mezclarListas('[]', '[]', [{ ...GUARNICIONES, opciones: [] }]);
  assert.deepStrictEqual(JSON.parse(vacia.variantes), [], 'una lista sin opciones dejó un grupo');
  console.log('  ✓ una lista sin opciones no genera un grupo que no se puede completar');

  // ── 5. Sin listas asignadas, el producto sale igual que antes ─────────────
  //
  // Es la garantía de que esto no cambia nada para los platos que no lo usan,
  // que hoy son todos.
  const original = JSON.stringify([
    {
      nombre: 'Presentacion',
      opciones: [
        { nombre: 'Media Cremoso', precio_extra: 0 },
        { nombre: 'Entera Cremoso', precio_extra: 400000 },
      ],
    },
  ]);
  for (const sinListas of [[], null, undefined]) {
    const salida = mezclarListas(original, '[]', sinListas);
    assert.deepStrictEqual(
      JSON.parse(salida.variantes),
      JSON.parse(original),
      'un producto sin listas asignadas cambió'
    );
  }
  console.log('  ✓ un plato sin listas asignadas sale exactamente igual que antes');

  // ── 6. El validador de precios ve las listas ──────────────────────────────
  //
  // Lo más grave de todo. `preciosServidor` rechaza el pedido entero si una
  // opción no figura en el producto. Sin resolver las listas, pedir milanesa
  // con puré por la web devolvería "esa opción no corresponde a este producto".
  const precios = leer('services/preciosServidor.js');
  assert.ok(
    precios.includes('listasPorProducto') && precios.includes('mezclarListas'),
    'el validador de precios dejó de resolver las listas: los pedidos con guarnición se rechazan'
  );
  assert.ok(
    precios.includes('parsearJson(conListas.variantes') &&
      precios.includes('parsearJson(conListas.extras'),
    'el validador volvió a leer el JSON crudo del producto en vez del resuelto'
  );
  // Y que la resolución esté fuera del bucle: adentro serían dos consultas por
  // ítem, y un pedido de diez ítems son veinte viajes a la base por pedido.
  assert.ok(
    precios.indexOf('const listasDelPedido') < precios.indexOf('return lista.map((item)'),
    'las listas se están consultando una vez por ítem en lugar de una vez por pedido'
  );
  console.log('  ✓ el validador de precios resuelve las listas, y una sola vez por pedido');

  // ── 7. Las tres rutas del catálogo las aplican ────────────────────────────
  //
  // Además del listado y la ficha, el TPV tiene un catálogo seguro que se
  // puede cachear offline. Si no resolviera las listas, una guarnición válida
  // se vería en la carta pero se perdería al agregarla desde caja.
  const productos = leer('routes/productos.js');
  assert.strictEqual(
    (productos.match(/aplicarListasCompartidas\(db,/g) || []).length,
    3,
    'alguna de las rutas del catálogo dejó de resolver las listas compartidas'
  );
  assert.ok(
    /router\.get\('\/catalogo-tpv'[\s\S]*?aplicarListasCompartidas\(db,[\s\S]*?paraElPublico\(/.test(
      productos
    ),
    'el catálogo offline del TPV no resuelve las listas o dejó de filtrar los costos'
  );
  console.log('  ✓ listado, ficha y TPV resuelven las listas sin exponer costos');

  // ── 8. La API de listas no recibe multipart ───────────────────────────────
  //
  // El conversor de plata corre antes que multer, así que un precio que entra
  // por multipart llega en pesos a una columna de centavos. Es el error que ya
  // nos comió el módulo de Personal entero.
  //
  // Se busca el `require` y no la palabra "multipart", porque esa palabra está
  // escrita en los comentarios de la propia ruta explicando justamente por qué
  // no se usa. Un test que se engancha con su propio comentario pasa siempre.
  const ruta = leer('routes/opcionListas.js');
  assert.ok(
    !/require\(['"]multer['"]\)/.test(ruta),
    'la API de listas pasó a recibir multipart: el precio va a entrar en pesos a una columna de centavos'
  );
  console.log('  ✓ la API de listas habla JSON, así que el precio entra en centavos');

  // ── 9. Que editar un plato no le copie la lista adentro ───────────────────
  //
  // El error más silencioso de todo esto, y estuvo a punto de irse a producción.
  //
  // El formulario de Productos carga `variantes` y `extras` desde la API —que
  // ya vienen con las listas mezcladas— y los vuelve a guardar. Sin filtrar,
  // abrir un plato y apretar Guardar le escribe la lista compartida adentro de
  // su propio JSON. No se rompe nada visible: se ve igual y se cobra igual. A
  // la semana cada plato tiene otra vez su copia privada y volvimos al
  // problema original, sin que nadie se haya enterado.
  //
  // Se reconocen por `lista_id`, que se lo pone el servidor al mezclarlas.
  const marcadas = mezclarListas('[]', '[]', [GUARNICIONES, AGREGADOS]);
  assert.strictEqual(
    JSON.parse(marcadas.variantes)[0].lista_id,
    1,
    'el grupo compartido perdió la marca: el formulario se lo va a copiar al plato'
  );
  assert.ok(
    JSON.parse(marcadas.extras).every((extra) => extra.lista_id === 2),
    'los agregados compartidos perdieron la marca'
  );

  // Y que el formulario los saque de verdad, no sólo que la marca exista.
  const utilsProductos = fs.readFileSync(
    path.join(__dirname, '../../../client/src/pages/Productos/utils.js'),
    'utf8'
  );
  assert.ok(
    /export function sinListasCompartidas/.test(utilsProductos) &&
      /!item\?\.lista_id/.test(utilsProductos),
    'se perdió el filtro que saca las listas compartidas del editor de productos'
  );
  const hook = fs.readFileSync(
    path.join(__dirname, '../../../client/src/pages/Productos/useProductos.js'),
    'utf8'
  );
  assert.strictEqual(
    (hook.match(/sinListasCompartidas\(parseJsonList\(producto\./g) || []).length,
    4,
    'editar o duplicar un plato volvió a cargar las listas compartidas en el editor'
  );
  console.log('  ✓ editar un plato no le copia la lista compartida adentro\n');

  console.log('✅ Listas compartidas: en su lugar\n');
}

if (require.main === module) run();

module.exports = { run };
