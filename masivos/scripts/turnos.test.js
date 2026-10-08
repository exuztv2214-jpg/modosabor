const assert = require('node:assert/strict');
const { test } = require('node:test');
const { claveTurno } = require('../turnos');

const turnos = [
  { id: 'almuerzo', desde: '11:00', hasta: '15:00' },
  { id: 'noche', desde: '20:00', hasta: '02:00' },
];
test('la noche conserva su fecha operativa al cruzar medianoche en Argentina', () => {
  assert.equal(claveTurno(turnos, new Date('2026-10-08T23:30:00Z')), '2026-10-08:noche');
  assert.equal(claveTurno(turnos, new Date('2026-10-09T04:30:00Z')), '2026-10-08:noche');
  assert.equal(claveTurno(turnos, new Date('2026-10-09T15:00:00Z')), '2026-10-09:almuerzo');
});
test('fuera de turno conserva un bloqueo diario y descarta turnos apagados', () => {
  assert.equal(claveTurno([], new Date('2026-10-09T01:00:00Z')), '2026-10-08:fuera-de-turno');
  assert.equal(
    claveTurno([{ ...turnos[1], activo: false }], new Date('2026-10-09T04:30:00Z')),
    '2026-10-09:fuera-de-turno'
  );
});
