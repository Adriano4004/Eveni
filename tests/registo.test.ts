// Registo de actividade do espaço de trabalho, visível só para o dono (Fase 4).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import type { EntradaRegisto } from '../src/shared/equipa.js';
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

// A Ana cria um projecto, convida o Bruno, dá-lhe acesso, retira-o e arquiva o projecto.
async function historia() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto: string = (
    await c.post('/api/projectos', { template: 'T01', nome: 'Conferência', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana.cookie)
  ).json().id;
  const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
  const ligacao: string = (await c.post('/api/equipa/convites', { email: 'bruno@exemplo.ao' }, ana.cookie)).json().ligacao;
  await c.post('/api/convites/aceitar', { token: decodeURIComponent(new URL(ligacao).searchParams.get('token')!) }, bruno.cookie);
  const carla = (await c.post('/api/equipa/convites', { email: 'carla@exemplo.ao' }, ana.cookie)).json();
  await c.post(`/api/equipa/convites/${carla.id}/revogar`, {}, ana.cookie);
  await c.post(`/api/projectos/${projecto}/acessos`, { utilizadorId: bruno.id, papel: 'editor' }, ana.cookie);
  await c.post(`/api/projectos/${projecto}/acessos/${bruno.id}/remover`, {}, ana.cookie);
  await c.post(`/api/projectos/${projecto}/arquivar`, {}, ana.cookie);
  await c.post(`/api/equipa/membros/${bruno.id}/remover`, {}, ana.cookie);
  return { ana, bruno, projecto };
}

const resumo = (e: EntradaRegisto) => [e.accao, e.quem, e.projecto ?? e.pessoa ?? e.email];

describe('registo de actividade', () => {
  it('o dono vê o que aconteceu no seu espaço, do mais recente para o mais antigo, com nomes', async () => {
    const { ana } = await historia();
    const r = await c.get('/api/equipa/registo', ana.cookie);
    expect(r.statusCode).toBe(200);
    expect(r.json().mais).toBe(false);
    expect(r.json().entradas.map(resumo)).toEqual([
      ['equipa.membro_removido', 'Ana Domingos', 'Bruno Neto'],
      ['projecto.arquivado', 'Ana Domingos', 'Conferência'],
      ['projecto.acesso_retirado', 'Ana Domingos', 'Conferência'],
      ['projecto.acesso_dado', 'Ana Domingos', 'Conferência'],
      ['equipa.convite_revogado', 'Ana Domingos', 'carla@exemplo.ao'],
      ['equipa.convite_criado', 'Ana Domingos', 'carla@exemplo.ao'],
      ['equipa.convite_aceite', 'Bruno Neto', 'bruno@exemplo.ao'],
      ['equipa.convite_criado', 'Ana Domingos', 'bruno@exemplo.ao'],
      ['projecto.criado', 'Ana Domingos', 'Conferência'],
    ]);
    const dado = r.json().entradas.find((e: EntradaRegisto) => e.accao === 'projecto.acesso_dado');
    expect(dado).toMatchObject({ pessoa: 'Bruno Neto', papel: 'editor' });
    // Sem IPs nem outros dados técnicos.
    expect(r.body).not.toContain('198.51.100');
  });

  it('um membro só vê o registo do seu próprio espaço, nunca o do espaço onde entrou', async () => {
    const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
    await base.pool.query("update workspaces set plan_code = 'empresarial'");
    const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
    const ligacao: string = (await c.post('/api/equipa/convites', { email: 'bruno@exemplo.ao' }, ana.cookie)).json().ligacao;
    await c.post('/api/convites/aceitar', { token: decodeURIComponent(new URL(ligacao).searchParams.get('token')!) }, bruno.cookie);
    const r = await c.get('/api/equipa/registo', bruno.cookie);
    expect(r.json().entradas).toEqual([]);
    expect(r.body).not.toContain('Ana Domingos');
  });

  it('mostra 50 de cada vez, do mais recente para trás', async () => {
    const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
    await base.pool.query(
      `insert into audit_log (user_id, action, workspace_id, details)
       select u.id, 'projecto.criado', wm.workspace_id, '{}' from users u join workspace_members wm on wm.user_id = u.id, generate_series(1, 60)`,
    );
    const primeira = (await c.get('/api/equipa/registo', ana.cookie)).json();
    expect(primeira.entradas).toHaveLength(50);
    expect(primeira.mais).toBe(true);
    const ultima = primeira.entradas.at(-1).id;
    const segunda = (await c.get(`/api/equipa/registo?antes=${ultima}`, ana.cookie)).json();
    expect(segunda.entradas).toHaveLength(10);
    expect(segunda.mais).toBe(false);
    expect(segunda.entradas.every((e: EntradaRegisto) => e.id < ultima)).toBe(true);
  });

  it('parâmetros inválidos dão 400; sem sessão, 401', async () => {
    const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
    for (const antes of ['abc', '-1', '1.5', "1' or '1'='1"]) {
      expect((await c.get(`/api/equipa/registo?antes=${encodeURIComponent(antes)}`, ana.cookie)).statusCode, antes).toBe(400);
    }
    expect((await c.get('/api/equipa/registo')).statusCode).toBe(401);
  });

  it('nomes de contas eliminadas aparecem como em falta; o registo do espaço apaga-se com a conta do dono', async () => {
    const { ana, bruno } = await historia();
    await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, bruno.cookie);
    const entradas: EntradaRegisto[] = (await c.get('/api/equipa/registo', ana.cookie)).json().entradas;
    expect(entradas.find((e) => e.accao === 'equipa.membro_removido')!.pessoa).toBeNull();

    await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, ana.cookie);
    expect((await base.pool.query('select count(*)::int as n from audit_log where workspace_id is not null')).rows[0].n).toBe(0);
  });
});
