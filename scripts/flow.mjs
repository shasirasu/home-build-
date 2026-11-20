// End-to-end check of the furnish flow in the studio: Add → pick an item → click a floor → item placed and selected.
import puppeteer from 'puppeteer-core';
const out = process.argv[2] ?? 'flow.png';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 240000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:5180/#/studio?level=gf', { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('canvas', { timeout: 120000 });
  await sleep(9000);
  const count = () => page.evaluate(() => JSON.parse(localStorage.getItem('hb3d-store-v1')).state.projects.sample.items.length);
  const before = await count();
  await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.includes('Add'))?.click());
  await sleep(600);
  await page.evaluate(() => [...document.querySelectorAll('aside li button')].find((b) => b.textContent.includes('2-seater sofa'))?.click());
  await sleep(2500);
  const box = await (await page.$('canvas')).boundingBox();
  const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.55;
  await page.mouse.move(cx - 30, cy - 10); await sleep(700);
  await page.mouse.move(cx, cy); await sleep(1200);
  await page.mouse.down(); await sleep(80); await page.mouse.up();
  await sleep(4000);
  const after = await count();
  const inspector = await page.evaluate(() => document.querySelector('aside[aria-label="Selection"] h2')?.textContent ?? null);
  const banner = await page.evaluate(() => document.body.innerText.includes('Placing'));
  console.log(JSON.stringify({ before, after, placed: after - before, inspector, stillPlacing: banner }));
  await page.screenshot({ path: out });
  console.log('saved', out);
} finally { await browser.close(); }
