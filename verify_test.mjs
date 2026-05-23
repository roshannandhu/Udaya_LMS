import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3001';
const shots = [];
const errors = [];
const log = (msg) => console.log(msg);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

const shot = async (name) => {
  const p = `E:/IMP projects/Udaya/screenshots/${name}.png`;
  fs.mkdirSync('E:/IMP projects/Udaya/screenshots', { recursive: true });
  await page.screenshot({ path: p, fullPage: false });
  shots.push(p);
  log(`📸 ${name}`);
};

// 1. Login page
log('\n=== 1. Login page ===');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
const toggleVisible = await page.locator('text=Teacher').isVisible();
const studentToggle = await page.locator('text=Student').isVisible();
log(`Teacher toggle: ${toggleVisible}, Student toggle: ${studentToggle}`);
await shot('01-login');

// 2. Log in as teacher
log('\n=== 2. Teacher login ===');
await page.locator('button:has-text("Teacher")').click();
await page.locator('input[type="email"]').fill('teacher@tutoria.com');
await page.locator('input[type="password"]').fill('Test1234');
await page.locator('button:has-text("Sign in")').click();
await page.waitForURL('**/teacher**', { timeout: 8000 }).catch(() => {});
log(`URL after login: ${page.url()}`);
await shot('02-after-login');

// 3. Teacher dashboard
log('\n=== 3. Teacher dashboard ===');
await page.waitForLoadState('networkidle');
const dashTitle = await page.locator('h1, h2').first().textContent().catch(() => 'N/A');
log(`Dashboard heading: ${dashTitle}`);
const hasMockData = await page.locator('text=Aarav').isVisible().catch(() => false);
log(`Mock data visible (Aarav): ${hasMockData}`);
await shot('03-dashboard');

// 4. Subjects page
log('\n=== 4. Subjects page ===');
await page.goto(`${BASE}/teacher/subjects`, { waitUntil: 'networkidle' });
const subjTitle = await page.locator('text=Subjects').first().isVisible();
log(`Subjects page loaded: ${subjTitle}`);
await shot('04-subjects');

// 5. Students page
log('\n=== 5. Students page ===');
await page.goto(`${BASE}/teacher/students`, { waitUntil: 'networkidle' });
const studTitle = await page.locator('text=Students').first().isVisible();
log(`Students page loaded: ${studTitle}`);
await shot('05-students');

// 6. Broadcasts page
log('\n=== 6. Broadcasts page ===');
await page.goto(`${BASE}/teacher/broadcasts`, { waitUntil: 'networkidle' });
const bcTitle = await page.locator('text=Broadcasts, text=Inbox').first().isVisible().catch(() => false);
log(`Broadcasts page loaded: ${bcTitle}`);
await shot('06-broadcasts');

// 7. Desktop layout — sidebar visible, bottom nav hidden
log('\n=== 7. Desktop layout (1280px) ===');
await page.goto(`${BASE}/teacher`, { waitUntil: 'networkidle' });
const sidebarVisible = await page.locator('aside').isVisible().catch(() => false);
const bottomNavVisible = await page.locator('nav.fixed.bottom-0').isVisible().catch(() => false);
log(`Sidebar visible: ${sidebarVisible}`);
log(`Bottom nav visible: ${bottomNavVisible}`);
await shot('07-desktop-layout');

// 7b. Mobile layout (375px)
log('\n=== 7b. Mobile layout (375px) ===');
await page.setViewportSize({ width: 375, height: 812 });
await page.reload({ waitUntil: 'networkidle' });
const sidebarMobile = await page.locator('aside').isVisible().catch(() => false);
const bottomNavMobile = await page.locator('nav.fixed').isVisible().catch(() => false);
log(`Sidebar visible on mobile: ${sidebarMobile}`);
log(`Bottom nav visible on mobile: ${bottomNavMobile}`);
await shot('07b-mobile-layout');

// 8. Console errors
log('\n=== 8. Console errors ===');
log(`Errors collected: ${errors.length}`);
errors.forEach(e => log(`  ❌ ${e}`));

// 9. TopBar breadcrumb
log('\n=== 9. TopBar ===');
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/teacher/subjects`, { waitUntil: 'networkidle' });
const breadcrumb = await page.locator('[class*="breadcrumb"], nav[aria-label="breadcrumb"], .topbar').isVisible().catch(() => false);
const topbarText = await page.locator('header, [class*="topbar"], [class*="TopBar"]').first().textContent().catch(() => 'N/A');
log(`Breadcrumb element visible: ${breadcrumb}`);
log(`TopBar text: ${topbarText?.slice(0, 100)}`);
await shot('09-topbar');

await browser.close();

log('\n=== SUMMARY ===');
log(`Screenshots saved: ${shots.length}`);
log(`Console errors: ${errors.length}`);
