'use strict';

// Armado del texto de cada promo. Separado de server.js para poder testearlo.

const NOMBRES_GENERICOS = ['Sin nombre', 'Contacto WhatsApp', 'Contacto importado'];

const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];

function primerNombre(nombre) {
  const limpio = (nombre || '').trim();
  if (NOMBRES_GENERICOS.includes(limpio)) return ''; // evita "¡Hola Sin!"
  if (!/\p{L}.*\p{L}/u.test(limpio)) return ''; // evita nombres tipo ".", ":)" o teléfonos
  return limpio.split(/\s+/)[0];
}

function armarMensaje(plantilla, nombre, config) {
  const saludoBase = azar(config.SALUDOS);
  const nombreCorto = primerNombre(nombre);
  const saludo = saludoBase.replace(/\{NOMBRE\}/gi, nombreCorto ? ` ${nombreCorto}` : '');
  const cuerpo = plantilla.trim();
  let mensaje = /\{SALUDO\}/i.test(cuerpo)
    ? cuerpo.replace(/\{SALUDO\}/gi, saludo)
    : `${saludo}\n\n${cuerpo}`;
  mensaje = mensaje.replace(/\{NOMBRE\}/gi, nombreCorto);
  // Variables que el editor ofreció en versiones anteriores y nunca tuvieron dato.
  mensaje = mensaje.replace(/\{(?:ULTIMO_PEDIDO|MENU_LINK)\}/gi, '');
  mensaje = `${mensaje}\n\n${azar(config.CIERRES)}`;
  const footer = String(config.FOOTER_BAJA || '').trim();
  if (footer) mensaje = `${mensaje}\n\n${footer}`;
  return mensaje
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// "todos" (o vacío) es la base completa habilitada, no un segmento automático.
function normalizarSegmento(segmento) {
  const valor = String(segmento || '').trim();
  return valor === 'todos' ? '' : valor;
}

module.exports = { azar, primerNombre, armarMensaje, normalizarSegmento };
