// Scripted check of camera modes in the studio: click Plan, then Orbit, reading app + engine state each time.
import puppeteer from 'puppeteer-core';
const out = process.argv[2];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 240000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:5180/#/studio', { waitUntil: 'load', timeout: 180000 });
  await page.waitForSelector('canvas', { timeout: 120000 });
  await sleep(8000);
  const state = () => page.evaluate(() => ({
    ui: document.querySelector('[role=radiogroup][aria-label=Camera] [aria-checked=true]')?.textContent?.trim(),
    storey: document.querySelector('[role=radiogroup][aria-label=Storey] [aria-checked=true]')?.textContent?.trim(),
    engine: window.__viewer?.getMode(), level: window.__viewer?.getDisplay().level,
  }));
  const click = (label) => page.evaluate((l) => [...document.querySelectorAll('[role=radiogroup][aria-label=Camera] [role=radio]')].find((b) => b.textContent.includes(l))?.click(), label);
  console.log('start', JSON.stringify(await state()));
  await click('Plan'); await sleep(6000);
  console.log('after Plan', JSON.stringify(await state()));
  if (out) await page.screenshot({ path: out });
  await click('Orbit'); await sleep(5000);
  console.log('after Orbit', JSON.stringify(await state()));
  await click('Walk'); await sleep(6000);
  console.log('after Walk', JSON.stringify(await state()));
} finally { await browser.close(); }
