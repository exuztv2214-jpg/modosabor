'use strict';

// Señales de entrega para cuidar el número. WhatsApp no avisa los bloqueos: un
// mensaje que nunca pasa de un tilde es la única pista. Nada de esto es prueba
// (también pasa con teléfonos apagados o confirmaciones de lectura desactivadas),
// por eso sólo se marca y se omite de forma reversible; nunca se borra a nadie.

function diasEntre(desde, hasta) {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86400000);
}

// enviados: fechas YYYY-MM-DD de promos recibidas · respuestas: lista de respuestas
// acks: Set con los estados vistos ('enviado' | 'entregado' | 'leido') · hoy: YYYY-MM-DD
function senalesEntrega(enviados, respuestas, acks, hoy) {
  const estados = acks || new Set();
  const entregado = estados.has('entregado') || estados.has('leido');
  const leido = estados.has('leido');
  const ultimoEnvio = (enviados || []).slice().sort().pop();
  const respondio = (respuestas || []).length > 0;
  const dias = ultimoEnvio ? diasEntre(ultimoEnvio, hoy) : null;
  return {
    // 2+ promos, la última hace 2+ días (tiempo para que se entregue) y nunca se
    // vio una entrega ni una respuesta.
    sinEntrega: !respondio && !entregado && enviados.length >= 2 && dias != null && dias >= 2,
    // 3+ promos que llegaron pero nunca se leyeron, y nunca respondió.
    noLee: !respondio && entregado && !leido && enviados.length >= 3,
    entregado,
    leido,
  };
}

module.exports = { senalesEntrega };
