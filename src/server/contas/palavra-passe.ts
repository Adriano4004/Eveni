import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { mudarPalavraPasse, recuperar, redefinir } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import type { Config } from '../config.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import type { EnviarEmail } from '../email/index.js';
import { emailPalavraPasseAlterada, emailRecuperacao } from '../email/modelos.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar, registarTentativa } from '../seguranca/limites.js';
import { gerarHash, verificarPalavraPasse } from '../seguranca/palavras-passe.js';
import { emSegundoPlano } from '../segundo-plano.js';
import type { criarGuardas } from './acesso.js';
import { auditar } from './auditoria.js';
import { criarLigacao, gastarLigacao, ligacaoValida } from './ligacoes.js';
import { apagarCookie, criarSessao, lerSessao, terminarTodasAsSessoes } from './sessoes.js';

// Prazo curto: quem tem acesso ao e-mail durante esta janela pode tomar conta da conta.
const VALIDADE_MINUTOS = 60;

const m = mensagens.contas;

// Depois de recuperar a conta, o dono tem de conseguir entrar a partir de onde está: limpa-se só o
// bloqueio deste IP. Os contadores de outros IPs (e o total da conta) ficam, para que quem tentava
// adivinhar não recomece com o limite cheio contra a nova palavra-passe.
async function limparBloqueioDesteIp(cliente: pg.PoolClient, email: string, ip: string) {
  await cliente.query('delete from rate_limits where key = $1', [`entrar-email-ip:${email}:${ip}`]);
}

