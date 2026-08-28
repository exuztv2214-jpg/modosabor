/**
 * Las fotos de perfil de cada cuenta.
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 *
 * La vista previa mostraba un círculo de color con dos letras. En Metricool
 * —y en Facebook, que es lo que la vista previa promete imitar— ahí va la foto
 * real de la página. La diferencia no es estética: la vista previa existe para
 * contestar "¿cómo va a salir esto?", y una publicación con las iniciales
 * "MO" en un círculo rojo no se parece a lo que la gente va a ver.
 *
 * Con dos cuentas de Facebook —el Perfil y la Fan Page— es además la única
 * forma rápida de saber cuál está seleccionada.
 *
 * ── Por qué se baja el archivo en vez de guardar la URL ────────────────────
 *
 * Instagram devuelve `profile_picture_url`: una URL **firmada** del CDN de
 * Meta que vence en días. Guardarla en la base significa que la foto anda
 * durante un tiempo y después, sin que nadie toque nada, las vistas previas
 * empiezan a salir rotas. Es la peor clase de error: aparece tarde, lejos del
 * cambio que lo causó.
 *
 * Facebook sí tiene una URL estable (`graph.facebook.com/{id}/picture`), pero
 * pide token para páginas que no son públicas, y el token no puede viajar al
 * navegador.
 *
 * Bajar el archivo una vez resuelve las dos cosas: queda servido desde
 * `/uploads`, que ya es público y no necesita autenticación, y no vence.
 *
 * ── Por qué nunca tira el error para arriba ────────────────────────────────
 *
 * Una foto que no se pudo bajar no puede impedir que la cuenta quede
 * conectada. La conexión es lo importante; la foto es decoración. Si falla,
 * queda la inicial de antes.
 */
const fs = require('fs');
const path = require('path');
const { uploadsDir } = require('../../utils/storagePaths');
const { desencriptar } = require('../../utils/encryptConfig');

const VERSION = process.env.FACEBOOK_API_VERSION || 'v25.0';
const GRAPH = `https://graph.facebook.com/${VERSION}`;

/* Dónde viven. Bajo uploads porque esa carpeta ya se sirve sin autenticación. */
const CARPETA = path.join(uploadsDir, 'social-avatares');

/*
  Un archivo por destino, no por página.

  Un destino de Instagram y el de su Fan Page salen de la misma conexión pero
  tienen fotos distintas, y en el compositor aparecen uno al lado del otro.
*/
const archivoDe = (destinoId) => path.join(CARPETA, `${Number(destinoId)}.jpg`);
const urlPublica = (destinoId) => `/uploads/social-avatares/${Number(destinoId)}.jpg`;

/** La URL pública si el archivo existe; `null` si no. */
function avatarDelDestino(destinoId) {
  if (!destinoId) return null;
  try {
    return fs.existsSync(archivoDe(destinoId)) ? urlPublica(destinoId) : null;
  } catch {
    return null;
  }
}

/**
 * De dónde sale la foto de cada red.
 *
 * Son dos endpoints distintos porque son dos productos distintos. Facebook
 * tiene una arista `/picture` que con `redirect=0` devuelve JSON en vez de la
 * imagen; Instagram expone la URL como un campo más de la cuenta.
 */
async function urlDeLaFoto({ tipo, idExterno, token }) {
  const esInstagram = String(tipo).startsWith('instagram');

  const url = esInstagram
    ? `${GRAPH}/${idExterno}?fields=profile_picture_url&access_token=${encodeURIComponent(token)}`
    : `${GRAPH}/${idExterno}/picture?type=large&redirect=0&access_token=${encodeURIComponent(token)}`;

  const respuesta = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const datos = await respuesta.json().catch(() => null);

  if (!respuesta.ok || datos?.error) {
    throw new Error(datos?.error?.message || `Meta respondió ${respuesta.status}`);
  }

  return esInstagram ? datos?.profile_picture_url || '' : datos?.data?.url || '';
}

/**
 * Baja la foto de un destino y la deja guardada.
 *
 * Devuelve la URL pública, o `null` si no se pudo. Nunca tira.
 */
async function bajarAvatar({ destinoId, tipo, idExterno, tokenCifrado }) {
  /*
    Sin id no hay a quién pedirle la foto.

    No se chequea también `tokenCifrado` acá: `desencriptar` de un token vacío
    devuelve vacío y la línea de abajo lo corta igual. Dos guardas para lo
    mismo dan la impresión de que cubren casos distintos, y cuando una deja de
    hacer falta nadie se anima a sacarla.
  */
  if (!destinoId || !idExterno) return null;

  try {
    const token = desencriptar(tokenCifrado);
    if (!token) return null;

    const fuente = await urlDeLaFoto({ tipo, idExterno, token });
    if (!fuente) return null;

    const imagen = await fetch(fuente, { signal: AbortSignal.timeout(20000) });
    if (!imagen.ok) throw new Error(`La imagen respondió ${imagen.status}`);

    const bytes = Buffer.from(await imagen.arrayBuffer());

    /*
      Una foto de perfil pesa entre 5 y 60 KB. Menos de mil bytes no es una
      foto: es una página de error que respondió 200, que pasa cuando el CDN
      de Meta rechaza una URL vencida. Guardarla dejaría un archivo roto que
      además existe, y `avatarDelDestino` lo daría por bueno para siempre.
    */
    if (bytes.length < 1000) throw new Error('La respuesta no parece una imagen');

    fs.mkdirSync(CARPETA, { recursive: true });
    fs.writeFileSync(archivoDe(destinoId), bytes);

    return urlPublica(destinoId);
  } catch (error) {
    console.warn(`[social] no se pudo bajar la foto del destino ${destinoId}:`, error.message);
    return null;
  }
}

module.exports = { avatarDelDestino, bajarAvatar, CARPETA };
