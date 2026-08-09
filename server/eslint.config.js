const js = require('@eslint/js');
const globals = require('globals');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  { ignores: ['node_modules', 'data', 'uploads', 'backups', 'dist'] },
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
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'],
      curly: ['warn', 'multi-line'],
      // Reglas de estilo/actuales convertidas a warn para facilitar la transición limpia
      'import/order': 'warn',
      'no-empty': 'warn',
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
];
