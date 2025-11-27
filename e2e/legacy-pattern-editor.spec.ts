import { test, expect } from '@playwright/test';

const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

const clickCanvas = async (
    canvas: import('@playwright/test').Locator,
    position: { x: number; y: number },
) => {
    await canvas.click({ position });
};

const goToLegacyPatternsPage = async (page: import('@playwright/test').Page) => {
    // Patterns (legacy) is now in the Legacy submenu
    await page.getByRole('button', { name: 'Legacy' }).click();
    await page.getByRole('button', { name: 'Patterns (legacy)' }).click();
};

test.describe('Pattern editor interactions', () => {
    test('place/remove tiles with keyboard shortcuts and undo/redo history', async ({ page }) => {
        await page.goto('/');

        await goToLegacyPatternsPage(page);
        await page.getByRole('button', { name: 'Create New Pattern' }).click();

        const canvas = page.getByTestId('pattern-editor-canvas');
        const count = page.getByTestId('active-tile-count');
        const snapToggle = page.getByTestId('snap-toggle');
        const placeButton = page.getByRole('button', { name: 'Place (P)' });
        const removeButton = page.getByRole('button', { name: 'Remove (R)' });

        await expect(canvas).toBeVisible();
        await expect(count).toContainText('0 /');
        await expect(placeButton).toHaveAttribute('aria-pressed', 'true');

        await clickCanvas(canvas, { x: 50, y: 50 });
        await expect(count).toContainText('1 /');

        await clickCanvas(canvas, { x: 90, y: 90 });
        await expect(count).toContainText('2 /');

        await page.keyboard.press('R');
        await expect(removeButton).toHaveAttribute('aria-pressed', 'true');

        await clickCanvas(canvas, { x: 50, y: 50 });
        await expect(count).toContainText('1 /');

        await page.keyboard.press(`${modKey}+Z`);
        await expect(count).toContainText('2 /');

        await page.keyboard.press(`Shift+${modKey}+Z`);
        await expect(count).toContainText('1 /');

        const snapStateBefore = await snapToggle.textContent();
        await page.keyboard.press('S');
        await expect(snapToggle).not.toHaveText(snapStateBefore ?? 'On');
    });
});
