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
} as const;

// Regista a tentativa e recusa com 429 quando passa do limite.
export async function limitar(pool: pg.Pool, chave: string, limite: { max: number; janela: number }): Promise<void> {
  if ((await registarTentativa(pool, chave, limite.janela)) > limite.max) {
    throw new ErroHttp(429, mensagens.erros.demasiadosPedidos);
  }
}
