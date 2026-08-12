function parseJson(value, fieldName) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${fieldName} no es JSON valido: ${error.message}`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAgentOrderPayload(body) {
  if (!isPlainObject(body)) return {};
  let payload;
  if (isPlainObject(body.pedido_json_texto)) payload = body.pedido_json_texto;
  if (typeof body.pedido_json_texto === 'string') {
    payload = parseJson(body.pedido_json_texto, 'pedido_json_texto');
  }
  if (!payload && isPlainObject(body.pedido_json)) payload = body.pedido_json;
  if (typeof body.pedido_json === 'string') return parseJson(body.pedido_json, 'pedido_json');
  payload ||= body;

  /*
    Los modelos suelen llamar a este dato simplemente `direccion`, mientras
    que el dominio de pedidos usa `cliente_direccion`. Aceptar el alias en la
    frontera evita rechazar un delivery correctamente confirmado por la IA.
  */
  if (!payload.cliente_direccion && payload.direccion) {
    payload = { ...payload, cliente_direccion: payload.direccion };
  }

  return payload;
}

module.exports = { normalizeAgentOrderPayload };
