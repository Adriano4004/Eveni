import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { type Convidado, MAX_MESAS_POR_PROJECTO, type Mesa } from '../../shared/convidados.js';
import { criarVariasMesas, dadosMesa, sentarConvidado } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import type { criarGuardas } from '../contas/acesso.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar } from '../seguranca/limites.js';
import { projectoParaAlterar } from '../projectos/alterar.js';
import { listarConvidados, listarMesas } from './rotas.js';

// Mesas e lugares (decisão 018): cada convidado fica numa mesa, sem lugar numerado. A lotação conta com os
// acompanhantes (ver lugaresDoConvidado). Passar da lotação é permitido e só dá um aviso no ecrã: as respostas
// ao RSVP mudam a ocupação depois de o organizador arrumar as mesas, e recusar não ajudaria ninguém.
// Mesma regra de acesso dos convidados: dono e editores alteram, com o projecto activo.

const m = mensagens.convidados;
const mp = mensagens.projectos;

const idProjecto = z.object({ id: z.uuid() });
const idMesa = z.object({ id: z.uuid(), mesa: z.uuid() });
const idConvidado = z.object({ id: z.uuid(), convidado: z.uuid() });

// Nome repetido no projecto (sem ligar a maiúsculas): erro junto ao campo.
function nomeRepetido(erro: unknown): never {
  if ((erro as { constraint?: string }).constraint === 'event_tables_nome_unico') {
    throw new ErroHttp(409, m.mesaRepetida, { nome: m.mesaRepetida });
  }
  throw erro;
}

async function contarMesas(cliente: pg.PoolClient, projectoId: string): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>('select count(*)::int as n from event_tables where project_id = $1', [projectoId]);
  return rows[0]!.n;
}

export function registarRotasMesas(app: FastifyInstance, base: BaseDeDados, guardas: ReturnType<typeof criarGuardas>) {
  const { pool } = base;
  const travar = (utilizadorId: string) => limitar(pool, `convidados:${utilizadorId}`, LIMITES.alterarConvidados);

  app.post('/api/projectos/:id/mesas', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const projectoId = parametros.data.id;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(dadosMesa, pedido.body);
    const mesa = await emTransaccao(pool, async (cliente): Promise<Mesa> => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      if ((await contarMesas(cliente, projectoId)) >= MAX_MESAS_POR_PROJECTO) throw new ErroHttp(409, m.limiteMesas(MAX_MESAS_POR_PROJECTO));
      const { rows } = await cliente
        .query<{ id: string }>('insert into event_tables (project_id, name, seats) values ($1, $2, $3) returning id', [projectoId, dados.nome, dados.lugares])
        .catch(nomeRepetido);
      return { id: rows[0]!.id, nome: dados.nome, lugares: dados.lugares };
    });
    return resposta.code(201).send(mesa);
  });

  // Várias de uma vez: "Mesa N", a continuar a numeração (salta nomes que já existam).
  app.post('/api/projectos/:id/mesas/varias', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<Mesa[]> => {
    const parametros = idProjecto.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, mp.naoEncontrado);
    const projectoId = parametros.data.id;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(criarVariasMesas, pedido.body);
    return emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      if ((await contarMesas(cliente, projectoId)) + dados.quantidade > MAX_MESAS_POR_PROJECTO) throw new ErroHttp(409, m.limiteMesas(MAX_MESAS_POR_PROJECTO));
      const { rows: existentes } = await cliente.query<{ nome: string }>('select lower(name) as nome from event_tables where project_id = $1', [projectoId]);
      const usados = new Set(existentes.map((e) => e.nome));
      const nomes: string[] = [];
      for (let n = 1; nomes.length < dados.quantidade; n++) {
        const nome = `${mensagens.ecras.mesas.prefixo} ${n}`;
        if (!usados.has(nome.toLowerCase())) nomes.push(nome);
      }
      await cliente.query('insert into event_tables (project_id, name, seats) select $1, unnest($2::text[]), $3', [projectoId, nomes, dados.lugares]);
      return listarMesas(cliente, projectoId);
    });
  });

  app.post('/api/projectos/:id/mesas/:mesa', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<Mesa> => {
    const parametros = idMesa.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.mesaNaoEncontrada);
    const { id: projectoId, mesa: mesaId } = parametros.data;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(dadosMesa, pedido.body);
    return emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      const { rows } = await cliente
        .query('update event_tables set name = $3, seats = $4 where id = $1 and project_id = $2 returning id', [mesaId, projectoId, dados.nome, dados.lugares])
        .catch(nomeRepetido);
      if (rows.length === 0) throw new ErroHttp(404, m.mesaNaoEncontrada);
      return { id: mesaId, nome: dados.nome, lugares: dados.lugares };
    });
  });

  // Apagar a mesa: os convidados ficam sem mesa (a base de dados limpa-a), não são apagados.
  app.post('/api/projectos/:id/mesas/:mesa/remover', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const parametros = idMesa.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.mesaNaoEncontrada);
    const { id: projectoId, mesa: mesaId } = parametros.data;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    await emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      const { rows } = await cliente.query('delete from event_tables where id = $1 and project_id = $2 returning id', [mesaId, projectoId]);
      if (rows.length === 0) throw new ErroHttp(404, m.mesaNaoEncontrada);
    });
    return resposta.code(204).send();
  });

  // Sentar um convidado numa mesa, ou tirá-lo (mesaId null). O convidado e a mesa têm de ser deste projecto
  // (CLAUDE.md, secção 5, regra 5: também o ID da mesa, que vem no corpo do pedido).
  app.post('/api/projectos/:id/convidados/:convidado/mesa', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<Convidado> => {
    const parametros = idConvidado.safeParse(pedido.params);
    if (!parametros.success) throw new ErroHttp(404, m.naoEncontrado);
    const { id: projectoId, convidado: convidadoId } = parametros.data;
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const { mesaId } = validar(sentarConvidado, pedido.body);
    return emTransaccao(pool, async (cliente) => {
      await projectoParaAlterar(cliente, projectoId, utilizadorId);
      if (mesaId) {
        const { rows } = await cliente.query('select 1 from event_tables where id = $1 and project_id = $2', [mesaId, projectoId]);
        if (rows.length === 0) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { mesaId: mensagens.validacao.mesaInvalida });
      }
      const { rows } = await cliente.query(
        'update guests set table_id = $3, updated_at = clock_timestamp() where id = $1 and project_id = $2 returning id',
        [convidadoId, projectoId, mesaId],
      );
      if (rows.length === 0) throw new ErroHttp(404, m.naoEncontrado);
      return (await listarConvidados(cliente, projectoId)).find((c) => c.id === convidadoId)!;
    });
  });
}
