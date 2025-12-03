// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';

import {
    clampSteps,
    roundSteps,
    computePoseTargets,
    computeNearestCornerTarget,
    computeDistributedAxisTarget,
    type StagingConfig,
} from '../stagingCalculations';

describe('stagingCalculations', () => {
    describe('clampSteps', () => {
        it('should return value within range unchanged', () => {
            const midpoint = (MOTOR_MAX_POSITION_STEPS + MOTOR_MIN_POSITION_STEPS) / 2;
            expect(clampSteps(midpoint)).toBe(midpoint);
            expect(clampSteps(0)).toBe(0);
        });

        it('should clamp values above max', () => {
            expect(clampSteps(MOTOR_MAX_POSITION_STEPS + 1000)).toBe(MOTOR_MAX_POSITION_STEPS);
            expect(clampSteps(999999)).toBe(MOTOR_MAX_POSITION_STEPS);
        });

        it('should clamp values below min', () => {
            expect(clampSteps(MOTOR_MIN_POSITION_STEPS - 1000)).toBe(MOTOR_MIN_POSITION_STEPS);
            expect(clampSteps(-999999)).toBe(MOTOR_MIN_POSITION_STEPS);
        });
    });

    describe('roundSteps', () => {
        it('should round to nearest integer', () => {
            expect(roundSteps(1.4)).toBe(1);
            expect(roundSteps(1.5)).toBe(2);
            expect(roundSteps(1.6)).toBe(2);
            expect(roundSteps(-1.4)).toBe(-1);
        });

        it('should return 0 for non-finite values', () => {
            expect(roundSteps(NaN)).toBe(0);
            expect(roundSteps(Infinity)).toBe(0);
            expect(roundSteps(-Infinity)).toBe(0);
        });
    });

    describe('computePoseTargets', () => {
        const baseConfig: StagingConfig = {
            gridSize: { rows: 3, cols: 3 },
            arrayRotation: 0,
            stagingPosition: 'left',
        };

        it('should return (0, 0) for home pose', () => {
            const result = computePoseTargets({ row: 1, col: 1 }, 'home', baseConfig);
            expect(result).toEqual({ x: 0, y: 0 });
        });

        it('should return corner position for aside with corner staging', () => {
            const config: StagingConfig = { ...baseConfig, stagingPosition: 'corner' };
            const result = computePoseTargets({ row: 0, col: 0 }, 'aside', config);
            // At 0° rotation: asideX = MAX, asideY = MIN
            expect(result.x).toBe(MOTOR_MAX_POSITION_STEPS);
            expect(result.y).toBe(MOTOR_MIN_POSITION_STEPS);
        });

        it('should return left staging for default', () => {
            const result = computePoseTargets({ row: 1, col: 1 }, 'aside', baseConfig);
            // X at left extreme (MAX at 0°), Y distributed
            expect(result.x).toBe(MOTOR_MAX_POSITION_STEPS);
        });

        it('should return bottom staging when configured', () => {
            const config: StagingConfig = { ...baseConfig, stagingPosition: 'bottom' };
            const result = computePoseTargets({ row: 1, col: 1 }, 'aside', config);
            // Y at bottom extreme (MIN at 0°), X distributed
            expect(result.y).toBe(MOTOR_MIN_POSITION_STEPS);
        });

        it('should use nearest-corner when configured', () => {
            const config: StagingConfig = { ...baseConfig, stagingPosition: 'nearest-corner' };
            // Top-left tile should go to top-left corner
            const topLeft = computePoseTargets({ row: 0, col: 0 }, 'aside', config);
            expect(topLeft.x).toBe(MOTOR_MAX_POSITION_STEPS); // left
            expect(topLeft.y).toBe(MOTOR_MAX_POSITION_STEPS); // top

            // Bottom-right tile should go to bottom-right corner
            const bottomRight = computePoseTargets({ row: 2, col: 2 }, 'aside', config);
            expect(bottomRight.x).toBe(MOTOR_MIN_POSITION_STEPS); // right
            expect(bottomRight.y).toBe(MOTOR_MIN_POSITION_STEPS); // bottom
        });

        it('should invert directions for 180° rotation', () => {
            const config: StagingConfig = { ...baseConfig, arrayRotation: 180 };
            const result = computePoseTargets({ row: 0, col: 0 }, 'aside', config);
            // At 180° rotation: asideX = MIN, asideY = MAX (inverted)
            expect(result.x).toBe(MOTOR_MIN_POSITION_STEPS);
        });
    });

    describe('computeNearestCornerTarget', () => {
        const gridSize = { rows: 3, cols: 3 };

        it('should send top-left tile to top-left corner at 0° rotation', () => {
            const result = computeNearestCornerTarget({ row: 0, col: 0 }, gridSize, 0);
            expect(result.x).toBe(MOTOR_MAX_POSITION_STEPS); // left
            expect(result.y).toBe(MOTOR_MAX_POSITION_STEPS); // top
        });

        it('should send bottom-right tile to bottom-right corner at 0° rotation', () => {
            const result = computeNearestCornerTarget({ row: 2, col: 2 }, gridSize, 0);
            expect(result.x).toBe(MOTOR_MIN_POSITION_STEPS); // right
            expect(result.y).toBe(MOTOR_MIN_POSITION_STEPS); // bottom
        });

        it('should send top-right tile to top-right corner at 0° rotation', () => {
            const result = computeNearestCornerTarget({ row: 0, col: 2 }, gridSize, 0);
            expect(result.x).toBe(MOTOR_MIN_POSITION_STEPS); // right
            expect(result.y).toBe(MOTOR_MAX_POSITION_STEPS); // top
        });

        it('should invert for 180° rotation', () => {
            const result = computeNearestCornerTarget({ row: 0, col: 0 }, gridSize, 180);
            // At 180°: left = MIN, top = MIN
            expect(result.x).toBe(MOTOR_MIN_POSITION_STEPS);
            expect(result.y).toBe(MOTOR_MIN_POSITION_STEPS);
        });

        it('should handle center tile consistently', () => {
            // Center tile (1,1) is exactly at center, should go to one quadrant
            const result = computeNearestCornerTarget({ row: 1, col: 1 }, gridSize, 0);
            // row 1 < 1 is false, col 1 < 1 is false, so bottom-right
            expect(result.x).toBe(MOTOR_MIN_POSITION_STEPS);
            expect(result.y).toBe(MOTOR_MIN_POSITION_STEPS);
        });
    });

    describe('computeDistributedAxisTarget', () => {
        it('should return center for single column grid', () => {
            const result = computeDistributedAxisTarget(0, 1);
            const expectedCenter = (MOTOR_MAX_POSITION_STEPS + MOTOR_MIN_POSITION_STEPS) / 2;
            expect(result).toBe(clampSteps(expectedCenter));
        });

        it('should return MIN for first column', () => {
            const result = computeDistributedAxisTarget(0, 3);
            expect(result).toBe(MOTOR_MIN_POSITION_STEPS);
        });

        it('should return MAX for last column', () => {
            const result = computeDistributedAxisTarget(2, 3);
            expect(result).toBe(MOTOR_MAX_POSITION_STEPS);
        });

        it('should return midpoint for middle column', () => {
            const result = computeDistributedAxisTarget(1, 3);
            const expectedMid = (MOTOR_MAX_POSITION_STEPS + MOTOR_MIN_POSITION_STEPS) / 2;
            expect(result).toBe(clampSteps(expectedMid));
        });

        it('should distribute evenly across 5 columns', () => {
            const results = [0, 1, 2, 3, 4].map((col) => computeDistributedAxisTarget(col, 5));
            // Should be monotonically increasing
            for (let i = 1; i < results.length; i++) {
                expect(results[i]).toBeGreaterThan(results[i - 1]);
            }
            expect(results[0]).toBe(MOTOR_MIN_POSITION_STEPS);
            expect(results[4]).toBe(MOTOR_MAX_POSITION_STEPS);
        });
    });
});
