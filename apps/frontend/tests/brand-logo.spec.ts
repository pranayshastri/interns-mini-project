import { test, expect } from '@playwright/test';

test('shared logo uses supplied artwork and reloads home; favicon uses robot mark', async ({ page }) => {
  for (const route of ['/login', '/signup', '/profile-preview', '/admin-preview', '/products', '/']) {
    await page.goto(route);
    const logo = page.getByRole('link', { name: 'RoboNest home', exact: true }).first();
    await expect(logo).toBeVisible();
    await expect(logo.locator('img')).toHaveAttribute('src', '/brand/robonest-logo.png');
    await expect(logo.locator('img')).toHaveJSProperty('naturalWidth', 2172);
    await page.evaluate(() => { (window as Window & { brandReloadProbe?: boolean }).brandReloadProbe = true; });
    const navigation = page.waitForRequest(request => request.isNavigationRequest() && new URL(request.url()).pathname === '/');
    await logo.click();
    await navigation;
    await page.waitForURL('/');
    await expect.poll(() => page.evaluate(() => (window as Window & { brandReloadProbe?: boolean }).brandReloadProbe)).toBeUndefined();
  }
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
