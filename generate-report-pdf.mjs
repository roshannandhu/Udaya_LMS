
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'report-card-screenshots.pdf');

const CHROME_PROFILE = 'C:\\Users\\Roshan Raj\\AppData\\Local\\Google\\Chrome\\User Data';

console.log('Launching browser with existing profile...');

const browser = await puppeteer.launch({
  headless: true,
  userDataDir: CHROME_PROFILE,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--profile-directory=Default',
  ],
  executablePath: undefined, // use bundled chromium
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

console.log('Navigating to report page...');
await page.goto('http://localhost:3001/teacher/report-graph-reference', {
  waitUntil: 'networkidle2',
  timeout: 30000,
});

// Wait for charts to render
console.log('Waiting for charts to render...');
await page.waitForTimeout(3000);

// Scroll through to trigger lazy-rendered charts
const bodyHeight = await page.evaluate(() => {
  return document.body.scrollHeight;
});

for (let y = 0; y <= bodyHeight; y += 300) {
  await page.evaluate(pos => window.scrollTo(0, pos), y);
  await page.waitForTimeout(100);
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500);

console.log(`Page height: ${bodyHeight}px. Generating PDF...`);

await page.pdf({
  path: OUT,
  format: 'A4',
  landscape: true,
  printBackground: true,
  margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
});

await browser.close();
console.log(`PDF saved to: ${OUT}`);
