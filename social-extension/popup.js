/**
 * La ventanita de la extensión.
 *
 * No tiene ni un campo para completar, y es a propósito: la versión anterior
 * pedía una API Key, una URL y un intervalo, y cuando uno de esos quedaba mal
 * no había ningún error — todo se quedaba quieto sin decir por qué.
 *
 * Acá sólo se muestra si está conectada, y si no lo está, qué hacer.
 */

const caja = document.getElementById('estado');
const texto = document.getElementById('texto');
const ayuda = document.getElementById('ayuda');
const detalle = document.getElementById('detalle');

const hace = (ms) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'hace unos segundos';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `hace ${Math.round(s / 3600)} h`;
};

chrome.runtime.sendMessage({ tipo: 'estado' }, (estado) => {
  if (!estado) {
    caja.className = 'estado mal';
    texto.textContent = 'La extensión no responde';
    ayuda.textContent = 'Probá desactivarla y volver a activarla desde chrome://extensions.';
    return;
  }

  if (!estado.vinculada) {
    caja.className = 'estado falta';
    texto.textContent = 'Falta vincularla con tu panel';
    ayuda.innerHTML =
      'Abrí <b>Modo Sabor → Social</b> y apretá <b>«Conectar mis grupos»</b>. ' +
      'Se vincula sola: no hay nada que copiar acá.';
    return;
  }

  /*
    Vinculada pero con un error guardado: el caso más importante de los tres.
    Es la situación en la que antes uno se quedaba esperando sin enterarse de
    nada.
  */
  if (estado.ultimoError) {
    caja.className = 'estado mal';
    texto.textContent = 'Vinculada, pero algo falló';
    ayuda.textContent = estado.ultimoError;
  } else {
    caja.className = 'estado bien';
    texto.textContent = 'Conectada y trabajando';
    ayuda.textContent =
      'Publica en tus grupos cuando el panel se lo pide, usando tu sesión de Facebook. ' +
      'No hace falta que dejes nada abierto.';
  }

  detalle.textContent = estado.ultimo
    ? `Último contacto con el panel: ${hace(estado.ultimo)}`
    : 'Todavía no habló con el panel.';

  /*
    El diario de lo último que hizo.

    Sirve para no tener que adivinar. Antes, la única forma de saber si estaba
    trabajando era abrir la consola de Chrome — algo que no le vamos a pedir a
    nadie.
  */
  if (estado.diario?.length) {
    const lista = document.createElement('div');
    lista.style.cssText =
      'margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b;line-height:1.6;max-height:170px;overflow:auto';
    lista.innerHTML =
      '<b style="color:#0f172a;display:block;margin-bottom:6px">Lo último que hizo</b>' +
      estado.diario
        .map(
          (l) =>
            `<div>${l.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</div>`
        )
        .join('');
    document.body.appendChild(lista);
  }
});
