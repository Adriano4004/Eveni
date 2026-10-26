import { expect, test } from '@playwright/test';
import { contaConfirmada, entrarComoAdmin } from './ajuda.js';

// Pagamento por transferência (decisão 029), do pedido do cliente à confirmação na administração.
const ADMIN = 'admin.pagamentos.e2e@exemplo.ao';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

// Um PDF mínimo, só para o comprovativo.
const PDF = { name: 'comprovativo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% comprovativo de teste\n') };

test('o cliente pede o Empresarial anual, envia o comprovativo e o administrador confirma', async ({ browser, page }) => {
  await contaConfirmada(page, 'Olga');
  await page.getByRole('button', { name: 'Plano e pagamentos' }).click();
  await expect(page.getByRole('heading', { name: 'Plano e pagamentos' })).toBeVisible();
  await expect(page.getByText('Singular · sem data de fim')).toBeVisible();

  await page.getByRole('radio', { name: /Empresarial/ }).check();
  await page.getByRole('radio', { name: /Anual/ }).check();
  await page.getByRole('button', { name: 'Continuar para o pagamento' }).click();

  await expect(page.getByRole('heading', { name: 'Pague por transferência' })).toBeVisible();
  await expect(page.getByText(/3\s996\s000,00\sKz/)).toBeVisible();
  await expect(page.getByText('AO06 0055 0000 4633 3338 1012 8')).toBeVisible();
  const referencia = (await page.locator('dd strong').textContent())!;
  expect(referencia).toMatch(/^EVN-\d{4}-\d{5}$/);

  await page.getByLabel('Enviar comprovativo').setInputFiles(PDF);
  await expect(page.getByRole('status')).toContainText('Recebemos o comprovativo');
  await expect(page.getByText('Enviar outro comprovativo')).toBeVisible();

  // O administrador vê o pagamento, descarrega o comprovativo e confirma.
  const admin = await (await browser.newContext()).newPage();
  await entrarComoAdmin(admin, ADMIN, true);
  await admin.getByRole('button', { name: 'Administração' }).click();
  await expect(admin.getByRole('heading', { name: 'Pagamentos por confirmar' })).toBeVisible();
  const linha = admin.locator('li.convidado', { hasText: referencia });
  await linha.locator('summary').click();
  const [descarga] = await Promise.all([admin.waitForEvent('download'), linha.getByRole('link', { name: 'Ver comprovativo' }).click()]);
  expect(descarga.suggestedFilename()).toBe(`comprovativo-${referencia}.pdf`);
  await linha.getByRole('button', { name: 'Confirmar pagamento' }).click();
  await expect(linha.getByRole('status')).toContainText('Pagamento confirmado. Plano activo até');

  // O cliente vê o plano activo, com data de fim, e o pagamento no histórico.
  await page.reload();
  await expect(page.getByText(/^Empresarial · até \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  await expect(page.locator('li.convidado', { hasText: referencia })).toContainText('Confirmado');
  await expect(page.getByRole('button', { name: 'Continuar para o pagamento' })).toBeVisible();
});

test('o cliente cancela um pedido e o administrador recusa outro com motivo', async ({ browser, page }) => {
  await contaConfirmada(page, 'Paulo');
  await page.goto('/conta/plano');
  await page.getByRole('button', { name: 'Continuar para o pagamento' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancelar este pedido' }).click();
  await expect(page.locator('li.convidado')).toContainText('Cancelado');

  await page.getByRole('button', { name: 'Continuar para o pagamento' }).click();
  const referencia = (await page.locator('dd strong').textContent())!;
  await page.getByLabel('Enviar comprovativo').setInputFiles(PDF);
  await expect(page.getByRole('status')).toContainText('Recebemos o comprovativo');

  const admin = await (await browser.newContext()).newPage();
  await entrarComoAdmin(admin, ADMIN, true);
  await admin.goto('/admin');
  const linha = admin.locator('li.convidado', { hasText: referencia });
  await linha.locator('summary').click();
  await linha.getByRole('button', { name: 'Recusar' }).click();
  await expect(linha.getByText('Indique o motivo da recusa.')).toBeVisible();
  await linha.getByLabel('Motivo da recusa (o cliente vai lê-lo)').fill('O valor transferido não corresponde.');
  await linha.getByRole('button', { name: 'Recusar' }).click();
  await expect(linha.getByRole('status')).toHaveText('Pagamento recusado. O cliente foi avisado.');

  await page.reload();
  await expect(page.locator('li.convidado', { hasText: referencia })).toContainText('Motivo: O valor transferido não corresponde.');
  await expect(page.getByText('Singular · sem data de fim')).toBeVisible();
});
