const assert = require('assert');
const social = require('../../services/socialService');

const item = (tipo, personalizaciones, texto = 'Texto común') => ({
  destino_tipo: tipo,
  texto,
  personalizaciones: JSON.stringify(personalizaciones),
});

console.log('\nTexto distinto por red en Social');

assert.strictEqual(
  social.textoParaLaRed(
    item('facebook_page', {
      editar_por_red: true,
      textos_por_red: { facebook: 'Texto para Facebook', instagram: 'Texto para Instagram' },
    })
  ),
  'Texto para Facebook'
);
console.log('  ✓ Facebook recibe su texto');

assert.strictEqual(
  social.textoParaLaRed(
    item('instagram_feed', {
      editar_por_red: true,
      textos_por_red: { facebook: 'Texto para Facebook', instagram: 'Texto para Instagram' },
    })
  ),
  'Texto para Instagram'
);
console.log('  ✓ Instagram recibe su texto');

assert.strictEqual(
  social.textoParaLaRed(
    item('instagram_feed', {
      editar_por_red: false,
      textos_por_red: { instagram: 'No debe usarse' },
    })
  ),
  'Texto común'
);
console.log('  ✓ al apagar la edición por red vuelve al texto común');

assert.strictEqual(
  social.textoParaLaRed(item('facebook_group', { editar_por_red: true, textos_por_red: {} })),
  'Texto común'
);
console.log('  ✓ campañas viejas conservan el texto común como respaldo');

console.log('✅ Texto por red verificado\n');
