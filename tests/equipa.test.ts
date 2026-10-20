import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, ORIGEM, PALAVRA_PASSE } from './cliente.js';

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
  return { cookie, id: (await c.eu(cookie)).json().id as string, email };
}

const mudarPlano = (email: string, plano: string) =>
  base.pool.query(
    `update workspaces set plan_code = $2 where id in
       (select wm.workspace_id from workspace_members wm join users u on u.id = wm.user_id where u.email = $1 and wm.role = 'owner')`,
    [email, plano],
  );

const convidar = (cookie: string | undefined, email: string) => c.post('/api/equipa/convites', { email }, cookie);
const tokenDe = (ligacao: string) => decodeURIComponent(new URL(ligacao).searchParams.get('token')!);
const contar = async (sql: string, p: unknown[] = []) => (await base.pool.query<{ n: number }>(sql, p)).rows[0]!.n;

// Ana é dona de um espaço Empresarial.
async function anaEmpresarial() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await mudarPlano(ana.email, 'empresarial');
  return ana;
}

describe('convidar', () => {
  it('o plano Singular não tem equipa', async () => {
    const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
    const r = await convidar(ana.cookie, 'bruno@exemplo.ao');
    expect(r.statusCode).toBe(403);
    expect(r.json().mensagem).toMatch(/Singular não inclui equipa/);
    expect((await c.get('/api/equipa', ana.cookie)).json()).toMatchObject({ plano: 'singular', limite: 1, ocupados: 1 });
  });

  it('cria o convite, devolve a ligação uma vez e envia-a também por e-mail', async () => {
    const ana = await anaEmpresarial();
    const r = await convidar(ana.cookie, '  Bruno@Exemplo.AO ');
    expect(r.statusCode).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    const convite = r.json();
    expect(convite).toMatchObject({ email: 'bruno@exemplo.ao' });
    expect(convite.ligacao).toMatch(/^http:\/\/localhost:3000\/convite\?token=/);
    const email = c.emails.at(-1)!;
    expect(email.para).toBe('bruno@exemplo.ao');
    expect(email.texto).toContain(convite.ligacao);
    expect(email.texto).toContain('Ana Domingos convidou-o para a equipa «Espaço de Ana Domingos»');

    // A lista da equipa mostra o convite, mas nunca a ligação nem o token.
    const equipa = (await c.get('/api/equipa', ana.cookie));
    expect(equipa.json()).toMatchObject({ limite: 10, ocupados: 2, convites: [expect.objectContaining({ email: 'bruno@exemplo.ao' })] });
    expect(equipa.body).not.toContain(tokenDe(convite.ligacao));
    // Na base de dados só fica o hash.
    expect(await contar('select count(*)::int as n from invitations where token_hash = $1', [tokenDe(convite.ligacao)])).toBe(0);
  });

  it('o HTML do e-mail escapa o nome de quem convida e do espaço', async () => {
    const ana = await anaEmpresarial();
    await base.pool.query("update users set name = '<b>Ana</b>' where email = 'ana@exemplo.ao'");
    await convidar(ana.cookie, 'bruno@exemplo.ao');
    expect(c.emails.at(-1)!.html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(c.emails.at(-1)!.html).not.toContain('<b>Ana</b>');
  });

  it('não convida o próprio e-mail nem quem já é da equipa', async () => {
    const ana = await anaEmpresarial();
    expect((await convidar(ana.cookie, 'ana@exemplo.ao')).json().campos.email).toMatch(/a si próprio/);
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const r = await convidar(ana.cookie, bruno.email);
    await c.post('/api/convites/aceitar', { token: tokenDe(r.json().ligacao) }, bruno.cookie);
    const outra = await convidar(ana.cookie, bruno.email);
    expect(outra.statusCode).toBe(409);
    expect(outra.json().campos.email).toMatch(/já faz parte/);
  });

  it('convidar de novo o mesmo e-mail anula a ligação anterior', async () => {
    const ana = await anaEmpresarial();
    const primeiro = tokenDe((await convidar(ana.cookie, 'bruno@exemplo.ao')).json().ligacao);
    const segundo = tokenDe((await convidar(ana.cookie, 'bruno@exemplo.ao')).json().ligacao);
    expect((await c.post('/api/convites/ver', { token: primeiro })).statusCode).toBe(404);
    expect((await c.post('/api/convites/ver', { token: segundo })).statusCode).toBe(200);
    expect((await c.get('/api/equipa', ana.cookie)).json().ocupados).toBe(2);
  });

  it('Empresarial: 10 pessoas no total, contando com o dono e os convites por aceitar', async () => {
    const ana = await anaEmpresarial();
    for (let i = 1; i <= 9; i++) expect((await convidar(ana.cookie, `p${i}@exemplo.ao`)).statusCode).toBe(201);
    const decimo = await convidar(ana.cookie, 'p10@exemplo.ao');
    expect(decimo.statusCode).toBe(409);
    expect(decimo.json().mensagem).toMatch(/10 pessoas/);
    // Revogar um convite liberta o lugar.
    const { convites } = (await c.get('/api/equipa', ana.cookie)).json();
    expect((await c.post(`/api/equipa/convites/${convites[0].id}/revogar`, {}, ana.cookie)).statusCode).toBe(204);
    expect((await convidar(ana.cookie, 'p10@exemplo.ao')).statusCode).toBe(201);
  });

  it('Grandes: sem limite', async () => {
    const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
    await mudarPlano(ana.email, 'grandes');
    for (let i = 1; i <= 11; i++) expect((await convidar(ana.cookie, `p${i}@exemplo.ao`)).statusCode).toBe(201);
  });

  it('pedidos em simultâneo não passam o limite', async () => {
    const ana = await anaEmpresarial();
    const respostas = await Promise.all(Array.from({ length: 15 }, (_, i) => convidar(ana.cookie, `p${i}@exemplo.ao`)));
    expect(respostas.filter((r) => r.statusCode === 201)).toHaveLength(9);
    expect((await c.get('/api/equipa', ana.cookie)).json().ocupados).toBe(10);
  });

  it('exige sessão, e-mail confirmado, pedido do próprio Eveni e tem limite de pedidos', async () => {
    expect((await convidar(undefined, 'bruno@exemplo.ao')).statusCode).toBe(401);
    const semConfirmar = cookieDe(await c.registar('carla@exemplo.ao', 'Carla'));
    expect((await convidar(semConfirmar, 'bruno@exemplo.ao')).statusCode).toBe(403);
    const ana = await anaEmpresarial();
    const outroSite = await c.app.inject({
      method: 'POST',
      url: '/api/equipa/convites',
      payload: { email: 'bruno@exemplo.ao' },
      headers: { cookie: ana.cookie, origin: 'https://site-malicioso.example' },
    });
    expect(outroSite.statusCode).toBe(403);
    await base.pool.query("insert into rate_limits (key, count, window_start) select 'convidar:' || id, 20, now() from users where email = 'ana@exemplo.ao'");
    expect((await convidar(ana.cookie, 'bruno@exemplo.ao')).statusCode).toBe(429);
    expect(await contar('select count(*)::int as n from invitations')).toBe(0);
  });
});

describe('ver e aceitar o convite', () => {
  async function convite() {
    const ana = await anaEmpresarial();
    const r = await convidar(ana.cookie, 'bruno@exemplo.ao');
    return { ana, token: tokenDe(r.json().ligacao) };
  }

  it('qualquer pessoa com a ligação vê de quem é, com o e-mail parcialmente escondido', async () => {
    const { token } = await convite();
    const r = await c.post('/api/convites/ver', { token });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ espaco: 'Espaço de Ana Domingos', convidadoPor: 'Ana Domingos', email: 'b***@exemplo.ao' });
    expect(r.body).not.toContain('bruno@exemplo.ao');
    expect((await c.post('/api/convites/ver', { token: 'inventado' })).statusCode).toBe(404);
    expect((await c.post('/api/convites/ver', {})).statusCode).toBe(400);
  });

  it('aceitar exige sessão na conta do e-mail convidado, com o e-mail confirmado', async () => {
    const { token } = await convite();
    expect((await c.post('/api/convites/aceitar', { token })).statusCode).toBe(401);

    const carla = await contaConfirmada('carla@exemplo.ao', 'Carla Lima');
    const outra = await c.post('/api/convites/aceitar', { token }, carla.cookie);
    expect(outra.statusCode).toBe(403);
    expect(outra.json().mensagem).toBe('Este convite foi enviado para b***@exemplo.ao. Entre com essa conta para o aceitar.');

    const brunoSemConfirmar = cookieDe(await c.registar('bruno@exemplo.ao', 'Bruno Neto'));
    expect((await c.post('/api/convites/aceitar', { token }, brunoSemConfirmar)).statusCode).toBe(403);
    expect(await contar("select count(*)::int as n from workspace_members where role = 'member'")).toBe(0);
  });

  it('aceitar põe a pessoa na equipa, sem acesso a nenhum projecto, e a ligação deixa de funcionar', async () => {
    const { ana, token } = await convite();
    await c.post('/api/projectos', { template: 'T01', nome: 'Conferência', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana.cookie);
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const r = await c.post('/api/convites/aceitar', { token }, bruno.cookie);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ espaco: 'Espaço de Ana Domingos' });

    const equipa = (await c.get('/api/equipa', ana.cookie)).json();
    expect(equipa.membros.map((m: { nome: string; papel: string }) => [m.nome, m.papel])).toEqual([
      ['Ana Domingos', 'owner'],
      ['Bruno Neto', 'member'],
    ]);
    expect(equipa.convites).toEqual([]);
    expect(equipa.ocupados).toBe(2);
    // Sem acesso a projectos até o dono lho dar (decisão 017).
    expect((await c.get('/api/projectos', bruno.cookie)).json()).toEqual([]);
    // O espaço principal do Bruno continua a ser o dele.
    expect((await c.eu(bruno.cookie)).json().espaco.nome).toBe('Espaço de Bruno Neto');
    // Uso único.
    expect((await c.post('/api/convites/aceitar', { token }, bruno.cookie)).statusCode).toBe(404);
    expect((await c.post('/api/convites/ver', { token })).statusCode).toBe(404);
  });

  it('não aceita convites revogados nem expirados', async () => {
    const { ana, token } = await convite();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    await base.pool.query("update invitations set expires_at = now() - interval '1 minute'");
    expect((await c.post('/api/convites/aceitar', { token }, bruno.cookie)).statusCode).toBe(404);
    await base.pool.query("update invitations set expires_at = now() + interval '1 day'");
    const { convites } = (await c.get('/api/equipa', ana.cookie)).json();
    await c.post(`/api/equipa/convites/${convites[0].id}/revogar`, {}, ana.cookie);
    expect((await c.post('/api/convites/aceitar', { token }, bruno.cookie)).statusCode).toBe(404);
  });

  it('se o plano deixou de ter equipa, o convite já não entra', async () => {
    const { ana, token } = await convite();
    await mudarPlano(ana.email, 'singular');
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const r = await c.post('/api/convites/aceitar', { token }, bruno.cookie);
    expect(r.statusCode).toBe(409);
    expect(await contar("select count(*)::int as n from workspace_members where role = 'member'")).toBe(0);
  });

  it('aceitar duas vezes ao mesmo tempo só junta a pessoa uma vez', async () => {
    const { token } = await convite();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const respostas = await Promise.all(Array.from({ length: 5 }, () => c.post('/api/convites/aceitar', { token }, bruno.cookie)));
    expect(respostas.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(await contar("select count(*)::int as n from workspace_members where role = 'member'")).toBe(1);
  });

  it('limite de pedidos por IP para ver e aceitar', async () => {
    await base.pool.query("insert into rate_limits (key, count, window_start) values ('convites-ip:198.51.100.1', 30, now())");
    expect((await c.post('/api/convites/ver', { token: 'x' })).statusCode).toBe(429);
  });
});

