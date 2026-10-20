import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contingencia, dadosRubrica } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import { MAX_RUBRICAS_POR_PROJECTO } from '../../shared/orcamento.js';
import type { ItemOrcamento } from '../../shared/projectos.js';
import type { criarGuardas } from '../contas/acesso.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar } from '../seguranca/limites.js';
import { projectoParaAlterar } from './alterar.js';

// Orçamento de um projecto (decisão 019): rubricas com valor previsto e real, e a contingência.
// Ver é ver o projecto (GET /api/projectos/:id); alterar é para o dono e os editores, com o projecto activo.
// As rubricas obrigatórias do template não se removem, nem mudam de categoria ou descrição.

const m = mensagens.orcamento;
const mp = mensagens.projectos;

const idProjecto = z.object({ id: z.uuid() });
const idRubrica = z.object({ id: z.uuid(), rubrica: z.uuid() });

interface Linha {
  id: string;
  category: string;
  description: string;
  required: boolean;
  note: string | null;
  planned_cents: string;
  actual_cents: string;
}

const COLUNAS = 'id, category, description, required, note, planned_cents, actual_cents';

const paraItem = (l: Linha): ItemOrcamento => ({
  id: l.id,
  categoria: l.category,
  descricao: l.description,
  obrigatoria: l.required,
  nota: l.note,
  // bigint chega como texto; os valores cabem com folga num número (máximo 10^13 cêntimos).
  previstoCentimos: Number(l.planned_cents),
  realCentimos: Number(l.actual_cents),
});

export function registarRotasOrcamento(app: FastifyInstance, base: BaseDeDados, guardas: ReturnType<typeof criarGuardas>) {
  const { pool } = base;
  const travar = (utilizadorId: string) => limitar(pool, `orcamento:${utilizadorId}`, LIMITES.alterarOrcamento);

  app.post('/api/projectos/:id/orcamento', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const projectoId = parametros.data.id;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(dadosRubrica, pedido.body);
    const item = await emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      const { rows: contagem } = await cliente.query<{ n: number; seguinte: number }>(
        'select count(*)::int as n, coalesce(max(position) + 1, 0)::int as seguinte from budget_items where project_id = $1',
        [projectoId],
      );
      if (contagem[0]!.n >= MAX_RUBRICAS_POR_PROJECTO) throw new ErroHttp(409, m.limite(MAX_RUBRICAS_POR_PROJECTO));
      const { rows } = await cliente.query<Linha>(
        `insert into budget_items (project_id, position, category, description, planned_cents, actual_cents)
         values ($1, $2, $3, $4, $5, $6) returning ${COLUNAS}`,
        [projectoId, contagem[0]!.seguinte, dados.categoria, dados.descricao, dados.previsto, dados.real],
      );
      return paraItem(rows[0]!);
    });
    return resposta.code(201).send(item);
  });

  app.post('/api/projectos/:id/orcamento/:rubrica', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<ItemOrcamento> => {
    const parametros = idRubrica.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.rubricaNaoEncontrada);
    const { id: projectoId, rubrica } = parametros.data;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(dadosRubrica, pedido.body);
    return emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      // A rubrica tem de ser deste projecto (CLAUDE.md, secção 5, regra 5). Nas obrigatórias, a categoria e a
      // descrição do template mantêm-se.
      const { rows } = await cliente.query<Linha>(
        `update budget_items
            set category = case when required then category else $3 end,
                description = case when required then description else $4 end,
                planned_cents = $5, actual_cents = $6
          where id = $1 and project_id = $2
          returning ${COLUNAS}`,
        [rubrica, projectoId, dados.categoria, dados.descricao, dados.previsto, dados.real],
      );
      if (!rows[0]) throw new ErroHttp(404, m.rubricaNaoEncontrada);
      return paraItem(rows[0]);
    });
  });

  app.post('/api/projectos/:id/orcamento/:rubrica/remover', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = idRubrica.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.rubricaNaoEncontrada);
    const { id: projectoId, rubrica } = parametros.data;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    await emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      const { rows } = await cliente.query<{ required: boolean }>('select required from budget_items where id = $1 and project_id = $2 for update', [
        rubrica,
        projectoId,
      ]);
      if (!rows[0]) throw new ErroHttp(404, m.rubricaNaoEncontrada);
      if (rows[0].required) throw new ErroHttp(409, m.obrigatoriaNaoRemove);
      await cliente.query('delete from budget_items where id = $1', [rubrica]);
    });
    return resposta.code(204).send();
  });

  app.post('/api/projectos/:id/contingencia', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<{ contingencia: number }> => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const projectoId = parametros.data.id;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const { percentagem } = validar(contingencia, pedido.body);
    await emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      await cliente.query('update projects set contingency_pct = $2 where id = $1', [projectoId, percentagem]);
    });
    return { contingencia: percentagem };
  });
}
