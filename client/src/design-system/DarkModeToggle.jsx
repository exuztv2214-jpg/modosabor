import { Moon, Sun } from 'lucide-react';
import useDarkMode from '../hooks/useDarkMode.js';

export default function DarkModeToggle({ className = '' }) {
  const { enabled, toggle } = useDarkMode();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? 'Desactivar modo oscuro' : 'Activar modo oscuro'}
      className={`inline-flex items-center justify-center rounded-xl p-2 text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${className}`}
    >
      {enabled ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
