const assert = require('assert');
const fs = require('fs');
const path = require('path');

const MODALES_DEL_PANEL = [
  'client/src/components/Compras/NuevaCompraModal.jsx',
  'client/src/pages/Categorias.jsx',
  'client/src/pages/Clientes/ClienteFormModal.jsx',
  'client/src/pages/MarketingDigital.jsx',
  'client/src/pages/Productos/ProductoDetailModal.jsx',
  'client/src/pages/Productos/ProductoFormModal.jsx',
];

function run() {
  console.log('\n🧪 Teclado en modales del panel');

  for (const archivo of MODALES_DEL_PANEL) {
    const contenido = fs.readFileSync(path.join(__dirname, '../../..', archivo), 'utf8');
    assert.doesNotMatch(
      contenido,
      /role="button"[\s\S]{0,220}event\.key === ' '/,
      `${archivo} convierte Espacio en un clic del fondo y puede cerrar el modal al escribir`
    );
  }

  console.log('  ✓ Espacio queda reservado para escribir y no activa fondos de modal');
  console.log('✅ Teclado de modales verificado\n');
}

if (require.main === module) run();
module.exports = { run };
