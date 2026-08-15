const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { filterRepartidoresByCurrentShift } = require('../../utils/deliveryAssignment');

const riders = [
  {
    id: 1,
    nombre: 'Cristian',
    personal_id: 1,
    personal_activo: 1,
    personal_turno_preferido: 'noche',
  },
  {
    id: 2,
    nombre: 'Mathias',
    personal_id: 2,
    personal_activo: 1,
    personal_turno_preferido: 'manana',
  },
  { id: 3, nombre: 'Ivan', personal_id: 3, personal_activo: 1, personal_turno_preferido: 'manana' },
];
const fakeDb = { prepare: () => ({ all: () => [] }) };

const turnoNoche = filterRepartidoresByCurrentShift(fakeDb, riders, {
  turno_actual: { id: 'noche' },
});
assert.deepStrictEqual(
  turnoNoche.map((rider) => rider.id),
  [1],
  'solo se debe ofrecer el rider del turno noche'
);

const sinTurno = filterRepartidoresByCurrentShift(fakeDb, riders, { turno_actual: null });
assert.deepStrictEqual(sinTurno, [], 'fuera de horario no se debe ofrecer un rider por descarte');

const deliveryPage = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'Delivery.jsx'),
  'utf8'
);
assert.match(
  deliveryPage,
  /return \[\.\.\.repartidoresEnTurno\]\.sort/,
  'la asignación manual debe mostrar riders ocupados del turno, no ocultarlos'
);
assert.match(
  deliveryPage,
  /\['entregado', 'cancelado'\]\.includes/,
  'la carga del rider debe contar pedidos nuevos y en preparación, no sólo los que salieron'
);

const tpvPage = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'TPV.jsx'),
  'utf8'
);
assert.match(
  tpvPage,
  /setInterval\(actualizarRidersDelTurno, 30000\)/,
  'el TPV debe refrescar riders cuando cambia el turno sin exigir una recarga completa'
);

const assignmentSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'utils', 'deliveryAssignment.js'),
  'utf8'
);
assert.match(
  assignmentSource,
  /estado NOT IN \('entregado', 'cancelado'\)/,
  'la carga del servidor debe incluir todo pedido asignado que todavía no terminó'
);

console.log('deliveryTurnos.test.js OK');
