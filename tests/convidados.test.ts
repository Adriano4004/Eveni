// Lista de convidados de um projecto: acrescentar, importar, alterar, remover e quem pode (decisão 018).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import type { Convidado } from '../src/shared/convidados.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
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

const novoProjecto = async (cookie: string, nome = 'Conferência') =>
  (await c.post('/api/projectos', { template: 'T01', nome, dataEvento: somarDias(hojeEmLuanda(), 30) }, cookie)).json().id as string;

// A Ana (Empresarial) tem um projecto. O Bruno é editor, a Carla leitora, o Duarte é da equipa sem acesso;
// a Eva é de fora e tem o seu próprio projecto.
async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto = await novoProjecto(ana.cookie);
  const equipa: Record<string, Awaited<ReturnType<typeof contaConfirmada>>> = {};
  for (const [email, nome] of [
    ['bruno@exemplo.ao', 'Bruno Neto'],
    ['carla@exemplo.ao', 'Carla Lima'],
    ['duarte@exemplo.ao', 'Duarte Faria'],
  ] as const) {
    const pessoa = await contaConfirmada(email, nome);
    const ligacao: string = (await c.post('/api/equipa/convites', { email }, ana.cookie)).json().ligacao;
    await c.post('/api/convites/aceitar', { token: decodeURIComponent(new URL(ligacao).searchParams.get('token')!) }, pessoa.cookie);
    equipa[email] = pessoa;
  }
  const bruno = equipa['bruno@exemplo.ao']!;
  const carla = equipa['carla@exemplo.ao']!;
  const duarte = equipa['duarte@exemplo.ao']!;
  await c.post(`/api/projectos/${projecto}/acessos`, { utilizadorId: bruno.id, papel: 'editor' }, ana.cookie);
  await c.post(`/api/projectos/${projecto}/acessos`, { utilizadorId: carla.id, papel: 'viewer' }, ana.cookie);
  const eva = await contaConfirmada('eva@exemplo.ao', 'Eva Pinto');
  const daEva = await novoProjecto(eva.cookie, 'Gala da Eva');
  return { ana, bruno, carla, duarte, eva, projecto, daEva };
}

const acrescentar = (cookie: string, projecto: string, dados: object) => c.post(`/api/projectos/${projecto}/convidados`, dados, cookie);
const lista = (cookie: string, projecto: string) => c.get(`/api/projectos/${projecto}/convidados`, cookie);
const alterar = (cookie: string, projecto: string, convidado: string, dados: object) =>
  c.post(`/api/projectos/${projecto}/convidados/${convidado}`, dados, cookie);
const remover = (cookie: string, projecto: string, convidado: string) => c.post(`/api/projectos/${projecto}/convidados/${convidado}/remover`, {}, cookie);
const importar = (cookie: string, projecto: string, linhas: object[]) => c.post(`/api/projectos/${projecto}/convidados/importar`, { linhas }, cookie);
const linha = (n: number, nome: string, telemovel = '', email = '', acompanhantes = '') => ({ linha: n, nome, telemovel, email, acompanhantes });

