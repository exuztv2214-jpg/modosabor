const assert = require('assert');
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

console.log('deliveryTurnos.test.js OK');
