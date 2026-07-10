// Screenshots the exam-result PDF preview for each test case and triggers a
// real html2pdf download for the key cases, saving everything to ./out/<case>.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const BASE = 'http://localhost:3001/pdf-preview.html';
const CASES = ['normal', 'long', 'tiny', 'terminated', 'noreview'];
const PDF_CASES = ['normal', 'long', 'tiny', 'terminated', 'noreview'];

const waitForDownload = (dir, timeoutMs = 90000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const tick = () => {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));
    if (files.length) return resolve(files[0]);
    if (Date.now() - started > timeoutMs) return reject(new Error('download timeout'));
    setTimeout(tick, 500);
  };
  tick();
});

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    for (const c of CASES) {
      const caseDir = path.join(OUT, c);
      fs.rmSync(caseDir, { recursive: true, force: true });
      fs.mkdirSync(caseDir, { recursive: true });

      const page = await browser.newPage();
      await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${BASE}?case=${c}`, { waitUntil: 'networkidle0', timeout: 60000 });
      await new Promise(r => setTimeout(r, 1500));
      await page.screenshot({ path: path.join(caseDir, `preview.png`), fullPage: true });

      if (PDF_CASES.includes(c)) {
        const client = await page.createCDPSession();
        await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: caseDir });
        await page.evaluate(() => window.__genPdf());
        const file = await waitForDownload(caseDir);
        console.log(`[${c}] PDF saved: ${file}`);
      }
      if (errors.length) console.log(`[${c}] PAGE ERRORS:\n` + errors.join('\n'));
      await page.close();
      console.log(`[${c}] done`);
    }
  } finally {
    await browser.close();
  }
  console.log('ALL DONE');
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
