import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { esperarSegundoPlano } from '../src/server/segundo-plano.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

const base = criarBaseDeDados(URL_BD_TESTE);
let c: Awaited<ReturnType<typeof criarCliente>>;
const NOVA = 'Semba-e-kuduro-77';

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

// O trabalho da recuperação corre depois da resposta: esperar que termine antes de verificar e-mails.
async function pedirRecuperacao(email: string, ip?: string) {
  const r = await c.post('/api/auth/recuperar', { email }, undefined, ip);
  await esperarSegundoPlano();
  return r;
}
const redefinir = (token: unknown, palavraPasse = NOVA, ip?: string) => c.post('/api/auth/redefinir', { token, palavraPasse }, undefined, ip);
const entrar = (palavraPasse: string, email = 'ana@exemplo.ao', ip?: string) => c.post('/api/auth/entrar', { email, palavraPasse }, undefined, ip);
const tokenRecuperacao = () => c.tokenDoUltimoEmail('redefinir-palavra-passe');

describe('pedir a recuperação', () => {
  beforeEach(async () => {
    await c.registar();
    c.emails.length = 0;
  });

  it('envia uma ligação válida para o e-mail da conta', async () => {
    const r = await pedirRecuperacao('ANA@exemplo.ao');
    expect(r.statusCode).toBe(202);
    expect(c.emails).toHaveLength(1);
    expect(c.emails[0]!.para).toBe('ana@exemplo.ao');
    expect(c.emails[0]!.assunto).toBe('Definir uma nova palavra-passe no Eveni');
    expect(c.emails[0]!.texto).toContain('http://localhost:3000/redefinir-palavra-passe?token=');
  });

  it('e-mail sem conta: exactamente a mesma resposta, e nenhum e-mail enviado', async () => {
    const comConta = await pedirRecuperacao('ana@exemplo.ao');
    const semConta = await pedirRecuperacao('ninguem@exemplo.ao');
    expect(semConta.statusCode).toBe(comConta.statusCode);
    expect(semConta.body).toBe(comConta.body);
    expect(c.emails).toHaveLength(1);
  });

  it('no máximo 3 e-mails por hora para o mesmo endereço a partir do mesmo IP, sem o revelar na resposta', async () => {
    for (let i = 0; i < 5; i++) expect((await pedirRecuperacao('ana@exemplo.ao', '203.0.113.1')).statusCode).toBe(202);
    expect(c.emails).toHaveLength(3);
    const { rows } = await base.pool.query("select count(*)::int as n from audit_log where action = 'conta.recuperacao_limitada'");
    expect(rows[0].n).toBe(2);
  });

  it('no máximo 10 e-mails por hora para o mesmo endereço, somando todos os IPs', async () => {
    for (let i = 0; i < 12; i++) await pedirRecuperacao('ana@exemplo.ao', `203.0.113.${i}`);
    expect(c.emails).toHaveLength(10);
  });

  it('quem esgota os pedidos de outra pessoa a partir de um IP não a impede de recuperar a partir de outro', async () => {
    for (let i = 0; i < 5; i++) await pedirRecuperacao('ana@exemplo.ao', '203.0.113.66');
    c.emails.length = 0;
    await pedirRecuperacao('ana@exemplo.ao', '198.51.100.20');
    expect(c.emails).toHaveLength(1);
  });

  it('pedidos em simultâneo deixam só uma ligação válida', async () => {
    await Promise.all([1, 2, 3].map(() => c.post('/api/auth/recuperar', { email: 'ana@exemplo.ao' })));
    await esperarSegundoPlano();
    const { rows } = await base.pool.query("select count(*)::int as n from email_tokens where purpose = 'recuperar_palavra_passe' and used_at is null");
    expect(rows[0].n).toBe(1);
  });

  it('limita pedidos por IP', async () => {
    for (let i = 0; i < 10; i++) await pedirRecuperacao(`p${i}@exemplo.ao`, '203.0.113.9');
    expect((await pedirRecuperacao('outro@exemplo.ao', '203.0.113.9')).statusCode).toBe(429);
  });

  it('um pedido novo invalida a ligação anterior', async () => {
    await pedirRecuperacao('ana@exemplo.ao');
    const antiga = tokenRecuperacao();
    await pedirRecuperacao('ana@exemplo.ao');
    expect((await redefinir(antiga)).statusCode).toBe(400);
    expect((await redefinir(tokenRecuperacao())).statusCode).toBe(200);
  });
});

