const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost:3001';
const errors = [];
const log = (msg) => console.log(msg);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  fs.mkdirSync('E:/IMP projects/Udaya/screenshots', { recursive: true });
  const shot = async (name) => {
    const p = `E:/IMP projects/Udaya/screenshots/${name}.png`;
    await page.screenshot({ path: p });
    log(`📸 ${name} → ${p}`);
  };

  // 1. Login page
  log('\n=== 1. Login page ===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const teacherBtn = await page.locator('button:has-text("Teacher")').isVisible();
  const studentBtn = await page.locator('button:has-text("Student")').isVisible();
  log(`Teacher toggle: ${teacherBtn} | Student toggle: ${studentBtn}`);
  await shot('01-login');

  // 2. Log in as teacher
  log('\n=== 2. Teacher login ===');
  await page.locator('button:has-text("Teacher")').click();
  await page.locator('input[type="email"]').fill('admin@tutoria.com');
  await page.locator('input[type="password"]').fill('Admin1234');
  await page.locator('button:has-text("Sign in")').click();
  try { await page.waitForURL('**/teacher**', { timeout: 8000 }); } catch(e) {}
  log(`URL after login: ${page.url()}`);
  await shot('02-after-login');

  // 3. Teacher dashboard
  log('\n=== 3. Teacher dashboard ===');
  await page.waitForLoadState('networkidle');
  const headings = await page.locator('h1, h2, h3').allTextContents();
  log(`Headings: ${headings.slice(0,3).join(' | ')}`);
  const hasMock = await page.locator('text=Aarav').count();
  log(`Mock student "Aarav" visible: ${hasMock > 0}`);
  await shot('03-dashboard');

  // 4. Subjects
  log('\n=== 4. Subjects page ===');
  await page.goto(`${BASE}/teacher/subjects`, { waitUntil: 'networkidle' });
  await shot('04-subjects');
  log(`URL: ${page.url()}`);

  // 5. Students
  log('\n=== 5. Students page ===');
  await page.goto(`${BASE}/teacher/students`, { waitUntil: 'networkidle' });
  await shot('05-students');
  log(`URL: ${page.url()}`);

  // 6. Broadcasts
  log('\n=== 6. Broadcasts page ===');
  await page.goto(`${BASE}/teacher/broadcasts`, { waitUntil: 'networkidle' });
  await shot('06-broadcasts');
  log(`URL: ${page.url()}`);

  // 7. Desktop layout — sidebar & bottom nav
  log('\n=== 7. Desktop layout (1280px) ===');
  await page.goto(`${BASE}/teacher`, { waitUntil: 'networkidle' });
  const sidebar = await page.locator('aside').isVisible();
  const bottomNav = await page.locator('nav.fixed').isVisible();
  log(`Sidebar (aside) visible: ${sidebar}`);
  log(`Bottom nav visible: ${bottomNav}`);
  await shot('07-desktop');

  // 7b. Mobile (375px)
  log('\n=== 7b. Mobile layout (375px) ===');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload({ waitUntil: 'networkidle' });
  const sidebarMob = await page.locator('aside').isVisible();
  const bottomNavMob = await page.locator('nav.fixed').isVisible();
  log(`Sidebar visible on mobile: ${sidebarMob}`);
  log(`Bottom nav visible on mobile: ${bottomNavMob}`);
  await shot('07b-mobile');

  // 8. Console errors
  log('\n=== 8. Console errors ===');
  log(`Total errors: ${errors.length}`);
  errors.slice(0, 10).forEach(e => log(`  ❌ ${e}`));

  // 9. TopBar content
  log('\n=== 9. TopBar ===');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/teacher/subjects`, { waitUntil: 'networkidle' });
  const topbarEl = page.locator('header, [class*="top"]').first();
  const topbarText = await topbarEl.textContent().catch(() => 'not found');
  log(`TopBar text: ${topbarText?.trim().slice(0, 120)}`);
  await shot('09-topbar');

  await browser.close();
  log('\n=== DONE ===');
  log(`Screenshots in: E:/IMP projects/Udaya/screenshots/`);
  log(`Console errors total: ${errors.length}`);
})();
