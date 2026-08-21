export const STATUS_STYLES = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Borrador' },
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Programada' },
  queued: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'En cola' },
  processing: { bg: 'bg-indigo-50', text: 'text-indigo-700', label: 'Procesando' },
  published: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Publicada' },
  requires_approval: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Revisión' },
  ambiguous: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Ambigua' },
  skipped_rule: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Regla del grupo' },
  skipped_duplicate: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Repetida' },
  failed: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Fallida' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Cancelada' },
};

export const socialApiError = (error) =>
  error?.error || error?.message || 'No se pudo completar la operación';

export const formatSocialDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value)
      )
    : '—';

export const formatSocialDate = (value) =>
  value
    ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(value))
    : '—';
