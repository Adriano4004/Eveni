// Avaliação dos fornecedores depois do evento (decisão 019).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { type Fornecedor, formatarMedia } from '../src/shared/fornecedores.js';
import type { ItemOrcamento } from '../src/shared/projectos.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

const base = criarBaseDeDados(URL_BD_TESTE);
let c: Awaited<ReturnType<typeof criarCliente>>;

beforeAll(async () => {
  await aplicarMigracoes(base, 'drizzle');
});
beforeEach(async () => {
  await limparBaseDeDados(base.pool);
  c = await criarCliente(base);
});
afterAll(async () => {
  await c.app.close();
  await base.fechar();
});

async function contaConfirmada(email: string, nome: string) {
  const cookie = cookieDe(await c.registar(email, nome));
  expect((await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie)).statusCode).toBe(200);
  return { cookie, id: (await c.eu(cookie)).json().id as string };
}

const novoProjecto = async (cookie: string, nome: string) =>
  (await c.post('/api/projectos', { template: 'T01', nome, dataEvento: somarDias(hojeEmLuanda(), 30) }, cookie)).json().id as string;
// O evento já aconteceu (as datas não se mudam pela API: directamente na base de dados de teste).
const eventoOntem = (projecto: string) => base.pool.query('update projects set event_date = $2 where id = $1', [projecto, somarDias(hojeEmLuanda(), -1)]);

// A Ana tem um projecto (Bruno editor, Carla leitora) com o fornecedor "Som Kianda" numa rubrica;
// "Buffet" é do espaço mas não trabalhou neste evento. A Eva tem o seu espaço.
async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto = await novoProjecto(ana.cookie, 'Conferência');
  const pessoas: Record<string, { cookie: string; id: string }> = {};
  for (const [email, nome, papel] of [
    ['bruno@exemplo.ao', 'Bruno Neto', 'editor'],
    ['carla@exemplo.ao', 'Carla Lima', 'viewer'],
  ] as const) {
    const pessoa = await contaConfirmada(email, nome);
    const ligacao: string = (await c.post('/api/equipa/convites', { email }, ana.cookie)).json().ligacao;
    await c.post('/api/convites/aceitar', { token: decodeURIComponent(new URL(ligacao).searchParams.get('token')!) }, pessoa.cookie);
    await c.post(`/api/projectos/${projecto}/acessos`, { utilizadorId: pessoa.id, papel }, ana.cookie);
    pessoas[email] = pessoa;
  }
  const som: Fornecedor = (await c.post('/api/fornecedores', { nome: 'Som Kianda', categoria: 'Equipamentos' }, ana.cookie)).json();
  const buffet: Fornecedor = (await c.post('/api/fornecedores', { nome: 'Buffet', categoria: 'Alimentação/Hospedagem' }, ana.cookie)).json();
  const item = ((await c.get(`/api/projectos/${projecto}`, ana.cookie)).json().orcamento as ItemOrcamento[])[1]!;
  await c.post(`/api/projectos/${projecto}/orcamento/${item.id}`, { categoria: item.categoria, descricao: item.descricao, fornecedorId: som.id }, ana.cookie);
  const eva = await contaConfirmada('eva@exemplo.ao', 'Eva Pinto');
  return { ana, bruno: pessoas['bruno@exemplo.ao']!, carla: pessoas['carla@exemplo.ao']!, eva, projecto, som, buffet };
}

const avaliar = (cookie: string, p: string, f: string, dados: object) => c.post(`/api/projectos/${p}/avaliacoes/${f}`, dados, cookie);
const doProjecto = (cookie: string, p: string) => c.get(`/api/projectos/${p}/avaliacoes`, cookie);

