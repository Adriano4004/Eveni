import { existsSync } from 'node:fs';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { mensagens } from '../shared/mensagens.js';
import type { Config } from './config.js';
import type { BaseDeDados } from './db/index.js';

export interface Dependencias {
  config: Config;
  base: BaseDeDados;
  // Pasta com os ecrãs já compilados (vite build). Opcional nos testes.
  pastaWeb?: string;
}

export async function criarApp({ config, base, pastaWeb }: Dependencias) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: 'info' },
    // O Railway está atrás de um proxy: confiar no cabeçalho X-Forwarded-For.
    trustProxy: true,
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

  app.get('/health', async (_pedido, resposta) => {
    const bdOk = await base.verificar();
    if (!bdOk) {
      return resposta.code(503).send({ estado: 'erro', baseDeDados: 'indisponivel', mensagem: mensagens.health.servicoIndisponivel });
    }
    return { estado: 'ok', baseDeDados: 'ok', ambiente: config.APP_ENV };
  });

  if (pastaWeb && existsSync(pastaWeb)) {
    await app.register(fastifyStatic, { root: pastaWeb, wildcard: false });
    // Qualquer rota que não seja da API devolve a aplicação web (o React trata da navegação).
    app.setNotFoundHandler((pedido, resposta) => {
      if (pedido.method === 'GET' && !pedido.url.startsWith('/api/')) {
        return resposta.sendFile('index.html');
      }
      return resposta.code(404).send({ mensagem: mensagens.erros.naoEncontrado });
    });
  } else {
    app.setNotFoundHandler((_pedido, resposta) => resposta.code(404).send({ mensagem: mensagens.erros.naoEncontrado }));
  }

  // Nunca expor detalhes internos (stack traces, erros da base de dados) ao cliente.
  app.setErrorHandler((erro: { statusCode?: number; message: string }, pedido, resposta) => {
    const codigo = erro.statusCode ?? 500;
    if (codigo >= 500) {
      pedido.log.error(erro);
      return resposta.code(codigo).send({ mensagem: mensagens.erros.interno });
    }
    return resposta.code(codigo).send({ mensagem: erro.message });
  });

  return app;
}
