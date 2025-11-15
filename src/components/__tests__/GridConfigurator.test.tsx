import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import GridConfigurator from '../GridConfigurator';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('GridConfigurator', () => {
    it('displays grid metrics and inputs', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <GridConfigurator
                    rows={4}
                    cols={5}
                    onSizeChange={() => {}}
                    assignedAxes={6}
                    assignedTiles={3}
                    totalMotors={12}
                    unassignedAxes={2}
                    recommendedTileCapacity={30}
                />,
            );
        });

        expect(container.textContent).toContain('Grid tiles: 20');
        expect(container.textContent).toContain('Assigned tiles: 3');
        expect(container.textContent).toContain('Unassigned axes: 2');
        expect(container.textContent).toContain(
            'Recommended capacity: up to 30 tiles (12 motors discovered).',
        );

        const rowsInput = container.querySelector('#rows') as HTMLInputElement;
        const colsInput = container.querySelector('#cols') as HTMLInputElement;
        expect(rowsInput.value).toBe('4');
        expect(colsInput.value).toBe('5');

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
