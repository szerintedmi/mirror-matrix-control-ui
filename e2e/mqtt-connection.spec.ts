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

        await page.getByRole('button', { name: /^Playback$/i }).click();
        await expect(page.getByTestId('motor-overview')).toBeVisible();
        await expect(page.getByTestId('motor-overview-dot').first()).toBeVisible();

        await page.getByRole('button', { name: /array config/i }).click();
        await expect(page.getByLabel('Rows:')).toBeVisible();

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
