import { BRAND } from '../../../lib/theme.js';

export function ToggleSwitch({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-gray-900">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[12px] leading-4 text-gray-500">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition"
        style={{ background: checked ? BRAND : '#D1D5DB' }}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
