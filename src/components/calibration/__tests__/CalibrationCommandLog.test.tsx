import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import type { CalibrationCommandLogEntry } from '@/services/calibration/types';

import CalibrationCommandLog from '../CalibrationCommandLog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tile = { row: 0, col: 0, key: '0-0' } as const;

const buildEntry = (
    id: string,
    hint: string,
    timestamp: number,
    sequence: number,
): CalibrationCommandLogEntry => ({
    id,
    hint,
    phase: 'measuring',
    tile,
    timestamp,
    sequence,
    group: 'measure-0-0',
});

describe('CalibrationCommandLog', () => {
    it('renders grouped commands with tile labels and respects sequence order', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        const entries: CalibrationCommandLogEntry[] = [
            buildEntry('e2', 'Second', 1_000, 2),
            buildEntry('e1', 'First', 1_000, 1),
        ];

        await act(async () => {
            root.render(<CalibrationCommandLog entries={entries} mode="auto" />);
        });

        // The component now uses CollapsibleSection which starts collapsed
        // The first button is the CollapsibleSection header toggle
        const sectionToggle = container.querySelector('button');
        expect(sectionToggle?.textContent).toContain('Command Log');

        // Expand the CollapsibleSection first
        await act(async () => {
            sectionToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        // Now the log groups should be visible
        const groupHeaderButton = container.querySelector(
            '[data-testid="command-log-group"] button',
        );
        expect(groupHeaderButton).toBeTruthy();

        await act(async () => {
            groupHeaderButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

        const entriesRendered = Array.from(
            container.querySelectorAll('[data-testid="command-log-entry"]'),
        );
        expect(entriesRendered.length).toBe(2);
        expect(entriesRendered[0].getAttribute('data-entry-id')).toBe('e1');
        expect(container.textContent).toContain('Measuring Tile R0C0');

        await act(async () => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
