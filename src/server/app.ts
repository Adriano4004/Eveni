import { existsSync } from 'node:fs';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { mensagens } from '../shared/mensagens.js';
import type { Config } from './config.js';
import { criarGuardas } from './contas/acesso.js';
import { registarRotasConfirmacao } from './contas/confirmacao.js';
import { registarRotasDados } from './contas/dados.js';
import { registarRotasPalavraPasse } from './contas/palavra-passe.js';
import { registarRotasContas } from './contas/rotas.js';
import { criarEnvioDeEmail, type EnviarEmail } from './email/index.js';
import type { BaseDeDados } from './db/index.js';
import { ErroHttp } from './erros.js';
import { protegerOrigem } from './seguranca/origem.js';

export interface Dependencias {
  config: Config;
  base: BaseDeDados;
  // Substituível nos testes, para verificar os e-mails sem os enviar.
  enviarEmail?: EnviarEmail;
  // Pasta com os ecrãs já compilados (vite build). Opcional nos testes.
  pastaWeb?: string;
}

export function eRotaDeEcra(metodo: string, url: string): boolean {
  if (metodo !== 'GET' && metodo !== 'HEAD') return false;
  const caminho = url.split('?')[0] ?? '';
  if (caminho === '/api' || caminho.startsWith('/api/')) return false;
  const ultimo = caminho.split('/').pop() ?? '';
  return !ultimo.includes('.');
}

export async function criarApp({ config, base, pastaWeb, enviarEmail = criarEnvioDeEmail(config) }: Dependencias) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: 'info' },
    // Confiar só nos proxies do alojamento (TRUST_PROXY_HOPS), para que um cliente não consiga
    // falsificar o IP com o cabeçalho X-Forwarded-For (importante para a limitação de pedidos).
    trustProxy: (_endereco: string, salto: number) => salto < config.TRUST_PROXY_HOPS,
  });

  // Definido antes de qualquer rota ou plugin: as rotas registadas antes disto usariam o tratamento
  // de erros por omissão do Fastify (em inglês).
  // Nunca expor detalhes internos (stack traces, erros da base de dados) ao cliente.
  app.setErrorHandler((erro: { statusCode?: number; message: string }, pedido, resposta) => {
    // Erros criados pelo próprio Eveni já trazem uma mensagem pensada para o utilizador.
    if (erro instanceof ErroHttp) {
      return resposta.code(erro.statusCode).send({ mensagem: erro.message, ...(erro.campos ? { campos: erro.campos } : {}) });
    }
    const codigo = erro.statusCode ?? 500;
    if (codigo >= 500) {
      pedido.log.error(erro);
      return resposta.code(codigo).send({ mensagem: mensagens.erros.interno });
    }
    // As mensagens internas do Fastify vêm em inglês e com detalhes técnicos: não as mostrar.
    pedido.log.info({ err: erro }, 'pedido recusado');
    const mensagem = codigo === 429 ? mensagens.erros.demasiadosPedidos : codigo === 404 ? mensagens.erros.naoEncontrado : mensagens.erros.pedidoInvalido;
    return resposta.code(codigo).send({ mensagem });
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: config.APP_ENV === 'local' ? false : { maxAge: 31536000, includeSubDomains: true },
  });

  await app.register(cookie);
  protegerOrigem(app, config);
  const guardas = criarGuardas(config, base);
  registarRotasContas(app, config, base, enviarEmail, guardas);
  registarRotasConfirmacao(app, config, base, enviarEmail, guardas);
  registarRotasPalavraPasse(app, config, base, enviarEmail, guardas);
  registarRotasDados(app, config, base, enviarEmail, guardas);

  app.get('/health', async (_pedido, resposta) => {
    const bdOk = await base.verificar();
    if (!bdOk) {
      return resposta.code(503).send({ estado: 'erro', baseDeDados: 'indisponivel', mensagem: mensagens.health.servicoIndisponivel });
    }
    return { estado: 'ok', baseDeDados: 'ok', ambiente: config.APP_ENV };
  });

  if (pastaWeb && existsSync(pastaWeb)) {
    await app.register(fastifyStatic, { root: pastaWeb, wildcard: false });
    // Rotas de ecrã (sem extensão, fora da API) devolvem a aplicação web; o React trata da navegação.
    // Ficheiros em falta (ex.: /assets/antigo.js depois de um deploy) dão 404, não HTML.
    app.setNotFoundHandler((pedido, resposta) => {
      if (eRotaDeEcra(pedido.method, pedido.url)) {
        return resposta.sendFile('index.html');
      }
      return resposta.code(404).send({ mensagem: mensagens.erros.naoEncontrado });
    });
  } else {
    app.setNotFoundHandler((_pedido, resposta) => resposta.code(404).send({ mensagem: mensagens.erros.naoEncontrado }));
  }

  return app;
}
