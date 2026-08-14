/**
 * Los precios que ve la IA de WhatsApp.
 *
 * ── Lo que estaba mal ──────────────────────────────────────────────────────
 *
 * Al agente se le mandaba el catálogo así:
 *
 *     opciones:      ["Presentacion: Media Cremoso, Entera Cremoso, Media Muzza"]
 *     precio_desde:  450000
 *
 * Los nombres de las opciones sin un solo precio, y un único número que es el
 * del producto base — o sea **el de la opción más barata**.
 *
 * Con eso la IA sabía que la pizza entera existe pero no cuánto sale. El único
 * precio que tenía era el de la media, y ése cantaba.
 *
 * Se vio en conversaciones reales del local: listó "Común ($4.500)" cuando la
 * entera vale $8.000. En la 4 Quesos la diferencia es peor: cotizaba $5.500 y
 * la entera con muzza son $11.000. La mitad de la venta.
 *
 * ── Por qué se arregla acá y no en el prompt ───────────────────────────────
 *
 * Porque no es un problema de redacción. Al modelo le faltaba el dato. Pedirle
 * en el prompt que "cotice bien" no sirve si el precio de esa opción nunca le
 * llegó: lo único que puede hacer es inventarlo o repetir el que tiene.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const fuente = fs.readFileSync(
  path.join(__dirname, '..', '..', 'utils', 'systemClient.js'),
  'utf8'
);

/*
  `systemClient` toca la base al cargarse, así que en vez de importarlo se saca
  la función real del archivo y se la evalúa con sus dos ayudantes. Lo que se
  prueba es el código que corre en producción, no una copia escrita acá.
*/
function cargarBuildProductPreview() {
  const desde = fuente.indexOf('function buildProductPreview');
  assert.ok(desde > 0, 'no se encontró buildProductPreview: cambió de nombre');
  const hasta = fuente.indexOf('\nfunction ', desde + 10);
  const cuerpo = fuente.slice(desde, hasta);

  const ayudantes = `
    function parseJsonArray(v){ if(!v) return []; if(Array.isArray(v)) return v;
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
    function formatMoney(v){ return '$' + (Number(v||0)/100).toLocaleString('es-AR'); }
    function normalizeText(v){ return String(v||'').trim().toLowerCase()
      .normalize('NFD').replace(/[\\u0300-\\u036f]/g,''); }
    function detectProductType(p){
      const c = normalizeText(p.categoria_nombre||''); const n = normalizeText(p.nombre||'');
      if (c.includes('pizza') || n.includes('pizza')) return 'pizza';
      return 'general'; }
  `;
  // eslint-disable-next-line no-new-func
  return new Function(`${ayudantes}\n${cuerpo}\nreturn buildProductPreview;`)();
}

// Una pizza tal cual está en la base del local: el precio del producto es el
// de la media con cremoso, y las otras tres presentaciones suman desde ahí.
const PIZZA_4_QUESOS = {
  id: 8,
  nombre: '4 Quesos',
  categoria_nombre: 'Pizzas',
  precio: 550000,
  variantes: JSON.stringify([
    {
      nombre: 'Presentación',
      opciones: [
        { nombre: 'Media Cremoso', precio_extra: 0 },
        { nombre: 'Entera Cremoso', precio_extra: 450000 },
        { nombre: 'Media Muzza', precio_extra: 50000 },
        { nombre: 'Entera Muzza', precio_extra: 550000 },
      ],
    },
  ]),
  extras: '[]',
};

const HAMBURGUESA = {
  id: 40,
  nombre: 'Smash Simple',
  categoria_nombre: 'Hamburguesas',
  precio: 1300000,
  variantes: '[]',
  extras: JSON.stringify([
    { nombre: 'Queso extra', precio: 100000 },
    { nombre: 'Huevo', precio: 100000 },
  ]),
};

function run() {
  console.log('\n💵 Los precios que ve la IA de WhatsApp\n');

  const buildProductPreview = cargarBuildProductPreview();
  const pizza = buildProductPreview(PIZZA_4_QUESOS);

  // ── 1. Cada opción con su precio final, ya calculado ──────────────────────
  const presentacion = pizza.opciones_detalle.find((g) => g.grupo === 'Presentación');
  assert.ok(presentacion, 'no llegó el grupo de presentaciones');

  const porNombre = Object.fromEntries(presentacion.opciones.map((o) => [o.nombre, o.precio]));
  assert.deepStrictEqual(
    porNombre,
    {
      'Media Cremoso': 550000,
      'Entera Cremoso': 1000000,
      'Media Muzza': 600000,
      'Entera Muzza': 1100000,
    },
    'los precios por opción no son los reales: la IA va a cotizar mal'
  );
  console.log('  ✓ cada presentación viaja con su precio final ya sumado');

  // ── 2. El precio más caro también llega ───────────────────────────────────
  //
  // Es el punto que hacía perder plata: antes el único número era el más
  // barato, y ése cantaba para todo.
  assert.strictEqual(
    porNombre['Entera Muzza'],
    1100000,
    'la entera con muzza es el doble que la media: si no llega, se cobra la mitad'
  );
  assert.strictEqual(pizza.precio_desde, 1000000, 'la pizza muestra la entera con cremoso');
  console.log('  ✓ la opción cara llega tan clara como la barata');

  // ── 3. En texto también, por si el modelo lee el resumen ──────────────────
  //
  // No se sabe cómo arma el prompt n8n. Si lee el texto y no el detalle, tiene
  // que encontrar los precios ahí igual.
  const resumen = pizza.opciones.join(' | ');
  for (const esperado of ['Media Cremoso $5.500', 'Entera Muzza $11.000']) {
    assert.ok(resumen.includes(esperado), `el resumen en texto no dice "${esperado}": ${resumen}`);
  }
  console.log('  ✓ el resumen en texto también lleva los precios');

  // ── 4. Queda dicho que precio_desde es un piso ────────────────────────────
  //
  // Un modelo que ve un número solo lo canta como si fuera el precio final.
  assert.ok(
    /precio_desde es el más barato/.test(pizza.aviso_precio),
    'se perdió el aviso de que precio_desde no es el precio de la cosa'
  );
  console.log('  ✓ se aclara que precio_desde no es el precio final');

  // ── 5. Los agregados también con su precio ────────────────────────────────
  const hamburguesa = buildProductPreview(HAMBURGUESA);
  assert.deepStrictEqual(
    hamburguesa.extras_detalle.map((e) => [e.nombre, e.precio_texto]),
    [
      ['Queso extra', '$1.000'],
      ['Huevo', '$1.000'],
    ],
    'los agregados llegan sin precio: la IA no puede cotizar una hamburguesa con extras'
  );
  console.log('  ✓ los agregados llevan su precio');

  // ── 6. Un plato sin opciones no se rompe ──────────────────────────────────
  assert.deepStrictEqual(hamburguesa.opciones_detalle, []);
  assert.strictEqual(
    hamburguesa.aviso_precio,
    '',
    'un plato de precio único no necesita aviso, y ponerlo confunde al modelo'
  );
  console.log('  ✓ un plato de precio único queda limpio\n');

  console.log('✅ La IA recibe el precio real de cada opción\n');
}

if (require.main === module) run();

module.exports = { run };
