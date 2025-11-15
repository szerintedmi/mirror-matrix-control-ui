import { test, expect, type Locator, type Page } from '@playwright/test';

const connectMockTransport = async (page: Page) => {
    await page.getByRole('button', { name: /^Connection$/i }).click();
    await page.getByRole('button', { name: 'Mock Transport' }).click();
    await page.getByRole('button', { name: /^Connect$/i }).click();
};

const getAxisCount = async (locator: Locator): Promise<number> => {
    const text = await locator.textContent();
    const match = text?.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
};

const performDrag = async (page: Page, sourceId: string, targetId: string) => {
    await page.evaluate(
        ({ sourceId: s, targetId: t }) => {
            const source = document.querySelector(`[data-testid="${s}"]`) as HTMLElement | null;
            const target = document.querySelector(`[data-testid="${t}"]`) as HTMLElement | null;
            if (!source || !target) {
                throw new Error(`Missing drag handles for ${s} -> ${t}`);
            }
            const dataTransfer = new DataTransfer();
            dataTransfer.effectAllowed = 'move';
            source.dispatchEvent(
                new DragEvent('dragstart', {
                    dataTransfer,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            target.dispatchEvent(
                new DragEvent('dragover', {
                    dataTransfer,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            target.dispatchEvent(
                new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }),
            );
            source.dispatchEvent(
                new DragEvent('dragend', { dataTransfer, bubbles: true, cancelable: true }),
            );
        },
        { sourceId, targetId },
    );
};

test.describe('Grid configurator interactions', () => {
    test('assigns, unassigns, and confirms shrink operations', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await connectMockTransport(page);
        await page.getByRole('button', { name: /array config/i }).click();

        const unassignedTray = page.getByRole('region', { name: /unassigned motors tray/i });
        await expect(unassignedTray).toBeVisible();

        const unassignedTrayTestId = 'unassigned-motor-tray';

        const motorChip = unassignedTray.locator('text=/Motor\\s+\\d+/').first();
        await expect(motorChip).toBeVisible({ timeout: 30_000 });

        const firstMotorTestId = await motorChip.getAttribute('data-testid');
        if (!firstMotorTestId) {
            throw new Error('Could not determine test id for first motor chip');
        }

        const axisSummaryLocator = unassignedTray.getByTestId('unassigned-axes-summary');
        await expect(axisSummaryLocator).toBeVisible({ timeout: 30_000 });
        const initialAxes = await getAxisCount(axisSummaryLocator);

        const firstAxisSlot = page.getByTestId('mirror-slot-x-0-0');

        await performDrag(page, firstMotorTestId, 'mirror-slot-x-0-0');

        await expect(firstAxisSlot).toContainText(':');
        const afterAssignAxes = await getAxisCount(axisSummaryLocator);
        expect(afterAssignAxes).toBe(initialAxes - 1);

        await performDrag(page, 'mirror-slot-x-0-0', unassignedTrayTestId);

        await expect(firstAxisSlot.getByText('--')).toBeVisible();
        const afterUnassignAxes = await getAxisCount(axisSummaryLocator);
        expect(afterUnassignAxes).toBe(initialAxes);

        const targetMotor = await unassignedTray
            .locator('[data-testid^="unassigned-motor-"]')
            .nth(1)
            .getAttribute('data-testid');
        if (!targetMotor) {
            throw new Error('Unable to locate second motor test id');
        }
        const deepAxisSlotId = 'mirror-slot-x-2-0';
        await performDrag(page, targetMotor, deepAxisSlotId);

        const axesBeforeShrink = await getAxisCount(axisSummaryLocator);
        expect(axesBeforeShrink).toBe(initialAxes - 1);

        const rowsInput = page.getByLabel('Rows:');
        await rowsInput.fill('2');

        const shrinkDialog = page.getByRole('dialog');
        await expect(shrinkDialog).toBeVisible();
        await expect(shrinkDialog).toContainText('Shrink grid to 2×');
        await shrinkDialog.getByRole('button', { name: 'Shrink and unassign' }).click();

        await expect(page.getByTestId('mirror-cell-2-0')).toHaveCount(0);
        const axesAfterShrink = await getAxisCount(axisSummaryLocator);
        expect(axesAfterShrink).toBe(initialAxes);
    });

    test('saves and loads grid configuration snapshots', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await connectMockTransport(page);
        await page.getByRole('button', { name: /array config/i }).click();

        const unassignedTray = page.getByRole('region', { name: /unassigned motors tray/i });
        await expect(unassignedTray).toBeVisible();
        const firstMotor = unassignedTray.locator('[data-testid^="unassigned-motor-"]').first();
        const motorTestId = await firstMotor.getAttribute('data-testid');
        if (!motorTestId) {
            throw new Error('Missing motor test id');
        }

        await performDrag(page, motorTestId, 'mirror-slot-x-0-0');
        await expect(page.getByTestId('mirror-slot-x-0-0')).toContainText(':');

        const snapshotName = 'Test Snapshot';
        await page.getByTestId('array-config-name-input').fill(snapshotName);
        await page.getByTestId('array-save-config').click();
        await expect(page.getByTestId('array-persistence-status')).toContainText('Saved config', {
            timeout: 5_000,
        });

        await performDrag(page, 'mirror-slot-x-0-0', 'unassigned-motor-tray');
        await expect(page.getByTestId('array-unsaved-indicator')).toBeVisible();

        await page.getByTestId('array-saved-config-select').selectOption(snapshotName);
        await page.getByTestId('array-load-config').click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(/load saved config/i);
        await dialog.getByRole('button', { name: /load config/i }).click();

        await expect(page.getByTestId('mirror-slot-x-0-0')).toContainText(':');
        await expect(page.getByTestId('array-persistence-status')).toContainText('Loaded config', {
            timeout: 5_000,
        });
    });
});
