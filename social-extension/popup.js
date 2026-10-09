/**
 * La ventanita de la extensión.
 *
 * Sigue sin tener ni un campo técnico para completar (servidor, clave,
 * intervalo): eso se resuelve solo al vincular desde el panel. Lo que suma la
 * versión 2 son controles para operar: pausar, probar la sesión, trabajar ya,
 * y ver de un vistazo cuánto publicó hoy.
 */

const $ = (id) => document.getElementById(id);
const enviar = (mensaje) =>
  new Promise((resolver) => chrome.runtime.sendMessage(mensaje, (r) => resolver(r)));

const hace = (ms) => {
  if (!ms) return '—';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return `hace ${Math.round(s / 3600)} h`;
};

const escapar = (texto) =>
  String(texto).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);

function pintarEstado(clase, titulo, ayuda) {
  $('estado').className = `estado ${clase}`;
  $('texto').textContent = titulo;
  $('ayuda').textContent = ayuda;
}

async function refrescar() {
  const estado = await enviar({ tipo: 'estado' });
  if (!estado) {
    pintarEstado(
      'mal',
      'La extensión no responde',
      'Desactivala y volvé a activarla en chrome://extensions.'
    );
    return;
  }

  $('version').textContent = `v${estado.version || '2'}`;
  const vinculada = estado.vinculada;
  for (const id of ['hoy', 'bloqueAcciones', 'bloqueOpciones']) {
    $(id).classList.toggle('oculto', !vinculada);
  }
  $('desvincular').classList.toggle('oculto', !vinculada);

  if (!vinculada) {
    pintarEstado(
      'falta',
      'Falta vincularla con tu panel',
      'Abrí Modo Sabor → Social y apretá «Conectar mis grupos». Se vincula sola.'
    );
  } else if (estado.pausada) {
    pintarEstado(
      'pausa',
      'Pausada',
      'Sigue conectada con el panel, pero no publica nada hasta que la reanudes.'
    );
  } else if (estado.ultimoError) {
    pintarEstado('mal', 'Conectada, pero lo último falló', 'Mirá el detalle abajo.');
  } else {
    pintarEstado(
      'bien',
      estado.trabajando ? 'Publicando…' : 'Conectada y trabajando',
      'Publica en tus grupos cuando el panel se lo pide, con texto y fotos, usando tu sesión de Facebook.'
    );
  }

  $('error').classList.toggle('oculto', !estado.ultimoError);
  if (estado.ultimoError) {
    $('error').innerHTML =
      `${escapar(estado.ultimoError)} <a href="#" id="limpiar" style="color:#b42318;font-weight:600">Ocultar</a>`;
    $('limpiar').onclick = async (evento) => {
      evento.preventDefault();
      await enviar({ tipo: 'limpiarError' });
      refrescar();
    };
  }

  $('publicadas').textContent = estado.hoy?.publicadas || 0;
  $('fallidas').textContent = estado.hoy?.fallidas || 0;
  $('contacto').textContent = hace(estado.ultimo);

  $('pausar').textContent = estado.pausada ? '▶ Reanudar publicaciones' : '⏸ Pausar publicaciones';
  $('pausar').dataset.pausada = estado.pausada ? '1' : '';

  $('optVerPestana').classList.toggle('on', Boolean(estado.opciones?.verPestana));
  $('optAvisos').classList.toggle('on', Boolean(estado.opciones?.avisos));

  $('servidor').textContent = estado.servidor ? new URL(estado.servidor).host : '';
  $('diario').innerHTML = estado.diario?.length
    ? estado.diario.map((linea) => `<div>${escapar(linea)}</div>`).join('')
    : 'Todavía nada.';
}

/** Deshabilita el botón mientras corre la acción, y vuelve a pintar al terminar. */
async function conEspera(boton, accion) {
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Un momento…';
  try {
    return await accion();
  } finally {
    boton.disabled = false;
    boton.textContent = texto;
    refrescar();
  }
}

$('pausar').onclick = () =>
  conEspera($('pausar'), () => enviar({ tipo: 'pausar', valor: !$('pausar').dataset.pausada }));

$('trabajar').onclick = () =>
  conEspera($('trabajar'), async () => {
    const r = await enviar({ tipo: 'trabajarAhora' });
    if (r && !r.ok && r.motivo) $('ayuda').textContent = r.motivo;
  });

$('probar').onclick = () =>
  conEspera($('probar'), async () => {
    const r = await enviar({ tipo: 'probarSesion' });
    if (r?.ok) {
      pintarEstado(
        r.haySesion ? 'bien' : 'mal',
        r.haySesion ? 'Sesión de Facebook activa' : 'No hay sesión de Facebook',
        r.haySesion
          ? `${r.identidad ? `${r.identidad}. ` : ''}Lista para publicar.`
          : 'Iniciá sesión en Facebook en este Chrome y volvé a probar.'
      );
    }
    return r;
  });

$('panel').onclick = async () => {
  const estado = await enviar({ tipo: 'estado' });
  const base = estado?.servidor ? new URL(estado.servidor).origin : 'https://www.modosabor.com.ar';
  chrome.tabs.create({ url: `${base}/social` });
};

$('facebook').onclick = () => chrome.tabs.create({ url: 'https://www.facebook.com/groups/feed/' });

for (const [id, clave] of [
  ['optVerPestana', 'verPestana'],
  ['optAvisos', 'avisos'],
]) {
  $(id).onclick = async () => {
    await enviar({ tipo: 'opcion', clave, valor: !$(id).classList.contains('on') });
    refrescar();
  };
}

$('desvincular').onclick = async (evento) => {
  evento.preventDefault();
  if (!confirm('¿Desvincular esta PC del panel? Deja de publicar hasta que la vuelvas a conectar.'))
    return;
  await enviar({ tipo: 'desvincular' });
  refrescar();
};

refrescar();
setInterval(refrescar, 4000);
