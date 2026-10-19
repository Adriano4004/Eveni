import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from './app.js';
import { ConfigInvalida, lerConfig } from './config.js';
import { aplicarMigracoes, criarBaseDeDados } from './db/index.js';

// Raiz do projecto, quer a correr com tsx (src/server/) quer compilado (dist/server/server/).
const pastaDesteFicheiro = dirname(fileURLToPath(import.meta.url));
const compilado = pastaDesteFicheiro.endsWith(join('dist', 'server', 'server'));
const raiz = join(pastaDesteFicheiro, compilado ? '../../..' : '../..') + sep;

async function arrancar() {
  let config;
  try {
    config = lerConfig();
  } catch (erro) {
    if (erro instanceof ConfigInvalida) {
      console.error(`[arranque] ${erro.message}\n[arranque] A aplicação não arranca até estas variáveis estarem configuradas no Railway.`);
      process.exit(1);
    }
    throw erro;
  }

  if (!config.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY não definida: os e-mails não serão enviados, só escritos nos logs.');
  }

  const base = criarBaseDeDados(config.DATABASE_URL);
  await aplicarMigracoes(base, `${raiz}drizzle`);
  console.log('[migrate] migrações aplicadas');

  const app = await criarApp({ config, base, pastaWeb: `${raiz}dist/web` });

  let aEncerrar = false;
  const encerrar = () => {
    if (aEncerrar) return;
    aEncerrar = true;
    Promise.resolve()
      .then(() => app.close())
      .then(() => base.fechar())
      .then(() => process.exit(0))
      .catch((erro) => {
        console.error('[encerrar] falhou:', erro);
        process.exit(1);
      });
  };
  process.on('SIGTERM', encerrar);
  process.on('SIGINT', encerrar);

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

arrancar().catch((erro) => {
  console.error('[arranque] falhou:', erro);
  process.exit(1);
});
