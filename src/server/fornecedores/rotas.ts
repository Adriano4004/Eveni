import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { avaliarFornecedor, dadosFornecedor, type DadosFornecedor } from '../../shared/esquemas.js';
import {
  type Avaliacao,
  type AvaliacaoNoHistorico,
  type AvaliacoesProjecto,
  type Fornecedor,
  MAX_FORNECEDORES_POR_ESPACO,
} from '../../shared/fornecedores.js';
import { mensagens } from '../../shared/mensagens.js';
import type { PapelNoProjecto } from '../../shared/projectos.js';
import type { criarGuardas } from '../contas/acesso.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import { ErroHttp, validar } from '../erros.js';
import { projectoParaAlterar } from '../projectos/alterar.js';
import { LIMITES, limitar } from '../seguranca/limites.js';

// Fornecedores do espaço de trabalho (decisão 019).
// - A lista completa (com contactos) gere-a o dono, sempre no seu próprio espaço (tirado da sessão).
// - Os editores de um projecto vêem a lista do espaço desse projecto e acrescentam fornecedores, para os
//   escolher nas rubricas.
// - Os leitores não vêem a lista: só o nome do fornecedor de cada rubrica (ex.: o cliente de uma agência).

const m = mensagens.fornecedores;
const mp = mensagens.projectos;
const idFornecedor = z.object({ id: z.uuid() });
const idProjecto = z.object({ id: z.uuid() });

// Com a média e o número de avaliações.
const SELECCAO = `
  select s.id, s.name, s.category, s.phone, s.email, s.notes,
         (select round(avg(r.stars)::numeric, 1)::float8 from supplier_ratings r where r.supplier_id = s.id) as media,
         (select count(*)::int from supplier_ratings r where r.supplier_id = s.id) as avaliacoes
    from suppliers s`;

interface Linha {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  media: number | null;
  avaliacoes: number;
}

const paraFornecedor = (l: Linha): Fornecedor => ({
  id: l.id,
  nome: l.name,
  categoria: l.category,
  telemovel: l.phone,
  email: l.email,
  notas: l.notes,
  media: l.media,
  avaliacoes: l.avaliacoes,
});

async function lerFornecedor(cliente: pg.PoolClient, id: string): Promise<Fornecedor> {
  const { rows } = await cliente.query<Linha>(`${SELECCAO} where s.id = $1`, [id]);
  return paraFornecedor(rows[0]!);
}

// Fornecedores de um espaço, por nome. Quem chama já verificou o acesso. Usada também na exportação.
export async function listarFornecedores(cliente: pg.Pool | pg.PoolClient, espacoId: string): Promise<Fornecedor[]> {
  const { rows } = await cliente.query<Linha>(`${SELECCAO} where s.workspace_id = $1 order by lower(s.name), s.id`, [espacoId]);
  return rows.map(paraFornecedor);
}

// O espaço de que a pessoa é dona (o mesmo critério da equipa). Nas alterações, fica bloqueado.
async function espacoDoDono(cliente: pg.Pool | pg.PoolClient, utilizadorId: string, bloquear: boolean): Promise<string> {
  const { rows } = await cliente.query<{ id: string }>(
    `select w.id from workspace_members wm join workspaces w on w.id = wm.workspace_id
      where wm.user_id = $1 and wm.role = 'owner' order by wm.created_at limit 1 ${bloquear ? 'for update of w' : ''}`,
    [utilizadorId],
  );
  if (!rows[0]) throw new ErroHttp(401, mensagens.contas.sessaoNecessaria);
  return rows[0].id;
}

// Nome repetido no espaço (sem ligar a maiúsculas): erro junto ao campo.
function nomeRepetido(erro: unknown): never {
  if ((erro as { constraint?: string }).constraint === 'suppliers_nome_unico') throw new ErroHttp(409, m.repetido, { nome: m.repetido });
  throw erro;
}

async function criar(cliente: pg.PoolClient, espacoId: string, dados: DadosFornecedor): Promise<Fornecedor> {
  const { rows: contagem } = await cliente.query<{ n: number }>('select count(*)::int as n from suppliers where workspace_id = $1', [espacoId]);
  if (contagem[0]!.n >= MAX_FORNECEDORES_POR_ESPACO) throw new ErroHttp(409, m.limite(MAX_FORNECEDORES_POR_ESPACO));
  const { rows } = await cliente
    .query<{ id: string }>(
      'insert into suppliers (workspace_id, name, category, phone, email, notes) values ($1, $2, $3, $4, $5, $6) returning id',
      [espacoId, dados.nome, dados.categoria, dados.telemovel, dados.email, dados.notas],
    )
    .catch(nomeRepetido);
  return lerFornecedor(cliente, rows[0]!.id);
}

