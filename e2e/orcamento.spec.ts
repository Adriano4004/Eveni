import { expect, test } from '@playwright/test';
import { contaConfirmada, emDias } from './ajuda.js';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

test('orçamento: valores em Kz, contingência, rubrica nova e alertas', async ({ page }) => {
  await contaConfirmada(page, 'Nuno');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByLabel('Nome do projecto').fill('Conferência');
  await page.getByLabel('Data do evento').fill(emDias(30));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(page.getByText('Total previsto 0,00 Kz · Real 0,00 Kz')).toBeVisible();
  await page.getByRole('button', { name: 'Ver orçamento' }).click();

  await expect(page.getByRole('heading', { name: 'Orçamento', exact: true })).toBeVisible();
  await expect(page.getByText('Contingência (10%)')).toBeVisible();

  // Preencher a sala: previsto 1 000 000, real 1 050 000 (acima do previsto, dentro da contingência).
  const sala = page.locator('.rubrica', { hasText: 'Aluguer de sala' });
  await sala.locator('summary').click();
  await sala.getByLabel('Valor previsto (Kz)').fill('1 000 000');
  await sala.getByLabel('Valor real (Kz)').fill('1.050.000,00');
  await sala.getByRole('button', { name: 'Guardar' }).click();
  await expect(sala.getByText('Guardado.')).toBeVisible();
  await expect(sala.locator('summary')).toContainText('Acima do previsto');
  const resumo = page.locator('.resumo-orcamento');
  await expect(resumo).toContainText('1 000 000,00 Kz');
  await expect(resumo).toContainText('100 000,00 Kz');
  await expect(resumo).toContainText('1 100 000,00 Kz');
  await expect(page.getByText('O real já passa o previsto das rubricas em 50 000,00 Kz: está a gastar a contingência.')).toBeVisible();

  // Valor inválido: erro junto ao campo.
  await sala.getByLabel('Valor real (Kz)').fill('mil');
  await sala.getByRole('button', { name: 'Guardar' }).click();
  await expect(sala.getByText('Indique um valor em Kwanza (ex.: 250 000 ou 1 500 000,50).')).toBeVisible();

  // Sem contingência, passa a excedido.
  await page.getByLabel('Contingência (%)').fill('0');
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  await expect(page.getByRole('alert')).toHaveText('O real passa o previsto e toda a contingência em 50 000,00 Kz.');

  // Rubrica nova, e removê-la.
  await page.getByText('Acrescentar rubrica', { exact: true }).first().click();
  const nova = page.locator('details', { has: page.getByRole('heading', { name: 'Acrescentar rubrica' }) });
  await nova.getByLabel('Categoria').selectOption('Transporte');
  await nova.getByLabel('Descrição').fill('Autocarro para jornalistas');
  await nova.getByLabel('Valor previsto (Kz)').fill('150 000');
  await nova.getByRole('button', { name: 'Acrescentar rubrica' }).click();
  const autocarro = page.locator('.rubrica', { hasText: 'Autocarro para jornalistas' });
  await expect(autocarro).toContainText('150 000,00 Kz');
  await expect(page.getByRole('heading', { name: 'Transporte' })).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await autocarro.locator('summary').click();
  await autocarro.getByRole('button', { name: 'Remover rubrica' }).click();
  await expect(autocarro).toHaveCount(0);

  // As obrigatórias não se removem.
  await expect(sala.getByRole('button', { name: 'Remover rubrica' })).toHaveCount(0);

  // De volta ao projecto: o resumo e o alerta.
  await page.getByRole('button', { name: 'Voltar ao projecto' }).click();
  await expect(page.getByText('Total previsto 1 000 000,00 Kz · Real 1 050 000,00 Kz')).toBeVisible();
});
