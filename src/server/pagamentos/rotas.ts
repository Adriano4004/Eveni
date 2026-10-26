import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { type CodigoPlano, comprovativo, pedirPagamento, recusarPagamento } from '../../shared/esquemas.js';
import { formatarData, hojeEmLuanda } from '../../shared/datas.js';
import { formatarKz } from '../../shared/dinheiro.js';
import { mensagens } from '../../shared/mensagens.js';
import {
  type EstadoPagamento,
  MAX_BYTES_COMPROVATIVO,
  MESES,
  type Pagamento,
  type PagamentoAdmin,
  type Periodo,
  type PlanoPago,
  type SituacaoPlano,
  valorDoPagamento,
} from '../../shared/pagamentos.js';
import { criarExigirAdmin } from '../admin/rotas.js';
import type { Config } from '../config.js';
import type { criarGuardas } from '../contas/acesso.js';
import { auditar } from '../contas/auditoria.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import type { EnviarEmail } from '../email/index.js';
import { emailComprovativoRecebido, emailPagamentoConfirmado, emailPagamentoRecusado } from '../email/modelos.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar } from '../seguranca/limites.js';

// Pagamentos por transferência bancária (decisão 029). O dono do espaço pede um plano e um período, transfere
// com a referência e envia o comprovativo; um administrador confirma (o plano fica activo até à data de fim)
// ou recusa com um motivo. Sempre no espaço da própria pessoa, tirado da sessão.

const q = mensagens.pagamentos;
const v = mensagens.validacao;
const VIOLACAO_UNICIDADE = '23505';

// Primeiros bytes de cada formato aceite: o tipo declarado no "data:" não basta.
const ASSINATURAS: [string, Buffer][] = [
  ['application/pdf', Buffer.from('%PDF-')],
  ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff])],
];

// Lê "data:…;base64,…" e devolve o ficheiro só se for mesmo PDF, PNG ou JPEG, até 5 MB. O comprovativo não é
// desenhado nem interpretado pelo servidor: só é guardado e entregue para descarregar.
export function lerComprovativo(dataUrl: string): { ficheiro: Buffer; tipo: string } {
  const partes = /^data:(?:application\/pdf|image\/png|image\/jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!partes) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { ficheiro: v.comprovativoInvalido });
  const ficheiro = Buffer.from(partes[1]!, 'base64');
  if (ficheiro.length > MAX_BYTES_COMPROVATIVO) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { ficheiro: v.comprovativoGrande });
  const tipo = ASSINATURAS.find(([, assinatura]) => ficheiro.subarray(0, assinatura.length).equals(assinatura))?.[0];
  if (!tipo) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { ficheiro: v.comprovativoInvalido });
  return { ficheiro, tipo };
}

interface LinhaPagamento {
  id: string;
  reference: string;
  plan_code: PlanoPago;
  period: Periodo;
  // bigint: o pg devolve-o como texto.
  amount_cents: string;
  status: EstadoPagamento;
  tem_comprovativo: boolean;
  rejection_reason: string | null;
  period_start: Date | null;
  period_end: Date | null;
  created_at: Date;
  decided_at: Date | null;
}

const COLUNAS = `p.id, p.reference, p.plan_code, p.period, p.amount_cents, p.status, p.proof is not null as tem_comprovativo,
  p.rejection_reason, p.period_start, p.period_end, p.created_at, p.decided_at`;

const paraPagamento = (l: LinhaPagamento): Pagamento => ({
  id: l.id,
  referencia: l.reference,
  plano: l.plan_code,
  periodo: l.period,
  valorCentimos: Number(l.amount_cents),
  estado: l.status,
  temComprovativo: l.tem_comprovativo,
  motivoRecusa: l.rejection_reason,
  inicio: l.period_start?.toISOString() ?? null,
  fim: l.period_end?.toISOString() ?? null,
  criadoEm: l.created_at.toISOString(),
  decididoEm: l.decided_at?.toISOString() ?? null,
});

// Data no calendário de Luanda, dd/mm/aaaa.
const dataLuanda = (d: Date) => formatarData(hojeEmLuanda(d));

// O espaço de que a pessoa é dona (o pessoal, criado no registo). Com `bloquear`, fica bloqueado até ao fim
// da transacção: dois pedidos em simultâneo não criam dois pagamentos em aberto.
async function espacoDoDono(cliente: pg.Pool | pg.PoolClient, utilizadorId: string, bloquear = false) {
  const { rows } = await cliente.query<{ id: string; name: string; plan_code: CodigoPlano; plan_ends_at: Date | null }>(
    `select w.id, w.name, w.plan_code, w.plan_ends_at from workspace_members wm join workspaces w on w.id = wm.workspace_id
      where wm.user_id = $1 and wm.role = 'owner' order by wm.created_at limit 1 ${bloquear ? 'for update of w' : ''}`,
    [utilizadorId],
  );
  return rows[0] ?? null;
}

