#!/usr/bin/env node
/*
 * Regenerates the screenshots in docs/images from the running application.
 *
 * Every image in the README comes from here, never from a screenshot tool:
 * that way they cannot drift from what the app actually renders, and a reader
 * can reproduce them. Chrome runs headless through puppeteer-core - no
 * Chromium download, it uses the browser that is already installed.
 *
 *   cd cap && npm start          # in one terminal
 *   cd cap && npm run screenshots
 *
 * Optional arguments limit the run to single images:
 *   npm run screenshots -- cockpit inbox
 */
import puppeteer from 'puppeteer-core';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.DEMO_URL ?? 'http://localhost:4004';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'images');

/** Chrome on this machine. Override with CHROME_PATH when it lives elsewhere. */
const CHROME =
  process.env.CHROME_PATH ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/google-chrome');

const reachable = await fetch(BASE, { redirect: 'manual' })
  .then(() => true)
  .catch(() => false);
if (!reachable) {
  console.error(`No application at ${BASE} - start it with "npm start" in cap/ first.`);
  process.exit(1);
}
const PR2 = '#/PurchaseRequisitions(ID=d0000002-0000-4000-8000-000000000002,IsActiveEntity=true)';
const SUP6 = '#/Suppliers(50000006-0000-4000-8000-000000000006)';
const only = process.argv.slice(2);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(name, url, opts = {}) {
  const { language = 'en', theme = 'sap_horizon', tour = false, user = 'mona', script = false, after, wait = 4000 } = opts;
  if (only.length && !only.includes(name)) return;
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  // The demo cookie is the login; it also beats any cached basic credentials.
  await page.setCookie({ name: 'acme-demo-user', value: user, url: BASE });
  await page.authenticate({ username: user, password: '' });
  await page.evaluateOnNewDocument(
    (language, theme, tour, script) => {
      localStorage.setItem('acme.language', language);
      localStorage.setItem('acme.theme', theme);
      localStorage.setItem('acme.script.open', script ? 'true' : 'false');
      for (const key of ['home', 'solution', 'cockpit', 'approvals', 'requisitions.list', 'requisitions.detail', 'suppliers.list', 'suppliers.detail']) {
        if (tour) localStorage.removeItem('acme.tour.' + key);
        else localStorage.setItem('acme.tour.' + key, 'done');
      }
    },
    language, theme, tour, script
  );
  await page.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(wait);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.mouse.move(0, 899);
  if (after) await after(page);
  await sleep(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('wrote', name);
  await context.close();
}

const scrollTo = (selector, wait = 1500) => async (page) => {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ block: 'start' });
  }, selector);
  await sleep(wait);
};

await shot('home', '/', { user: 'rita' });
await shot('solution', '/solution.html', { user: 'rita', language: 'de' });
await shot('solution-roi', '/solution.html', { user: 'rita', language: 'de', after: scrollTo('.acme-roi') });
await shot('cockpit', '/cockpit.html');
await shot('inbox', '/approvals/webapp/index.html', { user: 'dana', wait: 6000 });
await shot('list-report', '/purchase-requisitions/webapp/index.html', { wait: 5000 });
await shot('object-page', '/purchase-requisitions/webapp/index.html' + PR2, { wait: 5000 });
await shot('approval-chain', '/purchase-requisitions/webapp/index.html' + PR2, {
  wait: 5000,
  after: scrollTo('[id$="fe::FacetSection::ApprovalFacet"]')
});
await shot('supplier-risk', '/suppliers/webapp/index.html', { wait: 5000 });
await shot('supplier-detail', '/suppliers/webapp/index.html' + SUP6, { wait: 5000 });
await shot('demo-script', '/', { user: 'rita', language: 'de', script: true });
await shot('german-dark', '/purchase-requisitions/webapp/index.html', {
  language: 'de',
  theme: 'sap_horizon_dark',
  wait: 5000
});
await shot('tour', '/purchase-requisitions/webapp/index.html', {
  tour: true,
  wait: 5000,
  after: async (page) => {
    await page.waitForSelector('.acme-tour-card', { visible: true, timeout: 15000 });
    for (let i = 0; i < 3; i++) {
      await sleep(600);
      await page.keyboard.press('ArrowRight');
    }
    await sleep(1500);
  }
});
await shot('user-menu', '/purchase-requisitions/webapp/index.html', {
  user: 'dana',
  language: 'de',
  wait: 5000,
  after: async (page) => {
    await page.click('#acmeShellAvatar');
    await sleep(1500);
  }
});

await browser.close();
