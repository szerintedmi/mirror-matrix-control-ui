import { test, expect } from '@playwright/test';

test.describe('Mirror Matrix Control', () => {
    test('loads the library view and navigates to configurator', async ({ page }) => {
        await page.goto('/');

        await page.waitForLoadState('networkidle');

        await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 15000 });
        const arrayConfigNav = page.getByRole('button', { name: /array config/i });
        await expect(arrayConfigNav).toBeVisible();
        await arrayConfigNav.click();

        await expect(page.getByLabel('Rows:')).toBeVisible();
    });
});
