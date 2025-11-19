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

export type RoiEditingMode = 'idle' | 'drag' | 'resize' | 'draw';

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
}

// Helper to transform ROI between Source Space and Screen Space
const transformRoi = (
    inputRoi: NormalizedRoi,
    degrees: number,
    direction: 'toScreen' | 'toSource',
): NormalizedRoi => {
    const normDeg = ((degrees % 360) + 360) % 360;
    if (normDeg === 0) return { ...inputRoi };

    const rot = direction === 'toScreen' ? normDeg : (360 - normDeg) % 360;
    const rad = (rot * Math.PI) / 180;
    const c = Math.round(Math.cos(rad));
    const s = Math.round(Math.sin(rad));

    const cx = inputRoi.x + inputRoi.width / 2;
    const cy = inputRoi.y + inputRoi.height / 2;
    const tx = cx - 0.5;
    const ty = cy - 0.5;
    const rx = tx * c - ty * s;
    const ry = tx * s + ty * c;
    const newCx = rx + 0.5;
    const newCy = ry + 0.5;

    const swap = Math.abs(s) === 1;
    const newW = swap ? inputRoi.height : inputRoi.width;
    const newH = swap ? inputRoi.width : inputRoi.height;

    return {
        ...inputRoi,
        x: newCx - newW / 2,
        y: newCy - newH / 2,
        width: newW,
        height: newH,
    };
};

export const useRoiOverlayInteractions = ({
    roi,
    setRoi,
    roiViewEnabled,
    setRoiViewEnabled,
    roiRef,
    rotationDegrees,
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
        (event: ReactPointerEvent<HTMLDivElement>, container: HTMLDivElement) => {
            const rect = container.getBoundingClientRect();
            const relativeX = clamp01((event.clientX - rect.left) / rect.width);
            const relativeY = clamp01((event.clientY - rect.top) / rect.height);
            // We assume the container is perfectly aligned with the visual video (Screen Space)
            return { x: relativeX, y: relativeY };
        },
        [],
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
            const { x: screenX, y: screenY } = mapPointerToScreen(event, container);
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
