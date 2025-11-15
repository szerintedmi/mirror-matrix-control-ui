import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import ArrayPersistenceControls from '../ArrayPersistenceControls';

import type { GridSnapshotMetadata } from '../../services/gridStorage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ArrayPersistenceControls', () => {
    const metadata: GridSnapshotMetadata[] = [
        { name: 'Alpha', savedAt: '2025-11-15T00:00:00.000Z' },
        { name: 'Beta', savedAt: '2025-11-15T01:00:00.000Z' },
    ];

    it('renders inline feedback and storage availability states', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <ArrayPersistenceControls
                    canUseStorage
                    hasUnsavedChanges
                    availableSnapshots={metadata}
                    activeSnapshotName="Alpha"
                    defaultSnapshotName="Alpha"
                    status={{
                        action: 'save',
                        tone: 'success',
                        message: 'Saved',
                        timestamp: Date.now(),
                    }}
                    storageUnavailableMessage={null}
                    onSave={() => {}}
                    onLoad={() => {}}
                />,
            );
        });

        expect(container.querySelector('[data-testid="array-unsaved-indicator"]')).not.toBeNull();
        expect(
            container.querySelector('[data-testid="array-persistence-status"]')?.textContent,
        ).toMatch(/Saved/i);

        act(() => {
            root.render(
                <ArrayPersistenceControls
                    canUseStorage={false}
                    hasUnsavedChanges={false}
                    availableSnapshots={[]}
                    activeSnapshotName={null}
                    defaultSnapshotName=""
                    status={null}
                    storageUnavailableMessage="Storage disabled"
                    onSave={() => {}}
                    onLoad={() => {}}
                />,
            );
        });

        const saveButton = container.querySelector(
            '[data-testid="array-save-config"]',
        ) as HTMLButtonElement;
        expect(saveButton.disabled).toBe(true);
        expect(
            container.querySelector('[data-testid="array-storage-message"]')?.textContent,
        ).toMatch(/Storage disabled/i);

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
