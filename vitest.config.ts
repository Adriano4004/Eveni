import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Os testes partilham a mesma base de dados de teste: correm um ficheiro de cada vez.
    fileParallelism: false,
    // Os testes de pedidos em simultâneo criam várias contas por ronda (cada palavra-passe custa ~100 ms a
    // calcular, de propósito): os 5 s por omissão não chegam numa máquina mais lenta.
    testTimeout: 20_000,
  },
});
