import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_BLOB_PARAMS } from '@/services/detectionSettingsStorage';
import type { DetectionSettingsProfile } from '@/services/detectionSettingsStorage';

import DetectionProfileManager from '../DetectionProfileManager';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profiles: DetectionSettingsProfile[] = [
    {
        id: 'profile-1',
        name: 'Lab baseline',
        createdAt: '2025-11-14T00:00:00.000Z',
        updatedAt: '2025-11-14T00:00:00.000Z',
        settings: {
            camera: { deviceId: 'default', resolutionId: 'auto' },
            roi: {
                enabled: true,
                x: 0.1,
                y: 0.1,
                width: 0.8,
                height: 0.8,
                lastCaptureWidth: 640,
                lastCaptureHeight: 480,
            },
            processing: {
                brightness: 0,
                contrast: 1,
                claheClipLimit: 2,
                claheTileGridSize: 8,
                rotationDegrees: 0,
            },
            blobParams: { ...DEFAULT_BLOB_PARAMS },
            useWasmDetector: false,
        },
    },
];

describe('DetectionProfileManager', () => {
    it('invokes callbacks and reflects selected profile state', () => {
        const onProfileNameChange = vi.fn();
        const onSelectProfile = vi.fn();
        const onSaveProfile = vi.fn();
        const onNewProfile = vi.fn();
        const onLoadProfile = vi.fn();
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        act(() => {
            root.render(
                <DetectionProfileManager
                    savedProfiles={profiles}
                    profileName=""
                    onProfileNameChange={onProfileNameChange}
                    selectedProfileId=""
                    onSelectProfile={onSelectProfile}
                    onSaveProfile={onSaveProfile}
                    onNewProfile={onNewProfile}
                    onLoadProfile={onLoadProfile}
                />,
            );
        });

        const [saveButton, newButton] = Array.from(container.querySelectorAll('button'));
        act(() => {
            saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onSaveProfile).toHaveBeenCalledTimes(1);

        act(() => {
            newButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onNewProfile).toHaveBeenCalledTimes(1);

        const select = container.querySelector('select');
        expect(select).not.toBeNull();
        act(() => {
            if (select) {
                select.value = profiles[0].id;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
        expect(onSelectProfile).toHaveBeenCalledWith(profiles[0].id);

        const initialLoadButton = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent?.trim() === 'Load',
        );
        expect(initialLoadButton?.hasAttribute('disabled')).toBe(true);

        act(() => {
            root.render(
                <DetectionProfileManager
                    savedProfiles={profiles}
                    profileName="Baseline"
                    onProfileNameChange={onProfileNameChange}
                    selectedProfileId={profiles[0].id}
                    onSelectProfile={onSelectProfile}
                    onSaveProfile={onSaveProfile}
                    onNewProfile={onNewProfile}
                    onLoadProfile={onLoadProfile}
                />,
            );
        });

        const loadButton = Array.from(container.querySelectorAll('button')).find(
            (button) => button.textContent?.trim() === 'Load',
        );
        expect(loadButton?.hasAttribute('disabled')).toBe(false);

        act(() => {
            loadButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onLoadProfile).toHaveBeenCalledWith(profiles[0].id);

        act(() => {
            root.unmount();
        });
        document.body.removeChild(container);
    });
});
