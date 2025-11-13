import { test, expect, type Page } from '@playwright/test';

const setupMediaMocks = async (page: Page) => {
    await page.addInitScript(() => {
        class FakeMediaStream {
            getTracks() {
                return [];
            }
        }

        Object.defineProperty(window, 'MediaStream', {
            configurable: true,
            value: FakeMediaStream,
        });

        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {
                enumerateDevices: async () => [
                    { deviceId: 'playwright-cam', kind: 'videoinput', label: 'Playwright Camera' },
                ],
                getUserMedia: async () => new FakeMediaStream(),
                addEventListener: () => {},
                removeEventListener: () => {},
            },
        });

        Object.defineProperty(HTMLMediaElement.prototype, 'play', {
            configurable: true,
            value: () => Promise.resolve(),
        });
    });
};

test.describe('Calibration page smoke checks', () => {
    test('toggles ROI view and shows rotation grid', async ({ page }) => {
        await setupMediaMocks(page);
        await page.goto('/');
        await page.getByRole('button', { name: 'Calibration' }).click();

        await expect(page.getByLabel('Camera Device')).toBeVisible();

        const roiViewBtn = page.getByRole('button', { name: /ROI view Off/i });
        await roiViewBtn.click();
        await expect(page.getByRole('button', { name: /ROI view On/i })).toBeVisible();

        const rotationSlider = page.locator('#calibration-rotation');
        await rotationSlider.evaluate((el) => {
            const slider = el as HTMLInputElement;
            const pointerDown = new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 });
            slider.dispatchEvent(pointerDown);
            slider.value = '6';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await expect(page.locator('[data-testid="rotation-grid-overlay"]')).toBeVisible();
    });
});
