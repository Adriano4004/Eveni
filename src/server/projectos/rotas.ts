import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { diasEntre, hojeEmLuanda } from '../../shared/datas.js';
import { actualizarTarefa, type CodigoPlano, criarProjecto, previsaoProjecto } from '../../shared/esquemas.js';
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
  type PapelNoProjecto,
  type TarefaProjecto,
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
const idTarefa = z.object({ id: z.uuid(), tarefa: z.uuid() });

export function registarRotasProjectos(app: FastifyInstance, base: BaseDeDados, guardas: ReturnType<typeof criarGuardas>) {
  const { pool } = base;

  app.get('/api/templates', { preHandler: guardas.exigirSessao }, async () => listarTemplates());

  // Mostra os avisos antes de criar: tarefas críticas que já deviam ter começado.
  app.post('/api/projectos/previsao', { preHandler: guardas.exigirSessao }, async (pedido): Promise<Previsao> => {
    await limitar(pool, `prever-projecto:${pedido.sessao!.utilizadorId}`, LIMITES.preverProjecto);
    const dados = validar(previsaoProjecto, pedido.body);
    return resumoPrevisao(prepararCriacao(dados.template, dados.dataEvento).previsao);
  });

  app.post('/api/projectos', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const { utilizadorId } = pedido.sessao!;
    await limitar(pool, `criar-projecto:${utilizadorId}`, LIMITES.criarProjecto);
    const dados = validar(criarProjecto, pedido.body);
    const { template, previsao } = prepararCriacao(dados.template, dados.dataEvento);

    const resultado = await emTransaccao(pool, async (cliente) => {
      // O espaço de que a pessoa é dona (os papéis dos outros membros chegam na Fase 4).
      // Bloqueia o espaço até ao fim da transacção: dois pedidos em simultâneo não passam ambos o limite.
      const { rows: espacos } = await cliente.query<{ id: string; plan_code: CodigoPlano; plan_started_at: Date }>(
        `select w.id, w.plan_code, w.plan_started_at
           from workspace_members wm join workspaces w on w.id = wm.workspace_id
          where wm.user_id = $1 and wm.role = 'owner'
          order by wm.created_at
          limit 1
            for update of w`,
        [utilizadorId],
      );
      const espaco = espacos[0];
      if (!espaco) throw new ErroHttp(403, mensagens.erros.semPermissao);

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

  // Só os projectos a que a pessoa tem acesso (dono do espaço ou membro do projecto).
  app.get('/api/projectos', { preHandler: guardas.exigirSessao }, async (pedido): Promise<ResumoProjecto[]> => {
    const { rows } = await pool.query(
      `${seleccaoResumo('$1')}
        where papel_no_projecto(p.id, $1) is not null
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

  // Arquivar e restaurar. Não há eliminação de projectos pelo utilizador (CLAUDE.md, secção 8): arquivar
  // esconde o projecto da lista principal e torna-o só de leitura, mas continua a contar para o limite
  // do plano. Só o dono do espaço de trabalho o pode fazer. Repetir o pedido não muda nada.
  for (const [accao, novoEstado] of [
    ['arquivar', 'archived'],
    ['restaurar', 'active'],
  ] as const) {
    app.post(`/api/projectos/:id/${accao}`, { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<ResumoProjecto> => {
      const parametros = idProjecto.safeParse(pedido.params);
      if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
      const projectoId = parametros.data.id;
      const { utilizadorId } = pedido.sessao!;

      await emTransaccao(pool, async (cliente) => {
        const { rows } = await cliente.query<{ status: EstadoProjecto; papel: PapelNoProjecto | null }>(
          'select p.status, papel_no_projecto(p.id, $2) as papel from projects p where p.id = $1 for update of p',
          [projectoId, utilizadorId],
        );
        const projecto = rows[0];
        if (!projecto?.papel) throw new ErroHttp(404, m.naoEncontrado);
        if (projecto.papel !== 'owner') throw new ErroHttp(403, m.soDonoArquiva);
        if (projecto.status === novoEstado) return;
        await cliente.query(
          `update projects set status = $2, archived_at = case when $2 = 'archived' then clock_timestamp() else null end where id = $1`,
          [projectoId, novoEstado],
        );
        await auditar(cliente, novoEstado === 'archived' ? 'projecto.arquivado' : 'projecto.restaurado', {
          utilizadorId,
          ip: pedido.ip,
          detalhes: { projectoId },
        });
      });

      const { rows } = await pool.query<LinhaResumo>(`${seleccaoResumo('$2')} where p.id = $1`, [projectoId, utilizadorId]);
      return paraResumo(rows[0]!);
    });
  }

  // Mudar o estado e/ou o responsável de uma tarefa.
  // Verifica no servidor, numa só transacção: acesso ao projecto pelo espaço de trabalho, que a tarefa é
  // desse projecto, que o projecto não está arquivado e que o responsável é membro do mesmo espaço
  // (CLAUDE.md, secção 5, regra 5: também os IDs secundários enviados no corpo do pedido).
  // Por agora, todos os membros do espaço podem alterar; os papéis por projecto chegam na Fase 4.
  app.post('/api/projectos/:id/tarefas/:tarefa', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<TarefaProjecto> => {
    const parametros = idTarefa.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.tarefaNaoEncontrada);
    const { id: projectoId, tarefa: tarefaId } = parametros.data;
    const dados = validar(actualizarTarefa, pedido.body);
    const { utilizadorId } = pedido.sessao!;

    await emTransaccao(pool, async (cliente) => {
      // Bloqueia a tarefa e o projecto: arquivar o projecto ao mesmo tempo espera por esta alteração.
      const { rows } = await cliente.query<{ status: EstadoProjecto; papel: PapelNoProjecto | null }>(
        `select p.status, papel_no_projecto(p.id, $3) as papel from tasks t join projects p on p.id = t.project_id
          where t.id = $1 and t.project_id = $2
            for update of t, p`,
        [tarefaId, projectoId, utilizadorId],
      );
      const projecto = rows[0];
      // Tarefa inexistente, de outro projecto ou de um projecto sem acesso: a mesma resposta.
      if (!projecto?.papel) throw new ErroHttp(404, m.tarefaNaoEncontrada);
      if (projecto.papel === 'viewer') throw new ErroHttp(403, m.soLeitura);
      if (projecto.status === 'archived') throw new ErroHttp(409, m.arquivado);

      // O responsável tem de ter acesso a este projecto (não basta ser do espaço de trabalho).
      if (dados.responsavelId) {
        const { rows: acesso } = await cliente.query<{ papel: string | null }>('select papel_no_projecto($1, $2) as papel', [
          projectoId,
          dados.responsavelId,
        ]);
        if (!acesso[0]?.papel) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { responsavelId: mensagens.validacao.responsavelInvalido });
      }

      await cliente.query(
        `update tasks set
            status = coalesce($2, status),
            assignee_id = case when $3 then $4::uuid else assignee_id end,
            completed_at = case when $2 is null then completed_at
                                when $2 = 'done' then coalesce(completed_at, clock_timestamp())
                                else null end,
            -- clock_timestamp(): a hora real da alteração (now() seria a do início da transacção, que pode
            -- ter esperado pelo bloqueio do projecto).
            updated_at = clock_timestamp()
          where id = $1`,
        [tarefaId, dados.estado ?? null, dados.responsavelId !== undefined, dados.responsavelId ?? null],
      );
    });

    const { rows } = await pool.query<LinhaTarefa>(`${SELECCAO_TAREFAS} where t.id = $1`, [tarefaId]);
    return paraTarefa(rows[0]!);
  });
}

// O dia de hoje no calendário de Luanda, calculado pela base de dados (igual a hojeEmLuanda()).
const HOJE_SQL = "(now() at time zone 'Africa/Luanda')::date";

// Resumo do projecto, com o papel de quem está a ver. `utilizador` é o marcador do parâmetro ($1, $2…),
// nunca um valor vindo do pedido.
const seleccaoResumo = (utilizador: '$1' | '$2') => `
  select papel_no_projecto(p.id, ${utilizador}) as papel, p.id, p.workspace_id, p.name, p.template_code, p.template_version, p.event_date, p.location, p.status, p.created_at,
         ${HOJE_SQL}::text as hoje,
         (select count(*)::int from tasks t where t.project_id = p.id) as tarefas,
         (select count(*)::int from tasks t where t.project_id = p.id and t.status = 'done') as concluidas,
         (select count(*)::int from tasks t
           where t.project_id = p.id and t.critical and t.status <> 'done' and t.end_date < ${HOJE_SQL}) as criticas_em_atraso
    from projects p`;

interface LinhaResumo {
  papel: PapelNoProjecto | null;
  id: string;
  workspace_id: string;
  name: string;
  template_code: string;
  template_version: string;
  event_date: string;
  location: string | null;
  status: EstadoProjecto;
  created_at: Date;
  hoje: string;
  tarefas: number;
  concluidas: number;
  criticas_em_atraso: number;
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
  criticasEmAtraso: l.criticas_em_atraso,
  papel: l.papel!,
});

const SELECCAO_TAREFAS = `
  select t.id, t.template_task_id, t.phase, t.category, t.title, t.role, t.start_date, t.end_date, t.critical,
         t.compressed, t.note, t.status, t.completed_at, u.id as assignee_id, u.name as assignee_name,
         (t.status <> 'done' and t.end_date < ${HOJE_SQL}) as em_atraso
    from tasks t left join users u on u.id = t.assignee_id`;

interface LinhaTarefa {
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
  completed_at: Date | null;
  assignee_id: string | null;
  assignee_name: string | null;
  em_atraso: boolean;
}

const paraTarefa = (t: LinhaTarefa): TarefaProjecto => ({
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
  responsavel: t.assignee_id ? { id: t.assignee_id, nome: t.assignee_name ?? '' } : null,
  emAtraso: t.em_atraso,
  concluidaEm: t.completed_at ? t.completed_at.toISOString() : null,
});

// Autorização na própria consulta: o projecto só é lido se a pessoa tiver acesso a ele.
export async function lerProjecto(pool: pg.Pool, projectoId: string, utilizadorId: string): Promise<Projecto | null> {
  const { rows } = await pool.query<LinhaResumo>(
    `${seleccaoResumo('$2')}
      where p.id = $1 and papel_no_projecto(p.id, $2) is not null`,
    [projectoId, utilizadorId],
  );
  const l = rows[0];
  if (!l) return null;
  const { rows: tarefas } = await pool.query<LinhaTarefa>(`${SELECCAO_TAREFAS} where t.project_id = $1 order by t.position`, [projectoId]);
  // Quem tem acesso ao projecto (pode ser responsável). Só o nome: nunca o e-mail nem outros dados.
  const { rows: membros } = await pool.query<{ id: string; name: string }>(
    `select u.id, u.name from users u
      where u.id in (select user_id from workspace_members where workspace_id = $1 and role = 'owner'
                     union select user_id from project_members where project_id = $2)
      order by u.name, u.id`,
    [l.workspace_id, projectoId],
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
    hoje: l.hoje,
    membros: membros.map((m) => ({ id: m.id, nome: m.name })),
    podeArquivar: l.papel === 'owner',
    tarefasDoProjecto: tarefas.map(paraTarefa),
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
