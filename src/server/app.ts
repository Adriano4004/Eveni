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

export function eRotaDeEcra(metodo: string, url: string): boolean {
  if (metodo !== 'GET' && metodo !== 'HEAD') return false;
  const caminho = url.split('?')[0] ?? '';
  if (caminho === '/api' || caminho.startsWith('/api/')) return false;
  const ultimo = caminho.split('/').pop() ?? '';
  return !ultimo.includes('.');
}

export async function criarApp({ config, base, pastaWeb }: Dependencias) {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: 'info' },
    // O Railway põe um único proxy à frente da aplicação: confiar só nesse salto,
    // para que um cliente não consiga falsificar o IP (importante para a limitação de pedidos).
    trustProxy: (_endereco: string, salto: number) => salto < 1,
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

  // Nunca expor detalhes internos (stack traces, erros da base de dados) ao cliente.
  app.setErrorHandler((erro: { statusCode?: number; message: string }, pedido, resposta) => {
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

  return app;
}
