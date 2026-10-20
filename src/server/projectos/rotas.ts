import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { diasEntre, hojeEmLuanda } from '../../shared/datas.js';
import { type CodigoPlano, criarProjecto, previsaoProjecto } from '../../shared/esquemas.js';
import { materializar } from '../../shared/materializacao.js';
import { mensagens } from '../../shared/mensagens.js';
import {
  DIAS_MAXIMOS_ATE_EVENTO,
  type EstadoProjecto,
  type EstadoTarefa,
  LIMITE_PROJECTOS,
  type Previsao,
  type Projecto,
  type ResumoProjecto,
} from '../../shared/projectos.js';
import type { Template } from '../../shared/templates.js';
import type { criarGuardas } from '../contas/acesso.js';
import { auditar } from '../contas/auditoria.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar } from '../seguranca/limites.js';
import { listarTemplates, obterTemplate } from './catalogo.js';

const m = mensagens.projectos;

// Template existente e data do evento entre hoje e o limite, no calendário de Luanda.
function prepararCriacao(codigo: string, dataEvento: string): { template: Template; previsao: ReturnType<typeof materializar> } {
  const template = obterTemplate(codigo);
  if (!template) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { template: mensagens.validacao.templateInvalido });
  const hoje = hojeEmLuanda();
  const dias = diasEntre(hoje, dataEvento);
  if (dias < 0) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { dataEvento: m.eventoNoPassado });
  if (dias > DIAS_MAXIMOS_ATE_EVENTO) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { dataEvento: m.eventoDemasiadoLonge });
  return { template, previsao: materializar(template.tarefas, dataEvento, hoje) };
}

const resumoPrevisao = (p: ReturnType<typeof materializar>): Previsao => ({
  diasDisponiveis: p.diasDisponiveis,
  diasNecessarios: p.diasNecessarios,
  comprimido: p.comprimido,
  avisos: p.avisos,
});

// IDs de projecto inválidos dão 404, como os que não existem ou não são da pessoa.
const idProjecto = z.object({ id: z.uuid() });

