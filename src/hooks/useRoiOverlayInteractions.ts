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
import { transformRoi } from '@/overlays';
import type { NormalizedRoi } from '@/types';
import { buildLetterboxTransform } from '@/utils/letterbox';

export type RoiEditingMode = 'idle' | 'drag' | 'resize' | 'draw';

/**
 * Map a pointer position (normalized 0-1 within a container) to content-space
 * coordinates, accounting for letterbox bars when the container's actual AR
 * differs from the content's AR.
 *
 * Exported for testing.
 */
export const mapPointerToContent = (
    /** Pointer position normalized to the container (0-1) */
    rawX: number,
    rawY: number,
    /** Aspect ratio of the content displayed inside the container */
    contentAspectRatio: number,
    /** Aspect ratio of the container element */
    containerAspectRatio: number,
): { x: number; y: number; inContent: boolean } => {
    const lb = buildLetterboxTransform(contentAspectRatio, containerAspectRatio);
    const contentX = (rawX - lb.offsetX) / lb.scaleX;
    const contentY = (rawY - lb.offsetY) / lb.scaleY;
    const inContent = contentX >= 0 && contentX <= 1 && contentY >= 0 && contentY <= 1;
    return { x: clamp01(contentX), y: clamp01(contentY), inContent };
};

export interface CameraPipelineOverlayHandlers {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export interface UseRoiOverlayInteractionsParams {
    roi: NormalizedRoi;
    setRoi: (next: NormalizedRoi | ((prev: NormalizedRoi) => NormalizedRoi)) => void;
    roiViewEnabled: boolean;
    setRoiViewEnabled: Dispatch<SetStateAction<boolean>>;
    roiRef: MutableRefObject<NormalizedRoi>;
    rotationDegrees: number;
    /** Aspect ratio of the content displayed inside the container (after rotation).
     *  Used to compute letterbox offsets when the container's actual AR differs. */
    contentAspectRatio: number;
}

export const useRoiOverlayInteractions = ({
    roi,
    setRoi,
    roiViewEnabled,
    setRoiViewEnabled,
    roiRef,
    rotationDegrees,
    contentAspectRatio,
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
        initialScreenRoi: NormalizedRoi;
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

    const mapPointerToScreen = useCallback(
        (
            event: ReactPointerEvent<HTMLDivElement>,
            container: HTMLDivElement,
        ): { x: number; y: number; inContent: boolean } => {
            const rect = container.getBoundingClientRect();
            const rawX = (event.clientX - rect.left) / rect.width;
            const rawY = (event.clientY - rect.top) / rect.height;
            const containerAR = rect.width / rect.height;
            return mapPointerToContent(rawX, rawY, contentAspectRatio, containerAR);
        },
        [contentAspectRatio],
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
            const mapped = mapPointerToScreen(event, container);
            if (!mapped.inContent) {
                return; // pointer is in the letterbox bar — ignore to avoid accidental edge snaps
            }
            const { x: screenX, y: screenY } = mapped;
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

            // Calculate initial Screen ROI
            const initialScreenRoi = transformRoi(roiRef.current, rotationDegrees, 'toScreen');

            pointerStateRef.current = {
                pointerId: event.pointerId,
                mode,
                origin: { x: screenX, y: screenY },
                initialScreenRoi,
                handle,
            };
            setRoiEditingMode(mode === 'draw' ? 'draw' : mode === 'move' ? 'drag' : 'resize');
            container.setPointerCapture(event.pointerId);
        },
        [mapPointerToScreen, roi.enabled, roiViewEnabled, roiRef, rotationDegrees],
    );

    const handleOverlayPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const state = pointerStateRef.current;
            const container = overlayRef.current;
            if (!state || !container || state.pointerId !== event.pointerId) {
                return;
            }
            // During an active drag/draw/resize, use clamped coords rather than
            // ignoring — the pointer may drift into the letterbox area and we
            // want the interaction to continue smoothly (clamped to content edge).
            const { x: screenX, y: screenY } = mapPointerToScreen(event, container);

            let newScreenRoi = { ...state.initialScreenRoi };

            if (state.mode === 'draw') {
                const startX = state.origin.x;
                const startY = state.origin.y;
                const x = Math.min(startX, screenX);
                const y = Math.min(startY, screenY);
                const width = Math.abs(screenX - startX);
                const height = Math.abs(screenY - startY);
                newScreenRoi = { ...newScreenRoi, x, y, width, height };
            } else if (state.mode === 'move') {
                const deltaX = screenX - state.origin.x;
                const deltaY = screenY - state.origin.y;
                newScreenRoi = {
                    ...state.initialScreenRoi,
                    x: state.initialScreenRoi.x + deltaX,
                    y: state.initialScreenRoi.y + deltaY,
                };
            } else if (state.mode === 'resize' && state.handle) {
                const { handle } = state;
                const initial = state.initialScreenRoi;

                if (handle.includes('n')) {
                    const bottom = initial.y + initial.height;
                    newScreenRoi.y = Math.min(screenY, bottom - 0.02);
                    newScreenRoi.height = bottom - newScreenRoi.y;
                }
                if (handle.includes('s')) {
                    const top = initial.y;
                    newScreenRoi.height = clamp01(screenY - top);
                }
                if (handle.includes('w')) {
                    const right = initial.x + initial.width;
                    newScreenRoi.x = Math.min(screenX, right - 0.02);
                    newScreenRoi.width = right - newScreenRoi.x;
                }
                if (handle.includes('e')) {
                    const left = initial.x;
                    newScreenRoi.width = clamp01(screenX - left);
                }
            }

            // Transform Screen ROI -> Source ROI
            const newSourceRoi = transformRoi(newScreenRoi, rotationDegrees, 'toSource');
            setRoi(newSourceRoi);
        },
        [mapPointerToScreen, setRoi, rotationDegrees],
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
