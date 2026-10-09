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

// Saludos que tienen sentido a esta hora: "buen día" a las 23 h queda mal.
// Los neutros ("¡Hola!", "¡Qué tal!") sirven siempre.
function saludosParaHora(saludos, hora) {
  const lista = Array.isArray(saludos) && saludos.length ? saludos : ['¡Hola{NOMBRE}! 👋'];
  const franja = hora >= 5 && hora < 13 ? 'manana' : hora >= 13 && hora < 20 ? 'tarde' : 'noche';
  const aptos = lista.filter((s) => {
    const t = String(s).toLowerCase();
    if (/buen d[ií]a|buenos d[ií]as|ma[nñ]ana/.test(t)) return franja === 'manana';
    if (/buenas tardes/.test(t)) return franja === 'tarde';
    if (/buenas noches/.test(t)) return franja === 'noche';
    return true;
  });
  return aptos.length ? aptos : lista;
}

function horaLocal() {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date())
  );
}

function armarMensaje(plantilla, nombre, config, hora = horaLocal()) {
  const saludoBase = azar(saludosParaHora(config.SALUDOS, hora));
  const nombreCorto = primerNombre(nombre);
  const saludo = saludoBase.replace(/\{NOMBRE\}/gi, nombreCorto ? ` ${nombreCorto}` : '');
  const cuerpo = plantilla.trim();
  let mensaje = /\{SALUDO\}/i.test(cuerpo)
    ? cuerpo.replace(/\{SALUDO\}/gi, saludo)
    : `${saludo}\n\n${cuerpo}`;
  mensaje = mensaje.replace(/\{NOMBRE\}/gi, nombreCorto);
  // Variables que el editor ofreció en versiones anteriores y nunca tuvieron dato.
  mensaje = mensaje.replace(/\{(?:ULTIMO_PEDIDO|MENU_LINK)\}/gi, '');
  // Cupón de la campaña: una línea propia, antes del enlace para pedir.
  const cupon = String(config.CUPON_TEXTO || '').trim();
  if (cupon) mensaje = `${mensaje}\n\n${cupon}`;
  // "Botón" de pedido: WhatsApp no muestra botones reales por esta conexión (sólo
  // por la API paga de Meta), así que va una línea con el enlace, que se toca igual.
  const url = String(config.LINK_PEDIDO_URL || '').trim();
  if (config.LINK_PEDIDO_ACTIVO !== false && url && !mensaje.includes(url)) {
    const texto = String(config.LINK_PEDIDO_TEXTO || '🛒 *Pedí ahora* 👉').trim();
    mensaje = `${mensaje}\n\n${texto} ${url}`;
  }
  mensaje = `${mensaje}\n\n${azar(config.CIERRES)}`;
  const footer = String(config.FOOTER_BAJA || '').trim();
  if (footer) mensaje = `${mensaje}\n\n${footer}`;
  return mensaje
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * La línea del cupón: «🎟️ Con el código *MS7KQ2P* tenés 10% off hasta el 12/10».
 * `vence` es AAAA-MM-DD.
 */
function lineaCupon({ codigo, tipo, valor, vence }) {
  if (!codigo) return '';
  const descuento =
    tipo === 'fijo'
      ? `$${Number(valor).toLocaleString('es-AR')} de descuento`
      : `${Number(valor)}% off`;
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(String(vence || ''))
    ? ` hasta el ${vence.slice(8, 10)}/${vence.slice(5, 7)}`
    : '';
  return `🎟️ Con el código *${codigo}* tenés ${descuento}${hasta}.`;
}

// "todos" (o vacío) es la base completa habilitada, no un segmento automático.
function normalizarSegmento(segmento) {
  const valor = String(segmento || '').trim();
  return valor === 'todos' ? '' : valor;
}

module.exports = {
  azar,
  primerNombre,
  armarMensaje,
  normalizarSegmento,
  saludosParaHora,
  lineaCupon,
};
