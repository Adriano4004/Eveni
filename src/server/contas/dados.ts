import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { eliminarConta as esquemaEliminar, exportarDados as esquemaExportar } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import type { Config } from '../config.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import type { EnviarEmail } from '../email/index.js';
import { emailContaEliminada } from '../email/modelos.js';
import { ErroHttp, validar } from '../erros.js';
import { listarConvidados, listarMesas } from '../convidados/rotas.js';
import { lerProjecto } from '../projectos/rotas.js';
import type { Convidado, Mesa } from '../../shared/convidados.js';
import type { Projecto } from '../../shared/projectos.js';
import { LIMITES, descontarTentativa, limitar, registarTentativa } from '../seguranca/limites.js';
import { verificarPalavraPasse } from '../seguranca/palavras-passe.js';
import type { criarGuardas } from './acesso.js';
import { auditar } from './auditoria.js';
import { criarSegundoFactor } from './dois-factores.js';
import { eliminarContaCompleta, espacosPartilhados } from './eliminacao.js';
import { apagarCookie } from './sessoes.js';

// Exportação e eliminação completas dos dados de uma conta (Lei n.º 22/11; CLAUDE.md, secção 6).
//
// Cada tabela com dados ligados a um utilizador ou a um espaço de trabalho tem de estar nesta lista,
// com a forma como é exportada e eliminada. Um teste compara-a com as chaves estrangeiras da base de
// dados: uma tabela nova sem entrada aqui faz o teste falhar (falha da versão anterior: exportação e
// eliminação incompletas).
export const TABELAS_PESSOAIS = {
  users: 'exportada (sem segredos); apagada',
  workspaces: 'exportada; apagada se a pessoa for a única dona',
  workspace_members: 'exportada; apagada com a conta (cascata)',
  sessions: 'exportada (sem tokens); apagada com a conta (cascata)',
  email_tokens: 'não exportada (só ligações temporárias); apagada com a conta (cascata)',
  recovery_codes: 'não exportada (segredos); apagada com a conta (cascata)',
  login_challenges: 'não exportada (temporária); apagada com a conta (cascata)',
  audit_log: 'exportada; apagada, incluindo registos com o e-mail',
  rate_limits: 'não exportada (contadores temporários); apagados os que incluem o e-mail ou o identificador',
  projects: 'exportada (espaços de que a pessoa é dona); apagada com o espaço (cascata)',
  tasks: 'exportada com o projecto; apagada com o projecto (cascata)',
  budget_items: 'exportada com o projecto; apagada com o projecto (cascata)',
  invitations: 'exportada (convites enviados e recebidos); apagados os que a pessoa criou e os feitos para o e-mail dela; os antigos são apagados ao fim de 30 dias',
  project_members: 'exportada (acessos da pessoa a projectos de outros espaços: projecto, espaço, papel, desde); apagada com o projecto ou com a conta (cascata)',
  guests: 'exportada com o projecto (espaços de que a pessoa é dona); apagada com o projecto (cascata)',
  event_tables: 'exportada com o projecto (mesas); apagada com o projecto (cascata)',
} as const;

export interface Exportacao {
  geradoEm: string;
  conta: {
    id: string;
    nome: string;
    email: string;
    emailConfirmadoEm: string | null;
    criadaEm: string;
    verificacaoDoisPassosActivadaEm: string | null;
    codigosRecuperacaoPorUsar: number;
  };
  espacosDeTrabalho: { id: string; nome: string; plano: string; papel: string; planoDesde: string; criadoEm: string }[];
  sessoes: { criadaEm: string; ultimaUtilizacao: string; expiraEm: string; ip: string | null; navegador: string | null }[];
  historicoDeAcessos: { accao: string; data: string; ip: string | null; detalhes: Record<string, unknown> }[];
  // Projectos dos espaços de que a pessoa é dona, com tarefas, orçamento e convidados.
  projectos: (Projecto & { convidados: Convidado[]; mesas: Mesa[] })[];
  // Projectos de outros espaços a que a pessoa tem acesso (como editora ou leitora).
  acessosAProjectos: { projectoId: string; projecto: string; espaco: string; papel: string; desde: string }[];
  convitesEnviados: { email: string; criadoEm: string; estado: EstadoConvite }[];
  convitesRecebidos: { espaco: string; criadoEm: string; estado: EstadoConvite }[];
}

type EstadoConvite = 'aceite' | 'revogado' | 'expirado' | 'pendente';
// `t` é o prefixo da tabela na consulta (fixo, nunca do pedido).
const estadoConvite = (t = '') => `case when ${t}accepted_at is not null then 'aceite' when ${t}revoked_at is not null then 'revogado'
                                        when ${t}expires_at < now() then 'expirado' else 'pendente' end`;

