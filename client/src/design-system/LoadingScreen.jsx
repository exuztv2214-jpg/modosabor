import { motion } from 'framer-motion';
import { resolveAssetUrl } from '../lib/assets.js';
import { DEFAULT_BRAND_LOGO } from '../lib/webPublicaHelpers.js';
import Skeleton from './Skeleton.jsx';

export default function LoadingScreen({ message = 'Cargando...' }) {
  const logoUrl = resolveAssetUrl(DEFAULT_BRAND_LOGO);
  return (
    <div className="flex h-screen items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md rounded-3xl bg-white p-8 shadow-card"
      >
        <div className="mb-6 flex items-center gap-3">
          <img
            src={logoUrl}
            alt="Modo Sabor"
            className="h-10 w-10 rounded-xl bg-white object-contain p-1 shadow-sm ring-1 ring-black/5"
          />
          <div>
            <p className="text-sm font-black text-gray-900">Modo Sabor</p>
            <p className="text-xs font-medium text-gray-400">{message}</p>
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton height="0.75rem" />
          <Skeleton height="0.75rem" width="80%" />
          <Skeleton height="0.75rem" width="60%" />
        </div>
      </motion.div>
    </div>
  );
}
