// Renders each page of a PDF to PNG using pdf.js inside headless Chrome,
// so page-break placement can be inspected visually.
// Usage: node render_pdf_pages.js <pdf-path> <out-prefix>
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const pdfPath = process.argv[2];
const prefix = process.argv[3] || 'page';
const OUT = path.join(__dirname, 'out');

const HTML = `<!doctype html><html><body style="margin:0">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  window.renderPdf = async (b64) => {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    const results = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      results.push(canvas.toDataURL('image/png'));
    }
    return results;
  };
</script></body></html>`;

(async () => {
  const b64 = fs.readFileSync(pdfPath).toString('base64');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(HTML, { waitUntil: 'networkidle0' });
    const pages = await page.evaluate((b) => window.renderPdf(b), b64);
    pages.forEach((dataUrl, i) => {
      fs.writeFileSync(path.join(OUT, `${prefix}_p${i + 1}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    });
    console.log(`Rendered ${pages.length} pages as ${prefix}_pN.png`);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
