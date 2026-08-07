/**
 * Normalización de teléfonos argentinos para WhatsApp.
 *
 * ── Por qué esto merece su propio archivo ──────────────────────────────────
 *
 * Es el punto donde un envío masivo falla en silencio. WhatsApp no contesta
 * "ese número está mal escrito": el mensaje simplemente no llega, y con
 * ciento cincuenta destinatarios nadie se entera de cuáles se perdieron.
 *
 * El problema es que Argentina tiene una regla propia. Para llamar se marca
 * un 0 adelante y un 15 antes del número local; para WhatsApp hay que sacar
 * los dos y meter un 9 entre el código de país y el de área:
 *
 *     0381 15 555-4433   →   549 381 555 4433
 *
 * Y `clientes.telefono` lo carga el mostrador a mano, así que conviven todas
 * las variantes posibles: con 0, con 15, con guiones, con paréntesis, con
 * +54, con nada.
 *
 * ── La regla del 9 ─────────────────────────────────────────────────────────
 *
 * Los celulares argentinos necesitan el 9 y va DESPUÉS del 54, no en
 * cualquier lado: un `549` mal ubicado arma un número válido pero de otra
 * persona. Los fijos no llevan 9, pero un fijo no tiene WhatsApp, así que
 * asumir celular es lo correcto acá.
 */

/** Largo del número nacional argentino: área + abonado. */
const LARGO_NACIONAL = 10;

/**
 * Deja sólo dígitos y saca los prefijos de discado que no van en WhatsApp.
 *
 * Devuelve `null` si no se puede armar un número creíble. Devolver `null` en
 * vez de un número dudoso es deliberado: es preferible saltear un contacto
 * antes que escribirle a un desconocido.
 */
function normalizarTelefono(valor) {
  let n = String(valor || '').replace(/\D+/g, '');
  if (!n) return null;

  // Ceros de discado internacional: 0054, 00549.
  n = n.replace(/^0+/, (ceros) => (n.length - ceros.length >= LARGO_NACIONAL ? '' : ceros));

  if (n.startsWith('54')) {
    let resto = n.slice(2);
    // Si ya trae el 9 de móvil se saca, para volver a armarlo parejo abajo.
    if (resto.length === LARGO_NACIONAL + 1 && resto.startsWith('9')) resto = resto.slice(1);
    n = resto;
  }

  // 0 de larga distancia nacional: 0381...
  if (n.length > LARGO_NACIONAL && n.startsWith('0')) n = n.slice(1);

  /*
    El 15 es el prefijo de celular y va después del código de área, no al
    principio: 0381-15-5554433. Se saca sólo si el largo lo justifica, porque
    hay abonados que empiezan con 15 y no queremos mutilarlos.
  */
  if (n.length === LARGO_NACIONAL + 2) {
    for (const largoArea of [2, 3, 4]) {
      if (n.slice(largoArea, largoArea + 2) === '15') {
        const candidato = n.slice(0, largoArea) + n.slice(largoArea + 2);
        if (candidato.length === LARGO_NACIONAL) {
          n = candidato;
          break;
        }
      }
    }
  }

  if (n.length !== LARGO_NACIONAL) return null;
  // Ningún código de área argentino arranca en 0 ni en 1 salvo el 11 de CABA.
  if (n.startsWith('0')) return null;
  if (n.startsWith('1') && !n.startsWith('11')) return null;

  return `549${n}`;
}

/** Identificador que espera WhatsApp para un chat individual. */
function aJid(valor) {
  const n = normalizarTelefono(valor);
  return n ? `${n}@s.whatsapp.net` : null;
}

/** De un JID de vuelta al número, para guardar y comparar. */
function deJid(jid) {
  const n = String(jid || '')
    .split('@')[0]
    .split(':')[0];
  return /^\d{6,15}$/.test(n) ? n : null;
}

/** Para mostrar en pantalla: +54 9 381 555-4433 */
function formatearTelefono(valor) {
  const n = normalizarTelefono(valor);
  if (!n) return String(valor || '');
  const nacional = n.slice(3);
  const largoArea = nacional.startsWith('11') ? 2 : 3;
  const area = nacional.slice(0, largoArea);
  const abonado = nacional.slice(largoArea);
  return `+54 9 ${area} ${abonado.slice(0, -4)}-${abonado.slice(-4)}`;
}

module.exports = { normalizarTelefono, aJid, deJid, formatearTelefono, LARGO_NACIONAL };
