import { test, expect, type Page } from '@playwright/test';

const PATTERN_STORAGE = {
    version: 1,
    patterns: [
        {
            id: 'playback-pattern',
            name: 'Playback Pattern',
            canvas: { width: 10, height: 10 },
            tiles: [
                {
                    id: 'tile-0',
                    center: { x: 5, y: 5 },
                    size: { width: 10, height: 10 },
                },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        },
    ],
};

const MQTT_SETTINGS = {
    scheme: 'mock',
    host: 'localhost',
    port: 9001,
    path: '/',
    username: 'mirror',
    password: 'steelthread',
};

const GRID_STORAGE = {
    version: 1,
    gridSize: { rows: 2, cols: 2 },
    assignments: {
        '0-0': {
            x: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 0 },
            y: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 1 },
        },
        '0-1': {
            x: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 2 },
            y: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 3 },
        },
        '1-0': {
            x: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 4 },
            y: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 5 },
        },
        '1-1': {
            x: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 6 },
            y: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 7 },
        },
    },
};

const setupLocalState = async (page: Page) => {
    await page.addInitScript(
        ({ patternStorage, gridStorage, mqttSettings }) => {
            window.localStorage.setItem('mirror:patterns', JSON.stringify(patternStorage));
            const collection = {
                version: 1,
                snapshots: {
                    'Playwright Snapshot': {
                        savedAt: new Date().toISOString(),
                        state: gridStorage,
                    },
                },
                lastSelected: 'Playwright Snapshot',
            };
            window.localStorage.setItem('mirror:grid-config', JSON.stringify(collection));
            window.localStorage.setItem('mirror:mqtt:settings', JSON.stringify(mqttSettings));
        },
        {
            patternStorage: PATTERN_STORAGE,
            gridStorage: GRID_STORAGE,
            mqttSettings: MQTT_SETTINGS,
        },
    );
};

test.describe.skip('Playback conversion & commands', () => {
    test('plans and runs playback via mock broker', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await setupLocalState(page);
        await page.reload();

        await page.getByRole('button', { name: 'Playback Pattern' }).click();
        const patternDialog = page.getByRole('dialog', { name: 'Select Pattern' });
        await expect(patternDialog).toBeVisible();
        await patternDialog.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(patternDialog).toBeHidden();
        const previewButton = page.getByRole('button', { name: 'Preview Commands' });
        await expect(previewButton).toBeEnabled();
        await previewButton.click();
        const previewDialog = page.getByRole('dialog', { name: 'Command Preview' });
        await expect(previewDialog).toBeVisible();
        const commandRows = previewDialog.locator('tbody tr');
        await expect(commandRows.first()).toBeVisible();
        await previewDialog.getByRole('button', { name: 'Close', exact: true }).click();

        const playButton = page.getByRole('button', { name: /^Play$/i });
        await expect(playButton).toBeEnabled();
        await playButton.click();

        await expect(page.getByText('Playback commands completed.', { exact: true })).toBeVisible();

        const logSection = page.getByRole('heading', { name: 'Playback Log' });
        await expect(logSection).toBeVisible();
    });
});
