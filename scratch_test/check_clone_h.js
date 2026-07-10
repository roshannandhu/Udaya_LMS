// Captures the clone height that html2pdf creates before rendering
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:3001/pdf-harness.html', { waitUntil: 'networkidle0' });

  // After clicking gen, watch for the overlay div that html2pdf creates
  await page.click('#gen-overall');

  // Wait for overlay to appear
  let cloneH = null;
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 200));
    cloneH = await page.evaluate(() => {
      // html2pdf creates an overlay with fixed positioning
      const overlay = document.querySelector('div[style*="rgba(0,0,0,0.8)"]');
      if (!overlay) return null;
      const container = overlay.firstChild; // the 190mm container
      const src = container && container.firstChild; // the cloned source
      return src ? {
        containerH: container.scrollHeight,
        srcH: src.scrollHeight,
        srcStyle: src.getAttribute('style'),
        paddingTop: window.getComputedStyle(src).paddingTop,
        paddingBottom: window.getComputedStyle(src).paddingBottom,
      } : null;
    });
    if (cloneH) break;
  }
  console.log('Clone data:', JSON.stringify(cloneH, null, 2));

  // Wait for done status
  await page.waitForFunction(
    () => document.getElementById('status') && document.getElementById('status').dataset.status && document.getElementById('status').dataset.status.startsWith('done'),
    { timeout: 30000 }
  );

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
