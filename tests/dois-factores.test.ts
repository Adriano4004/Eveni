import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aplicarMigracoes, criarBaseDeDados } from '../src/server/db/index.js';
import { codigoHotp, deBase32, passoActual } from '../src/server/seguranca/totp.js';
import { limparBaseDeDados, URL_BD_TESTE } from './ajuda.js';
import { cookieDe, criarCliente, PALAVRA_PASSE } from './cliente.js';

const base = criarBaseDeDados(URL_BD_TESTE);
let c: Awaited<ReturnType<typeof criarCliente>>;

// Código que a aplicação do telemóvel mostraria. desvio=1 dá o do próximo intervalo de 30 s
// (aceite pelo servidor), para poder usar mais do que um código no mesmo teste.
const codigo = (segredo: string, desvio = 0) => codigoHotp(deBase32(segredo), passoActual() + desvio);

function cookieDesafio(r: { cookies: { name: string; value: string }[] }): string {
  const k = r.cookies.find((x) => x.name.endsWith('eveni_2fa'));
  if (!k) throw new Error('sem cookie do 2FA');
  return `${k.name}=${k.value}`;
}

async function activar2fa(cookie: string) {
  const inicio = await c.post('/api/conta/2fa/iniciar', {}, cookie);
  const { segredo } = inicio.json();
  const r = await c.post('/api/conta/2fa/activar', { palavraPasse: PALAVRA_PASSE, codigo: codigo(segredo, -1) }, cookie);
  expect(r.statusCode).toBe(200);
  return { segredo: segredo as string, codigos: r.json().codigosRecuperacao as string[] };
}

const entrar = (palavraPasse = PALAVRA_PASSE, ip?: string) =>
  c.post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse }, undefined, ip);
const segundoPasso = (corpo: object, cookie: string, ip?: string) => c.post('/api/auth/entrar/2fa', corpo, cookie, ip);

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

describe('activar', () => {
  it('gera um código QR e uma chave; só fica activo depois de um código certo', async () => {
    const cookie = cookieDe(await c.registar());
    const inicio = await c.post('/api/conta/2fa/iniciar', {}, cookie);
    expect(inicio.statusCode).toBe(200);
    expect(inicio.json().qr).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(inicio.json().segredo).toMatch(/^[A-Z2-7]{32}$/);
    expect((await c.eu(cookie)).json().doisFactores).toBe(false);

    const errado = await c.post('/api/conta/2fa/activar', { palavraPasse: PALAVRA_PASSE, codigo: '000000' }, cookie);
    expect(errado.statusCode).toBe(400);
    expect((await c.eu(cookie)).json().doisFactores).toBe(false);

    const r = await c.post('/api/conta/2fa/activar', { palavraPasse: PALAVRA_PASSE, codigo: codigo(inicio.json().segredo) }, cookie);
    expect(r.statusCode).toBe(200);
    expect(r.json().codigosRecuperacao).toHaveLength(10);
    expect(r.json().codigosRecuperacao[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect((await c.eu(cookie)).json().doisFactores).toBe(true);
    expect(c.emails.at(-1)!.assunto).toBe('Verificação em dois passos activada no Eveni');
  });

  it('termina as outras sessões e mantém esta', async () => {
    const aqui = cookieDe(await c.registar());
    const outra = cookieDe(await entrar());
    await activar2fa(aqui);
    expect((await c.eu(aqui)).statusCode).toBe(200);
    expect((await c.eu(outra)).statusCode).toBe(401);
  });

  it('exige a palavra-passe: quem roubou uma sessão aberta não consegue activar', async () => {
    const cookie = cookieDe(await c.registar());
    const { segredo } = (await c.post('/api/conta/2fa/iniciar', {}, cookie)).json();
    const r = await c.post('/api/conta/2fa/activar', { palavraPasse: 'palpite-123456', codigo: codigo(segredo) }, cookie);
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.palavraPasse).toBeDefined();
    expect((await c.eu(cookie)).json().doisFactores).toBe(false);
  });

  it('exige sessão', async () => {
    expect((await c.post('/api/conta/2fa/iniciar')).statusCode).toBe(401);
    expect((await c.post('/api/conta/2fa/activar', { palavraPasse: PALAVRA_PASSE, codigo: '123456' })).statusCode).toBe(401);
  });

  it('o segredo fica cifrado na base de dados, e nunca aparece em /eu', async () => {
    const cookie = cookieDe(await c.registar());
    const { segredo } = await activar2fa(cookie);
    const { rows } = await base.pool.query('select totp_secret from users');
    expect(rows[0].totp_secret).not.toContain(segredo);
    expect(rows[0].totp_secret).toMatch(/^v1\./);
    expect((await c.eu(cookie)).body).not.toContain(segredo);
  });

  it('os códigos de recuperação ficam só em hash', async () => {
    const { codigos } = await activar2fa(cookieDe(await c.registar()));
    const { rows } = await base.pool.query('select code_hash from recovery_codes');
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.code_hash)).not.toContain(codigos[0]);
  });
});

