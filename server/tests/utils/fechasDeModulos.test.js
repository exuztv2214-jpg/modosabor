const assert = require('assert');
const fs = require('fs');
const path = require('path');

const leer = (relativa) => fs.readFileSync(path.join(__dirname, '../..', relativa), 'utf8');

function run() {
  console.log('\n📅 Fecha argentina en módulos operativos');

  const reportes = leer('routes/reportes.js');
  const delivery = leer('routes/reportesDelivery.js');
  const clientes = leer('routes/clientes.js');
  const riders = leer('routes/repartidores.js');
  const personal = leer('services/personalService.js');
  const cotizaciones = leer('services/cotizacionesService.js');
  const pedidos = fs.readFileSync(
    path.join(__dirname, '../../../client/src/pages/Pedidos/constants.js'),
    'utf8'
  );
  const clientesPanel = fs.readFileSync(
    path.join(__dirname, '../../../client/src/pages/Clientes/useClientes.jsx'),
    'utf8'
  );
  const club = fs.readFileSync(
    path.join(__dirname, '../../../client/src/pages/ClubFidelidad/FormularioCliente.jsx'),
    'utf8'
  );

  assert.match(reportes, /return hoyArgentina\(/);
  assert.match(reportes, /const mesActual = hoyArgentina\(\)\.slice\(5, 7\)/);
  assert.match(delivery, /const hoy = hoyArgentina\(\)/);
  assert.match(clientes, /const mesActual = hoyArgentina\(\)\.slice\(5, 7\)/);
  assert.match(riders, /fecha_ingreso \|\| hoyArgentina\(\)/);
  assert.match(personal, /data\.fecha_ingreso \|\| hoyArgentina\(\)/);
  assert.match(cotizaciones, /fecha_emision:[^\n]+hoyArgentina\(\)/);
  assert.match(pedidos, /todayStr = \(\) => hoyArgentina\(\)/);
  assert.match(clientesPanel, /const todayMonthDay = mesDiaArgentina\(\)/);
  assert.match(club, /max=\{hoyArgentina\(\)\}/);

  console.log(
    '  ✓ reportes, pedidos, cumpleaños, riders, personal y cotizaciones usan el día del local'
  );
  console.log('✅ Fechas operativas verificadas\n');
}

if (require.main === module) run();
module.exports = { run };
