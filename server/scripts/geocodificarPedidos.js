/**
 * Geocodifica pedidos viejos que quedaron sin coordenadas.
 *
 * Uso:
 *   node server/scripts/geocodificarPedidos.js            (últimos 200)
 *   node server/scripts/geocodificarPedidos.js --todos    (todos)
 *   node server/scripts/geocodificarPedidos.js --limite 50
 *
 * Nominatim permite 1 consulta por segundo, así que 200 pedidos tardan
 * ~3-4 minutos. El caché hace que las direcciones repetidas no vuelvan
 * a consultar, con lo cual en la práctica suele ser bastante más rápido.
 *
 * Es seguro correrlo varias veces: solo toca pedidos sin coordenadas.
 */
const db = require('../db');
const { geocodificarPedido } = require('../services/geocoding');

const args = process.argv.slice(2);
const todos = args.includes('--todos');
const limiteArg = args.indexOf('--limite');
const limite = todos ? 100000 : limiteArg >= 0 ? Number(args[limiteArg + 1]) || 200 : 200;

async function main() {
  const pendientes = db
    .prepare(
      `SELECT id, numero, cliente_direccion
       FROM pedidos
       WHERE tipo_entrega = 'delivery'
         AND TRIM(COALESCE(cliente_direccion, '')) != ''
         AND (
           cliente_latitud IS NULL
           OR cliente_longitud IS NULL
           OR (ABS(COALESCE(cliente_latitud, 0)) < 0.0001
               AND ABS(COALESCE(cliente_longitud, 0)) < 0.0001)
         )
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limite);

  if (pendientes.length === 0) {
    console.log('No hay pedidos pendientes de geocodificar.');
    return;
  }

  console.log(`Geocodificando ${pendientes.length} pedidos...`);
  console.log('(Nominatim permite 1 consulta/seg, esto puede tardar)\n');

  let ok = 0;
  let fallidos = 0;

  for (let i = 0; i < pendientes.length; i += 1) {
    const p = pendientes[i];
    const progreso = `[${i + 1}/${pendientes.length}]`;
    try {
      const geo = await geocodificarPedido(p.id);
      if (geo) {
        ok += 1;
        const origen = geo.desdeCache ? 'cache' : 'nominatim';
        console.log(
          `${progreso} ✓ #${p.numero} "${p.cliente_direccion}" → ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)} (${geo.precision}, ${origen})`
        );
      } else {
        fallidos += 1;
        console.log(`${progreso} ✗ #${p.numero} "${p.cliente_direccion}" — sin resultado`);
      }
    } catch (error) {
      fallidos += 1;
      console.log(`${progreso} ✗ #${p.numero} — error: ${error.message}`);
    }
  }

  console.log(`\nListo: ${ok} geocodificados, ${fallidos} sin resultado.`);
  if (fallidos > 0) {
    console.log(
      'Los que fallaron probablemente tengan direcciones incompletas o mal escritas.\n' +
        'Se pueden corregir a mano desde el admin.'
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
