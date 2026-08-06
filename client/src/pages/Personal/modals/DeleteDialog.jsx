import ActionDialog from '../../../components/ActionDialog.jsx';

/**
 * La descripción anterior decía "conviene revisar luego usuarios, pagos o
 * delivery": no aclaraba qué se pierde ni ofrecía la alternativa.
 *
 * Dar de baja conserva el historial completo y es lo que se quiere casi
 * siempre; borrar es destructivo. Ahora el diálogo lo dice, y avisa aparte si
 * la persona todavía tiene plata sin liquidar.
 */
export function DeleteDialog({ open, item, onClose, onConfirm }) {
  const base =
    'Se borra su historial de sueldos, asistencia y reconocimientos. Si sólo dejó de trabajar, editá su ficha y apagá "Sigue trabajando acá": así se conserva todo.';

  const description =
    Number(item?.pendiente_total || 0) > 0
      ? `Esta persona todavía tiene saldo sin liquidar. ${base}`
      : base;

  return (
    <ActionDialog
      open={open}
      title={item ? `¿Eliminar a ${item.nombre}?` : ''}
      description={description}
      confirmLabel="Eliminar definitivamente"
      cancelLabel="Cancelar"
      tone="danger"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
