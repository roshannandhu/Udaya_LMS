// Measures each ReportPage div's rendered height in the offscreen PDF mount.
// Printable A4 height at 720px canvas width is ~1031px — anything above that overflows.
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/pdf-harness.html', { waitUntil: 'networkidle0' });
  await page.click('#gen-overall');
  await page.waitForFunction(() => {
    const host = document.querySelector('div[aria-hidden="true"]');
    return host && (host.textContent || '').length > 500;
  }, { timeout: 20000, polling: 200 });
  await new Promise(r => setTimeout(r, 800)); // let charts/images settle
  const heights = await page.evaluate(() => {
    const host = document.querySelector('div[aria-hidden="true"]');
    const rootDiv = host.firstChild.firstChild;
    return {
      total: Math.round(host.firstChild.getBoundingClientRect().height),
      pages: [...rootDiv.children].map(el => Math.round(el.getBoundingClientRect().height)),
    };
  });
  console.log(JSON.stringify(heights));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
