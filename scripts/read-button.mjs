// Scripted check: "Read drawing" in the plan editor rebuilds the sample from its PDF, and "Furnish the empty rooms"
// in the studio fills a house that has no furniture.
import puppeteer from 'puppeteer-core';
const out = process.argv[2];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 240000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
  const state = () => page.evaluate(() => { const raw = localStorage.getItem('hb3d-store-v1'); if (!raw) return { items: 'nothing saved yet (fresh profile, sample as shipped)' }; const s = JSON.parse(raw).state; const p = s.projects[s.currentId]; return { levels: p.spec.levels.map((l) => `${l.name}: ${l.walls.length}w ${l.openings.length}o ${l.rooms.length}r`), items: p.items.length, notes0: (p.spec.notes ?? [''])[0].slice(0, 60) }; });
  await page.goto('http://127.0.0.1:5180/#/plan', { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Read drawing')), { timeout: 60000 });
  await sleep(2500);
  console.log('before read:', JSON.stringify(await state()));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Read drawing'))?.click());
  await page.waitForFunction(() => { const raw = localStorage.getItem('hb3d-store-v1'); return !!raw && JSON.parse(raw).state.projects.sample.spec.levels[0].name === 'Ground Floor'; }, { timeout: 60000 });
  await sleep(1500);
  console.log('after read: ', JSON.stringify(await state()));
  if (out) await page.screenshot({ path: `${out}/plan-after-read.png` });
  // empty the furniture, then let the studio furnish the empty rooms
  await page.evaluate(() => { const k = 'hb3d-store-v1'; const s = JSON.parse(localStorage.getItem(k)); s.state.projects.sample.items = []; localStorage.setItem(k, JSON.stringify(s)); });
  await page.goto('http://127.0.0.1:5180/#/studio?level=gf', { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 120000 });
  await sleep(7000);
  console.log('emptied:    ', JSON.stringify((await state()).items));
  await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('Add'))?.click());
  await sleep(500);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Furnish the empty rooms'))?.click());
  await sleep(6000);
  console.log('furnished:  ', JSON.stringify((await state()).items), '|', await page.evaluate(() => [...document.querySelectorAll('p[aria-live]')].map((p) => p.textContent).join(' ')));
  if (out) await page.screenshot({ path: `${out}/studio-furnished.png` });
} finally { await browser.close(); }
