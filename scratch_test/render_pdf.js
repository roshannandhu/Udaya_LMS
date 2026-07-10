// Renders each page of a PDF to PNG for visual inspection.
// Usage: node render_pdf.js <pdf-path> <out-dir>
const { pdfToPng } = require('pdf-to-png-converter');
const fs = require('fs');
const path = require('path');

(async () => {
  const [pdfPath, outDir] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const pages = await pdfToPng(pdfPath, { viewportScale: 1.5 });
  for (const p of pages) {
    const f = path.join(outDir, `page_${p.pageNumber}.png`);
    fs.writeFileSync(f, p.content);
    console.log(`${f} (${p.width}x${p.height})`);
  }
})().catch(e => { console.error(e); process.exit(1); });
