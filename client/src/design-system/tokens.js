/**
 * Tokens de diseño de Modo Sabor.
 * Única fuente de verdad para colores, espaciado, sombras y tipografía.
 */

export const colors = {
  // Primario (azul Modo Sabor)
  primary: {
    50: '#ECF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#5D87FF',
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
  },

  // Acento éxito (verde agua)
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

  // Acento advertencia (naranja)
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

  // Acento peligro (salmon)
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

  // Acento info (celeste)
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

  // Fondos del sistema
  background: {
    main: '#F4F7FB',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
  },

  // Texto
  text: {
    primary: '#1E293B',
    secondary: '#475569',
    muted: '#64748B',
    placeholder: '#94A3B8',
    inverse: '#FFFFFF',
  },

  // Bordes
  border: {
    light: '#F1F5F9',
    DEFAULT: '#E2E8F0',
    strong: '#CBD5E1',
  },
};

export const spacing = {
  xs: '0.25rem', // 4px
  sm: '0.5rem', // 8px
  md: '1rem', // 16px
  lg: '1.5rem', // 24px
  xl: '2rem', // 32px
  '2xl': '2.5rem', // 40px
  '3xl': '3rem', // 48px
};

export const radii = {
  sm: '0.5rem', // 8px
  md: '0.75rem', // 12px
  lg: '1rem', // 16px
  xl: '1.25rem', // 20px
  '2xl': '1.5rem', // 24px
  '3xl': '2rem', // 32px
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  card: '0 0 20px rgba(0, 0, 0, 0.04), 0 4px 8px rgba(0, 0, 0, 0.02)',
  soft: '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
  elevated: '0 10px 40px -10px rgba(0, 0, 0, 0.1)',
  dropdown: '0 20px 50px rgba(0, 0, 0, 0.15)',
};

export const typography = {
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
  fontSize: {
    xs: ['0.625rem', { lineHeight: '0.875rem' }], // 10px
    sm: ['0.75rem', { lineHeight: '1rem' }], // 12px
    base: ['0.875rem', { lineHeight: '1.25rem' }], // 14px
    lg: ['1rem', { lineHeight: '1.5rem' }], // 16px
    xl: ['1.125rem', { lineHeight: '1.75rem' }], // 18px
    '2xl': ['1.25rem', { lineHeight: '1.75rem' }], // 20px
    '3xl': ['1.5rem', { lineHeight: '2rem' }], // 24px
    '4xl': ['2rem', { lineHeight: '2.25rem' }], // 32px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 800,
  },
};

export const transitions = {
  fast: '150ms ease-in-out',
  DEFAULT: '200ms ease-in-out',
  slow: '300ms ease-in-out',
};

export const zIndex = {
  dropdown: 50,
  sticky: 100,
  modal: 200,
  popover: 300,
  tooltip: 400,
};
