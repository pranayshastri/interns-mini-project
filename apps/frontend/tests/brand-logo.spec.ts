import { test, expect } from '@playwright/test';

test('shared logo uses supplied artwork and reloads home; favicon uses robot mark', async ({ page }) => {
  for (const route of ['/login', '/signup', '/profile-preview', '/admin-preview', '/products', '/']) {
    await page.goto(route);
    const logo = page.getByRole('link', { name: 'RoboNest home', exact: true }).first();
    await expect(logo).toBeVisible();
    await expect(logo.locator('img')).toHaveAttribute('src', '/icon.svg');
    await expect(logo).toHaveText('robonest.');
    const wordmark = logo.locator('span').first();
    await logo.hover();
    const blue = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim());
    const expectedBlue = await page.evaluate(color => { const el = document.createElement('span'); el.style.color = color || '#2165e8'; document.body.append(el); const result = getComputedStyle(el).color; el.remove(); return result; }, blue);
    await expect(wordmark).toHaveCSS('color', expectedBlue);
    await page.mouse.move(0, 0);

    await expect(logo.locator('img')).toHaveJSProperty('complete', true);
    await page.evaluate(() => { (window as Window & { brandReloadProbe?: boolean }).brandReloadProbe = true; });
    const navigation = page.waitForRequest(request => request.isNavigationRequest() && new URL(request.url()).pathname === '/');
    await logo.click();
    await navigation;
    await page.waitForURL('/');
    await expect.poll(() => page.evaluate(() => (window as Window & { brandReloadProbe?: boolean }).brandReloadProbe)).toBeUndefined();
  }
  await expect(page.locator('.hero-art .robonest-circuit')).toBeVisible();
  await expect(page.locator('.hero-art a')).toHaveCount(0);
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute('href', /\/icon\.svg/);
  const response = await page.request.get((await icon.getAttribute('href'))!);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('viewBox="128 130 460 460"');
  await page.screenshot({ path: '../../test-artifacts/frontend/brand-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/profile-preview');
  await expect(page.getByRole('link', { name: 'RoboNest home' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '../../test-artifacts/frontend/brand-mobile.png', fullPage: true });
});
