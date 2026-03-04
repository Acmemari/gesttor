import { test, expect, Page } from '@playwright/test';

/**
 * Testes E2E para tela de Cadastro de Fazendas
 * Cobre: inclusão (criar), alteração (editar), exclusão (deletar) e validações
 *
 * Pré-requisito: usuário admin ou analista com ao menos 1 cliente cadastrado.
 * Configure E2E_USER_EMAIL e E2E_USER_PASSWORD no .env ou ambiente.
 *
 * Rodar: npx playwright test cadastro-fazendas.spec.ts
 * Ou:   npx playwright test -g "Cadastro de Fazendas"
 */
const E2E_EMAIL = process.env.E2E_USER_EMAIL || process.env.E2E_USER_MAIL;
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD || process.env.E2E_USER_PASS;

function inputByLabel(page: Page, labelText: RegExp) {
  return page.locator('label', { hasText: labelText }).locator('..').locator('input, select').first();
}

test.describe('Cadastro de Fazendas', () => {
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

  async function ensureClientSelected(page: Page) {
    await page.waitForTimeout(2000);

    const noClients = page.getByText(/sem organizações/i);
    if (await noClients.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByRole('button', { name: /cadastros/i }).click();
      await page.waitForTimeout(500);
      await page
        .locator('button')
        .filter({ hasText: /organizações/i })
        .first()
        .click();
      await page.waitForTimeout(500);

      await page.getByRole('button', { name: /nova organização|cadastrar primeira organização/i }).click({ timeout: 8000 });
      await page.getByPlaceholder(/digite o nome da organização/i).fill(`Organização Base Fazenda ${Date.now()}`);
      await page.getByPlaceholder(/organizacao@exemplo\.com/i).fill(`fazenda-e2e-${Date.now()}@teste.com`);
      await page.locator('input[type="tel"]').first().fill('44999641122');
      await page.getByRole('button', { name: /cadastrar/i }).click();
      await expect(page.getByText(/organização cadastrada com sucesso/i)).toBeVisible({ timeout: 8000 });
      await page.waitForTimeout(2000);
    }
  }

  async function navigateToFazendas(page: Page) {
    await page.getByRole('button', { name: /cadastros/i }).click();
    await page.waitForTimeout(500);
    await page
      .locator('button')
      .filter({ hasText: /fazendas/i })
      .first()
      .click();
    await page.waitForTimeout(1000);
  }

  async function switchToListView(page: Page) {
    const cancelBtn = page.getByRole('button', { name: /^cancelar$/i });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  async function fillFarmForm(
    page: Page,
    data: {
      name: string;
      productionSystem?: string;
      propertyType?: string;
      state?: string;
      city?: string;
      country?: string;
      totalArea?: string;
      pastureArea?: string;
      agricultureArea?: string;
      otherCrops?: string;
      infrastructure?: string;
      reserveAndAPP?: string;
      propertyValue?: string;
      averageHerd?: string;
      herdValue?: string;
      commercializesGenetics?: boolean;
    },
  ) {
    const nameInput = page.getByPlaceholder('Ex: Fazenda Santa Maria');
    await nameInput.clear();
    await nameInput.fill(data.name);

    if (data.propertyType) {
      await inputByLabel(page, /tipo de propriedade/i).selectOption(data.propertyType);
    }

    if (data.productionSystem) {
      await inputByLabel(page, /sistema de produção/i).selectOption(data.productionSystem);
    }

    if (data.country) {
      await inputByLabel(page, /^país$/i).selectOption(data.country);
      await page.waitForTimeout(300);
    }

    if (data.state) {
      await inputByLabel(page, /^estado/i).selectOption(data.state);
    }

    if (data.city) {
      const cityInput = page.getByPlaceholder('Digite a cidade');
      await cityInput.clear();
      await cityInput.fill(data.city);
    }

    const areaInputs = page.getByPlaceholder('0,00');
    if (data.totalArea) {
      await areaInputs.nth(0).clear();
      await areaInputs.nth(0).fill(data.totalArea);
    }
    if (data.pastureArea) {
      await areaInputs.nth(1).clear();
      await areaInputs.nth(1).fill(data.pastureArea);
    }
    if (data.agricultureArea) {
      await areaInputs.nth(2).clear();
      await areaInputs.nth(2).fill(data.agricultureArea);
    }
    if (data.otherCrops) {
      await areaInputs.nth(3).clear();
      await areaInputs.nth(3).fill(data.otherCrops);
    }
    if (data.infrastructure) {
      await areaInputs.nth(4).clear();
      await areaInputs.nth(4).fill(data.infrastructure);
    }
    if (data.reserveAndAPP) {
      await areaInputs.nth(5).clear();
      await areaInputs.nth(5).fill(data.reserveAndAPP);
    }

    if (data.propertyValue) {
      const propValueInput = inputByLabel(page, /valor da propriedade/i);
      await propValueInput.clear();
      await propValueInput.fill(data.propertyValue);
      await page.waitForTimeout(500);
    }

    if (data.averageHerd) {
      const herdInput = inputByLabel(page, /rebanho médio/i);
      await herdInput.clear();
      await herdInput.fill(data.averageHerd);
    }

    if (data.herdValue) {
      const herdValueInput = inputByLabel(page, /valor do rebanho/i);
      await herdValueInput.clear();
      await herdValueInput.fill(data.herdValue);
    }

    if (data.commercializesGenetics) {
      const checkbox = page.locator('input[type="checkbox"]');
      if (!(await checkbox.isChecked())) {
        await checkbox.check();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Inclusão
  // ---------------------------------------------------------------------------
  test('Inclusão: deve criar uma nova fazenda com sucesso', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    await ensureClientSelected(page);
    await navigateToFazendas(page);

    const nomeFazenda = `Fazenda E2E ${Date.now()}`;

    await fillFarmForm(page, {
      name: nomeFazenda,
      productionSystem: 'Ciclo Completo',
      state: 'Mato Grosso do Sul',
      city: 'Campo Grande',
      totalArea: '1000',
      pastureArea: '500',
      agricultureArea: '200',
      otherCrops: '100',
      infrastructure: '100',
      reserveAndAPP: '100',
      propertyValue: '1000000',
      averageHerd: '500',
      herdValue: '750000',
    });

    await page.getByRole('button', { name: /cadastrar fazenda/i }).click();

    await expect(page.getByText(/fazenda cadastrada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeFazenda)).toBeVisible({ timeout: 5000 });
  });

  // ---------------------------------------------------------------------------
  // 2. Alteração
  // ---------------------------------------------------------------------------
  test('Alteração: deve editar uma fazenda existente com sucesso', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    await ensureClientSelected(page);
    await navigateToFazendas(page);
    await switchToListView(page);

    const editBtn = page.getByRole('button', { name: /editar/i }).first();
    if (!(await editBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Nenhuma fazenda para editar - rode o teste de inclusão antes');
      return;
    }
    await editBtn.click();

    const nomeInput = page.getByPlaceholder('Ex: Fazenda Santa Maria');
    await expect(nomeInput).toBeVisible({ timeout: 5000 });
    const nomeAtualizado = `Fazenda Editada E2E ${Date.now()}`;
    await nomeInput.clear();
    await nomeInput.fill(nomeAtualizado);

    await page.getByRole('button', { name: /atualizar fazenda/i }).click();

    await expect(page.getByText(/fazenda atualizada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeAtualizado)).toBeVisible({ timeout: 5000 });
  });

  // ---------------------------------------------------------------------------
  // 3. Exclusão
  // ---------------------------------------------------------------------------
  test('Exclusão: deve excluir uma fazenda com confirmação', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    page.on('dialog', d => d.accept());

    await ensureClientSelected(page);
    await navigateToFazendas(page);
    await switchToListView(page);

    const editBtn = page.getByRole('button', { name: /editar/i }).first();
    if (!(await editBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'Nenhuma fazenda para excluir');
      return;
    }

    const firstFarmName = await page.locator('h3').first().innerText();

    const deleteBtn = editBtn.locator('..').locator('button').last();
    await deleteBtn.click();

    await expect(page.getByText(/fazenda excluída com sucesso/i)).toBeVisible({ timeout: 8000 });

    if (firstFarmName) {
      await expect(page.getByText(firstFarmName, { exact: true })).not.toBeVisible({ timeout: 5000 });
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Fluxo completo: Inclusão + Alteração + Exclusão
  // ---------------------------------------------------------------------------
  test('Inclusão + Alteração + Exclusão: fluxo completo', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    page.on('dialog', d => d.accept());

    const sufixo = Date.now();
    const nomeCriado = `Fazenda Fluxo E2E ${sufixo}`;
    const nomeEditado = `Fazenda Fluxo Editada ${sufixo}`;

    await ensureClientSelected(page);
    await navigateToFazendas(page);

    // ---- 1. Inclusão ----
    await fillFarmForm(page, {
      name: nomeCriado,
      productionSystem: 'Cria',
      state: 'Goiás',
      city: 'Goiânia',
      totalArea: '500',
      pastureArea: '300',
      agricultureArea: '100',
      otherCrops: '50',
      infrastructure: '25',
      reserveAndAPP: '25',
      propertyValue: '500000',
      averageHerd: '300',
      herdValue: '450000',
    });

    await page.getByRole('button', { name: /cadastrar fazenda/i }).click();

    await expect(page.getByText(/fazenda cadastrada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeCriado)).toBeVisible({ timeout: 5000 });

    // ---- 2. Alteração ----
    const farmCard = page.locator('div.rounded-lg').filter({ hasText: nomeCriado }).first();
    await farmCard.getByRole('button', { name: /editar/i }).click();
    await page.waitForTimeout(500);

    const nomeInput = page.getByPlaceholder('Ex: Fazenda Santa Maria');
    await nomeInput.clear();
    await nomeInput.fill(nomeEditado);

    const cityInput = page.getByPlaceholder('Digite a cidade');
    await cityInput.clear();
    await cityInput.fill('Anápolis');

    await page.getByRole('button', { name: /atualizar fazenda/i }).click();

    await expect(page.getByText(/fazenda atualizada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeEditado)).toBeVisible({ timeout: 5000 });

    // ---- 3. Exclusão ----
    const updatedCard = page.locator('div.rounded-lg').filter({ hasText: nomeEditado }).first();
    const editBtnInCard = updatedCard.getByRole('button', { name: /editar/i });
    const deleteBtn = editBtnInCard.locator('..').locator('button').last();
    await deleteBtn.click();

    await expect(page.getByText(/fazenda excluída com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeEditado)).not.toBeVisible({
      timeout: 3000,
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Validação de campos obrigatórios
  // ---------------------------------------------------------------------------
  test('Validação: não deve cadastrar sem campos obrigatórios', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    await ensureClientSelected(page);
    await navigateToFazendas(page);

    await page.getByRole('button', { name: /cadastrar fazenda/i }).click();

    await expect(page.getByText(/nome da fazenda é obrigatório/i)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/cidade é obrigatória/i)).toBeVisible({
      timeout: 3000,
    });
    await expect(page.getByText(/sistema de produção é obrigatório/i)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/estado é obrigatório/i)).toBeVisible({
      timeout: 3000,
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Validação de soma de áreas
  // ---------------------------------------------------------------------------
  test('Validação: área total deve corresponder à soma das parciais', async ({ page }) => {
    test.skip(!E2E_EMAIL || !E2E_PASSWORD, 'Configure E2E_USER_EMAIL e E2E_USER_PASSWORD para rodar este teste');

    await ensureClientSelected(page);
    await navigateToFazendas(page);

    await fillFarmForm(page, {
      name: `Fazenda Validação ${Date.now()}`,
      productionSystem: 'Cria',
      state: 'São Paulo',
      city: 'Ribeirão Preto',
      totalArea: '999',
      pastureArea: '500',
      agricultureArea: '200',
      otherCrops: '100',
      infrastructure: '100',
      reserveAndAPP: '100',
      propertyValue: '500000',
    });

    await page.getByRole('button', { name: /cadastrar fazenda/i }).click();

    await expect(page.getByText(/área total.*não corresponde/i)).toBeVisible({ timeout: 3000 });
  });
});
