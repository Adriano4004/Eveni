import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import {
  type Convidado,
  calcularTotais,
  type LigacaoRsvp,
  type ListaConvidados,
  MAX_CONVIDADOS_POR_PROJECTO,
  type Resposta,
  type ResultadoImportacao,
} from '../../shared/convidados.js';
import { actualizarConvidado, type DadosConvidado, dadosConvidado, importarConvidados } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import type { EstadoProjecto, PapelNoProjecto } from '../../shared/projectos.js';
import type { Config } from '../config.js';
import type { criarGuardas } from '../contas/acesso.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar } from '../seguranca/limites.js';
import { criarLigacoesRsvp } from './rsvp.js';

// Lista de convidados de um projecto (decisão 018). Mesma regra de acesso das tarefas (papel_no_projecto):
// todos os que têm acesso vêem; só o dono e os editores alteram, e só com o projecto activo.

const m = mensagens.convidados;
const mp = mensagens.projectos;

// IDs inválidos dão 404, como os que não existem ou não são da pessoa.
const idProjecto = z.object({ id: z.uuid() });
const idConvidado = z.object({ id: z.uuid(), convidado: z.uuid() });

const SELECCAO = `select id, name, phone, email, plus_ones_allowed, response, plus_ones_confirmed, responded_at from guests`;

interface Linha {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  plus_ones_allowed: number;
  response: Resposta;
  plus_ones_confirmed: number;
  responded_at: Date | null;
}

const paraConvidado = (l: Linha): Convidado => ({
  id: l.id,
  nome: l.name,
  telemovel: l.phone,
  email: l.email,
  acompanhantes: l.plus_ones_allowed,
  resposta: l.response,
  acompanhantesConfirmados: l.plus_ones_confirmed,
  respondidoEm: l.responded_at ? l.responded_at.toISOString() : null,
});

// Convidados de um projecto, por nome. Quem chama já verificou o acesso. Usada também na exportação de dados.
export async function listarConvidados(cliente: pg.Pool | pg.PoolClient, projectoId: string): Promise<Convidado[]> {
  const { rows } = await cliente.query<Linha>(`${SELECCAO} where project_id = $1 order by lower(name), created_at, id`, [projectoId]);
  return rows.map(paraConvidado);
}

// Bloqueia o projecto (primeiro o projecto, depois os convidados: a mesma ordem das tarefas) e verifica que
// a pessoa o pode alterar. Com o projecto bloqueado, as verificações de repetidos e do limite não são
// ultrapassadas por outro pedido em simultâneo.
async function projectoParaAlterar(cliente: pg.PoolClient, projectoId: string, utilizadorId: string) {
  const { rows } = await cliente.query<{ status: EstadoProjecto; papel: PapelNoProjecto | null }>(
    'select p.status, papel_no_projecto(p.id, $2) as papel from projects p where p.id = $1 for update of p',
    [projectoId, utilizadorId],
  );
  const projecto = rows[0];
  if (!projecto?.papel) throw new ErroHttp(404, mp.naoEncontrado);
  if (projecto.papel === 'viewer') throw new ErroHttp(403, mp.soLeitura);
  if (projecto.status === 'archived') throw new ErroHttp(409, mp.arquivado);
}

// Telemóvel ou e-mail já usado por outro convidado do projecto: erro junto ao campo.
async function verificarRepetido(cliente: pg.PoolClient, projectoId: string, dados: DadosConvidado, excepto: string | null) {
  const { rows } = await cliente.query<{ telemovel: boolean; email: boolean }>(
    `select coalesce(bool_or(phone = $2), false) as telemovel, coalesce(bool_or(email = $3), false) as email
       from guests where project_id = $1 and id is distinct from $4 and (phone = $2 or email = $3)`,
    [projectoId, dados.telemovel, dados.email, excepto],
  );
  if (rows[0]?.telemovel) throw new ErroHttp(409, m.telemovelRepetido, { telemovel: m.telemovelRepetido });
  if (rows[0]?.email) throw new ErroHttp(409, m.emailRepetido, { email: m.emailRepetido });
}

async function contarConvidados(cliente: pg.PoolClient, projectoId: string): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>('select count(*)::int as n from guests where project_id = $1', [projectoId]);
  return rows[0]!.n;
}

