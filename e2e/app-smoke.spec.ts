import { test, expect } from '@playwright/test';

test.describe('Mirror Matrix Control', () => {
    test('loads the library view and navigates to configurator', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'Pattern Library' })).toBeVisible();

        await page.getByRole('button', { name: 'Configure Array' }).click();

        await expect(
            page.getByRole('heading', { name: 'Mirror Array Configurator' }),
        ).toBeVisible();
    });
});
