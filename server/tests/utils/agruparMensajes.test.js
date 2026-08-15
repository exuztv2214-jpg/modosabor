const assert = require('assert');
const { crearAgrupadorMensajes } = require('../../services/agruparMensajes');

async function run() {
  const llamadas = [];
  const agrupador = crearAgrupadorMensajes({
    procesar: async (mensaje) => {
      llamadas.push(mensaje);
      return 'ok';
    },
    obtenerClave: (mensaje) => mensaje.telefono,
    combinar: (mensajes) => ({
      telefono: mensajes[0].telefono,
      texto: mensajes.map((mensaje) => mensaje.texto).join('\n'),
    }),
    maxMs: 80,
  });

  const resultados = await Promise.all([
    agrupador.agregar({ telefono: '111', texto: 'hola' }, 20),
    agrupador.agregar({ telefono: '111', texto: 'quiero dos napos' }, 20),
    agrupador.agregar({ telefono: '111', texto: 'una sin jamón' }, 20),
  ]);

  assert.deepStrictEqual(resultados, ['ok', 'ok', 'ok']);
  assert.strictEqual(llamadas.length, 1);
  assert.strictEqual(llamadas[0].texto, 'hola\nquiero dos napos\nuna sin jamón');

  console.log('agruparMensajes.test.js OK');
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
