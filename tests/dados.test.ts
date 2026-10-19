import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TABELAS_PESSOAIS } from '../src/server/contas/dados.js';
import { limparExpirados } from '../src/server/contas/sessoes.js';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { codigoHotp, deBase32, passoActual } from '../src/server/seguranca/totp.js';
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

async function tabelasPublicas(): Promise<string[]> {
  const { rows } = await base.pool.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
  );
  return rows.map((r) => r.table_name);
}

// Procura um texto em todas as linhas de todas as tabelas (a linha inteira convertida em texto).
async function ondeAparece(texto: string): Promise<string[]> {
  const encontrado: string[] = [];
  for (const tabela of await tabelasPublicas()) {
    const { rows } = await base.pool.query(`select count(*)::int as n from "${tabela}" t where t::text ilike '%' || $1 || '%'`, [texto]);
    if (rows[0].n > 0) encontrado.push(tabela);
  }
  return encontrado;
}

describe('salvaguarda: nenhuma tabela fica de fora da exportação e da eliminação', () => {
  it('todas as tabelas da base de dados estão classificadas em TABELAS_PESSOAIS', async () => {
    // Se este teste falhar: acrescente a tabela nova a TABELAS_PESSOAIS (src/server/contas/dados.ts) e
    // trate-a na exportação e na eliminação. Foi esta a falha da versão anterior do Eveni.
    expect(await tabelasPublicas()).toEqual(Object.keys(TABELAS_PESSOAIS).sort());
  });
});

describe('exportar os meus dados', () => {
  const exportar = (palavraPasse: string, cookie?: string) => c.post('/api/conta/exportar', { palavraPasse }, cookie);

  it('exige sessão e a palavra-passe', async () => {
    const cookie = cookieDe(await c.registar());
    expect((await exportar(PALAVRA_PASSE)).statusCode).toBe(401);
    const errada = await exportar('palpite-123456', cookie);
    expect(errada.statusCode).toBe(400);
    expect(errada.json().campos.palavraPasse).toBeDefined();
  });

  it('descarrega um ficheiro com a conta, o espaço, as sessões e o histórico de acessos', async () => {
    const cookie = cookieDe(await c.registar());
    const r = await exportar(PALAVRA_PASSE, cookie);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="eveni-os-meus-dados-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(r.headers['cache-control']).toBe('no-store');
    const dados = r.json();
    expect(dados.conta).toMatchObject({ nome: 'Ana Domingos', email: 'ana@exemplo.ao', emailConfirmadoEm: null });
    expect(dados.espacosDeTrabalho).toEqual([expect.objectContaining({ nome: 'Espaço de Ana Domingos', plano: 'singular', papel: 'owner' })]);
    expect(dados.sessoes).toHaveLength(1);
    expect(dados.historicoDeAcessos.map((a: { accao: string }) => a.accao)).toContain('conta.registo');
  });

  it('não inclui segredos (hashes, tokens, segredo do 2FA)', async () => {
    const cookie = cookieDe(await c.registar());
    const { segredo } = (await c.post('/api/conta/2fa/iniciar', {}, cookie)).json() ?? {};
    const { rows } = await base.pool.query('select password_hash from users');
    const corpo = (await exportar(PALAVRA_PASSE, cookie)).body;
    expect(corpo).not.toContain(rows[0].password_hash);
    expect(corpo).not.toMatch(/argon2|token|hash|secret/i);
    if (segredo) expect(corpo).not.toContain(segredo);
  });

  it('inclui os registos da auditoria que guardam o e-mail (os mesmos que a eliminação apaga)', async () => {
    const cookie = cookieDe(await c.registar());
    for (let i = 0; i < 11; i++) await c.post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: 'errada-123456' }, undefined, '203.0.113.9');
    const historico = (await exportar(PALAVRA_PASSE, cookie)).json().historicoDeAcessos;
    expect(historico).toContainEqual(expect.objectContaining({ accao: 'sessao.bloqueada', detalhes: { email: 'ana@exemplo.ao' } }));
  });

  it('fica na auditoria', async () => {
    await exportar(PALAVRA_PASSE, cookieDe(await c.registar()));
    const { rows } = await base.pool.query("select count(*)::int as n from audit_log where action = 'conta.exportada'");
    expect(rows[0].n).toBe(1);
  });
});

