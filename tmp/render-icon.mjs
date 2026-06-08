import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const svg = readFileSync('public/icons/motivo-morte.svg','utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport:{width:520,height:260}, deviceScaleFactor:2 });
const html = `<body style="margin:0;display:flex;background:#0f1b2d">
  <div style="width:260px;height:260px;display:flex;align-items:center;justify-content:center">${svg.replace('width="64"','width="220"').replace('height="64"','height="220"')}</div>
  <div style="width:260px;height:260px;display:flex;align-items:center;justify-content:center;color:#8CCB16;font:600 22px sans-serif;gap:8px">
    <span style="color:#8CCB16">${svg.replace('width="64"','width="28"').replace('height="64"','height="28"').replace('<rect width="48" height="48" rx="10" fill="#162333"/>','')}</span>Mortes
  </div></body>`;
await page.setContent(html);
await page.screenshot({ path:'tmp/icon-preview.png' });
await browser.close();
console.log('done');
