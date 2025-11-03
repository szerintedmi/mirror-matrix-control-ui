import { test, expect } from '@playwright/test';

const MAC_ADDRESSES = ['AA:11:BB:22:CC:33', 'DD:44:EE:55:FF:66', '77:88:99:AA:BB:CC'];

test.describe('Status discovery', () => {
    test('surfaces tile drivers and supports acknowledgement + filtering', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await page.getByRole('button', { name: 'Show Settings' }).click();
        await page.getByLabel('Scheme').selectOption('mock');
        await page.getByRole('button', { name: 'Connect', exact: true }).click();

        await expect(page.getByTestId('motor-overview')).toBeVisible();
        await expect(page.getByTestId('motor-overview-dot').first()).toBeVisible();

        await page.getByRole('button', { name: 'Configure Array' }).click();

        const firstMac = MAC_ADDRESSES[0];
        const firstNodeButton = page.getByRole('button', { name: new RegExp(firstMac) });
        await expect(firstNodeButton).toBeVisible({ timeout: 2_000 });
        await expect(firstNodeButton.locator('text=New')).toBeVisible();

        for (const mac of MAC_ADDRESSES) {
            await page.getByRole('button', { name: new RegExp(mac) }).click();
        }

        await expect(page.getByText(/Session discoveries:/)).toBeVisible();

        await page.getByRole('button', { name: 'Offline', exact: true }).click();
        await expect(
            page.getByRole('button', { name: new RegExp(MAC_ADDRESSES[2]) }),
        ).toBeVisible();
        await expect(page.getByRole('button', { name: new RegExp(MAC_ADDRESSES[0]) })).toHaveCount(
            0,
        );
    });
});
