import { expect, test } from '@playwright/test';

test('a página inicial abre no telemóvel com o logo e a mensagem', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));
  await page.goto('/');
  await expect(page.getByRole('img', { name: /Eveni/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Estamos a preparar a nova versão do Eveni.');
  // Sem erros de consola (por exemplo, bloqueios da CSP).
  expect(erros).toEqual([]);
});
