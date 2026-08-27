const assert = require('assert');
const fs = require('fs');
const path = require('path');

function run() {
  console.log('\n🎟️ Unidades y fechas de cupones');
  const route = fs.readFileSync(path.join(__dirname, '../../routes/cupones.js'), 'utf8');
  const migrations = fs.readFileSync(path.join(__dirname, '../../db/migrations.js'), 'utf8');

  assert.match(route, /tipo === 'fijo' \? pesosACentavos\(valor\) : Number\(valor\)/);
  assert.match(route, /cupon\.tipo_descuento === 'fijo'/);
  assert.match(route, /parseFechaHoraArgentina\(cupon\.fecha_inicio\)/);
  assert.match(migrations, /corregirPorcentajesDeCupones\(db\)/);
  assert.match(migrations, /migracion_cupon_porcentaje_unidad_v1/);
  assert.match(migrations, /tipo_descuento = 'porcentaje' AND valor_descuento > 100/);

  console.log('  ✓ porcentaje y monto fijo conservan unidades distintas y horario argentino');
  console.log('✅ Cupones verificados\n');
}

if (require.main === module) run();
module.exports = { run };
