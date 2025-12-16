/**
 * Staging Calculations Module
 *
 * Pure functions for computing tile staging positions during calibration.
 * These determine where tiles move when staged "aside" vs "home".
 */

import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { ArrayRotation, StagingPosition } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/** Minimal tile info needed for staging calculations */
export interface TilePosition {
    row: number;
    col: number;
}

/** Grid dimensions */
export interface GridSize {
    rows: number;
    cols: number;
}

/** Configuration for staging calculations */
export interface StagingConfig {
    gridSize: GridSize;
    arrayRotation: ArrayRotation;
    stagingPosition: StagingPosition;
}

/** Motor position target for X and Y axes */
export interface AxisTargets {
    x: number;
    y: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Clamp a step value to valid motor range.
 */
export const clampSteps = (value: number): number =>
    Math.min(MOTOR_MAX_POSITION_STEPS, Math.max(MOTOR_MIN_POSITION_STEPS, value));

/**
 * Round a step value to an integer, handling non-finite values.
 */
export const roundSteps = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.round(value);
};

// =============================================================================
// STAGING CALCULATIONS
// =============================================================================

/**
 * Compute motor position targets for a tile based on desired pose.
 *
 * @param tile - Tile position (row, col)
 * @param pose - 'home' (0,0) or 'aside' (staged position)
 * @param config - Staging configuration
 * @returns Target positions for X and Y axes
 */
export function computePoseTargets(
    tile: TilePosition,
    pose: 'home' | 'aside',
    config: StagingConfig,
): AxisTargets {
    if (pose === 'home') {
        return { x: 0, y: 0 };
    }

    // Compute aside position accounting for array rotation.
    // Goal: move tiles to a consistent visual position from camera view.
    // Baseline: +X = LEFT, +Y = DOWN, so MAX = LEFT/DOWN.
    // At 0° and 90°: MAX moves left/down, at 180° and 270°: MIN moves left/down (inverted).
    const asideX =
        config.arrayRotation === 0 || config.arrayRotation === 90
            ? MOTOR_MAX_POSITION_STEPS
            : MOTOR_MIN_POSITION_STEPS;
    const asideY =
        config.arrayRotation === 0 || config.arrayRotation === 90
            ? MOTOR_MIN_POSITION_STEPS
            : MOTOR_MAX_POSITION_STEPS;

    switch (config.stagingPosition) {
        case 'nearest-corner':
            // Each tile moves to its nearest corner based on grid quadrant
            return computeNearestCornerTarget(tile, config.gridSize, config.arrayRotation);
        case 'corner':
            // All tiles to the same bottom-left corner position
            return { x: asideX, y: asideY };
        case 'bottom':
            // Y at bottom extreme, X distributed horizontally by column
            return { x: computeDistributedAxisTarget(tile.col, config.gridSize.cols), y: asideY };
        case 'left':
        default:
            // X at left extreme, Y distributed vertically by column
            return { x: asideX, y: computeDistributedAxisTarget(tile.col, config.gridSize.cols) };
    }
}

/**
 * Compute parking position for nearest-corner staging.
 * Divides grid into 4 quadrants and parks each tile to its closest corner.
 * Accounts for array rotation.
 *
 * @param tile - Tile position (row, col)
 * @param gridSize - Grid dimensions
 * @param arrayRotation - Physical array rotation
 * @returns Target positions for X and Y axes
 */
export function computeNearestCornerTarget(
    tile: TilePosition,
    gridSize: GridSize,
    arrayRotation: ArrayRotation,
): AxisTargets {
    const centerRow = (gridSize.rows - 1) / 2;
    const centerCol = (gridSize.cols - 1) / 2;

    // Determine which quadrant the tile is in
    const isTop = tile.row < centerRow;
    const isLeft = tile.col < centerCol;

    // Map quadrant to motor extremes accounting for rotation.
    // At 0°/90°: MAX = left, MIN = right; MIN = top, MAX = bottom (visually)
    // At 180°/270°: inverted
    const leftX =
        arrayRotation === 0 || arrayRotation === 90
            ? MOTOR_MAX_POSITION_STEPS
            : MOTOR_MIN_POSITION_STEPS;
    const rightX =
        arrayRotation === 0 || arrayRotation === 90
            ? MOTOR_MIN_POSITION_STEPS
            : MOTOR_MAX_POSITION_STEPS;
    const topY =
        arrayRotation === 0 || arrayRotation === 90
            ? MOTOR_MAX_POSITION_STEPS
            : MOTOR_MIN_POSITION_STEPS;
    const bottomY =
        arrayRotation === 0 || arrayRotation === 90
            ? MOTOR_MIN_POSITION_STEPS
            : MOTOR_MAX_POSITION_STEPS;

    return {
        x: isLeft ? leftX : rightX,
        y: isTop ? topY : bottomY,
    };
}

/**
 * Compute a distributed axis target based on column position.
 * Spreads tiles evenly across the motor range.
 *
 * @param column - Tile column index
 * @param totalCols - Total number of columns in grid
 * @returns Target step position
 */
export function computeDistributedAxisTarget(column: number, totalCols: number): number {
    const cols = Math.max(1, totalCols);
    if (cols === 1) {
        return clampSteps((MOTOR_MAX_POSITION_STEPS + MOTOR_MIN_POSITION_STEPS) / 2);
    }
    const normalizedColumn = column / (cols - 1);
    const span = MOTOR_MAX_POSITION_STEPS - MOTOR_MIN_POSITION_STEPS;
    const rawTarget = MOTOR_MIN_POSITION_STEPS + normalizedColumn * span;
    return clampSteps(rawTarget);
}
