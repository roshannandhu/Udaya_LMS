// Generates the student report PDF via the dev harness page in headless Chrome
// and saves it to scratch_test/out/. Usage: node gen_pdf.js [overall|weekly]
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const period = process.argv[2] || 'overall';
  const outDir = path.resolve(__dirname, 'out');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir });
  page.on('pageerror', e => console.log('[pageerror]', e.message));

  await page.goto('http://localhost:3001/pdf-harness.html', { waitUntil: 'networkidle0' });
  await page.click(`#gen-${period}`);
  await page.waitForFunction(
    () => /^(done|error)/.test(document.getElementById('status').dataset.status || ''),
    { timeout: 300000, polling: 1000 }
  );
  console.log('status:', await page.$eval('#status', el => el.dataset.status));

  for (let i = 0; i < 60; i++) {
    const files = fs.readdirSync(outDir).filter(f => f.endsWith('.pdf'));
    if (files.length) { console.log('downloaded:', files.join(', ')); break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
