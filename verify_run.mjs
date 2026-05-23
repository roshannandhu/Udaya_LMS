import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = 'E:\\IMP projects\\Udaya\\screenshots\\verify_run';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const shot = async (page, name) => {
  const p = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`Screenshot: ${p}`);
};

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // ── 1. Login page loads ──
  await page.goto('http://localhost:3001');
  await page.waitForLoadState('networkidle');
  await shot(page, '01_login_page');
  console.log('STEP 1: Login page loaded, title:', await page.title());

  // ── 2. Try wrong credentials ──
  await page.fill('input[type="email"]', 'wrong@example.com');
  await page.fill('input[type="password"]', 'wrongpass');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await shot(page, '02_login_wrong_creds');
  const errVisible = await page.locator('text=/invalid|incorrect|error|failed/i').count();
  console.log('STEP 2: Wrong creds error shown:', errVisible > 0);

  // ── 3. Teacher login ──
  await page.fill('input[type="email"]', 'roshannandhu1100@gmail.com');
  await page.fill('input[type="password"]', 'Teacher@123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await shot(page, '03_after_teacher_login');
  console.log('STEP 3: URL after login:', page.url());

  // ── 4. Teacher dashboard (Today page) ──
  const isTeacher = page.url().includes('/teacher');
  console.log('STEP 4: On teacher portal:', isTeacher);
  if (isTeacher) {
    await shot(page, '04_teacher_today');

    // ── 5. Navigate to Subjects ──
    const subjectsLink = page.locator('text=Subjects').first();
    if (await subjectsLink.count() > 0) {
      await subjectsLink.click();
      await page.waitForTimeout(1500);
      await shot(page, '05_teacher_subjects');
      console.log('STEP 5: Subjects page loaded, URL:', page.url());
    } else {
      console.log('STEP 5: Subjects nav not found');
    }

    // ── 6. Navigate to Students ──
    const studentsLink = page.locator('text=Students').first();
    if (await studentsLink.count() > 0) {
      await studentsLink.click();
      await page.waitForTimeout(1500);
      await shot(page, '06_teacher_students');
      console.log('STEP 6: Students page loaded, URL:', page.url());
    } else {
      console.log('STEP 6: Students nav not found');
    }

    // ── 7. Navigate to Broadcasts ──
    const bcastLink = page.locator('text=Broadcasts').first();
    if (await bcastLink.count() > 0) {
      await bcastLink.click();
      await page.waitForTimeout(1500);
      await shot(page, '07_teacher_broadcasts');
      console.log('STEP 7: Broadcasts page loaded, URL:', page.url());
    }

    // ── 8. Navigate to Tests ──
    const testsLink = page.locator('text=Tests').first();
    if (await testsLink.count() > 0) {
      await testsLink.click();
      await page.waitForTimeout(1500);
      await shot(page, '08_teacher_tests');
      console.log('STEP 8: Tests page loaded, URL:', page.url());
    }
  }

  // ── 9. Logout ──
  await page.goto('http://localhost:3001/teacher');
  await page.waitForTimeout(1000);
  const moreTab = page.locator('[href*="more"], text=More, button:has-text("More")').first();
  if (await moreTab.count() > 0) {
    await moreTab.click();
    await page.waitForTimeout(800);
    await shot(page, '09_more_menu');
    const logoutBtn = page.locator('text=Logout, text=Sign out').first();
    if (await logoutBtn.count() > 0) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);
      await shot(page, '10_after_logout');
      console.log('STEP 9: After logout URL:', page.url());
    }
  }

  // ── 10. Student login probe ──
  await page.goto('http://localhost:3001/login');
  await page.waitForTimeout(800);
  // Try to toggle to student role if there's a role switch
  const studentTab = page.locator('text=Student, button:has-text("Student")').first();
  if (await studentTab.count() > 0) {
    await studentTab.click();
    await page.waitForTimeout(500);
  }
  await shot(page, '11_student_login_tab');
  console.log('STEP 10: Student login tab visible:', await studentTab.count() > 0);

  await browser.close();
  console.log('Done. Screenshots in:', SCREENSHOTS_DIR);
})();
