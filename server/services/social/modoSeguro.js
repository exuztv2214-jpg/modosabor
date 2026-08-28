/**
 * El modo seguro: una publicación, un solo lugar.
 *
 * ── Para qué está ──────────────────────────────────────────────────────────
 *
 * La primera vez que este sistema publica algo, publica en la página real de
 * un negocio real. Si el texto sale cortado, la foto sale rotada o el formato
 * no era el que se creía, conviene que eso pase en un lugar y no en veintisiete
 * grupos a la vez — porque borrar veintisiete publicaciones a mano es una tarde.
 *
 * ── Por qué esto vive en su propio archivo ─────────────────────────────────
 *
 * Estaba escrito adentro de `createCampaign`, entre la validación de formatos
 * y el armado de la campaña. Ahí no se podía probar sin levantar una base con
 * campañas, destinos y una identidad conectada, así que no se probó nunca.
 *
 * Es una decisión de tres variables y ninguna sale de la base. Sacarla afuera
 * la vuelve una función que se prueba en un milisegundo, y de paso deja que la
 * pantalla use exactamente la misma regla que el servidor: si divergen, el
 * botón deja publicar algo que después el servidor rechaza.
 */

/*
  El texto es uno solo, y dice dónde está la perilla.

  El anterior decía "Modo de prueba: elegí manualmente un único destino" y
  terminaba ahí. Quien lo leía no había prendido nada —venía prendido de
  fábrica— y no tenía forma de encontrar el interruptor, porque no estaba en
  ninguna pantalla. Un error que no dice cómo salir del error es un cartel de
  "no".
*/
const MOTIVO =
  'El modo seguro deja publicar en un solo lugar. Dejá un destino solo, ' +
  'o apagá «Modo seguro» en Más opciones del compositor.';

/**
 * ¿El modo seguro frena esta publicación? Devuelve el motivo, o `''`.
 *
 * @param {boolean} modoSeguro     Si está prendido.
 * @param {boolean} ensayo         Un ensayo no publica nada.
 * @param {number}  cantidadConjuntos  Conjuntos elegidos: cada uno son varios.
 * @param {number}  cantidadDestinos   Destinos sueltos elegidos.
 */
function porQueFrenaElModoSeguro({
  modoSeguro = false,
  ensayo = false,
  cantidadConjuntos = 0,
  cantidadDestinos = 0,
} = {}) {
  if (!modoSeguro) return '';

  /*
    El ensayo queda afuera, y no es una excepción cómoda: el ensayo recorre
    todo y no publica nada. Limitarlo a un destino sería impedir justamente lo
    que sirve mirar antes de publicar de verdad — cómo queda el reparto entre
    veintisiete grupos, cuáles quedan afuera por las reglas y cuáles por el
    cupo del día.
  */
  if (ensayo) return '';

  /*
    Un conjunto frena aunque tenga un solo destino adentro.

    Los conjuntos cambian: hoy tiene uno, la semana que viene alguien le agrega
    seis. Si el seguro contara los de adentro, dejaría pasar el conjunto hoy y
    lo frenaría el martes, sin que nadie haya tocado la publicación. Un seguro
    que a veces sí y a veces no es peor que ninguno.
  */
  if (Number(cantidadConjuntos) > 0) return MOTIVO;

  return Number(cantidadDestinos) === 1 ? '' : MOTIVO;
}

module.exports = { porQueFrenaElModoSeguro, MOTIVO };
