import { useEffect, useRef } from 'react';

/**
 * Cierra un modal con la tecla Escape.
 *
 * Los modales del panel se cerraban sólo con el clic en el fondo o con la X.
 * Con el teclado no había forma de salir: para quien opera la caja sin soltar
 * el teclado, o para un lector de pantalla, el modal era una trampa.
 *
 * Se escucha en `keydown` de `document` porque el foco puede estar en
 * cualquier control de adentro del modal.
 *
 * @param {boolean} activo  Si el modal está abierto.
 * @param {() => void} alCerrar
 */
export function useCerrarConEscape(activo, alCerrar) {
  /*
    La callback se guarda en un ref para que el efecto no dependa de su
    identidad. Sin esto, cada módulo que pasara una función declarada en el
    cuerpo del componente —que es el caso normal— re-suscribiría el listener
    en cada render, y encima eslint exigiría memoizarla en todos lados.
  */
  const refCerrar = useRef(alCerrar);
  useEffect(() => {
    refCerrar.current = alCerrar;
  }, [alCerrar]);

  useEffect(() => {
    if (!activo) return undefined;

    const manejar = (evento) => {
      if (evento.key === 'Escape') refCerrar.current?.();
    };

    document.addEventListener('keydown', manejar);
    return () => document.removeEventListener('keydown', manejar);
  }, [activo]);
}

/**
 * Handler para el fondo del modal: cierra sólo si el clic fue en el fondo y
 * no en el contenido.
 *
 * Reemplaza al par `onClick={cerrar}` en el fondo + `onClick={e =>
 * e.stopPropagation()}` en el hijo. Ese `stopPropagation` sobre un elemento
 * no interactivo (un `<form>` o un `<div>`) era lo que disparaba el error de
 * eslint `jsx-a11y/no-noninteractive-element-interactions`, y además obligaba
 * a acordarse de ponerlo en cada modal nuevo.
 *
 * @param {() => void} alCerrar
 */
export function fondoModal(alCerrar) {
  return (evento) => {
    if (evento.target === evento.currentTarget) alCerrar();
  };
}