describe('acrescentar e ver convidados', () => {
  it('acrescenta com o telemóvel normalizado; a lista vem por nome, com totais', async () => {
    const { ana, projecto } = await cenario();
    const r = await acrescentar(ana.cookie, projecto, { nome: 'Ana Silva', telemovel: '923 456 789', email: 'Ana@Exemplo.AO', acompanhantes: 2 });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({
      nome: 'Ana Silva',
      telemovel: '+244923456789',
      email: 'ana@exemplo.ao',
      acompanhantes: 2,
      resposta: 'pending',
      acompanhantesConfirmados: 0,
      respondidoEm: null,
    });
    await acrescentar(ana.cookie, projecto, { nome: 'adriano Costa' });
    const l = (await lista(ana.cookie, projecto)).json();
    expect(l.projecto).toEqual({ id: projecto, nome: 'Conferência', dataEvento: somarDias(hojeEmLuanda(), 30) });
    expect(l.podeAlterar).toBe(true);
    expect(l.convidados.map((g: Convidado) => g.nome)).toEqual(['adriano Costa', 'Ana Silva']);
    expect(l.totais).toEqual({ convidados: 2, vao: 0, naoVao: 0, semResposta: 2, pessoas: 0 });
  });

  it('dados inválidos dão 400 com o erro junto ao campo', async () => {
    const { ana, projecto } = await cenario();
    const r = await acrescentar(ana.cookie, projecto, { nome: 'Ana', telemovel: '12' });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toHaveProperty('telemovel');
    expect((await acrescentar(ana.cookie, projecto, { nome: '' })).json().campos).toHaveProperty('nome');
  });

  it('não deixa repetir telemóvel nem e-mail no mesmo projecto, seja como for escrito', async () => {
    const { ana, eva, projecto, daEva } = await cenario();
    await acrescentar(ana.cookie, projecto, { nome: 'Ana Silva', telemovel: '923456789', email: 'ana.silva@exemplo.ao' });
    const tel = await acrescentar(ana.cookie, projecto, { nome: 'Outra', telemovel: '+244 923 456 789' });
    expect(tel.statusCode).toBe(409);
    expect(tel.json().campos).toHaveProperty('telemovel');
    const mail = await acrescentar(ana.cookie, projecto, { nome: 'Outra', email: 'ANA.SILVA@exemplo.ao' });
    expect(mail.statusCode).toBe(409);
    expect(mail.json().campos).toHaveProperty('email');
    // Sem contactos não há repetidos a detectar.
    expect((await acrescentar(ana.cookie, projecto, { nome: 'Tia Maria' })).statusCode).toBe(201);
    expect((await acrescentar(ana.cookie, projecto, { nome: 'Tia Maria' })).statusCode).toBe(201);
    // Noutro projecto, o mesmo convidado pode existir.
    expect((await acrescentar(eva.cookie, daEva, { nome: 'Ana Silva', telemovel: '923456789' })).statusCode).toBe(201);
  });

  it('a base de dados também recusa repetidos e formatos inválidos', async () => {
    const { projecto } = await cenario();
    await base.pool.query("insert into guests (project_id, name, phone) values ($1, 'A', '+244923456789')", [projecto]);
    await expect(base.pool.query("insert into guests (project_id, name, phone) values ($1, 'B', '+244923456789')", [projecto])).rejects.toThrow(
      /guests_telemovel_unico/,
    );
    await expect(base.pool.query("insert into guests (project_id, name, phone) values ($1, 'B', '923456789')", [projecto])).rejects.toThrow(
      /guests_telemovel_formato/,
    );
    await expect(base.pool.query("insert into guests (project_id, name, email) values ($1, 'B', 'A@x.ao')", [projecto])).rejects.toThrow(
      /guests_email_minusculas/,
    );
    await expect(
      base.pool.query("insert into guests (project_id, name, plus_ones_allowed, response, plus_ones_confirmed) values ($1, 'B', 1, 'no', 1)", [projecto]),
    ).rejects.toThrow(/guests_confirmados_validos/);
  });

  it('o limite de 2000 convidados por projecto', async () => {
    const { ana, projecto } = await cenario();
    await base.pool.query("insert into guests (project_id, name) select $1, 'Convidado ' || n from generate_series(1, 1999) n", [projecto]);
    expect((await acrescentar(ana.cookie, projecto, { nome: 'O último' })).statusCode).toBe(201);
    expect((await acrescentar(ana.cookie, projecto, { nome: 'Um a mais' })).statusCode).toBe(409);
    expect((await importar(ana.cookie, projecto, [linha(1, 'Um a mais')])).statusCode).toBe(409);
  });
});

