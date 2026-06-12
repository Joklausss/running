import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/onboarding');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/onboarding');
});

test('complete the 4-step onboarding wizard → dashboard', async ({ page }) => {
  // Step 1 — objective
  await page.getByRole('button', { name: /Bien-être général/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();

  // Step 2 — level
  await page.getByRole('button', { name: /Intermédiaire/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();

  // Step 3 — constraints: pick 3 days (default = 3 sessions/week)
  for (const d of ['Lun', 'Mer', 'Sam']) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Continuer' }).click();

  // Step 4 — location via (mocked) geolocation
  await page.getByRole('button', { name: /Utiliser ma position/ }).click();
  await page.getByRole('button', { name: /Créer mon profil/ }).click();

  // → dashboard
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: /Tableau de bord/ })).toBeVisible();
});
