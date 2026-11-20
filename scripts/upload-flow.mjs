// End-to-end: upload a plan PDF on #/new, let the site read it (no AI), build the house, look at it in the studio.
// usage: node scripts/upload-flow.mjs <plan.pdf> <outDir>
import puppeteer from 'puppeteer-core';
const [pdf, out] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 240000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const requests = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:')) requests.push(u.slice(0, 80)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:5180/#/new', { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('input[type=file]', { timeout: 60000 });
  await (await page.$('input[type=file]')).uploadFile(pdf);
  await page.waitForFunction(() => document.body.innerText.includes('Read from the drawing') || /could not be read|no line drawing|No floor plan|scale is unknown/.test(document.body.innerText), { timeout: 120000 });
  await sleep(800);
  console.log('panel:', JSON.stringify(await page.evaluate(() => document.querySelector('aside')?.innerText.replace(/\n+/g, ' | ').slice(0, 520))));
  await page.screenshot({ path: `${out}/upload-read.png` });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Build the house'))?.click());
  await page.waitForSelector('canvas', { timeout: 120000 });
  await sleep(10000);
  const info = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('hb3d-store-v1')).state; const p = s.projects[s.currentId]; return { name: p.name, levels: p.spec.levels.map((l) => `${l.name}: ${l.walls.length} walls, ${l.openings.length} openings, ${l.rooms.length} rooms, ${l.stairs.length} stairs`), items: p.items.length, columns: p.spec.structure.columns.length }; });
  console.log('project:', JSON.stringify(info));
  await page.screenshot({ path: `${out}/upload-studio.png` });
  for (const [label, file] of [['GF', 'upload-gf.png'], ['FF', 'upload-ff.png']]) {
    await page.evaluate((l) => [...document.querySelectorAll('[role=radiogroup][aria-label=Storey] [role=radio]')].find((b) => b.textContent.trim() === l)?.click(), label);
    await sleep(6000);
    await page.screenshot({ path: `${out}/${file}` });
  }
  console.log('requests leaving the machine:', JSON.stringify([...new Set(requests)]));
} finally { await browser.close(); }
