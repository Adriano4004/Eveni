import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { dadosFornecedor, type DadosFornecedor } from '../../shared/esquemas.js';
import { type Fornecedor, MAX_FORNECEDORES_POR_ESPACO } from '../../shared/fornecedores.js';
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

const COLUNAS = 'id, name, category, phone, email, notes';

interface Linha {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

const paraFornecedor = (l: Linha): Fornecedor => ({ id: l.id, nome: l.name, categoria: l.category, telemovel: l.phone, email: l.email, notas: l.notes });

// Fornecedores de um espaço, por nome. Quem chama já verificou o acesso. Usada também na exportação.
export async function listarFornecedores(cliente: pg.Pool | pg.PoolClient, espacoId: string): Promise<Fornecedor[]> {
  const { rows } = await cliente.query<Linha>(`select ${COLUNAS} from suppliers where workspace_id = $1 order by lower(name), id`, [espacoId]);
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
    .query<Linha>(
      `insert into suppliers (workspace_id, name, category, phone, email, notes) values ($1, $2, $3, $4, $5, $6) returning ${COLUNAS}`,
      [espacoId, dados.nome, dados.categoria, dados.telemovel, dados.email, dados.notas],
    )
    .catch(nomeRepetido);
  return paraFornecedor(rows[0]!);
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
        .query<Linha>(
          `update suppliers set name = $3, category = $4, phone = $5, email = $6, notes = $7, updated_at = clock_timestamp()
            where id = $1 and workspace_id = $2 returning ${COLUNAS}`,
          [parametros.data.id, espacoId, dados.nome, dados.categoria, dados.telemovel, dados.email, dados.notas],
        )
        .catch(nomeRepetido);
      if (!rows[0]) throw new ErroHttp(404, m.naoEncontrado);
      return paraFornecedor(rows[0]);
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
}
