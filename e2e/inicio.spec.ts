import { createHash, randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import pg from 'pg';
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

async function criarLigacaoDeConfirmacao(email: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  await cliente.query(
    `insert into email_tokens (token_hash, user_id, purpose, expires_at)
     select $1, id, 'confirmar_email', now() + interval '1 hour' from users where email = $2`,
    [createHash('sha256').update(token).digest('hex'), email],
  );
  await cliente.end();
  return token;
}
