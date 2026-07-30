import ActionDialog from '../../components/ActionDialog.jsx';

export default function DeleteDialog({ deleteDialog, onConfirm, onClose }) {
  return (
    <ActionDialog
      open={Boolean(deleteDialog)}
      title={deleteDialog ? `Eliminar ${deleteDialog.nombre}` : ''}
      description="El producto se quitará del sistema y dejará de estar disponible para venta."
      confirmLabel="Eliminar producto"
      cancelLabel="Cancelar"
      tone="danger"
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
