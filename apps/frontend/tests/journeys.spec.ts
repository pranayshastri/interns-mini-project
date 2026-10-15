import { test, expect } from '@playwright/test';

test('unavailable catalog never falls back to sample products', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Build what comes next.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /robonest/i }).first()).toBeVisible();
  await expect(page.getByText('Fresh picks')).toHaveCount(0);
  await expect(page.locator('main').getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.locator('.product-card')).toHaveCount(0);
  await expect(page.getByText('DEMO STORE', { exact: true })).toHaveCount(0);
  await page.getByLabel('Search products', { exact: true }).fill('keyboard');
  await page.getByRole('button', { name: 'Submit search' }).click();
  await expect(page).toHaveURL(/products\?q=keyboard/);
  await expect(page.locator('main').getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.locator('.product-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('temporarily unavailable');
});

test('private pages require sign-in and cannot create a sample identity', async ({ page }) => {
  await page.goto('/seller');
  await expect(page).toHaveURL(/login\?returnTo=/);
  await expect(page.getByRole('button', { name: 'Enter demo account' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await expect(page.getByText('Account sign-in is temporarily unavailable.')).toBeVisible();
});

test('mobile catalog unavailable state fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
