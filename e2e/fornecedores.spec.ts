import { expect, test } from '@playwright/test';
import { contaConfirmada, emDias } from './ajuda.js';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

test('fornecedores: criar no espaço, escolher numa rubrica, acrescentar a partir do orçamento e apagar', async ({ page }) => {
  await contaConfirmada(page, 'Olga');
  await page.getByRole('button', { name: 'Fornecedores' }).click();
  await expect(page.getByRole('heading', { name: 'Fornecedores', exact: true }).first()).toBeVisible();

  // Com a lista vazia, o formulário já vem aberto.
  await page.getByLabel('Nome').fill('Som Kianda');
  await page.getByLabel('Categoria').first().selectOption('Equipamentos');
  await page.getByLabel('Telemóvel').fill('923 456 789');
  await page.getByLabel('Notas').fill('Pedir gerador.\nPagamento 50% adiantado.');
  await page.getByRole('button', { name: 'Acrescentar fornecedor' }).click();
  const som = page.locator('.convidado', { hasText: 'Som Kianda' });
  await expect(som).toContainText('+244 923 456 789');
  await som.locator('summary').click();
  await expect(som.getByRole('link', { name: 'Ligar' })).toHaveAttribute('href', 'tel:+244923456789');
  await expect(som.locator('.nota')).toContainText('Pagamento 50% adiantado.');

  // Num projecto, escolher o fornecedor na rubrica "Som e microfones".
  await page.getByRole('button', { name: 'Voltar ao início' }).click();
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByLabel('Nome do projecto').fill('Conferência');
  await page.getByLabel('Data do evento').fill(emDias(30));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await page.getByRole('button', { name: 'Ver orçamento' }).click();
  const somRubrica = page.locator('.rubrica', { hasText: 'Som e microfones' });
  await somRubrica.locator('summary').click();
  await somRubrica.getByLabel('Fornecedor').selectOption({ label: 'Som Kianda (Equipamentos)' });
  await somRubrica.getByRole('button', { name: 'Guardar' }).click();
  await expect(somRubrica.locator('.rubrica__fornecedor')).toHaveText('Som Kianda');

  // Acrescentar um fornecedor a partir do orçamento e escolhê-lo noutra rubrica.
  await page.getByText('Acrescentar fornecedor', { exact: true }).first().click();
  const novo = page.locator('details', { has: page.getByRole('heading', { name: 'Acrescentar fornecedor' }) });
  await novo.getByLabel('Nome').fill('Foto Luanda');
  await novo.getByLabel('Categoria').selectOption('Artístico');
  await novo.getByRole('button', { name: 'Acrescentar fornecedor' }).click();
  await expect(page.getByText('Foto Luanda acrescentado. Já o pode escolher nas rubricas.')).toBeVisible();
  const foto = page.locator('.rubrica', { hasText: 'Fotógrafo' });
  await foto.locator('summary').click();
  await foto.getByLabel('Fornecedor').selectOption({ label: 'Foto Luanda (Artístico)' });
  await foto.getByRole('button', { name: 'Guardar' }).click();
  await expect(foto.locator('.rubrica__fornecedor')).toHaveText('Foto Luanda');

  // Recarregar e guardar outra vez sem mexer: o fornecedor mantém-se.
  await page.reload();
  const somDepois = page.locator('.rubrica', { hasText: 'Som e microfones' });
  await somDepois.locator('summary').click();
  await somDepois.getByLabel('Valor previsto (Kz)').fill('300 000');
  await somDepois.getByRole('button', { name: 'Guardar' }).click();
  await expect(somDepois.getByText('Guardado.')).toBeVisible();
  await expect(somDepois.locator('.rubrica__fornecedor')).toHaveText('Som Kianda');

  // Apagar o fornecedor tira-o da rubrica.
  await page.goto('/fornecedores');
  page.once('dialog', (d) => d.accept());
  const somLista = page.locator('.convidado', { hasText: 'Som Kianda' });
  await somLista.locator('summary').click();
  await somLista.getByRole('button', { name: 'Apagar fornecedor' }).click();
  await expect(somLista).toHaveCount(0);
  await page.goBack();
  await page.reload();
  await expect(page.locator('.rubrica', { hasText: 'Som e microfones' }).locator('.rubrica__fornecedor')).toHaveCount(0);
});
