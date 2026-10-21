import { expect, test } from '@playwright/test';
import pg from 'pg';
import { envValido } from '../tests/ajuda.js';
import { contaConfirmada } from './ajuda.js';

test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) throw new Error(`Erro na consola: ${m.text()}`);
  });
});

test('marca nos relatórios: indisponível no Singular; no Empresarial, logótipo, cor e rodapé', async ({ page }) => {
  await contaConfirmada(page, 'Sara');
  await page.getByRole('button', { name: 'Marca nos relatórios' }).click();
  await expect(page.getByText(/incluída nos planos Empresarial e Grandes/)).toBeVisible();

  // Passa ao plano Empresarial (directamente na base de dados de teste).
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  await cliente.query(
    `update workspaces set plan_code = 'empresarial' where id = (select wm.workspace_id from workspace_members wm join users u on u.id = wm.user_id
       where u.name = 'Sara' order by u.created_at desc limit 1)`,
  );
  await cliente.end();
  await page.reload();

  await expect(page.getByText('Ainda sem logótipo.')).toBeVisible();
  await page.getByLabel('Escolher imagem').setInputFiles('tests/imagens/logo.png');
  await expect(page.getByRole('img', { name: 'Logótipo actual' })).toBeVisible();

  await page.getByLabel('Cor principal', { exact: true }).fill('#C2410C');
  await page.getByLabel('Texto do rodapé').fill('Agência X · agenciax.ao');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Cor principal', { exact: true })).toHaveValue('#c2410c');
  await expect(page.getByLabel('Texto do rodapé')).toHaveValue('Agência X · agenciax.ao');

  // Um ficheiro que não é imagem é recusado logo no telemóvel.
  await page.getByLabel('Escolher imagem').setInputFiles({ name: 'nota.txt', mimeType: 'text/plain', buffer: Buffer.from('olá') });
  await expect(page.getByRole('alert')).toHaveText('Escolha uma imagem PNG ou JPG.');

  await page.getByRole('button', { name: 'Remover logótipo' }).click();
  await expect(page.getByText('Ainda sem logótipo.')).toBeVisible();
});
