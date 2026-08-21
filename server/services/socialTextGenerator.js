const { conversar } = require('./iaProveedor');

/**
 * La redacción social usa el mismo proveedor principal que el asistente. Así
 * NVIDIA (u otro proveedor elegido en Configuración) no se bifurca con una
 * clave de Gemini escondida en un módulo aparte.
 */
async function generarTextoSocial(tema) {
  const pedido = String(tema || '')
    .trim()
    .slice(0, 1200);
  if (!pedido) throw new Error('Indicá el tema de la publicación');
  const resultado = await conversar({
    sistema:
      'Sos Chispita, community manager de Modo Sabor en Monteros, Tucumán. ' +
      'Redactás textos claros, cercanos y honestos. Nunca inventes precios, descuentos, horarios ni productos. ' +
      'Devolvé sólo una publicación lista para Facebook e Instagram, de hasta 400 caracteres.',
    mensajes: [{ rol: 'usuario', texto: `Prepará una publicación sobre: ${pedido}` }],
  });
  const texto = String(resultado?.texto || '').trim();
  if (!texto) throw new Error('La IA no devolvió texto para la publicación');
  return texto;
}

module.exports = { generarTextoSocial };
