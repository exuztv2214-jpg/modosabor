/**
 * El puente entre el panel y la extensión.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Una página web no puede hablarle a una extensión, y una extensión no puede
 * leer lo que pasa adentro de una página. Este archivo corre en el medio: lo
 * inyecta Chrome en las páginas de Modo Sabor y puede hablar con las dos.
 *
 * Gracias a eso, vincular es apretar un botón en el panel. Nada de copiar
 * claves, ni de abrir la extensión, ni de pegar códigos.
 *
 * ── Por qué sólo escucha a nuestras páginas ────────────────────────────────
 *
 * En `manifest.json` este archivo está limitado a `localhost` y a
 * `modosabor.com.ar`. Aun así se comprueba el origen de cada mensaje: si mañana
 * alguien agrega un dominio a la lista sin pensarlo, o si una publicidad
 * incrustada manda un mensaje, no alcanza con estar en la página correcta.
 *
 * Sin esa comprobación, cualquier iframe de cualquier página nuestra podría
 * pedirle a la extensión que se vincule con **su** servidor — y desde ahí
 * mandarle publicaciones a tus grupos.
 */

const ORIGENES_PERMITIDOS = [
  /^https?:\/\/localhost(:\d+)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/i,
  /^https:\/\/(www\.)?modosabor\.com\.ar$/i,
];

const origenConfiable = (origen) => ORIGENES_PERMITIDOS.some((patron) => patron.test(origen));

/**
 * ¿La extensión sigue viva?
 *
 * ── El problema que resuelve ───────────────────────────────────────────────
 *
 * Cuando se recarga una extensión desde `chrome://extensions`, el código que
 * ya estaba inyectado en las pestañas abiertas **queda huérfano**: sigue
 * corriendo, pero la extensión a la que le hablaba ya no existe. Cualquier
 * `chrome.runtime.sendMessage` desde ahí revienta con "Extension context
 * invalidated", y el error se ve en la consola sin explicar nada.
 *
 * Pasa en cada actualización de la extensión, así que no es un caso raro: es
 * el caso de siempre mientras se está desarrollando.
 *
 * `chrome.runtime.id` desaparece cuando el contexto muere. Es la forma barata
 * de preguntarlo antes de hablar.
 */
const extensionViva = () => {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
};

/**
 * Manda un mensaje a la extensión sin explotar si ya no está.
 *
 * Cuando no está, se contesta con un motivo entendible en vez de dejar a la
 * página esperando una respuesta que no va a llegar. Esa espera muda era el
 * peor final posible: ni error ni resultado.
 */
function hablarConLaExtension(mensaje, alResponder) {
  if (!extensionViva()) {
    alResponder({
      ok: false,
      error: 'Se actualizó la extensión. Recargá esta página (F5) y probá de nuevo.',
    });
    return;
  }

  try {
    chrome.runtime.sendMessage(mensaje, (respuesta) => {
      /*
        `lastError` hay que leerlo siempre, aunque no se use: si no se lee,
        Chrome lo imprime solo en la consola como un error sin contexto.
      */
      const falla = chrome.runtime.lastError;
      if (falla) {
        alResponder({ ok: false, error: 'Recargá esta página (F5) y probá de nuevo.' });
        return;
      }
      alResponder(respuesta || {});
    });
  } catch {
    alResponder({
      ok: false,
      error: 'Se actualizó la extensión. Recargá esta página (F5) y probá de nuevo.',
    });
  }
}

window.addEventListener('message', (evento) => {
  /*
    `evento.source !== window` descarta los mensajes que vienen de un iframe.
    El panel se habla a sí mismo; nada de adentro de un marco tiene por qué
    vincular la extensión.
  */
  if (evento.source !== window) return;
  if (!origenConfiable(evento.origin)) return;

  const dato = evento.data;
  if (!dato || dato.canal !== 'modosabor-social') return;

  if (dato.tipo === 'vincular') {
    hablarConLaExtension(
      { tipo: 'vincular', servidor: dato.servidor, codigo: dato.codigo },
      (respuesta) => {
        /*
          La respuesta vuelve a la página por el mismo camino. Se manda al
          origen exacto y no a "*": un `*` se lo puede leer cualquier otro
          marco de la página.
        */
        window.postMessage(
          {
            canal: 'modosabor-social',
            tipo: 'vinculado',
            ok: Boolean(respuesta?.ok),
            error: respuesta?.error || '',
          },
          evento.origin
        );
      }
    );
    return;
  }

  if (dato.tipo === 'estado') {
    hablarConLaExtension({ tipo: 'estado' }, (respuesta) => {
      /*
        La respuesta tiene un tipo **distinto** al de la pregunta.

        Al principio contestaba `estado` a una pregunta `estado`: este mismo
        `addEventListener` escuchaba su propia respuesta, volvía a preguntar, y
        se armaba un bucle infinito que no paraba nunca. Se veía como una
        catarata de mensajes iguales y la pestaña quemando procesador.

        Con nombres distintos para la pregunta y la respuesta, el bucle no se
        puede armar aunque alguien agregue otro escucha mañana.
      */
      window.postMessage(
        { canal: 'modosabor-social', tipo: 'estado-respuesta', ...(respuesta || {}) },
        evento.origin
      );
    });
  }
});

/*
  Se avisa apenas carga la página.

  Sin esto, el panel no tiene forma de saber si la extensión está instalada, y
  la única manera de enterarse sería apretar el botón y esperar a que no pase
  nada — que es exactamente el problema que esta extensión viene a resolver.
*/
window.postMessage({ canal: 'modosabor-social', tipo: 'extension-presente' }, window.origin);
