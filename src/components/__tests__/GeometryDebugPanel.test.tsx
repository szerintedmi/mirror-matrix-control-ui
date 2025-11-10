import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import GeometryDebugPanel from '../GeometryDebugPanel';

import type { MirrorReflectionSolution } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const createMirror = (): MirrorReflectionSolution => ({
    mirrorId: 'mirror-0-0',
    row: 0,
    col: 0,
    center: { x: 0, y: 0, z: 0 },
    patternId: 'tile-1',
    yaw: 12.3456,
    pitch: -4.5678,
    normal: { x: 0, y: 0, z: 1 },
    wallHit: { x: 0.25, y: 0.5, z: 5 },
    ellipse: {
        majorDiameter: 0.42,
        minorDiameter: 0.18,
        majorAxis: { x: 1, y: 0, z: 0 },
        minorAxis: { x: 0, y: 1, z: 0 },
        incidenceCosine: 0.89,
    },
    errors: [],
});

describe('GeometryDebugPanel', () => {
    it('renders formatted metrics for the active mirror', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<GeometryDebugPanel mirror={createMirror()} isStale={false} />);
        });

        expect(container.textContent).toContain('Selected mirror');
        expect(container.textContent).toContain('Yaw');
        expect(container.textContent).toContain('12.35°');
        expect(container.textContent).toContain('Pitch');
        expect(container.textContent).toContain('-4.57°');
        expect(container.textContent).toContain('0.250');
        expect(container.textContent).toContain('0.180 m');
        expect(container.textContent).toContain('[0,0]');

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });

    it('shows placeholder copy when no mirror is selected', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<GeometryDebugPanel mirror={null} isStale />);
        });

        expect(container.textContent).toMatch(/select a mirror/i);
        expect(container.textContent).toMatch(/Preview paused/i);

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
