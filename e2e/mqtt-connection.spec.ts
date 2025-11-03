import { test, expect } from '@playwright/test';

test.describe('MQTT connection panel', () => {
    test('connects using mock transport', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await page.getByRole('button', { name: 'Show Settings' }).click();
        await page.getByLabel('Scheme').selectOption('mock');

        await page.getByRole('button', { name: 'Connect', exact: true }).click();

        await expect(page.getByText('Status:')).toBeVisible();

        await expect(page.getByText('Connected', { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Disconnect' }).click();

        await expect(page.getByText('Disconnected')).toBeVisible();
    });

    test('persists connection settings across reloads', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await page.getByRole('button', { name: 'Show Settings' }).click();
        await page.getByLabel('Scheme').selectOption('mock');
        await page.getByLabel('Host').fill('broker.local');
        await page.getByLabel('Port').fill('1884');
        await page.getByLabel('Path').fill('control');
        await page.getByLabel('Username').fill('persistUser');
        await page.getByLabel('Password').fill('persistPass');

        await page.reload();

        await page.getByRole('button', { name: 'Show Settings' }).click();

        await expect(page.getByLabel('Scheme')).toHaveValue('mock');
        await expect(page.getByLabel('Host')).toHaveValue('broker.local');
        await expect(page.getByLabel('Port')).toHaveValue('1884');
        await expect(page.getByLabel('Path')).toHaveValue('/control');
        await expect(page.getByLabel('Username')).toHaveValue('persistUser');
        await expect(page.getByLabel('Password')).toHaveValue('persistPass');
    });

    test('displays mock tile drivers in configurator', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await page.getByRole('button', { name: 'Show Settings' }).click();
        await page.getByLabel('Scheme').selectOption('mock');
        await page.getByRole('button', { name: 'Connect', exact: true }).click();

        await page.getByRole('button', { name: 'Configure Array' }).click();

        await expect(
            page.getByRole('heading', { name: 'Mirror Array Configurator' }),
        ).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'AA:11:BB:22:CC:33', exact: true }),
        ).toBeVisible();
    });
});