describe('entrar com 2FA', () => {
  let segredo: string;
  let codigos: string[];
  beforeEach(async () => {
    ({ segredo, codigos } = await activar2fa(cookieDe(await c.registar())));
  });

  it('a palavra-passe certa não chega: pede o código e ainda não dá sessão', async () => {
    const r = await entrar();
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ doisFactores: true });
    expect(r.cookies.find((k) => k.name === 'eveni_sessao')).toBeUndefined();
    expect((await c.eu(cookieDesafio(r))).statusCode).toBe(401);
  });

  it('com o código certo, entra', async () => {
    const desafio = cookieDesafio(await entrar());
    const r = await segundoPasso({ codigo: codigo(segredo, 1) }, desafio);
    expect(r.statusCode).toBe(200);
    expect(r.json().doisFactores).toBe(true);
    expect((await c.eu(cookieDe(r))).statusCode).toBe(200);
  });

  it('o mesmo código não serve duas vezes', async () => {
    const usado = codigo(segredo, 1);
    expect((await segundoPasso({ codigo: usado }, cookieDesafio(await entrar()))).statusCode).toBe(200);
    expect((await segundoPasso({ codigo: usado }, cookieDesafio(await entrar()))).statusCode).toBe(401);
  });

  it('código errado: 401 em português', async () => {
    const r = await segundoPasso({ codigo: '000000' }, cookieDesafio(await entrar()));
    expect(r.statusCode).toBe(401);
    expect(r.json().mensagem).toContain('Código incorrecto');
  });

  it('sem ter passado pela palavra-passe, o segundo passo não serve', async () => {
    expect((await segundoPasso({ codigo: codigo(segredo, 1) }, 'eveni_2fa=inventado')).statusCode).toBe(401);
    expect((await segundoPasso({ codigo: codigo(segredo, 1) }, '')).statusCode).toBe(401);
  });

  it('no máximo 5 tentativas por entrada', async () => {
    const desafio = cookieDesafio(await entrar());
    for (let i = 0; i < 5; i++) await segundoPasso({ codigo: '000000' }, desafio);
    const r = await segundoPasso({ codigo: codigo(segredo, 1) }, desafio);
    expect(r.statusCode).toBe(401);
    expect(r.json().mensagem).toContain('expirou');
  });

  // Entradas a meio novas para cada tentativa: o limite por entrada (5) não chega a contar.
  const errarDe = async (ip: string) => segundoPasso({ codigo: '000000' }, cookieDesafio(await entrar(PALAVRA_PASSE, ip)), ip);

  it('quem sabe a palavra-passe não tem tentativas infinitas a partir de um IP, mesmo recomeçando a entrada', async () => {
    for (let i = 0; i < 5; i++) await errarDe('203.0.113.7');
    const r = await segundoPasso({ codigo: codigo(segredo, 1) }, cookieDesafio(await entrar(PALAVRA_PASSE, '203.0.113.7')), '203.0.113.7');
    expect(r.statusCode).toBe(429);
  });

  it('esse atacante não impede o dono de entrar a partir de outro IP', async () => {
    for (let i = 0; i < 6; i++) await errarDe('203.0.113.7');
    const r = await segundoPasso({ codigo: codigo(segredo, 1) }, cookieDesafio(await entrar(PALAVRA_PASSE, '198.51.100.20')), '198.51.100.20');
    expect(r.statusCode).toBe(200);
  });

  it('um ataque distribuído pára aos 20 códigos errados por hora na conta', async () => {
    for (let i = 0; i < 20; i++) await errarDe(`203.0.113.${100 + i}`);
    const r = await segundoPasso({ codigo: codigo(segredo, 1) }, cookieDesafio(await entrar(PALAVRA_PASSE, '198.51.100.20')), '198.51.100.20');
    expect(r.statusCode).toBe(429);
  });

  it('entradas certas não gastam o limite', async () => {
    for (let i = 0; i < 12; i++) {
      const r = await segundoPasso({ codigoRecuperacao: codigos[i % 10] }, cookieDesafio(await entrar(PALAVRA_PASSE, `198.51.100.${i}`)));
      if (i < 10) expect(r.statusCode).toBe(200);
    }
    // Depois de 10 entradas com códigos de recuperação (e 2 tentativas com códigos já usados), a aplicação ainda funciona.
    expect((await segundoPasso({ codigo: codigo(segredo, 1) }, cookieDesafio(await entrar(PALAVRA_PASSE, '198.51.100.50')))).statusCode).toBe(200);
  });

  it('um código de recuperação mal escrito mostra o erro no campo certo', async () => {
    const r = await segundoPasso({ codigoRecuperacao: 'ABC' }, cookieDesafio(await entrar()));
    expect(r.statusCode).toBe(400);
    expect(r.json().campos.codigoRecuperacao).toContain('código de recuperação');
  });

  it('se o segredo deixar de ser legível (SESSION_SECRET mudou), responde "incorrecto", não um erro interno', async () => {
    const outraChave = await criarCliente(base, { SESSION_SECRET: 'y'.repeat(32) });
    const desafio = cookieDesafio(await outraChave.post('/api/auth/entrar', { email: 'ana@exemplo.ao', palavraPasse: PALAVRA_PASSE }));
    const r = await outraChave.post('/api/auth/entrar/2fa', { codigo: codigo(segredo, 1) }, desafio);
    expect(r.statusCode).toBe(401);
    // Os códigos de recuperação continuam a servir.
    expect((await outraChave.post('/api/auth/entrar/2fa', { codigoRecuperacao: codigos[0] }, desafio)).statusCode).toBe(200);
    await outraChave.app.close();
  });

  it('a entrada a meio expira', async () => {
    const desafio = cookieDesafio(await entrar());
    await base.pool.query("update login_challenges set expires_at = now() - interval '1 second'");
    expect((await segundoPasso({ codigo: codigo(segredo, 1) }, desafio)).statusCode).toBe(401);
  });

  it('com um código de recuperação, entra uma vez, e avisa por e-mail', async () => {
    const r = await segundoPasso({ codigoRecuperacao: codigos[0]!.toLowerCase().replace('-', ' ') }, cookieDesafio(await entrar()));
    expect(r.statusCode).toBe(200);
    expect(c.emails.at(-1)!.texto).toContain('Restam 9 códigos');
    expect((await segundoPasso({ codigoRecuperacao: codigos[0] }, cookieDesafio(await entrar()))).statusCode).toBe(401);
  });

  it('recuperar a palavra-passe não desliga o 2FA', async () => {
    await c.post('/api/auth/recuperar', { email: 'ana@exemplo.ao' });
    const { esperarSegundoPlano } = await import('../src/server/segundo-plano.js');
    await esperarSegundoPlano();
    await c.post('/api/auth/redefinir', { token: c.tokenDoUltimoEmail('redefinir-palavra-passe'), palavraPasse: 'Semba-e-kuduro-77' });
    const r = await entrar('Semba-e-kuduro-77');
    expect(r.json()).toEqual({ doisFactores: true });
  });

  it('mudar a palavra-passe cancela entradas a meio', async () => {
    const desafio = cookieDesafio(await entrar());
    const sessao = cookieDe(await segundoPasso({ codigo: codigo(segredo, 1) }, cookieDesafio(await entrar())));
    await c.post('/api/conta/palavra-passe', { palavraPasseActual: PALAVRA_PASSE, palavraPasse: 'Semba-e-kuduro-77' }, sessao);
    expect((await segundoPasso({ codigo: codigo(segredo, 0) }, desafio)).statusCode).toBe(401);
  });
});

