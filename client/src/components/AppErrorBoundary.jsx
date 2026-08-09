import React from 'react';

/**
 * ¿Es el error de "quedaste con la versión vieja abierta"?
 *
 * El sistema se parte en pedazos que se bajan cuando hacen falta, y cada uno
 * lleva un código en el nombre: `Operacion-UyuekIOu.js`. Al deployar, ese
 * código cambia. Pero una pestaña que ya estaba abierta se quedó con la lista
 * vieja en memoria —una aplicación de este tipo no vuelve a pedir el
 * index.html mientras corre—, así que al entrar a una pantalla que todavía no
 * había visitado pide un archivo que ya no existe.
 *
 * En la práctica: se deploya durante el servicio y a quien tenía el TPV
 * abierto le explota la primera pantalla nueva que toca. Recargar lo
 * soluciona, pero no tiene por qué enterarse.
 *
 * Cada navegador lo dice distinto, de ahí la lista.
 */
function esVersionVieja(error) {
  const mensaje = String(error?.message || '').toLowerCase();
  return (
    mensaje.includes('dynamically imported module') || // Chrome, Edge
    mensaje.includes('error loading dynamically') || // Firefox
    mensaje.includes('importing a module script failed') || // Safari
    mensaje.includes('failed to fetch dynamically') ||
    mensaje.includes('unable to preload css')
  );
}

/** Marca de que ya se recargó por este motivo en esta pestaña. */
const YA_RECARGUE = 'ms_recarga_por_version';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, recargando: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info);

    if (!esVersionVieja(error)) return;

    /*
      Se recarga una sola vez por pestaña. Si después de recargar vuelve a
      fallar, ya no es la versión vieja: puede ser que se cayó la red o que el
      archivo realmente no está. Recargar de nuevo en ese caso deja la pantalla
      parpadeando para siempre sin que nadie pueda leer qué pasó.
    */
    let yaRecargue = false;
    try {
      yaRecargue = window.sessionStorage.getItem(YA_RECARGUE) === '1';
      if (!yaRecargue) window.sessionStorage.setItem(YA_RECARGUE, '1');
    } catch {
      // Modo incógnito o almacenamiento bloqueado: sin memoria, no se
      // arriesga el bucle. Se muestra la pantalla de error y listo.
      return;
    }

    if (yaRecargue) return;

    this.setState({ recargando: true });
    window.location.reload();
  }

  handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    /*
      Mientras el navegador procesa la recarga sigue pintando. Sin esto se ve
      un parpadeo de la pantalla de error —con un mensaje técnico que no
      significa nada para quien está atendiendo— justo antes de que todo se
      recargue solo.
    */
    if (this.state.recargando) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
          <p className="text-sm font-semibold text-gray-500">Actualizando el sistema…</p>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
        <div className="w-full max-w-xl rounded-[32px] border border-red-100 bg-white p-8 shadow-xl">
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-red-500">
            Error del sistema
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-gray-900">
            Esta pantalla falló al cargar.
          </h1>
          <p className="mt-3 text-sm font-medium leading-6 text-gray-600">
            La aplicación encontró un problema inesperado. Podés recargar ahora y volver a intentar.
          </p>
          {this.state.error?.message ? (
            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600">
              {this.state.error.message}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-2xl bg-brand-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-brand-100"
            >
              Recargar sistema
            </button>
          </div>
        </div>
      </div>
    );
  }
}
