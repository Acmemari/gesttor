import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.25 });
const log = (...a) => console.log(...a);

async function clickText(txt, { exact = true, timeout = 6000 } = {}) {
  try {
    await page.getByText(txt, { exact }).first().click({ timeout });
    log('clicked:', txt);
    await page.waitForTimeout(500);
    return true;
  } catch (e) {
    log('skip (not found):', txt);
    return false;
  }
}

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => log('goto:', e.message));
await page.waitForTimeout(1200);

await clickText('Inttegra', { exact: false });
await page.waitForTimeout(1200);
await clickText('Pecuária', { exact: false });
await page.waitForTimeout(500);
await clickText('Movimentações', { exact: false });
await page.waitForTimeout(500);
await clickText('Nascimentos', { exact: false });
await page.waitForTimeout(2000);

// Wide: card largo o suficiente → deve dividir em 2 colunas
await page.setViewportSize({ width: 1600, height: 1000 });
await page.waitForTimeout(400);
await page.screenshot({ path: join(here, 'nascimento-wide.png'), fullPage: false });
log('wide salvo (espera 2 colunas)');

// Narrow: card estreito → deve empilhar (1 coluna)
await page.setViewportSize({ width: 1180, height: 1000 });
await page.waitForTimeout(400);
await page.screenshot({ path: join(here, 'nascimento-narrow.png'), fullPage: false });
log('narrow salvo (espera 1 coluna empilhada)');

log('URL final:', page.url());
await browser.close();
