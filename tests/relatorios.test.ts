// Relatórios PDF (decisão 020): conteúdo (modelo) e a rota que gera o PDF, com quem pode.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { montarRelatorioCliente, montarRelatorioCronograma, montarRelatorioInterno } from '../src/server/relatorios/modelo.js';
import { nomeDoFicheiro } from '../src/server/relatorios/rotas.js';
import type { Convidado, Mesa } from '../src/shared/convidados.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import type { Fornecedor } from '../src/shared/fornecedores.js';
import type { ItemOrcamento, Projecto } from '../src/shared/projectos.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente } from './cliente.js';

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

async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto: string = (
    await c.post('/api/projectos', { template: 'T01', nome: 'Lançamento «Kianda» 2026', dataEvento: somarDias(hojeEmLuanda(), 30), local: 'Baía de Luanda' }, ana.cookie)
  ).json().id;
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
  const eva = await contaConfirmada('eva@exemplo.ao', 'Eva Pinto');
  return { ana, bruno: pessoas['bruno@exemplo.ao']!, carla: pessoas['carla@exemplo.ao']!, eva, projecto };
}

const pdf = (cookie: string, projecto: string) => c.get(`/api/projectos/${projecto}/relatorios/cliente.pdf`, cookie);
const paginas = (corpo: Buffer) => (corpo.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('conteúdo do relatório para o cliente', () => {
  it('resumo, marcos por prazo, orçamento por categoria com previsto e real, totais e aviso', async () => {
    const { ana, projecto: id } = await cenario();
    const sala = ((await c.get(`/api/projectos/${id}`, ana.cookie)).json().orcamento as ItemOrcamento[])[0]!;
    await c.post(`/api/projectos/${id}/orcamento/${sala.id}`, { categoria: 'Local', descricao: 'X', previsto: '1 000 000', real: '1 200 000' }, ana.cookie);
    await c.post(`/api/projectos/${id}/convidados`, { nome: 'Jornalista' }, ana.cookie);
    const projecto: Projecto = (await c.get(`/api/projectos/${id}`, ana.cookie)).json();

    const r = montarRelatorioCliente(projecto, { convidados: 1, vao: 0, naoVao: 0, semResposta: 1, pessoas: 0 }, new Date('2026-10-21T11:05:00Z'));
    expect(r.titulo).toBe('Lançamento «Kianda» 2026');
    expect(r.detalhes).toEqual([
      ['Data do evento', projecto.dataEvento.split('-').reverse().join('/')],
      ['Local', 'Baía de Luanda'],
      ['Tipo', 'Conferência de Imprensa'],
    ]);
    // Hora de Luanda (UTC+1).
    expect(r.geradoEm).toBe('Gerado a 21/10/2026 12:05 (hora de Luanda)');
    expect(r.progresso.texto).toBe('0 de 47 tarefas concluídas (0%)');
    expect(r.convidados).toBe('1 convidado · 0 confirmaram (0 pessoas) · 1 sem resposta');
    expect(r.marcos).toHaveLength(20);
    const prazos = r.marcos.map((m) => m.prazo.split('/').reverse().join('-'));
    expect(prazos).toEqual([...prazos].sort());
    expect(r.orcamento.categorias[0]).toMatchObject({ categoria: 'Local', previsto: '1 000 000,00 Kz', real: '1 200 000,00 Kz' });
    expect(r.orcamento.categorias[0]!.itens[0]).toMatchObject({ descricao: 'Aluguer de sala', acima: true });
    expect(r.orcamento.totais.map(([rotulo]) => rotulo)).toEqual(['Previsto (rubricas)', 'Contingência (10%)', 'Total previsto', 'Real até agora']);
    expect(r.orcamento.estado).toBe('excedido');
    expect(r.orcamento.aviso).toBe('O real passa o previsto e toda a contingência em 100 000,00 Kz.');
  });

  it('sem convidados, a linha não aparece; nada de fornecedores nem notas', async () => {
    const { ana, projecto: id } = await cenario();
    const projecto: Projecto = (await c.get(`/api/projectos/${id}`, ana.cookie)).json();
    const r = montarRelatorioCliente(projecto, { convidados: 0, vao: 0, naoVao: 0, semResposta: 0, pessoas: 0 }, new Date());
    expect(r.convidados).toBeNull();
    expect(JSON.stringify(r)).not.toContain('Se não há notícia');
  });

  it('nome do ficheiro sem acentos nem espaços', () => {
    expect(nomeDoFicheiro('Lançamento «Kianda» 2026', 'cliente', '2026-10-21')).toBe('eveni-cliente-lancamento-kianda-2026-2026-10-21.pdf');
    expect(nomeDoFicheiro('«»', 'cliente', '2026-10-21')).toBe('eveni-cliente-projecto-2026-10-21.pdf');
  });
});

describe('gerar o PDF', () => {
  it('o dono recebe um PDF A4 para descarregar, e fica no registo de actividade', async () => {
    const { ana, projecto } = await cenario();
    const r = await pdf(ana.cookie, projecto);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="eveni-cliente-lancamento-kianda-2026-\d{4}-\d{2}-\d{2}\.pdf"$/);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect(paginas(r.rawPayload)).toBeGreaterThanOrEqual(1);
    // A letra vai embutida (os acentos aparecem bem em qualquer leitor de PDF).
    expect(r.rawPayload.toString('latin1')).toContain('LiberationSans');
    const registo = (await c.get('/api/equipa/registo', ana.cookie)).json().entradas;
    expect(registo[0]).toMatchObject({ accao: 'projecto.relatorio', quem: 'Ana Domingos', projecto: 'Lançamento «Kianda» 2026', relatorio: 'cliente' });
  });

  it('um projecto grande ocupa várias páginas sem falhar', async () => {
    const { ana, projecto } = await cenario();
    await base.pool.query(
      "insert into budget_items (project_id, position, category, description, planned_cents) select $1, 100 + n, 'Outros', repeat('Rubrica longa com nome comprido ', 4) || n, n * 1000 from generate_series(1, 250) n",
      [projecto],
    );
    const r = await pdf(ana.cookie, projecto);
    expect(r.statusCode).toBe(200);
    expect(paginas(r.rawPayload)).toBeGreaterThan(5);
  });

  it('uma linha mais alta do que uma página não desaparece nem bloqueia', async () => {
    const { ana, projecto } = await cenario();
    // Mais comprido do que os formulários permitem (directamente na base de dados de teste).
    await base.pool.query("update tasks set title = repeat('Texto muito comprido ', 400) where project_id = $1 and critical", [projecto]);
    const r = await pdf(ana.cookie, projecto);
    expect(r.statusCode).toBe(200);
    expect(paginas(r.rawPayload)).toBeGreaterThan(10);
  });

  it('o editor gera; a leitora, alguém de fora e sem sessão não', async () => {
    const { bruno, carla, eva, projecto } = await cenario();
    expect((await pdf(bruno.cookie, projecto)).statusCode).toBe(200);
    const daCarla = await pdf(carla.cookie, projecto);
    expect(daCarla.statusCode).toBe(403);
    expect(daCarla.headers['content-type']).not.toBe('application/pdf');
    expect((await pdf(eva.cookie, projecto)).statusCode).toBe(404);
    expect((await pdf('', projecto)).statusCode).toBe(401);
    expect((await pdf(bruno.cookie, 'abc')).statusCode).toBe(404);
  });

  it('com o projecto arquivado também se gera', async () => {
    const { ana, projecto } = await cenario();
    await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
    expect((await pdf(ana.cookie, projecto)).statusCode).toBe(200);
  });

  it('limite de relatórios por hora', async () => {
    const { ana, projecto } = await cenario();
    await base.pool.query("insert into rate_limits (key, count, window_start) values ('relatorios:' || $1, 60, now())", [ana.id]);
    expect((await pdf(ana.cookie, projecto)).statusCode).toBe(429);
  });
});

