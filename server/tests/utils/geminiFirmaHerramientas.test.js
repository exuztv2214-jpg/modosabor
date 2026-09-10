const assert = require('assert');
const { conversarConProveedor } = require('../../services/iaProveedor');

async function run() {
  const original = global.fetch;
  const proveedor = {
    id: 'prueba',
    nombre: 'Prueba',
    familia: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelo: 'prueba',
    clave: 'ficticia',
  };
  const parte = {
    functionCall: { name: 'consultar_menu', args: {} },
    thoughtSignature: 'firma-opaca-de-prueba',
  };
  let llamada = 0;
  try {
    global.fetch = async (_url, opts) => {
      llamada += 1;
      if (llamada === 2) {
        const cuerpo = JSON.parse(opts.body);
        assert.deepStrictEqual(cuerpo.contents[1].parts, [parte]);
      }
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts:
                  llamada === 1
                    ? [parte]
                    : [{ text: 'privado', thought: true }, { text: 'Menú disponible' }],
              },
            },
          ],
        }),
      };
    };
    const mensajes = [{ rol: 'usuario', texto: 'Qué hay' }];
    const primera = await conversarConProveedor({ sistema: 'Prueba', mensajes, proveedor });
    const segunda = await conversarConProveedor({
      sistema: 'Prueba',
      proveedor,
      mensajes: [
        ...mensajes,
        { rol: 'asistente', llamadas: primera.llamadas },
        { rol: 'herramienta', nombre: 'consultar_menu', resultado: '{}' },
      ],
    });
    assert.strictEqual(segunda.texto, 'Menú disponible');
  } finally {
    global.fetch = original;
  }
}
module.exports = { run };
