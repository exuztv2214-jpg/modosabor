const assert = require('assert');
const { ejecutarAgente } = require('../../services/motorAgente');

async function run() {
  let llamadasModelo = 0;
  let ejecuciones = 0;
  const agotado = await ejecutarAgente({
    sistema: 'test',
    mensajes: [],
    herramientas: [],
    maxVueltas: 2,
    _conversar: async () => {
      llamadasModelo += 1;
      return {
        texto: '',
        llamadas: [{ id: String(llamadasModelo), nombre: 'leer', argumentos: {} }],
      };
    },
    ejecutar: async () => {
      ejecuciones += 1;
      return { ok: true };
    },
  });
  assert.strictEqual(agotado.agotado, true);
  assert.strictEqual(llamadasModelo, 2);
  assert.strictEqual(ejecuciones, 2);

  ejecuciones = 0;
  const directo = await ejecutarAgente({
    sistema: 'test',
    mensajes: [],
    herramientas: [],
    _conversar: async () => ({
      texto: 'listo',
      llamadas: [],
      uso: { entrada: 12, salida: 4 },
    }),
    ejecutar: async () => {
      ejecuciones += 1;
    },
  });
  assert.strictEqual(directo.respuesta.texto, 'listo');
  assert.strictEqual(ejecuciones, 0);
  assert.deepStrictEqual(directo.uso, { entrada: 12, salida: 4 });

  let pasos = 0;
  let vuelta = 0;
  const recuperado = await ejecutarAgente({
    sistema: 'test',
    mensajes: [],
    herramientas: [],
    _conversar: async ({ mensajes }) => {
      vuelta += 1;
      if (vuelta === 1) {
        return { texto: '', llamadas: [{ id: 'x', nombre: 'falla', argumentos: {} }] };
      }
      assert.match(mensajes.at(-1).resultado, /boom/);
      return { texto: 'recuperado', llamadas: [] };
    },
    ejecutar: async () => {
      throw new Error('boom');
    },
    onPaso: async () => {
      pasos += 1;
    },
  });
  assert.strictEqual(recuperado.respuesta.texto, 'recuperado');
  assert.strictEqual(pasos, 1);

  console.log('motorAgente.test.js OK');
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
