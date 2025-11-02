import { test, expect } from '@playwright/test';

test.describe('Mirror Matrix Control', () => {
    test('loads the library view and navigates to configurator', async ({ page }) => {
        await page.goto('/');

        await page.waitForLoadState('networkidle');

        await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: 'Configure Array' })).toBeVisible();

        await page.getByRole('button', { name: 'Configure Array' }).click();

        await expect(
            page.getByRole('heading', { name: 'Mirror Array Configurator' }),
        ).toBeVisible();
    });
});
