export function ToggleSwitch({ checked, onChange, label, description, color = 'blue' }) {
  const colors = {
    blue: 'bg-primary-500',
    emerald: 'bg-success-500',
    rose: 'bg-danger-500',
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm font-bold text-gray-900">{label}</p>
        {description && (
          <p className="text-[11px] font-semibold text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? colors[color] : 'bg-gray-200'}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}
