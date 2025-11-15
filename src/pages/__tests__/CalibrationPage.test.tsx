import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import CalibrationPage from '../CalibrationPage';

import type { MirrorConfig } from '../../types';

const mockCommandResult = {
    status: 'done',
    cmdId: 'mock-cmd',
    action: 'MOCK',
};

vi.mock('@/hooks/useMotorCommands', () => ({
    useMotorCommands: () => ({
        nudgeMotor: vi.fn(),
        homeMotor: vi.fn().mockResolvedValue({ mac: 'mock', completion: mockCommandResult }),
        homeAll: vi.fn().mockResolvedValue([{ mac: 'mock', completion: mockCommandResult }]),
        moveMotor: vi.fn().mockResolvedValue(mockCommandResult),
    }),
}));

vi.mock('@/context/StatusContext', () => ({
    useStatusStore: () => ({
        drivers: [],
        counts: {
            totalDrivers: 0,
            onlineDrivers: 0,
            offlineDrivers: 0,
            totalMotors: 0,
            movingMotors: 0,
            homedMotors: 0,
            unhomedMotors: 0,
            needsHomeWarningMotors: 0,
            needsHomeCriticalMotors: 0,
        },
        discoveryCount: 0,
        acknowledgeDriver: vi.fn(),
        acknowledgeAll: vi.fn(),
        schemaError: null,
        brokerConnected: true,
        connectionState: { status: 'connected' },
        latestActivityAt: null,
        staleThresholdMs: 2000,
    }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalNavigator = globalThis.navigator;
const originalPlay = HTMLMediaElement.prototype.play;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalMediaStream = (globalThis as { MediaStream?: unknown }).MediaStream;

class FakeMediaStream {
    getTracks() {
        return [];
    }
}

const createMockContext = () => {
    return {
        drawImage: vi.fn(),
        getImageData: vi.fn((_x?: number, _y?: number, w = 1, h = 1) => ({
            data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
        })),
        putImageData: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
};

const setupNavigatorMocks = () => {
    const enumerateDevices = vi
        .fn()
        .mockResolvedValue([{ deviceId: 'mock-device', kind: 'videoinput', label: 'Mock Cam' }]);
    const getUserMedia = vi.fn().mockResolvedValue(new FakeMediaStream());
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();

    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            ...originalNavigator,
            mediaDevices: {
                enumerateDevices,
                getUserMedia,
                addEventListener,
                removeEventListener,
            },
        },
    });
    Object.defineProperty(globalThis, 'MediaStream', {
        configurable: true,
        value: FakeMediaStream,
    });
};

const setupCanvasMocks = () => {
    HTMLCanvasElement.prototype.getContext = function () {
        return createMockContext();
    } as unknown as typeof HTMLCanvasElement.prototype.getContext;
};

const renderPage = async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const mirrorConfig: MirrorConfig = new Map();
    await act(async () => {
        root.render(
            <CalibrationPage gridSize={{ rows: 2, cols: 2 }} mirrorConfig={mirrorConfig} />,
        );
    });
    // flush pending microtasks/startStream
    await act(async () => {
        await Promise.resolve();
    });
    return { container, root };
};

beforeEach(() => {
    setupNavigatorMocks();
    setupCanvasMocks();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
    document.body.innerHTML = '';
    (HTMLMediaElement.prototype.play as unknown) = originalPlay;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
    });
    if (originalMediaStream) {
        Object.defineProperty(globalThis, 'MediaStream', {
            configurable: true,
            value: originalMediaStream,
        });
    }
    vi.restoreAllMocks();
});

const clickButtonByText = async (container: HTMLElement, text: string) => {
    const button = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.toLowerCase().includes(text.toLowerCase()),
    );
    if (!button) {
        throw new Error(`Button containing "${text}" not found`);
    }
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
    });
    return button as HTMLButtonElement;
};

describe('CalibrationPage interactions', () => {
    it('toggles ROI view highlighting', async () => {
        const { container, root } = await renderPage();

        const roiViewButton = await clickButtonByText(container, 'roi view');
        const initialState = roiViewButton.getAttribute('aria-pressed');

        await clickButtonByText(container, 'roi view');
        expect(roiViewButton.getAttribute('aria-pressed')).not.toBe(initialState);

        await act(() => {
            root.unmount();
        });
    });

    it('shows rotation grid overlay when rotation changes', async () => {
        const { container, root } = await renderPage();
        const slider = container.querySelector<HTMLInputElement>('#calibration-rotation');
        expect(slider).not.toBeNull();
        if (!slider) {
            return;
        }

        const pointerDown = new Event('pointerdown', { bubbles: true });
        Object.defineProperty(pointerDown, 'pointerId', { value: 1 });
        const pointerUp = new Event('pointerup', { bubbles: true });
        Object.defineProperty(pointerUp, 'pointerId', { value: 1 });

        await act(async () => {
            slider.dispatchEvent(pointerDown);
            await Promise.resolve();
        });

        const gridOverlay = container.querySelector('[data-testid="rotation-grid-overlay"]');
        expect(gridOverlay).not.toBeNull();

        await act(async () => {
            slider.dispatchEvent(pointerUp);
            await Promise.resolve();
        });

        const hiddenOverlay = container.querySelector('[data-testid="rotation-grid-overlay"]');
        expect(hiddenOverlay).toBeNull();

        await act(() => {
            root.unmount();
        });
    });
});