const interno = (cookie: string, projecto: string) => c.get(`/api/projectos/${projecto}/relatorios/interno.pdf`, cookie);

describe('relatório interno', () => {
  it('leva tarefas com responsável e nota, fornecedores (só os do projecto) com contactos, e convidados com mesa', async () => {
    const { ana, bruno, projecto: id } = await cenario();
    let projecto: Projecto = (await c.get(`/api/projectos/${id}`, ana.cookie)).json();
    const tarefa = projecto.tarefasDoProjecto.find((t) => t.nota)!;
    await c.post(`/api/projectos/${id}/tarefas/${tarefa.id}`, { responsavelId: bruno.id }, ana.cookie);
    const som: Fornecedor = (await c.post('/api/fornecedores', { nome: 'Som Kianda', categoria: 'Equipamentos', telemovel: '923456789' }, ana.cookie)).json();
    await c.post('/api/fornecedores', { nome: 'Outro, sem ligação', categoria: 'Local' }, ana.cookie);
    const item = projecto.orcamento[1]!;
    await c.post(`/api/projectos/${id}/orcamento/${item.id}`, { categoria: item.categoria, descricao: item.descricao, fornecedorId: som.id }, ana.cookie);
    const mesa: Mesa = (await c.post(`/api/projectos/${id}/mesas`, { nome: 'Mesa 1', lugares: 8 }, ana.cookie)).json();
    const g: Convidado = (await c.post(`/api/projectos/${id}/convidados`, { nome: 'TPA', telemovel: '924000111', acompanhantes: 1 }, ana.cookie)).json();
    await c.post(`/api/projectos/${id}/convidados/${g.id}/mesa`, { mesaId: mesa.id }, ana.cookie);

    projecto = (await c.get(`/api/projectos/${id}`, ana.cookie)).json();
    const lista = (await c.get(`/api/projectos/${id}/convidados`, ana.cookie)).json();
    const fornecedores: Fornecedor[] = (await c.get('/api/fornecedores', ana.cookie)).json();
    const r = montarRelatorioInterno(projecto, lista.convidados, lista.mesas, fornecedores, new Date());

    expect(r.subtitulo).toBe('Relatório interno (não enviar ao cliente)');
    expect(r.equipa).toEqual([
      ['Ana Domingos', 'Dono'],
      ['Bruno Neto', 'Editor'],
      ['Carla Lima', 'Leitor'],
    ]);
    expect(r.fases.map((f) => f.fase)).toEqual(['Pré Produção', 'Produção', 'Pós Produção']);
    const comNota = r.fases.flatMap((f) => f.tarefas).find((t) => t.titulo === tarefa.titulo)!;
    expect(comNota).toMatchObject({ responsavel: 'Bruno Neto', nota: tarefa.nota });
    expect(r.fases.flatMap((f) => f.tarefas)).toHaveLength(47);
    expect(r.orcamento.categorias.flatMap((c) => c.itens).find((i) => i.descricao === item.descricao)!.fornecedor).toBe('Som Kianda');
    expect(r.fornecedores).toEqual([{ nome: 'Som Kianda', categoria: 'Equipamentos', contactos: '+244 923 456 789', avaliacao: 'Sem avaliações', notas: null }]);
    expect(r.listaConvidados).toEqual([{ nome: 'TPA', telemovel: '+244 924 000 111', resposta: 'Sem resposta', acompanhantes: '1', mesa: 'Mesa 1' }]);
  });

  it('dono e editor geram; leitora, de fora e sem sessão não; regista o tipo', async () => {
    const { ana, bruno, carla, eva, projecto } = await cenario();
    const r = await interno(bruno.cookie, projecto);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/filename="eveni-interno-lancamento-kianda-2026-/);
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await interno(carla.cookie, projecto)).statusCode).toBe(403);
    expect((await interno(eva.cookie, projecto)).statusCode).toBe(404);
    expect((await interno('', projecto)).statusCode).toBe(401);
    expect((await c.get(`/api/projectos/${projecto}/relatorios/outro.pdf`, ana.cookie)).statusCode).toBe(404);
    const registo = (await c.get('/api/equipa/registo', ana.cookie)).json().entradas;
    expect(registo[0]).toMatchObject({ accao: 'projecto.relatorio', quem: 'Bruno Neto', relatorio: 'interno' });
  });

  it('o relatório para o cliente continua sem fornecedores nem notas', async () => {
    const { ana, projecto: id } = await cenario();
    const projecto: Projecto = (await c.get(`/api/projectos/${id}`, ana.cookie)).json();
    const r = montarRelatorioCliente(projecto, { convidados: 0, vao: 0, naoVao: 0, semResposta: 0, pessoas: 0 }, new Date());
    expect(Object.keys(r)).not.toContain('fornecedores');
    expect(Object.keys(r)).not.toContain('listaConvidados');
  });
});