describe('desactivar e códigos novos', () => {
  let cookie: string;
  let segredo: string;
  let codigos: string[];
  beforeEach(async () => {
    cookie = cookieDe(await c.registar());
    ({ segredo, codigos } = await activar2fa(cookie));
  });

  it('desactiva com palavra-passe e código da aplicação', async () => {
    const r = await c.post('/api/conta/2fa/desactivar', { palavraPasse: PALAVRA_PASSE, codigo: codigo(segredo, 1) }, cookie);
    expect(r.statusCode).toBe(204);
    expect((await c.eu(cookie)).json().doisFactores).toBe(false);
    expect((await entrar()).json().doisFactores).toBe(false);
    const { rows } = await base.pool.query('select count(*)::int as n from recovery_codes');
    expect(rows[0].n).toBe(0);
    expect(c.emails.at(-1)!.assunto).toBe('Verificação em dois passos desactivada no Eveni');
  });

  it('desactiva com um código de recuperação (telemóvel perdido)', async () => {
    expect((await c.post('/api/conta/2fa/desactivar', { palavraPasse: PALAVRA_PASSE, codigo: codigos[3] }, cookie)).statusCode).toBe(204);
  });

  it('não desactiva sem a palavra-passe ou sem um código certo', async () => {
    expect((await c.post('/api/conta/2fa/desactivar', { palavraPasse: 'palpite-123456', codigo: codigo(segredo, 1) }, cookie)).statusCode).toBe(400);
    expect((await c.post('/api/conta/2fa/desactivar', { palavraPasse: PALAVRA_PASSE, codigo: '000000' }, cookie)).statusCode).toBe(400);
    expect((await c.eu(cookie)).json().doisFactores).toBe(true);
  });

  it('códigos novos substituem os antigos', async () => {
    const r = await c.post('/api/conta/2fa/codigos-recuperacao', { palavraPasse: PALAVRA_PASSE, codigo: codigo(segredo, 1) }, cookie);
    expect(r.statusCode).toBe(200);
    const novos = r.json().codigosRecuperacao as string[];
    expect(novos).toHaveLength(10);
    expect(novos).not.toContain(codigos[0]);
    expect((await segundoPasso({ codigoRecuperacao: codigos[0] }, cookieDesafio(await entrar()))).statusCode).toBe(401);
    expect((await segundoPasso({ codigoRecuperacao: novos[0] }, cookieDesafio(await entrar()))).statusCode).toBe(200);
  });

  it('um código errado ao desactivar fica na auditoria', async () => {
    await c.post('/api/conta/2fa/desactivar', { palavraPasse: PALAVRA_PASSE, codigo: '000000' }, cookie);
    const { rows } = await base.pool.query("select details from audit_log where action = 'conta.2fa_confirmacao_falhada'");
    expect(rows).toEqual([{ details: { motivo: 'codigo' } }]);
  });

  it('limita tentativas de adivinhar a palavra-passe com uma sessão roubada', async () => {
    for (let i = 0; i < 10; i++) await c.post('/api/conta/2fa/desactivar', { palavraPasse: `palpite-${i}-123`, codigo: '000000' }, cookie);
    expect((await c.post('/api/conta/2fa/desactivar', { palavraPasse: PALAVRA_PASSE, codigo: codigo(segredo, 1) }, cookie)).statusCode).toBe(429);
  });
});

it('o aviso de código de recuperação usado diz quantos restam, no singular e quando acabam', async () => {
  const { mensagens } = await import('../src/shared/mensagens.js');
  const corpo = mensagens.emails.codigoRecuperacaoUsado.corpo;
  expect(corpo(9)).toContain('Restam 9 códigos');
  expect(corpo(1)).toContain('Resta 1 código por usar.');
  expect(corpo(0)).toContain('Já não restam códigos');
});
