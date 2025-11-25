import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import type { CalibrationCommandLogEntry } from '@/services/calibrationRunner';

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

        const toggleLog = container.querySelector('button');
        expect(toggleLog?.textContent).toContain('Expand');

        await act(async () => {
            toggleLog?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });

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
