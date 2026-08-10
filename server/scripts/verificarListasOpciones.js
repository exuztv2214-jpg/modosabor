/**
 * Verificación de las listas de opciones compartidas contra una base real.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Los tests de `opcionesCompartidas.test.js` prueban la función que mezcla y
 * revisan que el cableado esté en su lugar, pero **ninguna consulta SQL se
 * ejecuta nunca**. Un `JOIN` mal escrito, una columna con otro nombre o un
 * `IN (?)` mal armado pasarían las once comprobaciones y recién explotarían en
 * el servidor, con la carta arriba.
 *
 * Este script crea las tres tablas de verdad, carga datos, y corre las mismas
 * consultas que usa `listasPorProducto`. Si el SQL está mal, falla acá.
 *
 * ── Cómo se corre ──────────────────────────────────────────────────────────
 *
 *     node server/scripts/verificarListasOpciones.js
 *
 * Trabaja en memoria: **no toca la base del local**. Se puede correr cuantas
 * veces se quiera, con el sistema andando o apagado.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const { mezclarListas } = require('../utils/opcionesCompartidas');

/**
 * `listasPorProducto` recibe el `db` de better-sqlite3. En memoria usamos el
 * SQLite que trae Node, que tiene otra forma, así que se adapta: `prepare`
 * devuelve un objeto con `all` y `get` como espera el código de producción.
 *
 * Lo importante es que **el SQL que se ejecuta es el mismo**, sin tocar: se
 * carga del módulo real, no se copia acá.
 */
function adaptar(baseNode) {
  return {
    /*
      better-sqlite3 tiene `db.transaction(fn)`, que devuelve una función que
      corre todo o nada. El SQLite de Node no la trae, así que se arma acá con
      BEGIN/COMMIT. Importa que exista de verdad y no que sea un pasamanos: el
      código de producción la usa para que una lista nunca quede a medio
      escribir, y un grupo sin opciones no se puede completar al vender.
    */
    transaction(fn) {
      return (...args) => {
        baseNode.exec('BEGIN');
        try {
          const salida = fn(...args);
          baseNode.exec('COMMIT');
          return salida;
        } catch (error) {
          baseNode.exec('ROLLBACK');
          throw error;
        }
      };
    },
    prepare(sql) {
      const stmt = baseNode.prepare(sql);
      return {
        all: (...params) => stmt.all(...params),
        get: (...params) => stmt.get(...params),
        run: (...params) => stmt.run(...params),
      };
    },
  };
}

function crearTablas(db) {
  // Se sacan del schema real en vez de escribirlas acá, para que este script
  // no pueda quedar probando una estructura que ya no existe.
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const bloques = schema.match(
    /CREATE TABLE IF NOT EXISTS (opcion_listas|opcion_items|producto_opcion_listas)[\s\S]*?\n\);/g
  );
  assert.ok(
    bloques && bloques.length === 3,
    `no se encontraron las tres tablas en schema.sql (se encontraron ${bloques?.length || 0})`
  );

  db.exec(
    'CREATE TABLE productos (id INTEGER PRIMARY KEY, nombre TEXT, variantes TEXT, extras TEXT)'
  );
  // Sin la referencia a productos, que acá es una tabla de mentira.
  for (const bloque of bloques) {
    db.exec(bloque.replace(/REFERENCES productos\(id\) ON DELETE CASCADE/g, ''));
  }
  return bloques.length;
}

