'use strict';

// Cruce de los pedidos del sistema Modo Sabor con los contactos de WhatsApp.
//
// WhatsApp guarda el teléfono como 549 + área + número (13 dígitos). En los
// pedidos se escribe a mano: "3863412345", "03863-15-412345", "412345", etc.
// Todo se lleva al número nacional de 10 dígitos (área + abonado). Un cruce que
// no es único se descarta: es mejor no asignar un pedido que asignarlo mal.

function digitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

// Número nacional de 10 dígitos de un teléfono argentino de WhatsApp, o ''.
function nacionalWhatsApp(telefono) {
  let d = digitos(telefono);
  if (!d.startsWith('54')) return '';
  d = d.slice(2);
  if (d.length === 11 && d.startsWith('9')) d = d.slice(1);
  return d.length === 10 ? d : '';
}

// Formas nacionales posibles de un teléfono cargado a mano en un pedido.
// Devuelve { candidatos: [10 dígitos...], sufijo: 'dígitos locales' | '' }.
function formasPedido(telefono) {
  let d = digitos(telefono);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54') && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d.startsWith('9')) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) return { candidatos: [d], sufijo: '' };
  if (d.length === 12) {
    // "15" del celular metido después del código de área (2, 3 o 4 dígitos).
    const candidatos = [2, 3, 4]
      .filter((k) => d.slice(k, k + 2) === '15')
      .map((k) => d.slice(0, k) + d.slice(k + 2));
    return { candidatos, sufijo: '' };
  }
  if (d.length >= 6 && d.length <= 8) return { candidatos: [], sufijo: d };
  return { candidatos: [], sufijo: '' };
}

// contactos: [{ numero, telefono }] de Masivos. pedidos: [{ telefono, pedidos, ultimoPedido }].
// Devuelve Map numero -> { pedidos, ultimoPedido, nombre, fechas }.
function cruzarPedidos(contactos, pedidos) {
  const porNacional = new Map();
  for (const c of contactos || []) {
    const nacional = nacionalWhatsApp(c && c.telefono);
    if (!nacional) continue;
    if (!porNacional.has(nacional)) porNacional.set(nacional, []);
    porNacional.get(nacional).push(c.numero);
  }
  const nacionales = [...porNacional.keys()];
  const resultado = new Map();
  for (const p of pedidos || []) {
    const { candidatos, sufijo } = formasPedido(p && p.telefono);
    let coincidencias = [...new Set(candidatos.flatMap((n) => porNacional.get(n) || []))];
    if (!coincidencias.length && sufijo) {
      coincidencias = nacionales
        .filter((n) => n.endsWith(sufijo))
        .flatMap((n) => porNacional.get(n));
    }
    if (coincidencias.length !== 1) continue;
    const numero = coincidencias[0];
    const previo = resultado.get(numero) || {
      pedidos: 0,
      ultimoPedido: null,
      nombre: '',
      fechas: [],
    };
    const nombre = String((p && p.nombre) || '').trim();
    resultado.set(numero, {
      pedidos: previo.pedidos + Number(p.pedidos || 0),
      ultimoPedido: [previo.ultimoPedido, p.ultimoPedido].filter(Boolean).sort().pop() || null,
      // Nombre con el que pidió (sirve cuando WhatsApp no tiene uno).
      nombre: previo.nombre || (/\p{L}/u.test(nombre) ? nombre : ''),
      // Días con pedido: sirven para ver quién pidió después de recibir una promo.
      fechas: [...new Set([...previo.fechas, ...(Array.isArray(p.fechas) ? p.fechas : [])])].sort(),
    });
  }
  return resultado;
}

module.exports = { nacionalWhatsApp, formasPedido, cruzarPedidos };