export function registarRotasPalavraPasse(
  app: FastifyInstance,
  config: Config,
  base: BaseDeDados,
  enviarEmail: EnviarEmail,
  guardas: ReturnType<typeof criarGuardas>,
) {
  const { pool } = base;
  const urlRecuperar = `${config.APP_URL}/recuperar`;

  // Responde sempre o mesmo, exista ou não a conta, para não revelar que e-mails estão registados.
  // O trabalho (procurar a conta, criar a ligação, enviar) corre depois da resposta, para que o tempo
  // de resposta também não o revele.
  app.post('/api/auth/recuperar', async (pedido, resposta) => {
    await limitar(pool, `recuperar-ip:${pedido.ip}`, LIMITES.recuperarPorIp);
    const { email } = validar(recuperar, pedido.body);
    const ip = pedido.ip;
    emSegundoPlano('recuperação de palavra-passe', () => prepararRecuperacao(email, ip));
    return resposta.code(202).send({ mensagem: m.recuperacaoPedida });
  });

  async function prepararRecuperacao(email: string, ip: string) {
    // Limite por e-mail e IP, e um total por e-mail mais largo: quem queira esgotar os pedidos de
    // outra pessoa a partir de um só sítio não a impede de recuperar a conta a partir de outro.
    const porEmailIp = await registarTentativa(pool, `recuperar-email-ip:${email}:${ip}`, LIMITES.recuperarPorEmailEIp.janela);
    const porEmail = await registarTentativa(pool, `recuperar-email:${email}`, LIMITES.recuperarPorEmail.janela);
    const limitado = porEmailIp > LIMITES.recuperarPorEmailEIp.max || porEmail > LIMITES.recuperarPorEmail.max;

    const token = await emTransaccao(pool, async (cliente) => {
      // Linha bloqueada: dois pedidos em simultâneo não deixam duas ligações válidas.
      const { rows } = await cliente.query<{ id: string }>('select id from users where email = $1 for update', [email]);
      const utilizador = rows[0];
      if (!utilizador) return null;
      if (limitado) {
        await auditar(cliente, 'conta.recuperacao_limitada', { utilizadorId: utilizador.id, ip });
        return null;
      }
      await auditar(cliente, 'conta.recuperacao_pedida', { utilizadorId: utilizador.id, ip });
      return criarLigacao(cliente, utilizador.id, 'recuperar_palavra_passe', VALIDADE_MINUTOS);
    });
    if (token) enviarEmail(emailRecuperacao(email, `${config.APP_URL}/redefinir-palavra-passe?token=${encodeURIComponent(token)}`));
  }

  // Não inicia sessão: a pessoa entra a seguir com a nova palavra-passe (e, quando existir, com o 2FA).
  app.post('/api/auth/redefinir', async (pedido, resposta) => {
    await limitar(pool, `redefinir-ip:${pedido.ip}`, LIMITES.redefinirPorIp);
    const dados = validar(redefinir, pedido.body);
    // Verificação barata antes do hash (que é lento de propósito): ligações inventadas não gastam CPU.
    if (!(await ligacaoValida(pool, dados.token, 'recuperar_palavra_passe'))) throw new ErroHttp(400, m.ligacaoRecuperacaoInvalida);
    const hash = await gerarHash(dados.palavraPasse);

    const resultado = await emTransaccao(pool, async (cliente) => {
      const utilizadorId = await gastarLigacao(cliente, dados.token, 'recuperar_palavra_passe');
      if (!utilizadorId) return null;
      // Quem recebeu a ligação no e-mail provou que o e-mail é seu: fica também confirmado. Isto
      // devolve ao verdadeiro dono um e-mail que outra pessoa tenha registado sem confirmar.
      const { rows: antes } = await cliente.query<{ confirmado: boolean }>(
        'select email_verified_at is not null as confirmado from users where id = $1 for update',
        [utilizadorId],
      );
      const { rows } = await cliente.query<{ email: string }>(
        `update users set password_hash = $2, email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
          where id = $1 returning email`,
        [utilizadorId, hash],
      );
      const email = rows[0]!.email;
      if (!antes[0]!.confirmado) {
        // Conta que nunca tinha provado ser do dono do e-mail: tudo o que lá foi configurado (como o
        // 2FA) pode ser de quem a registou indevidamente. O verdadeiro dono recebe-a limpa.
        await cliente.query(
          'update users set totp_secret = null, totp_pending_secret = null, totp_enabled_at = null, totp_last_step = null where id = $1',
          [utilizadorId],
        );
        await cliente.query('delete from recovery_codes where user_id = $1', [utilizadorId]);
      }
      await terminarTodasAsSessoes(cliente, utilizadorId);
      await cliente.query("delete from email_tokens where user_id = $1 and purpose = 'recuperar_palavra_passe' and used_at is null", [utilizadorId]);
      await limparBloqueioDesteIp(cliente, email, pedido.ip);
      await auditar(cliente, 'conta.palavra_passe_redefinida', { utilizadorId, ip: pedido.ip });
      return { email };
    });
    if (!resultado) throw new ErroHttp(400, m.ligacaoRecuperacaoInvalida);

    // As sessões terminaram todas, incluindo a deste browser se era da mesma conta.
    if (pedido.cookies && (await lerSessao(pool, config, pedido)) === null) apagarCookie(config, resposta);
    enviarEmail(emailPalavraPasseAlterada(resultado.email, urlRecuperar, 'todas'));
    return { alterada: true };
  });

  // Mudar com a sessão iniciada: termina as outras sessões e mantém esta (com um token novo).
  app.post('/api/conta/palavra-passe', { preHandler: guardas.exigirSessao }, async (pedido, resposta) => {
    const { utilizadorId } = pedido.sessao!;
    await limitar(pool, `mudar-palavra-passe:${utilizadorId}`, LIMITES.mudarPorConta);
    const dados = validar(mudarPalavraPasse, pedido.body);

    const { rows } = await pool.query<{ email: string; password_hash: string }>('select email, password_hash from users where id = $1', [
      utilizadorId,
    ]);
    const utilizador = rows[0]!;
    if (!(await verificarPalavraPasse(utilizador.password_hash, dados.palavraPasseActual))) {
      await auditar(pool, 'conta.palavra_passe_mudar_falhado', { utilizadorId, ip: pedido.ip });
      throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { palavraPasseActual: m.palavraPasseActualErrada });
    }
    if (dados.palavraPasse === dados.palavraPasseActual) {
      throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { palavraPasse: m.palavraPasseIgual });
    }
    const hash = await gerarHash(dados.palavraPasse);

    await emTransaccao(pool, async (cliente) => {
      await cliente.query('update users set password_hash = $2, updated_at = now() where id = $1', [utilizadorId, hash]);
      await terminarTodasAsSessoes(cliente, utilizadorId);
      await cliente.query("delete from email_tokens where user_id = $1 and purpose = 'recuperar_palavra_passe' and used_at is null", [utilizadorId]);
      await criarSessao(cliente, config, resposta, utilizadorId, pedido);
      await auditar(cliente, 'conta.palavra_passe_mudada', { utilizadorId, ip: pedido.ip });
    });

    enviarEmail(emailPalavraPasseAlterada(utilizador.email, urlRecuperar, 'outras'));
    return resposta.code(204).send();
  });
}
