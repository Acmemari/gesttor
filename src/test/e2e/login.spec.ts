import { test, expect } from '@playwright/test';

/**
 * Testes E2E para a tela de Login
 *
 * Pré-requisito para testes autenticados:
 * Configure E2E_USER_EMAIL e E2E_USER_PASSWORD no .env ou ambiente.
 *
 * Rodar: npx playwright test login.spec.ts
 * Ou:    npx playwright test -g "Login"
 */
const E2E_EMAIL = process.env.TEST_EMAIL;
const E2E_PASSWORD = process.env.TEST_PASSWORD;

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('deve exibir o formulário de login por padrão', async ({ page }) => {
    await expect(page.getByText('Acesse sua conta')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('deve exibir o botão de login com Google', async ({ page }) => {
    await expect(page.getByText(/Continuar com Google/i)).toBeVisible({ timeout: 5000 });
  });

  test('deve alternar para o modo de cadastro', async ({ page }) => {
    await page.getByRole('button', { name: /Cadastrar/i }).first().click();
    await expect(page.getByText('Criar nova conta')).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder(/Seu nome completo/i)).toBeVisible();
  });

  test('deve voltar para o modo de login a partir do cadastro', async ({ page }) => {
    await page.getByRole('button', { name: /Cadastrar/i }).first().click();
    await expect(page.getByText('Criar nova conta')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Entrar/i }).first().click();
    await expect(page.getByText('Acesse sua conta')).toBeVisible({ timeout: 5000 });
  });

  test('deve desabilitar o submit de cadastro com senha curta', async ({ page }) => {
    await page.getByRole('button', { name: /Cadastrar/i }).first().click();

    await expect(page.getByPlaceholder(/Seu nome completo/i)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    await page.getByPlaceholder(/Seu nome completo/i).fill('Usuário Teste');
    await page.locator('input[type="email"]').fill('teste@example.com');
    await page.locator('input[type="password"]').first().fill('12345'); // menos de 6 caracteres

    const submitBtn = page.getByRole('button', { name: /Cadastrar/i }).last();
    await expect(submitBtn).toBeDisabled();
  });

  test('deve exibir erro ao tentar login com credenciais inválidas', async ({ page }) => {
    await page.locator('input[type="email"]').fill('invalido@example.com');
    await page.locator('input[type="password"]').fill('senhaerrada');
    await page.locator('button[type="submit"]').click();

    await expect(
      page.getByText(/email ou senha inválidos/i),
    ).toBeVisible({ timeout: 8000 });
  });

  test('deve fazer login com credenciais válidas e redirecionar', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure TEST_EMAIL e TEST_PASSWORD no .env para rodar este teste');

    await page.locator('input[type="email"]').fill(E2E_EMAIL!);
    await page.locator('input[type="password"]').fill(E2E_PASSWORD!);
    await page.locator('button[type="submit"]').click();

    // Após login bem-sucedido o app redireciona para a raiz
    await page.waitForURL('/', { timeout: 10000 });
    await expect(page).toHaveURL('/');
  });

  test('deve manter o email digitado ao alternar entre login e cadastro', async ({ page }) => {
    const email = 'persistente@example.com';
    await page.locator('input[type="email"]').fill(email);

    await page.getByRole('button', { name: /Cadastrar/i }).first().click();
    await expect(page.getByText('Criar nova conta')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Entrar/i }).first().click();
    await expect(page.locator('input[type="email"]')).toHaveValue(email);
  });
});
