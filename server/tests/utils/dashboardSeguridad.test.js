const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const reportes = fs.readFileSync(path.join(root, 'server', 'routes', 'reportes.js'), 'utf8');
const operacion = fs.readFileSync(path.join(root, 'server', 'routes', 'operacion.js'), 'utf8');
const dashboard = fs.readFileSync(
  path.join(root, 'client', 'src', 'pages', 'DashboardModern.jsx'),
  'utf8'
);
const { hasPermission } = require('../../utils/permissions');

console.log('\nTests de seguridad y exactitud del Dashboard');

assert.ok(
  reportes.includes("router.get('/dashboard', auth, requirePermission('dashboard.finanzas')"),
  'las cifras financieras deben exigir dashboard.finanzas'
);
assert.ok(!hasPermission({ rol: 'cocina' }, 'dashboard.finanzas'));
assert.ok(!hasPermission({ rol: 'delivery' }, 'dashboard.finanzas'));
assert.ok(hasPermission({ rol: 'caja' }, 'dashboard.finanzas'));

const resumen = operacion.slice(
  operacion.indexOf("router.get('/resumen'"),
  operacion.indexOf("router.post('/stock-diario'")
);
assert.ok(
  !/SELECT\s+id,\s*nombre,\s*telefono,\s*disponible,\s*codigo_acceso/i.test(resumen),
  'el resumen operativo no debe exponer el codigo de acceso del rider'
);
assert.ok(
  operacion.includes("router.get('/dashboard', requirePermission('dashboard.view')"),
  'el Dashboard debe usar una respuesta operativa reducida'
);
assert.ok(/api\s*\.get\('\/operacion\/dashboard'\)/.test(dashboard));
assert.ok(dashboard.includes("hasPermission('dashboard.finanzas')"));
assert.ok(reportes.includes('COALESCE(pi.costo_unitario, 0) AS costo_snapshot'));
assert.ok(reportes.includes('coberturaCostosHoy'));

console.log('  OK finanzas separadas, rider protegido y margen con cobertura');
