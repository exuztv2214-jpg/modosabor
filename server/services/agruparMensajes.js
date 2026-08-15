function crearAgrupadorMensajes({ procesar, obtenerClave, combinar, maxMs = 8000 }) {
  const pendientes = new Map();

  function despachar(clave) {
    const grupo = pendientes.get(clave);
    if (!grupo) return;
    pendientes.delete(clave);
    clearTimeout(grupo.timer);
    Promise.resolve(procesar(combinar(grupo.mensajes)))
      .then((resultado) => grupo.esperas.forEach(({ resolve }) => resolve(resultado)))
      .catch((error) => grupo.esperas.forEach(({ reject }) => reject(error)));
  }

  function agregar(mensaje, demoraMs = 2000) {
    const clave = String(obtenerClave(mensaje) || 'desconocido');
    const ahora = Date.now();
    let grupo = pendientes.get(clave);
    if (!grupo) {
      grupo = { inicio: ahora, mensajes: [], esperas: [], timer: null };
      pendientes.set(clave, grupo);
    }
    grupo.mensajes.push(mensaje);

    const promesa = new Promise((resolve, reject) => grupo.esperas.push({ resolve, reject }));
    clearTimeout(grupo.timer);
    const restante = Math.max(0, Number(maxMs) - (ahora - grupo.inicio));
    const espera = Math.min(Math.max(0, Number(demoraMs) || 0), restante);
    grupo.timer = setTimeout(() => despachar(clave), espera);
    return promesa;
  }

  return { agregar, despachar, pendientes };
}

module.exports = { crearAgrupadorMensajes };
