/**
 * Qué grupos hay que elegir sí o sí para poder cobrar.
 *
 * ── El error que se corrigió ───────────────────────────────────────────────
 *
 * La pantalla de listas compartidas ofrecía un interruptor de "hay que elegir
 * sí o sí", se guardaba en la base y viajaba hasta el TPV… donde nadie lo
 * miraba. El TPV y la web exigían elegir en **todos** los grupos, siempre.
 *
 * O sea: un interruptor que no hacía nada. Peor que no tenerlo, porque quien
 * lo apagara creería que esa salsa es opcional y después no podría cerrar el
 * pedido sin elegir una.
 *
 * ── La regla, y por qué es tan angosta ─────────────────────────────────────
 *
 * Un grupo es opcional **sólo si viene de una lista compartida y esa lista
 * dice que no es obligatoria**.
 *
 * Todo lo demás sigue siendo obligatorio. Los grupos cargados a mano adentro
 * de cada plato no tienen el campo `obligatorio`: si al no encontrarlo se los
 * tratara como opcionales, se podría vender una pizza sin elegir si es entera
 * o mitad, y una milanesa sin decir si es de carne o de pollo. Eso no da error
 * en ningún lado — sale una comanda incompleta y se discute en el mostrador.
 *
 * Por eso los tests de abajo insisten tanto en el caso "grupo sin `lista_id`".
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const leerCliente = (rel) =>
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', rel), 'utf8');

/*
  El módulo del cliente usa `export`, y estos tests corren en CommonJS. En vez
  de sumar un compilador para tres funciones de diez líneas, se traduce el
  `export` y se evalúa. Lo que se prueba es el archivo real: si alguien cambia
  la regla allá, esto lo ve.
*/
function cargarModuloDelCliente() {
  const fuente = leerCliente('lib/variantesObligatorias.js').replace(
    /export function/g,
    'function'
  );
  const modulo = {};
  new Function(
    'salida',
    `${fuente}\n salida.grupoEsObligatorio = grupoEsObligatorio;\n salida.faltaElegirGrupo = faltaElegirGrupo;\n salida.variantesCompletas = variantesCompletas;`
  )(modulo);
  return modulo;
}

