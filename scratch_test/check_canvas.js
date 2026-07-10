// Check what canvas dimensions html2canvas produces for the PDF harness
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/pdf-harness.html', { waitUntil: 'networkidle0' });

  // Inject a spy on html2canvas BEFORE clicking gen
  await page.evaluate(() => {
    const orig = window.html2canvas;
    window.html2canvas = function(el, opts) {
      return orig(el, opts).then(function(canvas) {
        window.__canvasDims = { w: canvas.width, h: canvas.height };
        console.log('CANVAS:', canvas.width, 'x', canvas.height);
        return canvas;
      });
    };
  });

  await page.click('#gen-overall');

  // Wait for status to say done
  await page.waitForFunction(
    () => document.getElementById('status') && document.getElementById('status').dataset.status && document.getElementById('status').dataset.status.startsWith('done'),
    { timeout: 30000 }
  );

  const dims = await page.evaluate(() => window.__canvasDims);
  console.log('Final canvas dims:', JSON.stringify(dims));

  // Also compute expected nPages
  if (dims) {
    const pageHeightPx = Math.floor(dims.w * (272/190));
    const nPages = Math.ceil(dims.h / pageHeightPx);
    console.log('pxPageHeight:', pageHeightPx, 'nPages:', nPages);
  }

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
