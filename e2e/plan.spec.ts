import { test, expect } from '@playwright/test';
import { doOnboarding, uniqueEmail } from './helpers';

test('register, generate a training plan, view the week calendar', async ({ page }) => {
  await doOnboarding(page);

  // Generate → not authed yet → bounced to the auth screen
  await page.getByRole('button', { name: /Générer mon programme/ }).click();
  await expect(page).toHaveURL(/\/auth/);

  // Create an account
  await page.locator('input[type="email"]').fill(uniqueEmail());
  await page.locator('input[type="password"]').fill('secret123');
  await page.getByRole('button', { name: /Créer mon compte/ }).click();

  // Back on the dashboard, now authenticated → generate for real
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('button', { name: /Générer mon programme/ }).click();

  // → week calendar
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /Semaine 1/ })).toBeVisible();
  // a session card should be present
  await expect(page.getByText(/Sortie longue|Endurance fondamentale|Fractionné/).first()).toBeVisible();
});
