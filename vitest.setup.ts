// Global React 18 act() configuration for Vitest.
// React DOM checks this flag to decide whether to enforce act() usage.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock ResizeObserver for tests that use components with ResizeObserver
class MockResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
    MockResizeObserver;
