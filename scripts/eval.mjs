// Headless probe: load a page, wait, evaluate an expression in it and print the result as JSON (plus any console
// errors). Handy for reading engine state from the dev harness, e.g.
//   node scripts/eval.mjs "http://127.0.0.1:5180/engine.html#night=1" "viewer.view.lights.counts" 6000
// usage: node scripts/eval.mjs <url> <expression> [waitMs]
import puppeteer from 'puppeteer-core';
const [url, expr, wait = '5000'] = process.argv.slice(2);
if (!url || !expr) { console.error('usage: node scripts/eval.mjs <url> <expression> [waitMs]'); process.exit(1); }
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 640, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 600)}`));
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await new Promise((r) => setTimeout(r, +wait));
  const out = await page.evaluate(`(async () => { try { return JSON.stringify(await (${expr}), null, 1); } catch (e) { return 'ERROR ' + (e && e.stack || e); } })()`);
  console.log(out);
  if (logs.length) console.log(logs.slice(0, 30).join('\n'));
} finally { await browser.close(); }
