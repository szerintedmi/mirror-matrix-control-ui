import type { TileRunState } from '@/services/calibration/types';

/** Display status includes 'calibrated' for tiles with loaded profile data */
export type TileDisplayStatus = TileRunState['status'] | 'calibrated';

/**
 * CSS class mappings for tile calibration status states.
 * Used across CalibrationRunnerPanel, TileDebugModal, and related components.
 */
export const TILE_STATUS_CLASSES: Record<TileDisplayStatus, string> = {
    completed: 'border-emerald-600/60 bg-emerald-500/10 text-emerald-200',
    calibrated: 'border-emerald-600/60 bg-emerald-500/10 text-emerald-200',
    partial: 'border-yellow-500/60 bg-yellow-500/10 text-yellow-100',
    measuring: 'border-sky-500/60 bg-sky-500/10 text-sky-100',
    failed: 'border-rose-600/60 bg-rose-500/10 text-rose-100',
    skipped: 'border-gray-800 bg-gray-900 text-gray-500',
    staged: 'border-amber-500/60 bg-amber-500/10 text-amber-100',
    pending: 'border-gray-700 bg-gray-900/60 text-gray-200',
};

/**
 * Get CSS classes for a tile calibration status.
 * Falls back to 'pending' styling for unknown statuses.
 */
export const getTileStatusClasses = (status: TileDisplayStatus): string => {
    return TILE_STATUS_CLASSES[status] ?? TILE_STATUS_CLASSES.pending;
};

/**
 * CSS classes for tile error text based on status.
 */
export const TILE_ERROR_TEXT_CLASSES: Record<string, string> = {
    failed: 'text-rose-200',
    skipped: 'text-gray-400',
    default: 'text-amber-200',
};

/**
 * Get CSS class for tile error text.
 */
export const getTileErrorTextClass = (status: TileRunState['status']): string => {
    return TILE_ERROR_TEXT_CLASSES[status] ?? TILE_ERROR_TEXT_CLASSES.default;
};

/**
 * CSS class for tile warning text (non-fatal issues like step test failures).
 */
export const TILE_WARNING_TEXT_CLASS = 'text-amber-300';

/**
 * Generic tone classes for status indicators (tags, badges, etc.)
 */
export const TONE_CLASSES = {
    success: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200',
    warning: 'border-amber-500/60 bg-amber-500/10 text-amber-200',
    error: 'border-rose-500/60 bg-rose-500/10 text-rose-200',
    info: 'border-sky-500/60 bg-sky-500/10 text-sky-200',
    muted: 'border-gray-700 bg-gray-900/60 text-gray-400',
} as const;

export type ToneType = keyof typeof TONE_CLASSES;
