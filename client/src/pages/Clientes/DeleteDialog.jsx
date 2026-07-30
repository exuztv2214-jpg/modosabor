import ActionDialog from '../../components/ActionDialog.jsx';

export default function DeleteDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone,
  onConfirm,
  onClose,
}) {
  return (
    <ActionDialog
      open={open}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      tone={tone}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
