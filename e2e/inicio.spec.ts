import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { codigoHotp, deBase32, passoActual } from '../src/server/seguranca/totp.js';
import { envValido } from '../tests/ajuda.js';

const PALAVRA_PASSE = 'Kizomba-2026-evento';

test.beforeEach(({ page }) => {
  // Sem erros de consola (por exemplo, bloqueios da CSP).
  page.on('console', (m) => {
    // O browser regista as respostas 4xx esperadas (ex.: palavra-passe errada) como "Failed to load resource".
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('ERR_INTERNET_DISCONNECTED')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

test('criar conta, terminar sessão e voltar a entrar, no telemóvel', async ({ page }) => {
  const email = `ana.${Date.now()}@exemplo.ao`;

  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByRole('link', { name: 'Criar conta' }).click();

  await page.getByLabel('Nome').fill('Ana Domingos');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByRole('heading', { name: 'Olá, Ana Domingos' })).toBeVisible();
  await expect(page.getByText('Espaço de Ana Domingos')).toBeVisible();
  await expect(page.getByText('Singular')).toBeVisible();

  // Recarregar mantém a sessão.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Olá, Ana Domingos' })).toBeVisible();

  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrar no Eveni' })).toBeVisible();

  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill('palavra-errada-1');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou palavra-passe incorrectos.');

  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Ana Domingos' })).toBeVisible();
});

test('o registo mostra os erros junto ao campo, em português', async ({ page }) => {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Bruno');
  await page.getByLabel('E-mail').fill(`bruno.${Date.now()}@exemplo.ao`);
  await page.getByLabel('Palavra-passe').fill('curta');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('A palavra-passe tem de ter pelo menos 10 caracteres.')).toBeVisible();
  await expect(page.getByLabel('Palavra-passe')).toHaveAttribute('aria-invalid', 'true');
});

test('terminar sessão em todos os dispositivos fecha também as outras sessões', async ({ browser }) => {
  const email = `carla.${Date.now()}@exemplo.ao`;
  const telemovel = await (await browser.newContext()).newPage();
  const computador = await (await browser.newContext()).newPage();

  await telemovel.goto('/registo');
  await telemovel.getByLabel('Nome').fill('Carla');
  await telemovel.getByLabel('E-mail').fill(email);
  await telemovel.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await telemovel.getByRole('button', { name: 'Criar conta' }).click();
  await expect(telemovel.getByRole('heading', { name: 'Olá, Carla' })).toBeVisible();

  await computador.goto('/entrar');
  await computador.getByLabel('E-mail').fill(email);
  await computador.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await computador.getByRole('button', { name: 'Entrar' }).click();
  await expect(computador.getByRole('heading', { name: 'Olá, Carla' })).toBeVisible();

  computador.on('dialog', (d) => d.accept());
  await computador.getByRole('button', { name: 'Terminar sessão em todos os dispositivos' }).click();
  await expect(computador.getByRole('heading', { name: 'Entrar no Eveni' })).toBeVisible();

  await telemovel.reload();
  await expect(telemovel.getByRole('heading', { name: 'Entrar no Eveni' })).toBeVisible();
});

test('se terminar sessão falhar, avisa e não finge que saiu', async ({ page }) => {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Dino');
  await page.getByLabel('E-mail').fill(`dino.${Date.now()}@exemplo.ao`);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Dino' })).toBeVisible();

  await page.route('**/api/auth/sair-de-todos', (rota) => rota.abort('internetdisconnected'));
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Terminar sessão em todos os dispositivos' }).click();
  await expect(page.getByRole('alert')).toHaveText('Não foi possível terminar a sessão. Verifique a internet e tente novamente.');
  await expect(page.getByRole('heading', { name: 'Olá, Dino' })).toBeVisible();
});

test('confirmar o e-mail a partir da ligação faz desaparecer o aviso', async ({ page }) => {
  const email = `eva.${Date.now()}@exemplo.ao`;
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Eva');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Confirme o seu e-mail' })).toBeVisible();

  await page.getByRole('button', { name: 'Reenviar e-mail' }).click();
  await expect(page.getByRole('status')).toContainText('Enviámos um novo e-mail');

  // O e-mail real só existe nos logs do servidor: o teste cria uma ligação conhecida na base de dados.
  const token = await criarLigacaoDeConfirmacao(email);
  await page.goto(`/confirmar-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();
  // O token sai do endereço, para não ficar no histórico.
  await expect(page).toHaveURL(/\/confirmar-email$/);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Eva' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Confirme o seu e-mail' })).toHaveCount(0);

  // A mesma ligação não serve uma segunda vez.
  await page.goto(`/confirmar-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'Não foi possível confirmar' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('inválida ou já expirou');
});

