import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';

export default [
  {
    ignores: [
      'dist',
      'node_modules',
      'android/app/build/**',
      'android/app/src/main/assets/**',
      'ios/App/App/public/**',
      'android/.gradle/**',
      'android/build/**',
    ],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        node: { extensions: ['.js', '.jsx'] },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      import: importPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // El proyecto agrupa componentes y helpers de UI por módulo. Vite sigue
      // haciendo HMR correctamente y separar esos archivos sólo para la regla
      // agregaría imports sin mejorar el runtime.
      'react-refresh/only-export-components': 'off',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      'import/no-unresolved': 'off',
      // Reglas de estilo/actuales convertidas a warn para facilitar la transición limpia
      'import/order': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/label-has-associated-control': ['warn', { depth: 5 }],
      'jsx-a11y/no-autofocus': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-catch': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
];
