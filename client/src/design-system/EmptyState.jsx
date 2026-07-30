export default function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center rounded-3xl border border-dashed border-gray-200 bg-gray-50/50 p-8 ${className}`}
    >
      {Icon && <Icon size={40} className="mb-4 text-gray-300" strokeWidth={1.5} />}
      {title && <p className="text-sm font-bold text-gray-700">{title}</p>}
      {description && <p className="mt-1 text-xs text-gray-500 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
