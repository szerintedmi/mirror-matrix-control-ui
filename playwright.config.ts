import { defineConfig, devices } from '@playwright/test';

const devHost = process.env.PLAYWRIGHT_DEV_HOST ?? '127.0.0.1';
const devPort = process.env.PLAYWRIGHT_DEV_PORT ?? '5173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${devHost}:${devPort}`;

export default defineConfig({
    timeout: 30_000, // per test

    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 2 : 2,
    reporter: process.env.CI
        ? [['github'], ['html', { open: 'never' }]]
        : [['list'], ['html', { open: 'never' }]],
    use: {
        actionTimeout: 4_000,
        navigationTimeout: 6_000,
        baseURL,
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: `yarn dev --host ${devHost} --port ${devPort}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
    ],
});
