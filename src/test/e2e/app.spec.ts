import { test, expect } from '@playwright/test';

/**
 * Testes E2E para funcionalidade básica do App
 */
test.describe('Funcionalidade do App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Aguardar o React carregar completamente
    await page.waitForTimeout(2000);
  });

  test('deve renderizar a aplicação inicialmente', async ({ page }) => {
    // Verificar que o root está visível e tem conteúdo
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    const rootContent = await root.innerHTML();
    expect(rootContent.length).toBeGreaterThan(0);
  });

  test('deve ter estrutura HTML válida', async ({ page }) => {
    // Verificar meta tags essenciais
    const charset = await page.locator('meta[charset]').count();
    expect(charset).toBeGreaterThan(0);

    const viewport = await page.locator('meta[name="viewport"]').count();
    expect(viewport).toBeGreaterThan(0);

    // Verificar título
    const title = await page.title();
    expect(title).toContain('Gesttor');
  });

  test('deve carregar recursos sem erros de rede', async ({ page }) => {
    let hasNetworkErrors = false;

    page.on('response', response => {
      // Verificar apenas recursos locais
      const url = response.url();
      if (response.status() >= 400 && !url.includes('aistudiocdn.com') && !url.includes('fonts.googleapis.com')) {
        hasNetworkErrors = true;
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    expect(hasNetworkErrors).toBe(false);
  });

  test('deve ter CSS aplicado corretamente', async ({ page }) => {
    // Verificar que estilos estão sendo aplicados
    const body = page.locator('body');
    const backgroundColor = await body.evaluate(el => window.getComputedStyle(el).backgroundColor);

    // Deve ter uma cor de fundo definida
    expect(backgroundColor).toBeTruthy();
    expect(backgroundColor).not.toBe('transparent');
  });

  test('deve ter JavaScript funcionando', async ({ page }) => {
    // Verificar que o React está funcionando
    // Tentando encontrar algum elemento renderizado pelo React
    const root = page.locator('#root');

    // Verificar que o root tem conteúdo renderizado
    const children = await root.locator('*').count();
    expect(children).toBeGreaterThan(0);
  });
});
