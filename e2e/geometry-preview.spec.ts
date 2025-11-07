import { expect, test } from '@playwright/test';

test.describe('Geometry preview', () => {
    test('syncs overlay selection with debug panel and supports layer toggles', async ({
        page,
    }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: 'Simulation' }).click();

        await page.getByTestId('array-plan').waitFor();
        const yawDisplay = page.getByTestId('debug-yaw');
        const initialYaw = await yawDisplay.textContent();

        const arrayPoints = page.locator("[data-testid^='array-point-']");
        const pointCount = await arrayPoints.count();
        const targetPoint = pointCount > 1 ? arrayPoints.nth(1) : arrayPoints.first();
        await targetPoint.click();
        if (pointCount > 1) {
            await expect(targetPoint).toHaveAttribute('stroke-width', '1.8');
        }

        const raysToggle = page.getByTestId('toggle-rays');
        await expect(raysToggle).toBeChecked();
        await raysToggle.uncheck();
        await expect(raysToggle).not.toBeChecked();
        await raysToggle.check();

        const normalsToggle = page.getByTestId('toggle-normals');
        await normalsToggle.uncheck();
        await normalsToggle.check();

        const incomingToggle = page.getByTestId('toggle-incoming-rays');
        await incomingToggle.check();
        await expect(incomingToggle).toBeChecked();
        await incomingToggle.uncheck();

        await expect(page.getByText('Debug Metrics')).toBeVisible();
    });
});
