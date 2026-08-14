const js = require('@eslint/js');
const globals = require('globals');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  { ignores: ['node_modules', '.venv-whisper', 'data', 'uploads', 'backups', 'dist'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'],
      curly: ['warn', 'multi-line'],
      // Reglas de estilo/actuales convertidas a warn para facilitar la transición limpia
      'import/order': 'warn',
      // Los catch vacíos se usan únicamente para limpiezas best-effort. Un
      // bloque vacío normal sigue reportándose.
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    // Las pruebas y scripts de mantenimiento informan su avance por consola.
    // No deben contaminar el indicador de calidad del código que atiende pedidos.
    files: ['tests/**/*.js', 'scripts/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Adaptador único de salida estructurada del servidor.
    files: ['utils/logger.js'],
    rules: { 'no-console': 'off' },
  },
];
