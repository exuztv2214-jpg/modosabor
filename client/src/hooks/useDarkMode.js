import { useEffect, useState } from 'react';

const STORAGE_KEY = 'modosabor-dark-mode';

function getInitialValue() {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored !== null) return stored === 'true';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function useDarkMode() {
  const [enabled, setEnabled] = useState(getInitialValue);

  useEffect(() => {
    const root = window.document.documentElement;
    if (enabled) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem(STORAGE_KEY, String(enabled));
  }, [enabled]);

  return { enabled, toggle: () => setEnabled((prev) => !prev), setEnabled };
}
