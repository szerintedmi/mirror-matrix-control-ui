import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import GeometryStatusPanel from '../GeometryStatusPanel';

import type { ReflectionSolverError } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const errors: ReflectionSolverError[] = [
    {
        code: 'invalid_wall_basis',
        message: 'Wall normal and world up are parallel.',
    },
    {
        code: 'wall_behind_mirror',
        message: 'Wall intersection lies behind the mirror.',
        mirrorId: 'mirror-0-1',
    },
];

describe('GeometryStatusPanel', () => {
    it('lists global and per-mirror errors', () => {
        const handler = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(<GeometryStatusPanel errors={errors} onFocusMirror={handler} />);
        });

        expect(container.textContent).toContain('Solver errors detected');
        expect(container.textContent).toContain('Wall normal and world up are parallel');
        expect(container.textContent).toContain('mirror-0-1'.replace('mirror-', ''));

        const focusButton = container.querySelector('button');
        expect(focusButton).not.toBeNull();

        act(() => {
            focusButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(handler).toHaveBeenCalledWith('mirror-0-1');

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
