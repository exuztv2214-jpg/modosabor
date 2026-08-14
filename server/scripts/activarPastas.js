/**
 * Les pone el precio a las pastas y las activa.
 *
 * Los precios los dio Hernán el 14/8/2026:
 *
 *     Lasaña          $7.000
 *     Ñoquis          $5.000
 *     Fideos caseros  $5.000
 *     Ravioles        $7.000
 *
 * Se guardan en CENTAVOS, que es como está toda la plata del sistema:
 * $7.000 son 700000. Escribir 7000 acá dejaría el plato a $70 — el mismo
 * error que hubo que arreglar con corregirPreciosMenuDia.js.
 *
 * Recién cuando tienen precio se activan. Un plato activo en $0 es un plato
 * que el bot regala, así que las dos cosas van juntas y en ese orden.
 *
 * No toca ningún otro plato, ni las salsas, ni la categoría: sólo estos
 * cuatro, y sólo si hoy están en $0. Si alguno ya tiene precio puesto a mano
 * desde el panel, lo deja como está y avisa — ese número lo puso una persona
 * y gana.
 *
 *     node server/scripts/activarPastas.js            ← muestra qué haría
 *     node server/scripts/activarPastas.js --aplicar  ← lo hace
 */

const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));
const { createDatabaseBackup } = require(path.join(__dirname, '..', 'utils', 'backupManager'));
const { textoNormalizado } = require(path.join(__dirname, '..', 'utils', 'opcionesCompartidas'));

const APLICAR = process.argv.includes('--aplicar');

// En centavos. El comentario de al lado es lo que ve el cliente.
const PRECIOS = [
  /*
    El canelón no estaba en esta lista al principio, porque en la base local ya
    existía con su precio puesto y el script lo saltea solo.

    En producción no existe, así que cargarPastas.js lo crea en $0 y
    desactivado. Sin esta línea se quedaba así para siempre: un plato fantasma
    que nadie ve y que nadie activa. Hernán confirmó que va a $5.000, igual que
    en el menú del día.
  */
  { nombre: 'Canelones', centavos: 500000 }, //  $5.000
  { nombre: 'Lasaña', centavos: 700000 }, //  $7.000
  { nombre: 'Ñoquis', centavos: 500000 }, //  $5.000
  { nombre: 'Fideos caseros', centavos: 500000 }, //  $5.000
  { nombre: 'Ravioles', centavos: 700000 }, //  $7.000
];

const pesos = (centavos) =>
  `$${(centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;

function main() {
  console.log('\n🍝 Precios de las pastas\n');

  const productos = db.prepare('SELECT id, nombre, precio, activo FROM productos').all();
  const plan = [];

  for (const item of PRECIOS) {
    const buscado = textoNormalizado(item.nombre);
    const fila = productos.find((p) => textoNormalizado(p.nombre) === buscado);

    if (!fila) {
      plan.push({ tipo: 'falta', texto: `❌ no encuentro "${item.nombre}" — ¿se cargó?` });
      continue;
    }
    if (Number(fila.precio) > 0) {
      plan.push({
        tipo: 'ya',
        texto:
          `⚠  "${fila.nombre}" ya tiene ${pesos(fila.precio)} puesto — lo dejo así. ` +
          `Si querés ${pesos(item.centavos)}, cambialo desde Productos.`,
      });
      continue;
    }
    plan.push({
      tipo: 'hacer',
      id: fila.id,
      texto: `${fila.nombre} → ${pesos(item.centavos)} y se activa`,
      centavos: item.centavos,
    });
  }

  plan.forEach((linea) => console.log(`   · ${linea.texto}`));

  const aHacer = plan.filter((l) => l.tipo === 'hacer');
  if (!aHacer.length) {
    console.log('\n  No hay nada que cambiar.\n');
    return;
  }

  if (!APLICAR) {
    console.log('\n  Esto fue sólo una mirada: no se cambió nada.');
    console.log('  Para hacerlo de verdad:\n');
    console.log('      node server/scripts/activarPastas.js --aplicar\n');
    return;
  }

  try {
    const backup = createDatabaseBackup(db, { reason: 'antes-de-activar-pastas' });
    console.log(`\n  📦 Backup hecho: ${backup.file}`);
  } catch (error) {
    console.error(`\n  ❌ No se pudo hacer el backup: ${error.message}`);
    console.error('  No se cambió nada.\n');
    process.exitCode = 1;
    return;
  }

  const aplicar = db.transaction(() => {
    // El precio y el activo se escriben juntos: si se activara primero y algo
    // fallara al poner el precio, quedaría un plato vendiéndose en $0.
    const actualizar = db.prepare('UPDATE productos SET precio = ?, activo = 1 WHERE id = ?');
    aHacer.forEach((linea) => actualizar.run(linea.centavos, linea.id));
  });
  aplicar();

  console.log(`\n  ✅ ${aHacer.length} pastas con precio y activas.`);
  console.log('     Ya salen en la carta y la IA las puede ofrecer.\n');
}

main();
