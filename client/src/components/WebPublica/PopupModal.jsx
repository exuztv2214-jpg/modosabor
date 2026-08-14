import { X, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { resolveAssetUrl } from '../../lib/assets.js';
import { DEFAULT_BRAND_LOGO } from '../../lib/webPublicaHelpers.js';

export default function PopupModal({ visible, content, colorPrimario, theme, onClose, onAction }) {
  const imageUrl = resolveAssetUrl(content?.imagen || DEFAULT_BRAND_LOGO);
  return (
    <AnimatePresence>
      {visible && content && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] flex items-center justify-center p-4"
        >
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
            }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative grid w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-2xl md:grid-cols-[1fr,1fr]"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-gray-900 shadow-sm backdrop-blur"
            >
              <X size={20} />
            </button>
            <div className="min-h-[240px] bg-gray-100">
              {imageUrl ? (
                <img src={imageUrl} alt={content.titulo} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full min-h-[240px] items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                  <span className="text-5xl font-bold text-gray-200">MS</span>
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center p-6 md:p-8">
              <p
                className="mb-2 text-xs font-black uppercase tracking-[0.2em]"
                style={{ color: colorPrimario }}
              >
                Promo destacada
              </p>
              <h3 className="text-3xl font-black leading-tight text-gray-900 md:text-4xl">
                {content.titulo}
              </h3>
              {content.descripcion ? (
                <p className="mt-3 text-sm font-medium leading-relaxed text-gray-500">
                  {content.descripcion}
                </p>
              ) : null}
              {content.precio_texto ? (
                <p
                  className="mt-4 text-2xl font-black"
                  style={{ color: theme?.accent || colorPrimario }}
                >
                  {content.precio_texto}
                </p>
              ) : null}
              <button
                onClick={() => {
                  onClose();
                  onAction(content.accion_tipo, content.accion_valor);
                }}
                className="mt-6 inline-flex h-12 w-fit items-center gap-2 rounded-xl px-6 text-sm font-black text-white shadow-lg transition active:scale-95"
                style={{ backgroundColor: colorPrimario }}
              >
                {content.boton_texto || 'Ver promo'}
                <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
