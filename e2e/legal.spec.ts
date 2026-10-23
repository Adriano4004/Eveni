import { expect, test } from '@playwright/test';
import { contaConfirmada, naBaseDeDados, PALAVRA_PASSE } from './ajuda.js';

// Termos de utilização e política de privacidade (decisão 026).
test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

test('as páginas de privacidade e termos abrem-se sem sessão e ligam-se entre si', async ({ page }) => {
  await page.goto('/privacidade');
  await expect(page.getByRole('heading', { name: 'Política de privacidade', level: 1 })).toBeVisible();
  await expect(page.getByText('Versão de 23/10/2026')).toBeVisible();
  await expect(page.getByText(/BLUE BERN Comércio Geral e Prestação de Serviços, Lda\., NIF 5000143723/).first()).toBeVisible();
  await expect(page.getByText(/privacidade@eveni\.ao/).first()).toBeVisible();

  await page.getByRole('link', { name: 'Termos de utilização' }).click();
  await expect(page).toHaveURL(/\/termos$/);
  await expect(page.getByRole('heading', { name: 'Termos de utilização', level: 1 })).toBeVisible();
  await expect(page.getByText(/370 000,00 Kz por mês/)).toBeVisible();

  // Recarregar o endereço abre a mesma página (não manda para a entrada).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Termos de utilização', level: 1 })).toBeVisible();
});

test('a entrada e o registo têm ligações para os termos e a privacidade', async ({ page }) => {
  await page.goto('/entrar');
  await expect(page.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute('href', '/privacidade');
  await page.getByRole('link', { name: 'Criar conta' }).click();
  // Na caixa do registo, as ligações abrem noutro separador, para não se perder o que já foi escrito.
  const caixa = page.locator('label.escolha');
  await expect(caixa.getByRole('link', { name: 'termos de utilização' })).toHaveAttribute('target', '_blank');
  await expect(caixa.getByRole('link', { name: 'política de privacidade' })).toHaveAttribute('href', '/privacidade');
});

test('sem marcar a caixa, o registo não cria a conta', async ({ page }) => {
  await naBaseDeDados("delete from rate_limits where key like 'registo-ip:%'");
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Kátia');
  await page.getByLabel('E-mail').fill(`katia.${Date.now()}@exemplo.ao`);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Para criar conta, aceite os termos de utilização e a política de privacidade.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible();

  await page.getByRole('checkbox', { name: /aceito os termos/ }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Kátia' })).toBeVisible();
});

test('com termos novos por aceitar, a aplicação pede-os antes de tudo; os dados continuam acessíveis', async ({ page }) => {
  const email = await contaConfirmada(page, 'Lurdes');
  await naBaseDeDados('update users set terms_version = null, terms_accepted_at = null where email = $1', [email]);
  await page.goto('/projectos/novo');
  await expect(page.getByRole('heading', { name: 'Termos actualizados' })).toBeVisible();

  // Os dados podem ser levados ou apagados sem aceitar.
  await page.getByRole('link', { name: 'Os meus dados' }).click();
  await expect(page.getByRole('heading', { name: 'Os meus dados', level: 1 })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Termos actualizados' })).toBeVisible();

  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();
  await expect(page.getByText('Marque a caixa para aceitar a nova versão dos termos e da política de privacidade.')).toBeVisible();
  await page.getByRole('checkbox', { name: /aceito os termos/ }).check();
  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Lurdes' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Olá, Lurdes' })).toBeVisible();
});
