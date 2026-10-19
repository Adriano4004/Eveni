import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import QRCode from 'qrcode';
import { activarDoisFactores, confirmarDoisFactores, type InicioDoisFactores, entrarDoisFactores } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import type { Config } from '../config.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import type { EnviarEmail } from '../email/index.js';
import { emailAvisoConta } from '../email/modelos.js';
import { ErroHttp, validar } from '../erros.js';
import { criarCifra } from '../seguranca/cifra.js';
import { LIMITES, contarTentativas, limitar, limparTentativas, registarTentativa } from '../seguranca/limites.js';
import { verificarPalavraPasse } from '../seguranca/palavras-passe.js';
import { gerarSegredo, urlOtpauth, verificarTotp } from '../seguranca/totp.js';
import type { criarGuardas } from './acesso.js';
import { auditar } from './auditoria.js';
import { criarSessao, hashToken, lerSessao, opcoesCookie, terminarSessao } from './sessoes.js';

const m = mensagens.contas;
const e = mensagens.emails;

// Tempo para introduzir o código depois da palavra-passe, e tentativas por entrada.
const DESAFIO_MINUTOS = 5;
const DESAFIO_TENTATIVAS = 5;
const QUANTOS_CODIGOS = 10;
// Sem I, O, 0 e 1, que se confundem ao copiar à mão.
const ALFABETO_CODIGOS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function nomeCookieDesafio(config: Config): string {
  return config.APP_ENV === 'local' ? 'eveni_2fa' : '__Host-eveni_2fa';
}

// "abcde-fghij", " ABCDE FGHIJ " -> "ABCDEFGHIJ"
function normalizarCodigo(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashCodigo(codigo: string): string {
  return hashToken(normalizarCodigo(codigo));
}

function gerarCodigoRecuperacao(): string {
  const letras = Array.from({ length: 10 }, () => ALFABETO_CODIGOS[randomInt(ALFABETO_CODIGOS.length)]).join('');
  return `${letras.slice(0, 5)}-${letras.slice(5)}`;
}

async function substituirCodigosRecuperacao(cliente: pg.PoolClient, utilizadorId: string): Promise<string[]> {
  const codigos = Array.from({ length: QUANTOS_CODIGOS }, gerarCodigoRecuperacao);
  await cliente.query('delete from recovery_codes where user_id = $1', [utilizadorId]);
  await cliente.query('insert into recovery_codes (user_id, code_hash) select $1, unnest($2::text[])', [utilizadorId, codigos.map(hashCodigo)]);
  return codigos;
}

// Primeiro passo da entrada já feito (palavra-passe certa): guarda a entrada a meio e pede o código.
export async function iniciarDesafio(pool: pg.Pool, config: Config, resposta: FastifyReply, utilizadorId: string) {
  const token = randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + DESAFIO_MINUTOS * 60 * 1000);
  // Não apaga outras entradas a meio da mesma conta: quem sabe a palavra-passe não pode, assim,
  // interromper a entrada do dono. Os códigos errados contam por conta (ver LIMITES).
  await pool.query('insert into login_challenges (token_hash, user_id, expires_at) values ($1, $2, $3)', [hashToken(token), utilizadorId, expira]);
  resposta.setCookie(nomeCookieDesafio(config), token, { ...opcoesCookie(config), expires: expira });
}

