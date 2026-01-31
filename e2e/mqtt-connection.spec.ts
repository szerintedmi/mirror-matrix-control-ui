import { test, expect, type Page } from '@playwright/test';

const MAC_ADDRESSES = ['AA:11:BB:22:CC:33', 'DD:44:EE:55:FF:66', '77:88:99:AA:BB:CC'];

const goToConnectionPage = async (page: Page) => {
    await page.getByRole('button', { name: /^Connection$/i }).click();
};

const selectMockTransport = async (page: Page) => {
    await goToConnectionPage(page);
    await page.getByRole('button', { name: 'Mock Transport' }).click();
};

const connectMockTransport = async (page: Page) => {
    await selectMockTransport(page);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
};

test.describe('MQTT connection panel', () => {
    test('connects using mock transport', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await connectMockTransport(page);

        await expect(page.getByText('Connected', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Disconnect' }).click();

        await expect(page.getByText('Disconnected')).toBeVisible();
    });

    test('persists connection settings across reloads', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await goToConnectionPage(page);
        await page.getByRole('button', { name: 'MQTT Broker' }).click();
        await page.getByLabel('Host').fill('broker.local');
        await page.getByLabel('Port').fill('1884');
        await page.getByLabel('Path').fill('control');
        await page.getByLabel('Username').fill('persistUser');
        await page.getByLabel('Password').fill('persistPass');

        await page.reload();

        await goToConnectionPage(page);

        const persisted = await page.evaluate(() => {
            const raw = window.localStorage.getItem('mirror:mqtt:settings');
            return raw ? JSON.parse(raw) : null;
        });
        expect(persisted?.scheme).toBe('ws');
        await expect(page.getByLabel('Host')).toHaveValue('broker.local');
        await expect(page.getByLabel('Port')).toHaveValue('1884');
        await expect(page.getByLabel('Path')).toHaveValue('/control');
        await expect(page.getByLabel('Username')).toHaveValue('persistUser');
        await expect(page.getByLabel('Password')).toHaveValue('persistPass');
    });

    test('surfaces discoveries and shows nodes in configurator', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await connectMockTransport(page);

        // Playback (legacy) is now in the Legacy submenu
        await page.getByRole('button', { name: 'Legacy' }).click();
        await page.getByRole('button', { name: /Playback \(legacy\)/i }).click();
        await expect(page.getByTestId('motor-overview')).toBeVisible({ timeout: 10_000 });
        await expect(page.getByTestId('motor-overview-dot').first()).toBeVisible({
            timeout: 10_000,
        });

        await page.getByRole('button', { name: /array config/i }).click();
        await expect(page.getByLabel('Rows:')).toBeVisible();

        // Wait for node discovery - nodes show partial MAC in the UI (last 5 chars)
        // The mock transport broadcasts status immediately but UI may need time to process
        const firstMac = MAC_ADDRESSES[0];
        const shortMac = firstMac.slice(-5); // e.g., "C:33" from "AA:11:BB:22:CC:33"
        const firstNodeButton = page.locator(`text=${shortMac}`).first();
        await expect(firstNodeButton).toBeVisible({ timeout: 10_000 });

        await page.getByTestId('node-filter-all').click();

        // Click on nodes to select them - nodes display short MAC labels
        for (const mac of MAC_ADDRESSES.slice(0, 2)) {
            // Only first 2 are online
            const shortLabel = mac.slice(-5);
            await page.locator(`text=${shortLabel}`).first().click();
        }

        await page.getByTestId('node-filter-offline').click();
        // Third node is offline - verify it shows in offline filter
        const offlineMacShort = MAC_ADDRESSES[2].slice(-5);
        await expect(page.locator(`text=${offlineMacShort}`).first()).toBeVisible({
            timeout: 5_000,
        });
        // Online nodes should not appear in offline filter
        await expect(page.locator(`text=${shortMac}`)).toHaveCount(0);
    });
});
