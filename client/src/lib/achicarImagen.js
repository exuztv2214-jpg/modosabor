/**
 * Achica una foto antes de mandarla al asistente.
 *
 * ── Por qué ────────────────────────────────────────────────────────────────
 *
 * Un celular saca fotos de 4 o 5 MB. Convertidas a base64 crecen un tercio más
 * y viajan enteras al proveedor de IA, que cobra por lo que recibe. Con la
 * conexión de un local, además, subir eso tarda una eternidad.
 *
 * Para leer un remito no hace falta esa resolución: con 1600 píxeles del lado
 * más largo se leen los renglones sin problema, y el archivo baja a unos pocos
 * cientos de kilobytes.
 *
 * ── Por qué JPEG y no el formato original ──────────────────────────────────
 *
 * Un PNG de una foto pesa varias veces más que el JPEG equivalente sin verse
 * mejor. Para texto impreso sobre papel, la compresión de JPEG no molesta.
 */

const LADO_MAXIMO = 1600;
const CALIDAD = 0.82;

export async function achicarImagen(archivo) {
  const dataUrlOriginal = await leerComoDataUrl(archivo);

  try {
    const imagen = await cargarImagen(dataUrlOriginal);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));

    // Ya es chica: reprocesarla sólo le quitaría calidad sin ganar nada.
    if (escala === 1 && dataUrlOriginal.length < 1_000_000) return dataUrlOriginal;

    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);

    return lienzo.toDataURL('image/jpeg', CALIDAD);
  } catch {
    // Si el navegador no pudo procesarla, se manda como vino: el servidor
    // rechaza la que sea demasiado pesada, así que no hay riesgo.
    return dataUrlOriginal;
  }
}

function leerComoDataUrl(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(String(lector.result || ''));
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo'));
    lector.readAsDataURL(archivo);
  });
}

function cargarImagen(dataUrl) {
  return new Promise((resolver, rechazar) => {
    const imagen = new Image();
    imagen.onload = () => resolver(imagen);
    imagen.onerror = () => rechazar(new Error('No se pudo abrir la imagen'));
    imagen.src = dataUrl;
  });
}

export default achicarImagen;
