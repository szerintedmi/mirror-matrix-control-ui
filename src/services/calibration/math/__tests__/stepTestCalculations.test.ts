// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { MOTOR_MAX_POSITION_STEPS, MOTOR_MIN_POSITION_STEPS } from '@/constants/control';
import type { BlobMeasurement } from '@/types';

import {
    getAxisStepDelta,
    getAdaptiveStepDelta,
    computeAxisStepTestResult,
    computeAverageSizeDelta,
    computeAlignmentTargetSteps,
    combineStepTestResults,
    type AxisStepTestResult,
} from '../stepTestCalculations';

describe('stepTestCalculations', () => {
    const createMeasurement = (x: number, y: number, size: number): BlobMeasurement => ({
        x,
        y,
        size,
        response: 100,
        capturedAt: Date.now(),
    });

    describe('getAxisStepDelta', () => {
        it('should return null for zero or negative delta steps', () => {
            expect(getAxisStepDelta('x', 0, 0)).toBeNull();
            expect(getAxisStepDelta('x', -100, 0)).toBeNull();
            expect(getAxisStepDelta('y', 0, 180)).toBeNull();
        });

        it('should return negative delta for X axis at 0° rotation (flipX=true)', () => {
            // At 0°, X axis has flipX=true, so jog direction is -1
            const result = getAxisStepDelta('x', 100, 0);
            expect(result).toBe(-100);
        });

        it('should return positive delta for X axis at 180° rotation (flipX=false)', () => {
            // At 180°, X axis has flipX=false, so jog direction is +1
            const result = getAxisStepDelta('x', 100, 180);
            expect(result).toBe(100);
        });

        it('should return positive delta for Y axis at 0° rotation (flipY=false)', () => {
            // At 0°, Y axis has flipY=false, so jog direction is +1
            const result = getAxisStepDelta('y', 100, 0);
            expect(result).toBe(100);
        });

        it('should return negative delta for Y axis at 180° rotation (flipY=true)', () => {
            // At 180°, Y axis has flipY=true, so jog direction is -1
            const result = getAxisStepDelta('y', 100, 180);
            expect(result).toBe(-100);
        });

        it('should clamp large values to motor limits', () => {
            // At 0° X is negative, so large positive input becomes negative clamped value
            const result = getAxisStepDelta('x', MOTOR_MAX_POSITION_STEPS + 1000, 0);
            expect(result).toBe(MOTOR_MIN_POSITION_STEPS);
        });
    });

    describe('getAdaptiveStepDelta', () => {
        const grid4x4 = { rows: 4, cols: 4 };

        it('should flip X for bottom-right tile at 0° (jog goes towards staging corner)', () => {
            // At 0°, X jogs to -1200 (rightward). Bottom-right tile parks at x=-1200.
            // Should flip to +1200 (leftward) to avoid overlap.
            const result = getAdaptiveStepDelta(
                'x',
                1200,
                0,
                { row: 3, col: 3 },
                grid4x4,
                'nearest-corner',
            );
            expect(result).toBe(1200); // flipped from default -1200
        });

        it('should not flip X for top-left tile at 0° (jog goes away from staging corner)', () => {
            // At 0°, X jogs to -1200 (rightward). Top-left tile parks at x=+1200 (leftward).
            // Default direction already goes away from the staging corner.
            const result = getAdaptiveStepDelta(
                'x',
                1200,
                0,
                { row: 0, col: 0 },
                grid4x4,
                'nearest-corner',
            );
            expect(result).toBe(-1200); // unchanged
        });

        it('should flip Y for top-left tile at 0° (jog goes towards staging corner)', () => {
            // At 0°, Y jogs to +1200 (topY=+1200 is where top-left parks on Y).
            // Should flip to -1200 (downward).
            const result = getAdaptiveStepDelta(
                'y',
                1200,
                0,
                { row: 0, col: 0 },
                grid4x4,
                'nearest-corner',
            );
            expect(result).toBe(-1200); // flipped from default +1200
        });

        it('should not flip Y for bottom-right tile at 0° (jog goes away from staging corner)', () => {
            // At 0°, Y jogs to +1200 (upward). Bottom-right parks at y=-1200 (downward).
            // Default direction already goes away.
            const result = getAdaptiveStepDelta(
                'y',
                1200,
                0,
                { row: 3, col: 3 },
                grid4x4,
                'nearest-corner',
            );
            expect(result).toBe(1200); // unchanged
        });

        it('should return base delta unchanged for non-nearest-corner staging', () => {
            const result = getAdaptiveStepDelta(
                'x',
                1200,
                0,
                { row: 3, col: 3 },
                grid4x4,
                'corner',
            );
            expect(result).toBe(-1200); // same as getAxisStepDelta
        });

        it('should return null for zero delta steps', () => {
            const result = getAdaptiveStepDelta(
                'x',
                0,
                0,
                { row: 0, col: 0 },
                grid4x4,
                'nearest-corner',
            );
            expect(result).toBeNull();
        });

        it('should handle 180° rotation correctly', () => {
            // At 180°, X jogs to +1200 (flipX=false → direction=+1).
            // Bottom-right tile at 180°: rightX = MOTOR_MAX (+1200). Same sign → flip.
            const result = getAdaptiveStepDelta(
                'x',
                1200,
                180,
                { row: 3, col: 3 },
                grid4x4,
                'nearest-corner',
            );
            expect(result).toBe(-1200); // flipped
        });
    });

    describe('computeAxisStepTestResult', () => {
        it('should compute X axis displacement', () => {
            const home = createMeasurement(0, 0, 0.2);
            const step = createMeasurement(0.1, 0, 0.2);

            const result = computeAxisStepTestResult(home, step, 'x', 100);

            expect(result.displacement).toBe(0.1);
            expect(result.perStep).toBeCloseTo(0.001);
            expect(result.sizeDelta).toBe(0);
        });

        it('should compute Y axis displacement', () => {
            const home = createMeasurement(0, 0, 0.2);
            const step = createMeasurement(0, 0.2, 0.2);

            const result = computeAxisStepTestResult(home, step, 'y', 200);

            expect(result.displacement).toBe(0.2);
            expect(result.perStep).toBeCloseTo(0.001);
        });

        it('should compute size delta', () => {
            const home = createMeasurement(0, 0, 0.2);
            const step = createMeasurement(0.1, 0, 0.25);

            const result = computeAxisStepTestResult(home, step, 'x', 100);

            expect(result.sizeDelta).toBeCloseTo(0.05);
        });

        it('should handle zero delta steps', () => {
            const home = createMeasurement(0, 0, 0.2);
            const step = createMeasurement(0.1, 0, 0.2);

            const result = computeAxisStepTestResult(home, step, 'x', 0);

            expect(result.displacement).toBe(0.1);
            expect(result.perStep).toBeNull();
        });

        it('should handle negative displacement', () => {
            const home = createMeasurement(0.5, 0, 0.2);
            const step = createMeasurement(0.3, 0, 0.2);

            const result = computeAxisStepTestResult(home, step, 'x', 100);

            expect(result.displacement).toBe(-0.2);
            expect(result.perStep).toBeCloseTo(-0.002);
        });
    });

    describe('computeAverageSizeDelta', () => {
        it('should return null for empty array', () => {
            expect(computeAverageSizeDelta([])).toBeNull();
        });

        it('should return single value for single element', () => {
            expect(computeAverageSizeDelta([0.05])).toBe(0.05);
        });

        it('should compute average of multiple values', () => {
            expect(computeAverageSizeDelta([0.02, 0.04, 0.06])).toBeCloseTo(0.04);
        });

        it('should handle negative values', () => {
            expect(computeAverageSizeDelta([-0.02, 0.02])).toBe(0);
        });
    });

    describe('computeAlignmentTargetSteps', () => {
        it('should return null for null perStep', () => {
            expect(computeAlignmentTargetSteps(0.1, null)).toBeNull();
        });

        it('should return null for zero perStep', () => {
            expect(computeAlignmentTargetSteps(0.1, 0)).toBeNull();
        });

        it('should return null for very small perStep', () => {
            expect(computeAlignmentTargetSteps(0.1, 1e-7)).toBeNull();
        });

        it('should compute positive steps', () => {
            const result = computeAlignmentTargetSteps(0.1, 0.001);
            expect(result).toBe(100);
        });

        it('should compute negative steps', () => {
            const result = computeAlignmentTargetSteps(-0.1, 0.001);
            expect(result).toBe(-100);
        });

        it('should round to nearest step', () => {
            const result = computeAlignmentTargetSteps(0.105, 0.001);
            expect(result).toBe(105);
        });

        it('should return null when raw steps exceed motor max', () => {
            // 1.0 / 0.00001 = 100000, which exceeds MOTOR_MAX (1200)
            const result = computeAlignmentTargetSteps(1.0, 0.00001);
            expect(result).toBeNull();
        });

        it('should return null when raw steps exceed motor min (negative)', () => {
            // -1.0 / 0.00001 = -100000, which exceeds MOTOR_MAX in absolute value
            const result = computeAlignmentTargetSteps(-1.0, 0.00001);
            expect(result).toBeNull();
        });

        it('should clamp values within valid range', () => {
            // Test that valid large values get clamped properly
            // 0.001 / 0.001 = 1000, within range, should work
            const result = computeAlignmentTargetSteps(1.0, 0.001);
            expect(result).toBe(1000);
        });

        it('should return null for unreasonably large steps', () => {
            const result = computeAlignmentTargetSteps(1e10, 0.001);
            expect(result).toBeNull();
        });

        it('should handle negative perStep', () => {
            const result = computeAlignmentTargetSteps(0.1, -0.001);
            expect(result).toBe(-100);
        });
    });

    describe('combineStepTestResults', () => {
        it('should handle null results', () => {
            const result = combineStepTestResults(null, null);

            expect(result.stepToDisplacement.x).toBeNull();
            expect(result.stepToDisplacement.y).toBeNull();
            expect(result.sizeDeltaAtStepTest).toBeNull();
        });

        it('should combine X-only result', () => {
            const xResult: AxisStepTestResult = {
                displacement: 0.1,
                perStep: 0.001,
                sizeDelta: 0.02,
            };

            const result = combineStepTestResults(xResult, null);

            expect(result.stepToDisplacement.x).toBe(0.001);
            expect(result.stepToDisplacement.y).toBeNull();
            expect(result.sizeDeltaAtStepTest).toBe(0.02);
        });

        it('should combine Y-only result', () => {
            const yResult: AxisStepTestResult = {
                displacement: 0.2,
                perStep: 0.002,
                sizeDelta: 0.03,
            };

            const result = combineStepTestResults(null, yResult);

            expect(result.stepToDisplacement.x).toBeNull();
            expect(result.stepToDisplacement.y).toBe(0.002);
            expect(result.sizeDeltaAtStepTest).toBe(0.03);
        });

        it('should combine both results and average size deltas', () => {
            const xResult: AxisStepTestResult = {
                displacement: 0.1,
                perStep: 0.001,
                sizeDelta: 0.02,
            };
            const yResult: AxisStepTestResult = {
                displacement: 0.2,
                perStep: 0.002,
                sizeDelta: 0.04,
            };

            const result = combineStepTestResults(xResult, yResult);

            expect(result.stepToDisplacement.x).toBe(0.001);
            expect(result.stepToDisplacement.y).toBe(0.002);
            expect(result.sizeDeltaAtStepTest).toBe(0.03); // average of 0.02 and 0.04
        });

        it('should handle null size deltas', () => {
            const xResult: AxisStepTestResult = {
                displacement: 0.1,
                perStep: 0.001,
                sizeDelta: null,
            };
            const yResult: AxisStepTestResult = {
                displacement: 0.2,
                perStep: 0.002,
                sizeDelta: 0.04,
            };

            const result = combineStepTestResults(xResult, yResult);

            expect(result.sizeDeltaAtStepTest).toBe(0.04); // only Y's delta
        });
    });
});
