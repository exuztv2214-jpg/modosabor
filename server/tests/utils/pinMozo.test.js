const assert = require('assert');
const {
  normalizarPin,
  pinValido,
  hashearPin,
  puedeTocarMesaDeOtro,
} = require('../../utils/pinMozo');

/**
 * PIN de autorización del mozo.
 *
 * Lo que se prueba es el criterio de quién puede trabajar la mesa de otro. Es
 * una decisión de permisos, así que lo que importa no es sólo que deje pasar a
 * quien corresponde, sino que **no deje pasar a quien no**.
 *
 * Se usa una base falsa: la lógica no necesita SQLite y así el test corre en
 * cualquier máquina, sin depender de better-sqlite3.
 */
function baseFalsa(usuarios) {
  return {
    prepare: () => ({
      get: (id) => usuarios.find((u) => Number(u.id) === Number(id)) || null,
    }),
  };
}

function run() {
  const PIN = '4739';
  const ana = { id: 1, nombre: 'Ana', pin_mozo_hash: hashearPin(PIN) };
  const beto = { id: 2, nombre: 'Beto', pin_mozo_hash: '' };
  const db = baseFalsa([ana, beto]);

  const mozo = (id) => ({ id, rol: 'mozo' });
  const encargado = { id: 9, rol: 'admin' };

  // ── El PIN en sí ───────────────────────────────────────────────────────────
  assert.strictEqual(normalizarPin('47-39'), '4739', 'saca lo que no sea número');
  assert.strictEqual(normalizarPin('473999'), '4739', 'corta en cuatro');
  assert.ok(pinValido('4739'));
  assert.ok(!pinValido('473'), 'tres dígitos no alcanzan');

  // ── Su propia mesa: nunca pide nada ────────────────────────────────────────
  assert.ok(puedeTocarMesaDeOtro(db, { usuario: mozo(1), duenoId: 1 }).ok);

  // ── Mesa sin dueño ─────────────────────────────────────────────────────────
  assert.ok(puedeTocarMesaDeOtro(db, { usuario: mozo(1), duenoId: 0 }).ok);

  // ── La mesa de Ana, sin PIN ────────────────────────────────────────────────
  let r = puedeTocarMesaDeOtro(db, { usuario: mozo(2), duenoId: 1 });
  assert.ok(!r.ok, 'sin PIN no puede');
  assert.ok(r.requierePin, 'y hay que avisarle que se lo pida a Ana');
  assert.ok(r.motivo.includes('Ana'), 'el mensaje dice de quién es la mesa');

  // ── Con el PIN equivocado ──────────────────────────────────────────────────
  r = puedeTocarMesaDeOtro(db, { usuario: mozo(2), duenoId: 1, pin: '0000' });
  assert.ok(!r.ok, 'un PIN cualquiera no sirve');

  // ── Con el PIN de Ana ──────────────────────────────────────────────────────
  r = puedeTocarMesaDeOtro(db, { usuario: mozo(2), duenoId: 1, pin: PIN });
  assert.ok(r.ok, 'con el PIN correcto sí');
  assert.strictEqual(r.conPinDe, 'Ana', 'queda registrado con qué PIN entró');

  // ── El encargado pasa sin PIN ──────────────────────────────────────────────
  r = puedeTocarMesaDeOtro(db, { usuario: encargado, duenoId: 1 });
  assert.ok(r.ok);
  assert.ok(r.comoEncargado, 'y se distingue de haber usado un PIN ajeno');

  /*
    ── Beto no configuró PIN ──────────────────────────────────────────────────

    Su mesa queda cerrada para los demás mozos. Es a propósito: si "no tengo
    PIN" dejara pasar, sería la forma más fácil de saltear el control — nadie
    cargaría uno.
  */
  r = puedeTocarMesaDeOtro(db, { usuario: mozo(1), duenoId: 2, pin: PIN });
  assert.ok(!r.ok, 'sin PIN configurado, la mesa no se abre con cualquier PIN');
  assert.ok(!r.requierePin, 'y no tiene sentido pedirle uno que no existe');
  assert.ok(r.motivo.includes('encargado'), 'se le dice a quién recurrir');

  console.log('pinMozo.test.js OK');
}

if (require.main === module) run();

module.exports = { run };