export function registarRotasDoisFactores(
  app: FastifyInstance,
  config: Config,
  base: BaseDeDados,
  enviarEmail: EnviarEmail,
  guardas: ReturnType<typeof criarGuardas>,
  obterEu: (utilizadorId: string) => Promise<unknown>,
) {
  const { pool } = base;
  const cifra = criarCifra(config.SESSION_SECRET, 'totp');

  // Se SESSION_SECRET tiver mudado, o segredo guardado deixa de ser legível: o código da aplicação
  // falha como "incorrecto" (a pessoa pode usar um código de recuperação) e fica registado nos logs.
  function decifrarSegredo(utilizadorId: string, guardado: string): string | null {
    try {
      return cifra.decifrar(guardado);
    } catch {
      console.error(`[2fa] segredo ilegível para o utilizador ${utilizadorId} (SESSION_SECRET mudou?)`);
      return null;
    }
  }
  const urlRecuperar = `${config.APP_URL}/recuperar`;

  // Verifica um código da aplicação e regista o passo usado, numa só operação: o mesmo código não
  // entra duas vezes, nem com pedidos em paralelo.
  async function usarCodigoTotp(cliente: pg.Pool | pg.PoolClient, utilizadorId: string, codigo: string): Promise<boolean> {
    const { rows } = await cliente.query<{ totp_secret: string | null; totp_last_step: number | null }>(
      'select totp_secret, totp_last_step from users where id = $1',
      [utilizadorId],
    );
    const linha = rows[0];
    if (!linha?.totp_secret) return false;
    const segredo = decifrarSegredo(utilizadorId, linha.totp_secret);
    if (!segredo) return false;
    const passo = verificarTotp(segredo, codigo, linha.totp_last_step);
    if (passo === null) return false;
    const { rowCount } = await cliente.query(
      'update users set totp_last_step = $2 where id = $1 and (totp_last_step is null or totp_last_step < $2)',
      [utilizadorId, passo],
    );
    return rowCount === 1;
  }

  async function usarCodigoRecuperacao(cliente: pg.Pool | pg.PoolClient, utilizadorId: string, codigo: string): Promise<boolean> {
    const { rowCount } = await cliente.query(
      'update recovery_codes set used_at = now() where user_id = $1 and code_hash = $2 and used_at is null',
      [utilizadorId, hashCodigo(codigo)],
    );
    return rowCount === 1;
  }

  async function codigosRestantes(utilizadorId: string): Promise<number> {
    const { rows } = await pool.query<{ n: number }>('select count(*)::int as n from recovery_codes where user_id = $1 and used_at is null', [
      utilizadorId,
    ]);
    return rows[0]!.n;
  }

  // Palavra-passe e código confirmados para acções sensíveis (activar, desactivar, novos códigos).
  async function confirmarIdentidade(pedido: FastifyRequest, palavraPasse: string) {
    const { utilizadorId } = pedido.sessao!;
    await limitar(pool, `conta-2fa:${utilizadorId}`, LIMITES.gerirDoisFactores);
    const { rows } = await pool.query<{ email: string; password_hash: string; totp_enabled_at: Date | null }>(
      'select email, password_hash, totp_enabled_at from users where id = $1',
      [utilizadorId],
    );
    const utilizador = rows[0]!;
    if (!(await verificarPalavraPasse(utilizador.password_hash, palavraPasse))) {
      await auditar(pool, 'conta.2fa_confirmacao_falhada', { utilizadorId, ip: pedido.ip });
      throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { palavraPasse: m.palavraPasseActualErrada });
    }
    return { utilizadorId, email: utilizador.email, activo: utilizador.totp_enabled_at !== null };
  }

  // Segundo passo da entrada.
  app.post('/api/auth/entrar/2fa', async (pedido, resposta) => {
    await limitar(pool, `entrar-2fa-ip:${pedido.ip}`, LIMITES.entrarPorIp);
    const token = pedido.cookies[nomeCookieDesafio(config)];
    if (!token || token.length > 100) throw new ErroHttp(401, m.desafioExpirado);
    const dados = validar(entrarDoisFactores, pedido.body);

    // Conta a tentativa antes de verificar: no máximo DESAFIO_TENTATIVAS por entrada.
    const { rows } = await pool.query<{ user_id: string; email: string }>(
      `update login_challenges c set attempts = attempts + 1
        from users u
        where c.token_hash = $1 and c.expires_at > now() and c.attempts < $2 and u.id = c.user_id
        returning c.user_id, u.email`,
      [hashToken(token), DESAFIO_TENTATIVAS],
    );
    const desafio = rows[0];
    if (!desafio) throw new ErroHttp(401, m.desafioExpirado);
    const utilizadorId = desafio.user_id;
    // Limites de códigos errados, somando todas as entradas a meio: quem sabe a palavra-passe não pode
    // recomeçar a entrada para ter tentativas infinitas. Só os erros contam (entradas certas não gastam).
    const chaveContaIp = `entrar-2fa-erros:${utilizadorId}:${pedido.ip}`;
    const chaveConta = `entrar-2fa-erros:${utilizadorId}`;
    if (
      (await contarTentativas(pool, chaveContaIp, LIMITES.codigosErradosPorContaEIp.janela)) >= LIMITES.codigosErradosPorContaEIp.max ||
      (await contarTentativas(pool, chaveConta, LIMITES.codigosErradosPorConta.janela)) >= LIMITES.codigosErradosPorConta.max
    ) {
      throw new ErroHttp(429, m.contaBloqueada);
    }

    const metodo = dados.codigo !== undefined ? 'aplicacao' : 'recuperacao';
    const certo =
      dados.codigo !== undefined
        ? await usarCodigoTotp(pool, utilizadorId, dados.codigo)
        : await usarCodigoRecuperacao(pool, utilizadorId, dados.codigoRecuperacao!);
    if (!certo) {
      await registarTentativa(pool, chaveContaIp, LIMITES.codigosErradosPorContaEIp.janela);
      await registarTentativa(pool, chaveConta, LIMITES.codigosErradosPorConta.janela);
      await auditar(pool, 'sessao.2fa_falhado', { utilizadorId, ip: pedido.ip, detalhes: { metodo } });
      throw new ErroHttp(401, m.codigoErrado, { [metodo === 'aplicacao' ? 'codigo' : 'codigoRecuperacao']: m.codigoErrado });
    }

    await pool.query('delete from login_challenges where token_hash = $1', [hashToken(token)]);
    resposta.clearCookie(nomeCookieDesafio(config), opcoesCookie(config));
    await limparTentativas(pool, chaveContaIp);
    await limparTentativas(pool, `entrar-email-ip:${desafio.email}:${pedido.ip}`);
    const anterior = await lerSessao(pool, config, pedido);
    if (anterior) await terminarSessao(pool, anterior.tokenHash);
    await criarSessao(pool, config, resposta, utilizadorId, pedido);
    await auditar(pool, 'sessao.entrar', { utilizadorId, ip: pedido.ip, detalhes: { doisFactores: metodo } });

    if (metodo === 'recuperacao') {
      const c = e.codigoRecuperacaoUsado;
      enviarEmail(emailAvisoConta(desafio.email, c.assunto, c.corpo(await codigosRestantes(utilizadorId)), urlRecuperar));
    }
    return obterEu(utilizadorId);
  });

  // Gera o segredo e o código QR. Só fica activo depois de a pessoa provar que o configurou.
  app.post('/api/conta/2fa/iniciar', { preHandler: guardas.exigirSessao }, async (pedido): Promise<InicioDoisFactores> => {
    const { utilizadorId } = pedido.sessao!;
    await limitar(pool, `conta-2fa:${utilizadorId}`, LIMITES.gerirDoisFactores);
    const { rows } = await pool.query<{ email: string; totp_enabled_at: Date | null }>('select email, totp_enabled_at from users where id = $1', [
      utilizadorId,
    ]);
    const utilizador = rows[0]!;
    if (utilizador.totp_enabled_at) throw new ErroHttp(409, m.doisFactoresJaActivo);
    const segredo = gerarSegredo();
    await pool.query('update users set totp_pending_secret = $2 where id = $1', [utilizadorId, cifra.cifrar(segredo)]);
    const svg = await QRCode.toString(urlOtpauth(segredo, utilizador.email), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return { segredo, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
  });

  // Activar exige a palavra-passe: quem roubar uma sessão aberta não consegue activar o 2FA com o
  // seu telemóvel e deixar o dono de fora.
  // Termina as outras sessões: quem activa o 2FA por desconfiar de uma sessão roubada fica protegido logo.
  app.post('/api/conta/2fa/activar', { preHandler: guardas.exigirSessao }, async (pedido) => {
    const dados = validar(activarDoisFactores, pedido.body);
    const { utilizadorId, email, activo } = await confirmarIdentidade(pedido, dados.palavraPasse);
    if (activo) throw new ErroHttp(409, m.doisFactoresJaActivo);

    const codigos = await emTransaccao(pool, async (cliente) => {
      const { rows } = await cliente.query<{ totp_pending_secret: string | null }>(
        'select totp_pending_secret from users where id = $1 for update',
        [utilizadorId],
      );
      const pendente = rows[0]?.totp_pending_secret;
      if (!pendente) throw new ErroHttp(400, m.doisFactoresPorIniciar);
      const segredo = decifrarSegredo(utilizadorId, pendente);
      if (!segredo) throw new ErroHttp(400, m.doisFactoresPorIniciar);
      const passo = verificarTotp(segredo, dados.codigo, null);
      if (passo === null) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { codigo: m.codigoErrado });
      await cliente.query(
        `update users set totp_secret = totp_pending_secret, totp_pending_secret = null, totp_enabled_at = now(),
                totp_last_step = $2, updated_at = now() where id = $1`,
        [utilizadorId, passo],
      );
      await cliente.query('delete from sessions where user_id = $1 and token_hash <> $2', [utilizadorId, pedido.sessao!.tokenHash]);
      await cliente.query('delete from login_challenges where user_id = $1', [utilizadorId]);
      await auditar(cliente, 'conta.2fa_activado', { utilizadorId, ip: pedido.ip });
      return substituirCodigosRecuperacao(cliente, utilizadorId);
    });

    const a = e.doisFactoresActivado;
    enviarEmail(emailAvisoConta(email, a.assunto, a.corpo, urlRecuperar));
    return { codigosRecuperacao: codigos };
  });

  // O código já vem sem espaços nas pontas (esquema). Falhas ficam na auditoria (fora da transacção,
  // que é desfeita) antes de responder.
  async function confirmarComCodigo(cliente: pg.PoolClient, utilizadorId: string, codigo: string, ip: string) {
    const certo = /^\d{6}$/.test(codigo) ? await usarCodigoTotp(cliente, utilizadorId, codigo) : await usarCodigoRecuperacao(cliente, utilizadorId, codigo);
    if (!certo) {
      await auditar(pool, 'conta.2fa_confirmacao_falhada', { utilizadorId, ip, detalhes: { motivo: 'codigo' } });
      throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { codigo: m.codigoErrado });
    }
  }

  app.post('/api/conta/2fa/desactivar', { preHandler: guardas.exigirSessao }, async (pedido, resposta) => {
    const dados = validar(confirmarDoisFactores, pedido.body);
    const { utilizadorId, email, activo } = await confirmarIdentidade(pedido, dados.palavraPasse);
    if (!activo) throw new ErroHttp(409, m.doisFactoresInactivo);
    await emTransaccao(pool, async (cliente) => {
      await confirmarComCodigo(cliente, utilizadorId, dados.codigo, pedido.ip);
      await cliente.query(
        `update users set totp_secret = null, totp_pending_secret = null, totp_enabled_at = null, totp_last_step = null,
                updated_at = now() where id = $1`,
        [utilizadorId],
      );
      await cliente.query('delete from recovery_codes where user_id = $1', [utilizadorId]);
      await auditar(cliente, 'conta.2fa_desactivado', { utilizadorId, ip: pedido.ip });
    });
    const d = e.doisFactoresDesactivado;
    enviarEmail(emailAvisoConta(email, d.assunto, d.corpo, urlRecuperar));
    return resposta.code(204).send();
  });

  app.post('/api/conta/2fa/codigos-recuperacao', { preHandler: guardas.exigirSessao }, async (pedido) => {
    const dados = validar(confirmarDoisFactores, pedido.body);
    const { utilizadorId, activo } = await confirmarIdentidade(pedido, dados.palavraPasse);
    if (!activo) throw new ErroHttp(409, m.doisFactoresInactivo);
    const codigos = await emTransaccao(pool, async (cliente) => {
      await confirmarComCodigo(cliente, utilizadorId, dados.codigo, pedido.ip);
      await auditar(cliente, 'conta.2fa_codigos_novos', { utilizadorId, ip: pedido.ip });
      return substituirCodigosRecuperacao(cliente, utilizadorId);
    });
    return { codigosRecuperacao: codigos };
  });
}
