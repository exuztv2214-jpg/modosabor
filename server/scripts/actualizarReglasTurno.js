/**
 * Corrige la regla del turno de la mañana.
 *
 * ── Qué estaba mal ─────────────────────────────────────────────────────────
 *
 * La regla decía:
 *
 *     "Se vende el menú del día disponible y también la carta completa."
 *
 * Eso le da permiso al agente para ofrecer las dos cosas. Y al mediodía la
 * carta no se ofrece: lo que hay preparado es el menú. Ofrecer la carta empuja
 * al cliente a un plato más caro y más lento justo cuando la cocina está
 * puesta para otra cosa.
 *
 * La regla real del local es: **se ofrece el menú; la carta se manda sólo si
 * el cliente la pide.**
 *
 * ── Por qué hace falta un script ───────────────────────────────────────────
 *
 * El valor por defecto vive en `db/seed.js`, pero el seed sólo inserta lo que
 * falta: si la clave ya existe —y existe— no la toca. Cambiar el seed arregla
 * las instalaciones nuevas y no la que está funcionando.
 *
 * Este script actualiza la que ya está guardada.
 *
 *     node server/scripts/actualizarReglasTurno.js            ← qué haría
 *     node server/scripts/actualizarReglasTurno.js --aplicar  ← lo hace
 */

const path = require('path');
const db = require(path.join(__dirname, '..', 'db'));

const APLICAR = process.argv.includes('--aplicar');
const CLAVE = 'whatsapp_agente_reglas_turnos';

const REGLAS = {
  manana:
    'Se vende el MENÚ DEL DÍA. Ofrecelo vos y preguntá cuál quiere. ' +
    'La carta completa se puede vender, pero NO la ofrezcas por tu cuenta: ' +
    'mandala únicamente si el cliente la pide.',
  noche:
    'Se vende únicamente la carta habitual. No ofrezcas ni tomes menú del día; ' +
    'ofrecé la carta.',
};

function main() {
  console.log('\n🕐 Reglas del agente por turno\n');

  const fila = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(CLAVE);
  const actual = (() => {
    try {
      return JSON.parse(fila?.valor || '{}');
    } catch {
      return {};
    }
  })();

  let cambios = 0;
  for (const turno of ['manana', 'noche']) {
    const antes = String(actual[turno] || '');
    const despues = REGLAS[turno];
    if (antes === despues) {
      console.log(`  ${turno}: ya está como corresponde`);
      continue;
    }
    cambios += 1;
    console.log(`  ${turno}:`);
    console.log(`     antes  → ${antes || '(vacío)'}`);
    console.log(`     ahora  → ${despues}`);
    console.log();
  }

  if (!cambios) {
    console.log('  No hay nada que cambiar.\n');
    return;
  }

  if (!APLICAR) {
    console.log('  Esto fue sólo una mirada: no se cambió nada.');
    console.log('  Para hacerlo de verdad:\n');
    console.log('      node server/scripts/actualizarReglasTurno.js --aplicar\n');
    return;
  }

  /*
    Se conservan los turnos que pudieran existir además de mañana y noche: el
    negocio puede haber agregado alguno desde el panel y este script no tiene
    por qué borrarlo.
  */
  const siguiente = { ...actual, ...REGLAS };
  db.prepare(
    'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ' +
      'ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
  ).run(CLAVE, JSON.stringify(siguiente));

  console.log(
    `  ✅ ${cambios} regla${cambios > 1 ? 's' : ''} actualizada${cambios > 1 ? 's' : ''}.`
  );
  console.log('  Toma efecto en el próximo mensaje: la regla se lee en cada conversación.\n');
}

main();