describe('gerir a equipa: só o dono, só no seu espaço', () => {
  async function equipaComBruno() {
    const ana = await anaEmpresarial();
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const token = tokenDe((await convidar(ana.cookie, bruno.email)).json().ligacao);
    await c.post('/api/convites/aceitar', { token }, bruno.cookie);
    return { ana, bruno };
  }

  it('um membro só vê a equipa do seu próprio espaço, nunca os e-mails da equipa onde entrou', async () => {
    const { bruno } = await equipaComBruno();
    const r = await c.get('/api/equipa', bruno.cookie);
    expect(r.json()).toMatchObject({ espaco: 'Espaço de Bruno Neto', membros: [expect.objectContaining({ nome: 'Bruno Neto' })] });
    expect(r.body).not.toContain('ana@exemplo.ao');
  });

  it('um membro não consegue revogar convites nem retirar pessoas do espaço da Ana', async () => {
    const { ana, bruno } = await equipaComBruno();
    const convite = (await convidar(ana.cookie, 'carla@exemplo.ao')).json();
    expect((await c.post(`/api/equipa/convites/${convite.id}/revogar`, {}, bruno.cookie)).statusCode).toBe(404);
    expect((await c.post(`/api/equipa/membros/${ana.id}/remover`, {}, bruno.cookie)).statusCode).toBe(404);
    expect((await c.get('/api/equipa', ana.cookie)).json()).toMatchObject({ ocupados: 3 });
  });

  it('o dono não se retira a si próprio; IDs mal formados dão 404', async () => {
    const { ana } = await equipaComBruno();
    expect((await c.post(`/api/equipa/membros/${ana.id}/remover`, {}, ana.cookie)).statusCode).toBe(404);
    expect((await c.post('/api/equipa/membros/abc/remover', {}, ana.cookie)).statusCode).toBe(404);
    expect((await c.post("/api/equipa/convites/1'or'1/revogar", {}, ana.cookie)).statusCode).toBe(404);
  });

  it('retirar alguém da equipa tira-lhe os acessos aos projectos e as tarefas atribuídas, numa só operação', async () => {
    const { ana, bruno } = await equipaComBruno();
    const projecto = (
      await c.post('/api/projectos', { template: 'T01', nome: 'Conferência', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana.cookie)
    ).json().id;
    await base.pool.query("insert into project_members (project_id, user_id, role) values ($1, $2, 'editor')", [projecto, bruno.id]);
    const tarefa = (await c.get(`/api/projectos/${projecto}`, ana.cookie)).json().tarefasDoProjecto[0].id;
    expect((await c.post(`/api/projectos/${projecto}/tarefas/${tarefa}`, { responsavelId: bruno.id }, ana.cookie)).statusCode).toBe(200);

    expect((await c.post(`/api/equipa/membros/${bruno.id}/remover`, {}, ana.cookie)).statusCode).toBe(204);
    expect((await c.get(`/api/projectos/${projecto}`, bruno.cookie)).statusCode).toBe(404);
    expect(await contar('select count(*)::int as n from project_members')).toBe(0);
    expect((await base.pool.query('select assignee_id from tasks where id = $1', [tarefa])).rows[0].assignee_id).toBeNull();
    expect((await c.get('/api/equipa', ana.cookie)).json().membros).toHaveLength(1);
    const accoes = (await base.pool.query<{ action: string }>("select action from audit_log where action like 'equipa.%' order by id")).rows.map((r) => r.action);
    expect(accoes).toEqual(['equipa.convite_criado', 'equipa.convite_aceite', 'equipa.membro_removido']);
  });
});

describe('dados da conta', () => {
  it('a exportação inclui convites enviados e recebidos', async () => {
    const ana = await anaEmpresarial();
    await convidar(ana.cookie, 'bruno@exemplo.ao');
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const daAna = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, ana.cookie)).json();
    expect(daAna.convitesEnviados).toEqual([{ email: 'bruno@exemplo.ao', criadoEm: expect.any(String), estado: 'pendente' }]);
    const doBruno = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, bruno.cookie)).json();
    expect(doBruno.convitesRecebidos).toEqual([{ espaco: 'Espaço de Ana Domingos', criadoEm: expect.any(String), estado: 'pendente' }]);
  });

  it('uma conta por confirmar com o e-mail convidado não vê nem apaga os convites para esse e-mail', async () => {
    const ana = await anaEmpresarial();
    await convidar(ana.cookie, 'bruno@exemplo.ao');
    // Alguém regista-se com o e-mail do Bruno e não o confirma.
    const impostor = cookieDe(await c.registar('bruno@exemplo.ao', 'Impostor'));
    const dados = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, impostor)).json();
    expect(dados.convitesRecebidos).toEqual([]);
    expect(JSON.stringify(dados)).not.toContain('Espaço de Ana Domingos');
    // Eliminar essa conta (ou a limpeza automática das contas por confirmar) não apaga o convite.
    expect((await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, impostor)).statusCode).toBe(204);
    expect(await contar('select count(*)::int as n from invitations')).toBe(1);
  });

  it('eliminar a conta apaga os convites que criou e os que recebeu', async () => {
    const ana = await anaEmpresarial();
    await convidar(ana.cookie, 'bruno@exemplo.ao');
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    await mudarPlano(bruno.email, 'empresarial');
    await convidar(bruno.cookie, 'carla@exemplo.ao');
    expect(await contar('select count(*)::int as n from invitations')).toBe(2);
    const r = await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, bruno.cookie);
    expect(r.statusCode).toBe(204);
    expect(await contar('select count(*)::int as n from invitations')).toBe(0);
  });
});

// Usado acima: garante que o ORIGEM do cliente de teste é o do APP_URL (as ligações apontam para lá).
it('as ligações de convite apontam para o APP_URL', () => {
  expect(ORIGEM).toBe('http://localhost:3000');
});