test('se a internet falhar ao confirmar, permite tentar de novo sem voltar ao e-mail', async ({ page }) => {
  const email = `fabio.${Date.now()}@exemplo.ao`;
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Fábio');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Fábio' })).toBeVisible();

  const token = await criarLigacaoDeConfirmacao(email);
  await page.route('**/api/auth/confirmar-email', (rota) => rota.abort('internetdisconnected'));
  await page.goto(`/confirmar-email?token=${token}`);
  await expect(page.getByRole('alert')).toContainText('Sem ligação ao servidor');

  await page.unroute('**/api/auth/confirmar-email');
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();
});

test('abrir a ligação sem sessão pede para entrar primeiro, e confirma a seguir', async ({ page }) => {
  const email = `gil.${Date.now()}@exemplo.ao`;
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Gil');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Gil' })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();

  const token = await criarLigacaoDeConfirmacao(email);
  await page.goto(`/confirmar-email?token=${token}`);
  await expect(page.getByText('Para confirmar o e-mail, entre na conta que criou.')).toBeVisible();
  await expect(page).toHaveURL(/\/confirmar-email$/);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();
});

test('recuperar a palavra-passe a partir do ecrã de entrada', async ({ page }) => {
  const email = `helena.${Date.now()}@exemplo.ao`;
  const nova = 'Semba-e-kuduro-77';
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Helena');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Helena' })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();

  await page.getByRole('link', { name: 'Esqueceu-se da palavra-passe?' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar ligação' }).click();
  await expect(page.getByRole('status')).toContainText('Se existir uma conta com este e-mail');

  const token = await criarLigacao(email, 'recuperar_palavra_passe');
  await page.goto(`/redefinir-palavra-passe?token=${token}`);
  await expect(page).toHaveURL(/\/redefinir-palavra-passe$/);
  // Recarregar a página não perde a ligação.
  await page.reload();
  await page.getByLabel('Nova palavra-passe').fill(nova);
  await page.getByRole('button', { name: 'Guardar palavra-passe' }).click();
  await expect(page.getByRole('heading', { name: 'Palavra-passe alterada' })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(nova);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Helena' })).toBeVisible();
});

test('mudar a palavra-passe a partir da página inicial', async ({ page }) => {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Ivo');
  await page.getByLabel('E-mail').fill(`ivo.${Date.now()}@exemplo.ao`);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Mudar palavra-passe' }).click();

  await page.getByLabel('Palavra-passe actual').fill('errada-123456');
  await page.getByLabel('Nova palavra-passe').fill('Semba-e-kuduro-77');
  await page.getByRole('button', { name: 'Mudar palavra-passe' }).click();
  await expect(page.getByText('A palavra-passe actual não está correcta.')).toBeVisible();

  await page.getByLabel('Palavra-passe actual').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Mudar palavra-passe' }).click();
  await expect(page.getByRole('status')).toContainText('Palavra-passe alterada');
  // A sessão neste aparelho continua.
  await page.getByRole('link', { name: 'Voltar ao início' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Ivo' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Olá, Ivo' })).toBeVisible();
});

