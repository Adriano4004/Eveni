import { expect, type Page, test } from '@playwright/test';
import { contaConfirmada, emDias } from './ajuda.js';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

async function projectoNovo(page: Page, nome: string) {
  await page.getByRole('button', { name: 'Novo projecto' }).click();
  await page.getByLabel('Nome do projecto').fill(nome);
  await page.getByLabel('Data do evento').fill(emDias(40));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();
}

test('lista de convidados: acrescentar, importar do Excel, procurar, marcar resposta e remover', async ({ page }) => {
  await contaConfirmada(page, 'Helena');
  await projectoNovo(page, 'Lançamento do livro');
  await expect(page.getByText('Ainda sem convidados.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver convidados' }).click();

  await expect(page.getByRole('heading', { name: 'Convidados', exact: true })).toBeVisible();
  await expect(page.locator('.totais-convidados')).toHaveText(/^0 convidados/);

  // Um a um. O nome aparece como texto, sem interpretar HTML.
  // Com a lista vazia, os formulários já vêm abertos.
  const formulario = page.locator('details', { has: page.getByRole('heading', { name: 'Acrescentar convidado' }) });
  await formulario.getByLabel('Nome').fill('Ana <b>Silva</b>');
  await formulario.getByLabel('Telemóvel').fill('923 456 789');
  await formulario.getByLabel('Acompanhantes permitidos').fill('2');
  await formulario.getByRole('button', { name: 'Acrescentar convidado' }).click();
  const ana = page.locator('.convidado', { hasText: 'Ana <b>Silva</b>' });
  await expect(ana).toContainText('+244 923 456 789');
  await expect(ana).toContainText('até 2 acompanhantes');
  await expect(formulario.getByLabel('Nome')).toHaveValue('');

  // O mesmo telemóvel, escrito de outra forma: recusado junto ao campo.
  await formulario.getByLabel('Nome').fill('Outra pessoa');
  await formulario.getByLabel('Telemóvel').fill('+244923456789');
  await formulario.getByRole('button', { name: 'Acrescentar convidado' }).click();
  await expect(formulario.getByText('Já existe um convidado com este telemóvel neste projecto.')).toBeVisible();

  // Colar do Excel: com títulos, uma linha repetida e uma com problemas.
  const importar = page.locator('details', { has: page.getByRole('heading', { name: 'Importar do Excel' }) });
  await importar
    .getByLabel('Linhas copiadas do Excel')
    .fill('Nome\tContacto\tE-mail\tAcompanhantes\nBruno Neto\t924 000 111\tbruno@exemplo.ao\t1\nRepetida\t923456789\t\t\nCarla\t12\t\t\nJoão Faria\t\t\t');
  await expect(importar.getByText('3 convidados prontos a importar.')).toBeVisible();
  await expect(importar.getByText(/Linha 4: Indique um telemóvel válido/)).toBeVisible();
  await importar.getByRole('button', { name: 'Importar 3 convidados' }).click();
  await expect(importar.getByText('2 convidados importados.')).toBeVisible();
  await expect(importar.getByText('Linha 3: Repetida')).toBeVisible();
  await expect(page.locator('.totais-convidados')).toHaveText(/^3 convidados · 0 vão/);

  // Procurar sem acentos.
  await page.getByLabel('Procurar pelo nome').fill('joao');
  await expect(page.locator('.convidado')).toHaveCount(1);
  await expect(page.getByText('A mostrar 1 de 3')).toBeVisible();
  await page.getByLabel('Procurar pelo nome').fill('');

  // Marcar à mão que o Bruno vai, com o acompanhante.
  const bruno = page.locator('.convidado', { hasText: 'Bruno Neto' });
  await bruno.locator('summary').click();
  await bruno.getByLabel('Resposta').selectOption({ label: 'Vai' });
  await bruno.getByLabel('Acompanhantes confirmados').fill('1');
  await bruno.getByRole('button', { name: 'Guardar' }).click();
  await expect(bruno.getByText('Guardado.')).toBeVisible();
  await expect(bruno.locator('summary')).toContainText('Vai');
  await expect(page.locator('.totais-convidados')).toHaveText(/^3 convidados · 1 vai \(2 pessoas, com acompanhantes\)/);

  await page.getByLabel('Resposta', { exact: true }).first().selectOption({ label: 'Vai' });
  await expect(page.locator('.convidado')).toHaveCount(1);
  await page.getByLabel('Resposta', { exact: true }).first().selectOption({ label: 'Todas' });

  // Remover (com confirmação).
  page.once('dialog', (d) => d.accept());
  const joao = page.locator('.convidado', { hasText: 'João Faria' });
  await joao.locator('summary').click();
  await joao.getByRole('button', { name: 'Remover' }).click();
  await expect(joao).toHaveCount(0);
  await expect(page.locator('.totais-convidados')).toHaveText(/^2 convidados/);

  // Ao voltar com a lista já preenchida, os formulários vêm fechados e a lista fica à vista.
  await page.reload();
  await expect(page.getByLabel('Linhas copiadas do Excel')).toBeHidden();
  await page.getByText('Importar do Excel').click();
  await expect(page.getByLabel('Linhas copiadas do Excel')).toBeVisible();

  // O projecto mostra quantos convidados há.
  await page.getByRole('button', { name: 'Voltar ao projecto' }).click();
  await expect(page.getByText('2 convidados.')).toBeVisible();
});

test('não é possível ver os convidados do projecto de outra pessoa', async ({ browser }) => {
  const dona = await (await browser.newContext()).newPage();
  await contaConfirmada(dona, 'Ines');
  await projectoNovo(dona, 'Gala privada');
  await dona.getByRole('button', { name: 'Ver convidados' }).click();
  const formulario = dona.locator('details', { has: dona.getByRole('heading', { name: 'Acrescentar convidado' }) });
  await formulario.getByLabel('Nome').fill('Convidado secreto');
  await formulario.getByRole('button', { name: 'Acrescentar convidado' }).click();
  await expect(dona.locator('.convidado', { hasText: 'Convidado secreto' })).toBeVisible();
  const endereco = dona.url();

  const outra = await (await browser.newContext()).newPage();
  await contaConfirmada(outra, 'Jorge');
  await outra.goto(endereco);
  await expect(outra.getByRole('alert')).toHaveText('Projecto não encontrado.');
  await expect(outra.getByText('Convidado secreto')).toHaveCount(0);
});
