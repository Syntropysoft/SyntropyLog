module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended', // Reglas recomendadas para TypeScript
    'prettier', // Desactiva reglas conflictivas con Prettier (debe ser el último 'extends')
  ],
  plugins: ['@typescript-eslint/eslint-plugin', 'prettier'],
  parserOptions: {
    ecmaVersion: 2022, // O la versión de ECMAScript que estés usando
    sourceType: 'module',
    project: './src/tsconfig.json', // Usar el tsconfig específico de src
  },
  env: {
    es6: true,
    node: true,
    // jest: true, // Si usas Jest
    // vitest: true, // Si usas Vitest, puedes habilitar 'vitest/globals' con un plugin
  },
  globals: {
    // Para Vitest si usas globals: true en su config
    describe: 'readonly',
    it: 'readonly',
    expect: 'readonly',
    beforeEach: 'readonly',
    afterEach: 'readonly',
    vi: 'readonly',
  },
  rules: {
    'prettier/prettier': 'warn', // Muestra warnings de Prettier como errores de ESLint
    'no-unused-vars': 'off', // Desactivado, @typescript-eslint/no-unused-vars es mejor
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-module-boundary-types': 'off', // Puede ser útil activarlo
    '@typescript-eslint/no-explicit-any': 'warn',
    // Puedes añadir más reglas aquí
  },

  ignorePatterns: [
    'node_modules/',
    'dist/',
    'rollup.config.mjs',
    '.eslintrc.cjs',
    'coverage/',
    'vitest.config.ts',
    'examples/**/*',
    'tests/**/*',
    'external-adapters/**/*',
    'declarations.d.ts',
  ],
};