export function registarRotasConvidados(app: FastifyInstance, config: Config, base: BaseDeDados, guardas: ReturnType<typeof criarGuardas>) {
  const { pool } = base;
  const ligacoes = criarLigacoesRsvp(config);
  const travar = (utilizadorId: string) => limitar(pool, `convidados:${utilizadorId}`, LIMITES.alterarConvidados);

  app.get('/api/projectos/:id/convidados', { preHandler: guardas.exigirSessao }, async (pedido): Promise<ListaConvidados> => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const projectoId = parametros.data.id;
    const { rows } = await pool.query<{ id: string; name: string; event_date: string; status: EstadoProjecto; papel: PapelNoProjecto | null }>(
      'select p.id, p.name, p.event_date, p.status, papel_no_projecto(p.id, $2) as papel from projects p where p.id = $1',
      [projectoId, pedido.sessao!.utilizadorId],
    );
    const projecto = rows[0];
    // Não existe ou a pessoa não tem acesso: a mesma resposta nos dois casos.
    if (!projecto?.papel) throw new ErroHttp(404, mp.naoEncontrado);
    const convidados = await listarConvidados(pool, projectoId);
    return {
      projecto: { id: projecto.id, nome: projecto.name, dataEvento: projecto.event_date },
      podeAlterar: projecto.papel !== 'viewer' && projecto.status === 'active',
      convidados,
      totais: calcularTotais(convidados),
    };
  });

  app.post('/api/projectos/:id/convidados', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const projectoId = parametros.data.id;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(dadosConvidado, pedido.body);
    const criado = await emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      if ((await contarConvidados(cliente, projectoId)) >= MAX_CONVIDADOS_POR_PROJECTO) throw new ErroHttp(409, m.limite(MAX_CONVIDADOS_POR_PROJECTO));
      await verificarRepetido(cliente, projectoId, dados, null);
      const { rows } = await cliente.query<Linha>(
        `insert into guests (project_id, name, phone, email, plus_ones_allowed) values ($1, $2, $3, $4, $5)
         returning id, name, phone, email, plus_ones_allowed, response, plus_ones_confirmed, responded_at`,
        [projectoId, dados.nome, dados.telemovel, dados.email, dados.acompanhantes],
      );
      return paraConvidado(rows[0]!);
    });
    return resposta.code(201).send(criado);
  });

  // Importação de uma lista colada do Excel (já partida em linhas pelo ecrã, com lerColagem).
  // Tudo ou nada quanto a erros: se uma linha for inválida, não se importa nenhuma e devolvem-se os erros
  // por linha. As repetidas (telemóvel ou e-mail já na lista, ou repetido na colagem) ignoram-se e listam-se.
  app.post('/api/projectos/:id/convidados/importar', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const projectoId = parametros.data.id;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const { linhas } = validar(importarConvidados, pedido.body);

    const erros: { linha: number; erro: string }[] = [];
    const validas: { linha: number; dados: DadosConvidado }[] = [];
    for (const l of linhas) {
      const r = dadosConvidado.safeParse(l);
      if (r.success) validas.push({ linha: l.linha, dados: r.data });
      else erros.push({ linha: l.linha, erro: r.error.issues[0]!.message });
    }
    if (erros.length > 0) return resposta.code(400).send({ mensagem: m.importacaoComErros, linhas: erros });

    const resultado = await emTransaccao(pool, async (cliente): Promise<ResultadoImportacao> => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      const { rows: existentes } = await cliente.query<{ phone: string | null; email: string | null }>(
        'select phone, email from guests where project_id = $1',
        [projectoId],
      );
      const telemoveis = new Set(existentes.map((e) => e.phone).filter(Boolean));
      const emails = new Set(existentes.map((e) => e.email).filter(Boolean));
      const novos: DadosConvidado[] = [];
      const repetidos: ResultadoImportacao['repetidos'] = [];
      for (const { linha, dados } of validas) {
        if ((dados.telemovel && telemoveis.has(dados.telemovel)) || (dados.email && emails.has(dados.email))) {
          repetidos.push({ linha, nome: dados.nome });
          continue;
        }
        if (dados.telemovel) telemoveis.add(dados.telemovel);
        if (dados.email) emails.add(dados.email);
        novos.push(dados);
      }
      if (existentes.length + novos.length > MAX_CONVIDADOS_POR_PROJECTO) throw new ErroHttp(409, m.limite(MAX_CONVIDADOS_POR_PROJECTO));
      if (novos.length > 0) {
        await cliente.query(
          `insert into guests (project_id, name, phone, email, plus_ones_allowed)
           select $1, * from unnest($2::text[], $3::text[], $4::text[], $5::int[])`,
          [projectoId, novos.map((n) => n.nome), novos.map((n) => n.telemovel), novos.map((n) => n.email), novos.map((n) => n.acompanhantes)],
        );
      }
      return { importados: novos.length, repetidos };
    });
    return resultado;
  });

  // Alterar os dados de um convidado e, se o organizador quiser, a resposta (ex.: respondeu por telefone).
  app.post('/api/projectos/:id/convidados/:convidado', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<Convidado> => {
    const parametros = idConvidado.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
    const { id: projectoId, convidado: convidadoId } = parametros.data;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(actualizarConvidado, pedido.body);
    return emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      // O convidado tem de ser deste projecto (CLAUDE.md, secção 5, regra 5).
      const { rows: actuais } = await cliente.query<Linha>(`${SELECCAO} where id = $1 and project_id = $2 for update`, [convidadoId, projectoId]);
      const actual = actuais[0];
      if (!actual) throw new ErroHttp(404, m.naoEncontrado);
      await verificarRepetido(cliente, projectoId, dados, convidadoId);

      const novaResposta = dados.resposta ?? actual.response;
      // Só quem vai tem acompanhantes confirmados, nunca mais do que os permitidos (mesmo que o organizador
      // reduza os permitidos depois de o convidado responder).
      const confirmados = novaResposta === 'yes' ? Math.min(dados.acompanhantesConfirmados ?? actual.plus_ones_confirmed, dados.acompanhantes) : 0;
      const { rows } = await cliente.query<Linha>(
        `update guests set name = $2, phone = $3, email = $4, plus_ones_allowed = $5, response = $6, plus_ones_confirmed = $7,
                responded_at = case when $6 = 'pending' then null when $6 = response then responded_at else clock_timestamp() end,
                updated_at = clock_timestamp()
          where id = $1
          returning id, name, phone, email, plus_ones_allowed, response, plus_ones_confirmed, responded_at`,
        [convidadoId, dados.nome, dados.telemovel, dados.email, dados.acompanhantes, novaResposta, confirmados],
      );
      return paraConvidado(rows[0]!);
    });
  });

  app.post('/api/projectos/:id/convidados/:convidado/remover', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = idConvidado.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
    const { id: projectoId, convidado: convidadoId } = parametros.data;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    await emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      const { rows } = await cliente.query('delete from guests where id = $1 and project_id = $2 returning id', [convidadoId, projectoId]);
      if (rows.length === 0) throw new ErroHttp(404, m.naoEncontrado);
    });
    return resposta.code(204).send();
  });

  // Ligação de RSVP de um convidado, para o organizador a partilhar. Só o dono e os editores, com o projecto
  // activo: os leitores não a recebem, porque com ela se responde em nome do convidado. "nova" troca a chave:
  // a ligação antiga deixa de funcionar (ex.: foi enviada para a pessoa errada).
  for (const [caminho, trocar] of [
    ['ligacao', false],
    ['ligacao/nova', true],
  ] as const) {
    app.post(`/api/projectos/:id/convidados/:convidado/${caminho}`, { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<LigacaoRsvp> => {
      const parametros = idConvidado.safeParse(pedido.params);
      if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
      const { id: projectoId, convidado: convidadoId } = parametros.data;
      const { utilizadorId } = pedido.sessao!;
      await travar(utilizadorId);
      const chave = await emTransaccao(pool, async (cliente) => {
        await projectoParaAlterar(cliente, projectoId, utilizadorId);
        const { rows } = await cliente.query<{ rsvp_key: string }>(
          trocar
            ? 'update guests set rsvp_key = gen_random_uuid(), updated_at = clock_timestamp() where id = $1 and project_id = $2 returning rsvp_key'
            : 'select rsvp_key from guests where id = $1 and project_id = $2',
          [convidadoId, projectoId],
        );
        if (!rows[0]) throw new ErroHttp(404, m.naoEncontrado);
        return rows[0].rsvp_key;
      });
      return { ligacao: ligacoes.ligacao(chave) };
    });
  }
}
