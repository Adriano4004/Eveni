// Funções de apoio partilhadas pelos testes no browser.
import { expect, type Page } from '@playwright/test';
import pg from 'pg';
import { hojeEmLuanda, somarDias } from '../src/shared/datas.js';
import { envValido } from '../tests/ajuda.js';

export const PALAVRA_PASSE = 'Kizomba-2026-evento';

// Conta nova com o e-mail já confirmado (directamente na base de dados de teste).
// Todos os testes registam contas a partir do mesmo IP: o contador de registos por IP é limpo antes de cada
// uma, para a soma de todos os testes não esbarrar no limite por hora (que tem os seus próprios testes).
export async function contaConfirmada(page: Page, nome: string): Promise<string> {
  const email = `${nome.toLowerCase()}.${Date.now()}@exemplo.ao`;
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  try {
    await cliente.query("delete from rate_limits where key like 'registo-ip:%'");
    await page.goto('/registo');
    await page.getByLabel('Nome').fill(nome);
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
    await page.getByRole('checkbox', { name: /aceito os termos/ }).check();
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByRole('heading', { name: `Olá, ${nome}` })).toBeVisible();
    await cliente.query('update users set email_verified_at = now() where email = $1', [email]);
  } finally {
    await cliente.end();
  }
  await page.reload();
  return email;
}

// Executa uma consulta na base de dados de teste (ex.: simular uma conta antiga).
export async function naBaseDeDados(sql: string, valores: unknown[] = []) {
  const cliente = new pg.Client({ connectionString: envValido.DATABASE_URL });
  await cliente.connect();
  try {
    await cliente.query(sql, valores);
  } finally {
    await cliente.end();
  }
}

export const emDias = (dias: number) => somarDias(hojeEmLuanda(), dias);

// Conta de administração (tem de estar em ADMINS, em playwright.config.ts), recriada do zero, com o e-mail
// confirmado e, se pedido, a verificação em dois passos activa.
export async function entrarComoAdmin(page: Page, email: string, doisFactores: boolean) {
  await naBaseDeDados('delete from users where email = $1', [email]);
  await naBaseDeDados("delete from rate_limits where key like 'registo-ip:%'");
  await page.goto('/registo');
  await page.getByLabel('Nome').fill('Adriano');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Palavra-passe').fill(PALAVRA_PASSE);
  await page.getByRole('checkbox', { name: /aceito os termos/ }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Adriano' })).toBeVisible();
  await naBaseDeDados(
    `update users set email_verified_at = now() ${doisFactores ? ", totp_enabled_at = now(), totp_secret = 'x'" : ''} where email = $1`,
    [email],
  );
  await page.reload();
}