function run() {
  console.log('\n✅ Grupos obligatorios y opcionales\n');

  const { grupoEsObligatorio, faltaElegirGrupo, variantesCompletas } = cargarModuloDelCliente();

  // ── 1. Lo cargado a mano en el plato sigue siendo obligatorio ─────────────
  //
  // Es el punto que protege la carta que ya existe: las once pizzas, las seis
  // empanadas y las diez milanesas tienen su grupo propio y ninguno trae el
  // campo `obligatorio`.
  const presentacionDeLaPizza = {
    nombre: 'Presentacion',
    opciones: [{ nombre: 'Entera Cremoso' }, { nombre: 'Media Cremoso' }],
  };
  assert.strictEqual(
    grupoEsObligatorio(presentacionDeLaPizza),
    true,
    'se puede vender una pizza sin elegir si es entera o mitad'
  );
  assert.strictEqual(
    variantesCompletas([presentacionDeLaPizza], {}),
    false,
    'el botón de agregar se habilitó sin elegir la presentación'
  );
  assert.strictEqual(
    variantesCompletas([presentacionDeLaPizza], { Presentacion: { nombre: 'Media Cremoso' } }),
    true
  );
  console.log('  ✓ los grupos propios del plato siguen siendo obligatorios');

  // Y explícitamente: que decir `obligatorio: 0` en un grupo propio no alcance.
  // Si alcanzara, bastaría con un dato viejo o mal cargado para poder vender
  // una milanesa sin saber si es de carne o de pollo.
  assert.strictEqual(
    grupoEsObligatorio({ nombre: 'Tipo', obligatorio: 0 }),
    true,
    'un grupo sin lista_id se volvió opcional: alcanza un dato mal cargado para vender sin elegir'
  );
  console.log('  ✓ sin lista_id, decir "opcional" no alcanza');

  // ── 2. Una lista compartida obligatoria se exige ──────────────────────────
  const guarnicion = {
    nombre: 'Guarniciones',
    lista_id: 1,
    obligatorio: 1,
    opciones: [{ nombre: 'Papas fritas' }],
  };
  assert.strictEqual(grupoEsObligatorio(guarnicion), true);
  assert.strictEqual(variantesCompletas([guarnicion], {}), false);
  console.log('  ✓ una guarnición marcada como obligatoria se exige');

  // ── 3. Una lista compartida opcional no frena la venta ────────────────────
  const salsa = {
    nombre: 'Salsas',
    lista_id: 2,
    obligatorio: 0,
    opciones: [{ nombre: 'Salsa de pollo' }],
  };
  assert.strictEqual(grupoEsObligatorio(salsa), false);
  assert.strictEqual(
    variantesCompletas([salsa], {}),
    true,
    'una salsa opcional sin elegir está frenando el cobro'
  );
  console.log('  ✓ una salsa opcional sin elegir no frena el cobro');

  // ── 4. El botón nombra el grupo obligatorio, no el opcional ───────────────
  //
  // El botón del TPV dice "Elegí Presentación" cuando falta algo. Si mirara
  // también los opcionales, diría "Elegí Salsas" al lado de un botón que sí
  // funciona, y nadie entendería qué falta.
  const mezcla = [presentacionDeLaPizza, salsa, guarnicion];
  assert.strictEqual(faltaElegirGrupo(mezcla, {})?.nombre, 'Presentacion');
  assert.strictEqual(
    faltaElegirGrupo(mezcla, { Presentacion: { nombre: 'Media Cremoso' } })?.nombre,
    'Guarniciones',
    'el botón se salteó la guarnición obligatoria o se enganchó con la salsa opcional'
  );
  assert.strictEqual(
    faltaElegirGrupo(mezcla, {
      Presentacion: { nombre: 'Media Cremoso' },
      Guarniciones: { nombre: 'Papas fritas' },
    }),
    undefined,
    'con lo obligatorio elegido todavía dice que falta algo'
  );
  console.log('  ✓ el botón nombra el grupo obligatorio que falta, no el opcional');

  // ── 5. Sin grupos, o con datos rotos, no se traba ─────────────────────────
  for (const caso of [[], null, undefined]) {
    assert.strictEqual(
      variantesCompletas(caso, {}),
      true,
      'un plato sin variantes no se puede vender'
    );
  }
  assert.strictEqual(variantesCompletas([presentacionDeLaPizza], null), false);
  console.log('  ✓ un plato sin variantes se vende igual');

  // ── 6. Que el TPV y la web usen esta regla ────────────────────────────────
  //
  // Lo de arriba prueba la función. Esto prueba que alguien la llame: la regla
  // vivía duplicada en dos archivos y por eso el interruptor no hacía nada.
  const tpv = leerCliente('pages/TPV.jsx');
  const web = leerCliente('components/WebPublica/VariantModal.jsx');
  const modalTpv = leerCliente('components/TPV/TpvVariantModal.jsx');

  for (const [nombre, fuente] of [
    ['el TPV', tpv],
    ['la web pública', web],
  ]) {
    assert.ok(
      fuente.includes("from '../lib/variantesObligatorias.js'") ||
        fuente.includes("from '../../lib/variantesObligatorias.js'"),
      `${nombre} dejó de usar la regla compartida y volvió a tener la suya`
    );
    assert.ok(
      !/variantes\.every\(/.test(fuente),
      `${nombre} volvió a exigir todos los grupos por su cuenta`
    );
  }
  assert.ok(
    modalTpv.includes('faltaElegirGrupo(') && modalTpv.includes('grupoEsObligatorio('),
    'el modal del TPV volvió a calcular por su cuenta qué grupo falta'
  );
  console.log('  ✓ el TPV y la web usan la misma regla, en un solo lugar\n');

  console.log('✅ Grupos obligatorios: una sola regla, respetada en los dos lados\n');
}

if (require.main === module) run();

module.exports = { run };
