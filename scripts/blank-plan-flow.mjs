// Verify a plan can be created, edited, reopened and built without a source file.
// Run against npm run dev -- --port 5180.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const clickText = async (text) => {
    await page.waitForFunction((t) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === t), {}, text);
    await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t).click(), text);
  };
  const project = () => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hb3d-store-v1')).state;
    return s.projects[s.currentId];
  });
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:5180'}/#/new`, { timeout: 30000 });
  await clickText('Start from scratch');
  await page.type('input[placeholder="e.g. Sharma residence"]', 'My new home');
  await clickText('G + 2');
  await clickText('Create blank plan');
  await page.waitForSelector('nav[aria-label="Tools"]');
  let p = await project();
  assert.equal(p.name, 'My new home');
  assert.equal(p.spec.levels.length, 3);
  assert.equal(p.sourceKey, undefined);
  assert.equal(p.spec.underlay, undefined);
  assert.equal(p.items.length, 0);
  assert.equal(await page.$eval('button[title="Wall (W)"]', (el) => el.getAttribute('aria-pressed')), 'true');
  const canvas = await page.$eval('main svg', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  for (const [x, y] of [[0.3, 0.3], [0.7, 0.3], [0.7, 0.7], [0.3, 0.7], [0.3, 0.3]]) {
    await page.mouse.click(canvas.x + canvas.w * x, canvas.y + canvas.h * y);
  }
  await page.keyboard.press('Enter');
  p = await project();
  assert.equal(p.spec.levels[0].walls.length, 4);
  const id = p.id;
  await page.reload();
  await page.waitForSelector('nav[aria-label="Tools"]');
  p = await project();
  assert.equal(p.id, id);
  assert.equal(p.spec.levels[0].walls.length, 4);
  await clickText('Build 3D');
  await page.waitForSelector('canvas', { timeout: 60000 });
  p = await project();
  assert.equal(p.spec.levels[0].footprint.length, 4);
  assert.ok(p.spec.structure.columns.length >= 4);
  assert.deepEqual(errors, []);
  console.log('Passed: blank creation, floor count, wall drawing, persistence and 3D build.');
} finally {
  await browser.close();
}
