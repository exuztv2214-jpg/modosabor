/**
 * Carga las pastas a la carta, con sus salsas como listas compartidas.
 *
 * ── Por qué hacen falta ────────────────────────────────────────────────────
 *
 * Mirando el backup de 41.969 mensajes reales, los clientes las pidieron así:
 *
 *     canelones   41 días distintos     estuvo en el menú del día  4 días
 *     fideos      55 días distintos     nunca
 *     ñoquis      12 días distintos     nunca
 *
 * El menú del día tiene cuatro días cargados en toda su historia. Si el bot
 * sólo ofrece lo que está ahí, dice "no hay" casi siempre. Son unos 250
 * pedidos que hoy no puede tomar.
 *
 * Y no son platos del día: los fideos y los ñoquis tienen precio estable, no
 * dependen de lo que se cocinó esa mañana.
 *
 * ── Las dos listas de salsas ───────────────────────────────────────────────
 *
 * No es una sola lista. Son dos, y van a platos distintos:
 *
 *     Canelones y lasaña        →  blanca · roja · mixta
 *     Ñoquis, fideos, ravioles  →  fileto con pollo · fileto con carne
 *
 * Meter las cinco en una sola lista dejaría ofrecer fileto con pollo en un
 * canelón, que no se vende así.
 *
 * ── Los precios quedan en cero, y los platos desactivados ──────────────────
 *
 * A propósito. Los precios no los sé y **no los invento**: un plato cargado
 * con un número inventado que se vende es peor que un plato que falta.
 *
 * Se crean con `activo = 0` para que no se puedan vender mientras valgan cero.
 * Hernán les pone el precio desde Productos y ahí los activa. Si se crearan
 * activos a $0, el bot los regalaría.
 *
 * ── Cómo se corre ──────────────────────────────────────────────────────────
 *
 *     node server/scripts/cargarPastas.js            ← muestra qué haría
 *     node server/scripts/cargarPastas.js --aplicar  ← lo hace
 *
 * Es idempotente: si un plato o una lista ya existe, no la duplica.
 */

const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));
const { createDatabaseBackup } = require(path.join(__dirname, '..', 'utils', 'backupManager'));
const { textoNormalizado } = require(path.join(__dirname, '..', 'utils', 'opcionesCompartidas'));

const APLICAR = process.argv.includes('--aplicar');

const CATEGORIA = 'Pastas';

const LISTAS = [
  {
    nombre: 'Salsas de canelones y lasaña',
    opciones: ['Salsa blanca', 'Salsa roja', 'Salsa mixta'],
  },
  {
    nombre: 'Salsas de pastas',
    opciones: ['Fileto con pollo', 'Fileto con carne'],
  },
];

const PLATOS = [
  { nombre: 'Canelones', lista: 'Salsas de canelones y lasaña' },
  { nombre: 'Lasaña', lista: 'Salsas de canelones y lasaña' },
  { nombre: 'Ñoquis', lista: 'Salsas de pastas' },
  { nombre: 'Fideos caseros', lista: 'Salsas de pastas' },
  { nombre: 'Ravioles', lista: 'Salsas de pastas' },
];

function buscarPorNombre(tabla, nombre, extraSql = '', extraParams = []) {
  const filas = db.prepare(`SELECT * FROM ${tabla} ${extraSql}`).all(...extraParams);
  const buscado = textoNormalizado(nombre);
  return filas.find((fila) => textoNormalizado(fila.nombre) === buscado) || null;
}

