// Diagnostic: load a page, print console output and a few probes over time.
import puppeteer from 'puppeteer-core';
const [url, secs = '25'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 60000,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 640, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 400)));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 600)));
  page.on('requestfailed', (r) => console.log('[reqfail]', r.url().slice(0, 120)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const t0 = Date.now();
  while (Date.now() - t0 < +secs * 1000) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const s = await Promise.race([
        page.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length, text: document.body.innerText.slice(0, 120).replace(/\n/g, ' | '), raf: (window).__rafCount })),
        new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate blocked 8s')), 8000)),
      ]);
      console.log(`t+${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(s));
    } catch (e) { console.log(`t+${Math.round((Date.now() - t0) / 1000)}s`, e.message); }
  }
} finally { await browser.close(); }
