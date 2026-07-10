// Generates PDF and captures console.log output to see canvas dimensions
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.text().includes('[pdf-debug]')) {
      console.log('CONSOLE:', msg.text());
    }
  });

  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: path.resolve('C:/Users/Roshan Raj/Downloads')
  });

  await page.goto('http://localhost:3001/pdf-harness.html', { waitUntil: 'networkidle0' });

  await page.click('#gen-overall');

  await page.waitForFunction(
    () => document.getElementById('status') && document.getElementById('status').dataset.status && document.getElementById('status').dataset.status.startsWith('done'),
    { timeout: 60000 }
  );

  console.log('status: done');
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
