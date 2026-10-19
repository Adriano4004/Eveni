import type { FastifyInstance } from 'fastify';
import { type Eu, entrar, registo } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import type { Config } from '../config.js';
import type { BaseDeDados } from '../db/index.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar, limparTentativas, registarTentativa } from '../seguranca/limites.js';
import { gerarHash, obterHashFicticio, verificarPalavraPasse } from '../seguranca/palavras-passe.js';
import { auditar } from './auditoria.js';
import type { EnviarEmail } from '../email/index.js';
import { emailConfirmacao } from '../email/modelos.js';
import type { criarGuardas } from './acesso.js';
import { criarTokenConfirmacao, urlConfirmacao } from './confirmacao.js';
import { apagarCookie, criarSessao, lerSessao, terminarSessao, terminarTodasAsSessoes } from './sessoes.js';

const m = mensagens.contas;

// Código de erro do PostgreSQL para violação de unicidade.
const VIOLACAO_UNICIDADE = '23505';

export function registarRotasContas(
  app: FastifyInstance,
  config: Config,
  base: BaseDeDados,
  enviarEmail: EnviarEmail,
  guardas: ReturnType<typeof criarGuardas>,
) {
  const { pool } = base;
  const { exigirSessao } = guardas;

  app.post('/api/auth/registo', async (pedido, resposta) => {
    await limitar(pool, `registo-ip:${pedido.ip}`, LIMITES.registoPorIp);
    const dados = validar(registo, pedido.body);
    const hash = await gerarHash(dados.palavraPasse);

    const cliente = await pool.connect();
    let utilizadorId: string;
    let tokenConfirmacao: string;
    try {
      await cliente.query('begin');
      const { rows } = await cliente.query<{ id: string }>(
        'insert into users (email, name, password_hash) values ($1, $2, $3) returning id',
        [dados.email, dados.nome, hash],
      );
      utilizadorId = rows[0]!.id;
      // Cada conta nasce com um espaço de trabalho pessoal, no plano Singular.
      const espaco = await cliente.query<{ id: string }>('insert into workspaces (name) values ($1) returning id', [
        m.nomeEspacoPessoal(dados.nome),
      ]);
      await cliente.query("insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')", [
        espaco.rows[0]!.id,
        utilizadorId,
      ]);
      tokenConfirmacao = await criarTokenConfirmacao(cliente, utilizadorId);
      await auditar(cliente, 'conta.registo', { utilizadorId, ip: pedido.ip });
      await criarSessao(cliente, config, resposta, utilizadorId, pedido);
      await cliente.query('commit');
    } catch (erro) {
      await cliente.query('rollback');
      if ((erro as { code?: string }).code === VIOLACAO_UNICIDADE) {
        throw new ErroHttp(409, m.emailJaRegistado, { email: m.emailJaRegistado });
      }
      throw erro;
    } finally {
      cliente.release();
    }

    // Depois do commit: o e-mail só sai se a conta ficou mesmo criada. Não bloqueia a resposta.
    enviarEmail(emailConfirmacao(dados.email, urlConfirmacao(config, tokenConfirmacao)));
    return resposta.code(201).send(await obterEu(utilizadorId));
  });

  app.post('/api/auth/entrar', async (pedido, resposta) => {
    await limitar(pool, `entrar-ip:${pedido.ip}`, LIMITES.entrarPorIp);
    const dados = validar(entrar, pedido.body);
    const chaveEmailIp = `entrar-email-ip:${dados.email}:${pedido.ip}`;
    const chaveEmail = `entrar-email:${dados.email}`;

    // A tentativa conta-se antes de verificar a palavra-passe (operação atómica na base de dados):
    // pedidos em paralelo não conseguem passar todos pela verificação antes de o contador subir.
    const porEmailIp = await registarTentativa(pool, chaveEmailIp, LIMITES.tentativasPorEmailEIp.janela);
    const porEmail = await registarTentativa(pool, chaveEmail, LIMITES.tentativasPorEmail.janela);
    const excedeEmailIp = porEmailIp > LIMITES.tentativasPorEmailEIp.max;
    const excedeEmail = porEmail > LIMITES.tentativasPorEmail.max;
    if (excedeEmailIp || excedeEmail) {
      // Regista só o momento em que o limite é ultrapassado, para não encher a auditoria.
      if (porEmailIp === LIMITES.tentativasPorEmailEIp.max + 1 || porEmail === LIMITES.tentativasPorEmail.max + 1) {
        await auditar(pool, 'sessao.bloqueada', { ip: pedido.ip, detalhes: { email: dados.email } });
      }
      throw new ErroHttp(429, m.contaBloqueada);
    }

    const { rows } = await pool.query<{ id: string; password_hash: string }>(
      'select id, password_hash from users where email = $1',
      [dados.email],
    );
    const utilizador = rows[0];
    // Verifica sempre um hash, mesmo sem conta, para o tempo de resposta não revelar se o e-mail existe.
    const certa = await verificarPalavraPasse(utilizador?.password_hash ?? (await obterHashFicticio()), dados.palavraPasse);

    if (!utilizador || !certa) {
      await auditar(pool, 'sessao.entrar_falhado', { utilizadorId: utilizador?.id, ip: pedido.ip });
      throw new ErroHttp(401, m.credenciaisInvalidas);
    }

    await limparTentativas(pool, chaveEmailIp);
    // Uma sessão anterior neste browser (ex.: outra pessoa num computador partilhado) deixa de valer.
    const anterior = await lerSessao(pool, config, pedido);
    if (anterior) await terminarSessao(pool, anterior.tokenHash);
    await criarSessao(pool, config, resposta, utilizador.id, pedido);
    await auditar(pool, 'sessao.entrar', { utilizadorId: utilizador.id, ip: pedido.ip });
    return obterEu(utilizador.id);
  });

  app.post('/api/auth/sair', async (pedido, resposta) => {
    const sessao = await lerSessao(pool, config, pedido);
    if (sessao) {
      await terminarSessao(pool, sessao.tokenHash);
      await auditar(pool, 'sessao.sair', { utilizadorId: sessao.utilizadorId, ip: pedido.ip });
    }
    apagarCookie(config, resposta);
    return resposta.code(204).send();
  });

  app.post('/api/auth/sair-de-todos', { preHandler: exigirSessao }, async (pedido, resposta) => {
    const utilizadorId = pedido.sessao!.utilizadorId;
    const terminadas = await terminarTodasAsSessoes(pool, utilizadorId);
    await auditar(pool, 'sessao.sair_todos', { utilizadorId, ip: pedido.ip, detalhes: { sessoes: terminadas } });
    apagarCookie(config, resposta);
    return resposta.code(204).send();
  });

  app.get('/api/auth/eu', { preHandler: exigirSessao }, async (pedido) => obterEu(pedido.sessao!.utilizadorId));

  // Lista explícita de campos: nunca devolver hashes, tokens ou segredos.
  async function obterEu(utilizadorId: string): Promise<Eu> {
    const { rows } = await pool.query<{
      id: string;
      name: string;
      email: string;
      email_verified_at: Date | null;
      workspace_id: string;
      workspace_name: string;
      plan_code: Eu['espaco']['plano'];
    }>(
      `select u.id, u.name, u.email, u.email_verified_at, w.id as workspace_id, w.name as workspace_name, w.plan_code
         from users u
         join workspace_members wm on wm.user_id = u.id
         join workspaces w on w.id = wm.workspace_id
        where u.id = $1
        order by (wm.role = 'owner') desc, wm.created_at
        limit 1`,
      [utilizadorId],
    );
    const l = rows[0];
    if (!l) throw new ErroHttp(401, m.sessaoNecessaria);
    return {
      id: l.id,
      nome: l.name,
      email: l.email,
      emailConfirmado: l.email_verified_at !== null,
      espaco: { id: l.workspace_id, nome: l.workspace_name, plano: l.plan_code },
    };
  }
}