function main() {
  console.log('\n🍝 Pastas a la carta\n');

  const categoriaExistente = buscarPorNombre('categorias', CATEGORIA);
  const plan = [];

  if (!categoriaExistente) plan.push(`crear la categoría "${CATEGORIA}"`);

  for (const lista of LISTAS) {
    const existe = buscarPorNombre('opcion_listas', lista.nombre);
    plan.push(
      existe
        ? `la lista "${lista.nombre}" ya existe — no se toca`
        : `crear la lista "${lista.nombre}" con ${lista.opciones.length} salsas`
    );
  }

  for (const plato of PLATOS) {
    const existe = buscarPorNombre('productos', plato.nombre);
    if (!existe) {
      plan.push(`crear "${plato.nombre}" en $0, desactivado, con "${plato.lista}"`);
      continue;
    }
    /*
      El plato ya existe —"Canelones" está en el menú del día— y no se le
      toca ni el precio, ni la categoría, ni si está activo: eso es trabajo
      que alguien ya hizo.

      Pero sí se le asigna la lista de salsas. Es aditivo y arregla algo que
      hoy está mal escrito: sus salsas viven adentro de un grupo llamado
      "Guarnición", así que en la comanda sale «Guarnición: Salsa roja».
    */
    const categoriaDelPlato = db
      .prepare('SELECT nombre FROM categorias WHERE id = ?')
      .get(existe.categoria_id)?.nombre;
    plan.push(
      `"${plato.nombre}" ya existe (id ${existe.id}, en ${categoriaDelPlato || 'sin categoría'}) — ` +
        `sólo se le asigna "${plato.lista}", no se toca nada más`
    );
  }

  console.log('  Lo que se va a hacer:\n');
  plan.forEach((linea) => console.log(`   · ${linea}`));

  if (!APLICAR) {
    console.log('\n  Esto fue sólo una mirada: no se cambió nada.');
    console.log('  Para hacerlo de verdad:\n');
    console.log('      node server/scripts/cargarPastas.js --aplicar\n');
    return;
  }

  try {
    const backup = createDatabaseBackup(db, { reason: 'antes-de-cargar-pastas' });
    console.log(`\n  📦 Backup hecho: ${backup.file}`);
  } catch (error) {
    console.error(`\n  ❌ No se pudo hacer el backup: ${error.message}`);
    console.error('  No se creó nada.\n');
    process.exitCode = 1;
    return;
  }

  const cargar = db.transaction(() => {
    // ── La categoría ────────────────────────────────────────────────────────
    let categoria = categoriaExistente;
    if (!categoria) {
      const orden = Number(db.prepare('SELECT MAX(orden) AS m FROM categorias').get().m || 0) + 1;
      const { lastInsertRowid } = db
        .prepare(
          "INSERT INTO categorias (nombre, icono, color, orden, activo) VALUES (?, '🍝', '#C98A3E', ?, 1)"
        )
        .run(CATEGORIA, orden);
      categoria = { id: Number(lastInsertRowid), nombre: CATEGORIA };
    }

    // ── Las dos listas de salsas ────────────────────────────────────────────
    const listasPorNombre = new Map();
    for (const lista of LISTAS) {
      let existente = buscarPorNombre('opcion_listas', lista.nombre);
      if (!existente) {
        const { lastInsertRowid } = db
          .prepare(
            // Obligatoria: una pasta sin salsa no se puede cocinar. Si el grupo
            // fuera opcional, saldría una comanda incompleta.
            "INSERT INTO opcion_listas (nombre, tipo, obligatorio, orden, activo) VALUES (?, 'variante', 1, 0, 1)"
          )
          .run(lista.nombre);
        existente = { id: Number(lastInsertRowid), nombre: lista.nombre };

        const insertarOpcion = db.prepare(
          // Precio 0: las salsas van incluidas. Si alguna pasa a cobrarse, se
          // le pone el recargo desde la pantalla de listas y cambia en todos
          // los platos a la vez.
          'INSERT INTO opcion_items (lista_id, nombre, precio, orden, activo) VALUES (?, ?, 0, ?, 1)'
        );
        lista.opciones.forEach((opcion, indice) =>
          insertarOpcion.run(existente.id, opcion, indice)
        );
      }
      listasPorNombre.set(lista.nombre, existente.id);
    }

    // ── Los platos ──────────────────────────────────────────────────────────
    const insertarProducto = db.prepare(
      `INSERT INTO productos
         (nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras,
          activo, destacado, tiempo_preparacion, stock_mode, disponible_para_venta)
       VALUES (?, '', 0, 0, ?, '', '[]', '[]', 0, 0, 20, 'direct', 1)`
    );
    const asignarLista = db.prepare(
      'INSERT OR IGNORE INTO producto_opcion_listas (producto_id, lista_id, orden) VALUES (?, ?, 0)'
    );

    const limpiarVariantes = db.prepare('UPDATE productos SET variantes = ? WHERE id = ?');

    /*
      Un plato que ya existía puede traer las mismas salsas escritas a mano
      adentro suyo. El Canelones del menú del día las tiene en un grupo que se
      llama "Guarnición".

      Las opciones propias del plato siempre le ganan a las compartidas, pero
      el desempate es por NOMBRE de grupo: "Guarnición" y "Salsas de canelones
      y lasaña" son nombres distintos, así que al asignar la lista quedarían
      los dos grupos, con las tres mismas salsas repetidas, y el mozo tendría
      que elegir salsa dos veces.

      Así que se saca el grupo propio, pero sólo si sus opciones son
      exactamente las de la lista compartida. Si el plato tuviera una salsa
      más, o una distinta, se lo deja intacto: sería una decisión de alguien
      que yo no puedo descartar. En ese caso el duplicado se ve en pantalla y
      se arregla a mano, que es mejor que borrar algo en silencio.
    */
    function quitarGrupoDuplicado(producto, opcionesDeLista) {
      let variantes;
      try {
        variantes = JSON.parse(producto.variantes || '[]');
      } catch {
        return null; // JSON roto: no lo toco.
      }
      if (!Array.isArray(variantes)) return null;

      const buscadas = new Set(opcionesDeLista.map(textoNormalizado));
      const quedan = variantes.filter((grupo) => {
        const propias = new Set(
          (grupo?.opciones || []).map((opcion) => textoNormalizado(opcion?.nombre))
        );
        const mismasSalsas =
          propias.size === buscadas.size && [...buscadas].every((s) => propias.has(s));
        return !mismasSalsas;
      });

      if (quedan.length === variantes.length) return null; // no había duplicado
      limpiarVariantes.run(JSON.stringify(quedan), producto.id);
      return variantes.length - quedan.length;
    }

    let creados = 0;
    let asignados = 0;
    const duplicadosQuitados = [];
    for (const plato of PLATOS) {
      const existe = buscarPorNombre('productos', plato.nombre);
      if (existe) {
        // Ya existe: se le suma la lista de salsas y se le saca el grupo
        // propio si era exactamente el mismo. Precio, categoría y activo no
        // se tocan — eso lo decidió alguien antes.
        asignarLista.run(existe.id, listasPorNombre.get(plato.lista));
        const definicion = LISTAS.find((l) => l.nombre === plato.lista);
        if (quitarGrupoDuplicado(existe, definicion.opciones)) {
          duplicadosQuitados.push(plato.nombre);
        }
        asignados += 1;
        continue;
      }
      const { lastInsertRowid } = insertarProducto.run(plato.nombre, categoria.id);
      asignarLista.run(Number(lastInsertRowid), listasPorNombre.get(plato.lista));
      creados += 1;
    }
    return { creados, asignados, duplicadosQuitados };
  });

  const { creados, asignados, duplicadosQuitados } = cargar();

  console.log(`\n  ✅ Listo.`);
  console.log(`     ${creados} plato${creados === 1 ? '' : 's'} nuevo${creados === 1 ? '' : 's'}.`);
  if (asignados) {
    console.log(
      `     ${asignados} que ya existía${asignados === 1 ? '' : 'n'}: se le${asignados === 1 ? '' : 's'} asignó la lista de salsas.`
    );
  }
  if (duplicadosQuitados.length) {
    console.log(`     Se sacó el grupo de salsas repetido de: ${duplicadosQuitados.join(', ')}.`);
  }
  if (creados) {
    console.log('\n  ⚠  Los nuevos quedaron en $0 y DESACTIVADOS, a propósito.');
    console.log('     Andá a Productos, ponele el precio a cada uno y activalos.');
    console.log('     Mientras estén desactivados no se venden ni aparecen en la carta.');
  }
  console.log('');
}

main();
