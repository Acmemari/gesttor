import { test, expect } from '@playwright/test';

/**
 * Testes E2E para tela de Cadastro de Clientes
 * Cobre: inclusão (criar), alteração (editar) e exclusão (deletar)
 *
 * Pré-requisito: usuário admin ou analista.
 * Configure E2E_USER_EMAIL e E2E_USER_PASSWORD no .env ou ambiente.
 *
 * Rodar: npx playwright test cadastro-clientes.spec.ts
 * Ou:   npx playwright test -g "Cadastro de Clientes"
 */
const E2E_EMAIL = process.env.E2E_USER_EMAIL || process.env.E2E_USER_MAIL;
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || process.env.E2E_USER_PASS;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('Cadastro de Clientes', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    if (E2E_EMAIL && E2E_PASSWORD) {
      const loginForm = page.locator('form').filter({ has: page.locator('input[type="email"]') });
      if (await loginForm.isVisible()) {
        await page.fill('input[type="email"]', E2E_EMAIL);
        await page.fill('input[type="password"]', E2E_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForTimeout(3000);
      }
    }
  });

  test('Inclusão: deve criar um novo cliente com sucesso', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    await page.getByRole('button', { name: /cadastros/i }).click();
    await page.waitForTimeout(500);

    const clientesCard = page
      .locator('button')
      .filter({ hasText: /clientes/i })
      .first();
    await clientesCard.click();
    await page.waitForTimeout(500);

    const novoBtn = page.getByRole('button', { name: /nova organização|cadastrar primeira organização/i });
    await novoBtn.click({ timeout: 8000 });

    const nomeInput = page.getByPlaceholder(/digite o nome da organização/i);
    await expect(nomeInput).toBeVisible({ timeout: 5000 });
    const nomeCliente = `Organização E2E ${Date.now()}`;
    await nomeInput.fill(nomeCliente);

    const emailInput = page.getByPlaceholder(/organizacao@exemplo\.com/i);
    await emailInput.fill(`e2e-${Date.now()}@teste.com`);

    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('44999641122');

    const submitBtn = page.getByRole('button', { name: /cadastrar/i });
    await submitBtn.click();

    await expect(page.getByText(/organização cadastrada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeCliente)).toBeVisible({ timeout: 5000 });
  });

  test('Alteração: deve editar um cliente existente com sucesso', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    await page.getByRole('button', { name: /cadastros/i }).click();
    await page.waitForTimeout(500);

    const clientesCard = page
      .locator('button')
      .filter({ hasText: /clientes/i })
      .first();
    await clientesCard.click();
    await page.waitForTimeout(1500);

    const editBtn = page.getByTitle(/editar/i).first();
    if (!(await editBtn.isVisible({ timeout: 3000 }))) {
      test.skip(true, 'Nenhum cliente para editar - rode o teste de inclusão antes');
      return;
    }
    await editBtn.click();

    const nomeInput = page.getByPlaceholder(/digite o nome da organização/i);
    await expect(nomeInput).toBeVisible({ timeout: 5000 });
    const nomeAtualizado = `Organização Editada E2E ${Date.now()}`;
    await nomeInput.clear();
    await nomeInput.fill(nomeAtualizado);

    const submitBtn = page.getByRole('button', { name: /atualizar/i });
    await submitBtn.click();

    await expect(page.getByText(nomeAtualizado)).toBeVisible({ timeout: 5000 });
  });

  test('Exclusão: deve excluir um cliente com confirmação', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    page.on('dialog', d => d.accept());

    await page.getByRole('button', { name: /cadastros/i }).click();
    await page.waitForTimeout(500);

    const clientesCard = page
      .locator('button')
      .filter({ hasText: /clientes/i })
      .first();
    await clientesCard.click();
    await page.waitForTimeout(1500);

    const deleteBtn = page.getByTitle(/excluir organização/i).first();
    if (!(await deleteBtn.isVisible({ timeout: 3000 }))) {
      test.skip(true, 'Nenhum cliente para excluir');
      return;
    }

    const rowToDelete = page.locator('tbody tr').first();
    const nameToDelete = (await rowToDelete.locator('td').first().innerText()).trim();
    await deleteBtn.click();

    await expect(page.getByText(new RegExp(escapeRegex(nameToDelete), 'i'))).not.toBeVisible({ timeout: 8000 });
  });

  test('Inclusão + Alteração + Exclusão: fluxo completo', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    page.on('dialog', d => d.accept());

    const sufixo = Date.now();
    const nomeCriado = `Organização Fluxo E2E ${sufixo}`;
    const nomeEditado = `Organização Fluxo Editada ${sufixo}`;

    await page.getByRole('button', { name: /cadastros/i }).click();
    await page.waitForTimeout(500);

    const clientesCard = page
      .locator('button')
      .filter({ hasText: /clientes/i })
      .first();
    await clientesCard.click();
    await page.waitForTimeout(800);

    // 1. Inclusão
    const novoBtn = page.getByRole('button', { name: /nova organização|cadastrar primeira organização/i });
    await novoBtn.click({ timeout: 8000 });

    await page.getByPlaceholder(/digite o nome da organização/i).fill(nomeCriado);
    await page.getByPlaceholder(/organizacao@exemplo\.com/i).fill(`fluxo-${sufixo}@teste.com`);
    await page.locator('input[type="tel"]').first().fill('44999641122');
    await page.getByRole('button', { name: /cadastrar/i }).click();

    await expect(page.getByText(/organização cadastrada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeCriado)).toBeVisible({ timeout: 5000 });

    // 2. Alteração
    await page
      .getByTitle(/editar/i)
      .first()
      .click();
    await page.waitForTimeout(500);

    const nomeInput = page.getByPlaceholder(/digite o nome da organização/i);
    await nomeInput.clear();
    await nomeInput.fill(nomeEditado);
    await page.getByRole('button', { name: /atualizar/i }).click();

    await expect(page.getByText(/organização atualizada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeEditado)).toBeVisible({ timeout: 5000 });

    // 3. Exclusão
    await page
      .getByTitle(/excluir organização/i)
      .first()
      .click();

    await expect(page.getByText(/exclu[ií]d[oa]s? com sucesso|removid/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeEditado)).not.toBeVisible({ timeout: 3000 });
  });

  test('Gestores: deve cadastrar, editar e excluir no formulário de cliente', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    page.on('dialog', d => d.accept());

    const sufixo = Date.now();
    const gestorNomeInicial = `Gestor Inicial ${sufixo}`;
    const gestorNomeEditado = `Gestor Editado ${sufixo}`;

    await page.getByRole('button', { name: /cadastros/i }).click();
    await page.waitForTimeout(500);
    await page
      .locator('button')
      .filter({ hasText: /clientes/i })
      .first()
      .click();
    await page.waitForTimeout(800);

    // Garantir que exista ao menos 1 cliente para editar
    const firstEditButton = page.getByTitle(/editar/i).first();
    if (!(await firstEditButton.isVisible({ timeout: 3000 }))) {
      const sufixoCliente = Date.now();
      await page
        .getByRole('button', { name: /nova organização|cadastrar primeira organização/i })
        .first()
        .click({ timeout: 8000 });
      await page.getByPlaceholder(/digite o nome da organização/i).fill(`Organização Base Gestor ${sufixoCliente}`);
      await page.getByPlaceholder(/organizacao@exemplo\.com/i).fill(`org-base-${sufixoCliente}@teste.com`);
      await page.locator('input[type="tel"]').first().fill('44999641122');
      await page.getByRole('button', { name: /cadastrar/i }).click();
      await expect(page.getByText(/organização cadastrada com sucesso/i)).toBeVisible({ timeout: 8000 });
    }

    const targetClientName = (await page.locator('tbody tr').first().locator('td').first().innerText()).trim();

    // 1) Cadastro de gestor (na tela)
    await page
      .locator('tbody tr')
      .filter({ hasText: targetClientName })
      .first()
      .getByTitle(/editar/i)
      .click();

    while ((await page.getByTitle(/remover proprietário/i).count()) > 0) {
      await page
        .getByTitle(/remover proprietário/i)
        .first()
        .click();
    }

    if (await page.getByText(/Nenhum proprietário gestor cadastrado\./i).isVisible()) {
      await page.getByRole('button', { name: /Adicionar primeiro proprietário/i }).click();
    } else {
      await page.getByRole('button', { name: /^Adicionar$/i }).click();
    }

    const ownerNameInput = page.getByPlaceholder('Nome', { exact: true }).first();
    await expect(ownerNameInput).toBeVisible({ timeout: 5000 });
    await ownerNameInput.fill(gestorNomeInicial);

    // 2) Edição de gestor (na tela)
    await ownerNameInput.fill(gestorNomeEditado);

    // 3) Exclusão de gestor (na tela)
    await page.getByTitle(/remover proprietário/i).click();
    await expect(page.getByText(/Nenhum proprietário gestor cadastrado\./i)).toBeVisible({ timeout: 5000 });

    // Salva o cliente ao final do fluxo validado na tela
    await page.getByRole('button', { name: /atualizar/i }).click();
    await expect(page.getByText(/organização atualizada com sucesso/i)).toBeVisible({ timeout: 8000 });
  });
});