export async function exportarDados(pool: pg.Pool, utilizadorId: string): Promise<Exportacao> {
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  // Listas explícitas de colunas: nunca hashes, segredos do 2FA nem tokens.
  const { rows: contas } = await pool.query(
    `select u.id, u.name, u.email, u.email_verified_at, u.created_at, u.totp_enabled_at,
            (select count(*)::int from recovery_codes r where r.user_id = u.id and r.used_at is null) as codigos
       from users u where u.id = $1`,
    [utilizadorId],
  );
  const u = contas[0];
  if (!u) throw new ErroHttp(401, mensagens.contas.sessaoNecessaria);
  const { rows: espacos } = await pool.query(
    `select w.id, w.name, w.plan_code, wm.role, w.plan_started_at, w.created_at
       from workspace_members wm join workspaces w on w.id = wm.workspace_id
      where wm.user_id = $1 order by w.created_at`,
    [utilizadorId],
  );
  const { rows: sessoes } = await pool.query(
    'select created_at, last_seen_at, expires_at, host(ip) as ip, user_agent from sessions where user_id = $1 order by created_at',
    [utilizadorId],
  );
  // Os registos da pessoa e os que guardam o e-mail, mas só desde que a conta existe: os anteriores
  // (ex.: tentativas de entrar nesse e-mail antes do registo) não são de quem criou a conta.
  const { rows: acessos } = await pool.query(
    `select action, created_at, host(ip) as ip, details from audit_log
      where user_id = $1 or (details->>'email' = $2 and created_at >= $3)
      order by id`,
    [utilizadorId, u.email, u.created_at],
  );
  const { rows: idsProjectos } = await pool.query<{ id: string }>(
    `select p.id from projects p join workspace_members wm on wm.workspace_id = p.workspace_id
      where wm.user_id = $1 and wm.role = 'owner' order by p.created_at`,
    [utilizadorId],
  );
  const { rows: acessosProjectos } = await pool.query<{ project_id: string; name: string; espaco: string; role: string; created_at: Date }>(
    `select pm.project_id, p.name, w.name as espaco, pm.role, pm.created_at
       from project_members pm join projects p on p.id = pm.project_id join workspaces w on w.id = p.workspace_id
      where pm.user_id = $1 order by pm.created_at`,
    [utilizadorId],
  );
  const { rows: enviados } = await pool.query<{ email: string; created_at: Date; estado: EstadoConvite }>(
    `select email, created_at, ${estadoConvite()} as estado from invitations where created_by = $1 order by created_at`,
    [utilizadorId],
  );
  const { rows: recebidos } = await pool.query<{ espaco: string; created_at: Date; estado: EstadoConvite }>(
    `select w.name as espaco, i.created_at, ${estadoConvite('i.')} as estado
       from invitations i join workspaces w on w.id = i.workspace_id
      -- Só com o e-mail confirmado: uma conta por confirmar pode ter o e-mail de outra pessoa.
      where i.email = $1 and $2 order by i.created_at`,
    [u.email, u.email_verified_at !== null],
  );
  const projectos: Exportacao['projectos'] = [];
  for (const { id } of idsProjectos) {
    const projecto = await lerProjecto(pool, id, utilizadorId);
    if (projecto) projectos.push({ ...projecto, convidados: await listarConvidados(pool, id), mesas: await listarMesas(pool, id) });
  }
  return {
    geradoEm: new Date().toISOString(),
    conta: {
      id: u.id,
      nome: u.name,
      email: u.email,
      emailConfirmadoEm: iso(u.email_verified_at),
      criadaEm: u.created_at.toISOString(),
      verificacaoDoisPassosActivadaEm: iso(u.totp_enabled_at),
      codigosRecuperacaoPorUsar: u.codigos,
    },
    espacosDeTrabalho: espacos.map((w) => ({
      id: w.id,
      nome: w.name,
      plano: w.plan_code,
      papel: w.role,
      planoDesde: w.plan_started_at.toISOString(),
      criadoEm: w.created_at.toISOString(),
    })),
    sessoes: sessoes.map((s) => ({
      criadaEm: s.created_at.toISOString(),
      ultimaUtilizacao: s.last_seen_at.toISOString(),
      expiraEm: s.expires_at.toISOString(),
      ip: s.ip,
      navegador: s.user_agent,
    })),
    historicoDeAcessos: acessos.map((a) => ({ accao: a.action, data: a.created_at.toISOString(), ip: a.ip, detalhes: a.details })),
    projectos,
    acessosAProjectos: acessosProjectos.map((a) => ({
      projectoId: a.project_id,
      projecto: a.name,
      espaco: a.espaco,
      papel: a.role,
      desde: a.created_at.toISOString(),
    })),
    convitesEnviados: enviados.map((c) => ({ email: c.email, criadoEm: c.created_at.toISOString(), estado: c.estado })),
    convitesRecebidos: recebidos.map((c) => ({ espaco: c.espaco, criadoEm: c.created_at.toISOString(), estado: c.estado })),
  };
}

