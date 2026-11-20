// Headless screenshot of a page in this app, with WebGL (SwiftShader).
// SCHEME=light|dark picks the colour scheme.
// usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [evalJs]
//   evalJs (optional) is run in the page after load, before the wait — e.g. to click buttons or set a view.
import puppeteer from 'puppeteer-core';
const [url, out, w = '1440', h = '900', wait = '2500', evalJs] = process.argv.slice(2);
if (!url || !out) { console.error('usage: node scripts/shot.mjs <url> <out.png> [w] [h] [waitMs] [evalJs]'); process.exit(1); }
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  if (process.env.SCHEME) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: process.env.SCHEME }]);
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  if (evalJs) await page.evaluate(evalJs);
  await new Promise((r) => setTimeout(r, +wait));
  await page.screenshot({ path: out });
  console.log(`saved ${out}`);
  if (logs.length) console.log(logs.slice(0, 30).join('\n'));
} finally { await browser.close(); }
