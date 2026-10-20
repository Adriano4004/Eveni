import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { InfoRsvp, Resposta } from '../../shared/convidados.js';
import { responderRsvp, tokenRsvp } from '../../shared/esquemas.js';
import { mensagens } from '../../shared/mensagens.js';
import type { EstadoProjecto } from '../../shared/projectos.js';
import type { Config } from '../config.js';
import { type BaseDeDados, emTransaccao } from '../db/index.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar } from '../seguranca/limites.js';

// Ligações de RSVP por convidado (decisão 018; CLAUDE.md, secção 5, regra 6).
//
// O token é a chave do convidado (guests.rsvp_key, 32 caracteres hexadecimais) seguida de uma assinatura
// HMAC dessa chave, feita com uma chave derivada de SESSION_SECRET. Assim:
// - o organizador pode voltar a ver e a partilhar a ligação quando quiser (calcula-se a partir da chave);
// - uma fuga só da base de dados não chega para responder por ninguém (falta a assinatura);
// - gerar uma ligação nova muda a chave e a antiga deixa de funcionar.
// Mudar SESSION_SECRET invalida todas as ligações de RSVP já enviadas.

const COMPRIMENTO_ASSINATURA = 22; // 16 bytes em base64url

export function criarLigacoesRsvp(config: Config) {
  const chave = Buffer.from(hkdfSync('sha256', config.SESSION_SECRET, 'eveni', 'rsvp', 32));
  const assinar = (hex: string) => createHmac('sha256', chave).update(hex).digest().subarray(0, 16).toString('base64url');
  return {
    token(rsvpKey: string): string {
      const hex = rsvpKey.replaceAll('-', '');
      return `${hex}${assinar(hex)}`;
    },
    ligacao(rsvpKey: string): string {
      return `${config.APP_URL}/rsvp?token=${this.token(rsvpKey)}`;
    },
    // Devolve a chave (uuid) se o token for válido; null caso contrário.
    ler(token: string): string | null {
      const partes = /^([0-9a-f]{32})([A-Za-z0-9_-]{22})$/.exec(token);
      if (!partes) return null;
      const [, hex, assinatura] = partes as unknown as [string, string, string];
      const esperada = Buffer.from(assinar(hex));
      const recebida = Buffer.from(assinatura);
      if (recebida.length !== COMPRIMENTO_ASSINATURA || !timingSafeEqual(esperada, recebida)) return null;
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    },
  };
}

// O dia de hoje no calendário de Luanda, calculado pela base de dados.
const HOJE_SQL = "(now() at time zone 'Africa/Luanda')::date";

interface LinhaRsvp {
  id: string;
  name: string;
  plus_ones_allowed: number;
  response: Resposta;
  plus_ones_confirmed: number;
  projecto: string;
  event_date: string;
  location: string | null;
  status: EstadoProjecto;
  aberto: boolean;
}

const SELECCAO = `
  select g.id, g.name, g.plus_ones_allowed, g.response, g.plus_ones_confirmed,
         p.name as projecto, p.event_date, p.location, p.status,
         (p.status = 'active' and p.event_date >= ${HOJE_SQL}) as aberto
    from guests g join projects p on p.id = g.project_id`;

const paraInfo = (l: LinhaRsvp): InfoRsvp => ({
  evento: l.projecto,
  dataEvento: l.event_date,
  local: l.location,
  convidado: l.name,
  acompanhantes: l.plus_ones_allowed,
  resposta: l.response,
  acompanhantesConfirmados: l.plus_ones_confirmed,
  aberto: l.aberto,
});

// Rotas públicas (sem sessão): quem tem a ligação vê o convite e responde por aquele convidado, e só por ele.
// Nunca cria convidados (falha da versão anterior). Token inválido, convidado removido ou ligação substituída:
// a mesma resposta.
export function registarRotasRsvp(app: FastifyInstance, config: Config, base: BaseDeDados) {
  const { pool } = base;
  const ligacoes = criarLigacoesRsvp(config);
  const m = mensagens.rsvp;

  function chaveDoPedido(token: string): string {
    const chave = ligacoes.ler(token);
    if (!chave) throw new ErroHttp(404, m.ligacaoInvalida);
    return chave;
  }

  app.post('/api/rsvp/ver', async (pedido): Promise<InfoRsvp> => {
    await limitar(pool, `rsvp-ip:${pedido.ip}`, LIMITES.rsvpPorIp);
    const chave = chaveDoPedido(validar(tokenRsvp, pedido.body).token);
    const { rows } = await pool.query<LinhaRsvp>(`${SELECCAO} where g.rsvp_key = $1`, [chave]);
    if (!rows[0]) throw new ErroHttp(404, m.ligacaoInvalida);
    return paraInfo(rows[0]);
  });

  app.post('/api/rsvp/responder', async (pedido): Promise<InfoRsvp> => {
    await limitar(pool, `rsvp-ip:${pedido.ip}`, LIMITES.rsvpPorIp);
    const dados = validar(responderRsvp, pedido.body);
    const chave = chaveDoPedido(dados.token);
    return emTransaccao(pool, async (cliente) => {
      // Primeiro o projecto (em partilha: arquivar ao mesmo tempo espera), depois o convidado: a mesma
      // ordem das outras rotas de convidados.
      const { rows: projectos } = await cliente.query<{ id: string }>(
        'select p.id from projects p join guests g on g.project_id = p.id where g.rsvp_key = $1 for share of p',
        [chave],
      );
      if (!projectos[0]) throw new ErroHttp(404, m.ligacaoInvalida);
      const { rows } = await cliente.query<LinhaRsvp>(`${SELECCAO} where g.rsvp_key = $1 and p.id = $2 for update of g`, [chave, projectos[0].id]);
      const actual = rows[0];
      if (!actual) throw new ErroHttp(404, m.ligacaoInvalida);
      if (!actual.aberto) throw new ErroHttp(409, actual.status === 'archived' ? m.fechado : m.eventoPassou);
      // Só quem vai leva acompanhantes, nunca mais do que os permitidos.
      const acompanhantes = dados.resposta === 'yes' ? Math.min(dados.acompanhantes ?? 0, actual.plus_ones_allowed) : 0;
      await cliente.query(
        `update guests set response = $2, plus_ones_confirmed = $3, responded_at = clock_timestamp(), updated_at = clock_timestamp()
          where id = $1`,
        [actual.id, dados.resposta, acompanhantes],
      );
      return { ...paraInfo(actual), resposta: dados.resposta, acompanhantesConfirmados: acompanhantes };
    });
  });
}
