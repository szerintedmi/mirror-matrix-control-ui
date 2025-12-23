import { useCallback, useEffect, useMemo, useState } from 'react';

import {
    areSettingsDefault,
    DEFAULT_CALIBRATION_UI_SETTINGS,
    loadCalibrationSettings,
    persistCalibrationSettings,
    type CalibrationUISettings,
} from '@/services/calibrationSettingsStorage';
import type { ArrayRotation, StagingPosition } from '@/types';

const getLocalStorage = (): Storage | undefined =>
    typeof window !== 'undefined' ? window.localStorage : undefined;

export interface CalibrationSettingsController {
    // Settings values
    arrayRotation: ArrayRotation;
    stagingPosition: StagingPosition;
    deltaSteps: number;
    gridGapNormalized: number;
    firstTileInterimStepDelta: number;
    firstTileTolerance: number;
    tileTolerance: number;

    // Setters
    setArrayRotation: (value: ArrayRotation) => void;
    setStagingPosition: (value: StagingPosition) => void;
    setDeltaSteps: (value: number) => void;
    setGridGapNormalized: (value: number) => void;
    setFirstTileInterimStepDelta: (value: number) => void;
    setFirstTileTolerance: (value: number) => void;
    setTileTolerance: (value: number) => void;

    // Aggregated settings object
    currentSettings: CalibrationUISettings;

    // Default state
    isDefaultSettings: boolean;
    resetToDefaults: () => void;
}

export const useCalibrationSettingsController = (): CalibrationSettingsController => {
    const storedSettings = useMemo(() => loadCalibrationSettings(getLocalStorage()), []);

    const [arrayRotation, setArrayRotation] = useState<ArrayRotation>(
        storedSettings?.arrayRotation ?? DEFAULT_CALIBRATION_UI_SETTINGS.arrayRotation,
    );
    const [stagingPosition, setStagingPosition] = useState<StagingPosition>(
        storedSettings?.stagingPosition ?? DEFAULT_CALIBRATION_UI_SETTINGS.stagingPosition,
    );
    const [deltaSteps, setDeltaSteps] = useState<number>(
        storedSettings?.deltaSteps ?? DEFAULT_CALIBRATION_UI_SETTINGS.deltaSteps,
    );
    const [gridGapNormalized, setGridGapNormalized] = useState<number>(
        storedSettings?.gridGapNormalized ?? DEFAULT_CALIBRATION_UI_SETTINGS.gridGapNormalized,
    );
    const [firstTileInterimStepDelta, setFirstTileInterimStepDelta] = useState<number>(
        storedSettings?.firstTileInterimStepDelta ??
            DEFAULT_CALIBRATION_UI_SETTINGS.firstTileInterimStepDelta,
    );
    const [firstTileTolerance, setFirstTileTolerance] = useState<number>(
        storedSettings?.firstTileTolerance ?? DEFAULT_CALIBRATION_UI_SETTINGS.firstTileTolerance,
    );
    const [tileTolerance, setTileTolerance] = useState<number>(
        storedSettings?.tileTolerance ?? DEFAULT_CALIBRATION_UI_SETTINGS.tileTolerance,
    );

    const currentSettings = useMemo<CalibrationUISettings>(
        () => ({
            arrayRotation,
            stagingPosition,
            deltaSteps,
            gridGapNormalized,
            firstTileInterimStepDelta,
            firstTileTolerance,
            tileTolerance,
        }),
        [
            arrayRotation,
            stagingPosition,
            deltaSteps,
            gridGapNormalized,
            firstTileInterimStepDelta,
            firstTileTolerance,
            tileTolerance,
        ],
    );

    const isDefaultSettings = useMemo(() => areSettingsDefault(currentSettings), [currentSettings]);

    // Auto-persist settings when they change
    useEffect(() => {
        persistCalibrationSettings(getLocalStorage(), currentSettings);
    }, [currentSettings]);

    const resetToDefaults = useCallback(() => {
        setArrayRotation(DEFAULT_CALIBRATION_UI_SETTINGS.arrayRotation);
        setStagingPosition(DEFAULT_CALIBRATION_UI_SETTINGS.stagingPosition);
        setDeltaSteps(DEFAULT_CALIBRATION_UI_SETTINGS.deltaSteps);
        setGridGapNormalized(DEFAULT_CALIBRATION_UI_SETTINGS.gridGapNormalized);
        setFirstTileInterimStepDelta(DEFAULT_CALIBRATION_UI_SETTINGS.firstTileInterimStepDelta);
        setFirstTileTolerance(DEFAULT_CALIBRATION_UI_SETTINGS.firstTileTolerance);
        setTileTolerance(DEFAULT_CALIBRATION_UI_SETTINGS.tileTolerance);
    }, []);

    return {
        arrayRotation,
        stagingPosition,
        deltaSteps,
        gridGapNormalized,
        firstTileInterimStepDelta,
        firstTileTolerance,
        tileTolerance,
        setArrayRotation,
        setStagingPosition,
        setDeltaSteps,
        setGridGapNormalized,
        setFirstTileInterimStepDelta,
        setFirstTileTolerance,
        setTileTolerance,
        currentSettings,
        isDefaultSettings,
        resetToDefaults,
    };
};
