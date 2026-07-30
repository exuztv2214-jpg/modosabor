import ActionDialog from '../../../components/ActionDialog.jsx';

export function DeleteDialog({ open, item, onClose, onConfirm }) {
  return (
    <ActionDialog
      open={open}
      title={item ? `Eliminar a ${item.nombre}` : ''}
      description="Se quitará esta persona del módulo de personal. Si tenía vínculo operativo, conviene revisar luego usuarios, pagos o delivery."
      confirmLabel="Eliminar personal"
      cancelLabel="Cancelar"
      tone="danger"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
