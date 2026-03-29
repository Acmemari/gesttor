import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Carrega variáveis do .env para os testes E2E
dotenv.config();

/**
 * Configuração do Playwright para testes E2E
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './src/test/e2e',
  /* Roda testes em paralelo */
  fullyParallel: true,
  /* Falha o build no CI se você deixar test.only no código */
  forbidOnly: !!process.env.CI,
  /* Retry no CI e 1 retry local para absorver cold-start do Neon */
  retries: process.env.CI ? 2 : 1,
  /* Workers no CI */
  workers: process.env.CI ? 1 : undefined,
  /* Configuração do reporter */
  reporter: 'html',
  /* Timeout por teste (Neon tem cold-start de até ~30s) */
  timeout: 90 * 1000,

  /* Configurações compartilhadas para todos os projetos */
  use: {
    /* Base URL para usar em navegação como await page.goto('/') */
    baseURL: 'http://localhost:3000',
    /* Coletar trace quando retentar o teste */
    trace: 'on-first-retry',
  },

  /* Configurar projetos para múltiplos navegadores */
  projects: [
    // Projeto de setup: faz login uma vez e salva a sessão
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Reutiliza a sessão autenticada do setup
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* Rodar servidores de desenvolvimento antes dos testes */
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: 'npm run dev:api',
      url: 'http://localhost:3001',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
});