export function registarRotasFornecedores(app: FastifyInstance, base: BaseDeDados, guardas: ReturnType<typeof criarGuardas>) {
  const { pool } = base;
  const travar = (utilizadorId: string) => limitar(pool, `fornecedores:${utilizadorId}`, LIMITES.alterarFornecedores);

  // Lista do próprio espaço (o dono).
  app.get('/api/fornecedores', { preHandler: guardas.exigirSessao }, async (pedido): Promise<Fornecedor[]> => {
    return listarFornecedores(pool, await espacoDoDono(pool, pedido.sessao!.utilizadorId, false));
  });

  app.post('/api/fornecedores', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(dadosFornecedor, pedido.body);
    const criado = await emTransaccao(pool, async (cliente) => criar(cliente, await espacoDoDono(cliente, utilizadorId, true), dados));
    return resposta.code(201).send(criado);
  });

  // Alterar e apagar: só fornecedores do próprio espaço (um ID de outro espaço dá 404).
  app.post('/api/fornecedores/:id', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<Fornecedor> => {
    const parametros = idFornecedor.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(dadosFornecedor, pedido.body);
    return emTransaccao(pool, async (cliente) => {
      const espacoId = await espacoDoDono(cliente, utilizadorId, true);
      const { rows } = await cliente
        .query(
          `update suppliers set name = $3, category = $4, phone = $5, email = $6, notes = $7, updated_at = clock_timestamp()
            where id = $1 and workspace_id = $2 returning id`,
          [parametros.data.id, espacoId, dados.nome, dados.categoria, dados.telemovel, dados.email, dados.notas],
        )
        .catch(nomeRepetido);
      if (!rows[0]) throw new ErroHttp(404, m.naoEncontrado);
      return lerFornecedor(cliente, parametros.data.id);
    });
  });

  // Apagar: as rubricas que o usavam ficam sem fornecedor (a base de dados limpa-as).
  app.post('/api/fornecedores/:id/remover', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = idFornecedor.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    await emTransaccao(pool, async (cliente) => {
      const espacoId = await espacoDoDono(cliente, utilizadorId, true);
      const { rows } = await cliente.query('delete from suppliers where id = $1 and workspace_id = $2 returning id', [parametros.data.id, espacoId]);
      if (rows.length === 0) throw new ErroHttp(404, m.naoEncontrado);
    });
    return resposta.code(204).send();
  });

  // Fornecedores do espaço de um projecto, para os escolher nas rubricas: dono e editores (os leitores não).
  app.get('/api/projectos/:id/fornecedores', { preHandler: guardas.exigirSessao }, async (pedido): Promise<Fornecedor[]> => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const { rows } = await pool.query<{ workspace_id: string; papel: PapelNoProjecto | null }>(
      'select p.workspace_id, papel_no_projecto(p.id, $2) as papel from projects p where p.id = $1',
      [parametros.data.id, pedido.sessao!.utilizadorId],
    );
    if (!rows[0]?.papel) throw new ErroHttp(404, mp.naoEncontrado);
    if (rows[0].papel === 'viewer') throw new ErroHttp(403, m.soDonoEEditores);
    return listarFornecedores(pool, rows[0].workspace_id);
  });

  // Acrescentar um fornecedor a partir de um projecto (dono ou editor, projecto activo): fica no espaço do projecto.
  app.post('/api/projectos/:id/fornecedores', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const projectoId = parametros.data.id;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(dadosFornecedor, pedido.body);
    const criado = await emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      // Depois do projecto, o espaço (a contagem do limite fica serializada com as outras criações).
      const { rows } = await cliente.query<{ id: string }>(
        'select w.id from workspaces w join projects p on p.workspace_id = w.id where p.id = $1 for update of w',
        [projectoId],
      );
      return criar(cliente, rows[0]!.id, dados);
    });
    return resposta.code(201).send(criado);
  });

  // Histórico de avaliações de um fornecedor do próprio espaço (o dono).
  app.get('/api/fornecedores/:id/avaliacoes', { preHandler: guardas.exigirSessao }, async (pedido): Promise<AvaliacaoNoHistorico[]> => {
    const parametros = idFornecedor.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
    const espacoId = await espacoDoDono(pool, pedido.sessao!.utilizadorId, false);
    const { rows: existe } = await pool.query('select 1 from suppliers where id = $1 and workspace_id = $2', [parametros.data.id, espacoId]);
    if (existe.length === 0) throw new ErroHttp(404, m.naoEncontrado);
    const { rows } = await pool.query<{ stars: number; comment: string | null; name: string; event_date: string; updated_at: Date }>(
      `select r.stars, r.comment, p.name, p.event_date, r.updated_at
         from supplier_ratings r join projects p on p.id = r.project_id
        where r.supplier_id = $1 order by p.event_date desc, r.id`,
      [parametros.data.id],
    );
    return rows.map((r) => ({ estrelas: r.stars, comentario: r.comment, projecto: r.name, dataEvento: r.event_date, avaliadaEm: r.updated_at.toISOString() }));
  });

  // Fornecedores a avaliar num projecto: os escolhidos nalguma rubrica. Dono e editores (também com o projecto
  // arquivado: avalia-se no fim, que é quando se arquiva).
  app.get('/api/projectos/:id/avaliacoes', { preHandler: guardas.exigirSessao }, async (pedido): Promise<AvaliacoesProjecto> => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const projectoId = parametros.data.id;
    const projecto = await projectoParaAvaliar(pool, projectoId, pedido.sessao!.utilizadorId);
    const { rows } = await pool.query<{ id: string; name: string; category: string; stars: number | null; comment: string | null }>(
      `select s.id, s.name, s.category, r.stars, r.comment
         from suppliers s left join supplier_ratings r on r.supplier_id = s.id and r.project_id = $1
        where s.id in (select supplier_id from budget_items where project_id = $1)
        order by lower(s.name), s.id`,
      [projectoId],
    );
    return {
      aberta: projecto.aberta,
      dataEvento: projecto.event_date,
      fornecedores: rows.map((r) => ({
        id: r.id,
        nome: r.name,
        categoria: r.category,
        avaliacao: r.stars === null ? null : { estrelas: r.stars, comentario: r.comment },
      })),
    };
  });

  // Avaliar (ou mudar a avaliação de) um fornecedor neste projecto.
  app.post('/api/projectos/:id/avaliacoes/:fornecedor', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<Avaliacao> => {
    const parametros = z.object({ id: z.uuid(), fornecedor: z.uuid() }).safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
    const { id: projectoId, fornecedor } = parametros.data;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(avaliarFornecedor, pedido.body);
    return emTransaccao(pool, async (cliente) => {
      const projecto = await projectoParaAvaliar(cliente, projectoId, utilizadorId, true);
      if (!projecto.aberta) throw new ErroHttp(409, m.avaliacaoAntesDoEvento);
      // Só fornecedores escolhidos nalguma rubrica deste projecto (logo, do mesmo espaço; o gatilho garante-o também).
      // Bloqueio em partilha do fornecedor: apagá-lo ao mesmo tempo espera, em vez de a gravação falhar a meio.
      const { rows } = await cliente.query(
        `select 1 from budget_items b join suppliers s on s.id = b.supplier_id
          where b.project_id = $1 and b.supplier_id = $2 limit 1 for share of s`,
        [projectoId, fornecedor],
      );
      if (rows.length === 0) throw new ErroHttp(400, m.naoTrabalhouNoEvento);
      await cliente.query(
        `insert into supplier_ratings (supplier_id, project_id, stars, comment, rated_by) values ($1, $2, $3, $4, $5)
         on conflict (supplier_id, project_id) do update
           set stars = excluded.stars, comment = excluded.comment, rated_by = excluded.rated_by, updated_at = clock_timestamp()`,
        [fornecedor, projectoId, dados.estrelas, dados.comentario, utilizadorId],
      );
      return { estrelas: dados.estrelas, comentario: dados.comentario };
    });
  });
}

// Dono ou editor do projecto (arquivado ou não). `aberta`: o dia do evento já chegou, no calendário de Luanda.
// Nas alterações, o projecto fica bloqueado em partilha (arquivar ou mudar acessos ao mesmo tempo espera).
async function projectoParaAvaliar(cliente: pg.Pool | pg.PoolClient, projectoId: string, utilizadorId: string, bloquear = false) {
  const { rows } = await cliente.query<{ papel: PapelNoProjecto | null; event_date: string; aberta: boolean }>(
    `select papel_no_projecto(p.id, $2) as papel, p.event_date, p.event_date <= (now() at time zone 'Africa/Luanda')::date as aberta
       from projects p where p.id = $1 ${bloquear ? 'for share of p' : ''}`,
    [projectoId, utilizadorId],
  );
  const projecto = rows[0];
  if (!projecto?.papel) throw new ErroHttp(404, mp.naoEncontrado);
  if (projecto.papel === 'viewer') throw new ErroHttp(403, mp.soLeitura);
  return projecto;
}
