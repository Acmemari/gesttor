import { test, expect } from '@playwright/test';

/**
 * Testes E2E para tela de Cadastro de Organizações
 * Cobre: inclusão (criar), alteração (editar) e exclusão (deletar)
 *
 * Pré-requisito: usuário admin ou analista.
 * Configure TEST_EMAIL e TEST_PASSWORD no .env ou ambiente.
 *
 * Rodar: npx playwright test cadastro-organizacoes.spec.ts
 * Ou:   npx playwright test -g "Cadastro de Organizações"
 */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('Cadastro de Organizações', () => {
  test.describe.configure({ mode: 'serial' });

  // Rastreia IDs de organizações criadas para cleanup no afterAll
  const createdOrgIds: string[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of createdOrgIds) {
      await request.patch('/api/organizations', {
        data: { id, action: 'deactivate' },
      });
    }
  });

  // Sessão autenticada vem do auth.setup.ts via storageState
  test.beforeEach(async ({ page }) => {
    // Debug: intercepta o get-session para ver a resposta do servidor
    page.on('response', async (res) => {
      if (res.url().includes('/api/auth/get-session')) {
        console.log(`[get-session] status=${res.status()} url=${res.url()}`);
        try { console.log(`[get-session] body=`, await res.text()); } catch {}
      }
    });

    await page.goto('/');
    // A sessão é validada via get-session (pode levar alguns segundos com Neon)
    await page.waitForSelector('button[title="Cadastros"]', { timeout: 60000 });
  });

  test('Inclusão: deve criar uma nova organização com sucesso', async ({ page }) => {

    await page.locator('button[title="Cadastros"]').click();

    const orgCard = page.locator('button').filter({ hasText: /cadastro de/i }).filter({ hasText: /Organizações/i }).first();
    await expect(orgCard).toBeVisible({ timeout: 8000 });
    await orgCard.click();
    // Aguarda o ClientManagement (lazy) terminar de montar — o input de busca aparece só depois
    await page.getByPlaceholder(/Buscar por nome, email, CNPJ ou telefone/i).waitFor({ state: 'visible', timeout: 15000 });

    // Agora o useEffect do ClientManagement já registrou o listener 'clientNewClient'
    await page.locator('button:has-text("Nova Organização")').click();
    // Aguarda o DOM indicar que o formulário foi montado
    await page.waitForFunction(
      () => !!document.querySelector('[placeholder="Digite o nome da organização"]'),
      { timeout: 15000 },
    );

    const nomeInput = page.getByPlaceholder(/Digite o nome da organização/i);
    await expect(nomeInput).toBeVisible({ timeout: 15000 });
    const nomeOrg = `Organização E2E ${Date.now()}`;
    await nomeInput.fill(nomeOrg);

    const emailInput = page.getByPlaceholder(/organizacao@exemplo\.com/i);
    await emailInput.fill(`e2e-${Date.now()}@teste.com`);

    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('44999641122');

    const [createResp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/organizations') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /^Cadastrar$/i }).click(),
    ]);
    const createBody = await createResp.json();
    if (createBody.ok && createBody.data?.id) createdOrgIds.push(createBody.data.id);

    await expect(page.getByText(/organização cadastrada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeOrg)).toBeVisible({ timeout: 15000 });
  });

  test('Alteração: deve editar uma organização existente com sucesso', async ({ page }) => {

    await page.locator('button[title="Cadastros"]').click();

    const orgCard = page.locator('button').filter({ hasText: /cadastro de/i }).filter({ hasText: /Organizações/i }).first();
    await orgCard.click({ timeout: 8000 });
    await page.getByPlaceholder(/Buscar por nome, email, CNPJ ou telefone/i).waitFor({ state: 'visible', timeout: 15000 });

    const editBtn = page.getByTitle(/editar/i).first();
    if (!(await editBtn.isVisible({ timeout: 3000 }))) {
      test.skip(true, 'Nenhuma organização para editar - rode o teste de inclusão antes');
      return;
    }
    await editBtn.click();

    const nomeInput = page.getByPlaceholder(/digite o nome da organização/i);
    await expect(nomeInput).toBeVisible({ timeout: 5000 });
    await expect(nomeInput).not.toHaveValue('', { timeout: 8000 });
    const nomeAtualizado = `Organização Editada E2E ${Date.now()}`;
    await nomeInput.clear();
    await nomeInput.fill(nomeAtualizado);

    await page.getByRole('button', { name: /atualizar/i }).click();

    await expect(page.getByText(nomeAtualizado)).toBeVisible({ timeout: 5000 });
  });

  test('Exclusão: deve excluir uma organização com confirmação', async ({ page }) => {

    page.on('dialog', d => d.accept());

    await page.locator('button[title="Cadastros"]').click();

    const orgCard = page.locator('button').filter({ hasText: /cadastro de/i }).filter({ hasText: /Organizações/i }).first();
    await orgCard.click({ timeout: 8000 });
    await page.getByPlaceholder(/Buscar por nome, email, CNPJ ou telefone/i).waitFor({ state: 'visible', timeout: 15000 });

    const deleteBtn = page.getByTitle(/desativar organização/i).first();
    if (!(await deleteBtn.isVisible({ timeout: 3000 }))) {
      test.skip(true, 'Nenhuma organização para excluir');
      return;
    }

    const rowToDelete = page.locator('tbody tr').first();
    const nameToDelete = (await rowToDelete.locator('td').first().innerText()).trim();
    await deleteBtn.click();

    await expect(page.getByText(/desativada com sucesso/i)).toBeVisible({ timeout: 8000 });
  });

  test('Inclusão + Alteração + Exclusão: fluxo completo', async ({ page }) => {

    page.on('dialog', d => d.accept());

    const sufixo = Date.now();
    const nomeCriado = `Organização Fluxo E2E ${sufixo}`;
    const nomeEditado = `Organização Fluxo Editada ${sufixo}`;

    await page.locator('button[title="Cadastros"]').click();

    const orgCard = page.locator('button').filter({ hasText: /cadastro de/i }).filter({ hasText: /Organizações/i }).first();
    await orgCard.click({ timeout: 8000 });
    // Aguarda o ClientManagement (lazy) montar antes de clicar em "Nova Organização"
    await page.getByPlaceholder(/Buscar por nome, email, CNPJ ou telefone/i).waitFor({ state: 'visible', timeout: 15000 });

    // 1. Inclusão
    await page.locator('button:has-text("Nova Organização")').click();
    await page.getByPlaceholder(/Digite o nome da organização/i).waitFor({ state: 'visible', timeout: 10000 });

    await page.getByPlaceholder(/Digite o nome da organização/i).fill(nomeCriado);
    await page.getByPlaceholder(/organizacao@exemplo\.com/i).fill(`fluxo-${sufixo}@teste.com`);
    await page.locator('input[type="tel"]').first().fill('44999641122');

    const [fluxoResp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/organizations') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /^Cadastrar$/i }).click(),
    ]);
    const fluxoBody = await fluxoResp.json();
    if (fluxoBody.ok && fluxoBody.data?.id) createdOrgIds.push(fluxoBody.data.id);

    await expect(page.getByText(/organização cadastrada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeCriado)).toBeVisible({ timeout: 5000 });

    // 2. Alteração
    await page.getByTitle(/editar/i).first().click();

    const nomeInput = page.getByPlaceholder(/digite o nome da organização/i);
    await expect(nomeInput).toBeVisible({ timeout: 8000 });
    // Aguarda o fetch da organização preencher o campo (handleEdit é assíncrono)
    await expect(nomeInput).not.toHaveValue('', { timeout: 8000 });
    await nomeInput.clear();
    await nomeInput.fill(nomeEditado);
    await page.getByRole('button', { name: /atualizar/i }).click();

    await expect(page.getByText(/organização atualizada com sucesso/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(nomeEditado)).toBeVisible({ timeout: 5000 });

    // 3. Exclusão
    await page.getByTitle(/desativar organização/i).first().click();

    await expect(page.getByText(/desativada com sucesso/i)).toBeVisible({ timeout: 8000 });
  });

  test('Gestores: deve cadastrar, editar e excluir no formulário de organização', async ({ page }) => {

    page.on('dialog', d => d.accept());

    const sufixo = Date.now();
    const gestorNomeInicial = `Gestor Inicial ${sufixo}`;
    const gestorNomeEditado = `Gestor Editado ${sufixo}`;

    await page.locator('button[title="Cadastros"]').click();

    const orgCard = page.locator('button').filter({ hasText: /cadastro de/i }).filter({ hasText: /Organizações/i }).first();
    await orgCard.click({ timeout: 8000 });
    await page.getByPlaceholder(/Buscar por nome, email, CNPJ ou telefone/i).waitFor({ state: 'visible', timeout: 15000 });

    // Garantir que exista ao menos 1 organização para editar
    const firstEditButton = page.getByTitle(/editar/i).first();
    if (!(await firstEditButton.isVisible({ timeout: 3000 }))) {
      const sufixoOrg = Date.now();
      await page.locator('button:has-text("Nova Organização")').click();
      await page.getByPlaceholder(/Digite o nome da organização/i).waitFor({ state: 'visible', timeout: 10000 });
      await page.getByPlaceholder(/Digite o nome da organização/i).fill(`Organização Base Gestor ${sufixoOrg}`);
      await page.getByPlaceholder(/organizacao@exemplo\.com/i).fill(`org-base-${sufixoOrg}@teste.com`);
      await page.locator('input[type="tel"]').first().fill('44999641122');

      const [gestorResp] = await Promise.all([
        page.waitForResponse(r => r.url().includes('/api/organizations') && r.request().method() === 'POST'),
        page.getByRole('button', { name: /^Cadastrar$/i }).click(),
      ]);
      const gestorBody = await gestorResp.json();
      if (gestorBody.ok && gestorBody.data?.id) createdOrgIds.push(gestorBody.data.id);

      await expect(page.getByText(/organização cadastrada com sucesso/i)).toBeVisible({ timeout: 8000 });
    }

    const targetOrgName = (await page.locator('tbody tr').first().locator('td').first().innerText()).trim();

    // 1) Cadastro de gestor (na tela)
    await page
      .locator('tbody tr')
      .filter({ hasText: targetOrgName })
      .first()
      .getByTitle(/editar/i)
      .click();

    while ((await page.getByTitle(/remover proprietário/i).count()) > 0) {
      await page.getByTitle(/remover proprietário/i).first().click();
    }

    if (await page.getByText(/Nenhum proprietário gestor cadastrado\./i).isVisible()) {
      await page.getByRole('button', { name: /Adicionar primeiro proprietário/i }).click();
    } else {
      await page.getByRole('button', { name: /^Adicionar$/i }).click();
    }

    const ownerNameInput = page.getByPlaceholder('Nome completo').first();
    await expect(ownerNameInput).toBeVisible({ timeout: 5000 });
    await ownerNameInput.fill(gestorNomeInicial);

    // 2) Edição de gestor (na tela)
    await ownerNameInput.fill(gestorNomeEditado);

    // 3) Exclusão de gestor (na tela)
    await page.getByTitle(/remover proprietário/i).click();
    await expect(page.getByText(/Nenhum proprietário gestor cadastrado\./i)).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /atualizar/i }).click();
    await expect(page.getByText(/organização atualizada com sucesso/i)).toBeVisible({ timeout: 8000 });
  });
});
