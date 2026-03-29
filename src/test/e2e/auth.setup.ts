import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  setup.skip(!email || !password, 'Configure TEST_EMAIL e TEST_PASSWORD');

  await page.goto('/sign-in');
  await page.waitForLoadState('load');

  await page.fill('input[type="email"]', email!);
  await page.fill('input[type="password"]', password!);
  await page.click('button[type="submit"]');

  // Neon cold-start pode levar até ~60s na primeira requisição
  await page.waitForURL('/', { timeout: 90000 });
  await expect(page.locator('button[title="Cadastros"]')).toBeVisible({ timeout: 15000 });

  // Salva o estado de autenticação (cookies + localStorage) para reusar nos testes
  await page.context().storageState({ path: authFile });
});