export function registarRotasProjectos(app: FastifyInstance, base: BaseDeDados, guardas: ReturnType<typeof criarGuardas>) {
  const { pool } = base;

  app.get('/api/templates', { preHandler: guardas.exigirSessao }, async () => listarTemplates());

  // Mostra os avisos antes de criar: tarefas críticas que já deviam ter começado.
  app.post('/api/projectos/previsao', { preHandler: guardas.exigirSessao }, async (pedido): Promise<Previsao> => {
    const dados = validar(previsaoProjecto, pedido.body);
    return resumoPrevisao(prepararCriacao(dados.template, dados.dataEvento).previsao);
  });

  app.post('/api/projectos', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const { utilizadorId } = pedido.sessao!;
    await limitar(pool, `criar-projecto:${utilizadorId}`, LIMITES.criarProjecto);
    const dados = validar(criarProjecto, pedido.body);
    const { template, previsao } = prepararCriacao(dados.template, dados.dataEvento);

    const resultado = await emTransaccao(pool, async (cliente) => {
      // Bloqueia o espaço até ao fim da transacção: dois pedidos em simultâneo não passam ambos o limite.
      const { rows: espacos } = await cliente.query<{ id: string; plan_code: CodigoPlano; plan_started_at: Date }>(
        `select w.id, w.plan_code, w.plan_started_at
           from workspace_members wm join workspaces w on w.id = wm.workspace_id
          where wm.user_id = $1
          order by (wm.role = 'owner') desc, wm.created_at
          limit 1
            for update of w`,
        [utilizadorId],
      );
      const espaco = espacos[0];
      if (!espaco) throw new ErroHttp(401, mensagens.contas.sessaoNecessaria);

      const limite = LIMITE_PROJECTOS[espaco.plan_code];
      if (limite !== null) {
        const { rows } = await cliente.query<{ n: number }>(
          'select count(*)::int as n from projects where workspace_id = $1 and created_at >= $2',
          [espaco.id, espaco.plan_started_at],
        );
        if (rows[0]!.n >= limite) throw new ErroHttp(403, m.limitePlano(mensagens.planos[espaco.plan_code], limite));
      }
      if (previsao.avisos.length > 0 && !dados.aceitarAvisos) return { avisosPorAceitar: true as const };

      const { rows: criados } = await cliente.query<{ id: string }>(
        `insert into projects (workspace_id, template_code, template_version, name, event_date, location, created_by)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [espaco.id, template.codigo, template.versao, dados.nome, dados.dataEvento, dados.local ?? null, utilizadorId],
      );
      const projectoId = criados[0]!.id;

      // Uma só instrução por tabela, com listas paralelas (parâmetros, nunca SQL concatenado).
      const tarefas = template.tarefas.map((t, i) => ({ t, d: previsao.tarefas[i]! }));
      await cliente.query(
        `insert into tasks (project_id, template_task_id, position, phase, category, title, role, start_date, end_date, critical, compressed, note)
         select $1, * from unnest($2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::date[], $9::date[], $10::bool[], $11::bool[], $12::text[])`,
        [
          projectoId,
          tarefas.map(({ t }) => t.id),
          tarefas.map((_, i) => i),
          tarefas.map(({ t }) => t.fase),
          tarefas.map(({ t }) => t.categoria),
          tarefas.map(({ t }) => t.titulo),
          tarefas.map(({ t }) => t.papel),
          tarefas.map(({ d }) => d.inicio),
          tarefas.map(({ d }) => d.fim),
          tarefas.map(({ t }) => t.critica),
          tarefas.map(({ d }) => d.comprimida),
          tarefas.map(({ t }) => t.nota),
        ],
      );
      // Rubricas do template, com valor zero.
      await cliente.query(
        `insert into budget_items (project_id, position, category, description, required, note)
         select $1, * from unnest($2::int[], $3::text[], $4::text[], $5::bool[], $6::text[])`,
        [
          projectoId,
          template.rubricas.map((_, i) => i),
          template.rubricas.map((r) => r.categoria),
          template.rubricas.map((r) => r.descricao),
          template.rubricas.map((r) => r.obrigatoria),
          template.rubricas.map((r) => r.nota),
        ],
      );
      await auditar(cliente, 'projecto.criado', {
        utilizadorId,
        ip: pedido.ip,
        detalhes: { projectoId, template: template.codigo, versao: template.versao, avisos: previsao.avisos.length },
      });
      return { projectoId };
    });

    if ('avisosPorAceitar' in resultado) {
      return resposta.code(409).send({ mensagem: m.avisosPorAceitar, avisos: previsao.avisos });
    }
    return resposta.code(201).send({ id: resultado.projectoId, avisos: previsao.avisos });
  });

  // Só os projectos dos espaços de que a pessoa é membro.
  app.get('/api/projectos', { preHandler: guardas.exigirSessao }, async (pedido): Promise<ResumoProjecto[]> => {
    const { rows } = await pool.query(
      `${SELECCAO_RESUMO}
        where p.workspace_id in (select workspace_id from workspace_members where user_id = $1)
        order by p.status, p.event_date, p.created_at`,
      [pedido.sessao!.utilizadorId],
    );
    return rows.map(paraResumo);
  });

  app.get('/api/projectos/:id', { preHandler: guardas.exigirSessao }, async (pedido): Promise<Projecto> => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
    const projecto = await lerProjecto(pool, parametros.data.id, pedido.sessao!.utilizadorId);
    // Não existe ou pertence a um espaço de que a pessoa não é membro: a mesma resposta nos dois casos.
    if (!projecto) throw new ErroHttp(404, m.naoEncontrado);
    return projecto;
  });
}

const SELECCAO_RESUMO = `
  select p.id, p.name, p.template_code, p.template_version, p.event_date, p.location, p.status, p.created_at,
         (select count(*)::int from tasks t where t.project_id = p.id) as tarefas,
         (select count(*)::int from tasks t where t.project_id = p.id and t.status = 'done') as concluidas
    from projects p`;

interface LinhaResumo {
  id: string;
  name: string;
  template_code: string;
  template_version: string;
  event_date: string;
  location: string | null;
  status: EstadoProjecto;
  created_at: Date;
  tarefas: number;
  concluidas: number;
}

const paraResumo = (l: LinhaResumo): ResumoProjecto => ({
  id: l.id,
  nome: l.name,
  template: l.template_code,
  dataEvento: l.event_date,
  local: l.location,
  estado: l.status,
  tarefas: l.tarefas,
  concluidas: l.concluidas,
});

// Autorização na própria consulta: o projecto só é lido se a pessoa for membro do espaço a que pertence.
export async function lerProjecto(pool: pg.Pool, projectoId: string, utilizadorId: string): Promise<Projecto | null> {
  const { rows } = await pool.query<LinhaResumo>(
    `${SELECCAO_RESUMO}
      where p.id = $1 and exists (select 1 from workspace_members wm where wm.workspace_id = p.workspace_id and wm.user_id = $2)`,
    [projectoId, utilizadorId],
  );
  const l = rows[0];
  if (!l) return null;
  const { rows: tarefas } = await pool.query<{
    id: string;
    template_task_id: string;
    phase: string;
    category: string;
    title: string;
    role: string;
    start_date: string;
    end_date: string;
    critical: boolean;
    compressed: boolean;
    note: string | null;
    status: EstadoTarefa;
  }>(
    `select id, template_task_id, phase, category, title, role, start_date, end_date, critical, compressed, note, status
       from tasks where project_id = $1 order by position`,
    [projectoId],
  );
  const { rows: itens } = await pool.query<{
    id: string;
    category: string;
    description: string;
    required: boolean;
    note: string | null;
    planned_cents: string;
    actual_cents: string;
  }>('select id, category, description, required, note, planned_cents, actual_cents from budget_items where project_id = $1 order by position', [
    projectoId,
  ]);
  return {
    ...paraResumo(l),
    nomeTemplate: obterTemplate(l.template_code)?.nome ?? l.template_code,
    versaoTemplate: l.template_version,
    criadoEm: l.created_at.toISOString(),
    tarefasDoProjecto: tarefas.map((t) => ({
      id: t.id,
      idTemplate: t.template_task_id,
      fase: t.phase,
      categoria: t.category,
      titulo: t.title,
      papel: t.role,
      inicio: t.start_date,
      fim: t.end_date,
      critica: t.critical,
      comprimida: t.compressed,
      nota: t.note,
      estado: t.status,
    })),
    orcamento: itens.map((i) => ({
      id: i.id,
      categoria: i.category,
      descricao: i.description,
      obrigatoria: i.required,
      nota: i.note,
      // bigint chega como texto; os valores cabem com folga num número (até 9 × 10^15 cêntimos).
      previstoCentimos: Number(i.planned_cents),
      realCentimos: Number(i.actual_cents),
    })),
  };
}