export function registarRotasPagamentos(
  app: FastifyInstance,
  config: Config,
  base: BaseDeDados,
  enviarEmail: EnviarEmail,
  guardas: ReturnType<typeof criarGuardas>,
) {
  const { pool } = base;
  const exigirAdmin = criarExigirAdmin(config, base, guardas);
  const travar = (utilizadorId: string) => limitar(pool, `pagamentos:${utilizadorId}`, LIMITES.pagamentos);

  async function situacao(utilizadorId: string): Promise<SituacaoPlano> {
    const espaco = await espacoDoDono(pool, utilizadorId);
    if (!espaco) throw new ErroHttp(403, q.soDono);
    const { rows } = await pool.query<LinhaPagamento>(`select ${COLUNAS} from payments p where p.workspace_id = $1 order by p.number desc`, [espaco.id]);
    const todos = rows.map(paraPagamento);
    return {
      plano: espaco.plan_code,
      fim: espaco.plan_ends_at?.toISOString() ?? null,
      podePagar: true,
      emAberto: todos.find((p) => p.estado === 'awaiting_proof' || p.estado === 'pending') ?? null,
      historico: todos.filter((p) => p.estado !== 'awaiting_proof' && p.estado !== 'pending'),
    };
  }

  // Um pagamento em aberto do espaço da própria pessoa; para qualquer outro, a mesma resposta: não existe.
  async function pagamentoEmAberto(cliente: pg.PoolClient, utilizadorId: string, id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ErroHttp(404, q.naoEncontrado);
    const espaco = await espacoDoDono(cliente, utilizadorId, true);
    if (!espaco) throw new ErroHttp(404, q.naoEncontrado);
    const { rows } = await cliente.query<{ id: string; status: EstadoPagamento; reference: string; plan_code: PlanoPago; period: Periodo; amount_cents: string }>(
      'select id, status, reference, plan_code, period, amount_cents from payments where id = $1 and workspace_id = $2 for update',
      [id, espaco.id],
    );
    const p = rows[0];
    if (!p) throw new ErroHttp(404, q.naoEncontrado);
    if (p.status !== 'awaiting_proof' && p.status !== 'pending') throw new ErroHttp(409, q.jaDecidido);
    return { pagamento: p, espaco };
  }

  app.get('/api/pagamentos', { preHandler: guardas.exigirSessao }, async (pedido): Promise<SituacaoPlano> => situacao(pedido.sessao!.utilizadorId));

  app.post('/api/pagamentos', { preHandler: guardas.exigirEmailConfirmado }, async (pedido, resposta) => {
    const { utilizadorId } = pedido.sessao!;
    await travar(utilizadorId);
    const dados = validar(pedirPagamento, pedido.body);
    try {
      await emTransaccao(pool, async (cliente) => {
        const espaco = await espacoDoDono(cliente, utilizadorId, true);
        if (!espaco) throw new ErroHttp(403, q.soDono);
        const { rows } = await cliente.query<{ id: string; number: string }>(
          `insert into payments (reference, workspace_id, requested_by, plan_code, period, amount_cents)
           values ('', $1, $2, $3, $4, $5) returning id, number`,
          [espaco.id, utilizadorId, dados.plano, dados.periodo, valorDoPagamento(dados.plano, dados.periodo)],
        );
        // Referência curta para o descritivo da transferência: EVN-2026-00007.
        const referencia = `EVN-${hojeEmLuanda().slice(0, 4)}-${String(rows[0]!.number).padStart(5, '0')}`;
        await cliente.query('update payments set reference = $2 where id = $1', [rows[0]!.id, referencia]);
        await auditar(cliente, 'pagamento.pedido', { utilizadorId, ip: pedido.ip, espacoId: espaco.id, detalhes: { referencia, plano: dados.plano, periodo: dados.periodo } });
      });
    } catch (erro) {
      if ((erro as { code?: string }).code === VIOLACAO_UNICIDADE) throw new ErroHttp(409, q.jaHaPedido);
      throw erro;
    }
    return resposta.code(201).send(await situacao(utilizadorId));
  });

  // Até 5 MB de ficheiro em base64 (cerca de 6,7 MB de texto).
  app.post<{ Params: { id: string } }>(
    '/api/pagamentos/:id/comprovativo',
    { preHandler: guardas.exigirEmailConfirmado, bodyLimit: 8 * 1024 * 1024 },
    async (pedido) => {
      const { utilizadorId } = pedido.sessao!;
      await travar(utilizadorId);
      const { ficheiro, tipo } = lerComprovativo(validar(comprovativo, pedido.body).ficheiro);
      const { pagamento, espaco } = await emTransaccao(pool, async (cliente) => {
        const encontrado = await pagamentoEmAberto(cliente, utilizadorId, pedido.params.id);
        await cliente.query("update payments set proof = $2, proof_type = $3, proof_uploaded_at = now(), status = 'pending' where id = $1", [
          encontrado.pagamento.id,
          ficheiro,
          tipo,
        ]);
        await auditar(cliente, 'pagamento.comprovativo', { utilizadorId, ip: pedido.ip, espacoId: encontrado.espaco.id, detalhes: { referencia: encontrado.pagamento.reference } });
        return encontrado;
      });
      // Aviso aos administradores, depois do commit e sem bloquear a resposta.
      for (const admin of config.ADMINS) {
        enviarEmail(
          emailComprovativoRecebido(admin, `${config.APP_URL}/admin`, {
            espaco: espaco.name,
            plano: mensagens.planos[pagamento.plan_code],
            periodo: q.periodos[pagamento.period],
            valor: formatarKz(Number(pagamento.amount_cents)),
            referencia: pagamento.reference,
          }),
        );
      }
      return situacao(utilizadorId);
    },
  );

  app.post<{ Params: { id: string } }>('/api/pagamentos/:id/cancelar', { preHandler: guardas.exigirSessao }, async (pedido) => {
    const { utilizadorId } = pedido.sessao!;
    await emTransaccao(pool, async (cliente) => {
      const { pagamento, espaco } = await pagamentoEmAberto(cliente, utilizadorId, pedido.params.id);
      // O comprovativo deixa de ser preciso: não fica guardado.
      await cliente.query("update payments set status = 'cancelled', proof = null, proof_type = null, decided_at = now() where id = $1", [pagamento.id]);
      await auditar(cliente, 'pagamento.cancelado', { utilizadorId, ip: pedido.ip, espacoId: espaco.id, detalhes: { referencia: pagamento.reference } });
    });
    return situacao(utilizadorId);
  });

  // O comprovativo, para descarregar: só o dono do espaço do pagamento e os administradores.
  async function enviarComprovativo(resposta: import('fastify').FastifyReply, linha: { proof: Buffer | null; proof_type: string | null; reference: string } | undefined) {
    if (!linha) throw new ErroHttp(404, q.naoEncontrado);
    if (!linha.proof) throw new ErroHttp(404, q.semComprovativo);
    const extensao = linha.proof_type === 'application/pdf' ? 'pdf' : linha.proof_type === 'image/png' ? 'png' : 'jpg';
    return resposta
      .header('content-type', linha.proof_type!)
      .header('content-disposition', `attachment; filename="comprovativo-${linha.reference}.${extensao}"`)
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('cache-control', 'private, no-store')
      .send(linha.proof);
  }

  const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  app.get<{ Params: { id: string } }>('/api/pagamentos/:id/comprovativo', { preHandler: guardas.exigirSessao }, async (pedido, resposta) => {
    if (!ID_VALIDO.test(pedido.params.id)) throw new ErroHttp(404, q.naoEncontrado);
    const espaco = await espacoDoDono(pool, pedido.sessao!.utilizadorId);
    const { rows } = await pool.query<{ proof: Buffer | null; proof_type: string | null; reference: string }>(
      'select proof, proof_type, reference from payments where id = $1 and workspace_id = $2',
      [pedido.params.id, espaco?.id ?? null],
    );
    return enviarComprovativo(resposta, rows[0]);
  });

  // ——— Administração ———

  app.get('/api/admin/pagamentos', { preHandler: exigirAdmin }, async (): Promise<PagamentoAdmin[]> => {
    const { rows } = await pool.query<LinhaPagamento & { espaco_id: string; espaco_nome: string; dono_nome: string | null; dono_email: string | null }>(
      `select ${COLUNAS}, w.id as espaco_id, w.name as espaco_nome, u.name as dono_nome, u.email as dono_email
         from payments p join workspaces w on w.id = p.workspace_id
         left join workspace_members wm on wm.workspace_id = w.id and wm.role = 'owner'
         left join users u on u.id = wm.user_id
        where p.status = 'pending'
        order by p.proof_uploaded_at`,
    );
    return rows.map((l) => ({
      ...paraPagamento(l),
      espaco: { id: l.espaco_id, nome: l.espaco_nome },
      dono: l.dono_email ? { nome: l.dono_nome!, email: l.dono_email } : null,
    }));
  });

  app.get<{ Params: { id: string } }>('/api/admin/pagamentos/:id/comprovativo', { preHandler: exigirAdmin }, async (pedido, resposta) => {
    if (!ID_VALIDO.test(pedido.params.id)) throw new ErroHttp(404, q.naoEncontrado);
    const { rows } = await pool.query<{ proof: Buffer | null; proof_type: string | null; reference: string }>(
      'select proof, proof_type, reference from payments where id = $1',
      [pedido.params.id],
    );
    return enviarComprovativo(resposta, rows[0]);
  });

  // Decidir um pagamento por confirmar: bloqueia o pagamento e o espaço, para não se cruzar com outra decisão,
  // um cancelamento ou uma mudança de plano à mão.
  async function decidir<T>(id: string, fn: (cliente: pg.PoolClient, p: { id: string; reference: string; plan_code: PlanoPago; period: Periodo; workspace_id: string; ws_plan: CodigoPlano; ws_fim: Date | null; ws_nome: string; dono: string | null }) => Promise<T>) {
    if (!ID_VALIDO.test(id)) throw new ErroHttp(404, q.naoEncontrado);
    return emTransaccao(pool, async (cliente) => {
      const { rows } = await cliente.query(
        `select p.id, p.reference, p.plan_code, p.period, p.status, p.workspace_id, w.plan_code as ws_plan, w.plan_ends_at as ws_fim, w.name as ws_nome,
                (select u.email from workspace_members wm join users u on u.id = wm.user_id where wm.workspace_id = w.id and wm.role = 'owner' limit 1) as dono
           from payments p join workspaces w on w.id = p.workspace_id
          where p.id = $1 for update of p, w`,
        [id],
      );
      const p = rows[0];
      if (!p) throw new ErroHttp(404, q.naoEncontrado);
      if (p.status !== 'pending') throw new ErroHttp(409, q.jaDecidido);
      return fn(cliente, p);
    });
  }

  app.post<{ Params: { id: string } }>('/api/admin/pagamentos/:id/confirmar', { preHandler: exigirAdmin }, async (pedido) => {
    const r = await decidir(pedido.params.id, async (cliente, p) => {
      // Renovação do mesmo plano ainda activo: o novo período começa quando o actual acaba. Senão, começa hoje.
      const renova = p.ws_plan === p.plan_code && p.ws_fim !== null && p.ws_fim.getTime() > Date.now();
      const { rows } = await cliente.query<{ inicio: Date; fim: Date }>(
        `select $1::timestamptz as inicio, $1::timestamptz + make_interval(months => $2) as fim`,
        [renova ? p.ws_fim : new Date(), MESES[p.period]],
      );
      const { inicio, fim } = rows[0]!;
      await cliente.query(
        `update payments set status = 'confirmed', decided_by = $2, decided_at = now(), period_start = $3, period_end = $4 where id = $1`,
        [p.id, pedido.sessao!.utilizadorId, inicio, fim],
      );
      await cliente.query(
        `update workspaces set plan_code = $2, plan_ends_at = $3,
                plan_started_at = case when plan_code = $2 then plan_started_at else now() end
          where id = $1`,
        [p.workspace_id, p.plan_code, fim],
      );
      await auditar(cliente, 'pagamento.confirmado', {
        utilizadorId: pedido.sessao!.utilizadorId,
        ip: pedido.ip,
        espacoId: p.workspace_id,
        detalhes: { referencia: p.reference, plano: p.plan_code, periodo: p.period, fim: fim.toISOString() },
      });
      return { p, fim };
    });
    if (r.p.dono) enviarEmail(emailPagamentoConfirmado(r.p.dono, config.APP_URL, r.p.ws_nome, mensagens.planos[r.p.plan_code], dataLuanda(r.fim)));
    return { fim: r.fim.toISOString() };
  });

  app.post<{ Params: { id: string } }>('/api/admin/pagamentos/:id/recusar', { preHandler: exigirAdmin }, async (pedido) => {
    const { motivo } = validar(recusarPagamento, pedido.body);
    const p = await decidir(pedido.params.id, async (cliente, p) => {
      await cliente.query(`update payments set status = 'rejected', decided_by = $2, decided_at = now(), rejection_reason = $3 where id = $1`, [
        p.id,
        pedido.sessao!.utilizadorId,
        motivo,
      ]);
      await auditar(cliente, 'pagamento.recusado', { utilizadorId: pedido.sessao!.utilizadorId, ip: pedido.ip, espacoId: p.workspace_id, detalhes: { referencia: p.reference } });
      return p;
    });
    if (p.dono) enviarEmail(emailPagamentoRecusado(p.dono, config.APP_URL, p.reference, motivo));
    return { recusado: true };
  });
}
