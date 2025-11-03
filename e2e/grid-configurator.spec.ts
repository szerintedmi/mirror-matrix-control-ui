import { test, expect, type Locator } from '@playwright/test';

const getAxisCount = async (locator: Locator): Promise<number> => {
    const text = await locator.textContent();
    const match = text?.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
};

test.describe('Grid configurator interactions', () => {
    test('assigns, unassigns, and confirms shrink operations', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await page.getByRole('button', { name: 'Show Settings' }).click();
        await page.getByLabel('Scheme').selectOption('mock');
        await page.getByRole('button', { name: 'Connect', exact: true }).click();

        await page.getByRole('button', { name: 'Configure Array' }).click();

        const unassignedTray = page.getByRole('region', { name: /unassigned motors tray/i });
        await expect(unassignedTray).toBeVisible();

        const unassignedTrayTestId = 'unassigned-motor-tray';

        const motorChip = unassignedTray.locator('text=/Motor\\s+\\d+/').first();
        await expect(motorChip).toBeVisible({ timeout: 30_000 });

        const firstMotorTestId = await motorChip.getAttribute('data-testid');
        if (!firstMotorTestId) {
            throw new Error('Could not determine test id for first motor chip');
        }

        const axisSummaryLocator = unassignedTray.locator('text=/axes? available/i').first();
        await expect(axisSummaryLocator).toBeVisible({ timeout: 30_000 });
        const initialAxes = await getAxisCount(axisSummaryLocator);

        const firstAxisSlot = page.getByTestId('mirror-slot-x-0-0');

        const performDrag = async (sourceId: string, targetId: string) => {
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
                        new DragEvent('dragstart', { dataTransfer, bubbles: true, cancelable: true }),
                    );
                    target.dispatchEvent(
                        new DragEvent('dragover', { dataTransfer, bubbles: true, cancelable: true }),
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

        await performDrag(firstMotorTestId, 'mirror-slot-x-0-0');

        await expect(firstAxisSlot).toContainText(':');
        const afterAssignAxes = await getAxisCount(axisSummaryLocator);
        expect(afterAssignAxes).toBe(initialAxes - 1);

        await performDrag('mirror-slot-x-0-0', unassignedTrayTestId);

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
        await performDrag(targetMotor, deepAxisSlotId);

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
});
