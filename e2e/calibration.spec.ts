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
    test('connects with mock MQTT and shows calibration UI', async ({ page }) => {
        await setupMediaMocks(page);
        await page.goto('/');
        await page.getByRole('button', { name: 'Calibration' }).click();

        // Open connection settings by clicking the connection status button in the top bar
        const connectionButton = page.locator('button', { hasText: /mock|ws:|wss:/i });
        await connectionButton.click();

        // Select Mock Transport mode
        const mockTransportButton = page.getByRole('button', { name: 'Mock Transport' });
        await mockTransportButton.click();

        // Click Connect (exact match to avoid matching "Connection" or "Disconnect")
        await page.getByRole('button', { name: 'Connect', exact: true }).click();

        // Verify connection shows "Connected" status
        await expect(page.getByText('Connected')).toBeVisible({ timeout: 5000 });

        // Close the settings panel by clicking elsewhere
        await page.keyboard.press('Escape');

        // Verify calibration section is visible (exact match to avoid "Calibration Profiles")
        await expect(page.getByRole('heading', { name: 'Calibration', exact: true })).toBeVisible();

        // Verify progress indicator shows (starts at 0/0 or similar)
        await expect(page.getByText(/Progress/)).toBeVisible();

        // Verify mode toggle exists (Auto/Step)
        await expect(page.getByRole('button', { name: 'Auto', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Step', exact: true })).toBeVisible();

        // Verify Start button exists (will be disabled because detection isn't ready)
        const startButton = page.getByRole('button', { name: 'Start' });
        await expect(startButton).toBeVisible();
    });

    test('toggles ROI view and shows rotation grid', async ({ page }) => {
        await setupMediaMocks(page);
        await page.goto('/');
        await page.getByRole('button', { name: 'Calibration' }).click();

        await expect(page.getByLabel('Camera Device')).toBeVisible();

        const roiViewBtn = page.getByRole('button', { name: 'ROI View' });
        const initialPressed = await roiViewBtn.getAttribute('aria-pressed');
        await roiViewBtn.click();
        await expect(roiViewBtn).toHaveAttribute(
            'aria-pressed',
            initialPressed === 'true' ? 'false' : 'true',
        );

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