describe('avaliar depois do evento', () => {
  it('antes do dia do evento não se avalia; a lista mostra os fornecedores das rubricas', async () => {
    const { ana, projecto, som } = await cenario();
    const r = (await doProjecto(ana.cookie, projecto)).json();
    expect(r).toMatchObject({ aberta: false, fornecedores: [{ id: som.id, nome: 'Som Kianda', categoria: 'Equipamentos', avaliacao: null }] });
    expect((await avaliar(ana.cookie, projecto, som.id, { estrelas: 5 })).statusCode).toBe(409);
  });

  it('no dia do evento já se avalia; mudar a avaliação substitui-a; a média aparece na lista', async () => {
    const { ana, bruno, projecto, som } = await cenario();
    await base.pool.query('update projects set event_date = $2 where id = $1', [projecto, hojeEmLuanda()]);
    const r = await avaliar(ana.cookie, projecto, som.id, { estrelas: '4', comentario: ' Pontual, mas o som falhou 5 minutos. ' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ estrelas: 4, comentario: 'Pontual, mas o som falhou 5 minutos.' });
    expect((await avaliar(bruno.cookie, projecto, som.id, { estrelas: 3, comentario: '' })).json()).toEqual({ estrelas: 3, comentario: null });
    expect((await doProjecto(ana.cookie, projecto)).json().fornecedores[0].avaliacao).toEqual({ estrelas: 3, comentario: null });

    // Outro evento, outra avaliação: a média junta as duas.
    const segundo = await novoProjecto(ana.cookie, 'Lançamento');
    const item = ((await c.get(`/api/projectos/${segundo}`, ana.cookie)).json().orcamento as ItemOrcamento[])[1]!;
    await c.post(`/api/projectos/${segundo}/orcamento/${item.id}`, { categoria: item.categoria, descricao: item.descricao, fornecedorId: som.id }, ana.cookie);
    await eventoOntem(segundo);
    await avaliar(ana.cookie, segundo, som.id, { estrelas: 4 });
    const lista: Fornecedor[] = (await c.get('/api/fornecedores', ana.cookie)).json();
    expect(lista.find((f) => f.id === som.id)).toMatchObject({ media: 3.5, avaliacoes: 2 });
    expect(lista.find((f) => f.nome === 'Buffet')).toMatchObject({ media: null, avaliacoes: 0 });
    expect(formatarMedia(3.5)).toBe('3,5');

    const historico = (await c.get(`/api/fornecedores/${som.id}/avaliacoes`, ana.cookie)).json();
    expect(historico.map((h: { projecto: string; estrelas: number }) => [h.projecto, h.estrelas])).toEqual([
      ['Conferência', 3],
      ['Lançamento', 4],
    ]);
  });

  it('com o projecto arquivado ainda se avalia', async () => {
    const { ana, projecto, som } = await cenario();
    await eventoOntem(projecto);
    await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
    expect((await avaliar(ana.cookie, projecto, som.id, { estrelas: 5 })).statusCode).toBe(200);
  });

  it('dados inválidos dão 400; um fornecedor que não trabalhou neste evento é recusado', async () => {
    const { ana, projecto, som, buffet } = await cenario();
    await eventoOntem(projecto);
    for (const mau of [{ estrelas: 0 }, { estrelas: 6 }, { estrelas: 2.5 }, { estrelas: 'cinco' }, {}, { estrelas: 3, comentario: 'x'.repeat(501) }]) {
      expect((await avaliar(ana.cookie, projecto, som.id, mau)).statusCode, JSON.stringify(mau)).toBe(400);
    }
    const r = await avaliar(ana.cookie, projecto, buffet.id, { estrelas: 1 });
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).toMatch(/escolhidos nalguma rubrica/);
  });
});

describe('quem pode', () => {
  it('a leitora não vê nem faz avaliações; alguém de fora e sem sessão também não', async () => {
    const { ana, carla, eva, projecto, som } = await cenario();
    await eventoOntem(projecto);
    await avaliar(ana.cookie, projecto, som.id, { estrelas: 2, comentario: 'Chegou tarde' });
    const daCarla = await doProjecto(carla.cookie, projecto);
    expect(daCarla.statusCode).toBe(403);
    expect(daCarla.body).not.toContain('Chegou tarde');
    expect((await avaliar(carla.cookie, projecto, som.id, { estrelas: 5 })).statusCode).toBe(403);
    expect((await doProjecto(eva.cookie, projecto)).statusCode).toBe(404);
    expect((await avaliar(eva.cookie, projecto, som.id, { estrelas: 5 })).statusCode).toBe(404);
    expect((await c.get(`/api/fornecedores/${som.id}/avaliacoes`, eva.cookie)).statusCode).toBe(404);
    expect((await c.get(`/api/fornecedores/${som.id}/avaliacoes`, carla.cookie)).statusCode).toBe(404);
    expect((await avaliar('', projecto, som.id, { estrelas: 5 })).statusCode).toBe(401);
    expect((await c.get(`/api/fornecedores/${som.id}/avaliacoes`, ana.cookie)).json()[0]).toMatchObject({ estrelas: 2, comentario: 'Chegou tarde' });
  });

  it('a Eva não avalia um fornecedor da Ana no seu projecto, e a base de dados também o recusa', async () => {
    const { eva, som } = await cenario();
    const daEva = await novoProjecto(eva.cookie, 'Da Eva');
    await eventoOntem(daEva);
    expect((await avaliar(eva.cookie, daEva, som.id, { estrelas: 1 })).statusCode).toBe(400);
    await expect(
      base.pool.query('insert into supplier_ratings (supplier_id, project_id, stars) values ($1, $2, 1)', [som.id, daEva]),
    ).rejects.toThrow(/outro espaço/);
  });
});

describe('dados da conta', () => {
  it('a exportação inclui as avaliações; as feitas por um membro ficam anónimas quando ele elimina a conta', async () => {
    const { ana, bruno, projecto, som } = await cenario();
    await eventoOntem(projecto);
    await avaliar(bruno.cookie, projecto, som.id, { estrelas: 4, comentario: 'Bom' });
    const daAna = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, ana.cookie)).json();
    expect(daAna.avaliacoesFornecedores).toEqual([expect.objectContaining({ fornecedor: 'Som Kianda', estrelas: 4, feitaPorMim: false })]);
    const doBruno = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, bruno.cookie)).json();
    expect(doBruno.avaliacoesFornecedores).toEqual([expect.objectContaining({ fornecedor: 'Som Kianda', feitaPorMim: true })]);

    await c.post(`/api/equipa/membros/${bruno.id}/remover`, {}, ana.cookie);
    expect((await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, bruno.cookie)).statusCode).toBe(204);
    const { rows } = await base.pool.query('select stars, rated_by from supplier_ratings');
    expect(rows).toEqual([{ stars: 4, rated_by: null }]);
  });
});
