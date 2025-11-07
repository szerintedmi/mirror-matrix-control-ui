import { test, expect, type Page } from '@playwright/test';

const MAC_ADDRESSES = ['AA:11:BB:22:CC:33', 'DD:44:EE:55:FF:66', '77:88:99:AA:BB:CC'];

const connectMockTransport = async (page: Page) => {
    await page.getByRole('button', { name: /^Connection$/i }).click();
    await page.getByRole('button', { name: 'Mock Transport' }).click();
    await page.getByRole('button', { name: /^Connect$/i }).click();
};

test.describe('Status discovery', () => {
    test('surfaces tile drivers and supports acknowledgement + filtering', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await connectMockTransport(page);
        await page.getByRole('button', { name: /^Playback$/i }).click();

        await expect(page.getByTestId('motor-overview')).toBeVisible();
        await expect(page.getByTestId('motor-overview-dot').first()).toBeVisible();

        await page.getByRole('button', { name: /array config/i }).click();

        const firstMac = MAC_ADDRESSES[0];
        const firstNodeButton = page.getByRole('button', { name: new RegExp(firstMac) });
        await expect(firstNodeButton).toBeVisible({ timeout: 2_000 });
        await expect(firstNodeButton.locator('text=New')).toBeVisible();

        await page.getByTestId('node-filter-all').click();

        for (const mac of MAC_ADDRESSES) {
            await page.getByRole('button', { name: new RegExp(mac) }).click();
        }

        await expect(page.getByText(/Session discoveries:/)).toBeVisible();

        await page.getByTestId('node-filter-offline').click();
        await expect(
            page.getByRole('button', { name: new RegExp(MAC_ADDRESSES[2]) }),
        ).toBeVisible();
        await expect(page.getByRole('button', { name: new RegExp(MAC_ADDRESSES[0]) })).toHaveCount(
            0,
        );
    });
});
