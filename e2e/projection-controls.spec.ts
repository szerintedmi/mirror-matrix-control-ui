import { expect, test } from '@playwright/test';

import type { Locator } from '@playwright/test';

const setRangeValue = async (locator: Locator, value: string) => {
    await locator.evaluate((element, next) => {
        const input = element as HTMLInputElement;
        const nativeValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
        )?.set;
        nativeValueSetter?.call(input, next);
        const inputEvent =
            typeof window.InputEvent === 'function'
                ? new InputEvent('input', { bubbles: true, composed: true })
                : new Event('input', { bubbles: true });
        input.dispatchEvent(inputEvent);
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
};

test.describe('Projection controls', () => {
    test('persist values and support reset', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await page.getByRole('button', { name: 'Simulation' }).click();

        const wallSlider = page.getByTestId('projection-wall-distance-slider');
        await setRangeValue(wallSlider, '6.2');
        await expect(wallSlider).toHaveValue('6.2');

        const offsetInput = page.getByTestId('projection-offset-input');
        await offsetInput.fill('0.35');
        await expect(offsetInput).toHaveValue('0.35');

        const yawSlider = page.getByTestId('orientation-wall-yaw');
        await setRangeValue(yawSlider, '15');
        await expect(yawSlider).toHaveValue('15');

        const sunDiameterInput = page.getByTestId('sun-angular-diameter-input');
        await sunDiameterInput.fill('0.8');
        await expect(sunDiameterInput).toHaveValue('0.8');

        await expect
            .poll(
                async () => {
                    const raw = await page.evaluate(() =>
                        window.localStorage.getItem('mirror:projection-settings'),
                    );
                    if (!raw) {
                        return null;
                    }
                    try {
                        const parsed = JSON.parse(raw) as {
                            settings?: { wallOrientation?: { yaw?: number } };
                        };
                        return parsed.settings?.wallOrientation?.yaw ?? null;
                    } catch {
                        return null;
                    }
                },
                { timeout: 5000, intervals: [100, 250, 500] },
            )
            .toBe(15);

        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.getByRole('button', { name: 'Simulation' }).click();

        const persisted = await page.evaluate(() => {
            const raw = window.localStorage.getItem('mirror:projection-settings');
            return raw ? JSON.parse(raw) : null;
        });
        expect(persisted?.settings?.wallOrientation?.yaw).toBe(15);

        await expect(page.getByTestId('projection-offset-input')).toHaveValue('0.35');
        await expect(page.getByTestId('orientation-wall-yaw')).toHaveValue('15');
        await expect(page.getByTestId('sun-angular-diameter-input')).toHaveValue('0.8');

        await page.getByTestId('orientation-wall-reset').click();
        await expect(page.getByTestId('orientation-wall-yaw')).toHaveValue('0');
    });
});
