import { expect, test } from '@playwright/test';
import { contaConfirmada, emDias } from './ajuda.js';

test('descarregar o relatório para o cliente em PDF', async ({ page }) => {
  await contaConfirmada(page, 'Rita');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByLabel('Nome do projecto').fill('Conferência Anual');
  await page.getByLabel('Data do evento').fill(emDias(30));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(page.getByRole('heading', { name: 'Conferência Anual' })).toBeVisible();

  const descarga = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Relatório para o cliente (PDF)' }).click();
  const ficheiro = await descarga;
  expect(ficheiro.suggestedFilename()).toMatch(/^eveni-cliente-conferencia-anual-\d{4}-\d{2}-\d{2}\.pdf$/);
  const caminho = await ficheiro.path();
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(caminho).subarray(0, 5).toString()).toBe('%PDF-');
});