describe('eliminar a conta', () => {
  const eliminar = (corpo: object, cookie?: string) => c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR', ...corpo }, cookie);

  it('apaga tudo: nenhuma tabela guarda o e-mail ou o identificador da pessoa', async () => {
    const cookie = cookieDe(await c.registar());
    const id = (await c.eu(cookie)).json().id;
    // Deixar rasto em todo o lado: falhas de entrada (auditoria e contadores com o e-mail), outra sessão,
    // ligação de confirmação, pedido de recuperação.
    await c.post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: 'errada-123456' });
    for (let i = 0; i < 11; i++) await c.post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: 'errada-123456' }, undefined, '203.0.113.9');
    await c.post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: PALAVRA_PASSE });
    await c.post('/api/auth/reenviar-confirmacao', {}, cookie);
    expect(await ondeAparece('ana@exemplo.ao')).not.toEqual([]);

    const r = await eliminar({}, cookie);
    expect(r.statusCode).toBe(204);
    expect(await ondeAparece('ana@exemplo.ao')).toEqual([]);
    expect(await ondeAparece(id)).toEqual([]);
    expect(await ondeAparece('Ana Domingos')).toEqual([]);
    const { rows } = await base.pool.query("select user_id, ip, details from audit_log where action = 'conta.eliminada'");
    expect(rows).toEqual([{ user_id: null, ip: null, details: {} }]);
  });

  it('termina a sessão, a conta deixa de entrar, e segue um e-mail de confirmação', async () => {
    const cookie = cookieDe(await c.registar());
    const r = await eliminar({}, cookie);
    expect(r.cookies.find((k) => k.name === 'eveni_sessao')?.value).toBe('');
    expect((await c.eu(cookie)).statusCode).toBe(401);
    expect((await c.post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: PALAVRA_PASSE })).statusCode).toBe(401);
    expect(c.emails.at(-1)!.assunto).toBe('A sua conta do Eveni foi eliminada');
    // O e-mail fica livre para uma conta nova.
    expect((await c.registar()).statusCode).toBe(201);
  });

  it('não apaga os contadores de bloqueio de outra conta com um e-mail parecido', async () => {
    // ana@exemplo.ao está contido em ana@exemplo.aox: apagar por "contém" deixaria um atacante
    // limpar os bloqueios da vítima eliminando a sua própria conta.
    const doAtacante = cookieDe(await c.registar('ana@exemplo.ao', 'Atacante'));
    await c.registar('ana@exemplo.aox', 'Vítima');
    for (let i = 0; i < 11; i++) await c.post('/api/auth/entrar', { email: 'ana@exemplo.aox', palavraPasse: 'errada-123456' }, undefined, '203.0.113.9');
    await eliminar({}, doAtacante);
    const r = await c.post('/api/auth/entrar', { email: 'ana@exemplo.aox', palavraPasse: 'outro-palpite-1' }, undefined, '203.0.113.9');
    expect(r.statusCode).toBe(429);
  });

  it('dois pedidos de eliminação em simultâneo: um elimina, o outro recebe uma resposta clara', async () => {
    const cookie = cookieDe(await c.registar());
    const respostas = await Promise.all([eliminar({}, cookie), eliminar({}, cookie)]);
    expect(respostas.map((r) => r.statusCode).sort()).toEqual([204, 401]);
    expect(c.emails.filter((m) => m.assunto === 'A sua conta do Eveni foi eliminada')).toHaveLength(1);
    const { rows } = await base.pool.query("select count(*)::int as n from audit_log where action = 'conta.eliminada'");
    expect(rows[0].n).toBe(1);
  });

  it('não toca nas contas de outras pessoas', async () => {
    const daAna = cookieDe(await c.registar());
    const doBruno = cookieDe(await c.registar('bruno@exemplo.ao', 'Bruno'));
    await eliminar({}, daAna);
    expect((await c.eu(doBruno)).statusCode).toBe(200);
    expect(await ondeAparece('bruno@exemplo.ao')).not.toEqual([]);
  });

  it('com a palavra-passe errada ou sem escrever ELIMINAR, não apaga nada', async () => {
    const cookie = cookieDe(await c.registar());
    expect((await eliminar({ palavraPasse: 'palpite-123456' }, cookie)).statusCode).toBe(400);
    const semConfirmar = await eliminar({ confirmacao: 'sim' }, cookie);
    expect(semConfirmar.statusCode).toBe(400);
    expect(semConfirmar.json().campos.confirmacao).toBe('Escreva ELIMINAR para confirmar.');
    expect((await c.eu(cookie)).statusCode).toBe(200);
  });

  it('exige sessão', async () => {
    expect((await eliminar({})).statusCode).toBe(401);
  });

  it('com 2FA activo, exige também um código', async () => {
    const cookie = cookieDe(await c.registar());
    await c.post('/api/auth/reenviar-confirmacao', {}, cookie);
    await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie);
    const { segredo } = (await c.post('/api/conta/2fa/iniciar', {}, cookie)).json();
    const codigo = (d: number) => codigoHotp(deBase32(segredo), passoActual() + d);
    await c.post('/api/conta/2fa/activar', { palavraPasse: PALAVRA_PASSE, codigo: codigo(-1) }, cookie);

    expect((await eliminar({}, cookie)).json().campos.codigo).toBeDefined();
    expect((await eliminar({ codigo: '000000' }, cookie)).statusCode).toBe(400);
    expect((await c.eu(cookie)).statusCode).toBe(200);
    // Os códigos errados ficam na auditoria.
    const { rows } = await base.pool.query("select count(*)::int as n from audit_log where action = 'conta.dados_confirmacao_falhada'");
    expect(rows[0].n).toBe(2);
    expect((await eliminar({ codigo: codigo(0) }, cookie)).statusCode).toBe(204);
  });

  it('com 2FA, os códigos errados contam para o mesmo limite da entrada', async () => {
    const cookie = cookieDe(await c.registar());
    await c.post('/api/auth/reenviar-confirmacao', {}, cookie);
    await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie);
    const { segredo } = (await c.post('/api/conta/2fa/iniciar', {}, cookie)).json();
    await c.post('/api/conta/2fa/activar', { palavraPasse: PALAVRA_PASSE, codigo: codigoHotp(deBase32(segredo), passoActual() - 1) }, cookie);
    const id = (await c.eu(cookie)).json().id;
    await base.pool.query("insert into rate_limits values ($1, 20, now())", [`entrar-2fa-erros:${id}`]);
    expect((await eliminar({ codigo: codigoHotp(deBase32(segredo), passoActual()) }, cookie)).statusCode).toBe(429);
  });

  it('não apaga um espaço de trabalho com outros membros (seria trabalho de outras pessoas)', async () => {
    const daAna = cookieDe(await c.registar());
    await c.registar('bruno@exemplo.ao', 'Bruno');
    await base.pool.query(`insert into workspace_members (workspace_id, user_id, role)
      select (select workspace_id from workspace_members wm join users u on u.id = wm.user_id where u.email = 'ana@exemplo.ao'),
             (select id from users where email = 'bruno@exemplo.ao'), 'member'`);
    const r = await eliminar({}, daAna);
    expect(r.statusCode).toBe(409);
    expect(r.json().mensagem).toContain('Transfira-o');
    expect((await c.eu(daAna)).statusCode).toBe(200);
  });
});

it('a limpeza das contas nunca confirmadas conta só as que apagou de facto', async () => {
  await c.registar('antiga@exemplo.ao', 'Antiga');
  const cookie = cookieDe(await c.registar('confirmada@exemplo.ao', 'Confirmada'));
  await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie);
  await base.pool.query("update users set created_at = now() - interval '8 days'");
  expect((await limparExpirados(base.pool)).contas).toBe(1);
});

it('a limpeza das contas nunca confirmadas também apaga tudo', async () => {
  await c.registar('antiga@exemplo.ao', 'Antiga');
  for (let i = 0; i < 3; i++) await c.post('/api/auth/entrar', { email: 'antiga@exemplo.ao', palavraPasse: 'errada-123456' });
  await base.pool.query("update users set created_at = now() - interval '8 days'");
  expect((await limparExpirados(base.pool)).contas).toBe(1);
  expect(await ondeAparece('antiga@exemplo.ao')).toEqual([]);
});
