import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
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
  supplier_id: string | null;
  supplier_name: string | null;
}

// Rubricas com o nome do fornecedor (só o nome: os contactos vêem-se na lista de fornecedores).
const SELECCAO = `
  select b.id, b.category, b.description, b.required, b.note, b.planned_cents, b.actual_cents,
         s.id as supplier_id, s.name as supplier_name
    from budget_items b left join suppliers s on s.id = b.supplier_id`;

const paraItem = (l: Linha): ItemOrcamento => ({
  id: l.id,
  categoria: l.category,
  descricao: l.description,
  obrigatoria: l.required,
  nota: l.note,
  // bigint chega como texto; os valores cabem com folga num número (máximo 10^13 cêntimos).
  previstoCentimos: Number(l.planned_cents),
  realCentimos: Number(l.actual_cents),
  fornecedor: l.supplier_id ? { id: l.supplier_id, nome: l.supplier_name ?? '' } : null,
});

// Rubricas de um projecto, pela ordem. Quem chama já verificou o acesso.
export async function lerRubricas(cliente: pg.Pool | pg.PoolClient, projectoId: string): Promise<ItemOrcamento[]> {
  const { rows } = await cliente.query<Linha>(`${SELECCAO} where b.project_id = $1 order by b.position, b.id`, [projectoId]);
  return rows.map(paraItem);
}

async function lerRubrica(cliente: pg.PoolClient, rubricaId: string): Promise<ItemOrcamento> {
  const { rows } = await cliente.query<Linha>(`${SELECCAO} where b.id = $1`, [rubricaId]);
  return paraItem(rows[0]!);
}

// O fornecedor tem de ser do espaço de trabalho do projecto (CLAUDE.md, secção 5, regra 5: o ID vem no corpo
// do pedido; falha da versão anterior). Bloqueio em partilha: apagar o fornecedor ao mesmo tempo espera.
async function verificarFornecedor(cliente: pg.PoolClient, projectoId: string, fornecedorId: string | null) {
  if (!fornecedorId) return;
  const { rows } = await cliente.query(
    `select 1 from suppliers s join projects p on p.workspace_id = s.workspace_id
      where s.id = $1 and p.id = $2 for share of s`,
    [fornecedorId, projectoId],
  );
  if (rows.length === 0) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { fornecedorId: mensagens.validacao.fornecedorInvalido });
}

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
      await verificarFornecedor(cliente, projectoId, dados.fornecedorId ?? null);
      const { rows } = await cliente.query<{ id: string }>(
        `insert into budget_items (project_id, position, category, description, planned_cents, actual_cents, supplier_id)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [projectoId, contagem[0]!.seguinte, dados.categoria, dados.descricao, dados.previsto, dados.real, dados.fornecedorId ?? null],
      );
      return lerRubrica(cliente, rows[0]!.id);
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
      await verificarFornecedor(cliente, projectoId, dados.fornecedorId ?? null);
      // A rubrica tem de ser deste projecto (CLAUDE.md, secção 5, regra 5). Nas obrigatórias, a categoria e a
      // descrição do template mantêm-se. Sem fornecedorId no pedido, o fornecedor fica como estava.
      const { rows } = await cliente.query<{ id: string }>(
        `update budget_items
            set category = case when required then category else $3 end,
                description = case when required then description else $4 end,
                planned_cents = $5, actual_cents = $6,
                supplier_id = case when $7 then $8::uuid else supplier_id end
          where id = $1 and project_id = $2
          returning id`,
        [rubrica, projectoId, dados.categoria, dados.descricao, dados.previsto, dados.real, dados.fornecedorId !== undefined, dados.fornecedorId ?? null],
      );
      if (!rows[0]) throw new ErroHttp(404, m.rubricaNaoEncontrada);
      return lerRubrica(cliente, rubrica);
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
