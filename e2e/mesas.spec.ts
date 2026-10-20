import { expect, test } from '@playwright/test';
import { contaConfirmada, emDias } from './ajuda.js';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

test('mesas: criar, sentar convidados com acompanhantes, aviso de lotação, tirar e apagar', async ({ page }) => {
  await contaConfirmada(page, 'Marta');
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByLabel('Nome do projecto').fill('Casamento');
  await page.getByLabel('Data do evento').fill(emDias(40));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();

  // Convidados: o Tio Zeca com 2 acompanhantes (ainda sem resposta: reserva 3 lugares) e a Prima Lú.
  await page.getByRole('button', { name: 'Ver convidados' }).click();
  await page.getByLabel('Linhas copiadas do Excel').fill('Nome\tAcompanhantes\nTio Zeca\t2\nPrima Lú\t0\nAvó Rosa\t0');
  await page.getByRole('button', { name: 'Importar 3 convidados' }).click();
  await expect(page.getByText('3 convidados importados.')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao projecto' }).click();

  await page.getByRole('button', { name: 'Mesas' }).click();
  await expect(page.getByRole('heading', { name: 'Mesas', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Ainda não há mesas.')).toBeVisible();

  // Várias de uma vez e uma com nome.
  await page.getByLabel('Quantas mesas').fill('2');
  await page.getByLabel('Lugares').nth(1).fill('4');
  await page.getByRole('button', { name: 'Criar mesas', exact: true }).last().click();
  await page.getByLabel('Nome da mesa').fill('Mesa dos noivos');
  await page.getByLabel('Lugares').first().fill('2');
  await page.getByRole('button', { name: 'Criar mesa', exact: true }).click();
  const mesas = page.locator('.mesas > li');
  await expect(mesas).toHaveCount(3);
  await expect(mesas.locator('h3')).toHaveText(['Mesa 1', 'Mesa 2', 'Mesa dos noivos']);

  // Sentar: o Tio Zeca ocupa 3 lugares.
  await page.getByLabel('Mesa de Tio Zeca').selectOption({ label: 'Mesa 1 (0 de 4 lugares)' });
  const mesa1 = mesas.filter({ has: page.getByRole('heading', { name: 'Mesa 1' }) });
  await expect(mesa1).toContainText('Tio Zeca');
  await expect(mesa1).toContainText('3 de 4 lugares');
  // Mais uma pessoa enche; outra passa da lotação (permitido, com aviso).
  await page.getByLabel('Mesa de Prima Lú').selectOption({ label: 'Mesa 1 (3 de 4 lugares)' });
  await page.getByLabel('Mesa de Avó Rosa').selectOption({ label: 'Mesa 1 (4 de 4 lugares)' });
  await expect(mesa1).toContainText('Passa da lotação: 5 pessoas para 4 lugares');
  await expect(page.getByText('Todos os convidados que vão (ou ainda não responderam) já têm mesa.')).toBeVisible();

  // Tirar da mesa.
  await mesa1.getByRole('button', { name: 'Tirar Avó Rosa da mesa' }).click();
  await expect(mesa1).toContainText('4 de 4 lugares');
  await expect(page.getByLabel('Mesa de Avó Rosa')).toBeVisible();

  // Apagar a mesa: os convidados ficam sem mesa.
  page.once('dialog', (d) => d.accept());
  await mesa1.getByText('Alterar ou apagar a mesa').click();
  await mesa1.getByRole('button', { name: 'Apagar mesa' }).click();
  await expect(mesas).toHaveCount(2);
  await expect(page.getByLabel('Mesa de Tio Zeca')).toBeVisible();
  await expect(page.locator('.totais-convidados')).toHaveText('2 mesas · 0 de 6 lugares ocupados · 3 convidados sem mesa');
});
