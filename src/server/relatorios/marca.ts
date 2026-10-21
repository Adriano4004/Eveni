import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { type CodigoPlano, dadosMarca, logoMarca } from '../../shared/esquemas.js';
import { type Marca, MAX_BYTES_LOGO, PLANOS_COM_MARCA } from '../../shared/marca.js';
import { mensagens } from '../../shared/mensagens.js';
import type { criarGuardas } from '../contas/acesso.js';
import type { BaseDeDados } from '../db/index.js';
import { ErroHttp, validar } from '../erros.js';
import { LIMITES, limitar } from '../seguranca/limites.js';
import { imagemValida, type MarcaPdf } from './pdf.js';

// Marca da agência nos relatórios PDF (decisão 020): logótipo, cor e rodapé, por espaço de trabalho.
// Gere-a o dono, sempre no seu próprio espaço (tirado da sessão). Só os planos Empresarial e Grandes a usam.

const m = mensagens.validacao;

// Primeiros bytes de cada formato aceite: o tipo declarado no "data:" não basta.
const ASSINATURAS: [string, Buffer][] = [
  ['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff])],
];

// Lê "data:image/png;base64,…" e devolve a imagem só se for mesmo PNG ou JPEG, até 500 KB, e legível.
export function lerLogo(dataUrl: string): { imagem: Buffer; tipo: string } {
  const partes = /^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!partes) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { imagem: m.logoInvalido });
  const imagem = Buffer.from(partes[1]!, 'base64');
  if (imagem.length > MAX_BYTES_LOGO) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { imagem: m.logoGrande });
  const tipo = ASSINATURAS.find(([, assinatura]) => imagem.subarray(0, assinatura.length).equals(assinatura))?.[0];
  if (!tipo || !imagemValida(imagem)) throw new ErroHttp(400, mensagens.erros.pedidoInvalido, { imagem: m.logoInvalido });
  return { imagem, tipo };
}

async function espacoDoDono(cliente: pg.Pool | pg.PoolClient, utilizadorId: string): Promise<{ id: string; plan_code: CodigoPlano }> {
  const { rows } = await cliente.query<{ id: string; plan_code: CodigoPlano }>(
    `select w.id, w.plan_code from workspace_members wm join workspaces w on w.id = wm.workspace_id
      where wm.user_id = $1 and wm.role = 'owner' order by wm.created_at limit 1`,
    [utilizadorId],
  );
  if (!rows[0]) throw new ErroHttp(401, mensagens.contas.sessaoNecessaria);
  return rows[0];
}

// A marca a usar nos PDF de um espaço: só nos planos com marca, e só se houver alguma coisa definida.
export async function marcaParaPdf(pool: pg.Pool, espacoId: string): Promise<MarcaPdf | null> {
  const { rows } = await pool.query<{ plan_code: CodigoPlano; color: string | null; footer: string | null; logo: Buffer | null }>(
    'select w.plan_code, b.color, b.footer, b.logo from workspaces w join workspace_brands b on b.workspace_id = w.id where w.id = $1',
    [espacoId],
  );
  const r = rows[0];
  if (!r || !PLANOS_COM_MARCA.includes(r.plan_code) || (!r.color && !r.footer && !r.logo)) return null;
  return { cor: r.color, rodape: r.footer, logo: r.logo };
}

export function registarRotasMarca(app: FastifyInstance, base: BaseDeDados, guardas: ReturnType<typeof criarGuardas>) {
  const { pool } = base;

  async function lerMarca(espaco: { id: string; plan_code: CodigoPlano }): Promise<Marca> {
    const { rows } = await pool.query<{ color: string | null; footer: string | null; tem_logo: boolean }>(
      'select color, footer, logo is not null as tem_logo from workspace_brands where workspace_id = $1',
      [espaco.id],
    );
    return { disponivel: PLANOS_COM_MARCA.includes(espaco.plan_code), cor: rows[0]?.color ?? null, rodape: rows[0]?.footer ?? null, temLogo: rows[0]?.tem_logo ?? false };
  }

  // Só nos planos com marca; e sempre no espaço da própria pessoa.
  async function espacoQuePodeAlterar(utilizadorId: string) {
    await limitar(pool, `marca:${utilizadorId}`, LIMITES.marca);
    const espaco = await espacoDoDono(pool, utilizadorId);
    if (!PLANOS_COM_MARCA.includes(espaco.plan_code)) throw new ErroHttp(403, mensagens.relatorios.marcaSoNosPlanos);
    return espaco;
  }

  app.get('/api/marca', { preHandler: guardas.exigirSessao }, async (pedido): Promise<Marca> => lerMarca(await espacoDoDono(pool, pedido.sessao!.utilizadorId)));

  app.post('/api/marca', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<Marca> => {
    const espaco = await espacoQuePodeAlterar(pedido.sessao!.utilizadorId);
    const dados = validar(dadosMarca, pedido.body);
    await pool.query(
      `insert into workspace_brands (workspace_id, color, footer) values ($1, $2, $3)
       on conflict (workspace_id) do update set color = excluded.color, footer = excluded.footer, updated_at = clock_timestamp()`,
      [espaco.id, dados.cor, dados.rodape],
    );
    return lerMarca(espaco);
  });

  // O logótipo vem como texto (data URL) num pedido JSON: até 500 KB de imagem cabem no limite do pedido (1 MB).
  app.post('/api/marca/logo', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<Marca> => {
    const espaco = await espacoQuePodeAlterar(pedido.sessao!.utilizadorId);
    const { imagem, tipo } = lerLogo(validar(logoMarca, pedido.body).imagem);
    await pool.query(
      `insert into workspace_brands (workspace_id, logo, logo_type) values ($1, $2, $3)
       on conflict (workspace_id) do update set logo = excluded.logo, logo_type = excluded.logo_type, updated_at = clock_timestamp()`,
      [espaco.id, imagem, tipo],
    );
    return lerMarca(espaco);
  });

  app.post('/api/marca/logo/remover', { preHandler: guardas.exigirEmailConfirmado }, async (pedido): Promise<Marca> => {
    const espaco = await espacoQuePodeAlterar(pedido.sessao!.utilizadorId);
    await pool.query('update workspace_brands set logo = null, logo_type = null, updated_at = clock_timestamp() where workspace_id = $1', [espaco.id]);
    return lerMarca(espaco);
  });

  // O logótipo do próprio espaço, para o dono o ver no ecrã. Nunca o de outro espaço.
  app.get('/api/marca/logo', { preHandler: guardas.exigirSessao }, async (pedido, resposta) => {
    const espaco = await espacoDoDono(pool, pedido.sessao!.utilizadorId);
    const { rows } = await pool.query<{ logo: Buffer | null; logo_type: string | null }>('select logo, logo_type from workspace_brands where workspace_id = $1', [
      espaco.id,
    ]);
    if (!rows[0]?.logo) throw new ErroHttp(404, mensagens.erros.naoEncontrado);
    return resposta.header('content-type', rows[0].logo_type!).header('x-content-type-options', 'nosniff').header('cache-control', 'private, no-store').send(rows[0].logo);
  });
}
