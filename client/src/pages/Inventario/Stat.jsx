import { Boxes, AlertTriangle, TrendingUp, MinusCircle } from 'lucide-react';

const tints = {
  blue: 'bg-primary-50 text-primary-500',
  rose: 'bg-danger-50 text-danger-500',
  amber: 'bg-warning-50 text-warning-500',
  emerald: 'bg-success-50 text-success-500',
};

export default function Stat({ label, value, helper, icon: Icon, tint = 'blue' }) {
  return (
    <div className="group rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            {label}
          </p>
          <p className="text-xl font-black text-gray-900 tracking-tight">{value}</p>
          {helper && (
            <p className="mt-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {helper}
            </p>
          )}
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:rotate-3 ${tints[tint]}`}
        >
          <Icon size={18} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}
