import { test, expect } from '@playwright/test';

const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Pattern Designer transforms', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Navigate to Pattern Designer page (exact match to avoid "Patterns (legacy)")
        await page.getByRole('button', { name: 'Patterns', exact: true }).click();
        // Wait for the page to load
        await expect(page.getByRole('heading', { name: 'Patterns' })).toBeVisible();
    });

    test('can create a pattern and place spots', async ({ page }) => {
        // Click the New button to create a pattern
        await page.getByRole('button', { name: 'New' }).click();

        // Wait for the main editor canvas to appear (the one with bg-gray-900 class)
        const canvasContainer = page.locator('.relative.flex.aspect-square');
        await expect(canvasContainer).toBeVisible();

        // Click on the canvas to place a spot
        await canvasContainer.click({ position: { x: 100, y: 100 } });

        // Click again to place another spot
        await canvasContainer.click({ position: { x: 200, y: 200 } });

        // Verify we can see the pattern canvas is interactive
        await expect(canvasContainer).toBeVisible();
    });

    test('transform controls are disabled when no pattern is selected', async ({ page }) => {
        // The Shift up button should be disabled when no pattern is selected
        const shiftUpButton = page.getByRole('button', { name: 'Shift up' });
        await expect(shiftUpButton).toBeDisabled();

        // Scale buttons should be disabled
        const scaleDownButton = page.getByRole('button', { name: 'Scale down' });
        await expect(scaleDownButton).toBeDisabled();

        // Rotate buttons should be disabled
        const rotateCCWButton = page.getByRole('button', { name: 'Rotate counter-clockwise' });
        await expect(rotateCCWButton).toBeDisabled();
    });

    test('transform controls are enabled when pattern is selected', async ({ page }) => {
        // Create a new pattern first
        await page.getByRole('button', { name: 'New' }).click();

        // Now all transform controls should be enabled
        const shiftUpButton = page.getByRole('button', { name: 'Shift up' });
        await expect(shiftUpButton).toBeEnabled();

        const scaleDownButton = page.getByRole('button', { name: 'Scale down' });
        await expect(scaleDownButton).toBeEnabled();

        const rotateCCWButton = page.getByRole('button', { name: 'Rotate counter-clockwise' });
        await expect(rotateCCWButton).toBeEnabled();
    });

    test('shift controls work', async ({ page }) => {
        // Create a new pattern
        await page.getByRole('button', { name: 'New' }).click();

        // Place a spot on the canvas
        const canvasContainer = page.locator('.relative.flex.aspect-square');
        await canvasContainer.click({ position: { x: 150, y: 150 } });

        // Click shift buttons (just verifying they don't error)
        await page.getByRole('button', { name: 'Shift up' }).click();
        await page.getByRole('button', { name: 'Shift down' }).click();
        await page.getByRole('button', { name: 'Shift left' }).click();
        await page.getByRole('button', { name: 'Shift right' }).click();

        // Canvas should still be visible (no crash)
        await expect(canvasContainer).toBeVisible();
    });

    test('scale controls work', async ({ page }) => {
        // Create a new pattern
        await page.getByRole('button', { name: 'New' }).click();

        // Place a spot on the canvas
        const canvasContainer = page.locator('.relative.flex.aspect-square');
        await canvasContainer.click({ position: { x: 150, y: 150 } });

        // Click scale buttons
        await page.getByRole('button', { name: 'Scale up' }).click();
        await page.getByRole('button', { name: 'Scale down' }).click();

        // Canvas should still be visible (no crash)
        await expect(canvasContainer).toBeVisible();
    });

    test('rotate controls work', async ({ page }) => {
        // Create a new pattern
        await page.getByRole('button', { name: 'New' }).click();

        // Place a spot on the canvas
        const canvasContainer = page.locator('.relative.flex.aspect-square');
        await canvasContainer.click({ position: { x: 150, y: 150 } });

        // Click rotate buttons
        await page.getByRole('button', { name: 'Rotate counter-clockwise' }).click();
        await page.getByRole('button', { name: 'Rotate clockwise' }).click();

        // Canvas should still be visible (no crash)
        await expect(canvasContainer).toBeVisible();
    });

    test('undo/redo works with keyboard shortcuts', async ({ page }) => {
        // Create a new pattern
        await page.getByRole('button', { name: 'New' }).click();

        // Place a spot on the canvas
        const canvasContainer = page.locator('.relative.flex.aspect-square');
        await canvasContainer.click({ position: { x: 150, y: 150 } });

        // Shift the pattern
        await page.getByRole('button', { name: 'Shift up' }).click();

        // Undo with keyboard
        await page.keyboard.press(`${modKey}+Z`);

        // Redo with keyboard
        await page.keyboard.press(`Shift+${modKey}+Z`);

        // Canvas should still be visible (no crash)
        await expect(canvasContainer).toBeVisible();
    });

    test('undo/redo buttons work', async ({ page }) => {
        // Create a new pattern
        await page.getByRole('button', { name: 'New' }).click();

        // Undo button should be disabled initially (no history)
        const undoButton = page.getByRole('button', { name: 'Undo' });
        const redoButton = page.getByRole('button', { name: 'Redo' });

        await expect(undoButton).toBeDisabled();
        await expect(redoButton).toBeDisabled();

        // Place a spot on the canvas
        const canvasContainer = page.locator('.relative.flex.aspect-square');
        await canvasContainer.click({ position: { x: 150, y: 150 } });

        // Shift the pattern to create history
        await page.getByRole('button', { name: 'Shift up' }).click();

        // Now undo should be enabled
        await expect(undoButton).toBeEnabled();

        // Click undo
        await undoButton.click();

        // Now redo should be enabled
        await expect(redoButton).toBeEnabled();

        // Canvas should still be visible
        await expect(canvasContainer).toBeVisible();
    });

    test('edit mode toggle works', async ({ page }) => {
        // Create a new pattern
        await page.getByRole('button', { name: 'New' }).click();

        // Placement mode should be active by default
        const placementButton = page.getByRole('button', { name: 'Placement (P)' });
        const eraseButton = page.getByRole('button', { name: 'Erase (E)' });

        await expect(placementButton).toHaveAttribute('aria-pressed', 'true');
        await expect(eraseButton).toHaveAttribute('aria-pressed', 'false');

        // Switch to erase mode
        await eraseButton.click();
        await expect(eraseButton).toHaveAttribute('aria-pressed', 'true');
        await expect(placementButton).toHaveAttribute('aria-pressed', 'false');

        // Use keyboard shortcut to switch back
        await page.keyboard.press('P');
        await expect(placementButton).toHaveAttribute('aria-pressed', 'true');

        // Use keyboard shortcut to switch to erase
        await page.keyboard.press('E');
        await expect(eraseButton).toHaveAttribute('aria-pressed', 'true');
    });

    test('independent X/Y scale toggle works', async ({ page }) => {
        // Create a new pattern
        await page.getByRole('button', { name: 'New' }).click();

        // Click the X/Y toggle button - it starts as not toggled (inactive state)
        const xyToggle = page.getByRole('button', { name: 'X/Y' });
        await expect(xyToggle).toBeVisible();

        // X and Y labels should NOT be visible initially
        await expect(page.getByText('X:')).not.toBeVisible();

        // Click to toggle on
        await xyToggle.click();

        // X and Y buttons should now be visible
        await expect(page.getByText('X:')).toBeVisible();
        await expect(page.getByText('Y:')).toBeVisible();

        // Toggle off
        await xyToggle.click();

        // X and Y labels should be hidden again
        await expect(page.getByText('X:')).not.toBeVisible();
    });
});
