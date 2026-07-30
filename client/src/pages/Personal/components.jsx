import { User } from 'lucide-react';

export function AvatarDisplay({ url, nombre, size = 'h-20 w-20' }) {
  if (url) {
    return (
      <div
        className={`${size} overflow-hidden rounded-full border-2 border-white bg-slate-100 shadow-sm`}
      >
        <img src={url} className="h-full w-full object-cover object-center" alt={nombre} />
      </div>
    );
  }
  return (
    <div
      className={`${size} rounded-full flex items-center justify-center font-bold text-xl text-white shadow-sm bg-primary-500`}
    >
      {nombre?.[0]?.toUpperCase() || <User size={24} />}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, tint = 'blue' }) {
  const tints = {
    blue: { bg: 'bg-primary-50', text: 'text-primary-500' },
    amber: { bg: 'bg-[#FEF5E5]', text: 'text-warning-500' },
    rose: { bg: 'bg-[#FDF3F3]', text: 'text-danger-500' },
    emerald: { bg: 'bg-[#E6FFFA]', text: 'text-success-500' },
  };
  return (
    <div className="rounded-xl border-0 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-4">
        <div
          className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${tints[tint].bg} ${tints[tint].text}`}
        >
          <Icon size={24} strokeWidth={2} />
        </div>
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
