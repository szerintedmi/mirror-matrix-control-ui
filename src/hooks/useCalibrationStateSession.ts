import { useCallback, useEffect, useRef } from 'react';

import type {
    CalibrationRunSummary,
    CalibrationRunnerState,
    TileRunState,
} from '@/services/calibrationRunner';

const SESSION_KEY = 'mirror:calibration:session-state';

interface SessionCalibrationState {
    summary: CalibrationRunSummary;
    tiles: Record<string, TileRunState>;
    progress: {
        total: number;
        completed: number;
        failed: number;
        skipped: number;
    };
    timestamp: string;
}

interface StoredSessionData {
    fingerprint: string;
    data: SessionCalibrationState;
}

/**
 * Hook to persist calibration state to sessionStorage so it survives page navigation.
 * The state is tied to a grid fingerprint to avoid loading stale data after config changes.
 */
export const useCalibrationStateSession = (
    runnerState: CalibrationRunnerState,
    gridFingerprint: string,
) => {
    const lastSavedFingerprintRef = useRef<string | null>(null);

    // Persist state when it changes
    useEffect(() => {
        if (!runnerState.summary) {
            return;
        }

        try {
            const data: StoredSessionData = {
                fingerprint: gridFingerprint,
                data: {
                    summary: runnerState.summary,
                    tiles: runnerState.tiles,
                    progress: runnerState.progress,
                    timestamp: new Date().toISOString(),
                },
            };
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
            lastSavedFingerprintRef.current = gridFingerprint;
        } catch {
            // Ignore storage errors
        }
    }, [runnerState.summary, runnerState.tiles, runnerState.progress, gridFingerprint]);

    // Load session state
    const loadSessionState = useCallback((): SessionCalibrationState | null => {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw) as StoredSessionData;
            if (parsed.fingerprint !== gridFingerprint) {
                // Grid config changed, clear stale data
                sessionStorage.removeItem(SESSION_KEY);
                return null;
            }
            return parsed.data;
        } catch {
            return null;
        }
    }, [gridFingerprint]);

    // Clear session state
    const clearSessionState = useCallback(() => {
        try {
            sessionStorage.removeItem(SESSION_KEY);
            lastSavedFingerprintRef.current = null;
        } catch {
            // Ignore storage errors
        }
    }, []);

    return {
        loadSessionState,
        clearSessionState,
    };
};
