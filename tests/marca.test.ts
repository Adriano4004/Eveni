// Marca da agência nos relatórios PDF (decisão 020).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { lerLogo } from '../src/server/relatorios/marca.js';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { dadosMarca } from '../src/shared/esquemas.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

const PNG = readFileSync('tests/imagens/logo.png');
const JPG = readFileSync('tests/imagens/logo.jpg');
const dataUrl = (tipo: string, b: Buffer) => `data:${tipo};base64,${b.toString('base64')}`;

describe('validação', () => {
  it('cor #rrggbb (guardada em minúsculas) e rodapé de uma linha até 200 caracteres; vazios ficam null', () => {
    expect(dadosMarca.parse({ cor: '#6553F3', rodape: ' Agência X · +244 923 000 000 ' })).toEqual({ cor: '#6553f3', rodape: 'Agência X · +244 923 000 000' });
    expect(dadosMarca.parse({ cor: '', rodape: '' })).toEqual({ cor: null, rodape: null });
    for (const mau of [{ cor: 'red' }, { cor: '#fff' }, { cor: '#gggggg' }, { rodape: 'x'.repeat(201) }, { rodape: 'linha\nquebrada' }]) {
      expect(dadosMarca.safeParse(mau).success, JSON.stringify(mau)).toBe(false);
    }
  });

  it('o logótipo tem de ser mesmo PNG ou JPEG, legível, até 500 KB (o tipo declarado não basta)', () => {
    expect(lerLogo(dataUrl('image/png', PNG)).tipo).toBe('image/png');
    expect(lerLogo(dataUrl('image/jpeg', JPG)).tipo).toBe('image/jpeg');
    // Um PNG que diz ser JPEG é lido como PNG.
    expect(lerLogo(dataUrl('image/jpeg', PNG)).tipo).toBe('image/png');
    const maus = [
      dataUrl('image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
      dataUrl('image/svg+xml', PNG),
      dataUrl('image/gif', PNG),
      dataUrl('image/png', Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(100)])),
      dataUrl('image/png', Buffer.concat([PNG, Buffer.alloc(500 * 1024)])),
      'data:image/png;base64,@@@',
      'javascript:alert(1)',
    ];
    for (const mau of maus) expect(() => lerLogo(mau), mau.slice(0, 40)).toThrow();
  });
});

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

// A Ana (Empresarial) tem um projecto com o Bruno como editor; a Eva está no plano Singular.
async function cenario() {
  const ana = await contaConfirmada('ana@exemplo.ao', 'Ana Domingos');
  await base.pool.query("update workspaces set plan_code = 'empresarial'");
  const projecto: string = (await c.post('/api/projectos', { template: 'T01', nome: 'Gala', dataEvento: somarDias(hojeEmLuanda(), 30) }, ana.cookie)).json().id;
  const bruno = await contaConfirmada('bruno@exemplo.ao', 'Bruno Neto');
  const ligacao: string = (await c.post('/api/equipa/convites', { email: 'bruno@exemplo.ao' }, ana.cookie)).json().ligacao;
  await c.post('/api/convites/aceitar', { token: decodeURIComponent(new URL(ligacao).searchParams.get('token')!) }, bruno.cookie);
  await c.post(`/api/projectos/${projecto}/acessos`, { utilizadorId: bruno.id, papel: 'editor' }, ana.cookie);
  const eva = await contaConfirmada('eva@exemplo.ao', 'Eva Pinto');
  return { ana, bruno, eva, projecto };
}

const pdf = async (cookie: string, projecto: string, tipo = 'cliente') => (await c.get(`/api/projectos/${projecto}/relatorios/${tipo}.pdf`, cookie)).rawPayload;
// O PDF guarda as imagens como objectos /Subtype /Image.
const temImagem = (b: Buffer) => b.toString('latin1').includes('/Subtype /Image');