export function registarRotasDados(
  app: FastifyInstance,
  config: Config,
  base: BaseDeDados,
  enviarEmail: EnviarEmail,
  guardas: ReturnType<typeof criarGuardas>,
) {
  const { pool } = base;
  const m = mensagens.contas;
  const segundoFactor = criarSegundoFactor(config);

  async function confirmarPalavraPasse(utilizadorId: string, palavraPasse: string, ip: string) {
    const { rows } = await pool.query<{ email: string; password_hash: string; dois_factores: boolean }>(
      'select email, password_hash, totp_enabled_at is not null as dois_factores from users where id = $1',
      [utilizadorId],
    );
    const utilizador = rows[0];
    // Conta eliminada entretanto (ex.: noutro separador).
    if (!utilizador) throw new ErroHttp(401, m.sessaoNecessaria);
    if (!(await verificarPalavraPasse(utilizador.password_hash, palavraPasse))) {
      await auditar(pool, 'conta.dados_confirmacao_falhada', { utilizadorId, ip });
      throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { palavraPasse: m.palavraPasseActualErrada });
    }
    return utilizador;
  }

  // Com 2FA activo, as acções sobre os dados também pedem um código. Conta para os mesmos limites de
  // códigos errados da entrada (a tentativa conta antes de verificar e é descontada se estiver certa), e
  // cada falha fica na auditoria (fora de qualquer transacção, que seria desfeita).
  const chaveErros = (utilizadorId: string) => `entrar-2fa-erros:${utilizadorId}`;

  async function contarTentativaCodigo(utilizadorId: string) {
    const erros = await registarTentativa(pool, chaveErros(utilizadorId), LIMITES.codigosErradosPorConta.janela);
    if (erros > LIMITES.codigosErradosPorConta.max) throw new ErroHttp(429, m.contaBloqueada);
  }

  async function codigoErrado(utilizadorId: string, ip: string): Promise<never> {
    await auditar(pool, 'conta.dados_confirmacao_falhada', { utilizadorId, ip, detalhes: { motivo: 'codigo' } });
    throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { codigo: m.codigoErrado });
  }

  // POST (não GET): pede a palavra-passe (e o código do 2FA, se activo), para que uma sessão esquecida
  // aberta não baste para levar os dados.
  app.post('/api/conta/exportar', { preHandler: guardas.exigirSessao }, async (pedido, resposta) => {
    const { utilizadorId } = pedido.sessao!;
    await limitar(pool, `dados-conta:${utilizadorId}`, LIMITES.dadosConta);
    const { palavraPasse, codigo } = validar(esquemaExportar, pedido.body);
    const utilizador = await confirmarPalavraPasse(utilizadorId, palavraPasse, pedido.ip);
    if (utilizador.dois_factores) {
      await contarTentativaCodigo(utilizadorId);
      const certo = codigo !== undefined && (await segundoFactor.usarCodigo(pool, utilizadorId, codigo));
      if (!certo) await codigoErrado(utilizadorId, pedido.ip);
      await descontarTentativa(pool, chaveErros(utilizadorId));
    }
    const dados = await exportarDados(pool, utilizadorId);
    await auditar(pool, 'conta.exportada', { utilizadorId, ip: pedido.ip });
    const dia = dados.geradoEm.slice(0, 10);
    return resposta
      .header('content-disposition', `attachment; filename="eveni-os-meus-dados-${dia}.json"`)
      .header('cache-control', 'no-store')
      .send(dados);
  });

  app.post('/api/conta/eliminar', { preHandler: guardas.exigirSessao }, async (pedido, resposta) => {
    const { utilizadorId } = pedido.sessao!;
    await limitar(pool, `dados-conta:${utilizadorId}`, LIMITES.dadosConta);
    const dados = validar(esquemaEliminar, pedido.body);
    const utilizador = await confirmarPalavraPasse(utilizadorId, dados.palavraPasse, pedido.ip);

    if (utilizador.dois_factores) await contarTentativaCodigo(utilizadorId);
    const resultado = await emTransaccao(pool, async (cliente) => {
      if (utilizador.dois_factores) {
        const certo = dados.codigo !== undefined && (await segundoFactor.usarCodigo(cliente, utilizadorId, dados.codigo));
        if (!certo) return 'codigo-errado' as const;
      }
      if ((await espacosPartilhados(cliente, utilizadorId)) > 0) return 'espaco-partilhado' as const;
      return (await eliminarContaCompleta(cliente, utilizadorId)) ? ('eliminada' as const) : ('ja-nao-existe' as const);
    });
    if (resultado === 'codigo-errado') await codigoErrado(utilizadorId, pedido.ip);
    if (utilizador.dois_factores) await descontarTentativa(pool, chaveErros(utilizadorId));
    if (resultado === 'espaco-partilhado') throw new ErroHttp(409, m.espacoComMembros);
    if (resultado === 'ja-nao-existe') throw new ErroHttp(401, m.sessaoNecessaria);

    apagarCookie(config, resposta);
    enviarEmail(emailContaEliminada(utilizador.email));
    return resposta.code(204).send();
  });
}
