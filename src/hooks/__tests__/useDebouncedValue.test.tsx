import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from '../useDebouncedValue';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TestHarness: React.FC<{ value: number; onUpdate: (value: number) => void }> = ({
    value,
    onUpdate,
}) => {
    const debounced = useDebouncedValue(value, 150);
    useEffect(() => {
        onUpdate(debounced);
    }, [debounced, onUpdate]);
    return null;
};

describe('useDebouncedValue', () => {
    it('emits updates after the specified delay', () => {
        vi.useFakeTimers();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        const handler = vi.fn<(value: number) => void>();

        act(() => {
            root.render(<TestHarness value={1} onUpdate={handler} />);
        });
        expect(handler).toHaveBeenCalled();
        handler.mockClear();

        act(() => {
            root.render(<TestHarness value={2} onUpdate={handler} />);
        });
        expect(handler).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(140);
        });
        expect(handler).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(20);
        });
        expect(handler).toHaveBeenCalledWith(2);

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
        vi.useRealTimers();
    });
});
