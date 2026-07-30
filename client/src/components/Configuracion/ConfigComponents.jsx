import React from 'react';

export function ToggleSwitch({ checked, onChange, label, description, color = 'orange' }) {
  const colors = {
    indigo: 'bg-indigo-600',
    emerald: 'bg-emerald-600',
    orange: 'bg-orange-600',
    green: 'bg-green-600',
    blue: 'bg-blue-600',
    amber: 'bg-amber-600',
    rose: 'bg-rose-600',
    violet: 'bg-violet-600',
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white px-4 py-4 h-full">
      <div className="min-w-0">
        {label && <p className="text-sm font-semibold text-gray-900">{label}</p>}
        {description && <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors ${
          checked ? colors[color] || colors.orange : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

export function SectionCard({ icon: Icon, tone = 'orange', title, subtitle, children }) {
  const tones = {
    indigo: 'bg-indigo-100 text-indigo-600',
    emerald: 'bg-success-100 text-success-600',
    orange: 'bg-orange-100 text-orange-600',
    green: 'bg-green-100 text-green-600',
    blue: 'bg-primary-100 text-primary-600',
    amber: 'bg-warning-100 text-warning-600',
    rose: 'bg-danger-100 text-danger-600',
    violet: 'bg-violet-100 text-violet-600',
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-10 h-10 rounded-xl ${tones[tone]} flex items-center justify-center`}>
          <Icon size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function InputField({ label, description, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {description && <p className="mb-2 text-xs text-gray-500">{description}</p>}
      <input
        {...props}
        className="w-full h-12 rounded-xl border border-gray-300 px-4 text-base placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
      />
    </div>
  );
}

export function TextareaField({ label, description, rows = 8, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {description && <p className="mb-2 text-xs text-gray-500">{description}</p>}
      <textarea
        {...props}
        rows={rows}
        className="w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
      />
    </div>
  );
}

export function SelectField({ label, description, options = [], ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {description && <p className="mb-2 text-xs text-gray-500">{description}</p>}
      <select
        {...props}
        className="w-full h-12 rounded-xl border border-gray-300 px-4 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white transition-all"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
