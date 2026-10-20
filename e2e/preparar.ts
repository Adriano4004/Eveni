import pg from 'pg';
import { envValido } from '../tests/ajuda.js';

// Antes dos testes no browser: limpar os contadores de pedidos da base de dados de TESTE.
// Cada execução regista várias contas a partir do mesmo IP; sem isto, correr os testes algumas vezes
// seguidas esbarra no limite de registos por hora.
export default async function preparar() {
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  try {
    await cliente.query('delete from rate_limits');
  } catch (erro) {
    // Base de dados acabada de criar (ainda sem tabelas): nada a limpar.
    if ((erro as { code?: string }).code !== '42P01') throw erro;
  } finally {
    await cliente.end();
  }
}
