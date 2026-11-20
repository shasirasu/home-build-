// End-to-end with a picture: upload an image of a plan on #/new, Gemini understands it (server endpoint), the site
// builds the draft; screenshots of the upload panel, the plan editor over the picture, and the 3D.
// usage: node scripts/upload-image-flow.mjs <plan.png> <outDir>
import puppeteer from 'puppeteer-core';
const [img, out] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 600000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  const outside = [];
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1') && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u.slice(0, 80)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  await page.goto('http://127.0.0.1:5180/#/new', { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('input[type=file]', { timeout: 60000 });
  await sleep(1500);
  const t0 = Date.now();
  await (await page.$('input[type=file]')).uploadFile(img);
  await page.waitForFunction(() => /Understood by Gemini|Read from the drawing|Gemini could not|Gemini found no|Gemini is |no quota|took too long/.test(document.body.innerText), { timeout: 420000 });
  await sleep(800);
  console.log('seconds to understand:', Math.round((Date.now() - t0) / 1000));
  console.log('panel:', JSON.stringify(await page.evaluate(() => document.querySelector('aside')?.innerText.replace(/\n+/g, ' | ').slice(0, 700))));
  await page.screenshot({ path: `${out}/img-upload.png` });
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Check the plan')); if (b) b.click(); return !!b; });
  if (ok) {
    await page.waitForFunction(() => document.body.innerText.includes('Build 3D'), { timeout: 60000 });
    await sleep(5000);
    await page.screenshot({ path: `${out}/img-plan.png` });
    console.log('project:', JSON.stringify(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('hb3d-store-v1')).state; const p = s.projects[s.currentId]; return { levels: p.spec.levels.map((l) => `${l.name}: ${l.walls.length} walls, ${l.openings.length} openings, ${l.rooms.length} rooms, ${l.stairs.length} stairs`), items: p.items.length, note: p.spec.notes[0].slice(0, 90) }; })));
    await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Build 3D'))?.click());
    await page.waitForSelector('canvas', { timeout: 120000 });
    await sleep(9000);
    await page.evaluate(() => [...document.querySelectorAll('[role=radiogroup][aria-label=Storey] [role=radio]')].find((b) => b.textContent.trim() === 'GF')?.click());
    await sleep(7000);
    await page.screenshot({ path: `${out}/img-studio-gf.png` });
  }
  console.log('requests from the browser to outside:', JSON.stringify([...new Set(outside)]));
} finally { await browser.close(); }
