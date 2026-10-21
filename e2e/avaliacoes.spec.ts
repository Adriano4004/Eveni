import { expect, test } from '@playwright/test';
import pg from 'pg';
import { hojeEmLuanda } from '../src/shared/datas.js';
import { envValido } from '../tests/ajuda.js';
import { contaConfirmada, emDias } from './ajuda.js';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

test('avaliar um fornecedor no dia do evento e ver a média na lista', async ({ page }) => {
  await contaConfirmada(page, 'Paula');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  const nome = `Gala ${Date.now()}`;
  await page.getByLabel('Nome do projecto').fill(nome);
  await page.getByLabel('Data do evento').fill(emDias(30));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await page.getByRole('button', { name: 'Ver orçamento' }).click();

  // Fornecedor acrescentado a partir do orçamento e escolhido numa rubrica.
  await page.getByText('Acrescentar fornecedor', { exact: true }).first().click();
  const novo = page.locator('details', { has: page.getByRole('heading', { name: 'Acrescentar fornecedor' }) });
  await novo.getByLabel('Nome').fill('Som Kianda');
  await novo.getByLabel('Categoria').selectOption('Equipamentos');
  await novo.getByRole('button', { name: 'Acrescentar fornecedor' }).click();
  await expect(page.getByText('Som Kianda acrescentado. Já o pode escolher nas rubricas.')).toBeVisible();
  const somRubrica = page.locator('.rubrica', { hasText: 'Som e microfones' });
  await somRubrica.locator('summary').click();
  await somRubrica.getByLabel('Fornecedor').selectOption({ label: 'Som Kianda (Equipamentos)' });
  await somRubrica.getByRole('button', { name: 'Guardar' }).click();
  await expect(somRubrica.locator('.rubrica__fornecedor')).toHaveText('Som Kianda');

  // Antes do evento, ainda não se avalia.
  await expect(page.getByText(/Poderá avaliar os fornecedores a partir do dia do evento/)).toBeVisible();

  // O evento é hoje (directamente na base de dados de teste).
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  await cliente.query('update projects set event_date = $2 where name = $1', [nome, hojeEmLuanda()]);
  await cliente.end();
  await page.reload();

  const avaliar = page.locator('.avaliar', { hasText: 'Som Kianda' });
  await avaliar.getByRole('button', { name: 'Guardar avaliação' }).click();
  await expect(avaliar.getByText('Escolha de 1 a 5 estrelas.')).toBeVisible();
  await avaliar.getByRole('button', { name: '4 estrelas' }).click();
  await expect(avaliar.getByRole('button', { name: '4 estrelas' })).toHaveAttribute('aria-pressed', 'true');
  await avaliar.getByLabel('Comentário (opcional)').fill('Pontual. O som falhou 5 minutos.');
  await avaliar.getByRole('button', { name: 'Guardar avaliação' }).click();
  await expect(avaliar.getByText('Avaliação guardada.')).toBeVisible();

  // Na lista de fornecedores: a média e o histórico.
  await page.goto('/fornecedores');
  const som = page.locator('.convidado', { hasText: 'Som Kianda' });
  await expect(som.locator('summary')).toContainText('★ 4,0 (1 avaliação)');
  await som.locator('summary').click();
  await expect(som.locator('.historico-avaliacoes')).toContainText(nome);
  await expect(som.locator('.historico-avaliacoes')).toContainText('Pontual. O som falhou 5 minutos.');
});