function main() {
  console.log('\n🔬 Listas de opciones contra una base real\n');

  const base = new DatabaseSync(':memory:');
  const tablas = crearTablas(base);
  console.log(`  ✓ las ${tablas} tablas se crean sin errores de SQL`);

  const db = adaptar(base);
  // El require va acá abajo a propósito: `listasPorProducto` no toca `../db`
  // al cargarse, pero si algún día lo hiciera, esto lo dejaría claro.
  const { listasPorProducto } = require('../utils/opcionesCompartidas');

  // ── Datos parecidos a la carta real ────────────────────────────────────────
  base.exec(`
    INSERT INTO productos (id, nombre, variantes, extras) VALUES
      (1, 'Milanesa Napolitana', '[]', '[]'),
      (2, 'Suprema a la suiza',  '[]', '[]'),
      (3, 'Smash Simple',        '[]', '[]'),
      (4, 'Coca Cola',           '[]', '[]');

    INSERT INTO opcion_listas (id, nombre, tipo, obligatorio, orden, activo) VALUES
      (1, 'Guarniciones', 'variante', 1, 0, 1),
      (2, 'Agregados',    'extra',    0, 1, 1),
      (3, 'Vieja',        'variante', 0, 2, 0);

    INSERT INTO opcion_items (lista_id, nombre, precio, orden, activo) VALUES
      (1, 'Papas fritas', 0,      0, 1),
      (1, 'Puré',         0,      1, 1),
      (1, 'Ensalada',     50000,  2, 1),
      (1, 'Descatalogada',0,      3, 0),
      (2, 'Queso extra',  100000, 0, 1),
      (2, 'Huevo',        100000, 1, 1),
      (3, 'No va',        0,      0, 1);

    INSERT INTO producto_opcion_listas (producto_id, lista_id, orden) VALUES
      (1, 1, 0), (1, 2, 1),
      (2, 1, 0),
      (3, 2, 0),
      (3, 3, 1);
  `);

  // ── 1. La consulta corre y trae lo que corresponde ────────────────────────
  const resultado = listasPorProducto(db, [1, 2, 3, 4]);
  assert.strictEqual(resultado.get(1).length, 2, 'la milanesa tiene que tener dos listas');
  assert.strictEqual(resultado.get(2).length, 1);
  assert.strictEqual(resultado.has(4), false, 'la Coca no tiene ninguna lista asignada');
  console.log('  ✓ el SQL corre y devuelve las listas de cada plato');

  // ── 2. Una lista desactivada no se sirve ──────────────────────────────────
  //
  // Es lo que pasa al "borrar" una lista que está en uso: se desactiva. Si se
  // siguiera sirviendo, desactivarla no serviría de nada.
  assert.deepStrictEqual(
    resultado.get(3).map((l) => l.nombre),
    ['Agregados'],
    'una lista desactivada se está sirviendo igual'
  );
  console.log('  ✓ una lista desactivada deja de aparecer en los platos');

  // ── 3. Una opción desactivada tampoco ─────────────────────────────────────
  const guarniciones = resultado.get(1).find((l) => l.nombre === 'Guarniciones');
  assert.deepStrictEqual(
    guarniciones.opciones.map((o) => o.nombre),
    ['Papas fritas', 'Puré', 'Ensalada'],
    'se está sirviendo una opción dada de baja, o se perdió el orden'
  );
  console.log('  ✓ las opciones respetan el orden y las dadas de baja no salen');

  // ── 4. Los precios llegan en centavos ─────────────────────────────────────
  //
  // Es el error que ya nos comió el módulo de Personal entero: un número
  // guardado en pesos en una columna que el resto del sistema lee en centavos.
  assert.strictEqual(
    guarniciones.opciones.find((o) => o.nombre === 'Ensalada').precio,
    50000,
    'el precio dejó de viajar en centavos'
  );
  console.log('  ✓ los precios salen en centavos, como productos.precio');

  // ── 5. El viaje completo, como lo ve el TPV ───────────────────────────────
  const mezclado = mezclarListas('[]', '[]', resultado.get(1));
  const variantes = JSON.parse(mezclado.variantes);
  const extras = JSON.parse(mezclado.extras);
  assert.strictEqual(variantes.length, 1);
  assert.strictEqual(variantes[0].nombre, 'Guarniciones');
  assert.strictEqual(variantes[0].obligatorio, 1, 'se perdió que la guarnición es obligatoria');
  assert.strictEqual(variantes[0].opciones.length, 3);
  assert.strictEqual(extras.length, 2);
  assert.ok(
    variantes[0].lista_id === 1 && extras.every((e) => e.lista_id === 2),
    'se perdió la marca que evita que el formulario copie la lista adentro del plato'
  );
  console.log('  ✓ el plato sale armado como lo espera el TPV');

  // ── 6. Que no se consulte una vez por plato ───────────────────────────────
  //
  // La carta del TPV son setenta y pico de platos. Una consulta por plato son
  // setenta viajes a la base cada vez que alguien abre la pantalla.
  let consultas = 0;
  const contador = {
    prepare(sql) {
      consultas += 1;
      return adaptar(base).prepare(sql);
    },
  };
  consultas = 0;
  listasPorProducto(contador, [1, 2, 3, 4]);
  assert.ok(
    consultas <= 2,
    `se hicieron ${consultas} consultas para cuatro platos: tienen que ser dos, sin importar cuántos platos haya`
  );
  console.log(`  ✓ resuelve cualquier cantidad de platos en ${consultas} consultas`);

  // ── 7. Sin platos, no consulta nada ───────────────────────────────────────
  consultas = 0;
  const vacio = listasPorProducto(contador, []);
  assert.strictEqual(vacio.size, 0);
  assert.strictEqual(consultas, 0, 'una lista vacía de platos no tiene que ir a la base');
  console.log('  ✓ sin platos no toca la base');

  // ── 8. Borrar una lista se lleva sus opciones y sus asignaciones ──────────
  //
  // El borrado definitivo depende de ON DELETE CASCADE. Si las claves foráneas
  // estuvieran apagadas, quedarían opciones huérfanas apuntando a una lista que
  // ya no existe.
  base.exec('PRAGMA foreign_keys = ON');
  base.prepare('DELETE FROM opcion_listas WHERE id = ?').run(2);
  assert.strictEqual(
    base.prepare('SELECT COUNT(*) AS n FROM opcion_items WHERE lista_id = 2').get().n,
    0,
    'quedaron opciones huérfanas: falta el ON DELETE CASCADE'
  );
  assert.strictEqual(
    base.prepare('SELECT COUNT(*) AS n FROM producto_opcion_listas WHERE lista_id = 2').get().n,
    0,
    'quedaron asignaciones apuntando a una lista borrada'
  );
  console.log('  ✓ borrar una lista se lleva sus opciones y sus asignaciones');

  // ── 9. La misma lista no se puede asignar dos veces al mismo plato ────────
  const repetir = () =>
    base
      .prepare('INSERT INTO producto_opcion_listas (producto_id, lista_id, orden) VALUES (?, ?, ?)')
      .run(1, 1, 5);
  assert.throws(
    repetir,
    /UNIQUE|PRIMARY/i,
    'se puede asignar la misma lista dos veces al mismo plato'
  );
  console.log('  ✓ la misma lista no se duplica en un plato');

  // ── 10. Todo el SQL de la API compila ─────────────────────────────────────
  //
  // La ruta tiene otras nueve consultas —leer una lista con sus opciones, ver
  // qué platos la usan, asignarla a una categoría entera— y ninguna se ejecuta
  // en los tests: son cadenas de texto hasta que el servidor las corre.
  //
  // Una columna mal escrita ahí no se nota al arrancar. Se nota cuando alguien
  // abre la pantalla, con la carta arriba. Acá se preparan todas contra la
  // estructura real, que es lo que revienta si algo no existe.
  const ruta = fs.readFileSync(path.join(__dirname, '..', 'routes', 'opcionListas.js'), 'utf8');
  const consultasDeLaRuta = [...ruta.matchAll(/prepare\(\s*(`[\s\S]*?`|'[^']*')\s*\)/g)]
    .map((coincidencia) => coincidencia[1].slice(1, -1).trim())
    .filter((sql) => /^(SELECT|INSERT|UPDATE|DELETE)/i.test(sql));

  assert.ok(
    consultasDeLaRuta.length >= 9,
    `se esperaban al menos nueve consultas en la ruta y se encontraron ${consultasDeLaRuta.length}: cambió la forma de escribirlas y este chequeo dejó de mirarlas`
  );

  // La categoría la necesita la consulta que lista qué platos usan una lista.
  base.exec('CREATE TABLE IF NOT EXISTS categorias (id INTEGER PRIMARY KEY, nombre TEXT)');
  base.exec('ALTER TABLE productos ADD COLUMN activo INTEGER DEFAULT 1');
  base.exec('ALTER TABLE productos ADD COLUMN categoria_id INTEGER');

  for (const sql of consultasDeLaRuta) {
    try {
      base.prepare(sql);
    } catch (error) {
      throw new Error(
        `una consulta de routes/opcionListas.js no compila:\n\n${sql}\n\n${error.message}`
      );
    }
  }
  console.log(
    `  ✓ las ${consultasDeLaRuta.length} consultas de la API compilan contra la estructura real`
  );

  verificarUnificacionDelMenuDia();

  console.log('✅ El SQL de las listas compartidas funciona contra una base real\n');
}

/**
 * La unificación con el menú del día.
 *
 * Había dos listas maestras de guarniciones: la del menú del día, guardada en
 * `configuracion` como un array de nombres, y la compartida. Ahora la fuente es
 * una sola. Esto verifica la migración y el ida y vuelta.
 */
function verificarUnificacionDelMenuDia() {
  const {
    guardarNombresDeLista,
    nombresDeLista,
    LISTA_GUARNICIONES,
  } = require('../utils/opcionesCompartidas');

  const base = new DatabaseSync(':memory:');
  crearTablas(base);
  base.exec(`
    CREATE TABLE configuracion (clave TEXT PRIMARY KEY, valor TEXT);
    INSERT INTO configuracion (clave, valor) VALUES
      ('menu_dia_guarniciones_lista',
       '["Arroz blanco","Puré","Papas","Papas al horno","Fideo a la provenzal"]');
  `);
  const db = adaptar(base);

  // ── La migración copia lo que ya había ────────────────────────────────────
  /*
    Se sacan los comentarios antes de buscar. Sin eso, comentar la llamada
    —`// migrarGuarnicionesAListaCompartida(db);`— dejaba esta comprobación en
    verde: el texto seguía estando en el archivo. Ya pasó dos veces en este
    proyecto que un chequeo se enganchara con un comentario en vez de con
    código.
  */
  const migraciones = fs
    .readFileSync(path.join(__dirname, '..', 'db', 'migrations.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    migraciones.includes('migrarGuarnicionesAListaCompartida(db);'),
    'la migración de las guarniciones no se está llamando: la lista compartida nunca se crea sola'
  );
  assert.ok(
    /function migrarGuarnicionesAListaCompartida/.test(migraciones),
    'se borró la migración de las guarniciones'
  );

  // Se reproduce lo que hace la migración, sobre esta base de prueba.
  const guardadas = JSON.parse(
    base
      .prepare("SELECT valor FROM configuracion WHERE clave = 'menu_dia_guarniciones_lista'")
      .get().valor
  );
  guardarNombresDeLista(db, LISTA_GUARNICIONES, guardadas, { tipo: 'variante', obligatorio: 1 });

  assert.deepStrictEqual(
    nombresDeLista(db, LISTA_GUARNICIONES),
    ['Arroz blanco', 'Puré', 'Papas', 'Papas al horno', 'Fideo a la provenzal'],
    'las guarniciones no llegaron completas a la lista compartida, o se perdió el orden'
  );
  console.log('  ✓ las guarniciones del menú del día pasan a la lista compartida, en orden');

  // ── Correr dos veces no duplica ───────────────────────────────────────────
  //
  // Las migraciones corren en cada arranque del servidor. Si esto duplicara,
  // a la semana habría cuarenta "Papas".
  guardarNombresDeLista(db, LISTA_GUARNICIONES, guardadas, { tipo: 'variante', obligatorio: 1 });
  assert.strictEqual(
    nombresDeLista(db, LISTA_GUARNICIONES).length,
    5,
    'guardar dos veces duplicó las guarniciones'
  );
  assert.strictEqual(
    base.prepare("SELECT COUNT(*) AS n FROM opcion_listas WHERE nombre = 'Guarniciones'").get().n,
    1,
    'se creó una segunda lista "Guarniciones"'
  );
  console.log('  ✓ guardar dos veces no duplica nada');

  // ── El recargo cargado a mano sobrevive ───────────────────────────────────
  //
  // El menú del día manda sólo nombres. Si al guardar se reescribiera todo
  // desde cero, la ensalada con recargo que alguien cargó desde la pantalla de
  // listas volvería a cero sin que nadie lo pida — y se vendería más barata.
  const lista = base.prepare("SELECT id FROM opcion_listas WHERE nombre = 'Guarniciones'").get();
  base
    .prepare('UPDATE opcion_items SET precio = 50000 WHERE lista_id = ? AND nombre = ?')
    .run(lista.id, 'Papas al horno');
  guardarNombresDeLista(db, LISTA_GUARNICIONES, [...guardadas, 'Ensalada'], {
    tipo: 'variante',
    obligatorio: 1,
  });
  assert.strictEqual(
    base
      .prepare('SELECT precio FROM opcion_items WHERE lista_id = ? AND nombre = ?')
      .get(lista.id, 'Papas al horno').precio,
    50000,
    'editar el menú del día borró el recargo de una guarnición'
  );
  console.log('  ✓ editar desde el menú del día no borra los recargos cargados aparte');

  // ── Nombres repetidos y basura ────────────────────────────────────────────
  guardarNombresDeLista(db, LISTA_GUARNICIONES, ['Papas', 'papas', '  PAPAS  ', '', null, 'Puré'], {
    tipo: 'variante',
  });
  assert.deepStrictEqual(
    nombresDeLista(db, LISTA_GUARNICIONES),
    ['Papas', 'Puré'],
    'se guardaron guarniciones repetidas o vacías'
  );
  console.log('  ✓ no entran guarniciones repetidas ni vacías');

  // ── Si la lista no existe, devuelve null y el menú usa la clave vieja ─────
  //
  // Es la red de seguridad: sin esto, un error en la migración dejaría el menú
  // del día sin ninguna guarnición, en pleno servicio.
  const otra = new DatabaseSync(':memory:');
  crearTablas(otra);
  assert.strictEqual(
    nombresDeLista(adaptar(otra), LISTA_GUARNICIONES),
    null,
    'sin la lista tiene que devolver null para que el menú del día use lo que ya tenía'
  );
  const operacion = fs.readFileSync(path.join(__dirname, '..', 'routes', 'operacion.js'), 'utf8');
  assert.ok(
    /nombresDeLista\(db, LISTA_GUARNICIONES\) \|\|/.test(operacion),
    'se perdió la red: si la lista compartida falta, el menú del día se queda sin guarniciones'
  );
  assert.ok(
    operacion.includes('guardarNombresDeLista(db, LISTA_GUARNICIONES'),
    'el menú del día volvió a guardar las guarniciones en configuracion: vuelven a ser dos listas'
  );
  console.log('  ✓ si la lista compartida falta, el menú del día sigue andando');

  // ── Los precios del seed están en centavos ────────────────────────────────
  //
  // `loadMenuDiaSettings` lee estas claves como centavos —su propio fallback
  // está en centavos— pero el seed las escribía en pesos. En la base del local
  // no se notaba, porque el seed sólo escribe lo que falta y ahí ya estaban
  // bien. Una instalación nueva arrancaba con el menú económico a $50 y el
  // postre a $10.
  const seed = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.js'), 'utf8');
  const esperados = {
    menu_dia_precio_economico: 500000,
    menu_dia_precio_ejecutivo: 700000,
    menu_dia_extra_postre_precio: 100000,
    menu_dia_extra_bebida_postre_precio: 100000,
  };
  for (const [clave, centavos] of Object.entries(esperados)) {
    const encontrado = seed.match(new RegExp(`'${clave}',\\s*'(\\d+)'`));
    assert.ok(encontrado, `el seed dejó de definir ${clave}`);
    assert.strictEqual(
      Number(encontrado[1]),
      centavos,
      `${clave} está en pesos en el seed: una instalación nueva arranca con el menú a $${Number(encontrado[1]) / 100}`
    );
  }
  console.log('  ✓ los precios del menú del día se siembran en centavos\n');
}

main();
