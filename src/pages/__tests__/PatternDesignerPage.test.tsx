import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import PatternDesignerPage from '../PatternDesignerPage';

import type { Root } from 'react-dom/client';

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
