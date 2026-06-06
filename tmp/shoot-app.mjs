import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => console.log('goto:', e.message));
await page.waitForTimeout(1500);
await page.screenshot({ path: join(here, 'app-boot.png'), fullPage: false });

console.log('URL:', page.url());
console.log('TITLE:', await page.title());
console.log('CONSOLE ERRORS (' + errors.length + '):');
for (const e of errors.slice(0, 15)) console.log('  -', e.slice(0, 200));
await browser.close();
