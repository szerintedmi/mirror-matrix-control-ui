import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type MutableRefObject,
    type PointerEvent as ReactPointerEvent,
    type SetStateAction,
} from 'react';

import { clamp01 } from '@/constants/calibration';
import type { NormalizedRoi } from '@/types';
import { buildLetterboxTransform, viewportToCamera } from '@/utils/letterbox';

export type RoiEditingMode = 'idle' | 'drag' | 'resize' | 'draw';

export interface CameraPipelineOverlayHandlers {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

interface UseRoiOverlayInteractionsParams {
    roi: NormalizedRoi;
    setRoi: (next: NormalizedRoi | ((prev: NormalizedRoi) => NormalizedRoi)) => void;
    roiViewEnabled: boolean;
    setRoiViewEnabled: Dispatch<SetStateAction<boolean>>;
    roiRef: MutableRefObject<NormalizedRoi>;
    cameraAspectRatio: number;
}

export const useRoiOverlayInteractions = ({
    roi,
    setRoi,
    roiViewEnabled,
    setRoiViewEnabled,
    roiRef,
    cameraAspectRatio,
}: UseRoiOverlayInteractionsParams): {
    roiEditingMode: RoiEditingMode;
    overlayHandlers: CameraPipelineOverlayHandlers;
    overlayRef: MutableRefObject<HTMLDivElement | null>;
} => {
    const [roiEditingMode, setRoiEditingMode] = useState<RoiEditingMode>('idle');
    const overlayRef = useRef<HTMLDivElement>(null);
    const pointerStateRef = useRef<{
        pointerId: number;
        mode: 'move' | 'resize' | 'draw';
        origin: { x: number; y: number };
        initialRoi: NormalizedRoi;
        handle?: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    } | null>(null);

    useEffect(() => {
        if (roi.enabled || !roiViewEnabled) {
            return;
        }
        let cancelled = false;
        const disable = () => {
            if (!cancelled) {
                setRoiViewEnabled(false);
            }
        };
        if (typeof queueMicrotask === 'function') {
            queueMicrotask(disable);
        } else {
            disable();
        }
        return () => {
            cancelled = true;
        };
    }, [roi.enabled, roiViewEnabled, setRoiViewEnabled]);

    const mapPointerToCamera = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>, container: HTMLDivElement) => {
            const rect = container.getBoundingClientRect();
            const relativeX = clamp01((event.clientX - rect.left) / rect.width);
            const relativeY = clamp01((event.clientY - rect.top) / rect.height);
            const viewportAspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1;
            const transform = buildLetterboxTransform(cameraAspectRatio || 1, viewportAspect || 1);
            return {
                x: viewportToCamera(relativeX, 'x', transform),
                y: viewportToCamera(relativeY, 'y', transform),
            };
        },
        [cameraAspectRatio],
    );

    const handleOverlayPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) {
                return;
            }
            if (roiViewEnabled && roi.enabled) {
                return;
            }
            const container = overlayRef.current;
            if (!container) {
                return;
            }
            const { x: cameraX, y: cameraY } = mapPointerToCamera(event, container);
            const target = event.target as HTMLElement;
            const handle = target.dataset.roiHandle as
                | 'n'
                | 's'
                | 'e'
                | 'w'
                | 'ne'
                | 'nw'
                | 'se'
                | 'sw'
                | undefined;
            let mode: 'move' | 'resize' | 'draw' = 'draw';
            if (target.dataset.roiHandle === 'move') {
                mode = 'move';
            } else if (handle) {
                mode = 'resize';
            }
            pointerStateRef.current = {
                pointerId: event.pointerId,
                mode,
                origin: { x: cameraX, y: cameraY },
                initialRoi: roiRef.current,
                handle,
            };
            setRoiEditingMode(mode === 'draw' ? 'draw' : mode === 'move' ? 'drag' : 'resize');
            container.setPointerCapture(event.pointerId);
        },
        [mapPointerToCamera, roi.enabled, roiViewEnabled, roiRef],
    );

    const handleOverlayPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const state = pointerStateRef.current;
            const container = overlayRef.current;
            if (!state || !container || state.pointerId !== event.pointerId) {
                return;
            }
            const { x: cameraX, y: cameraY } = mapPointerToCamera(event, container);
            if (state.mode === 'draw') {
                const startX = state.origin.x;
                const startY = state.origin.y;
                const x = Math.min(startX, cameraX);
                const y = Math.min(startY, cameraY);
                const width = Math.abs(cameraX - startX);
                const height = Math.abs(cameraY - startY);
                setRoi((prev) => ({ ...prev, x, y, width, height }));
                return;
            }
            if (state.mode === 'move') {
                const deltaX = cameraX - state.origin.x;
                const deltaY = cameraY - state.origin.y;
                const next = {
                    ...state.initialRoi,
                    x: state.initialRoi.x + deltaX,
                    y: state.initialRoi.y + deltaY,
                };
                setRoi(next);
                return;
            }
            if (state.mode === 'resize' && state.handle) {
                const { handle } = state;
                const initial = state.initialRoi;
                let next = { ...initial };
                if (handle.includes('n')) {
                    const bottom = initial.y + initial.height;
                    next.y = Math.min(cameraY, bottom - 0.02);
                    next.height = bottom - next.y;
                }
                if (handle.includes('s')) {
                    const top = initial.y;
                    next.height = clamp01(cameraY - top);
                }
                if (handle.includes('w')) {
                    const right = initial.x + initial.width;
                    next.x = Math.min(cameraX, right - 0.02);
                    next.width = right - next.x;
                }
                if (handle.includes('e')) {
                    const left = initial.x;
                    next.width = clamp01(cameraX - left);
                }
                setRoi(next);
            }
        },
        [mapPointerToCamera, setRoi],
    );

    const handleOverlayPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        const container = overlayRef.current;
        const state = pointerStateRef.current;
        if (state && container && state.pointerId === event.pointerId) {
            container.releasePointerCapture(event.pointerId);
        }
        pointerStateRef.current = null;
        setRoiEditingMode('idle');
    }, []);

    const handleOverlayPointerLeave = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (pointerStateRef.current && pointerStateRef.current.pointerId === event.pointerId) {
                handleOverlayPointerUp(event);
            }
        },
        [handleOverlayPointerUp],
    );

    return {
        roiEditingMode,
        overlayRef,
        overlayHandlers: {
            onPointerDown: handleOverlayPointerDown,
            onPointerMove: handleOverlayPointerMove,
            onPointerUp: handleOverlayPointerUp,
            onPointerLeave: handleOverlayPointerLeave,
        },
    };
};