test('activar a verificação em dois passos e entrar com o código', async ({ page }) => {
  const email = `joana.${Date.now()}@exemplo.ao`;
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Joana');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Joana' })).toBeVisible();
  // O 2FA só se activa com o e-mail confirmado.
  await page.goto(`/confirmar-email?token=${await criarLigacaoDeConfirmacao(email)}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Gerir verificação em dois passos' }).click();
  await page.getByRole('button', { name: 'Activar', exact: true }).click();

  // O teste faz de aplicação autenticadora, a partir da chave mostrada no ecrã.
  const segredo = (await page.locator('.chave').innerText()).replace(/\s/g, '');
  const codigo = (desvio: number) => codigoHotp(deBase32(segredo), passoActual() + desvio);
  await expect(page.locator('img.qr')).toBeVisible();
  await page.getByLabel('Código de 6 dígitos').fill(codigo(-1));
  await page.getByLabel('Palavra-passe', { exact: true }).fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Activar verificação em dois passos' }).click();

  await expect(page.getByRole('heading', { name: 'Guarde os códigos de recuperação' })).toBeVisible();
  const codigos = await page.getByRole('list', { name: 'Guarde os códigos de recuperação' }).getByRole('listitem').allInnerTexts();
  expect(codigos).toHaveLength(10);
  await page.getByRole('button', { name: 'Já guardei os códigos' }).click();
  await expect(page.getByText('A verificação em dois passos está activa na sua conta.')).toBeVisible();

  await page.getByRole('link', { name: 'Voltar ao início' }).click();
  await expect(page.getByText('Activa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();

  // Entrar: palavra-passe e depois o código.
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Verificação em dois passos' })).toBeVisible();
  await page.getByLabel('Código de 6 dígitos').fill('000000');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Código incorrecto').first()).toBeVisible();
  await page.getByLabel('Código de 6 dígitos').fill(codigo(0));
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Joana' })).toBeVisible();

  // Sem o telemóvel: um código de recuperação.
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByRole('button', { name: /usar um código de recuperação/ }).click();
  await page.getByLabel('Código de recuperação').fill(codigos[0]!);
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Joana' })).toBeVisible();
});

test('descarregar os meus dados e eliminar a conta', async ({ page }) => {
  const email = `luis.${Date.now()}@exemplo.ao`;
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Luís');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('button', { name: 'Os meus dados' }).click();

  const exportar = page.getByRole('region', { name: 'Descarregar os meus dados' });
  await exportar.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  const [ficheiro] = await Promise.all([page.waitForEvent('download'), exportar.getByRole('button', { name: 'Descarregar ficheiro' }).click()]);
  expect(ficheiro.suggestedFilename()).toMatch(/^eveni-os-meus-dados-\d{4}-\d{2}-\d{2}\.json$/);
  const conteudo = JSON.parse(readFileSync(await ficheiro.path(), 'utf8'));
  expect(conteudo.conta.email).toBe(email);
  await expect(page.getByRole('status')).toHaveText('O ficheiro foi descarregado.');

  const eliminar = page.getByRole('region', { name: 'Eliminar a conta' });
  await eliminar.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await eliminar.getByLabel('Para confirmar, escreva ELIMINAR').fill('sim');
  await eliminar.getByRole('button', { name: 'Eliminar a conta definitivamente' }).click();
  await expect(page.getByText('Escreva ELIMINAR para confirmar.')).toBeVisible();
  await eliminar.getByLabel('Para confirmar, escreva ELIMINAR').fill('ELIMINAR');
  await eliminar.getByRole('button', { name: 'Eliminar a conta definitivamente' }).click();

  await expect(page.getByText('A sua conta e todos os dados foram eliminados.')).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-mail ou palavra-passe incorrectos.');
});

// Os e-mails reais só existem nos logs do servidor: os testes criam ligações conhecidas na base de dados.
async function criarLigacao(email: string, finalidade: 'confirmar_email' | 'recuperar_palavra_passe'): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  await cliente.query(
    `insert into email_tokens (token_hash, user_id, purpose, expires_at)
     select $1, id, $3, now() + interval '1 hour' from users where email = $2`,
    [createHash('sha256').update(token).digest('hex'), email, finalidade],
  );
  await cliente.end();
  return token;
}

const criarLigacaoDeConfirmacao = (email: string) => criarLigacao(email, 'confirmar_email');
