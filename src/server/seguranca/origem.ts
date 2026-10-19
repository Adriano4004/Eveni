import type { FastifyInstance } from 'fastify';
import { mensagens } from '../../shared/mensagens.js';
import type { Config } from '../config.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Protecção contra pedidos forjados (CSRF): os pedidos que alteram dados só são aceites
// quando vêm de páginas do próprio Eveni. O browser envia sempre o cabeçalho Origin nestes pedidos.
export function protegerOrigem(app: FastifyInstance, config: Config) {
  const permitidas = new Set([new URL(config.APP_URL).origin]);
  if (config.APP_ENV === 'local') permitidas.add('http://localhost:5173'); // servidor de desenvolvimento (Vite)

  app.addHook('onRequest', async (pedido, resposta) => {
    if (METODOS_SEGUROS.has(pedido.method) || !pedido.url.startsWith('/api/')) return;
    const origem = pedido.headers.origin;
    if (!origem || !permitidas.has(origem)) {
      return resposta.code(403).send({ mensagem: mensagens.erros.origemInvalida });
    }
  });
}
