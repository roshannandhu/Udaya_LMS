const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/pdf-harness.html', { waitUntil: 'networkidle0' });
  await page.click('#gen-overall');
  await page.waitForFunction(() => {
    const h = document.querySelector('div[aria-hidden="true"]');
    return h && (h.textContent || '').length > 500;
  }, { timeout: 20000, polling: 200 });
  await new Promise(r => setTimeout(r, 800));
  const dims = await page.evaluate(() => {
    const host = document.querySelector('div[aria-hidden="true"]');
    const container = host.firstChild;
    const rootDiv = container.firstChild;
    return {
      containerScrollH: container.scrollHeight,
      containerClientH: container.clientHeight,
      containerBCR: Math.round(container.getBoundingClientRect().height),
      rootDivScrollH: rootDiv.scrollHeight,
      pages: Array.from(rootDiv.children).map(function(el) {
        return { scroll: el.scrollHeight, client: el.clientHeight, bcr: Math.round(el.getBoundingClientRect().height) };
      }),
    };
  });
  console.log(JSON.stringify(dims, null, 2));
  await browser.close();
})().catch(function(e) { console.error(e); process.exit(1); });
