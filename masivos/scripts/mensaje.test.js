const assert = require('node:assert/strict');
const { armarMensaje, primerNombre, normalizarSegmento } = require('../mensaje');

const config = {
  SALUDOS: ['¡Hola{NOMBRE}!'],
  CIERRES: ['¡Te esperamos!'],
  FOOTER_BAJA: '_Respondé BAJA y no te mando más promos._',
};

// El pie de baja configurado se agrega al final de cada promo.
assert.equal(
  armarMensaje('Hoy milanesa.', 'Ana Pérez', config),
  '¡Hola Ana!\n\nHoy milanesa.\n\n¡Te esperamos!\n\n_Respondé BAJA y no te mando más promos._'
);

// Sin pie configurado no se agrega nada.
assert.equal(
  armarMensaje('Hoy milanesa.', 'Ana', { ...config, FOOTER_BAJA: '' }),
  '¡Hola Ana!\n\nHoy milanesa.\n\n¡Te esperamos!'
);

// Las variables viejas sin dato nunca le llegan al cliente con llaves.
const conVariablesViejas = armarMensaje(
  '{SALUDO} Tu último pedido: {ULTIMO_PEDIDO}. Menú: {MENU_LINK}',
  'Ana',
  config
);
assert.doesNotMatch(conVariablesViejas, /\{|\}/);

// Nombres genéricos o teléfonos no se usan como nombre.
assert.equal(primerNombre('Sin nombre'), '');
assert.equal(primerNombre('Contacto WhatsApp'), '');
assert.equal(primerNombre('+54 9 2614 70-6017'), '');
assert.equal(primerNombre('Juan Carlos'), 'Juan');

// "todos" es la base completa, no un segmento.
assert.equal(normalizarSegmento('todos'), '');
assert.equal(normalizarSegmento(''), '');
assert.equal(normalizarSegmento(undefined), '');
assert.equal(normalizarSegmento('activo'), 'activo');
assert.equal(normalizarSegmento('grupo:abc'), 'grupo:abc');

// El saludo respeta la hora: nada de 'buen día' de noche.
{
  const { saludosParaHora } = require('../mensaje');
  const lista = ['¡Hola{NOMBRE}! 👋', '¡Hola{NOMBRE}, buen día! 🌞', '¡Buenas noches{NOMBRE}!'];
  assert.ok(!saludosParaHora(lista, 23).some((s) => /buen día/.test(s)));
  assert.ok(saludosParaHora(lista, 9).some((s) => /buen día/.test(s)));
  assert.ok(!saludosParaHora(lista, 9).some((s) => /noches/.test(s)));
  assert.deepEqual(saludosParaHora(['¡Hola{NOMBRE}, buen día!'], 23), ['¡Hola{NOMBRE}, buen día!']);
}

console.log('mensaje y segmentos: OK');
