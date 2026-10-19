import type pg from 'pg';
import { mensagens } from '../../shared/mensagens.js';
import { ErroHttp } from '../erros.js';

// Limitação de pedidos com janela fixa, guardada no PostgreSQL para funcionar com várias instâncias.

// Regista mais uma tentativa e devolve quantas houve na janela actual (incluindo esta).
export async function registarTentativa(pool: pg.Pool, chave: string, janelaSegundos: number): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `insert into rate_limits (key, count, window_start) values ($1, 1, now())
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count`,
    [chave, janelaSegundos],
  );
  return rows[0]?.count ?? 1;
}

// Quantas tentativas houve na janela actual, sem registar nenhuma.
export async function contarTentativas(pool: pg.Pool, chave: string, janelaSegundos: number): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    'select count from rate_limits where key = $1 and window_start >= now() - make_interval(secs => $2)',
    [chave, janelaSegundos],
  );
  return rows[0]?.count ?? 0;
}

// Desfaz uma tentativa registada (ex.: contou-se antes de verificar e afinal estava certa).
export async function descontarTentativa(pool: pg.Pool, chave: string): Promise<void> {
  await pool.query('update rate_limits set count = greatest(count - 1, 0) where key = $1', [chave]);
}

export async function limparTentativas(pool: pg.Pool, chave: string): Promise<void> {
  await pool.query('delete from rate_limits where key = $1', [chave]);
}

// Limites usados nas rotas. Mudar aqui, num só sítio.
// Os limites por IP são largos porque, em Angola, muitos clientes das operadoras móveis saem
// para a internet pelo mesmo IP. A protecção de cada conta vem dos limites por e-mail.
export const LIMITES = {
  registoPorIp: { max: 30, janela: 60 * 60 },
  entrarPorIp: { max: 100, janela: 15 * 60 },
  // Tentativas por conta e por IP: trava quem ataca uma conta a partir de um sítio,
  // sem impedir o dono de entrar a partir de outro IP.
  tentativasPorEmailEIp: { max: 10, janela: 60 * 60 },
  // Tentativas por conta, de todos os IPs somados: trava ataques distribuídos.
  tentativasPorEmail: { max: 50, janela: 60 * 60 },
  confirmarPorIp: { max: 30, janela: 15 * 60 },
  // Por conta: evita usar o Eveni para encher a caixa de correio de alguém.
  reenviarConfirmacao: { max: 3, janela: 60 * 60 },
  recuperarPorIp: { max: 10, janela: 60 * 60 },
  // Por e-mail: acima disto responde-se igual, mas não se envia (não encher a caixa de ninguém).
  recuperarPorEmailEIp: { max: 3, janela: 60 * 60 },
  recuperarPorEmail: { max: 10, janela: 60 * 60 },
  redefinirPorIp: { max: 30, janela: 15 * 60 },
  // Tentativas de adivinhar a palavra-passe actual com a sessão de outra pessoa (ex.: telemóvel perdido).
  mudarPorConta: { max: 10, janela: 60 * 60 },
  // Códigos errados do 2FA na entrada, somando todas as entradas a meio. Por conta e IP (quem sabe a
  // palavra-passe e ataca de um sítio não bloqueia o dono noutro) e por conta no total. Com 3 códigos
  // válidos de cada vez em 1 000 000, 20 erros por hora dão ~1 hipótese em 16 000 por hora.
  codigosErradosPorContaEIp: { max: 5, janela: 60 * 60 },
  codigosErradosPorConta: { max: 20, janela: 60 * 60 },
  gerirDoisFactores: { max: 10, janela: 60 * 60 },
  // Exportar ou eliminar os dados da conta.
  dadosConta: { max: 10, janela: 60 * 60 },
} as const;

// Regista a tentativa e recusa com 429 quando passa do limite.
export async function limitar(pool: pg.Pool, chave: string, limite: { max: number; janela: number }): Promise<void> {
  if ((await registarTentativa(pool, chave, limite.janela)) > limite.max) {
    throw new ErroHttp(429, mensagens.erros.demasiadosPedidos);
  }
}
