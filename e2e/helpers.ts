import { type Page, expect } from '@playwright/test';

/** Walk through the onboarding wizard and land on the dashboard. */
export async function doOnboarding(page: Page): Promise<void> {
  await page.goto('/onboarding');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/onboarding');

  await page.getByRole('button', { name: /Bien-être général/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();

  await page.getByRole('button', { name: /Intermédiaire/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();

  for (const d of ['Lun', 'Mer', 'Sam']) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Continuer' }).click();

  await page.getByRole('button', { name: /Utiliser ma position/ }).click();
  await page.getByRole('button', { name: /Créer mon profil/ }).click();

  await expect(page).toHaveURL(/\/dashboard/);
}

export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.dev`;
}
