import { criarApp } from './app.js';
import { ConfigInvalida, lerConfig } from './config.js';
import { limparExpirados } from './contas/sessoes.js';
import { esperarSegundoPlano } from './segundo-plano.js';
import { criarEnvioDeEmail } from './email/index.js';
import { verificarPlanos } from './pagamentos/fim-plano.js';
import { aplicarMigracoes, criarBaseDeDados } from './db/index.js';
import { RAIZ } from './raiz.js';

const raiz = RAIZ;

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

  const enviarEmail = criarEnvioDeEmail(config);
  const app = await criarApp({ config, base, pastaWeb: `${raiz}dist/web`, enviarEmail });

  // De hora a hora (e logo no arranque), avisos de fim do plano e regresso ao Singular depois da tolerância.
  const planos = () =>
    verificarPlanos(base.pool, config, enviarEmail)
      .then((r) => console.log(`[planos] avisos antes do fim: ${r.avisosAntes}, avisos de fim: ${r.avisosFim}, de volta ao Singular: ${r.descidas}`))
      .catch((erro) => console.error('[planos] falhou:', erro));
  void planos();
  const verificacaoPlanos = setInterval(planos, 60 * 60 * 1000);
  verificacaoPlanos.unref();

  // De hora a hora, apagar sessões expiradas e contadores de tentativas antigos.
  const limpeza = setInterval(() => {
    limparExpirados(base.pool)
      .then((r) => console.log(`[limpeza] sessões expiradas: ${r.sessoes}, contadores antigos: ${r.tentativas}, ligações de e-mail: ${r.ligacoes}, contas por confirmar apagadas: ${r.contas}`))
      .catch((erro) => console.error('[limpeza] falhou:', erro));
  }, 60 * 60 * 1000);
  limpeza.unref();

  let aEncerrar = false;
  const encerrar = () => {
    if (aEncerrar) return;
    aEncerrar = true;
    Promise.resolve()
      .then(() => app.close())
      .then(() => esperarSegundoPlano())
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
