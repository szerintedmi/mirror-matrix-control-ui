import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { loadGridState } from '@/services/gridStorage';
import { planProfilePlayback } from '@/services/profilePlaybackPlanner';

import PatternDesignerPage from '../PatternDesignerPage';

vi.mock('@/services/profilePlaybackPlanner', () => ({
    planProfilePlayback: vi.fn(),
}));

vi.mock('@/services/gridStorage', () => ({
    loadGridState: vi.fn(),
}));

const STORAGE_KEY = 'mirror:calibration-patterns';

interface StoredPattern {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    points: Array<{ id: string; x: number; y: number }>;
}

const setStoredPatterns = (patterns: StoredPattern[]): void => {
    window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            version: 2,
            patterns,
        }),
    );
};

const createStoredPattern = (overrides?: Partial<StoredPattern>): StoredPattern => {
    const now = new Date().toISOString();
    return {
        id: 'pattern-1',
        name: 'Pattern 1',
        createdAt: now,
        updatedAt: now,
        points: [],
        ...overrides,
    };
};

const mountedRoots: Root[] = [];

const renderPage = async (): Promise<void> => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
        root.render(<PatternDesignerPage />);
    });
    await act(async () => {
        await Promise.resolve();
    });
};

beforeEach(() => {
    window.localStorage.clear();
    setStoredPatterns([createStoredPattern()]);
});

afterEach(() => {
    mountedRoots.forEach((root) => {
        act(() => {
            root.unmount();
        });
    });
    mountedRoots.length = 0;
    document.body.innerHTML = '';
});

describe('PatternDesignerPage rename modal', () => {
    it('omits the header close button and closes via Cancel', async () => {
        await renderPage();

        const renameButton = document.querySelector(
            'button[aria-label="Rename pattern Pattern 1"]',
        ) as HTMLButtonElement | null;
        expect(renameButton).not.toBeNull();

        await act(async () => {
            renameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(document.getElementById('pattern-rename-input')).not.toBeNull();
        const closeButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent?.trim() === 'Close',
        );
        expect(closeButton).toBeUndefined();

        const cancelButton = Array.from(document.querySelectorAll('button')).find(
            (button) => button.textContent?.trim() === 'Cancel',
        ) as HTMLButtonElement | undefined;
        expect(cancelButton).toBeDefined();

        await act(async () => {
            cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(document.getElementById('pattern-rename-input')).toBeNull();
    });

    it('keeps the modal open when clicking the overlay', async () => {
        await renderPage();

        const renameButton = document.querySelector(
            'button[aria-label="Rename pattern Pattern 1"]',
        ) as HTMLButtonElement | null;
        await act(async () => {
            renameButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const overlay = document.querySelector('[data-testid="modal-overlay"]');
        expect(overlay).not.toBeNull();
        expect(overlay?.tagName).toBe('DIV');

        await act(async () => {
            overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        expect(document.getElementById('pattern-rename-input')).not.toBeNull();
    });
});

describe('PatternDesignerPage validation feedback', () => {
    it('renders invalid points in red', async () => {
        // Mock grid storage to return a valid grid state
        (loadGridState as Mock).mockReturnValue({
            gridSize: { rows: 1, cols: 1 },
            mirrorConfig: new Map([['0-0', { x: null, y: null }]]),
        });

        // Mock playback planner to return an error for a specific point
        const invalidPointId = 'point-invalid';
        (planProfilePlayback as Mock).mockReturnValue({
            success: false,
            plan: [],
            errors: [{ patternPointId: invalidPointId, code: 'error' }],
        });

        // Setup storage with a pattern containing the invalid point
        const pattern = createStoredPattern({
            points: [{ id: invalidPointId, x: 0, y: 0 }],
        });
        setStoredPatterns([pattern]);

        // We also need a calibration profile to trigger validation
        // Mocking localStorage for calibration profiles
        window.localStorage.setItem(
            'mirror:calibration:profiles',
            JSON.stringify({
                version: 2,
                entries: [
                    {
                        id: 'cal-1',
                        schemaVersion: 2,
                        name: 'Test Profile',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        gridSize: { rows: 1, cols: 1 },
                        stepTestSettings: { deltaSteps: 100 },
                        gridStateFingerprint: { hash: 'hash', snapshot: {} },
                        calibrationSpace: { blobStats: null, globalBounds: null },
                        tiles: {},
                        metrics: {
                            totalTiles: 1,
                            completedTiles: 1,
                            failedTiles: 0,
                            skippedTiles: 0,
                        },
                    },
                ],
            }),
        );
        window.localStorage.setItem('mirror:calibration:last-profile-id', 'cal-1');

        await renderPage();

        // Find the point element
        const pointElement = document.querySelector(`rect[data-point-id="${invalidPointId}"]`);
        expect(pointElement).not.toBeNull();

        // Check if it has the error color (#ef4444)
        expect(pointElement?.getAttribute('fill')).toBe('#ef4444');
    });
});
