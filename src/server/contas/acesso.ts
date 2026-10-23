import type { FastifyReply, FastifyRequest } from 'fastify';
import { mensagens } from '../../shared/mensagens.js';
import type { Config } from '../config.js';
import type { BaseDeDados } from '../db/index.js';
import { ErroHttp } from '../erros.js';
import { lerSessao, type SessaoValida } from './sessoes.js';

declare module 'fastify' {
  interface FastifyRequest {
    sessao?: SessaoValida;
  }
}

// Verificações a usar como preHandler nas rotas. Sempre no servidor (CLAUDE.md, secção 5, regra 5).
export function criarGuardas(config: Config, base: BaseDeDados) {
  const { pool } = base;

  // Só a sessão, mesmo sem a versão actual dos termos aceite. Apenas para o que tem de funcionar antes de
  // aceitar (decisão 026): ver a conta, aceitar os termos, sair, e exportar ou eliminar os dados (direitos
  // que a Lei n.º 22/11 garante, aceite ou não os termos novos).
  async function exigirSessaoSemTermos(pedido: FastifyRequest, resposta: FastifyReply) {
    const sessao = await lerSessao(pool, config, pedido, resposta);
    if (!sessao) throw new ErroHttp(401, mensagens.contas.sessaoNecessaria);
    pedido.sessao = sessao;
  }

  async function exigirSessao(pedido: FastifyRequest, resposta: FastifyReply) {
    await exigirSessaoSemTermos(pedido, resposta);
    if (!pedido.sessao!.termosAceites) throw new ErroHttp(403, mensagens.contas.termosPorAceitar);
  }

  // Para tudo o que cria conteúdo ou links públicos: quem não confirmou o e-mail entra e vê, mas não cria.
  async function exigirEmailConfirmado(pedido: FastifyRequest, resposta: FastifyReply) {
    await exigirSessao(pedido, resposta);
    if (!pedido.sessao!.emailConfirmado) throw new ErroHttp(403, mensagens.contas.emailPorConfirmar);
  }

  return { exigirSessaoSemTermos, exigirSessao, exigirEmailConfirmado };
}
