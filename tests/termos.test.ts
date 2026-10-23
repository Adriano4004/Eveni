import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { VERSAO_TERMOS } from '../src/shared/legal.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

// Termos de utilização e política de privacidade (decisão 026).
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

const dadosRegisto = { nome: 'Ana Domingos', email: 'ana@exemplo.ao', palavraPasse: PALAVRA_PASSE };

async function contaConfirmada() {
  const cookie = cookieDe(await c.registar());
  expect((await c.post('/api/auth/confirmar-email', { token: c.tokenDoUltimoEmail() }, cookie)).statusCode).toBe(200);
  return cookie;
}

// Simula uma conta criada antes desta versão dos termos (ou que aceitou uma versão anterior).
async function versaoAntiga(versao: string | null) {
  await base.pool.query('update users set terms_version = $1, terms_accepted_at = $2', [versao, versao ? new Date('2026-01-01') : null]);
}

const contar = async (tabela: 'users' | 'projects') => (await base.pool.query<{ n: number }>(`select count(*)::int as n from ${tabela}`)).rows[0]!.n;

describe('registo', () => {
  it.each([[undefined], [false], ['off'], ['sim'], [''], [1]])('sem aceitar os termos (%s), não cria a conta', async (aceitarTermos) => {
    const r = await c.post('/api/auth/registo', { ...dadosRegisto, aceitarTermos });
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.aceitarTermos).toBe('Para criar conta, aceite os termos de utilização e a política de privacidade.');
    expect(await contar('users')).toBe(0);
  });

  it.each([[true], ['on']])('com a caixa marcada (%s), guarda a versão e a data da aceitação', async (aceitarTermos) => {
    const antes = Date.now();
    const r = await c.post('/api/auth/registo', { ...dadosRegisto, aceitarTermos });
    expect(r.statusCode).toBe(201);
    expect(r.json().termosPorAceitar).toBe(false);
    const { rows } = await base.pool.query('select terms_version, terms_accepted_at from users');
    expect(rows[0].terms_version).toBe(VERSAO_TERMOS);
    expect(rows[0].terms_accepted_at.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    const auditoria = await base.pool.query("select details from audit_log where action = 'conta.registo'");
    expect(auditoria.rows[0].details).toMatchObject({ versaoTermos: VERSAO_TERMOS });
  });

  it('a base de dados não aceita versão sem data, nem data sem versão', async () => {
    await c.registar();
    await expect(base.pool.query('update users set terms_accepted_at = null')).rejects.toThrow(/users_termos_coerentes/);
    await expect(base.pool.query('update users set terms_version = null')).rejects.toThrow(/users_termos_coerentes/);
  });
});

describe('contas com uma versão antiga dos termos', () => {
  it.each([[null], ['2025-01-01']])('com %s, a conta diz que há termos por aceitar e tudo o resto é recusado', async (versao) => {
    const cookie = await contaConfirmada();
    await versaoAntiga(versao);

    const eu = await c.eu(cookie);
    expect(eu.statusCode).toBe(200);
    expect(eu.json().termosPorAceitar).toBe(true);

    // Tentativas de usar a aplicação sem aceitar: criar projectos, ver listas, gerir a equipa e a marca.
    const recusados = [
      await c.post('/api/projectos', { template: 'T01', nome: 'Lançamento', dataEvento: somarDias(hojeEmLuanda(), 30) }, cookie),
      await c.get('/api/projectos', cookie),
      await c.get('/api/templates', cookie),
      await c.get('/api/fornecedores', cookie),
      await c.get('/api/equipa', cookie),
      await c.get('/api/marca', cookie),
      await c.post('/api/conta/palavra-passe', { palavraPasse: PALAVRA_PASSE, nova: `${PALAVRA_PASSE}x` }, cookie),
    ];
    for (const r of recusados) {
      expect(r.statusCode).toBe(403);
      expect(r.json().mensagem).toBe('Os termos de utilização mudaram. Aceite a nova versão para continuar.');
    }
    expect(await contar('projects')).toBe(0);
  });

  it('pode exportar e eliminar os dados sem aceitar os termos novos', async () => {
    const cookie = await contaConfirmada();
    await versaoAntiga('2025-01-01');
    const exportacao = await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, cookie);
    expect(exportacao.statusCode).toBe(200);
    expect(JSON.parse(exportacao.body).conta.termosAceites).toEqual({ versao: '2025-01-01', em: '2026-01-01T00:00:00.000Z' });
    expect((await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, cookie)).statusCode).toBe(204);
    expect(await contar('users')).toBe(0);
  });

  it('pode terminar a sessão em todos os dispositivos sem aceitar', async () => {
    const cookie = await contaConfirmada();
    await versaoAntiga(null);
    expect((await c.post('/api/auth/sair-de-todos', {}, cookie)).statusCode).toBe(204);
    expect((await c.eu(cookie)).statusCode).toBe(401);
  });
});

