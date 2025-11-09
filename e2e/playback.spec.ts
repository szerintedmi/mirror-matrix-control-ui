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

const GRID_STORAGE = {
    version: 1,
    gridSize: { rows: 1, cols: 1 },
    assignments: {
        '0-0': {
            x: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 0 },
            y: { nodeMac: 'AA:11:BB:22:CC:33', motorIndex: 1 },
        },
    },
};

const setupLocalState = async (page: Page) => {
    await page.addInitScript(
        ({ patternStorage, gridStorage }) => {
            window.localStorage.setItem('mirror:patterns', JSON.stringify(patternStorage));
            window.localStorage.setItem('mirror:grid-config', JSON.stringify(gridStorage));
        },
        { patternStorage: PATTERN_STORAGE, gridStorage: GRID_STORAGE },
    );
};

const connectMockTransport = async (page: Page) => {
    await page.getByRole('button', { name: /^Connection$/i }).click();
    await page.getByRole('button', { name: 'Mock Transport' }).click();
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Playback$/i }).click();
};

test.describe('Playback conversion & commands', () => {
    test('plans and runs playback via mock broker', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await setupLocalState(page);
        await page.reload();

        await connectMockTransport(page);

        const planButton = page.getByRole('button', { name: 'Plan Playback' });
        await expect(planButton).toBeEnabled();
        await planButton.click();
        await expect(page.getByText('Playback plan is ready.')).toBeVisible();

        const previewButton = page.getByRole('button', { name: 'Preview Commands' });
        await expect(previewButton).toBeEnabled();
        await previewButton.click();
        const previewDialog = page.getByRole('dialog', { name: 'Command Preview' });
        await expect(previewDialog).toBeVisible();
        await expect(previewDialog.getByText(/MOVE commands ready/i)).toBeVisible();
        await previewDialog.getByRole('button', { name: 'Close', exact: true }).click();

        const playButton = page.getByRole('button', { name: /^Play$/i });
        await expect(playButton).toBeEnabled();
        await playButton.click();

        await expect(page.getByText('Playback commands completed.', { exact: true })).toBeVisible();
        await expect(
            page.getByText('Playback commands completed successfully.', { exact: false }),
        ).toBeVisible();

        const logSection = page.getByRole('heading', { name: 'Playback Log' });
        await expect(logSection).toBeVisible();
    });
});
