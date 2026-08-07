/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Rojo Modo Sabor. Es el único acento del TPV: botón de cobrar,
         * precios, total, categoría activa. Todo lo demás es gris.
         *
         * La regla es que el color se reserva, no se reparte. Si aparece
         * en más de cinco lugares por pantalla deja de significar algo.
         */
        brand: {
          50: '#FEF2F2',
          100: '#FDE3E4',
          200: '#FBC5C8',
          300: '#F79197',
          400: '#F05C65',
          500: '#DC1F2D',
          600: '#C11824',
          700: '#9E141E',
          800: '#7A0F17',
          900: '#560A10',
        },
        // Paleta principal de Modo Sabor (azul)
        /*
         * `primary` era el azul #5D87FF que venia con la plantilla comprada.
         * No era una decision de diseno: era lo que traia el template, y se
         * fue colando en 16 archivos donde alguien escribio "primary" para
         * decir "el color principal" sin mirar que valor tenia.
         *
         * Ahora es un alias del rojo de marca. Nadie deberia usarlo —el
         * nombre correcto es `brand`— pero si vuelve a aparecer un
         * `primary-500` suelto, va a salir rojo en vez de azul.
         */
        primary: {
          50: '#FEF2F2',
          100: '#FDE3E4',
          200: '#FBC5C8',
          300: '#F79197',
          400: '#F05C65',
          500: '#DC1F2D',
          600: '#C11824',
          700: '#9E141E',
          800: '#7A0F17',
          900: '#560A10',
        },
        // Colores semánticos / acentos
        success: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34D399',
          500: '#13DEB9',
          600: '#059669',
          700: '#047857',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#FFAE1F',
          600: '#D97706',
          700: '#B45309',
        },
        danger: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#FA896B',
          600: '#DC2626',
          700: '#B91C1C',
        },
        info: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#49BEFF',
          600: '#0284C7',
          700: '#0369A1',
        },
        // Escala de grises
        gray: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        // Fondos y superficies
        background: {
          // Era #F4F7FB, un gris con tinte azul que venía de la plantilla.
          // Ahora coincide con APP_BG de lib/theme.js, que es el fondo que
          // usan los módulos rediseñados. Tenerlos distintos hacía que se
          // viera un recuadro gris dentro de otro gris.
          DEFAULT: '#F6F7F9',
          card: '#FFFFFF',
          elevated: '#FFFFFF',
        },
        // Texto semántico
        text: {
          primary: '#1E293B',
          secondary: '#475569',
          muted: '#64748B',
          placeholder: '#94A3B8',
          inverse: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        soft: '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        card: '0 0 20px rgba(0, 0, 0, 0.04), 0 4px 8px rgba(0, 0, 0, 0.02)',
        elevated: '0 10px 40px -10px rgba(0, 0, 0, 0.1)',
        dropdown: '0 20px 50px rgba(0, 0, 0, 0.15)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      transitionTimingFunction: {
        'in-out-soft': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
