import { Banknote, CreditCard, Landmark, Layers, QrCode, Smartphone } from 'lucide-react';

/**
 * Identidad visual de cada método de pago.
 *
 * Los TPV profesionales no muestran los métodos como texto plano: les dan
 * color e ícono porque el cobro se elige a ciegas, mirando al cliente y no
 * a la pantalla. Una forma y un color se reconocen en periferia; una
 * palabra de seis letras en mayúsculas, no.
 *
 * Los colores son los de cada marca donde existe (Mercado Pago celeste,
 * MODO violeta, Ualá naranja) y semánticos donde no (efectivo verde
 * billete, transferencia azul banco). No usamos los logos oficiales
 * porque son marcas registradas y habría que licenciarlos y versionarlos;
 * el ícono con el color de marca da el mismo reconocimiento sin ese lío.
 *
 * `short` es lo que entra en el botón; `label` es el nombre completo para
 * tooltips, listas y el resumen de pago mixto.
 */
/**
 * `logo` es opcional. Si lo completás con la ruta de un archivo que esté
 * en `client/public/pagos/`, el botón muestra esa imagen en lugar del
 * ícono genérico. Ejemplo:
 *
 *   mercadopago: { ..., logo: '/pagos/mercadopago.svg' }
 *
 * Es la forma de poner los logos oficiales sin tocar nada más: el resto
 * del componente ya está preparado para leerlo.
 */
export const PAYMENT_BRANDS = {
  efectivo: {
    label: 'Efectivo',
    short: 'Efectivo',
    icon: Banknote,
    logo: null,
    color: '#16A34A',
    soft: '#DCFCE7',
  },
  mercadopago: {
    label: 'Mercado Pago',
    short: 'Mercado Pago',
    icon: QrCode,
    logo: null,
    color: '#00A9E0',
    soft: '#E0F5FD',
  },
  transferencia: {
    label: 'Transferencia',
    short: 'Transfer.',
    icon: Landmark,
    logo: null,
    color: '#2563EB',
    soft: '#DBEAFE',
  },
  modo: {
    label: 'MODO',
    short: 'MODO',
    icon: Smartphone,
    logo: null,
    color: '#6D28D9',
    soft: '#EDE9FE',
  },
  uala: {
    label: 'Ualá',
    short: 'Ualá',
    icon: CreditCard,
    logo: null,
    color: '#F97316',
    soft: '#FFEDD5',
  },
  mixto: {
    label: 'Pago mixto',
    short: 'Mixto',
    icon: Layers,
    logo: null,
    color: '#D97706',
    soft: '#FEF3C7',
  },
};

/**
 * Alto del botón de pago, en píxeles.
 *
 * Es el control más grande de la zona de cobro después del botón de
 * cobrar, y a propósito: el método de pago se elige mirando al cliente,
 * no a la pantalla. Si querés hacerlos todavía más grandes, cambiá este
 * número y todo lo demás (ícono, texto, popover) escala solo.
 */
export const PAYMENT_BUTTON_H = 72;

export function paymentBrand(method) {
  return (
    PAYMENT_BRANDS[method] || {
      label: method,
      short: method,
      icon: Banknote,
      logo: null,
      color: '#64748B',
      soft: '#F1F5F9',
    }
  );
}

/**
 * Marca visual de un método: el logo si está cargado, el ícono si no.
 *
 * Cuando el botón está activo el fondo es de color pleno, así que el logo
 * se pinta de blanco con un filtro para que no se pierda sobre el. Las
 * marcas que no soporten inversion pueden marcar logoInvertible: false.
 */
export function PaymentMark({ method, size = 34, active = false }) {
  const brand = paymentBrand(method);

  if (brand.logo) {
    return (
      <img
        src={brand.logo}
        alt={brand.label}
        style={{
          height: size,
          width: 'auto',
          maxWidth: '100%',
          objectFit: 'contain',
          filter: active && brand.logoInvertible !== false ? 'brightness(0) invert(1)' : 'none',
        }}
      />
    );
  }

  const Icon = brand.icon;
  return <Icon size={size} strokeWidth={2} aria-hidden="true" />;
}

/**
 * Botón de método de pago: sólo la marca, sin texto.
 *
 * Inactivo, el ícono va en color de marca sobre fondo suave — eso es lo
 * que permite encontrar "el celeste" sin leer. Activo, se invierte a
 * fondo pleno para que no quede ninguna duda de con qué se está cobrando.
 *
 * Al no haber etiqueta, el nombre vive en `title` y en `aria-label`: el
 * mouse lo muestra al pasar por encima y el lector de pantalla lo anuncia.
 * Es la única concesión que hace falta para que un empleado nuevo pueda
 * aprender cuál es cuál sin que nadie se lo explique.
 */
export function PaymentButton({ method, active, onClick, className = '' }) {
  const brand = paymentBrand(method);

  return (
    <button
      type="button"
      onClick={onClick}
      title={brand.label}
      aria-label={brand.label}
      aria-pressed={active}
      className={`flex items-center justify-center rounded-2xl border-2 transition-all active:scale-95 ${className}`}
      style={{
        height: PAYMENT_BUTTON_H,
        ...(active
          ? {
              background: brand.color,
              borderColor: brand.color,
              color: '#FFFFFF',
              boxShadow: `0 8px 22px ${brand.color}40`,
            }
          : { background: brand.soft, borderColor: 'transparent', color: brand.color }),
      }}
    >
      <PaymentMark method={method} active={active} size={34} />
    </button>
  );
}
