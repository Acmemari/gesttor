import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1.5 });
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

// 1) Entrar no Integra
await clickText('Integra');
await page.waitForTimeout(800);
// 2) Expandir Pecuária
await clickText('Pecuária');
// 3) Expandir Movimentações
await clickText('Movimentações');
// 4) Abrir Nascimentos
await clickText('Nascimentos');
await page.waitForTimeout(1800);

// tenta ligar o modo detalhamento p/ ver ambos os botões realçados também
await page.screenshot({ path: join(here, 'nascimento-full.png'), fullPage: false });

// recorta a região dos botões de ícone (perto do label "Quantidade")
try {
  const q = page.getByText('Quantidade', { exact: false }).first();
  const box = await q.boundingBox();
  if (box) {
    await page.screenshot({
      path: join(here, 'nascimento-botoes.png'),
      clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 10), width: 520, height: 130 },
    });
    log('crop salvo');
  }
} catch (e) { log('crop falhou:', e.message); }

log('URL final:', page.url());
await browser.close();