describe('configurar a marca', () => {
  it('o dono (Empresarial) define cor, rodapé e logótipo; vê-os e remove o logótipo', async () => {
    const { ana } = await cenario();
    expect((await c.get('/api/marca', ana.cookie)).json()).toEqual({ disponivel: true, cor: null, rodape: null, temLogo: false });
    expect((await c.post('/api/marca', { cor: '#C2410C', rodape: 'Agência X · agenciax.ao' }, ana.cookie)).json()).toEqual({
      disponivel: true,
      cor: '#c2410c',
      rodape: 'Agência X · agenciax.ao',
      temLogo: false,
    });
    expect((await c.post('/api/marca/logo', { imagem: dataUrl('image/png', PNG) }, ana.cookie)).json().temLogo).toBe(true);
    const logo = await c.get('/api/marca/logo', ana.cookie);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.headers['x-content-type-options']).toBe('nosniff');
    expect(logo.rawPayload.equals(PNG)).toBe(true);
    // Mudar a cor não apaga o logótipo.
    expect((await c.post('/api/marca', { cor: '', rodape: '' }, ana.cookie)).json()).toEqual({ disponivel: true, cor: null, rodape: null, temLogo: true });
    expect((await c.post('/api/marca/logo/remover', {}, ana.cookie)).json().temLogo).toBe(false);
    expect((await c.get('/api/marca/logo', ana.cookie)).statusCode).toBe(404);
  });

  it('no plano Singular não se configura (mas vê-se que não está disponível)', async () => {
    const { eva } = await cenario();
    expect((await c.get('/api/marca', eva.cookie)).json()).toMatchObject({ disponivel: false });
    expect((await c.post('/api/marca', { cor: '#000000' }, eva.cookie)).statusCode).toBe(403);
    expect((await c.post('/api/marca/logo', { imagem: dataUrl('image/png', PNG) }, eva.cookie)).statusCode).toBe(403);
  });

  it('um membro mexe só no seu próprio espaço, nunca no do dono; sem sessão, 401', async () => {
    const { ana, bruno } = await cenario();
    await c.post('/api/marca/logo', { imagem: dataUrl('image/png', PNG) }, ana.cookie);
    // O Bruno está no plano Singular no seu espaço: não altera nada, e não vê o logótipo da Ana.
    expect((await c.post('/api/marca', { cor: '#000000' }, bruno.cookie)).statusCode).toBe(403);
    expect((await c.get('/api/marca/logo', bruno.cookie)).statusCode).toBe(404);
    expect((await c.get('/api/marca', bruno.cookie)).json()).toMatchObject({ temLogo: false });
    expect((await c.get('/api/marca/logo')).statusCode).toBe(401);
    expect((await c.post('/api/marca', { cor: '#000000' })).statusCode).toBe(401);
  });

  it('uma imagem feita para bloquear o servidor é recusada, e o servidor continua a responder', async () => {
    const { ana } = await cenario();
    // Assinatura PNG + um bloco com comprimento "negativo" (0xFFFFFFF4): o leitor de PNG ficava preso para sempre.
    const preso = Buffer.alloc(12);
    preso.writeUInt32BE(0xfffffff4, 0);
    preso.write('abcd', 4, 'latin1');
    const r = await c.post('/api/marca/logo', { imagem: dataUrl('image/png', Buffer.concat([PNG.subarray(0, 8), preso])) }, ana.cookie);
    expect(r.statusCode).toBe(400);
    expect((await c.get('/api/marca', ana.cookie)).statusCode).toBe(200);
  });

  it('imagens inválidas e dados inválidos dão 400 com o erro junto ao campo', async () => {
    const { ana } = await cenario();
    const r = await c.post('/api/marca/logo', { imagem: dataUrl('image/png', Buffer.from('nada')) }, ana.cookie);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos).toHaveProperty('imagem');
    expect((await c.post('/api/marca', { cor: 'azul' }, ana.cookie)).json().campos).toHaveProperty('cor');
  });
});

describe('a marca nos PDF', () => {
  it('com marca, os três relatórios levam o logótipo; sem marca, não', async () => {
    const { ana, projecto } = await cenario();
    for (const tipo of ['cliente', 'interno', 'cronograma']) expect(temImagem(await pdf(ana.cookie, projecto, tipo)), tipo).toBe(false);
    await c.post('/api/marca', { cor: '#c2410c', rodape: 'Agência X' }, ana.cookie);
    await c.post('/api/marca/logo', { imagem: dataUrl('image/jpeg', JPG) }, ana.cookie);
    for (const tipo of ['cliente', 'interno', 'cronograma']) expect(temImagem(await pdf(ana.cookie, projecto, tipo)), tipo).toBe(true);
  });

  it('o editor gera com a marca do espaço do projecto (não com a do seu próprio espaço)', async () => {
    const { ana, bruno, projecto } = await cenario();
    await c.post('/api/marca/logo', { imagem: dataUrl('image/png', PNG) }, ana.cookie);
    expect(temImagem(await pdf(bruno.cookie, projecto))).toBe(true);
  });

  it('se o espaço passar ao plano Singular, os PDF voltam à marca do Eveni (a marca fica guardada)', async () => {
    const { ana, projecto } = await cenario();
    await c.post('/api/marca/logo', { imagem: dataUrl('image/png', PNG) }, ana.cookie);
    await base.pool.query("update workspaces set plan_code = 'singular'");
    expect(temImagem(await pdf(ana.cookie, projecto))).toBe(false);
    expect((await c.get('/api/marca', ana.cookie)).json()).toMatchObject({ disponivel: false, temLogo: true });
  });

  it('um logótipo estragado na base de dados não impede o PDF', async () => {
    const { ana, projecto } = await cenario();
    await c.post('/api/marca/logo', { imagem: dataUrl('image/png', PNG) }, ana.cookie);
    await base.pool.query("update workspace_brands set logo = $1", [Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(50)])]);
    const r = await c.get(`/api/projectos/${projecto}/relatorios/cliente.pdf`, ana.cookie);
    expect(r.statusCode).toBe(200);
    expect(temImagem(r.rawPayload)).toBe(false);
  });

  it('a exportação do dono inclui a marca; eliminar a conta apaga-a', async () => {
    const { eva } = await cenario();
    await base.pool.query("update workspaces set plan_code = 'grandes' where id in (select workspace_id from workspace_members where user_id = $1)", [eva.id]);
    await c.post('/api/marca', { cor: '#123456', rodape: 'Eva Eventos' }, eva.cookie);
    await c.post('/api/marca/logo', { imagem: dataUrl('image/png', PNG) }, eva.cookie);
    const exp = (await c.post('/api/conta/exportar', { palavraPasse: PALAVRA_PASSE }, eva.cookie)).json();
    expect(exp.marcas).toEqual([{ espaco: expect.any(String), cor: '#123456', rodape: 'Eva Eventos', logo: dataUrl('image/png', PNG) }]);
    await c.post('/api/conta/eliminar', { palavraPasse: PALAVRA_PASSE, confirmacao: 'ELIMINAR' }, eva.cookie);
    expect((await base.pool.query('select count(*)::int as n from workspace_brands')).rows[0].n).toBe(0);
  });
});
