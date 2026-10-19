import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Os testes partilham a mesma base de dados de teste: correm um ficheiro de cada vez.
    fileParallelism: false,
  },
});
