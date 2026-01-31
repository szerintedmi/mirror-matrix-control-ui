import { test, expect, type Page } from '@playwright/test';

const connectMockTransport = async (page: Page) => {
    await page.getByRole('button', { name: /^Connection$/i }).click();
    await page.getByRole('button', { name: 'Mock Transport' }).click();
    await page.getByRole('button', { name: /^Connect$/i }).click();
};

const performDrag = async (page: Page, sourceTestId: string, targetTestId: string) => {
    // Wait for both source and target elements to be visible before attempting drag
    const source = page.getByTestId(sourceTestId);
    const target = page.getByTestId(targetTestId);

    await expect(source).toBeVisible({ timeout: 5_000 });
    await expect(target).toBeVisible({ timeout: 5_000 });

    // Use page.evaluate to dispatch drag events
    await page.evaluate(
        ({ sourceId, targetId }) => {
            const sourceEl = document.querySelector(
                `[data-testid="${sourceId}"]`,
            ) as HTMLElement | null;
            const targetEl = document.querySelector(
                `[data-testid="${targetId}"]`,
            ) as HTMLElement | null;
            if (!sourceEl || !targetEl) {
                const allTestIds = Array.from(document.querySelectorAll('[data-testid]'))
                    .map((el) => el.getAttribute('data-testid'))
                    .slice(0, 20);
                throw new Error(
                    `Missing drag handles for ${sourceId} -> ${targetId}. Available testids: ${allTestIds.join(', ')}`,
                );
            }
            const dataTransfer = new DataTransfer();
            dataTransfer.effectAllowed = 'move';
            sourceEl.dispatchEvent(
                new DragEvent('dragstart', {
                    dataTransfer,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            targetEl.dispatchEvent(
                new DragEvent('dragover', {
                    dataTransfer,
                    bubbles: true,
                    cancelable: true,
                }),
            );
            targetEl.dispatchEvent(
                new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }),
            );
            sourceEl.dispatchEvent(
                new DragEvent('dragend', { dataTransfer, bubbles: true, cancelable: true }),
            );
        },
        { sourceId: sourceTestId, targetId: targetTestId },
    );
};

test.describe('Grid configurator interactions', () => {
    test('assigns, unassigns, and confirms shrink operations', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await connectMockTransport(page);
        await page.getByRole('button', { name: /array config/i }).click();

        // Wait for nodes to be discovered - the nodes panel contains "Nodes" heading
        const nodesPanel = page.locator('aside').filter({ hasText: 'Nodes' });
        await expect(nodesPanel).toBeVisible();

        // Wait for motor chips to appear (they display as :0, :1, etc.)
        const motorChip = nodesPanel
            .locator('[data-testid^="node-"][data-testid*="-motor-"]')
            .first();
        await expect(motorChip).toBeVisible({ timeout: 30_000 });

        const firstMotorTestId = await motorChip.getAttribute('data-testid');
        if (!firstMotorTestId) {
            throw new Error('Could not determine test id for first motor chip');
        }

        const firstAxisSlot = page.getByTestId('mirror-slot-x-0-0');

        await performDrag(page, firstMotorTestId, 'mirror-slot-x-0-0');

        // After assignment, slot should show motor index (e.g., ":0")
        await expect(firstAxisSlot).toContainText(':');

        // Drag back to nodes panel to unassign
        await performDrag(page, 'mirror-slot-x-0-0', firstMotorTestId);

        await expect(firstAxisSlot.getByText('--')).toBeVisible();

        // Find a second motor to test grid shrink behavior
        const secondMotor = nodesPanel
            .locator('[data-testid^="node-"][data-testid*="-motor-"]')
            .nth(1);
        const secondMotorTestId = await secondMotor.getAttribute('data-testid');
        if (!secondMotorTestId) {
            throw new Error('Unable to locate second motor test id');
        }
        const deepAxisSlotId = 'mirror-slot-x-2-0';
        await performDrag(page, secondMotorTestId, deepAxisSlotId);

        // Verify assignment worked
        await expect(page.getByTestId(deepAxisSlotId)).toContainText(':');

        const rowsInput = page.getByLabel('Rows:');
        await rowsInput.fill('2');

        const shrinkDialog = page.getByRole('dialog');
        await expect(shrinkDialog).toBeVisible();
        await expect(shrinkDialog).toContainText('Shrink grid to 2×');
        await shrinkDialog.getByRole('button', { name: 'Shrink and unassign' }).click();

        await expect(page.getByTestId('mirror-cell-2-0')).toHaveCount(0);
    });

    test('saves and loads grid configuration snapshots', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();

        await connectMockTransport(page);
        await page.getByRole('button', { name: /array config/i }).click();

        // Wait for nodes panel with motor chips (filter by "Nodes" heading to avoid nav aside)
        const nodesPanel = page.locator('aside').filter({ hasText: 'Nodes' });
        await expect(nodesPanel).toBeVisible();
        const firstMotor = nodesPanel
            .locator('[data-testid^="node-"][data-testid*="-motor-"]')
            .first();
        await expect(firstMotor).toBeVisible({ timeout: 30_000 });
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

        // Drag motor back to unassign (drag to the aside panel)
        await performDrag(page, 'mirror-slot-x-0-0', motorTestId);
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
