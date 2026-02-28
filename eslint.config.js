const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettierConfig = require('eslint-config-prettier');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // Global ignores MUST be in their own object at the top or bottom
        ignores: [
            'node_modules/',
            'dist/',
            'rollup.config.mjs',
            'eslint.config.js',
            'coverage/',
            'vitest.config.ts',
            'examples/**/*',
            'tests/**/*',
            'external-adapters/**/*',
            'declarations.d.ts',
            'test_integration/**/*',
            '*.mjs',
            '*.js',
            'scripts/**/*',
        ],
    },
    {
        files: ['src/**/*.ts'],
        plugins: {
            prettier: prettierPlugin,
        },
        languageOptions: {
            parserOptions: {
                project: './src/tsconfig.json',
                tsconfigRootDir: __dirname,
            },
        },
        rules: {
            ...prettierConfig.rules,
            'prettier/prettier': 'warn',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    }
);