describe('definir a nova palavra-passe', () => {
  let cookieAntigo: string;
  beforeEach(async () => {
    cookieAntigo = cookieDe(await c.registar());
    await pedirRecuperacao('ana@exemplo.ao');
  });

  it('muda a palavra-passe, termina todas as sessões e avisa por e-mail', async () => {
    const outroAparelho = cookieDe(await entrar(PALAVRA_PASSE));
    const r = await redefinir(tokenRecuperacao());
    expect(r.statusCode).toBe(200);
    // Não inicia sessão (entra-se a seguir): no máximo apaga o cookie.
    expect(r.cookies.filter((k) => k.value !== '')).toHaveLength(0);
    expect((await c.eu(cookieAntigo)).statusCode).toBe(401);
    expect((await c.eu(outroAparelho)).statusCode).toBe(401);
    expect((await entrar(PALAVRA_PASSE)).statusCode).toBe(401);
    expect((await entrar(NOVA)).statusCode).toBe(200);
    expect(c.emails.at(-1)!.assunto).toBe('A sua palavra-passe do Eveni foi alterada');
    const { rows } = await base.pool.query("select count(*)::int as n from audit_log where action = 'conta.palavra_passe_redefinida'");
    expect(rows[0].n).toBe(1);
  });

  it('confirma o e-mail (a ligação chegou ao e-mail)', async () => {
    await redefinir(tokenRecuperacao());
    expect((await c.eu(cookieDe(await entrar(NOVA)))).json().emailConfirmado).toBe(true);
  });

  it('cada ligação só serve uma vez, também com pedidos em paralelo', async () => {
    const token = tokenRecuperacao();
    const respostas = await Promise.all([1, 2, 3].map((i) => redefinir(token, `${NOVA}-${i}`)));
    expect(respostas.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect((await redefinir(token)).statusCode).toBe(400);
  });

  it('recusa ligações expiradas', async () => {
    await base.pool.query("update email_tokens set expires_at = now() - interval '1 second' where purpose = 'recuperar_palavra_passe'");
    const r = await redefinir(tokenRecuperacao());
    expect(r.statusCode).toBe(400);
    expect(r.json().mensagem).toContain('inválida ou já expirou');
  });

  it('uma ligação de confirmação de e-mail não serve para mudar a palavra-passe', async () => {
    await c.post('/api/auth/reenviar-confirmacao', {}, cookieAntigo);
    const tokenConfirmacao = c.tokenDoUltimoEmail('confirmar-email');
    expect((await redefinir(tokenConfirmacao)).statusCode).toBe(400);
    expect((await entrar(PALAVRA_PASSE)).statusCode).toBe(200);
  });

  it('uma palavra-passe fraca é recusada sem gastar a ligação', async () => {
    const token = tokenRecuperacao();
    const r = await redefinir(token, 'fraca');
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.palavraPasse).toContain('pelo menos 10 caracteres');
    expect((await redefinir(token)).statusCode).toBe(200);
  });

  it.each([['inventado'], [''], [42]])('recusa tokens inválidos (%#)', async (token) => {
    expect((await redefinir(token)).statusCode).toBe(400);
  });

  it('desbloqueia a conta para o dono, no IP de onde recuperou', async () => {
    for (let i = 0; i < 11; i++) await entrar('errada-123456', 'ana@exemplo.ao', '203.0.113.7');
    expect((await entrar(PALAVRA_PASSE, 'ana@exemplo.ao', '203.0.113.7')).statusCode).toBe(429);
    await redefinir(tokenRecuperacao(), NOVA, '203.0.113.7');
    expect((await entrar(NOVA, 'ana@exemplo.ao', '203.0.113.7')).statusCode).toBe(200);
  });

  it('o atacante não recomeça com o limite cheio depois de o dono recuperar a conta', async () => {
    for (let i = 0; i < 11; i++) await entrar('errada-123456', 'ana@exemplo.ao', '203.0.113.66');
    await redefinir(tokenRecuperacao(), NOVA, '198.51.100.20');
    expect((await entrar('outro-palpite-1', 'ana@exemplo.ao', '203.0.113.66')).statusCode).toBe(429);
  });

  it('o e-mail de aviso diz que todas as sessões foram terminadas', async () => {
    await redefinir(tokenRecuperacao());
    expect(c.emails.at(-1)!.texto).toContain('todas as sessões abertas foram terminadas');
  });

  it('apaga o cookie da sessão terminada', async () => {
    const r = await c.post('/api/auth/redefinir', { token: tokenRecuperacao(), palavraPasse: NOVA }, cookieAntigo);
    expect(r.statusCode).toBe(200);
    const cookie = r.cookies.find((k) => k.name === 'eveni_sessao');
    expect(cookie?.value).toBe('');
  });

  it('mantém o cookie de outra conta com sessão aberta neste browser', async () => {
    const doBruno = cookieDe(await c.registar('bruno@exemplo.ao', 'Bruno'));
    await pedirRecuperacao('ana@exemplo.ao');
    const r = await c.post('/api/auth/redefinir', { token: tokenRecuperacao(), palavraPasse: NOVA }, doBruno);
    expect(r.cookies.find((k) => k.name === 'eveni_sessao')).toBeUndefined();
    expect((await c.eu(doBruno)).statusCode).toBe(200);
  });
});

