const { conversar } = require('./iaProveedor');

const MARCA_DETENER = Symbol('detener-motor-agente');

function detenerAgente(valor) {
  return { [MARCA_DETENER]: true, valor };
}

async function ejecutarAgente({
  sistema,
  mensajes,
  herramientas,
  ejecutar,
  maxVueltas = 6,
  onPaso,
  _conversar = conversar,
}) {
  const contexto = Array.isArray(mensajes) ? [...mensajes] : [];
  const uso = { entrada: 0, salida: 0 };

  for (let vuelta = 0; vuelta < maxVueltas; vuelta += 1) {
    const respuesta = await _conversar({ sistema, mensajes: contexto, herramientas });
    uso.entrada += Number(respuesta?.uso?.entrada || 0);
    uso.salida += Number(respuesta?.uso?.salida || 0);
    const llamadas = Array.isArray(respuesta.llamadas) ? respuesta.llamadas : [];
    if (!llamadas.length) {
      return { respuesta, mensajes: contexto, vueltas: vuelta + 1, agotado: false, uso };
    }

    contexto.push({ rol: 'asistente', texto: respuesta.texto, llamadas });
    for (const llamada of llamadas) {
      let resultado;
      let error = null;
      try {
        resultado = await ejecutar(llamada.nombre, llamada.argumentos);
      } catch (cause) {
        error = cause;
        resultado = { error: String(cause?.message || cause) };
      }

      await onPaso?.({ vuelta, llamada, resultado, error, respuesta });
      if (resultado?.[MARCA_DETENER]) {
        return {
          respuesta,
          mensajes: contexto,
          vueltas: vuelta + 1,
          agotado: false,
          detenido: resultado.valor,
          uso,
        };
      }

      contexto.push({
        rol: 'herramienta',
        id: llamada.id,
        nombre: llamada.nombre,
        resultado: JSON.stringify(resultado),
      });
    }
  }

  return { respuesta: null, mensajes: contexto, vueltas: maxVueltas, agotado: true, uso };
}

module.exports = { ejecutarAgente, detenerAgente };
