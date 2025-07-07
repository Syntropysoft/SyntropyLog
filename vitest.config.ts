import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Para no tener que importar describe, it, etc. de 'vitest'
    environment: 'node', // O 'jsdom' si necesitas simular un navegador
    include: ['tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'], // Busca tests solo en la carpeta 'tests'
    coverage: {
      provider: 'v8', // o 'istanbul'
      reporter: ['text', 'json', 'html', 'lcov'], // lcov es útil para Codecov y similares
      include: ['src/**/*.ts'], // Mide la cobertura en todos los archivos .ts de la carpeta src
      exclude: [
        // Excluye del coverage lo que no sea código fuente relevante
        'src/**/{*.d.ts,*.test.ts,*.spec.ts}',
        'src/**/__tests__/**',
      ],
    },
    deps: {
      inline: ['nock'], // Ojo: esto es para casos más específicos
    },
  },
});
