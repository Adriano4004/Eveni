import { expect, type Page, test } from '@playwright/test';
import pg from 'pg';
import { formatarData, hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { envValido } from '../tests/ajuda.js';

const PALAVRA_PASSE = 'Kizomba-2026-evento';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

// Conta nova com o e-mail já confirmado (directamente na base de dados de teste).
async function contaConfirmada(page: Page, nome: string) {
  const email = `${nome.toLowerCase()}.${Date.now()}@exemplo.ao`;
  await page.goto('/registo');
  await page.getByLabel('Nome').fill(nome);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: `Olá, ${nome}` })).toBeVisible();
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  await cliente.query('update users set email_verified_at = now() where email = $1', [email]);
  await cliente.end();
  await page.reload();
}

const emDias = (dias: number) => somarDias(hojeEmLuanda(), dias);

test('sem e-mail confirmado, não aparece o botão de criar projecto', async ({ page }) => {
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Dora');
  await page.getByLabel('E-mail').fill(`dora.${Date.now()}@exemplo.ao`);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Para criar projectos, confirme primeiro o seu e-mail.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo projecto' })).toHaveCount(0);
});

test('criar uma conferência de imprensa com pouco tempo: avisos, confirmação e tarefas com notas', async ({ page }) => {
  await contaConfirmada(page, 'Elsa');
  await expect(page.getByText(/Ainda não tem projectos/)).toBeVisible();
  await page.getByRole('button', { name: 'Novo projecto' }).click();

  await expect(page.getByRole('heading', { name: 'Novo projecto' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Conferência de Imprensa/ })).toBeChecked();
  await page.getByLabel('Nome do projecto').fill('Apresentação <b>da campanha</b>');
  await page.getByLabel('Local (opcional)').fill('Centro de Imprensa, Luanda');

  // Com tempo suficiente, sem avisos.
  await page.getByLabel('Data do evento').fill(emDias(30));
  await expect(page.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();

  // Com 7 dias: comprime e avisa das críticas, antes de criar.
  await page.getByLabel('Data do evento').fill(emDias(7));
  await expect(page.getByText(/Faltam 7 dias e este tipo de projecto pede 21/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tarefas críticas sem tempo suficiente' })).toBeVisible();
  await expect(page.getByText('Validar que existe facto novo')).toBeVisible();

  // Sem confirmar os avisos, não cria.
  await page.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(page.getByText('Confirme que leu os avisos sobre as tarefas críticas.')).toBeVisible();

  await page.getByLabel('Li os avisos e quero criar o projecto assim.').check();
  await page.getByRole('button', { name: 'Criar projecto' }).click();

  // O nome aparece como texto, sem interpretar HTML.
  await expect(page.getByRole('heading', { name: 'Apresentação <b>da campanha</b>' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: formatarData(emDias(7)) })).toBeVisible();
  await expect(page.getByText('Centro de Imprensa, Luanda')).toBeVisible();
  await expect(page.getByText('0 de 47 tarefas concluídas')).toBeVisible();

  // A nota aparece em destaque ao abrir a tarefa.
  const tarefa = page.locator('details', { hasText: 'Validar que existe facto novo' });
  await expect(tarefa.getByText('Se não há notícia, não há conferência.', { exact: false })).toBeHidden();
  await tarefa.locator('summary').click();
  await expect(tarefa.getByText(/Se não há notícia, não há conferência\./)).toBeVisible();
  await expect(tarefa.getByText('Crítica')).toBeVisible();

  // Rubricas do orçamento a zero, em Kwanza.
  await expect(page.getByText('Aluguer de sala')).toBeVisible();
  await expect(page.getByText('Previsto: 0,00 Kz').first()).toBeVisible();

  // De volta ao início: o projecto está na lista e o plano Singular já não deixa criar outro.
  await page.getByRole('button', { name: 'Voltar ao início' }).click();
  await expect(page.getByRole('link', { name: /Apresentação <b>da campanha<\/b>/ })).toBeVisible();
  await expect(page.getByText('O plano Singular permite 1 projecto. Para criar mais, mude para o plano Empresarial.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo projecto' })).toHaveCount(0);

  // Recarregar o endereço do projecto abre-o directamente.
  await page.getByRole('link', { name: /Apresentação/ }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Apresentação <b>da campanha</b>' })).toBeVisible();
});

test('não é possível abrir o projecto de outra pessoa', async ({ browser }) => {
  const dona = await (await browser.newContext()).newPage();
  await contaConfirmada(dona, 'Fatima');
  await dona.getByRole('button', { name: 'Novo projecto' }).click();
  await dona.getByLabel('Nome do projecto').fill('Projecto privado');
  await dona.getByLabel('Data do evento').fill(emDias(40));
  await expect(dona.getByText('Há tempo para todas as tarefas nos prazos recomendados.')).toBeVisible();
  await dona.getByRole('button', { name: 'Criar projecto' }).click();
  await expect(dona.getByRole('heading', { name: 'Projecto privado' })).toBeVisible();
  const endereco = dona.url();

  const outra = await (await browser.newContext()).newPage();
  await contaConfirmada(outra, 'Gil');
  await outra.goto(endereco);
  await expect(outra.getByRole('alert')).toHaveText('Projecto não encontrado.');
  await expect(outra.getByText('Projecto privado')).toHaveCount(0);
});
