import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[AppErrorBoundary]', error, info);
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
              className="rounded-2xl bg-primary-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-primary-100"
            >
              Recargar sistema
            </button>
          </div>
        </div>
      </div>
    );
  }
}
