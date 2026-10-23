import { expect, test } from '@playwright/test';
import { contaConfirmada } from './ajuda.js';

// Página pública (decisão 028).
test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

test('sem sessão, o endereço principal mostra a página pública e leva ao registo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Cada evento tem um dia D. O Eveni trata do caminho até lá.', level: 1 })).toBeVisible();
  await expect(page.getByText('O grande dia')).toBeVisible();
  await expect(page.getByText('12 meses, 69 tarefas')).toBeVisible();
  await expect(page.getByText(/Em Luanda, o e-mail não garante presença/)).toBeVisible();
  await expect(page.getByText('60 000,00 Kz por mês')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('link', { name: 'Criar conta grátis' }).first().click();
  await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible();
  await page.goBack();
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entrar no Eveni' })).toBeVisible();
});

test('as ligações do rodapé abrem os termos e a privacidade', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Política de privacidade' }).click();
  await expect(page.getByRole('heading', { name: 'Política de privacidade', level: 1 })).toBeVisible();
});

test('com sessão, o endereço principal continua a ser o início da aplicação', async ({ page }) => {
  await contaConfirmada(page, 'Olivia');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Olá, Olivia' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Cada evento tem um dia D/ })).toHaveCount(0);
});

test('outros endereços sem sessão continuam a levar à entrada', async ({ page }) => {
  await page.goto('/fornecedores');
  await expect(page.getByRole('heading', { name: 'Entrar no Eveni' })).toBeVisible();
});
