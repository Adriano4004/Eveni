import { expect, type Page, test } from '@playwright/test';
import pg from 'pg';
import { envValido } from '../tests/ajuda.js';
import { contaConfirmada, naBaseDeDados, PALAVRA_PASSE } from './ajuda.js';

// Administração dos planos (decisão 027). O e-mail do administrador está em ADMINS (playwright.config.ts).
const ADMIN = 'admin.e2e@exemplo.ao';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

async function entrarComoAdmin(page: Page, doisFactores: boolean) {
  await naBaseDeDados('delete from users where email = $1', [ADMIN]);
  await naBaseDeDados("delete from rate_limits where key like 'registo-ip:%'");
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Adriano');
  await page.getByLabel('E-mail').fill(ADMIN);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('checkbox', { name: /aceito os termos/ }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Adriano' })).toBeVisible();
  await naBaseDeDados(
    `update users set email_verified_at = now() ${doisFactores ? ", totp_enabled_at = now(), totp_secret = 'x'" : ''} where email = $1`,
    [ADMIN],
  );
  await page.reload();
}

const planoDe = async (email: string) => {
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  try {
    const { rows } = await cliente.query(
      "select w.plan_code from workspaces w join workspace_members wm on wm.workspace_id = w.id join users u on u.id = wm.user_id where u.email = $1 and wm.role = 'owner'",
      [email],
    );
    return rows[0]?.plan_code;
  } finally {
    await cliente.end();
  }
};

test('um cliente comum não vê a administração, nem pelo endereço', async ({ page }) => {
  await contaConfirmada(page, 'Mario');
  await expect(page.getByRole('button', { name: 'Administração' })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Olá, Mario' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Administração' })).toHaveCount(0);
});

test('sem a verificação em dois passos, a administração pede que a active', async ({ page }) => {
  await entrarComoAdmin(page, false);
  await page.getByRole('button', { name: 'Administração' }).click();
  await expect(page.getByRole('alert')).toContainText('active primeiro a verificação em dois passos');
  await page.getByRole('button', { name: 'Activar a verificação em dois passos' }).click();
  await expect(page).toHaveURL(/\/conta\/2fa$/);
});

test('o administrador encontra um cliente e muda-lhe o plano', async ({ browser, page }) => {
  const cliente = await (await browser.newContext()).newPage();
  const emailCliente = await contaConfirmada(cliente, 'Nadia');

  await entrarComoAdmin(page, true);
  await page.getByRole('button', { name: 'Administração' }).click();
  await expect(page.getByRole('heading', { name: 'Administração' })).toBeVisible();
  await page.getByLabel('Pesquisar por e-mail do dono ou nome do espaço').fill(emailCliente);
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  await expect(page.getByText('1 espaço (no máximo 50; use a pesquisa para encontrar outros).')).toBeVisible();

  const linha = page.locator('li.convidado', { hasText: 'Espaço de Nadia' });
  await linha.locator('summary').click();
  await linha.getByLabel('Mudar o plano para').selectOption('empresarial');
  await linha.getByRole('button', { name: 'Mudar plano' }).click();
  await expect(linha.getByRole('status')).toHaveText('Plano mudado para Empresarial. O dono vai receber um e-mail.');
  await expect(linha.locator('.etiqueta')).toHaveText('Empresarial');
  // Descer para o Singular com dois membros (dono + 1): o aviso aparece logo, sem pesquisar de novo.
  await naBaseDeDados(
    `insert into workspace_members (workspace_id, user_id, role)
       select wm.workspace_id, (select id from users where email = $2), 'member'
         from workspace_members wm join users u on u.id = wm.user_id where u.email = $1 and wm.role = 'owner'`,
    [emailCliente, ADMIN],
  );
  await linha.getByLabel('Mudar o plano para').selectOption('singular');
  await linha.getByRole('button', { name: 'Mudar plano' }).click();
  await expect(linha.getByText(/passa do limite do novo plano/)).toBeVisible();
  await linha.getByLabel('Mudar o plano para').selectOption('empresarial');
  await linha.getByRole('button', { name: 'Mudar plano' }).click();
  await expect(linha.getByText(/passa do limite do novo plano/)).toHaveCount(0);
  expect(await planoDe(emailCliente)).toBe('empresarial');

  // O cliente vê o plano novo ao recarregar.
  await cliente.reload();
  await expect(cliente.getByText('Empresarial')).toBeVisible();
});