describe('importar uma lista colada', () => {
  it('importa as linhas, ignora e lista as repetidas (na lista ou na própria colagem)', async () => {
    const { ana, projecto } = await cenario();
    await acrescentar(ana.cookie, projecto, { nome: 'Já estava', telemovel: '923000000' });
    const r = await importar(ana.cookie, projecto, [
      linha(2, 'Ana Silva', '923 456 789', 'ana@exemplo.ao', '1'),
      linha(3, 'Repetida na lista', '+244923000000'),
      linha(4, 'Repetida na colagem', '', 'ANA@exemplo.ao'),
      linha(5, 'Tia Maria e família', '', '', '4'),
    ]);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      importados: 2,
      repetidos: [
        { linha: 3, nome: 'Repetida na lista' },
        { linha: 4, nome: 'Repetida na colagem' },
      ],
    });
    const nomes = (await lista(ana.cookie, projecto)).json().convidados.map((g: Convidado) => [g.nome, g.telemovel, g.acompanhantes]);
    expect(nomes).toEqual([
      ['Ana Silva', '+244923456789', 1],
      ['Já estava', '+244923000000', 0],
      ['Tia Maria e família', null, 4],
    ]);
  });

  it('uma linha com problemas: não importa nenhuma e diz quais estão mal', async () => {
    const { ana, projecto } = await cenario();
    const r = await importar(ana.cookie, projecto, [linha(1, 'Ana'), linha(2, 'Bruno', '12'), linha(3, '', '923456789'), linha(4, 'Carla', '', '', '20')]);
    expect(r.statusCode).toBe(400);
    expect(r.json().linhas.map((l: { linha: number }) => l.linha)).toEqual([2, 3, 4]);
    expect((await lista(ana.cookie, projecto)).json().convidados).toEqual([]);
  });

  it('recusa colagens vazias ou com mais de 500 linhas', async () => {
    const { ana, projecto } = await cenario();
    expect((await importar(ana.cookie, projecto, [])).statusCode).toBe(400);
    const muitas = Array.from({ length: 501 }, (_, i) => linha(i + 1, `Convidado ${i}`));
    expect((await importar(ana.cookie, projecto, muitas)).statusCode).toBe(400);
    expect((await importar(ana.cookie, projecto, muitas.slice(0, 500))).json().importados).toBe(500);
  });
});

describe('alterar e remover', () => {
  it('altera os dados e marca a resposta à mão; a hora da resposta só muda quando a resposta muda', async () => {
    const { ana, projecto } = await cenario();
    const g: Convidado = (await acrescentar(ana.cookie, projecto, { nome: 'Ana', acompanhantes: 2 })).json();
    const vai = (await alterar(ana.cookie, projecto, g.id, { nome: 'Ana Silva', telemovel: '923456789', acompanhantes: 2, resposta: 'yes', acompanhantesConfirmados: 1 })).json();
    expect(vai).toMatchObject({ nome: 'Ana Silva', telemovel: '+244923456789', resposta: 'yes', acompanhantesConfirmados: 1 });
    expect(vai.respondidoEm).not.toBeNull();
    const igual = (await alterar(ana.cookie, projecto, g.id, { nome: 'Ana Silva', acompanhantes: 2, resposta: 'yes' })).json();
    expect(igual.respondidoEm).toBe(vai.respondidoEm);
    expect(igual.acompanhantesConfirmados).toBe(1);
    expect((await lista(ana.cookie, projecto)).json().totais).toEqual({ convidados: 1, vao: 1, naoVao: 0, semResposta: 0, pessoas: 2 });

    // Pedir mais confirmados do que os permitidos fica nos permitidos (o ecrã envia sempre os dois campos).
    const acertado = await alterar(ana.cookie, projecto, g.id, { nome: 'Ana Silva', acompanhantes: 2, resposta: 'yes', acompanhantesConfirmados: 5 });
    expect(acertado.json().acompanhantesConfirmados).toBe(2);
    // Reduzir os permitidos reduz também os confirmados; "não vai" e "sem resposta" ficam sem acompanhantes.
    const reduzido = await alterar(ana.cookie, projecto, g.id, { nome: 'Ana Silva', acompanhantes: 1, resposta: 'yes', acompanhantesConfirmados: 2 });
    expect(reduzido.statusCode).toBe(200);
    expect(reduzido.json().acompanhantesConfirmados).toBe(1);
    expect((await alterar(ana.cookie, projecto, g.id, { nome: 'Ana Silva', acompanhantes: 0 })).json().acompanhantesConfirmados).toBe(0);
    const naoVai = (await alterar(ana.cookie, projecto, g.id, { nome: 'Ana Silva', acompanhantes: 2, resposta: 'no', acompanhantesConfirmados: 0 })).json();
    expect(naoVai).toMatchObject({ resposta: 'no', acompanhantesConfirmados: 0 });
    expect((await alterar(ana.cookie, projecto, g.id, { nome: 'Ana Silva', resposta: 'pending' })).json().respondidoEm).toBeNull();
  });

  it('alterar para um telemóvel de outro convidado dá 409; manter o próprio não', async () => {
    const { ana, projecto } = await cenario();
    await acrescentar(ana.cookie, projecto, { nome: 'Ana', telemovel: '923456789' });
    const bruno: Convidado = (await acrescentar(ana.cookie, projecto, { nome: 'Bruno', telemovel: '924000111' })).json();
    expect((await alterar(ana.cookie, projecto, bruno.id, { nome: 'Bruno', telemovel: '923456789' })).statusCode).toBe(409);
    expect((await alterar(ana.cookie, projecto, bruno.id, { nome: 'Bruno Neto', telemovel: '924 000 111' })).statusCode).toBe(200);
  });

  it('remover', async () => {
    const { ana, projecto } = await cenario();
    const g: Convidado = (await acrescentar(ana.cookie, projecto, { nome: 'Ana' })).json();
    expect((await remover(ana.cookie, projecto, g.id)).statusCode).toBe(204);
    expect((await remover(ana.cookie, projecto, g.id)).statusCode).toBe(404);
    expect((await lista(ana.cookie, projecto)).json().convidados).toEqual([]);
  });
});