describe('aceitar a nova versão', () => {
  it('exige sessão', async () => {
    expect((await c.post('/api/conta/aceitar-termos', { versao: VERSAO_TERMOS, aceitarTermos: true })).statusCode).toBe(401);
  });

  it('exige a caixa marcada e a versão actual (não se aceita uma versão que a pessoa não leu)', async () => {
    const cookie = await contaConfirmada();
    await versaoAntiga(null);
    const semCaixa = await c.post('/api/conta/aceitar-termos', { versao: VERSAO_TERMOS }, cookie);
    expect(semCaixa.statusCode).toBe(400);
    expect(semCaixa.json().campos.aceitarTermos).toBe('Marque a caixa para aceitar a nova versão dos termos e da política de privacidade.');
    const outraVersao = await c.post('/api/conta/aceitar-termos', { versao: '2025-01-01', aceitarTermos: true }, cookie);
    expect(outraVersao.statusCode).toBe(400);
    expect(outraVersao.json().campos.versao).toMatch(/Os termos mudaram/);
    expect((await c.eu(cookie)).json().termosPorAceitar).toBe(true);
  });

  it('depois de aceitar, a aplicação volta a funcionar e fica registado', async () => {
    const cookie = await contaConfirmada();
    await versaoAntiga('2025-01-01');
    const r = await c.post('/api/conta/aceitar-termos', { versao: VERSAO_TERMOS, aceitarTermos: 'on' }, cookie);
    expect(r.statusCode).toBe(200);
    expect(r.json().termosPorAceitar).toBe(false);
    expect((await c.get('/api/projectos', cookie)).statusCode).toBe(200);

    const { rows } = await base.pool.query('select terms_version, terms_accepted_at from users');
    expect(rows[0].terms_version).toBe(VERSAO_TERMOS);
    expect(rows[0].terms_accepted_at.getTime()).toBeGreaterThan(new Date('2026-01-01').getTime());
    const auditoria = await base.pool.query("select details from audit_log where action = 'conta.termos_aceites'");
    expect(auditoria.rows.map((l) => l.details)).toEqual([expect.objectContaining({ versao: VERSAO_TERMOS })]);
  });

  it('aceitar de novo a mesma versão não muda a data nem regista outra vez', async () => {
    const cookie = await contaConfirmada();
    const antes = (await base.pool.query('select terms_accepted_at from users')).rows[0].terms_accepted_at;
    expect((await c.post('/api/conta/aceitar-termos', { versao: VERSAO_TERMOS, aceitarTermos: true }, cookie)).statusCode).toBe(200);
    expect((await base.pool.query('select terms_accepted_at from users')).rows[0].terms_accepted_at).toEqual(antes);
    expect((await base.pool.query("select count(*)::int as n from audit_log where action = 'conta.termos_aceites'")).rows[0].n).toBe(0);
  });

  it('a aceitação só muda a conta da sessão', async () => {
    const ana = await contaConfirmada();
    cookieDe(await c.registar('bruno@exemplo.ao', 'Bruno'));
    await versaoAntiga(null);
    await c.post('/api/conta/aceitar-termos', { versao: VERSAO_TERMOS, aceitarTermos: true }, ana);
    const { rows } = await base.pool.query('select email, terms_version from users order by email');
    expect(rows).toEqual([
      { email: 'ana@exemplo.ao', terms_version: VERSAO_TERMOS },
      { email: 'bruno@exemplo.ao', terms_version: null },
    ]);
  });
});

describe('exportação', () => {
  it('inclui a versão dos termos aceite e a data', async () => {
    const cookie = await contaConfirmada();
    const r = await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, cookie);
    expect(JSON.parse(r.body).conta.termosAceites).toEqual({ versao: VERSAO_TERMOS, em: expect.any(String) });
  });
});
