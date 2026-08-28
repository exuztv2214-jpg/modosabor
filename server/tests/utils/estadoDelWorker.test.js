/**
 * ¿El Worker está prendido de verdad?
 *
 * ── El bug que esto impide ─────────────────────────────────────────────────
 *
 * El estado se guardaba tal como lo mandaba el Worker y no se revisaba nunca
 * más. Un Worker que mandó un latido en julio y no se prendió nunca más
 * figuraba **"online" para siempre**.
 *
 * En pantalla eso se veía así: el tablero tachaba "Vincular esta PC" como
 * hecho, y la tarjeta de al lado decía "Sin validar". Dos partes de la misma
 * pantalla contándote cosas distintas, y uno esperando que pasara algo que no
 * iba a pasar.
 *
 * Es de la misma familia que las fechas ISO guardadas en columnas de SQLite:
 * nada falla, nada avisa, y no anda.
 */
const assert = require('assert');
const social = require('../../services/socialService');
const { sqlFecha } = require('../../utils/fechaLocal');

/*
  Se arma la fila a mano, como la devolvería la base.

  No hace falta una base para probar esto: la función mira una fila y el reloj.
  Un test que levanta media docena de tablas para verificar una resta de fechas
  tarda más, falla por motivos ajenos, y cuando se pone rojo no dice qué se
  rompió.
*/
const conUltimoLatidoHace = (segundos, estado = 'online') =>
  social.estadoRealDelWorker({
    codigo: 'windows-local',
    nombre: 'Worker',
    estado,
    version: '1.0',
    detalle: '{}',
    ultimo_heartbeat_en: sqlFecha(new Date(Date.now() - segundos * 1000)),
  });

module.exports = {
  'un latido reciente es un Worker prendido': () => {
    const worker = conUltimoLatidoHace(10);

    assert.strictEqual(worker.estado, 'online');
    assert.strictEqual(worker.vivo, true);
  },

  'un latido de hace una hora es un Worker apagado': () => {
    /*
      Este es el caso exacto que rompía: la fila decía 'online' y nadie miraba
      el reloj.
    */
    const worker = conUltimoLatidoHace(3600, 'online');

    assert.strictEqual(worker.estado, 'offline', 'aunque la fila diga online');
    assert.strictEqual(worker.vivo, false);
  },

  'a los tres minutos ya está apagado': () => {
    /* Late cada 8 segundos: tres minutos son veintidós latidos perdidos. */
    const worker = conUltimoLatidoHace(180);
    assert.strictEqual(worker.estado, 'offline');
  },

  'a los treinta segundos sigue prendido': () => {
    /*
      Una PC que se traba un rato no es una PC apagada. Marcarla como apagada
      haría parpadear el tablero por nada.
    */
    const worker = conUltimoLatidoHace(30);
    assert.strictEqual(worker.estado, 'online');
  },

  'lo que informó la última vez no se pierde': () => {
    /*
      Un Worker puede estar apagado ahora y haber estado bloqueado por Facebook
      la última vez que habló. Las dos cosas importan y son distintas: una dice
      si podés esperar que trabaje, la otra por qué dejó de hacerlo.
    */
    const worker = conUltimoLatidoHace(3600, 'blocked');

    assert.strictEqual(worker.estado, 'offline', 'ahora no está');
    assert.strictEqual(worker.estadoInformado, 'blocked', 'pero se sabe cómo terminó');
  },

  'se dice hace cuánto que no habla': () => {
    /*
      "Apagado" no ayuda a saber si es algo que acaba de pasar o de hace días.
      El número sí.
    */
    const worker = conUltimoLatidoHace(600);

    assert.ok(worker.silencioSegundos >= 595 && worker.silencioSegundos <= 615);
  },

  'sin ningún Worker registrado se devuelve null': () => {
    /*
      Null y no un objeto con estado 'offline': nunca se instaló, que es
      distinto de instalado y apagado. La pantalla dice cosas diferentes.
    */
    assert.strictEqual(social.estadoRealDelWorker(null), null);
    assert.strictEqual(social.estadoRealDelWorker(undefined), null);
  },

  'un latido con fecha ilegible cuenta como apagado': () => {
    /*
      Lo prudente. Si no se puede saber cuándo habló, no se puede afirmar que
      esté prendido — y afirmarlo es justamente el error que se está
      arreglando.
    */
    const worker = social.estadoRealDelWorker({
      codigo: 'windows-local',
      estado: 'online',
      detalle: '{}',
      ultimo_heartbeat_en: 'cualquier cosa',
    });

    assert.strictEqual(worker.estado, 'offline');
  },
};
