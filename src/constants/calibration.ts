import type { NormalizedRoi, StagingPosition } from '@/types';

export interface ResolutionOption {
    id: string;
    label: string;
    width?: number;
    height?: number;
}

export const RESOLUTION_OPTIONS: ResolutionOption[] = [
    { id: 'auto', label: 'Auto' },
    { id: 'vga', label: '640 x 480', width: 640, height: 480 },
    { id: '720p', label: '1280 x 720', width: 1280, height: 720 },
    { id: '1080p', label: '1920 x 1080', width: 1920, height: 1080 },
    { id: '4k', label: '3840 x 2160', width: 3840, height: 2160 },
];

export const DEFAULT_ROI: NormalizedRoi = {
    enabled: true,
    x: 0.15,
    y: 0.15,
    width: 0.7,
    height: 0.7,
};

export const DEFAULT_CLAHE_CLIP_LIMIT = 2;
export const DEFAULT_CLAHE_TILE_GRID_SIZE = 8;

// drop raw samples outside this window (likely measured blob wasn't detected at the frame and a blob aside was picked up):
export const DETECTION_BLOB_IGNORE_SAMPLE_ABOVE_DEVIATION_PT = 0.1;
export const DETECTION_BLOB_MIN_SAMPLES = 5; // samples within range required
// allowed normalized jitter of considered samples (normalized deviation)
export const DETECTION_BLOB_MAX_MEDIAN_DEVIATION_PT = 0.005;
export const DETECTION_BLOB_CAPTURE_DELAY_MS = 100; // temporary settle delay before sampling (frame capture pipeline might be behind)

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const clampRoi = (roi: NormalizedRoi): NormalizedRoi => {
    const width = Math.min(1, Math.max(0.01, roi.width));
    const height = Math.min(1, Math.max(0.01, roi.height));
    const x = clamp01(Math.min(roi.x, 1 - width));
    const y = clamp01(Math.min(roi.y, 1 - height));
    return {
        enabled: roi.enabled,
        x,
        y,
        width,
        height,
    };
};

export const STAGING_POSITIONS: StagingPosition[] = ['nearest-corner', 'corner', 'bottom', 'left'];
export const DEFAULT_STAGING_POSITION: StagingPosition = 'nearest-corner';

export const STAGING_POSITION_LABELS: Record<StagingPosition, string> = {
    'nearest-corner': 'Nearest Corner',
    corner: 'Corner (all same)',
    bottom: 'Bottom',
    left: 'Left',
};

export interface CalibrationRunnerSettings {
    deltaSteps: number;
    gridGapNormalized: number;
    sampleTimeoutMs: number;
    maxDetectionRetries: number;
    retryDelayMs: number;
    /** Maximum distance (normalized 0-1) from expected position to accept a blob. */
    maxBlobDistanceThreshold: number;
    /** Tolerance radius (normalized 0-1) for first tile detection when no prior measurements exist. */
    firstTileTolerance: number;
}

/** Default max blob distance threshold (15% of frame dimension). */
export const DEFAULT_MAX_BLOB_DISTANCE_THRESHOLD = 0.15;

/** Default first tile tolerance - larger radius for initial detection (25% of frame dimension). */
export const DEFAULT_FIRST_TILE_TOLERANCE = 0.25;

export const DEFAULT_CALIBRATION_RUNNER_SETTINGS: CalibrationRunnerSettings = {
    deltaSteps: 1200,
    gridGapNormalized: 0.0,
    sampleTimeoutMs: 1_500,
    maxDetectionRetries: 5,
    retryDelayMs: 150,
    maxBlobDistanceThreshold: DEFAULT_MAX_BLOB_DISTANCE_THRESHOLD,
    firstTileTolerance: DEFAULT_FIRST_TILE_TOLERANCE,
};
