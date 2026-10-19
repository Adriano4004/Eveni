import { expect, test } from '@playwright/test';

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