const cronograma = (cookie: string, projecto: string) => c.get(`/api/projectos/${projecto}/relatorios/cronograma.pdf`, cookie);
const paraIso = (d: string) => d.split('/').reverse().join('-');

describe('cronograma', () => {
  it('semanas de segunda a domingo, tarefas por data de início, D-n até D+n, semana do evento marcada, sem notas', async () => {
    const { ana, projecto: id } = await cenario();
    const projecto: Projecto = (await c.get(`/api/projectos/${id}`, ana.cookie)).json();
    const r = montarRelatorioCronograma(projecto, new Date());
    expect(r.subtitulo).toBe('Cronograma');
    const tarefas = r.semanas.flatMap((s) => s.tarefas);
    expect(tarefas).toHaveLength(47);
    // Por data de início.
    const inicios = tarefas.map((t) => paraIso(t.datas.slice(0, 10)));
    expect(inicios).toEqual([...inicios].sort());
    for (const s of r.semanas) {
      const [de, ate] = s.titulo.match(/\d{2}\/\d{2}\/\d{4}/g)!.map(paraIso);
      // Segunda a domingo (1970-01-05 foi segunda-feira).
      expect(new Date(`${de}T12:00:00Z`).getUTCDay()).toBe(1);
      expect(new Date(`${ate}T12:00:00Z`).getUTCDay()).toBe(0);
      for (const t of s.tarefas) {
        const inicio = paraIso(t.datas.slice(0, 10));
        expect(inicio >= de! && inicio <= ate!).toBe(true);
      }
    }
    expect(r.semanas.filter((s) => s.doEvento)).toHaveLength(1);
    const doEvento = r.semanas.find((s) => s.doEvento)!;
    expect(doEvento.tarefas.some((t) => t.relativo === 'D0')).toBe(true);
    expect(tarefas.find((t) => paraIso(t.datas.slice(0, 10)) < projecto.dataEvento)!.relativo).toMatch(/^D-\d+$/);
    expect(tarefas.at(-1)!.relativo).toMatch(/^D\+\d+$/);
    expect(JSON.stringify(r)).not.toContain('Nota');
    expect(JSON.stringify(r)).not.toContain('Kz');
  });

  it('dono e editor geram; leitora, de fora e sem sessão não; regista o tipo', async () => {
    const { ana, bruno, carla, eva, projecto } = await cenario();
    const r = await cronograma(ana.cookie, projecto);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/filename="eveni-cronograma-lancamento-kianda-2026-/);
    expect(r.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await cronograma(bruno.cookie, projecto)).statusCode).toBe(200);
    expect((await cronograma(carla.cookie, projecto)).statusCode).toBe(403);
    expect((await cronograma(eva.cookie, projecto)).statusCode).toBe(404);
    expect((await cronograma('', projecto)).statusCode).toBe(401);
    const registo = (await c.get('/api/equipa/registo', ana.cookie)).json().entradas;
    expect(registo[0]).toMatchObject({ accao: 'projecto.relatorio', relatorio: 'cronograma' });
  });
});