describe('quem pode', () => {
  it('o editor vê e altera; a leitora só vê', async () => {
    const { bruno, carla, projecto } = await cenario();
    const g: Convidado = (await acrescentar(bruno.cookie, projecto, { nome: 'Do Bruno' })).json();
    expect(g.nome).toBe('Do Bruno');
    expect((await alterar(bruno.cookie, projecto, g.id, { nome: 'Do Bruno', resposta: 'yes' })).statusCode).toBe(200);

    const daCarla = (await lista(carla.cookie, projecto)).json();
    expect(daCarla.podeAlterar).toBe(false);
    expect(daCarla.convidados.map((x: Convidado) => x.nome)).toEqual(['Do Bruno']);
    expect((await acrescentar(carla.cookie, projecto, { nome: 'Da Carla' })).statusCode).toBe(403);
    expect((await importar(carla.cookie, projecto, [linha(1, 'Da Carla')])).statusCode).toBe(403);
    expect((await alterar(carla.cookie, projecto, g.id, { nome: 'Mudado', resposta: 'no' })).statusCode).toBe(403);
    expect((await remover(carla.cookie, projecto, g.id)).statusCode).toBe(403);
    expect((await lista(carla.cookie, projecto)).json().convidados[0]).toMatchObject({ nome: 'Do Bruno', resposta: 'yes' });
  });

  it('membro da equipa sem acesso, alguém de fora e quem não tem sessão: como se o projecto não existisse', async () => {
    const { ana, duarte, eva, projecto } = await cenario();
    const g: Convidado = (await acrescentar(ana.cookie, projecto, { nome: 'Convidado da Ana', telemovel: '923456789' })).json();
    for (const intruso of [duarte, eva]) {
      const ver = await lista(intruso.cookie, projecto);
      expect(ver.statusCode).toBe(404);
      expect(ver.body).not.toContain('Convidado da Ana');
      expect((await acrescentar(intruso.cookie, projecto, { nome: 'Intruso' })).statusCode).toBe(404);
      expect((await importar(intruso.cookie, projecto, [linha(1, 'Intruso')])).statusCode).toBe(404);
      expect((await alterar(intruso.cookie, projecto, g.id, { nome: 'Mudado' })).statusCode).toBe(404);
      expect((await remover(intruso.cookie, projecto, g.id)).statusCode).toBe(404);
    }
    expect((await lista('', projecto)).statusCode).toBe(401);
    expect((await acrescentar('', projecto, { nome: 'Anónimo' })).statusCode).toBe(401);
    const depois = (await lista(ana.cookie, projecto)).json().convidados;
    expect(depois).toEqual([expect.objectContaining({ nome: 'Convidado da Ana', telemovel: '+244923456789' })]);
  });

  it('um convidado de outro projecto não se altera nem remove pelo endereço do meu projecto', async () => {
    const { eva, ana, projecto, daEva } = await cenario();
    const daAna: Convidado = (await acrescentar(ana.cookie, projecto, { nome: 'Da Ana' })).json();
    // A Eva usa o seu próprio projecto (a que tem acesso) com o ID de um convidado da Ana.
    expect((await alterar(eva.cookie, daEva, daAna.id, { nome: 'Roubado' })).statusCode).toBe(404);
    expect((await remover(eva.cookie, daEva, daAna.id)).statusCode).toBe(404);
    expect((await lista(ana.cookie, projecto)).json().convidados[0].nome).toBe('Da Ana');
  });

  it('IDs inválidos dão 404', async () => {
    const { ana, projecto } = await cenario();
    expect((await lista(ana.cookie, 'abc')).statusCode).toBe(404);
    expect((await alterar(ana.cookie, projecto, "1' or '1'='1", { nome: 'X' })).statusCode).toBe(404);
    expect((await remover(ana.cookie, 'abc', 'abc')).statusCode).toBe(404);
  });

  it('projecto arquivado: a lista vê-se, mas não se altera', async () => {
    const { ana, bruno, projecto } = await cenario();
    const g: Convidado = (await acrescentar(ana.cookie, projecto, { nome: 'Ana' })).json();
    await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
    expect((await lista(ana.cookie, projecto)).json()).toMatchObject({ podeAlterar: false, convidados: [expect.objectContaining({ nome: 'Ana' })] });
    for (const quem of [ana, bruno]) {
      expect((await acrescentar(quem.cookie, projecto, { nome: 'Novo' })).statusCode).toBe(409);
      expect((await importar(quem.cookie, projecto, [linha(1, 'Novo')])).statusCode).toBe(409);
      expect((await alterar(quem.cookie, projecto, g.id, { nome: 'Mudado' })).statusCode).toBe(409);
      expect((await remover(quem.cookie, projecto, g.id)).statusCode).toBe(409);
    }
  });

  it('quem sai da equipa perde logo o acesso aos convidados', async () => {
    const { ana, bruno, projecto } = await cenario();
    await c.post(`/api/equipa/membros/${bruno.id}/remover`, {}, ana.cookie);
    expect((await lista(bruno.cookie, projecto)).statusCode).toBe(404);
    expect((await acrescentar(bruno.cookie, projecto, { nome: 'Depois de sair' })).statusCode).toBe(404);
  });
});

describe('dados da conta', () => {
  it('a exportação do dono inclui os convidados de cada projecto; a do editor não', async () => {
    const { ana, bruno, projecto } = await cenario();
    await acrescentar(ana.cookie, projecto, { nome: 'Ana Silva', telemovel: '923456789', email: 'ana.silva@exemplo.ao' });
    const daAna = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, ana.cookie)).json();
    expect(daAna.projectos[0].convidados).toEqual([
      expect.objectContaining({ nome: 'Ana Silva', telemovel: '+244923456789', email: 'ana.silva@exemplo.ao' }),
    ]);
    const doBruno = await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, bruno.cookie);
    expect(doBruno.json().projectos).toEqual([]);
    expect(doBruno.body).not.toContain('Ana Silva');
  });

  it('eliminar a conta do dono apaga os convidados dos seus projectos', async () => {
    const { eva, daEva } = await cenario();
    await acrescentar(eva.cookie, daEva, { nome: 'Convidado da Eva' });
    expect((await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, eva.cookie)).statusCode).toBe(204);
    expect((await base.pool.query("select count(*)::int as n from guests where name = 'Convidado da Eva'")).rows[0].n).toBe(0);
  });
});