it('devolve ao dono um e-mail que outra pessoa registou sem confirmar', async () => {
  const doAtacante = cookieDe(await c.registar('vitima@exemplo.ao', 'Atacante'));
  await pedirRecuperacao('vitima@exemplo.ao');
  expect((await redefinir(tokenRecuperacao())).statusCode).toBe(200);
  expect((await c.eu(doAtacante)).statusCode).toBe(401);
  const daVitima = cookieDe(await entrar(NOVA, 'vitima@exemplo.ao'));
  expect((await c.eu(daVitima)).json().emailConfirmado).toBe(true);
});

describe('mudar a palavra-passe com sessão iniciada', () => {
  const mudar = (palavraPasseActual: string, palavraPasse: string, cookie?: string) =>
    c.post('/api/conta/palavra-passe', { palavraPasseActual, palavraPasse }, cookie);

  it('exige sessão', async () => {
    expect((await mudar(PALAVRA_PASSE, NOVA)).statusCode).toBe(401);
  });

  it('mantém esta sessão, termina as outras, e avisa por e-mail', async () => {
    const aqui = cookieDe(await c.registar());
    const outro = cookieDe(await entrar(PALAVRA_PASSE));
    const r = await mudar(PALAVRA_PASSE, NOVA, aqui);
    expect(r.statusCode).toBe(204);
    expect((await c.eu(cookieDe(r))).statusCode).toBe(200);
    expect((await c.eu(outro)).statusCode).toBe(401);
    expect((await c.eu(aqui)).statusCode).toBe(401); // o token antigo desta sessão também deixa de valer
    expect((await entrar(PALAVRA_PASSE)).statusCode).toBe(401);
    expect((await entrar(NOVA)).statusCode).toBe(200);
    expect(c.emails.at(-1)!.assunto).toBe('A sua palavra-passe do Eveni foi alterada');
    expect(c.emails.at(-1)!.texto).toContain('As sessões noutros dispositivos foram terminadas');
  });

  it('com a palavra-passe actual errada não muda nada', async () => {
    const aqui = cookieDe(await c.registar());
    const r = await mudar('errada-123456', NOVA, aqui);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.palavraPasseActual).toBe('A palavra-passe actual não está correcta.');
    expect((await entrar(PALAVRA_PASSE)).statusCode).toBe(200);
    expect((await c.eu(aqui)).statusCode).toBe(200);
  });

  it('a nova tem de ser diferente da actual', async () => {
    const aqui = cookieDe(await c.registar());
    expect((await mudar(PALAVRA_PASSE, PALAVRA_PASSE, aqui)).json().campos.palavraPasse).toContain('diferente');
  });

  it('com a sessão de outra pessoa (ex.: telemóvel perdido) não é possível adivinhar a actual sem limite', async () => {
    const aqui = cookieDe(await c.registar());
    for (let i = 0; i < 10; i++) await mudar(`palpite-${i}-123`, NOVA, aqui);
    expect((await mudar(PALAVRA_PASSE, NOVA, aqui)).statusCode).toBe(429);
  });
});
