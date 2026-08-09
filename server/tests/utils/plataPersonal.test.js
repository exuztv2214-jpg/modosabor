/**
 * La plata de Personal entra en centavos, como la del resto del sistema.
 *
 * ── Lo que estaba roto ─────────────────────────────────────────────────────
 *
 * El conversor de la API multiplica por cien lo que entra y divide lo que sale,
 * pero **sólo mira los números**. Los formularios de Personal mandan texto —son
 * campos de texto con separador de miles, para escribir "150.000" como se
 * escribe— así que pasaban de largo:
 *
 *     pesosToCents({ monto_base: 150000 })    → 15000000   (número: convierte)
 *     pesosToCents({ monto_base: '150000' })  → '150000'   (texto: lo deja)
 *
 * La ruta interpretaba ese texto con `roundLocalizedNumber`, que devuelve
 * pesos, y lo guardaba en una columna de centavos. El módulo entero quedó cien
 * veces abajo: la ficha mostraba "$100" donde se habían cargado $10.000.
 *
 * Y no era sólo cosmético. Al liquidar, ese número se inserta en
 * `caja_movimientos.monto`, que sí está en centavos: la caja registraba los
 * pagos al personal cien veces más chicos de lo que se pagó.
 *
 * ── Lo que este test cuida ─────────────────────────────────────────────────
 *
 * Que la conversión exista, que no se aplique dos veces, y que no se le aplique
 * a lo que no es plata. El error inverso —multiplicar por cien algo que ya
 * estaba en centavos— es igual de grave y nadie avisa.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pesosToCents } = require('../../utils/moneyConversion');
const { pesosACentavos } = require('../../utils/numberInput');

function run() {
  console.log('\n💵 La plata de Personal\n');

  // ── 1. La causa: el conversor no toca el texto ────────────────────────────
  //
  // Esto no es un detalle de implementación: es el motivo de todo. Si algún día
  // el conversor empieza a convertir texto, esta conversión de la ruta pasaría a
  // aplicarse dos veces y el error se daría vuelta.
  assert.strictEqual(
    pesosToCents({ monto_base: 150000 }).monto_base,
    15000000,
    'un número sí lo convierte el conversor general'
  );
  assert.strictEqual(
    pesosToCents({ monto_base: '150000' }).monto_base,
    '150000',
    'si el conversor general empieza a convertir texto, la ruta convertiría dos veces'
  );
  console.log('  ✓ el conversor general convierte números y deja pasar el texto');

  // ── 2. Lo que escribe el formulario ───────────────────────────────────────
  //
  // El campo es de texto y la gente escribe con separador de miles y coma
  // decimal, como se escribe en Argentina.
  const casos = [
    ['150000', 15000000, 'sin separadores'],
    ['150.000', 15000000, 'con punto de miles'],
    ['150.000,50', 15000050, 'con centavos'],
    ['1.250.000', 125000000, 'un sueldo grande'],
    [0, 0, 'cero'],
    ['', 0, 'vacío'],
  ];
  for (const [escrito, esperado, porque] of casos) {
    const real = pesosACentavos(escrito);
    assert.strictEqual(
      real,
      esperado,
      `"${escrito}" (${porque}) dio ${real} y tenía que dar ${esperado}`
    );
  }
  console.log(`  ✓ convierte bien las ${casos.length} formas de escribir un importe`);

  // ── 3. Que la plata se vea como se cargó ──────────────────────────────────
  //
  // El viaje completo: se escribe $150.000, se guarda, y la pantalla lo divide
  // por cien al mostrarlo. Tiene que volver el mismo número.
  const guardado = pesosACentavos('150.000');
  assert.strictEqual(guardado / 100, 150000, 'lo que se carga tiene que verse igual');
  console.log('  ✓ se carga $150.000 y se ve $150.000');

  // ── 4. La caja recibe el mismo idioma ─────────────────────────────────────
  //
  // Es el punto que hacía daño de verdad. `caja_movimientos.monto` está en
  // centavos: si Personal le pasa pesos, la caja registra cien veces menos.
  const netoALiquidar = pesosACentavos('150.000');
  assert.strictEqual(
    netoALiquidar,
    15000000,
    'la caja lee centavos: pasarle pesos registra la salida cien veces más chica'
  );
  console.log('  ✓ lo que va a la caja está en centavos, como la caja espera');

  // ── 5. Que no se convierta lo que no es plata ─────────────────────────────
  //
  // En las mismas rutas hay cantidades y porcentajes que se leen igual pero no
  // son plata. Multiplicar un porcentaje por cien no da un número raro: da uno
  // plausible y equivocado, que es peor.
  const ruta = fs.readFileSync(path.join(__dirname, '../../routes/personal.js'), 'utf8');
  for (const campo of ['unidades', 'objetivo', 'progreso', 'cantidad', 'descuento_empleado_pct']) {
    const linea = ruta.split('\n').find((l) => l.includes(`?.${campo}`) && l.includes('pesosA'));
    assert.ok(!linea, `se está convirtiendo "${campo}", que no es plata:\n    ${linea}`);
  }
  console.log('  ✓ las cantidades y los porcentajes no se convierten');

  // ── 6. Que la conversión siga estando ─────────────────────────────────────
  //
  // Lo de arriba prueba la fórmula, no que la ruta la use. Si alguien vuelve a
  // poner `roundLocalizedNumber` sobre un campo de plata, todo lo anterior
  // seguiría pasando y el sistema estaría roto igual.
  for (const campo of ['monto_base', 'monto', 'premio_monto']) {
    const conPesos = ruta.includes(`pesosACentavos(req.body?.${campo}`);
    const conPayload = ruta.includes(`pesosACentavos(payload.${campo}`);
    const conBody = ruta.includes(`pesosACentavos(req.body.${campo}`);
    assert.ok(
      conPesos || conPayload || conBody,
      `"${campo}" dejó de convertirse a centavos en routes/personal.js`
    );
  }
  assert.ok(
    !/roundLocalizedNumber\((req\.body|payload)\?*\.(monto|premio)/.test(ruta),
    'volvió un roundLocalizedNumber sobre un campo de plata: eso guarda pesos'
  );
  console.log('  ✓ la ruta convierte los tres campos de plata\n');

  console.log('✅ Plata de Personal: en centavos, como el resto\n');
}

if (require.main === module) run();

module.exports = { run };
