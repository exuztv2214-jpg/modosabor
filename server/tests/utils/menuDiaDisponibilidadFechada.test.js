const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { applyMenuDiaSnapshotAvailability } = require('../../utils/menuDiaPricing');

console.log('\nDisponibilidad fechada del menú del día');

{
  const producto = applyMenuDiaSnapshotAvailability({
    id: 1,
    categoria_nombre: 'Menu del Dia',
    menu_dia_disponible_hoy: 1,
    menu_dia_disponible_fecha: null,
  });
  assert.strictEqual(
    producto.menu_dia_disponible_hoy,
    0,
    'una bandera vieja no puede hacer aparecer un plato sin foto fechada de hoy'
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(producto, 'menu_dia_disponible_fecha'),
    'el alias interno de SQL no debe salir en la API'
  );
  console.log('  OK una marca vieja no reemplaza la foto diaria');
}

{
  const producto = applyMenuDiaSnapshotAvailability({
    id: 2,
    categoria_nombre: 'Menu del Dia',
    menu_dia_disponible_hoy: 0,
    menu_dia_disponible_fecha: 1,
  });
  assert.strictEqual(producto.menu_dia_disponible_hoy, 1);
  console.log('  OK la foto de hoy habilita el plato');
}

{
  const source = fs.readFileSync(path.join(__dirname, '../../routes/operacion.js'), 'utf8');
  const bloquesFechados =
    source.match(/FROM menu_dia_historial h[\s\S]{0,350}h\.fecha = \?/g) || [];
  assert.ok(
    bloquesFechados.length >= 2,
    'Dashboard y resumen operativo deben consultar el historial de la fecha'
  );
  console.log('  OK Dashboard y Control diario usan la misma fuente fechada');
}
