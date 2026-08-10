import { useEffect, useState } from 'react';

import api from '../../lib/api.js';
import ActionDialog from '../../components/ActionDialog.jsx';

/**
 * Sacar un producto de circulación.
 *
 * ── Lo que decía antes ─────────────────────────────────────────────────────
 *
 *     "El producto se quitará del sistema y dejará de estar disponible
 *      para venta."
 *
 * Y el botón borraba de verdad. Con eso se iban en cascada la receta del plato
 * —qué insumos lleva y en qué cantidad— y su historial en el menú del día.
 * Alguien que sólo quería dejar de vender algo leía ese cartel y apretaba
 * tranquilo.
 *
 * ── Lo que hace ahora ──────────────────────────────────────────────────────
 *
 * Lo normal es dar de baja: el plato deja de venderse y la receta queda
 * esperando, que en un restaurante con menú del día es lo que uno quiere —los
 * platos vuelven—.
 *
 * Eliminar del todo sigue existiendo, porque un producto cargado por error no
 * tiene por qué quedar dando vueltas, pero antes de ofrecerlo se le pregunta al
 * servidor qué se lleva puesto y se dice con números.
 */
export default function DeleteDialog({ deleteDialog, onConfirm, onClose }) {
  const [dependencias, setDependencias] = useState(null);
  const [definitivo, setDefinitivo] = useState(false);

  useEffect(() => {
    if (!deleteDialog?.id) {
      setDependencias(null);
      setDefinitivo(false);
      return;
    }
    let vigente = true;
    api
      .get(`/productos/${deleteDialog.id}/dependencias`)
      .then((datos) => {
        if (vigente) setDependencias(datos);
      })
      .catch(() => {
        // Si no se puede consultar, se sigue mostrando la baja —que es
        // inofensiva— y no se ofrece eliminar a ciegas.
        if (vigente) setDependencias({ error: true });
      });
    return () => {
      vigente = false;
    };
  }, [deleteDialog?.id]);

  const receta = Number(dependencias?.receta || 0);
  const menuDia = Number(dependencias?.menuDia || 0);
  const vendido = Number(dependencias?.vendido || 0);
  const seSabe = dependencias && !dependencias.error;

  const seVaAPerder = [
    receta > 0 && `la receta con sus ${receta} ${receta === 1 ? 'insumo' : 'insumos'}`,
    menuDia > 0 && `${menuDia} ${menuDia === 1 ? 'día' : 'días'} de historial del menú`,
  ].filter(Boolean);

  const descripcion = definitivo
    ? seVaAPerder.length
      ? `Se borra para siempre, y con él ${seVaAPerder.join(' y ')}. Eso no se puede recuperar.`
      : 'Se borra para siempre. No tiene receta ni historial cargado, así que no se pierde nada más.'
    : 'Deja de venderse y desaparece de la carta. La receta y el historial quedan guardados, así que lo podés volver a activar cuando quieras.';

  return (
    <ActionDialog
      open={Boolean(deleteDialog)}
      title={
        deleteDialog ? `${definitivo ? 'Eliminar' : 'Dar de baja'} ${deleteDialog.nombre}` : ''
      }
      description={descripcion}
      confirmLabel={definitivo ? 'Eliminar para siempre' : 'Dar de baja'}
      cancelLabel="Cancelar"
      tone={definitivo ? 'danger' : 'warning'}
      onConfirm={() => onConfirm(definitivo)}
      onClose={onClose}
    >
      {/*
        La opción de borrar del todo va acá abajo y no como botón principal a
        propósito: es la que no tiene vuelta atrás, y en el noventa por ciento
        de los casos lo que se quiere es la otra.
      */}
      {seSabe && !definitivo ? (
        <button
          type="button"
          onClick={() => setDefinitivo(true)}
          className="mt-4 text-[12px] font-medium text-gray-400 underline decoration-gray-300 underline-offset-2 transition hover:text-danger-600"
        >
          {vendido > 0
            ? `Prefiero eliminarlo del todo (se vendió ${vendido} ${vendido === 1 ? 'vez' : 'veces'})`
            : 'Prefiero eliminarlo del todo'}
        </button>
      ) : null}

      {definitivo ? (
        <button
          type="button"
          onClick={() => setDefinitivo(false)}
          className="mt-4 text-[12px] font-medium text-gray-400 underline decoration-gray-300 underline-offset-2 transition hover:text-gray-700"
        >
          Mejor sólo darlo de baja
        </button>
      ) : null}
    </ActionDialog>
  );
}
